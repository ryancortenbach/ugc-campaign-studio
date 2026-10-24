import test from 'node:test';
import assert from 'node:assert/strict';
import {harness, payment, BRIEF, CAMPAIGN} from './helpers.mjs';
import {tick, digest, loadSettings} from '../lib/pipeline.mjs';

async function paidOrderWithBrief(h, planId) {
  await h.whop(payment(planId));
  const [order] = await h.db.find('orders');
  const sent = await h.call('POST', `/api/brief?t=${order.token}`, BRIEF);
  assert.equal(sent.status, 200, JSON.stringify(sent.body));
  return h.db.get('orders', order.id);
}
const statuses = async (h, table) => (await h.db.find(table)).map(r => r.status);

test('the brief form validates input, starts production once, and refuses a second brief', async () => {
  const h = harness();
  await h.whop(payment());
  const [order] = await h.db.find('orders');
  assert.equal((await h.call('GET', `/api/brief?t=${order.token}`)).body.videos, 5);
  assert.equal((await h.call('GET', '/api/brief?t=nope')).status, 404);
  assert.equal((await h.call('POST', `/api/brief?t=${order.token}`, {brand: 'X'})).status, 400);
  assert.equal((await h.call('POST', `/api/brief?t=${order.token}`, {...BRIEF, website: 'javascript:alert(1)'})).status, 400);
  assert.equal((await h.call('POST', `/api/brief?t=${order.token}`, BRIEF)).status, 200);
  assert.equal((await h.call('POST', `/api/brief?t=${order.token}`, BRIEF)).status, 409);
  assert.equal((await h.db.get('orders', order.id)).status, 'in_production');
  assert.deepEqual(await statuses(h, 'videos'), Array(5).fill('queued'));
});

test('a paid order runs from brief to delivery without anyone touching it, within its budget', async () => {
  const h = harness();
  const order = await paidOrderWithBrief(h);
  await h.settle();
  assert.deepEqual(await statuses(h, 'videos'), Array(5).fill('review'), 'every video should wait for review');
  assert.equal(h.tools.calls.angles, 1, 'one angle call per order');
  assert.equal(h.tools.calls.submit, 10, 'two shots per video, each submitted once');
  assert.equal(h.tools.files.size, 5, 'clips are deleted after stitching, finals stay');
  for (const v of await h.db.find('videos')) assert.equal((await h.op('POST', `/api/ops/videos/${v.id}/review`, {decision: 'approve'})).status, 200);
  await h.settle();
  const done = await h.db.get('orders', order.id);
  assert.equal(done.status, 'delivered');
  const delivery = (await h.db.find('outbox', {kind: 'delivery'}))[0];
  assert.match(delivery.body, /https:\/\/ops\.test\/d\/\?t=/);
  const page = await h.call('GET', `/api/delivery?t=${order.token}`);
  assert.equal(page.body.ready, true);
  assert.equal(page.body.videos.length, 5);
  assert.match(page.body.videos[0].download, /fictional-roasters-video-1\.mp4/);
  const spent = await h.db.sumUsd({order_id: order.id});
  assert.ok(spent < Number(order.budget_usd), `spent ${spent} should stay under ${order.budget_usd}`);
  assert.equal((await h.db.find('spend', {provider: 'higgsfield'})).length, 10);
});

test('storyboards that keep failing their checks are revised twice, then wait for a person', async () => {
  const h = harness({tools: {checkStoryboard: async () => ({passed: false, results: [{name: 'Continuity', score: 60, issues: [{severity: 'major', evidence: 'x', fix: 'y'}]}], cost: 0.01})}});
  await paidOrderWithBrief(h);
  await h.settle();
  const videos = await h.db.find('videos');
  assert.ok(videos.every(v => v.status === 'attention'), JSON.stringify(videos.map(v => v.status)));
  assert.equal(h.tools.calls.revise, 10);
  assert.match(videos[0].error, /Continuity 60/);
  assert.equal(h.tools.calls.submit, 0);
  assert.ok((await h.db.find('events', {level: 'attention'})).length >= 5);
});

