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
export function createOrderCoverage({store,delivery}={}){
 return {get(id){
  const db=store.db;
  const table=db.prepare("select name from sqlite_master where type='table' and name='whop_orders'").get();
  const order=table&&db.prepare('select payment,storyboard_id from whop_orders where payment_id=?').get(id);
  if(!order)throw Object.assign(Error('No such Whop order.'),{status:404});
  let payment=null;try{payment=JSON.parse(order.payment);}catch{}
  const state=delivery.get(id),base=auditOrderCoverage({payment,storyboardId:order.storyboard_id,storyboardExists:Boolean(order.storyboard_id&&store.getStoryboard(order.storyboard_id)),delivery:state});
  const hasPlans=db.prepare("select name from sqlite_master where type='table' and name='order_video_plans'").get();
  const saved=hasPlans&&db.prepare('select revision,plan from order_video_plans where payment_id=?').get(id);
  return saved?plannedCoverage(base,{store,id,row:saved,delivery:state}):base;
 }};
}
