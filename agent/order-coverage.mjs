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
export function createOrderCoverage({store,delivery}={}){
 return {get(id){
  const db=store.db;
  const table=db.prepare("select name from sqlite_master where type='table' and name='whop_orders'").get();
  const order=table&&db.prepare('select payment,storyboard_id from whop_orders where payment_id=?').get(id);
  if(!order)throw Object.assign(Error('No such Whop order.'),{status:404});
  let payment=null;try{payment=JSON.parse(order.payment);}catch{}
  return auditOrderCoverage({payment,storyboardId:order.storyboard_id,storyboardExists:Boolean(order.storyboard_id&&store.getStoryboard(order.storyboard_id)),delivery:delivery.get(id)});
 }};
}