test('a render over the order budget stops for an OK, and the OK submits it exactly once', async () => {
  const h = harness({tools: {estimate: async () => '70.00'}});
  await paidOrderWithBrief(h);
  await h.settle();
  const shots = await h.db.find('shots');
  assert.ok(shots.length && shots.every(s => s.status === 'attention' && s.resume_status === 'priced'), JSON.stringify(shots.map(s => [s.status, s.resume_status])));
  assert.equal(h.tools.calls.submit, 0);
  assert.match(shots[0].error, /order budget/);
  const ok = await h.op('POST', `/api/ops/shots/${shots[0].id}/approve-spend`);
  assert.equal(ok.status, 200);
  assert.equal(ok.body.shot.status, 'queued');
  assert.equal((await h.op('POST', `/api/ops/shots/${shots[0].id}/approve-spend`)).status, 409);
  assert.equal(h.tools.calls.submit, 1);
});

test('turning auto-approval off makes every render wait for a person', async () => {
  const h = harness();
  assert.equal((await h.op('POST', '/api/ops/settings', {autoApproveRenders: false})).status, 200);
  await paidOrderWithBrief(h);
  await h.settle();
  assert.equal(h.tools.calls.submit, 0);
  assert.match((await h.db.find('shots'))[0].error, /auto-approval is off/);
  assert.equal((await h.op('POST', '/api/ops/settings', {autoApproveRenders: 'yes'})).status, 400);
  assert.equal((await h.op('POST', '/api/ops/settings', {unknown: 1})).status, 400);
});

test('an unknown Higgsfield outcome is never retried by itself, and reconciling reuses the same key', async () => {
  let fail = true;
  const keys = [];
  const h = harness({tools: {submit: async (e, i, key) => { keys.push(key); if (fail) throw Error('fictional timeout'); return {request_id: `req-${key}`}; }}});
  await paidOrderWithBrief(h);
  await h.settle();
  const stuck = (await h.db.find('shots')).filter(s => s.resume_status === 'unknown');
  assert.equal(stuck.length, 10, 'every shot stopped at unknown');
  const before = keys.length;
  await h.run(2);
  assert.equal(keys.length, before, 'unknown shots are not resubmitted by ticks');
  assert.equal((await h.op('POST', '/api/ops/retry', {table: 'shots', id: stuck[0].id})).status, 409);
  // One went through after all: attach its request ID. Another never started: return it to the gate.
  const attached = await h.op('POST', `/api/ops/shots/${stuck[0].id}/reconcile`, {requestId: 'req-from-higgsfield'});
  assert.equal(attached.body.shot.status, 'queued');
  assert.equal((await h.op('POST', `/api/ops/shots/${stuck[1].id}/reconcile`, {})).body.shot.status, 'priced');
  fail = false;
  await h.run(1);
  assert.equal(keys.at(-1), stuck[1].submission_key, 'the retry sends the same Idempotency-Key');
});

test('a reviewer note sends a video back through revision, new shots and a new final', async () => {
  const h = harness();
  await paidOrderWithBrief(h);
  await h.settle();
  const [v] = await h.db.find('videos');
  assert.equal((await h.op('POST', `/api/ops/videos/${v.id}/review`, {decision: 'changes', note: ''})).status, 400);
  assert.equal((await h.op('POST', `/api/ops/videos/${v.id}/review`, {decision: 'changes', note: 'Make the hook faster'})).status, 200);
  const submitsBefore = h.tools.calls.submit;
  await h.settle();
  const again = await h.db.get('videos', v.id);
  assert.equal(again.status, 'review');
  assert.match(again.plan.title, /Make the hook faster/);
  assert.equal(h.tools.calls.submit - submitsBefore, 2);
});

test('overlapping ticks never submit the same shot twice', async () => {
  const h = harness();
  await paidOrderWithBrief(h, CAMPAIGN);
  await h.settle();
  await Promise.all([tick({db: h.db, tools: h.tools, baseUrl: 'https://ops.test'}), tick({db: h.db, tools: h.tools, baseUrl: 'https://ops.test'}), tick({db: h.db, tools: h.tools, baseUrl: 'https://ops.test'})]);
  await h.settle();
  const shots = await h.db.find('shots');
  assert.equal(h.tools.calls.submit, shots.length);
  assert.equal(new Set(shots.map(s => s.submission_key)).size, shots.length);
  assert.equal((await h.db.find('spend', {provider: 'higgsfield'})).length, shots.length);
});

