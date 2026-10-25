import {createHash} from 'node:crypto';
import {storyboardPlanHash} from './order-storyboard-family.mjs';
const fail=(status,message)=>Object.assign(Error(message),{status});
export const renderIntentHash=r=>createHash('sha256').update(JSON.stringify({endpoint:r.endpoint,input:r.input,shotId:r.shot_id,storyboardId:r.storyboard_id})).digest('hex');
export function createRenderSourceReview({store,now=()=>new Date()}={}){
 const db=store.db;
 db.exec('create table if not exists render_source_reviews(id integer primary key,render_id integer not null,storyboard_id integer not null,render_hash text not null,plan_hash text not null,note text not null,at text not null)');
 const latest=id=>db.prepare('select * from render_source_reviews where render_id=? order by id desc limit 1').get(id)||null;
 const context=id=>{
  const render=store.getRender(id);if(!render)throw fail(404,'No such render.');
  const board=render.storyboard_id?store.getStoryboard(render.storyboard_id):null;
  const shots=Array.isArray(board?.plan?.shots)?board.plan.shots:[];
  const matchingShots=shots.filter((s,i)=>s&&typeof s==='object'&&!Array.isArray(s)&&String(s.id||`shot-${i+1}`)===String(render.shot_id));
  return {render,board,matchingShot:matchingShots.length===1?matchingShots[0]:null,canReview:Boolean(board&&render.shot_id&&matchingShots.length===1),renderHash:renderIntentHash(render),planHash:board?storyboardPlanHash(board.plan):null};
 };
 return {
  get(id){const c=context(id),record=latest(id);return {renderId:id,storyboardId:c.render.storyboard_id||null,canReview:c.canReview,expectedRenderHash:c.renderHash,expectedPlanHash:c.planHash,expectedReviewId:record?.id||0,
   snapshot:{renderTitle:c.render.title,endpoint:c.render.endpoint,input:c.render.input,shotId:c.render.shot_id,storyboardTitle:c.board?.title||null,storyboardPlan:c.board?.plan||null,matchingShot:c.matchingShot},
   associated:Boolean(c.canReview&&c.render.storyboard_plan_hash===c.planHash),
   record,recordMatchesCurrent:Boolean(record&&record.render_hash===c.renderHash&&record.plan_hash===c.planHash),
   evidence:'Local input-to-plan producer metadata or operator attestation only. Not pixel, provider, checker or delivery verification.'};},
  save(id,{storyboardId,expectedRenderHash,expectedPlanHash,expectedReviewId,confirmMatches,note}={}){
   if(confirmMatches!==true||typeof note!=='string'||!note.trim()||note.length>2000)throw fail(400,'Explicitly confirm the revised intent matches this storyboard shot and record a review note.');
   if(!Number.isSafeInteger(expectedReviewId)||expectedReviewId<0)throw fail(400,'Provide the current source review ID.');
   db.exec('begin immediate');
   try{
    const c=context(id);
    if(!c.canReview||storyboardId!==c.render.storyboard_id)throw fail(409,'This render has no matching saved storyboard lineage. Source cannot be inferred from the order or title.');
    if(expectedRenderHash!==c.renderHash||expectedPlanHash!==c.planHash||(latest(id)?.id||0)!==expectedReviewId)throw fail(409,'The input, storyboard or source review changed. Reload and review it again.');
    const at=new Date(now()).toISOString();
    db.prepare('insert into render_source_reviews(render_id,storyboard_id,render_hash,plan_hash,note,at) values(?,?,?,?,?,?)').run(id,storyboardId,c.renderHash,c.planHash,note.trim(),at);
    db.prepare('update renders set storyboard_plan_hash=?,updated_at=? where id=?').run(c.planHash,at,id);
    db.exec('commit');
   }catch(error){db.exec('rollback');throw error;}
   return this.get(id);
  },
  history(id){context(id);return db.prepare('select * from render_source_reviews where render_id=? order by id').all(id);}
 };
}
