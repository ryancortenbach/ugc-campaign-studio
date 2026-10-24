import {createHmac, createHash, timingSafeEqual} from 'node:crypto';
import {verifyWhop, paymentSummary, PACKAGES} from './whop.mjs';
import {loadSettings, saveSettings, createOrder, submitBrief, tick, digest, reviewVideo, retryRow, approveSpend, reconcileShot, briefUrl, deliveryUrl, event} from './pipeline.mjs';

const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), {status, headers: {'content-type': 'application/json', 'cache-control': 'no-store', ...headers}});
const fail = (status, message) => Object.assign(Error(message), {status});
const same = (a, b) => { const x = createHash('sha256').update(String(a)).digest(), y = createHash('sha256').update(String(b)).digest(); return timingSafeEqual(x, y); };

// Operator session: a signed expiry in an HttpOnly cookie. OPS_SESSION_SECRET signs it; OPS_PASSWORD unlocks it.
const SESSION_DAYS = 30;
export function sessionCookie(secret, now = Date.now()) {
  const exp = String(now + SESSION_DAYS * 86400000);
  return `${exp}.${createHmac('sha256', secret).update(exp).digest('base64url')}`;
}
export function validSession(value, secret, now = Date.now()) {
  const [exp, sig] = String(value || '').split('.');
  if (!exp || !sig || !/^\d+$/.test(exp) || Number(exp) < now) return false;
  return same(sig, createHmac('sha256', secret).update(exp).digest('base64url'));
}
const cookieOf = (req, name) => (req.headers.get('cookie') || '').split(';').map(c => c.trim().split('=')).find(([k]) => k === name)?.[1];

