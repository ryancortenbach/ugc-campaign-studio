// One small table API with two backings: Supabase in production and plain arrays in tests.
// where: {col: value} is equality, {col: [a, b]} is "in", {col: {lt|lte|gt|gte: v}} compares, {col: null} is "is null".
const nowIso = () => new Date().toISOString();
const STAMPED = new Set(['orders', 'videos', 'shots']);
const keyOf = t => (t === 'settings' ? 'key' : t === 'webhook_events' ? 'at' : 'id');
// Column defaults from db/001_init.sql, so the test backing behaves like Postgres.
const DEFAULTS = {orders: {status: 'awaiting_brief'}, videos: {status: 'queued', revisions: 0, attempts: 0}, shots: {status: 'draft', attempts: 0, start_s: 0, duration_s: 5},
  events: {level: 'info'}, outbox: {status: 'pending'}};

function matches(row, where) {
  return Object.entries(where).every(([col, want]) => {
    const have = row[col] ?? null;
    if (want === null) return have === null;
    if (Array.isArray(want)) return want.includes(have);
    if (want && typeof want === 'object') {
      return Object.entries(want).every(([op, v]) => have !== null && (
        op === 'lt' ? have < v : op === 'lte' ? have <= v : op === 'gt' ? have > v : op === 'gte' ? have >= v : false));
    }
    return have === want;
  });
}

export function memoryDb() {
  const tables = {}, ids = {};
  const rows = t => (tables[t] ??= []);
  const copy = r => r && structuredClone(r);
  const db = {
    async insert(t, row) {
      const at = nowIso();
      const r = {...(t === 'settings' || t === 'webhook_events' ? {} : {id: (ids[t] = (ids[t] || 0) + 1)}), ...DEFAULTS[t], ...row};
      if (STAMPED.has(t)) Object.assign(r, {created_at: r.created_at || at, updated_at: at});
      if (['events', 'spend', 'outbox', 'webhook_events'].includes(t)) r.at ??= at;
      if (t === 'webhook_events' && rows(t).some(x => x.id === r.id)) throw Object.assign(Error('duplicate key'), {code: '23505'});
      if (t === 'orders' && r.whop_payment_id && rows(t).some(x => x.whop_payment_id === r.whop_payment_id)) throw Object.assign(Error('duplicate key'), {code: '23505'});
      rows(t).push(r);
      return copy(r);
    },
    async insertMany(t, list) { const out = []; for (const r of list) out.push(await db.insert(t, r)); return out; },
    async get(t, id) { return copy(rows(t).find(r => r.id === id) || null); },
    async find(t, where = {}, {order = keyOf(t), desc = false, limit} = {}) {
      const out = rows(t).filter(r => matches(r, where)).sort((a, b) => (a[order] > b[order] ? 1 : a[order] < b[order] ? -1 : 0) * (desc ? -1 : 1));
      return (limit ? out.slice(0, limit) : out).map(copy);
    },
    // Updates only when every condition in `when` still holds, so two ticks never both move the same row.
    async update(t, id, patch, when = {}) {
      const r = rows(t).find(x => x.id === id);
      if (!r || !matches(r, when)) return null;
      Object.assign(r, patch, STAMPED.has(t) ? {updated_at: nowIso()} : {});
      return copy(r);
    },
    // Takes a lease on a row in the given status. Returns null when another worker holds it.
    async claim(t, id, status, seconds) {
      const r = rows(t).find(x => x.id === id);
      const now = nowIso();
      if (!r || r.status !== status || (r.lock_until && r.lock_until > now)) return null;
      r.lock_until = new Date(Date.now() + seconds * 1000).toISOString();
      return copy(r);
    },
    async upsert(t, row, key = 'key') {
      const r = rows(t).find(x => x[key] === row[key]);
      if (r) { Object.assign(r, row); return copy(r); }
      return db.insert(t, row);
    },
    async remove(t, where) { const keep = rows(t).filter(r => !matches(r, where)); const n = rows(t).length - keep.length; tables[t] = keep; return n; },
    async sumUsd(where = {}) { return rows('spend').filter(r => matches(r, where)).reduce((s, r) => s + Number(r.usd), 0); },
    // No await between validation and writes: model the database transaction atomically.
    async reconcileRenderSubmission(id, requestId) {
      const shot = rows('shots').find(r => r.id === id);
      if (shot?.status === 'queued' && shot.request_id === requestId) return copy(shot);
      if (!shot || shot.status !== 'attention' || shot.resume_status !== 'unknown') throw Object.assign(Error('Only an unknown submission can be reconciled'), {status:409});
      if (!/^[a-zA-Z0-9_.:-]{1,200}$/.test(requestId || '')) throw Error('Invalid provider request ID');
      const estimate = Number(shot.estimate_usd), video = rows('videos').find(r => r.id === shot.video_id);
      if (!Number.isFinite(estimate) || estimate <= 0 || !video) throw Error('A video and finite positive render estimate are required');
      const existing = rows('spend').find(r => r.provider === 'higgsfield' && r.shot_id === id);
      if (existing && (Number(existing.usd) !== estimate || existing.order_id !== video.order_id || existing.video_id !== video.id)) throw Error('Recorded render estimate or ownership differs');
      if (!existing) rows('spend').push({id:(ids.spend = (ids.spend || 0) + 1), at:nowIso(), provider:'higgsfield', usd:estimate, order_id:video.order_id, video_id:video.id, shot_id:id, note:'reconciled render estimate'});
      Object.assign(shot, {status:'queued', request_id:requestId, resume_status:null, error:null, lock_until:null, updated_at:nowIso()});
      return copy(shot);
    },
    async acquireLease(name, seconds) {
      const lease = rows('leases').find(r => r.name === name), now = Date.now();
      if (lease && lease.until > now) return false;
      if (lease) lease.until = now + seconds * 1000; else rows('leases').push({name, until: now + seconds * 1000});
      return true;
    },
    tables,
  };
  return db;
}