test('without Higgsfield credentials, storyboards still move and shots wait without failing', async () => {
  const h = harness({tools: {ready: () => ({llm: true, higgsfield: false})}});
  await paidOrderWithBrief(h);
  await h.settle();
  const [report] = await h.run(1);
  assert.ok(report.waiting.some(w => w.includes('HF_CREDENTIALS')));
  const shots = await h.db.find('shots');
  assert.ok(shots.length && shots.every(s => s.status === 'draft'));
  assert.equal((await h.db.find('events', {level: 'attention'})).length, 0);
});

test('operator routes need the password, and the session cookie works', async () => {
  const h = harness();
  assert.equal((await h.call('GET', '/api/ops/state')).status, 401);
  assert.equal((await h.call('POST', '/api/ops/login', {password: 'wrong'})).status, 401);
  const login = await h.call('POST', '/api/ops/login', {password: h.env.OPS_PASSWORD});
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  assert.match(login.headers.get('set-cookie'), /HttpOnly; Secure/);
  assert.equal((await h.call('GET', '/api/ops/state', undefined, {cookie})).status, 200);
  assert.equal((await h.call('GET', '/api/ops/state', undefined, {cookie: 'ops_session=9999999999999.forged'})).status, 401);
});

test('the heartbeat needs no secret but starts at most one tick a minute, and health reports without data', async () => {
  const h = harness();
  const first = await h.call('POST', '/api/tick', {});
  assert.equal(first.status, 202);
  assert.equal(first.body.started, true);
  const again = await h.call('POST', '/api/tick', {});
  assert.equal(again.status, 200);
  assert.equal(again.body.started, false);
  const health = await h.call('GET', '/api/health');
  assert.equal(health.status, 200);
  assert.deepEqual([health.body.ok, health.body.database, health.body.storage, health.body.whop], [true, true, true, true]);
  assert.equal(JSON.stringify(health.body).includes(h.env.OPS_PASSWORD), false);
});

test('a manual order gets a brief link for a sale made before the webhook existed', async () => {
  const h = harness();
  const made = await h.op('POST', '/api/ops/orders', {package: 'starter', email: 'earlier@example.test', name: 'Earlier Buyer'});
  assert.equal(made.status, 200);
  assert.match(made.body.briefUrl, /^https:\/\/ops\.test\/brief\/\?t=/);
  assert.equal((await h.op('POST', '/api/ops/orders', {package: 'software'})).status, 400);
  assert.equal((await h.op('POST', '/api/ops/orders', {package: 'starter', email: 'not-an-email'})).status, 400);
  const state = await h.op('GET', '/api/ops/state');
  assert.equal(state.body.orders.length, 1);
  assert.equal(state.body.orders[0].token, undefined);
  assert.equal(state.body.outbox[0].to_email, 'earlier@example.test');
});

test('finished videos leave storage after the retention window, and the digest goes out once a day', async () => {
  const h = harness();
  const order = await paidOrderWithBrief(h);
  await h.settle();
  for (const v of await h.db.find('videos')) await h.op('POST', `/api/ops/videos/${v.id}/review`, {decision: 'approve'});
  await h.settle();
  assert.equal(h.tools.files.size, 5);
  await h.db.update('orders', order.id, {delivered_at: new Date(Date.now() - 31 * 86400000).toISOString()});
  await h.run(1);
  assert.equal(h.tools.files.size, 0);
  assert.equal((await h.db.get('orders', order.id)).status, 'closed');
  assert.equal((await h.call('GET', `/api/delivery?t=${order.token}`)).body.expired, true);
  const s = await loadSettings(h.db);
  const sent = [];
  const at = hour => () => new Date(`2026-10-25T${String(hour).padStart(2, '0')}:00:00Z`).getTime();
  assert.equal(await digest({db: h.db, s, now: at(9), notify: async t => sent.push(t)}), null);
  assert.match(await digest({db: h.db, s, now: at(13), notify: async t => sent.push(t)}), /Mint Labs daily digest, 2026-10-25/);
  assert.equal(await digest({db: h.db, s, now: at(15), notify: async t => sent.push(t)}), null);
  assert.equal(sent.length, 1);
  const preview = await h.op('POST', '/api/ops/digest');
  assert.match(preview.body.text, /Orders:/);
});
