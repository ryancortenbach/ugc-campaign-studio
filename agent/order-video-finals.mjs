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
  const c=coverage.get(id),v=c.videos?.find(v=>v.slot===slot);
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
  return {paymentId:id,slot,sourceToken:s?.sourceToken||null,planRevision:s?.manifest.planRevision||null,expectedFinalVersion:r?.version||0,canPrepare:Boolean(s&&ffmpeg()),issue:error,final:r?{...finalView(r),stale:!current}:null,providerCalls:false,deliveryTracked:false};
 };
 const finish=(id,slot,{expectedSourceToken,expectedFinalVersion}={})=>{
  const s=source(id,slot),base=latest(id,slot)?.version||0;
  if(expectedSourceToken!==s.sourceToken||expectedFinalVersion!==base)throw fail(409,'The video source or final version changed. Reload before preparing.');
  if(!ffmpeg())throw fail(503,'Local ffmpeg is unavailable.');
  const key=JSON.stringify([id,slot]),active=busy.get(key);if(active){if(active.token===s.sourceToken&&active.version===base)return active.promise;throw fail(409,'Another final preparation is active for this slot.');}
  const entry={token:s.sourceToken,version:base,promise:null};
  entry.promise=(async()=>{
   const root=realpathSync(renderDir),outDir=path.join(root,'package-finals');mkdirSync(outDir,{recursive:true});if(!inside(root,realpathSync(outDir)))throw fail(409,'Final directory is outside the render directory.');
   const file=`package-finals/${String(id).replace(/[^A-Za-z0-9_-]/g,'_')}-slot${slot}-${randomUUID()}.mp4`,out=path.join(root,file),stage=mkdtempSync(path.join(root,'.package-stage-'));
   try{
    const clips=s.selected.map((v,i)=>{const dest=path.join(stage,`${i}.mp4`);copyFileSync(v.file,dest);if(hash(readFileSync(dest))!==v.sha256)throw fail(409,'A source clip changed while being captured.');return dest;});
    const result=await join({clips,captions:s.captions,out,ffmpeg:ffmpeg(),font:font()});
    if(!existsSync(out)||!statSync(out).isFile()||!statSync(out).size)throw fail(502,'Final preparation produced no video file.');
    const bytes=statSync(out).size,sha256=hash(readFileSync(out));
    db.exec('begin immediate');
    try{
     const fresh=source(id,slot);if(fresh.sourceToken!==s.sourceToken||(latest(id,slot)?.version||0)!==base)throw fail(409,'The plan, clips or final version changed during preparation. Candidate bytes were preserved but not attached.');
     db.prepare('insert into order_video_finals(payment_id,slot,version,manifest,file,bytes,sha256,captions,at) values(?,?,?,?,?,?,?,?,?)').run(id,slot,base+1,JSON.stringify(s.manifest),file,bytes,sha256,result?.captions?1:0,new Date(now()).toISOString());
     db.exec('commit');
    }catch(e){db.exec('rollback');throw e;}
    return get(id,slot);
   }finally{rmSync(stage,{recursive:true,force:true});}
  })().finally(()=>{if(busy.get(key)===entry)busy.delete(key);});busy.set(key,entry);return entry.promise;
 };
 return {get,finish,history(id,slot){plans.get(id);if(!Number.isSafeInteger(slot)||slot<1||slot>50)throw fail(400,'Invalid video slot.');return db.prepare('select * from order_video_finals where payment_id=? and slot=? order by version').all(id,slot).map(finalView);}};
}
