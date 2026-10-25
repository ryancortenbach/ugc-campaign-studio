import {createHash,randomUUID} from 'node:crypto';
import {copyFileSync,existsSync,mkdirSync,mkdtempSync,readFileSync,realpathSync,rmSync,statSync} from 'node:fs';
import path from 'node:path';
import {dataDir} from './store.mjs';
import {stitch,findFfmpeg,captionFont} from './delivery.mjs';
import {storyboardPlanHash} from './order-storyboard-family.mjs';
import {renderIntentHash} from './render-source-review.mjs';
const fail=(status,message)=>Object.assign(Error(message),{status});
const hash=x=>createHash('sha256').update(x).digest('hex');
const inside=(root,file)=>{const rel=path.relative(root,file);return rel!==''&&!rel.startsWith(`..${path.sep}`)&&rel!=='..'&&!path.isAbsolute(rel);};
export function createOrderVideoFinals({store,coverage,plans,renderDir=path.join(dataDir,'renders'),join=stitch,ffmpeg=()=>findFfmpeg(),font=()=>captionFont(),now=()=>new Date()}={}){
 const db=store.db,busy=new Map();
 db.exec('create table if not exists order_video_finals(id integer primary key,payment_id text not null,slot integer not null,version integer not null,manifest text not null,file text not null,bytes integer not null,sha256 text not null,captions integer not null,at text not null,unique(payment_id,slot,version))');
 db.exec("create table if not exists order_video_final_attempts(attempt_id text primary key,payment_id text not null,slot integer not null,state text not null,source_token text not null,base_version integer not null,manifest text not null,file text not null,bytes integer,sha256 text,captions integer,started_at text not null,updated_at text not null,error text,attached_version integer);create unique index if not exists order_video_final_active on order_video_final_attempts(payment_id,slot) where state in ('preparing','candidate_ready')");
 const activeAttempt=(id,slot)=>db.prepare("select * from order_video_final_attempts where payment_id=? and slot=? and state in ('preparing','candidate_ready')").get(id,slot);
 const attemptToken=r=>hash(JSON.stringify(r));
 const attemptView=r=>r&&({attemptId:r.attempt_id,state:r.state,sourceToken:r.source_token,baseVersion:r.base_version,file:r.file,bytes:r.bytes,sha256:r.sha256,startedAt:r.started_at,updatedAt:r.updated_at,error:r.error,attachedVersion:r.attached_version,expectedAttemptToken:attemptToken(r)});
 const readAttempt=(id,slot,attemptId)=>db.prepare('select * from order_video_final_attempts where payment_id=? and slot=? and attempt_id=?').get(id,slot,attemptId);
 const latest=(id,slot)=>db.prepare('select * from order_video_finals where payment_id=? and slot=? order by version desc limit 1').get(id,slot);
 const local=f=>{
  if(typeof f!=='string'||!f||path.isAbsolute(f))throw fail(409,'A source file path is invalid.');
  const root=realpathSync(renderDir),file=realpathSync(path.resolve(root,f));
  if(!inside(root,file)||!statSync(file).isFile())throw fail(409,'A source file is outside the render directory or is not a regular file.');
  return file;
 };
 const source=(id,slot)=>{
  if(!Number.isSafeInteger(slot)||slot<1||slot>50)throw fail(400,'Invalid video slot.');
  const p=plans.get(id);if(p.revision<1)throw fail(409,'Save an explicit video plan first.');
  const c=typeof coverage.base==='function'?coverage.base(id):coverage.get(id),v=c.videos?.find(v=>v.slot===slot);
  if(c.planInvalid||!v?.mapped)throw fail(409,'This slot has no valid, uniquely owned storyboard assignment.');
  const board=store.getStoryboard(v.storyboardId),shots=board?.plan?.shots,planHash=storyboardPlanHash(board?.plan);
  if(!Array.isArray(shots)||!shots.length||shots.length>12||shots.some(s=>!s||typeof s!=='object'||Array.isArray(s)))throw fail(409,'This storyboard needs one to twelve valid shots.');
  const ids=shots.map((s,i)=>String(s.id||`shot-${i+1}`));if(new Set(ids).size!==ids.length)throw fail(409,'Storyboard shot IDs must be unique.');
  const all=store.listRenders().sort((a,b)=>b.id-a.id);
  const selected=ids.map(shotId=>{
   const usable=all.filter(r=>r.storyboard_id===board.id&&r.storyboard_plan_hash===planHash&&String(r.shot_id)===shotId&&r.status==='completed'&&r.review!=='rejected'&&!(r.plan?.type==='product_clip'&&r.plan.step!=='video')&&r.local_file);
   const ordered=[...usable.filter(r=>r.review==='approved'),...usable.filter(r=>r.review!=='approved')];
   for(const r of ordered){try{const file=local(r.local_file);return{render:r,file,sha256:hash(readFileSync(file))};}catch{}}
   throw fail(409,`No completed source-bound clip is available for shot ${shotId}.`);
  });
  const manifest={planRevision:p.revision,slot,storyboardId:board.id,storyboardHash:planHash,sources:selected.map(s=>({renderId:s.render.id,shotId:s.render.shot_id,intentHash:renderIntentHash(s.render),review:s.render.review,file:s.render.local_file,sha256:s.sha256}))};
  return {manifest,sourceToken:hash(JSON.stringify(manifest)),selected,captions:shots.map(s=>String(s.dialogue||''))};
 };
 const finalView=r=>r&&({version:r.version,url:`/renders/${r.file}`,file:r.file,bytes:r.bytes,sha256:r.sha256,captions:Boolean(r.captions),at:r.at,manifest:JSON.parse(r.manifest)});
 const get=(id,slot)=>{
  plans.get(id);if(!Number.isSafeInteger(slot)||slot<1||slot>50)throw fail(400,'Invalid video slot.');
  const r=latest(id,slot);let s,error=null;try{s=source(id,slot);}catch(e){error=e.message;}
  let current=false;if(r&&s)try{current=hash(r.manifest)===s.sourceToken&&hash(readFileSync(local(r.file)))===r.sha256;}catch{}
  const unresolved=activeAttempt(id,slot);
  return {paymentId:id,slot,activeAttempt:attemptView(unresolved)||null,sourceToken:s?.sourceToken||null,planRevision:s?.manifest.planRevision||null,expectedFinalVersion:r?.version||0,canPrepare:Boolean(s&&ffmpeg()&&!unresolved),issue:error||(unresolved?'An active or uncertain preparation attempt blocks new work.':null),final:r?{...finalView(r),stale:!current}:null,providerCalls:false,deliveryTracked:false};
 };
 const attach=r=>{
  if(!['candidate_ready','failed'].includes(r.state)||!r.sha256||!r.bytes)throw fail(409,'No completed candidate metadata is recorded. Partial files cannot be attached.');
  const other=activeAttempt(r.payment_id,r.slot);if(other&&other.attempt_id!==r.attempt_id)throw fail(409,'Another preparation attempt is active for this slot.');
  const fresh=source(r.payment_id,r.slot);
  if(hash(r.manifest)!==r.source_token||fresh.sourceToken!==r.source_token||(latest(r.payment_id,r.slot)?.version||0)!==r.base_version)throw fail(409,'The plan, clips or final version changed. Candidate bytes were preserved but not attached.');
  const file=local(r.file);if(statSync(file).size!==r.bytes||hash(readFileSync(file))!==r.sha256)throw fail(409,'Candidate bytes are missing or changed.');
  const version=r.base_version+1;
  db.prepare('insert into order_video_finals(payment_id,slot,version,manifest,file,bytes,sha256,captions,at) values(?,?,?,?,?,?,?,?,?)').run(r.payment_id,r.slot,version,r.manifest,r.file,r.bytes,r.sha256,r.captions,new Date(now()).toISOString());
  db.prepare("update order_video_final_attempts set state='attached',attached_version=?,updated_at=?,error=null where attempt_id=?").run(version,new Date(now()).toISOString(),r.attempt_id);
 };
 const finish=(id,slot,{expectedSourceToken,expectedFinalVersion}={})=>{
  const s=source(id,slot),base=latest(id,slot)?.version||0;
  if(expectedSourceToken!==s.sourceToken||expectedFinalVersion!==base)throw fail(409,'The video source or final version changed. Reload before preparing.');
  if(!ffmpeg())throw fail(503,'Local ffmpeg is unavailable.');
  const key=JSON.stringify([id,slot]),active=busy.get(key);if(active){if(active.token===s.sourceToken&&active.version===base)return active.promise;throw fail(409,'Another final preparation is active for this slot.');}
  const entry={token:s.sourceToken,version:base,promise:null};
  entry.promise=(async()=>{
   const root=realpathSync(renderDir),outDir=path.join(root,'package-finals');mkdirSync(outDir,{recursive:true});if(!inside(root,realpathSync(outDir)))throw fail(409,'Final directory is outside the render directory.');
   const attemptId=randomUUID(),file=`package-finals/${String(id).replace(/[^A-Za-z0-9_-]/g,'_')}-slot${slot}-${attemptId}.mp4`,out=path.join(root,file);
   db.exec('begin immediate');
   try{
    if(activeAttempt(id,slot))throw fail(409,'An active or uncertain preparation attempt blocks this slot. Inspect it before retrying.');
    if(source(id,slot).sourceToken!==s.sourceToken||(latest(id,slot)?.version||0)!==base)throw fail(409,'Source or final version changed before preparation.');
    const at=new Date(now()).toISOString();db.prepare("insert into order_video_final_attempts(attempt_id,payment_id,slot,state,source_token,base_version,manifest,file,started_at,updated_at) values(?,?,?,'preparing',?,?,?,?,?,?)").run(attemptId,id,slot,s.sourceToken,base,JSON.stringify(s.manifest),file,at,at);
    db.exec('commit');
   }catch(e){db.exec('rollback');throw e;}
   let stage;
   try{
    stage=mkdtempSync(path.join(root,'.package-stage-'));
    const clips=s.selected.map((v,i)=>{const dest=path.join(stage,`${i}.mp4`);copyFileSync(v.file,dest);if(hash(readFileSync(dest))!==v.sha256)throw fail(409,'A source clip changed while being captured.');return dest;});
    const result=await join({clips,captions:s.captions,out,ffmpeg:ffmpeg(),font:font()});
    if(!existsSync(out)||!statSync(out).isFile()||!statSync(out).size)throw fail(502,'Final preparation produced no video file.');
    const bytes=statSync(out).size,sha256=hash(readFileSync(out));
    const moved=db.prepare("update order_video_final_attempts set state='candidate_ready',bytes=?,sha256=?,captions=?,updated_at=? where attempt_id=? and state='preparing'").run(bytes,sha256,result?.captions?1:0,new Date(now()).toISOString(),attemptId);
    if(!moved.changes)throw fail(409,'The preparation attempt changed. Candidate bytes were preserved.');
    db.exec('begin immediate');
    try{attach(readAttempt(id,slot,attemptId));db.exec('commit');}catch(e){db.exec('rollback');throw e;}
    return get(id,slot);
   }catch(e){
    try{db.prepare("update order_video_final_attempts set state='failed',error=?,updated_at=? where attempt_id=? and state in ('preparing','candidate_ready')").run(String(e.message).slice(0,2000),new Date(now()).toISOString(),attemptId);}catch{}
    throw e;
   }finally{if(stage)rmSync(stage,{recursive:true,force:true});}
  })().finally(()=>{if(busy.get(key)===entry)busy.delete(key);});busy.set(key,entry);return entry.promise;
 };
 const attempts=(id,slot)=>{get(id,slot);return db.prepare('select * from order_video_final_attempts where payment_id=? and slot=? order by started_at,attempt_id').all(id,slot).map(attemptView);};
 const reconcile=(id,slot,{attemptId,expectedAttemptToken,confirmWorkerStopped,action}={})=>{
  get(id,slot);if(confirmWorkerStopped!==true||!['attach','abandon'].includes(action))throw fail(400,'Confirm the worker is stopped and choose attach or abandon.');
  db.exec('begin immediate');
  try{
   const r=readAttempt(id,slot,attemptId);
   if(!r||attemptToken(r)!==expectedAttemptToken||!['preparing','candidate_ready','failed'].includes(r.state))throw fail(409,'Attempt state changed. Reload before recovery.');
   if(action==='attach')attach(r);
   else db.prepare("update order_video_final_attempts set state='abandoned',updated_at=? where attempt_id=?").run(new Date(now()).toISOString(),attemptId);
   db.exec('commit');
  }catch(e){db.exec('rollback');throw e;}
  return get(id,slot);
 };
 return {get,finish,attempts,reconcile,history(id,slot){plans.get(id);if(!Number.isSafeInteger(slot)||slot<1||slot>50)throw fail(400,'Invalid video slot.');return db.prepare('select * from order_video_finals where payment_id=? and slot=? order by version').all(id,slot).map(finalView);}};
}
