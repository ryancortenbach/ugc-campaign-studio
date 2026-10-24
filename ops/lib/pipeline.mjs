import {requirePaidWork} from './spending-policy.mjs';
import {randomBytes} from 'node:crypto';
import {PACKAGES} from './whop.mjs';

// Every step claims a row with a short lease before touching it and moves it on with a conditional update,
// so overlapping ticks never do the same work twice. A failing step retries with backoff, then asks a person.
export const DEFAULT_SETTINGS = {autoApproveRenders: true, dailyCapUsd: 60, starterBudgetUsd: 60, campaignBudgetUsd: 140, retentionDays: 30, maxStoryboardRevisions: 2, opsEmail: ''};
export const MAX_ATTEMPTS = 3;
export const newToken = () => randomBytes(18).toString('base64url');
const DAY = 86400000;
const clip = (v, n) => String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, n);

export async function loadSettings(db) {
  const rows = await db.find('settings');
  return {...DEFAULT_SETTINGS, ...Object.fromEntries(rows.map(r => [r.key, r.value]))};
}
export async function saveSettings(db, patch) {
  for (const [key, value] of Object.entries(patch)) {
    if (!(key in DEFAULT_SETTINGS)) throw Object.assign(Error(`Unknown setting ${key}`), {status: 400});
    const ok = typeof DEFAULT_SETTINGS[key] === 'boolean' ? typeof value === 'boolean' : typeof DEFAULT_SETTINGS[key] === 'number' ? Number.isFinite(value) && value >= 0 : typeof value === 'string';
    if (!ok) throw Object.assign(Error(`${key} has the wrong type`), {status: 400});
    await db.upsert('settings', {key, value});
  }
  return loadSettings(db);
}
export const event = (db, e) => db.insert('events', {level: 'info', ...e, title: clip(e.title, 300)});

// ---- Orders and briefs ----

export async function createOrder(db, {pkg, email = null, name = null, paymentId = null, membershipId = null, planId = null, amountUsd = null, note = null}, {baseUrl, settings}) {
  const p = PACKAGES[pkg];
  if (!p) throw Object.assign(Error('Unknown package'), {status: 400});
  const order = await db.insert('orders', {token: newToken(), package: pkg, videos_total: p.videos, budget_usd: pkg === 'starter' ? settings.starterBudgetUsd : settings.campaignBudgetUsd,
    buyer_email: email, buyer_name: name, whop_payment_id: paymentId, whop_membership_id: membershipId, whop_plan_id: planId || p.planId, amount_usd: amountUsd ?? p.priceUsd, note});
  await event(db, {order_id: order.id, title: `New ${p.label} order${email ? ` from ${email}` : ''}`});
  await db.insert('outbox', {kind: 'brief_request', to_email: email, order_id: order.id, subject: 'Your Mint Labs videos: tell us about your brand',
    body: `Hi${name ? ` ${name.split(' ')[0]}` : ''},\n\nThanks for ordering the Mint Labs ${p.label} package (${p.videos} videos). Tell us about your brand here and we start right away:\n\n${briefUrl(baseUrl, order)}\n\nIt takes about five minutes. Reply to this email with any questions.\n\nMint Labs`});
  return order;
}
export const briefUrl = (baseUrl, order) => `${baseUrl}/brief/?t=${order.token}`;
export const deliveryUrl = (baseUrl, order) => `${baseUrl}/d/?t=${order.token}`;

const URLISH = /^https?:\/\/[^\s]{3,200}$/;
export function cleanBrief(raw = {}) {
  const b = {brand: clip(raw.brand, 80), website: clip(raw.website, 200), product: clip(raw.product, 800), audience: clip(raw.audience, 600), offer: clip(raw.offer, 300),
    tone: clip(raw.tone, 300), mustSay: clip(raw.mustSay, 400), avoid: clip(raw.avoid, 400), creator: raw.creator === 'same' ? 'same' : 'different', creatorNotes: clip(raw.creatorNotes, 300),
    length: Number(raw.length) === 30 ? 30 : 15, assets: clip(raw.assets, 800)};
  const missing = ['brand', 'product', 'audience'].filter(k => !b[k]);
  if (missing.length) throw Object.assign(Error(`Please fill in: ${missing.join(', ')}`), {status: 400});
  if (b.website && !URLISH.test(b.website)) throw Object.assign(Error('Website must start with http:// or https://'), {status: 400});
  return b;
}

