// Ephemeral CI PostgreSQL only. Never reads the app's database configuration.
import postgres from 'postgres';import{readFile}from'node:fs/promises';import assert from'node:assert/strict';
const target=new URL(process.env.OPS_TEST_DATABASE_URL||'http://invalid');
if(!['127.0.0.1','localhost'].includes(target.hostname)||target.pathname!=='/mint_ops_ci'||!['postgres:','postgresql:'].includes(target.protocol))throw Error('An isolated loopback mint_ops_ci database is required');
const sql=postgres(target.href,{max:3,connect_timeout:5});let a,b;
try{
assert.equal((await sql`select current_database() as db`)[0].db,'mint_ops_ci');
await sql.unsafe('create role anon;create role authenticated;create role service_role bypassrls;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint);');
const migration=await sql.reserve();try{for(const name of['001_init.sql','002_render_reconciliation.sql','003_render_reservations.sql'])await migration.unsafe(await readFile(new URL('../../db/'+name,import.meta.url),'utf8'));}finally{await migration.release();}
a=await sql.reserve();b=await sql.reserve();await a.unsafe("set statement_timeout='10s'");await b.unsafe("set statement_timeout='10s'");
assert.notEqual((await a`select pg_backend_pid() as pid`)[0].pid,(await b`select pg_backend_pid() as pid`)[0].pid);
await a.unsafe('begin');await a`select pg_advisory_xact_lock(1296647252,1)`;assert.equal((await b`select pg_try_advisory_xact_lock(1296647252,1) as got`)[0].got,false);await a.unsafe('rollback');
async function setup(){await sql.unsafe("truncate orders,videos,shots,spend,render_reservations restart identity cascade;delete from settings;insert into settings(key,value) values('dailyCapUsd','10');insert into orders(token,package,videos_total,budget_usd,status) values('fictional','starter',5,10,'in_production');insert into videos(order_id,idx,status) values(1,1,'rendering');insert into shots(video_id,idx,endpoint,input,status,estimate_usd) values(1,1,'fake','{}','priced',7),(1,2,'fake','{}','priced',7);");}
async function assertRPCWaits(work){
 const pid=(await b`select pg_backend_pid() as pid`)[0].pid;
 await a.unsafe('begin');await a`select pg_advisory_xact_lock(1296647252,1)`;
 let done=false;const pending=work().then(rows=>{done=true;return{rows};},error=>{done=true;return{error};});let waiting=false;
 try{const end=Date.now()+5000;while(Date.now()<end&&!done){const row=(await sql`select wait_event_type,wait_event from pg_stat_activity where pid=${pid}`)[0];if(row?.wait_event_type==='Lock'&&row?.wait_event?.toLowerCase()==='advisory'){waiting=true;break;}await new Promise(resolve=>setTimeout(resolve,10));}assert.equal(waiting,true,'RPC must wait for the held advisory lock');}finally{await a.unsafe('rollback');}
 const result=await pending;if(result.error)throw result.error;return result.rows;
}
await setup();assert.equal((await assertRPCWaits(()=>b`select reserve_render_submission(1,false) as r`))[0].r.ok,true);
assert.equal((await assertRPCWaits(()=>b`select record_accepted_render(1,'accepted') as r`))[0].r.status,'queued');
for(let i=0;i<10;i++){
 await setup();const results=await Promise.all([a`select reserve_render_submission(1,false) as r`,b`select reserve_render_submission(2,false) as r`]);assert.equal(results.filter(rows=>rows[0].r.ok).length,1);assert.equal(Number((await sql`select sum(amount) as usd from render_reservations where state='held'`)[0].usd),7);
 await setup();await a`select reserve_render_submission(1,false)`;
 const operations=[()=>a`select record_accepted_render(1,'accepted') as r`,()=>b`select reserve_render_submission(2,false) as r`];if(i%2)operations.reverse();const out=await Promise.all(operations.map(fn=>fn()));const admission=out.find(rows=>typeof rows[0].r?.ok==='boolean');assert.equal(admission[0].r.ok,false);assert.equal(Number((await sql`select sum(usd) as usd from spend`)[0].usd),7);assert.equal((await sql`select state from render_reservations where shot_id=1`)[0].state,'recorded');
}
console.log('Passed deterministic RPC lock waits on independent connections, ten concurrent admission races and ten reservation-to-ledger races on isolated PostgreSQL');
}finally{
await Promise.allSettled([a?.unsafe('rollback'),b?.unsafe('rollback')]);await a?.release();await b?.release();await sql.end({timeout:5});
}