export function supabaseDb(client) {
  const apply = (q, where) => {
    for (const [col, want] of Object.entries(where)) {
      if (want === null) q = q.is(col, null);
      else if (Array.isArray(want)) q = q.in(col, want);
      else if (want && typeof want === 'object') for (const [op, v] of Object.entries(want)) q = q[op](col, v);
      else q = q.eq(col, want);
    }
    return q;
  };
  const must = ({data, error}) => { if (error) throw Object.assign(Error(`${error.message}${error.details ? ` (${error.details})` : ''}`), {code: error.code}); return data; };
  const stamp = (t, patch) => (STAMPED.has(t) ? {...patch, updated_at: nowIso()} : patch);
  return {
    async insert(t, row) { return must(await client.from(t).insert(row).select().single()); },
    async insertMany(t, list) { return list.length ? must(await client.from(t).insert(list).select()) : []; },
    async get(t, id) { return must(await client.from(t).select('*').eq('id', id).maybeSingle()); },
    async find(t, where = {}, {order = keyOf(t), desc = false, limit} = {}) {
      let q = apply(client.from(t).select('*'), where).order(order, {ascending: !desc});
      if (limit) q = q.limit(limit);
      return must(await q);
    },
    async update(t, id, patch, when = {}) {
      const data = must(await apply(client.from(t).update(stamp(t, patch)).eq('id', id), when).select());
      return data[0] || null;
    },
    async claim(t, id, status, seconds) {
      const now = nowIso(), until = new Date(Date.now() + seconds * 1000).toISOString();
      const data = must(await client.from(t).update({lock_until: until}).eq('id', id).eq('status', status).or(`lock_until.is.null,lock_until.lt.${now}`).select());
      return data[0] || null;
    },
    async upsert(t, row, key = 'key') { return must(await client.from(t).upsert(row, {onConflict: key}).select().single()); },
    async remove(t, where) { const data = must(await apply(client.from(t).delete(), where).select()); return data.length; },
    async sumUsd(where = {}) { const data = must(await apply(client.from('spend').select('usd'), where)); return data.reduce((s, r) => s + Number(r.usd), 0); },
    async reconcileRenderSubmission(id, requestId) { return must(await client.rpc('reconcile_render_submission', {p_shot_id:id, p_request_id:requestId})); },
    async acquireLease(name, seconds) { return Boolean(must(await client.rpc('acquire_lease', {p_name: name, p_seconds: seconds}))); },
  };
}