export async function submitBrief(db, token, raw) {
  const [order] = await db.find('orders', {token});
  if (!order) throw Object.assign(Error('This link is not valid.'), {status: 404});
  if (order.status !== 'awaiting_brief') throw Object.assign(Error('We already have your brief. Reply to our email to change it.'), {status: 409});
  const brief = cleanBrief(raw);
  const moved = await db.update('orders', order.id, {brief, status: 'in_production'}, {status: 'awaiting_brief'});
  if (!moved) throw Object.assign(Error('We already have your brief.'), {status: 409});
  await db.insertMany('videos', Array.from({length: order.videos_total}, (_, i) => ({order_id: order.id, idx: i + 1})));
  await event(db, {order_id: order.id, title: `Brief received from ${brief.brand}. Production started.`});
  return moved;
}

// ---- The tick ----

export async function tick({db, tools, baseUrl, now = () => Date.now(), budgetMs = 240000, notify = async () => {}}) {
  const s = await loadSettings(db);
  const deadline = now() + budgetMs, left = () => now() < deadline;
  const ready = tools.ready();
  const report = {angles: 0, drafted: 0, checked: 0, revised: 0, shotsMade: 0, priced: 0, submitted: 0, polled: 0, stitched: 0, delivered: 0, cleaned: 0, attention: 0, waiting: []};
  const ctx = {db, tools, s, baseUrl, now, left, report, notify, ready, orders: new Map()};
  if (ready.spendingPaused === true) {
    report.spendingPaused = true;
    report.waiting.push('Paid fulfillment work is paused by server configuration. No pipeline steps ran.');
    return report;
  }
  if (!ready.llm) report.waiting.push('ANTHROPIC_API_KEY is not set, so storyboards and checks are paused.');
  if (!ready.higgsfield) report.waiting.push('HF_CREDENTIALS is not set, so shots are not priced or rendered.');
  // Closest to done first: money already spent becomes finished videos before new work starts.
  await stitchVideos(ctx);
  if (ready.higgsfield) { await pollShots(ctx); await submitShots(ctx); }
  await completeVideos(ctx);
  if (ready.llm) {
    if (ready.higgsfield) await priceShots(ctx);
    await makeShots(ctx);
    await checkStoryboards(ctx);
    await applyChanges(ctx);
    await planAngles(ctx);
    await draftStoryboards(ctx);
  }
  await finishOrders(ctx);
  await cleanup(ctx);
  await digest(ctx);
  return report;
}

const orderOf = async (ctx, id) => { if (!ctx.orders.has(id)) ctx.orders.set(id, await ctx.db.get('orders', id)); return ctx.orders.get(id); };
const spendRow = (ctx, row) => row.usd > 0 ? ctx.db.insert('spend', row) : null;

// Runs fn on up to `limit` rows in `status`, each under a lease. Errors retry later with backoff; the third failure asks a person.
async function each(ctx, table, status, {limit = 4, lease = 280, where = {}} = {}, fn) {
  const rows = await ctx.db.find(table, {...where, status}, {limit: limit * 3});
  let done = 0;
  for (const row of rows) {
    if (done >= limit || !ctx.left()) break;
    if (row.lock_until && new Date(row.lock_until).getTime() > ctx.now()) continue;
    const mine = await ctx.db.claim(table, row.id, status, lease);
    if (!mine) continue;
    done++;
    try { await fn(mine); }
    catch (error) {
      const attempts = (mine.attempts || 0) + 1, message = clip(error.message, 500);
      if (attempts >= MAX_ATTEMPTS) await attention(ctx, table, mine, `${message} (after ${attempts} tries)`);
      else await ctx.db.update(table, mine.id, {attempts, error: message, lock_until: new Date(ctx.now() + attempts * 120000).toISOString()}, {status});
    }
  }
}

async function attention(ctx, table, row, reason, extra = {}) {
  const moved = await ctx.db.update(table, row.id, {status: 'attention', resume_status: row.status, error: clip(reason, 500), lock_until: null, ...extra}, {status: row.status});
  if (!moved) return;
  const video = table === 'videos' ? row : await ctx.db.get('videos', row.video_id);
  ctx.report.attention++;
  const title = `Needs you: ${table === 'shots' ? `shot ${row.idx} of ` : ''}video ${video.idx} of order ${video.order_id}. ${reason}`;
  await event(ctx.db, {level: 'attention', order_id: video.order_id, video_id: video.id, shot_id: table === 'shots' ? row.id : null, title});
  await ctx.notify(title);
}

