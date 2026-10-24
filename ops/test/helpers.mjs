import {memoryDb} from '../lib/db.mjs';
import {createRouter, sessionCookie} from '../lib/http.mjs';
import {signWhop} from '../lib/whop.mjs';
import {tick} from '../lib/pipeline.mjs';

export const ENV = {WHOP_WEBHOOK_SECRET: 'ws_fictional_test_secret', CRON_SECRET: 'fictional-cron', OPS_PASSWORD: 'fictional-password', OPS_SESSION_SECRET: 'fictional-session', PUBLIC_BASE_URL: 'https://ops.test'};
export const STARTER = 'plan_lW3DqSYybecYj', CAMPAIGN = 'plan_GohcF3fkgSBnb', SOFTWARE = 'plan_AL0RpmiF6YraX';

export const plan = (title = 'Fictional storyboard') => ({title, identity: 'Fictional creator, late 20s', wardrobe: 'Plain grey tee', environment: 'Bright kitchen', voice: 'Warm, quick',
  creativeDirection: 'Handheld UGC', offer: 'Fictional offer', constraints: 'No claims', durationSeconds: 10,
  shots: [{id: 'shot-01', start: 0, duration: 5, camera: 'Medium close-up', action: 'Holds the product up', dialogue: 'This is the one I keep reaching for.', audio: 'Room tone'},
    {id: 'shot-02', start: 5, duration: 5, camera: 'Close-up', action: 'Smiles at camera', dialogue: '', audio: 'Room tone'}]});

// Fake providers with call counters. Nothing here touches a network or spends money.
export function fakeTools(over = {}) {
  const files = new Map(), calls = {angles: 0, draft: 0, check: 0, revise: 0, shotChecks: 0, estimate: 0, submit: 0, status: 0, stitch: 0};
  return {
    ready: () => ({llm: true, higgsfield: true}),
    angles: async (brief, n) => { calls.angles++; return {angles: Array.from({length: n}, (_, i) => ({title: `Angle ${i + 1}`, hook: 'Fictional hook', idea: 'Fictional idea'})), creator: {identity: 'Fictional', wardrobe: 'Tee', voice: 'Warm'}, cost: 0.01}; },
    draftStoryboard: async () => { calls.draft++; return {plan: plan(), cost: 0.02}; },
    checkStoryboard: async () => { calls.check++; return {passed: true, results: [{name: 'Audience fit', score: 92, issues: []}], cost: 0.01}; },
    reviseStoryboard: async (p, checks, note) => { calls.revise++; return {plan: {...p, title: `${p.title} (revised${note ? `: ${note}` : ''})`}, cost: 0.02}; },
    shotsFromStoryboard: packet => packet.storyboard.shots.map((s, i) => ({group: packet.brief.brand, shotId: s.id, title: `${s.id}: ${s.camera}`, input: {prompt: `Fictional prompt ${i + 1}`, duration: s.duration, resolution: '720p'}})),
    textToVideo: 'fictional/text-to-video',
    runCheckers: async () => { calls.shotChecks++; return {passed: true, results: [], cost: 0.005}; },
    estimate: async () => { calls.estimate++; return '1.75'; },
    submit: async (endpoint, input, key) => { calls.submit++; return {request_id: `req-${key}`, status: 'queued'}; },
    status: async id => { calls.status++; return {status: 'completed', video: {url: `https://renders.test/${id}.mp4`}}; },
    fetchFile: async url => Buffer.from(`clip ${url}`),
    stitch: async (clips, captions) => { calls.stitch++; return Buffer.from(`final of ${clips.length} clips, ${captions.length} captions`); },
    storage: {
      put: async (p, b) => { files.set(p, b); return p; },
      get: async p => { if (!files.has(p)) throw Error(`missing file ${p}`); return files.get(p); },
      remove: async paths => { for (const p of paths) files.delete(p); },
      signedUrl: async (p, s, d) => `https://signed.test/${p}${d ? `?download=${d}` : ''}`,
      ping: async () => true,
    },
    files, calls, ...over,
  };
}

export function harness(over = {}) {
  const db = memoryDb(), tools = fakeTools(over.tools), alerts = [];
  const env = {...ENV, ...over.env};
  const handle = createRouter({db, tools, env, notify: async t => { alerts.push(t); }, waitUntil: p => p});
  const cookie = `ops_session=${sessionCookie(env.OPS_SESSION_SECRET)}`;
  const call = async (method, path, body, headers = {}) => {
    const res = await handle(new Request(`https://ops.test${path}`, {method, headers: {'content-type': 'application/json', ...headers}, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body)}));
    return {status: res.status, body: await res.json(), headers: res.headers};
  };
  const op = (method, path, body) => call(method, path, body, {cookie});
  const whop = async (data, {type = 'payment.succeeded', id = `msg_${Math.random().toString(36).slice(2)}`} = {}) => {
    const raw = JSON.stringify({id, type, api_version: 'v1', data});
    return call('POST', '/api/whop', raw, signWhop(raw, env.WHOP_WEBHOOK_SECRET, id));
  };
  // Ticks until no order, video or shot row changes for two ticks in a row.
  const settle = async (max = 60) => {
    let last = '', same = 0;
    for (let i = 0; i < max; i++) {
      await tick({db, tools, baseUrl: env.PUBLIC_BASE_URL, notify: async t => { alerts.push(t); }});
      const fp = JSON.stringify(await Promise.all(['orders', 'videos', 'shots'].map(async t => (await db.find(t)).map(r => [r.status, r.updated_at, r.revisions, r.attempts, r.error, r.resume_status]))));
      if (fp === last) { if (++same >= 2) return i + 1; } else { same = 0; last = fp; }
    }
    throw Error('pipeline did not settle');
  };
  const run = async (times = 1) => { const reports = []; for (let i = 0; i < times; i++) reports.push(await tick({db, tools, baseUrl: env.PUBLIC_BASE_URL, notify: async t => { alerts.push(t); }})); return reports; };
  return {db, tools, alerts, env, call, op, whop, run, settle};
}

export const payment = (planId = STARTER, extra = {}) => ({id: `pay_${Math.random().toString(36).slice(2, 10)}`, plan: {id: planId}, user: {email: 'Buyer@Example.test', name: 'Fictional Buyer'}, membership: {id: 'mem_fictional', status: 'active'}, total: 500, ...extra});
export const BRIEF = {brand: 'Fictional Roasters', website: 'https://fictional.test', product: 'Single origin beans', audience: 'Home baristas', offer: 'Shop the new roast', tone: 'Friendly', length: 15};
