import {storyboardRoot} from './order-storyboard-family.mjs';
import {packageScope} from './order-coverage.mjs';
const fail=(status,message)=>Object.assign(Error(message),{status});
export function createOrderVideoPlan({store,now=()=>new Date()}={}){
 const db=store.db;
 db.exec(`create table if not exists order_video_plans(payment_id text primary key,revision integer not null,plan text not null,updated_at text not null);
 create table if not exists order_video_plan_versions(payment_id text not null,revision integer not null,plan text not null,updated_at text not null,primary key(payment_id,revision));
 create table if not exists order_video_owners(storyboard_root integer primary key,payment_id text not null);`);
 const need=id=>{
  const exists=db.prepare("select name from sqlite_master where type='table' and name='whop_orders'").get();
  const o=exists&&db.prepare('select payment_id,payment,storyboard_id from whop_orders where payment_id=?').get(id);
  if(!o)throw fail(404,'No such Whop order.');return o;
 };
 const row=id=>db.prepare('select * from order_video_plans where payment_id=?').get(id);
 const rootOf=(id,strict=true)=>storyboardRoot(store,id,{strict});
 const wrap=(id,r)=>{
  const o=need(id);let payment=null;try{payment=JSON.parse(o.payment);}catch{}
  return {paymentId:id,revision:r?.revision||0,updatedAt:r?.updated_at||null,
   suggestedScope:packageScope(payment),scopeVerified:false,
   ownershipScope:'saved local references and reservations',unresolvedLegacyOrderCount:db.prepare('select storyboard_id from whop_orders where payment_id<>? and storyboard_id is not null').all(id).filter(o=>rootOf(o.storyboard_id,false)===null).length,
   plan:r?JSON.parse(r.plan):{videoCount:null,scopeNote:'',assignments:o.storyboard_id?[{slot:1,storyboardId:o.storyboard_id}]:[]},
   generated:false,deliveryTracked:false};
 };
 return {
  get(id){return wrap(id,row(id));},
  version(id,revision){need(id);if(!Number.isSafeInteger(revision)||revision<1)throw fail(400,'Invalid revision.');const r=db.prepare('select * from order_video_plan_versions where payment_id=? and revision=?').get(id,revision);if(!r)throw fail(404,'No such saved video plan revision.');return wrap(id,r);},
  save(id,{expectedRevision,videoCount,scopeNote,assignments}={}){
   need(id);
   if(!Number.isSafeInteger(expectedRevision)||expectedRevision<0)throw fail(400,'Provide the current video plan revision.');
   if(!Number.isSafeInteger(videoCount)||videoCount<1||videoCount>50)throw fail(400,'Record a video count from 1 to 50.');
   if(typeof scopeNote!=='string'||!scopeNote.trim()||scopeNote.length>2000)throw fail(400,'Record the source or note for this video count.');
   if(!Array.isArray(assignments)||assignments.length>videoCount)throw fail(400,'Provide at most one assignment per video slot.');
   const slots=new Set(),roots=new Set(),clean=[];
   db.exec('begin immediate');
   try{
    if((row(id)?.revision||0)!==expectedRevision)throw fail(409,'The video plan changed. Reload before saving.');
    for(const a of assignments){
     if(!a||!Number.isSafeInteger(a.slot)||a.slot<1||a.slot>videoCount||!Number.isSafeInteger(a.storyboardId)||a.storyboardId<1||slots.has(a.slot))throw fail(400,'Assignments need unique in-range slots and valid storyboard IDs.');
     const root=rootOf(a.storyboardId);if(roots.has(root))throw fail(409,'Versions of one storyboard cannot count as separate package videos.');
     const owner=db.prepare('select payment_id from order_video_owners where storyboard_root=?').get(root);
     if(owner&&owner.payment_id!==id)throw fail(409,'This storyboard family is already assigned to another order.');
     for(const legacy of db.prepare('select payment_id,storyboard_id from whop_orders where payment_id<>? and storyboard_id is not null').all(id)){
      if(rootOf(legacy.storyboard_id,false)===root)throw fail(409,'This storyboard family belongs to another order.');
     }
     slots.add(a.slot);roots.add(root);clean.push({slot:a.slot,storyboardId:a.storyboardId});
    }
    const plan=JSON.stringify({videoCount,scopeNote:scopeNote.trim(),assignments:clean.sort((a,b)=>a.slot-b.slot)}),revision=expectedRevision+1,at=new Date(now()).toISOString();
    for(const root of roots)db.prepare('insert into order_video_owners(storyboard_root,payment_id) values(?,?) on conflict(storyboard_root) do nothing').run(root,id);
    db.prepare('insert into order_video_plan_versions(payment_id,revision,plan,updated_at) values(?,?,?,?)').run(id,revision,plan,at);
    db.prepare('insert into order_video_plans(payment_id,revision,plan,updated_at) values(?,?,?,?) on conflict(payment_id) do update set revision=excluded.revision,plan=excluded.plan,updated_at=excluded.updated_at').run(id,revision,plan,at);
    db.exec('commit');
   }catch(error){db.exec('rollback');throw error;}
   return wrap(id,row(id));
  }
 };
}