// One call per order: distinct creative angles for every video, plus a recurring creator when the brand asked for one.
async function planAngles(ctx) {
  const waiting = await ctx.db.find('videos', {status: 'queued', angle: null}, {limit: 40});
  for (const orderId of [...new Set(waiting.map(v => v.order_id))]) {
    if (!ctx.left()) return;
    const order = await orderOf(ctx, orderId);
    const first = waiting.find(v => v.order_id === orderId);
    if (!await ctx.db.claim('videos', first.id, 'queued', 280)) continue;
    try {
      const videos = await ctx.db.find('videos', {order_id: orderId, status: 'queued', angle: null});
      const out = await ctx.tools.angles(order.brief, videos.length);
      await spendRow(ctx, {provider: 'claude', usd: out.cost, order_id: orderId, note: 'creative angles'});
      if (out.creator && order.brief.creator === 'same') await ctx.db.update('orders', orderId, {creative: {creator: out.creator}});
      for (const [i, v] of videos.entries()) await ctx.db.update('videos', v.id, {angle: out.angles[i % out.angles.length], lock_until: null});
      ctx.report.angles += videos.length;
      ctx.orders.delete(orderId);
    } catch (error) { await ctx.db.update('videos', first.id, {lock_until: new Date(ctx.now() + 120000).toISOString(), error: clip(error.message, 500)}); }
  }
}

// What the storyboard writer sees for one video: the brand's brief, this video's angle, and the shared creator if there is one.
export function storyboardBrief(order, video) {
  const b = order.brief, a = video.angle || {}, creator = order.creative?.creator;
  return {product: [b.brand, b.website, b.product].filter(Boolean).join('. '), audience: b.audience, idea: [a.title, a.hook, a.idea].filter(Boolean).join('. '),
    offer: b.offer || '', length: b.length, tone: b.tone, mustSay: b.mustSay, avoid: b.avoid, creatorNotes: b.creatorNotes,
    ...(creator ? {identity: creator.identity, wardrobe: creator.wardrobe, voice: creator.voice} : {})};
}

async function draftStoryboards(ctx) {
  await each(ctx, 'videos', 'queued', {limit: 3}, async v => {
    if (!v.angle) return ctx.db.update('videos', v.id, {lock_until: null});
    const order = await orderOf(ctx, v.order_id);
    const out = await ctx.tools.draftStoryboard(storyboardBrief(order, v));
    await spendRow(ctx, {provider: 'claude', usd: out.cost, order_id: v.order_id, video_id: v.id, note: 'storyboard draft'});
    await ctx.db.update('videos', v.id, {status: 'storyboard', plan: out.plan, attempts: 0, error: null, lock_until: null}, {status: 'queued'});
    ctx.report.drafted++;
  });
}

async function checkStoryboards(ctx) {
  await each(ctx, 'videos', 'storyboard', {limit: 3}, async v => {
    const checks = await ctx.tools.checkStoryboard(v.plan);
    await spendRow(ctx, {provider: 'claude', usd: checks.cost, order_id: v.order_id, video_id: v.id, note: 'storyboard checkers'});
    ctx.report.checked++;
    if (checks.passed) return ctx.db.update('videos', v.id, {status: 'approved', checks, attempts: 0, error: null, lock_until: null}, {status: 'storyboard'});
    if (v.revisions >= ctx.s.maxStoryboardRevisions) {
      const low = checks.results.filter(r => r.score < 85).map(r => `${r.name} ${r.score}`).join(', ');
      return attention(ctx, 'videos', {...v, checks}, `Storyboard still fails after ${v.revisions} revisions: ${low || 'major findings'}`, {checks});
    }
    const out = await ctx.tools.reviseStoryboard(v.plan, checks, '');
    await spendRow(ctx, {provider: 'claude', usd: out.cost, order_id: v.order_id, video_id: v.id, note: 'storyboard revision'});
    await ctx.db.update('videos', v.id, {plan: out.plan, checks, revisions: v.revisions + 1, attempts: 0, error: null, lock_until: null}, {status: 'storyboard'});
    ctx.report.revised++;
  });
}

