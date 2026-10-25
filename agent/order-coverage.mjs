import {createHash} from 'node:crypto';
import {storyboardRoot} from './order-storyboard-family.mjs';
// Read-only coverage of the current one-storyboard order flow. No provider, storage or message mutations.
// Offer identifiers come from docs/WHOP-UGC-OFFERS-v1.md, observed October 24, 2026.
const PRODUCT='prod_mCfHRZ6syNgqb';
const PACKAGES=Object.freeze({
 plan_lW3DqSYybecYj:{name:'UGC Starter',videos:5},
 plan_GohcF3fkgSBnb:{name:'UGC Campaign',videos:12}
});
export function packageScope(payment){
 const known=typeof payment?.planId==='string'&&Object.hasOwn(PACKAGES,payment.planId)?PACKAGES[payment.planId]:null;
 if(!known||payment.productId&&payment.productId!==PRODUCT)return null;
 return {...known,status:'listed_package_snapshot',agreedScopeVerified:false,planId:payment.planId,source:'docs/WHOP-UGC-OFFERS-v1.md',observedAt:'2026-10-24',durationSeconds:{min:15,max:30},consolidatedRevisionRounds:1};
}
export function auditOrderCoverage({payment,storyboardId,storyboardExists=false,delivery,now=Date.now()}={}){
 const scope=packageScope(payment),eligible=payment?.paid===true&&payment?.refunded!==true;
 // Shot count is deliberately never a video count. A joined final belongs to this one storyboard.
 const mapped=Boolean(storyboardId&&storyboardExists),finalCurrent=Boolean(mapped&&delivery?.final&&delivery.final.stale===false);
 const finalBuilt=Boolean(mapped&&delivery?.final);
 const expiry=Date.parse(delivery?.delivery?.expiresAt),linkUnexpired=Number.isFinite(expiry)&&Number.isFinite(now)&&expiry>now;
 const linkCurrent=Boolean(finalCurrent&&delivery?.delivery&&delivery.delivery.stale===false&&linkUnexpired);
 const remaining=scope?scope.videos-(mapped?1:0):null;
 const blockers=[];
 if(!eligible)blockers.push('payment_snapshot_ineligible');
 if(!scope)blockers.push('package_scope_unknown');
 if(!mapped)blockers.push('storyboard_missing');
 if(remaining>0)blockers.push('remaining_videos_unmapped');
 if(!finalBuilt)blockers.push('current_video_final_missing');
 else if(!finalCurrent)blockers.push('current_video_final_stale');
 return {schemaVersion:1,scope,paymentSnapshotEligible:eligible,paymentCurrentVerified:false,workflow:'one_storyboard_per_order',
  counts:{expectedVideos:scope?.videos??null,mappedVideos:mapped?1:0,currentFinals:finalCurrent?1:0,unmappedVideos:remaining},
  currentVideo:{storyboardId:mapped?storyboardId:null,finalBuilt,finalCurrent,linkCurrent,linkUnexpired,draftLinked:Boolean(linkCurrent&&!delivery.draftRecovery&&delivery.delivery.draftUrl),draftRecoveryPending:Boolean(delivery?.draftRecovery)},
  readyToPreparePackage:false,packageDelivered:null,deliveryConfirmed:false,
  deliveryEvidence:'not_tracked',blockers,
  note:'Plan size and payment eligibility are saved snapshots, not verified current payment or agreed contract scope. The existing flow covers at most one video. Additional package videos need explicit separate storyboard and final assignments. A download link or Gmail draft is not proof of buyer delivery.'};
}
function plannedCoverage(base,{store,id,row,delivery}){
 const {currentVideo,...rest}=base;const shared={...rest,legacyVideo:currentVideo};
 let plan;try{plan=JSON.parse(row.plan);}catch{}
 const valid=plan&&Number.isSafeInteger(plan.videoCount)&&plan.videoCount>=1&&plan.videoCount<=50&&typeof plan.scopeNote==='string'&&plan.scopeNote.trim()&&Array.isArray(plan.assignments)&&plan.assignments.length<=plan.videoCount;
 if(!valid)return {...shared,scope:null,listedScope:base.scope,workflow:'saved_video_plan',planRevision:row.revision,planInvalid:true,counts:{expectedVideos:null,mappedVideos:0,currentFinals:0,unmappedVideos:null},videos:[],blockers:[...base.blockers,'saved_video_plan_invalid']};
 const hasOwners=store.db.prepare("select name from sqlite_master where type='table' and name='order_video_owners'").get();
 const candidates=plan.assignments.map(a=>{
  const issues=[];
  if(!Number.isSafeInteger(a?.slot)||a.slot<1||a.slot>plan.videoCount||!Number.isSafeInteger(a?.storyboardId)||a.storyboardId<1)issues.push('invalid_assignment');
  const root=issues.length?null:storyboardRoot(store,a.storyboardId,{strict:false});
  if(!issues.length&&!root)issues.push('storyboard_ancestry_unresolved');
  const owner=root&&hasOwners?store.db.prepare('select payment_id from order_video_owners where storyboard_root=?').get(root):null;
  if(root&&owner?.payment_id!==id)issues.push('storyboard_ownership_unconfirmed');
  return {slot:a?.slot??null,storyboardId:a?.storyboardId??null,root,issues};
 });
 const others=store.db.prepare('select storyboard_id from whop_orders where payment_id<>? and storyboard_id is not null').all(id).map(o=>storyboardRoot(store,o.storyboard_id,{strict:false})).filter(Boolean);
 for(const c of candidates){
  if(candidates.filter(a=>a.slot===c.slot).length>1)c.issues.push('duplicate_slot');
  if(c.root&&candidates.filter(a=>a.root===c.root).length>1)c.issues.push('duplicate_storyboard_family');
  if(c.root&&others.includes(c.root))c.issues.push('storyboard_belongs_to_other_order');
 }
 const videos=candidates.map(c=>({slot:c.slot,storyboardId:c.storyboardId,mapped:c.issues.length===0,
  finalCurrent:c.issues.length===0&&delivery?.final?.stale===false&&delivery.final.storyboardId===c.storyboardId,
  issues:c.issues}));
 const mapped=videos.filter(v=>v.mapped).length,finals=videos.filter(v=>v.finalCurrent).length;
 const blockers=base.blockers.filter(b=>!['package_scope_unknown','storyboard_missing','remaining_videos_unmapped','current_video_final_missing','current_video_final_stale'].includes(b));
 if(mapped<plan.videoCount)blockers.push('remaining_videos_unmapped');
 if(videos.some(v=>v.issues.length))blockers.push('invalid_video_assignments');
 if(finals<plan.videoCount)blockers.push('per_video_finals_incomplete');
 if(delivery?.final&&!delivery.final.storyboardId)blockers.push('legacy_final_storyboard_unbound');
 blockers.push('agreed_scope_unverified','per_video_delivery_not_implemented');
 return {...shared,workflow:'saved_video_plan',planRevision:row.revision,planInvalid:false,
  scope:{status:'operator_record_unverified',videos:plan.videoCount,scopeNote:plan.scopeNote,agreedScopeVerified:false},listedScope:base.scope,
  counts:{expectedVideos:plan.videoCount,mappedVideos:mapped,currentFinals:finals,unmappedVideos:plan.videoCount-mapped},videos,blockers,
  note:'Counts use the saved operator plan, not a verified buyer contract. Only a current final explicitly bound to the exact assigned storyboard is credited. Per-video delivery is not implemented; nothing here confirms buyer delivery.'};
}
export function createOrderCoverage({store,delivery,readSlotFinal}={}){
 const base=id=>{
  const db=store.db;
  const table=db.prepare("select name from sqlite_master where type='table' and name='whop_orders'").get();
  const order=table&&db.prepare('select payment,storyboard_id from whop_orders where payment_id=?').get(id);
  if(!order)throw Object.assign(Error('No such Whop order.'),{status:404});
  let payment=null;try{payment=JSON.parse(order.payment);}catch{}
  const state=delivery.get(id),base=auditOrderCoverage({payment,storyboardId:order.storyboard_id,storyboardExists:Boolean(order.storyboard_id&&store.getStoryboard(order.storyboard_id)),delivery:state});
  const hasPlans=db.prepare("select name from sqlite_master where type='table' and name='order_video_plans'").get();
  const saved=hasPlans&&db.prepare('select revision,plan from order_video_plans where payment_id=?').get(id);
  return saved?plannedCoverage(base,{store,id,row:saved,delivery:state}):base;
 };
 return {base,get(id){
  const report=base(id);
  if(typeof readSlotFinal!=='function'||report.workflow!=='saved_video_plan'||report.planInvalid)return report;
  const videos=report.videos.map(v=>{
   const result={...v,legacyFinalAvailable:v.finalCurrent,finalCurrent:false,finalEvidence:{kind:'none',issue:v.mapped?'slot_final_not_prepared':'assignment_invalid'}};
   if(!v.mapped)return result;
   let state;try{state=readSlotFinal(id,v.slot);}catch{return {...result,finalEvidence:{kind:'none',issue:'slot_final_state_unavailable'}};}
   if(state?.paymentId!==id||state?.slot!==v.slot)return {...result,finalEvidence:{kind:'none',issue:'slot_final_scope_mismatch'}};
   const f=state.final;if(f===null)return result;
   const valid=f&&f.stale===false&&Number.isSafeInteger(f.version)&&f.version>0&&state.expectedFinalVersion===f.version&&Number.isSafeInteger(f.bytes)&&f.bytes>0&&/^[a-f0-9]{64}$/.test(f.sha256||'')&&f.manifest?.slot===v.slot&&f.manifest.storyboardId===v.storyboardId&&f.manifest.planRevision===report.planRevision&&typeof state.sourceToken==='string'&&createHash('sha256').update(JSON.stringify(f.manifest)).digest('hex')===state.sourceToken;
   return {...result,finalCurrent:Boolean(valid),finalEvidence:{kind:'attached_slot_final',version:f?.version||null,sha256:f?.sha256||null,issue:valid?null:'slot_final_stale_or_unverified'}};
  });
  const count=videos.filter(v=>v.finalCurrent).length,expected=report.counts.expectedVideos;
  const complete=Number.isSafeInteger(expected)&&expected>0&&report.counts.mappedVideos===expected&&count===expected;
  const blockers=report.blockers.filter(b=>!['per_video_finals_incomplete','legacy_final_storyboard_unbound'].includes(b));
  if(!complete)blockers.push('per_video_finals_incomplete');
  if(videos.some(v=>v.finalEvidence.issue==='slot_final_state_unavailable'||v.finalEvidence.issue==='slot_final_scope_mismatch'))blockers.push('slot_final_state_unavailable');
  return {...report,videos,counts:{...report.counts,currentFinals:count},localFinalsComplete:complete,finalCoverageMode:'attached_slot_history_only',blockers,
   note:'Final counts use current attached per-slot history and byte/source checks. Legacy finals are separate context and are not counted. Local preparation completeness is not visual, provider, payment, contract or buyer-delivery verification.'};
 }};
}
