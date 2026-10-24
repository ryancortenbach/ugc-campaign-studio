// Applies db/*.sql in order, then (re)schedules the heartbeat: Supabase pg_cron calls the Vercel tick once a minute.
// Needs POSTGRES_URL_NON_POOLING (from the Vercel Supabase integration) or DATABASE_URL. Heartbeat needs TICK_URL and CRON_SECRET.
import postgres from 'postgres';
import {readdirSync, readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const env = process.env;
const url = env.POSTGRES_URL_NON_POOLING || env.DATABASE_URL || env.POSTGRES_URL;
if (!url) { console.error('Set POSTGRES_URL_NON_POOLING or DATABASE_URL.'); process.exit(1); }
const sql = postgres(url, {ssl: 'require', max: 1, onnotice: () => {}});
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'db');
try {
  for (const file of readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) {
    await sql.unsafe(readFileSync(path.join(dir, file), 'utf8'));
    console.log(`applied ${file}`);
  }
  if (env.TICK_URL && env.CRON_SECRET) {
    if (!/^https:\/\/[\w.-]+\/api\/tick$/.test(env.TICK_URL)) throw Error('TICK_URL must look like https://host/api/tick');
    await sql.unsafe('create extension if not exists pg_cron; create extension if not exists pg_net with schema extensions;');
    await sql`select cron.unschedule(jobid) from cron.job where jobname = 'mint-labs-tick'`;
    // format() with %L quotes the URL and secret as literals inside the scheduled command.
    await sql`select cron.schedule('mint-labs-tick', '* * * * *', format(
      'select net.http_post(url := %L, headers := jsonb_build_object(%L, %L, %L, %L), body := %L::jsonb, timeout_milliseconds := 10000)',
      ${env.TICK_URL}::text, 'Authorization', ${`Bearer ${env.CRON_SECRET}`}::text, 'Content-Type', 'application/json', '{}'))`;
    const [job] = await sql`select jobid, schedule, active from cron.job where jobname = 'mint-labs-tick'`;
    console.log(`heartbeat scheduled: job ${job.jobid}, "${job.schedule}", active ${job.active}`);
  } else console.log('TICK_URL or CRON_SECRET not set, so the heartbeat was not scheduled.');
} finally {
  await sql.end();
}
