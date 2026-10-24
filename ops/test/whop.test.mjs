import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyWhop, signWhop, paymentSummary, packageForPlan} from '../lib/whop.mjs';
import {harness, payment, STARTER, CAMPAIGN, SOFTWARE} from './helpers.mjs';

const SECRET = 'ws_fictional_test_secret';

test('a correctly signed Whop event verifies, and tampering, stale timestamps or a wrong secret do not', () => {
  const raw = JSON.stringify({type: 'payment.succeeded', data: {id: 'pay_1'}});
  const headers = signWhop(raw, SECRET, 'msg_1');
  assert.equal(verifyWhop(raw, headers, SECRET).event.data.id, 'pay_1');
  assert.throws(() => verifyWhop(raw.replace('pay_1', 'pay_2'), headers, SECRET), /does not match/);
  assert.throws(() => verifyWhop(raw, headers, 'ws_other'), /does not match/);
  const old = signWhop(raw, SECRET, 'msg_1', Math.floor(Date.now() / 1000) - 600);
  assert.throws(() => verifyWhop(raw, old, SECRET), /too old/);
  assert.throws(() => verifyWhop(raw, {}, SECRET), /Missing/);
  assert.throws(() => verifyWhop(raw, headers, ''), /not set/);
  // A Standard Webhooks whsec_ secret is base64 after the prefix.
  const whsec = `whsec_${Buffer.from('fictional key bytes').toString('base64')}`;
  assert.ok(verifyWhop(raw, signWhop(raw, whsec, 'msg_2'), whsec));
  // Several signatures in one header: any valid one passes.
  const multi = {...headers, 'webhook-signature': `v1,AAAA ${headers['webhook-signature']}`};
  assert.ok(verifyWhop(raw, multi, SECRET));
});

test('payments map to packages by plan ID and keep only what fulfillment needs', () => {
  assert.equal(packageForPlan(STARTER), 'starter');
  assert.equal(packageForPlan(CAMPAIGN), 'campaign');
  assert.equal(packageForPlan(SOFTWARE), null);
  const p = paymentSummary(payment(CAMPAIGN, {total: 1000}));
  assert.equal(p.package, 'campaign');
  assert.equal(p.email, 'buyer@example.test');
  assert.equal(p.amountUsd, 1000);
  assert.equal(paymentSummary({id: 'pay_x', plan_id: STARTER, billing_address: {name: 'B'}}).package, 'starter');
});

test('a paid UGC plan creates one order and a brief request; retries and repeats do not duplicate it', async () => {
  const h = harness();
  const pay = payment(STARTER);
  const first = await h.whop(pay, {id: 'msg_same'});
  assert.equal(first.status, 200);
  assert.ok(first.body.order);
  assert.equal((await h.whop(pay, {id: 'msg_same'})).body.duplicate, true);
  assert.equal((await h.whop(pay, {id: 'msg_other'})).body.duplicate, true);
  const orders = await h.db.find('orders');
  assert.equal(orders.length, 1);
  assert.equal(orders[0].package, 'starter');
  assert.equal(orders[0].videos_total, 5);
  assert.equal(orders[0].buyer_email, 'buyer@example.test');
  const [mail] = await h.db.find('outbox');
  assert.equal(mail.kind, 'brief_request');
  assert.match(mail.body, new RegExp(`https://ops.test/brief/\\?t=${orders[0].token}`));
  assert.ok(h.alerts.some(a => a.includes('New Starter order')));
});

test('other plans, other event types and unsigned requests never create orders', async () => {
  const h = harness();
  assert.equal((await h.whop(payment(SOFTWARE))).body.fulfillment, false);
  assert.equal((await h.whop({id: 'pay_9'}, {type: 'payment.failed'})).body.ignored, 'payment.failed');
  assert.equal((await h.call('POST', '/api/whop', JSON.stringify({type: 'payment.succeeded', data: payment()}))).status, 400);
  assert.equal((await h.db.find('orders')).length, 0);
  assert.equal((await h.db.find('events', {level: 'attention'})).length, 1);
});
