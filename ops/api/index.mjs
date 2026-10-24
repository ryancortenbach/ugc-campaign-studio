import {createClient} from '@supabase/supabase-js';
import {waitUntil} from '@vercel/functions';
import {supabaseDb} from '../lib/db.mjs';
import {realTools, supabaseStorage} from '../lib/tools.mjs';
import {createRouter, alertSender} from '../lib/http.mjs';

// One Vercel function serves every /api route (vercel.json rewrites them here).
const env = process.env;
let handle;
function router() {
  if (handle) return handle;
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY;
  if (!env.SUPABASE_URL || !key) throw Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are not set');
  const client = createClient(env.SUPABASE_URL, key, {auth: {persistSession: false, autoRefreshToken: false}});
  handle = createRouter({db: supabaseDb(client), tools: realTools({storage: supabaseStorage(client), env}), env, notify: alertSender(env.ALERT_WEBHOOK_URL), waitUntil});
  return handle;
}

export default {
  async fetch(request) {
    try { return await router()(request); }
    catch (error) { console.error(error); return new Response(JSON.stringify({error: error.message}), {status: 503, headers: {'content-type': 'application/json'}}); }
  },
};
