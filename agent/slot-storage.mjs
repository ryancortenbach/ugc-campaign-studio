import {createHash} from 'node:crypto';
import {readFileSync,realpathSync,statSync} from 'node:fs';
import path from 'node:path';
import {dataDir} from './store.mjs';
const fail=(status,message)=>Object.assign(Error(message),{status});
const hash=v=>createHash('sha256').update(v).digest('hex');
export function createSlotStorage({store,finals,transport=null,renderDir=path.join(dataDir,'renders'),now=()=>new Date()}={}){
 const db=store.db,busy=new Map(),configured=()=>typeof transport?.put==='function'&&typeof transport?.find==='function';
 db.exec('create table if not exists slot_storage_objects(payment_id text not null,slot integer not null,version integer not null,sha256 text not null,selection text not null,object_key text not null,state text not null,receipt text,started_at text not null,updated_at text not null,primary key(payment_id,slot,version,sha256))');
 const select=(id,slot)=>{
  const s=finals.get(id,slot),f=s.final;
  if(s.paymentId!==id||s.slot!==slot||s.activeAttempt||!f||f.stale!==false||!Number.isSafeInteger(f.version)||f.version<1||!Number.isSafeInteger(f.bytes)||f.bytes<1||!/^[a-f0-9]{64}$/.test(f.sha256||'')||!s.sourceToken||f.manifest?.slot!==slot||f.manifest.planRevision!==s.planRevision||hash(JSON.stringify(f.manifest))!==s.sourceToken)throw fail(409,'Select a current attached final with no active preparation attempt.');
  const selection=hash(JSON.stringify({id,slot,version:f.version,sha256:f.sha256,bytes:f.bytes,file:f.file,sourceToken:s.sourceToken}));
  const key=`orders/${hash(id)}/slot-${slot}/v${f.version}-${f.sha256}.mp4`;
  return {id,slot,f,selection,key};
 };
 const row=s=>db.prepare('select * from slot_storage_objects where payment_id=? and slot=? and version=? and sha256=?').get(s.id,s.slot,s.f.version,s.f.sha256);
 const receipt=(s,r)=>{if(r?.key!==s.key||r?.sha256!==s.f.sha256||r?.bytes!==s.f.bytes||r?.private!==true)throw fail(409,'Storage did not confirm the exact private object bytes.');return{key:r.key,sha256:r.sha256,bytes:r.bytes,private:true};};
 const remember=(s,r)=>{const proof=receipt(s,r);const changed=db.prepare("update slot_storage_objects set state='stored',receipt=?,updated_at=? where payment_id=? and slot=? and version=? and sha256=? and selection=?").run(JSON.stringify(proof),new Date(now()).toISOString(),s.id,s.slot,s.f.version,s.f.sha256,s.selection);if(!changed.changes)throw fail(409,'Storage selection changed.');};
 const get=(id,slot)=>{
  let s,issue=null;try{s=select(id,slot);}catch(e){issue=e.message;}
  const r=s?row(s):null;
  return {paymentId:id,slot,configured:configured(),selectionToken:s?.selection||null,finalVersion:s?.f.version||null,finalSha256:s?.f.sha256||null,object:r?{key:r.object_key,state:r.state,receipt:r.receipt?JSON.parse(r.receipt):null,startedAt:r.started_at,updatedAt:r.updated_at}:null,issue,providerVerified:false,deliveryReady:false};
 };
 const prepare=(id,slot,{expectedSelectionToken}={})=>{
  if(!configured())throw fail(503,'No storage transport is connected.');
  const s=select(id,slot);if(expectedSelectionToken!==s.selection)throw fail(409,'Final selection changed. Reload before preparing storage.');
  const key=JSON.stringify([id,slot,s.selection]),active=busy.get(key);if(active)return active;
  const promise=(async()=>{
   const old=row(s);
   if(old){
    if(old.selection!==s.selection||old.object_key!==s.key)throw fail(409,'Recorded storage intent does not match this final.');
    const found=await transport.find({key:s.key});if(!found)throw fail(409,'Upload may have been accepted. No new upload will start until the exact object is found.');remember(s,found);
   }else{
    const root=realpathSync(renderDir);if(typeof s.f.file!=='string'||path.isAbsolute(s.f.file))throw fail(409,'Invalid final file path.');
    const file=realpathSync(path.resolve(root,s.f.file)),relative=path.relative(root,file);
    if(!relative||relative==='..'||relative.startsWith(`..${path.sep}`)||path.isAbsolute(relative)||!statSync(file).isFile())throw fail(409,'Final file is outside the render directory.');
    const bytes=readFileSync(file);if(bytes.length!==s.f.bytes||hash(bytes)!==s.f.sha256)throw fail(409,'Final bytes changed.');
    db.exec('begin immediate');
    let claimed;
    try{
     if(select(id,slot).selection!==s.selection)throw fail(409,'Final changed before storage preparation.');
     const at=new Date(now()).toISOString();claimed=db.prepare("insert into slot_storage_objects(payment_id,slot,version,sha256,selection,object_key,state,started_at,updated_at) values(?,?,?,?,?,?,'uploading',?,?) on conflict do nothing").run(id,slot,s.f.version,s.f.sha256,s.selection,s.key,at,at).changes;db.exec('commit');
    }catch(e){db.exec('rollback');throw e;}
    if(!claimed){const found=await transport.find({key:s.key});if(!found)throw fail(409,'Another storage attempt is active or uncertain.');remember(s,found);}
    else try{const r=await transport.put({key:s.key,bytes,sha256:s.f.sha256,private:true,createOnly:true});remember(s,r);}
    catch(e){try{db.prepare("update slot_storage_objects set state='uncertain',updated_at=? where payment_id=? and slot=? and version=? and sha256=? and state='uploading'").run(new Date(now()).toISOString(),id,slot,s.f.version,s.f.sha256);}catch{}throw fail(409,'Upload outcome could not be confirmed. Inspect the recorded intent before retrying.');}
   }
   if(select(id,slot).selection!==s.selection)throw fail(409,'Final changed during storage preparation. Object metadata was preserved, but delivery is not ready.');
   return get(id,slot);
  })().finally(()=>{if(busy.get(key)===promise)busy.delete(key);});busy.set(key,promise);return promise;
 };
 return {get,prepare,history(id,slot){finals.get(id,slot);return db.prepare('select version,sha256,object_key,state,receipt,started_at,updated_at from slot_storage_objects where payment_id=? and slot=? order by version').all(id,slot);}};
}