// A reviewer asked for changes: revise from their note, drop the old shots and clips, and check the new storyboard again.
async function applyChanges(ctx) {
  await each(ctx, 'videos', 'changes', {limit: 2}, async v => {
    const out = await ctx.tools.reviseStoryboard(v.plan, v.checks || {results: []}, v.review_note || '');
    await spendRow(ctx, {provider: 'claude', usd: out.cost, order_id: v.order_id, video_id: v.id, note: 'revision from review'});
    const old = await ctx.db.find('shots', {video_id: v.id});
    const files = [...old.map(x => x.clip_path), v.final_path].filter(Boolean);
    if (files.length) await ctx.tools.storage.remove(files);
    await ctx.db.remove('shots', {video_id: v.id});
    await ctx.db.update('videos', v.id, {status: 'storyboard', plan: out.plan, revisions: 0, final_path: null, final_bytes: null, attempts: 0, error: null, lock_until: null}, {status: 'changes'});
  });
}

async function makeShots(ctx) {
  await each(ctx, 'videos', 'approved', {limit: 4}, async v => {
    const order = await orderOf(ctx, v.order_id);
    const shots = ctx.tools.shotsFromStoryboard({brief: {brand: order.brief.brand}, storyboard: v.plan});
    const byId = new Map(v.plan.shots.map(s => [s.id, s]));
    await ctx.db.remove('shots', {video_id: v.id});
    await ctx.db.insertMany('shots', shots.map((s, i) => {
      const planShot = byId.get(s.shotId) || v.plan.shots[i] || {};
      return {video_id: v.id, idx: i + 1, title: s.title, endpoint: ctx.tools.textToVideo, input: s.input, dialogue: planShot.dialogue || '', start_s: planShot.start ?? 0, duration_s: s.input.duration};
    }));
    await ctx.db.update('videos', v.id, {status: 'rendering', attempts: 0, error: null, lock_until: null}, {status: 'approved'});
    ctx.report.shotsMade += shots.length;
  });
}

const rendering = async ctx => (await ctx.db.find('videos', {status: 'rendering'}, {limit: 50})).map(v => v.id);

async function priceShots(ctx) {
  const videos = await rendering(ctx);
  if (!videos.length) return;
  await each(ctx, 'shots', 'draft', {limit: 6, where: {video_id: videos}}, async shot => {
    const video = await ctx.db.get('videos', shot.video_id), order = await orderOf(ctx, video.order_id);
    const checks = await ctx.tools.runCheckers({title: shot.title, input: shot.input, brief: order.brief.brand});
    await spendRow(ctx, {provider: 'claude', usd: checks.cost, order_id: order.id, video_id: video.id, shot_id: shot.id, note: 'shot checkers'});
    if (!checks.passed) {
      const low = checks.results.filter(r => r.score < 85).map(r => `${r.name} ${r.score}`).join(', ');
      return attention(ctx, 'shots', shot, `Shot checkers did not pass: ${low || 'major findings'}`, {checks});
    }
    const est = await ctx.tools.estimate(shot.endpoint, shot.input);
    if (!(Number(est) > 0)) throw Error('Higgsfield returned no usable price for this shot');
    await ctx.db.update('shots', shot.id, {status: 'priced', checks, estimate_usd: Number(est), attempts: 0, error: null, lock_until: null}, {status: 'draft'});
    ctx.report.priced++;
  });
}

const since24h = ctx => new Date(ctx.now() - DAY).toISOString();
export async function budgetFor(db, order, settings, estimate, now = Date.now()) {
  const [orderSpent, daySpent] = await Promise.all([db.sumUsd({order_id: order.id}), db.sumUsd({at: {gte: new Date(now - DAY).toISOString()}})]);
  const reasons = [];
  if (!settings.autoApproveRenders) reasons.push('auto-approval is off');
  if (orderSpent + estimate > Number(order.budget_usd)) reasons.push(`order budget $${Number(order.budget_usd).toFixed(2)} would be passed ($${orderSpent.toFixed(2)} spent)`);
  if (daySpent + estimate > settings.dailyCapUsd) reasons.push(`daily cap $${settings.dailyCapUsd.toFixed(2)} would be passed ($${daySpent.toFixed(2)} in 24h)`);
  return {ok: !reasons.length, reasons, orderSpent, daySpent};
}

