// Local server for the fulfillment app. With SUPABASE_URL and a service key it uses the real database and providers;
// without them it runs a self-contained demo: in-memory data, fake providers, a fictional paid order and a tick every 4 seconds.
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRouter, alertSender} from '../lib/http.mjs';
import {tick, createOrder, loadSettings} from '../lib/pipeline.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const port = Number(process.env.OPS_PORT || 3400);
const env = {...process.env};
const live = Boolean(env.SUPABASE_URL && (env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY));
let db, tools;
if (live) {
  const {createClient} = await import('@supabase/supabase-js');
  const {supabaseDb} = await import('../lib/db.mjs');
  const {realTools, supabaseStorage} = await import('../lib/tools.mjs');
  const client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY, {auth: {persistSession: false}});
  db = supabaseDb(client); tools = realTools({storage: supabaseStorage(client)});
} else {
  const {memoryDb} = await import('../lib/db.mjs');
  const {fakeTools} = await import('../test/helpers.mjs');
  db = memoryDb(); tools = fakeTools();
  Object.assign(env, {OPS_PASSWORD: env.OPS_PASSWORD || 'demo', OPS_SESSION_SECRET: env.OPS_SESSION_SECRET || 'demo-session', CRON_SECRET: env.CRON_SECRET || 'demo-cron', PUBLIC_BASE_URL: `http://localhost:${port}`});
  const order = await createOrder(db, {pkg: 'starter', email: 'buyer@example.test', name: 'Fictional Buyer', note: 'demo'}, {baseUrl: env.PUBLIC_BASE_URL, settings: await loadSettings(db)});
  console.log(`Demo mode. Operator password: ${env.OPS_PASSWORD}. Fictional brief link: ${env.PUBLIC_BASE_URL}/brief/?t=${order.token}`);
  setInterval(() => tick({db, tools, baseUrl: env.PUBLIC_BASE_URL}).catch(e => console.error('tick', e.message)), 4000).unref?.();
}
const handle = createRouter({db, tools, env, notify: alertSender(env.ALERT_WEBHOOK_URL), waitUntil: p => p});
const types = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml'};

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${port}`);
    if (url.pathname.startsWith('/api/')) {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const response = await handle(new Request(url, {method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks)}));
      res.writeHead(response.status, Object.fromEntries(response.headers));
      return res.end(Buffer.from(await response.arrayBuffer()));
    }
    const rel = url.pathname.endsWith('/') ? `${url.pathname}index.html` : url.pathname;
    const file = path.resolve(root, `.${rel}`);
    if (!file.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
    const data = await readFile(file);
    res.writeHead(200, {'content-type': types[path.extname(file)] || 'application/octet-stream'});
    res.end(data);
  } catch { res.writeHead(404, {'content-type': 'text/plain'}); res.end('Not found'); }
}).listen(port, '127.0.0.1', () => console.log(`Mint Labs fulfillment ${live ? 'live' : 'demo'} at http://localhost:${port}`));
