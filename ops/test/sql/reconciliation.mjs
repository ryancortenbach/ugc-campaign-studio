import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';import assert from 'node:assert/strict';
const db=await PGlite.create();const checks=[];
try{
await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
await db.exec('create schema storage; create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);');
await db.exec(await readFile(new URL('../../db/001_init.sql',import.meta.url),'utf8'));
const migration=await readFile(new URL('../../db/002_render_reconciliation.sql',import.meta.url),'utf8');await db.exec(migration);
await db.exec("insert into orders(token,package,videos_total,budget_usd) values ('fictional','starter',5,10);insert into videos(order_id,idx) values(1,1);insert into shots(video_id,idx,endpoint,input,status,resume_status,estimate_usd) values(1,1,'fake','{}','attention','unknown',7),(1,2,'fake','{}','attention','unknown',7),(1,3,'fake','{}','attention','unknown',7);");
const call=(id,req)=>db.query('select public.reconcile_render_submission($1,$2) as shot',[id,req]);
await call(1,'request-one');await call(1,'request-one');assert.equal(Number((await db.query('select count(*) as n from spend')).rows[0].n),1);checks.push('repeated same request records one charge');
await assert.rejects(()=>call(1,'different'));assert.equal((await db.query('select request_id from shots where id=1')).rows[0].request_id,'request-one');checks.push('conflicting ID cannot replace winner');
await db.exec("create function reject_queued() returns trigger language plpgsql as $$begin if new.id=2 and new.status='queued' then raise exception 'injected shot write failure'; end if; return new;end;$$;create trigger reject_queued before update on shots for each row execute function reject_queued();");
await assert.rejects(()=>call(2,'request-two'),/injected shot/);assert.equal(Number((await db.query('select count(*) as n from spend where shot_id=2')).rows[0].n),0);assert.equal((await db.query('select status from shots where id=2')).rows[0].status,'attention');checks.push('shot update failure rolls back charge');
await db.exec('insert into spend(provider,usd,order_id,video_id,shot_id) values (\'higgsfield\',7,999,1,3);');await assert.rejects(()=>call(3,'request-three'),/ownership/);assert.equal((await db.query('select status from shots where id=3')).rows[0].status,'attention');checks.push('wrong ledger ownership rejected');
await db.exec("insert into shots(video_id,idx,endpoint,input,status,resume_status,estimate_usd,request_id) values(1,4,'fake','{}','submitting',null,7,null),(1,5,'fake','{}','attention',null,7,null),(1,6,'fake','{}','attention','unknown',7,'saved-id');");
await db.exec('update shots set attempts=2 where id=4');const accepted=(await call(4,'accepted-four')).rows[0].shot;assert.equal(accepted.status,'queued');assert.equal(accepted.attempts,0);checks.push('accepted submitting intent commits ID and charge atomically');
await assert.rejects(()=>call(5,'invalid-resume'),/Only a submitted/);checks.push('null resume status does not bypass unknown-state guard');
await assert.rejects(()=>call(6,'different-id'),/Saved provider/);assert.equal((await db.query('select request_id from shots where id=6')).rows[0].request_id,'saved-id');checks.push('saved provider ID cannot be replaced');
for(const role of ['anon','authenticated'])assert.equal((await db.query("select has_function_privilege($1,'public.reconcile_render_submission(bigint,text)','EXECUTE') as allowed",[role])).rows[0].allowed,false);
assert.equal((await db.query("select has_function_privilege('service_role','public.reconcile_render_submission(bigint,text)','EXECUTE') as allowed")).rows[0].allowed,true);checks.push('function ACL denies public user roles and grants service role');
await db.exec('drop index spend_higgsfield_shot_unique;insert into spend(provider,usd,order_id,video_id,shot_id) values (\'higgsfield\',7,1,1,1);');await assert.rejects(()=>db.exec(migration),/unique/);await db.exec('rollback');assert.equal(Number((await db.query('select count(*) as n from spend where shot_id=1')).rows[0].n),2);checks.push('historical duplicate stops migration without deleting records');
console.log('Passed',checks.length,'actual local PostgreSQL SQL checks');
}finally{await db.close();}