async function submitShots(ctx) {
  const videos = await rendering(ctx);
  if (!videos.length) return;
  await each(ctx, 'shots', 'priced', {limit: 6, where: {video_id: videos}}, async shot => {
    const video = await ctx.db.get('videos', shot.video_id), order = await orderOf(ctx, video.order_id);
    const budget = await budgetFor(ctx.db, order, ctx.s, Number(shot.estimate_usd), ctx.now());
    if (!budget.ok) return attention(ctx, 'shots', shot, `Waiting for your OK to spend $${Number(shot.estimate_usd).toFixed(2)}: ${budget.reasons.join('; ')}`);
    await submitShot(ctx.db, ctx.tools, shot, {order, video, report: ctx.report});
  });
}

// Expiry means operator reconciliation is needed, never that the provider did not charge.
export const SUBMISSION_LEASE_MS = 15 * 60 * 1000;
export function staleSubmission(shot, now = Date.now()) {
  if (shot.status !== 'submitting') return false;
  const expiry = shot.lock_until ? Date.parse(shot.lock_until) : Date.parse(shot.updated_at || shot.created_at) + SUBMISSION_LEASE_MS;
  return Number.isFinite(expiry) && expiry <= now;
}

// The fixed key survives an uncertain outcome. Provider acceptance and ledger state commit together.
export async function submitShot(db, tools, shot, {order, video, report}) {
  requirePaidWork(tools);
  if (!Number.isFinite(Number(shot.estimate_usd)) || Number(shot.estimate_usd) <= 0) throw Object.assign(Error('A finite positive render estimate is required.'), {status:400});
  if (!['priced','attention'].includes(shot.status) || (shot.status === 'attention' && shot.resume_status !== 'priced')) throw Object.assign(Error('This shot is not awaiting submission.'), {status:409});
  const key = shot.submission_key || `mint-shot-${shot.id}`;
  const claimed = await db.update('shots', shot.id, {status:'submitting', submission_key:key, lock_until:new Date(Date.now() + SUBMISSION_LEASE_MS).toISOString()}, {status:shot.status, ...(shot.status === 'attention' ? {resume_status:'priced'} : {})});
  if (!claimed) throw Object.assign(Error('This shot changed. Reload and try again.'), {status:409});
  let requestId;
  try {
    const res = await tools.submit(shot.endpoint, shot.input, key);
    const candidate = res.request_id || res.id;
    if (typeof candidate !== 'string' || !/^[a-zA-Z0-9_.:-]{1,200}$/.test(candidate)) throw Error('Higgsfield did not return a usable request ID');
    requestId = candidate;
    const queued = await db.reconcileRenderSubmission(shot.id, requestId);
    if (report) report.submitted++;
    return queued;
  } catch (error) {
    // If this write also fails, the durable submitting row still becomes manually reconcilable after its lease.
    const moved = await db.update('shots', shot.id, {status:'attention', resume_status:'unknown', ...(requestId ? {request_id:requestId} : {}), error:clip(`Submission needs reconciliation: ${error.message}. Check Higgsfield before retrying.`,500), lock_until:null}, {status:'submitting'});
    if (moved) await event(db, {level:'attention',order_id:order.id,video_id:video.id,shot_id:shot.id,title:`Needs you: shot ${shot.idx} of video ${video.idx}, order ${order.id}. Reconcile the provider request before retrying.`});
    return null;
  }
}

async function pollShots(ctx) {
  for (const status of ['queued', 'in_progress']) {
    await each(ctx, 'shots', status, {limit: 10, lease: 120}, async shot => {
      const s = await ctx.tools.status(shot.request_id);
      ctx.report.polled++;
      if (s.status === 'completed') {
        const url = s.video?.url || s.images?.[0]?.url;
        if (!url) throw Error('Higgsfield finished without a video URL');
        const video = await ctx.db.get('videos', shot.video_id);
        const path = `clips/${video.order_id}/${video.id}/${shot.idx}.mp4`;
        await ctx.tools.storage.put(path, await ctx.tools.fetchFile(url), 'video/mp4');
        return ctx.db.update('shots', shot.id, {status: 'done', clip_path: path, attempts: 0, error: null, lock_until: null}, {status});
      }
      if (['failed', 'nsfw', 'canceled'].includes(s.status)) return attention(ctx, 'shots', shot, `Higgsfield render ${s.status}${s.error ? `: ${s.error}` : ''}`);
      // Still running: release the lease and look again next tick.
      await ctx.db.update('shots', shot.id, {status: ['queued', 'in_progress'].includes(s.status) ? s.status : status, lock_until: null}, {status});
    });
  }
}

