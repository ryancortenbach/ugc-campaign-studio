import {createHmac, timingSafeEqual} from 'node:crypto';

// The two UGC plans on the Mint Labs Whop store (docs/WHOP-UGC-OFFERS-v1.md). Budgets cap what one order may spend on renders and models.
export const PACKAGES = {
  starter: {label: 'Starter', videos: 5, planId: 'plan_lW3DqSYybecYj', priceUsd: 500},
  campaign: {label: 'Campaign', videos: 12, planId: 'plan_GohcF3fkgSBnb', priceUsd: 1000},
};
export const packageForPlan = planId => Object.entries(PACKAGES).find(([, p]) => p.planId === planId)?.[0] || null;

// Standard Webhooks, as Whop documents it: HMAC-SHA256 over "id.timestamp.body", keyed with the ws_ secret exactly as Whop shows it.
// A whsec_ secret (the generic Standard Webhooks form) is base64 after the prefix. Rejects timestamps more than 5 minutes off.
export function verifyWhop(rawBody, headers, secret, now = Date.now()) {
  const h = name => headers[name] ?? headers[name.toLowerCase()];
  const id = h('webhook-id'), ts = h('webhook-timestamp'), sig = h('webhook-signature');
  if (!secret) throw Object.assign(Error('WHOP_WEBHOOK_SECRET is not set'), {status: 503});
  if (!id || !ts || !sig) throw Object.assign(Error('Missing webhook signature headers'), {status: 400});
  if (!/^\d+$/.test(String(ts)) || Math.abs(now / 1000 - Number(ts)) > 300) throw Object.assign(Error('Webhook timestamp is too old or invalid'), {status: 400});
  const key = secret.startsWith('whsec_') ? Buffer.from(secret.slice(6), 'base64') : Buffer.from(secret, 'utf8');
  const expected = createHmac('sha256', key).update(`${id}.${ts}.${rawBody}`).digest();
  const ok = String(sig).split(' ').some(part => {
    const [version, value] = part.split(',');
    if (version !== 'v1' || !value) return false;
    const given = Buffer.from(value, 'base64');
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
  if (!ok) throw Object.assign(Error('Webhook signature does not match'), {status: 401});
  return {id, event: JSON.parse(rawBody)};
}

export function signWhop(rawBody, secret, id = 'msg_test', ts = Math.floor(Date.now() / 1000)) {
  const key = secret.startsWith('whsec_') ? Buffer.from(secret.slice(6), 'base64') : Buffer.from(secret, 'utf8');
  return {'webhook-id': id, 'webhook-timestamp': String(ts), 'webhook-signature': `v1,${createHmac('sha256', key).update(`${id}.${ts}.${rawBody}`).digest('base64')}`};
}

// Pulls what fulfillment needs out of a payment.succeeded payload. Field names vary by API pin, so each has fallbacks.
export function paymentSummary(data = {}) {
  const planId = data.plan?.id || data.plan_id || null;
  return {
    paymentId: data.id || null,
    planId,
    package: packageForPlan(planId),
    membershipId: data.membership?.id || data.membership_id || null,
    email: (data.user?.email || data.member?.email || data.email || data.customer_email || '').trim().toLowerCase() || null,
    name: (data.user?.name || data.billing_address?.name || data.user?.username || '').trim() || null,
    amountUsd: Number(data.usd_total ?? data.total ?? data.subtotal ?? NaN) || null,
    productTitle: data.product?.title || null,
  };
}