// deps: {db, tools, env, notify, waitUntil}. Every route returns a Response; errors with .status become JSON errors.
export function createRouter(deps) {
  const {db, tools, env, notify = async () => {}, waitUntil = p => p} = deps;
  const baseUrl = req => (env.PUBLIC_BASE_URL || new URL(req.url).origin).replace(/\/$/, '');
  const isOperator = req => Boolean(env.OPS_SESSION_SECRET && validSession(cookieOf(req, 'ops_session'), env.OPS_SESSION_SECRET));
  const body = async req => { const text = await req.text(); if (text.length > 100000) throw fail(413, 'Request too large'); try { return text ? JSON.parse(text) : {}; } catch { throw fail(400, 'Invalid JSON'); } };
  const runTick = req => tick({db, tools, baseUrl: baseUrl(req), notify, budgetMs: Number(env.TICK_BUDGET_MS) || 240000});

  const routes = [
    // Whop payment webhook. Verified, de-duplicated by webhook-id, answered fast.
    ['POST', /^\/api\/whop$/, async req => {
      const raw = await req.text();
      const {id, event: evt} = verifyWhop(raw, Object.fromEntries(req.headers), env.WHOP_WEBHOOK_SECRET);
      try { await db.insert('webhook_events', {id, type: evt.type, summary: evt.type === 'payment.succeeded' ? paymentSummary(evt.data) : null}); }
      catch (error) { if (error.code === '23505') return json({ok: true, duplicate: true}); throw error; }
      if (evt.type !== 'payment.succeeded') return json({ok: true, ignored: evt.type});
      const p = paymentSummary(evt.data);
      if (!p.package) {
        await event(db, {level: 'attention', title: `Payment ${p.paymentId} for a plan without fulfillment (${p.planId || 'unknown plan'}${p.productTitle ? `, ${p.productTitle}` : ''}). Handle it by hand.`});
        await notify(`New payment for ${p.productTitle || p.planId || 'an unknown plan'}. It is not a UGC package, so handle it by hand.`);
        return json({ok: true, fulfillment: false});
      }
      const s = await loadSettings(db);
      try {
        const order = await createOrder(db, {pkg: p.package, email: p.email, name: p.name, paymentId: p.paymentId, membershipId: p.membershipId, planId: p.planId, amountUsd: p.amountUsd}, {baseUrl: baseUrl(req), settings: s});
        await notify(`New ${PACKAGES[p.package].label} order ${order.id}${p.email ? ` from ${p.email}` : ''}. The brief request email is in the outbox.`);
        return json({ok: true, order: order.id});
      } catch (error) { if (error.code === '23505') return json({ok: true, duplicate: true}); throw error; }
    }],

    // Heartbeat from Supabase pg_cron. It needs no secret: a database lease lets one tick start per 55 seconds, and a tick
    // only moves existing paid work forward within its caps. Answers at once and keeps working in the background.
    ['POST', /^\/api\/tick$/, async req => {
      if (!await db.acquireLease('tick', 55)) return json({ok: true, started: false, reason: 'A tick started less than a minute ago.'});
      waitUntil(runTick(req).catch(error => event(db, {level: 'attention', title: `Tick failed: ${error.message}`}).catch(() => {})));
      return json({ok: true, started: true}, 202);
    }],

    // Health for monitoring: whether the database and storage answer and which providers are configured. No data, no secrets.
    ['GET', /^\/api\/health$/, async () => {
      const check = async fn => { try { await fn(); return true; } catch { return false; } };
      const [database, storage] = await Promise.all([check(() => db.find('settings', {}, {limit: 1})), check(() => tools.storage.ping())]);
      return json({ok: database && storage, database, storage, ...tools.ready(), whop: Boolean(env.WHOP_WEBHOOK_SECRET), alerts: Boolean(env.ALERT_WEBHOOK_URL)});
    }],

    // Customer brief form.
    ['GET', /^\/api\/brief$/, async (req, m, url) => {
      const [order] = await db.find('orders', {token: url.searchParams.get('t') || '-'});
      if (!order) throw fail(404, 'This link is not valid.');
      const p = PACKAGES[order.package];
      return json({package: p.label, videos: order.videos_total, received: order.status !== 'awaiting_brief', brand: order.brief?.brand || null, name: order.buyer_name});
    }],
    ['POST', /^\/api\/brief$/, async (req, m, url) => {
      const order = await submitBrief(db, url.searchParams.get('t') || '-', await body(req));
      await notify(`Brief received for order ${order.id} (${order.brief.brand}). Production is starting.`);
      return json({ok: true});
    }],

    // Customer delivery page: signed links to the finished videos, valid for a week from each visit.
    ['GET', /^\/api\/delivery$/, async (req, m, url) => {
      const [order] = await db.find('orders', {token: url.searchParams.get('t') || '-'});
      if (!order) throw fail(404, 'This link is not valid.');
      if (order.status === 'closed') return json({ready: false, expired: true});
      if (order.status !== 'delivered') return json({ready: false, status: order.status});
      const videos = (await db.find('videos', {order_id: order.id})).filter(v => v.final_path).sort((a, b) => a.idx - b.idx);
      const brand = (order.brief?.brand || 'mint-labs').toLowerCase().replace(/[^a-z0-9]+/g, '-');
      return json({ready: true, brand: order.brief?.brand, videos: await Promise.all(videos.map(async v => ({idx: v.idx, title: v.angle?.title || `Video ${v.idx}`,
        url: await tools.storage.signedUrl(v.final_path, 7 * 86400), download: await tools.storage.signedUrl(v.final_path, 7 * 86400, `${brand}-video-${v.idx}.mp4`)})))});
    }],

    ['POST', /^\/api\/ops\/login$/, async req => {
      const {password} = await body(req);
      if (!env.OPS_PASSWORD || !env.OPS_SESSION_SECRET) throw fail(503, 'OPS_PASSWORD and OPS_SESSION_SECRET are not set');
      if (!same(password || '', env.OPS_PASSWORD)) { await new Promise(r => setTimeout(r, 800)); throw fail(401, 'Wrong password'); }
      return json({ok: true}, 200, {'set-cookie': `ops_session=${sessionCookie(env.OPS_SESSION_SECRET)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`});
    }],
    ['POST', /^\/api\/ops\/logout$/, async () => json({ok: true}, 200, {'set-cookie': 'ops_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0'})],

    ['GET', /^\/api\/ops\/state$/, async req => {
      const [orders, videos, shots, outbox, events, settings, daySpend, allSpend] = await Promise.all([
        db.find('orders', {}, {desc: true, limit: 100}), db.find('videos', {}, {desc: true, limit: 600}),
        db.find('shots', {status: ['attention', 'queued', 'in_progress', 'submitting', 'priced', 'draft']}, {desc: true, limit: 400}),
        db.find('outbox', {status: 'pending'}, {desc: true, limit: 100}), db.find('events', {}, {order: 'at', desc: true, limit: 60}), loadSettings(db),
        db.sumUsd({at: {gte: new Date(Date.now() - 86400000).toISOString()}}), db.sumUsd({})]);
      const base = baseUrl(req);
      return json({
        ready: {...tools.ready(), whop: Boolean(env.WHOP_WEBHOOK_SECRET), cron: Boolean(env.CRON_SECRET), alerts: Boolean(env.ALERT_WEBHOOK_URL)},
        settings, spend: {last24h: daySpend, total: allSpend},
        orders: await Promise.all(orders.map(async o => ({...o, token: undefined, briefUrl: briefUrl(base, o), deliveryUrl: o.status === 'delivered' ? deliveryUrl(base, o) : null,
          spent: await db.sumUsd({order_id: o.id}), progress: videos.filter(v => v.order_id === o.id).reduce((acc, v) => ({...acc, [v.status]: (acc[v.status] || 0) + 1}), {})}))),
        review: videos.filter(v => v.status === 'review').map(v => ({id: v.id, order_id: v.order_id, idx: v.idx, title: v.angle?.title, plan: v.plan, checks: v.checks})),
        attention: [...videos.filter(v => v.status === 'attention').map(v => ({table: 'videos', id: v.id, order_id: v.order_id, video: v.idx, error: v.error, resume: v.resume_status})),
          ...shots.filter(x => x.status === 'attention').map(x => ({table: 'shots', id: x.id, video_id: x.video_id, shot: x.idx, error: x.error, resume: x.resume_status, estimate: x.estimate_usd}))],
        rendering: shots.filter(x => x.status !== 'attention').length,
        outbox, events,
      });
    }, true],
    ['POST', /^\/api\/ops\/orders$/, async req => {
      const b = await body(req);
      const email = String(b.email || '').trim().toLowerCase() || null;
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw fail(400, 'That email does not look right');
      const order = await createOrder(db, {pkg: b.package, email, name: String(b.name || '').trim().slice(0, 80) || null, note: String(b.note || '').slice(0, 500) || null}, {baseUrl: baseUrl(req), settings: await loadSettings(db)});
      return json({order: {...order, token: undefined}, briefUrl: briefUrl(baseUrl(req), order)});
    }, true],
    ['GET', /^\/api\/ops\/videos\/(\d+)\/url$/, async (req, m) => {
      const v = await db.get('videos', Number(m[1]));
      if (!v?.final_path) throw fail(404, 'No finished video yet');
      return json({url: await tools.storage.signedUrl(v.final_path, 3600)});
    }, true],
    ['POST', /^\/api\/ops\/videos\/(\d+)\/review$/, async (req, m) => { const {decision, note} = await body(req); return json({video: await reviewVideo(db, Number(m[1]), decision === 'approve' ? 'approve' : 'changes', note)}); }, true],
    ['POST', /^\/api\/ops\/retry$/, async req => { const {table, id} = await body(req); if (!['videos', 'shots'].includes(table)) throw fail(400, 'Unknown item'); return json({row: await retryRow(db, table, Number(id))}); }, true],
    ['POST', /^\/api\/ops\/shots\/(\d+)\/approve-spend$/, async (req, m) => json({shot: await approveSpend(db, tools, Number(m[1]))}), true],
    ['POST', /^\/api\/ops\/shots\/(\d+)\/reconcile$/, async (req, m) => { const {requestId} = await body(req); return json({shot: await reconcileShot(db, tools, Number(m[1]), {requestId: requestId ? String(requestId).trim() : null})}); }, true],
    ['POST', /^\/api\/ops\/outbox\/(\d+)\/(sent|skipped)$/, async (req, m) => json({row: await db.update('outbox', Number(m[1]), {status: m[2], sent_at: m[2] === 'sent' ? new Date().toISOString() : null}, {status: 'pending'})}), true],
    ['POST', /^\/api\/ops\/settings$/, async req => json({settings: await saveSettings(db, await body(req))}), true],
    ['POST', /^\/api\/ops\/digest$/, async req => json({text: await digest({db, s: await loadSettings(db), now: () => Date.now(), notify: async () => {}, report: null}, {force: true, preview: true})}), true],
    ['POST', /^\/api\/ops\/tick$/, async req => json({report: await tick({db, tools, baseUrl: baseUrl(req), notify, budgetMs: 50000})}), true],
  ];

  return async function handle(req) {
    const url = new URL(req.url);
    for (const [method, pattern, fn, operatorOnly] of routes) {
      const m = url.pathname.match(pattern);
      if (!m || req.method !== method) continue;
      try {
        if (operatorOnly && !isOperator(req)) throw fail(401, 'Log in first');
        return await fn(req, m, url);
      } catch (error) {
        const status = error.status || 500;
        if (status >= 500) console.error(error);
        return json({error: status >= 500 && !error.status ? 'Something went wrong. It has been logged.' : error.message}, status);
      }
    }
    return json({error: 'Not found'}, 404);
  };
}

// Posts a one-line alert to ALERT_WEBHOOK_URL: plain text for ntfy topics, JSON for Slack and Discord hooks.
export function alertSender(url) {
  if (!url) return async () => {};
  return async text => {
    try {
      const ntfy = /ntfy\./.test(url);
      await fetch(url, {method: 'POST', headers: {'content-type': ntfy ? 'text/plain' : 'application/json'}, body: ntfy ? text.slice(0, 3500) : JSON.stringify({text: text.slice(0, 3500), content: text.slice(0, 1900)}), signal: AbortSignal.timeout(5000)});
    } catch {}
  };
}