async function completeVideos(ctx) {
  for (const id of await rendering(ctx)) {
    const shots = await ctx.db.find('shots', {video_id: id});
    if (shots.length && shots.every(x => x.status === 'done')) await ctx.db.update('videos', id, {status: 'stitching', lock_until: null}, {status: 'rendering'});
  }
}

async function stitchVideos(ctx) {
  await each(ctx, 'videos', 'stitching', {limit: 2}, async v => {
    const shots = (await ctx.db.find('shots', {video_id: v.id})).sort((a, b) => a.idx - b.idx);
    const clips = [];
    for (const shot of shots) clips.push(await ctx.tools.storage.get(shot.clip_path));
    let start = 0;
    const captions = shots.map(x => { const c = {start, end: start + Number(x.duration_s), text: x.dialogue}; start = c.end; return c; }).filter(c => c.text);
    const final = await ctx.tools.stitch(clips, captions);
    const path = `finals/${v.order_id}/video-${v.idx}.mp4`;
    await ctx.tools.storage.put(path, final, 'video/mp4');
    await ctx.tools.storage.remove(shots.map(x => x.clip_path).filter(Boolean));
    await ctx.db.update('videos', v.id, {status: 'review', final_path: path, final_bytes: final.length, attempts: 0, error: null, lock_until: null}, {status: 'stitching'});
    ctx.report.stitched++;
    await event(ctx.db, {order_id: v.order_id, video_id: v.id, title: `Video ${v.idx} of order ${v.order_id} is ready for review`});
    await ctx.notify(`Video ${v.idx} of order ${v.order_id} is ready for review`);
  });
}

async function finishOrders(ctx) {
  for (const order of await ctx.db.find('orders', {status: 'in_production'}, {limit: 50})) {
    const videos = await ctx.db.find('videos', {order_id: order.id});
    if (!videos.length || !videos.every(v => v.status === 'approved_final')) continue;
    const moved = await ctx.db.update('orders', order.id, {status: 'delivered', delivered_at: new Date(ctx.now()).toISOString()}, {status: 'in_production'});
    if (!moved) continue;
    const name = order.buyer_name ? ` ${order.buyer_name.split(' ')[0]}` : '';
    await ctx.db.insert('outbox', {kind: 'delivery', to_email: order.buyer_email, order_id: order.id, subject: 'Your Mint Labs videos are ready',
      body: `Hi${name},\n\nYour ${videos.length} videos are ready to download:\n\n${deliveryUrl(ctx.baseUrl, order)}\n\nThe link keeps working for ${ctx.s.retentionDays} days, so save the files you want to keep. Your package includes one consolidated revision round: reply with notes on any video and we will revise it.\n\nMint Labs`});
    await event(ctx.db, {order_id: order.id, title: `Order ${order.id} delivered (${videos.length} videos)`});
    await ctx.notify(`Order ${order.id} is finished. The delivery email is waiting in the outbox.`);
    ctx.report.delivered++;
  }
}

// Finished videos leave storage after the retention window so the free plan stays under its file limit.
async function cleanup(ctx) {
  const cutoff = new Date(ctx.now() - ctx.s.retentionDays * DAY).toISOString();
  for (const order of await ctx.db.find('orders', {status: 'delivered', delivered_at: {lt: cutoff}}, {limit: 20})) {
    const videos = await ctx.db.find('videos', {order_id: order.id});
    const files = videos.map(v => v.final_path).filter(Boolean);
    if (files.length) await ctx.tools.storage.remove(files);
    for (const v of videos) await ctx.db.update('videos', v.id, {final_path: null});
    await ctx.db.update('orders', order.id, {status: 'closed'}, {status: 'delivered'});
    ctx.report.cleaned++;
  }
}

// Once a day, at or after 13:00 UTC (9 am New York in summer), a short summary goes to the outbox and the alert hook.
export async function digest(ctx, {force = false, preview = false} = {}) {
  const today = new Date(ctx.now()).toISOString().slice(0, 10);
  if (!force && (new Date(ctx.now()).getUTCHours() < 13 || (await ctx.db.find('settings', {key: 'lastDigest'}))[0]?.value === today)) return null;
  const [orders, videos, attentionRows, outbox] = await Promise.all([ctx.db.find('orders'), ctx.db.find('videos'), ctx.db.find('events', {level: 'attention', at: {gte: new Date(ctx.now() - DAY).toISOString()}}), ctx.db.find('outbox', {status: 'pending'})]);
  const daySpend = await ctx.db.sumUsd({at: {gte: new Date(ctx.now() - DAY).toISOString()}});
  const count = (rows, status) => rows.filter(r => r.status === status).length;
  const lines = [
    `Mint Labs daily digest, ${today}`,
    `Orders: ${count(orders, 'awaiting_brief')} waiting for a brief, ${count(orders, 'in_production')} in production, ${orders.filter(o => o.delivered_at && o.delivered_at >= new Date(ctx.now() - DAY).toISOString()).length} delivered in the last day.`,
    `Videos: ${count(videos, 'review')} ready for your review, ${count(videos, 'rendering') + count(videos, 'stitching')} rendering, ${count(videos, 'attention')} need you.`,
    `Shots needing you: ${(await ctx.db.find('shots', {status: 'attention'})).length}. Emails waiting to send: ${outbox.length}.`,
    `Spend in the last 24 hours: $${daySpend.toFixed(2)} (cap $${ctx.s.dailyCapUsd.toFixed(2)}).`,
    ...(ctx.report?.waiting || []),
    ...attentionRows.slice(0, 8).map(e => `- ${e.title}`),
  ];
  const text = lines.join('\n');
  if (preview) return text;
  await ctx.db.upsert('settings', {key: 'lastDigest', value: today});
  if (ctx.s.opsEmail) await ctx.db.insert('outbox', {kind: 'digest', to_email: ctx.s.opsEmail, subject: `Mint Labs digest ${today}`, body: text});
  await ctx.notify(text);
  return text;
}

// ---- Operator actions ----

export async function reviewVideo(db, id, decision, note = '') {
  const v = await db.get('videos', id);
  if (!v || v.status !== 'review') throw Object.assign(Error('Only videos waiting for review can be approved or sent back.'), {status: 409});
  if (decision === 'approve') return db.update('videos', id, {status: 'approved_final', review_note: clip(note, 1000) || null}, {status: 'review'});
  if (!clip(note, 10)) throw Object.assign(Error('Say what to change so the revision can fix it.'), {status: 400});
  return db.update('videos', id, {status: 'changes', review_note: clip(note, 1000)}, {status: 'review'});
}

export async function retryRow(db, table, id) {
  const row = await db.get(table, id);
  if (!row || row.status !== 'attention') throw Object.assign(Error('Only items that need you can be retried.'), {status: 409});
  if (row.resume_status === 'unknown') throw Object.assign(Error('Check Higgsfield first, then reconcile this shot.'), {status: 409});
  return db.update(table, id, {status: row.resume_status || (table === 'videos' ? 'queued' : 'draft'), resume_status: null, attempts: 0, error: null, lock_until: null}, {status: 'attention'});
}

// The operator's spending decision for one shot, whatever the caps say. Only for priced shots that stopped at the budget gate.
export async function approveSpend(db, tools, id) {
  requirePaidWork(tools);
  const shot = await db.get('shots', id);
  if (!shot || shot.status !== 'attention' || shot.resume_status !== 'priced') throw Object.assign(Error('Only shots waiting for a spending OK can be approved.'), {status: 409});
  const video = await db.get('videos', shot.video_id), order = await db.get('orders', video.order_id);
  return submitShot(db, tools, shot, {order, video});
}

// After checking Higgsfield by hand: attach the request ID it shows, or confirm nothing started so the same key is reused.
export async function reconcileShot(db, tools, id, {requestId = null} = {}) {
  const shot = await db.get('shots', id);
  const unknown = shot?.status === 'attention' && shot.resume_status === 'unknown';
  if (!shot || (!unknown && !staleSubmission(shot))) throw Object.assign(Error('Only unknown or stale submissions can be reconciled.'), {status:409});
  if (!requestId && shot.request_id) throw Object.assign(Error('This shot has a saved provider request ID. Verify that request instead of resetting it.'), {status:409});
  if (!requestId) return db.update('shots', id, {status:'priced', resume_status:null, error:null, lock_until:null}, {status:shot.status, ...(unknown ? {resume_status:'unknown'} : {lock_until:shot.lock_until ?? null})});
  if (!/^[\w.:-]{1,200}$/.test(requestId)) throw Object.assign(Error('That does not look like a Higgsfield request ID.'), {status: 400});
  const s = await tools.status(requestId);
  if (typeof s?.status !== 'string') throw Object.assign(Error('Higgsfield did not confirm that request ID.'), {status: 400});
  return db.reconcileRenderSubmission(id, requestId);
}
