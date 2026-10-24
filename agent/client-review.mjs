import {createHash,randomUUID} from 'node:crypto';

const fail=(message,status=400)=>{throw Object.assign(Error(message),{status});};
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function createClientReview({store,clientDemo}){
 store.db.exec('create table if not exists client_reviews(task_id integer not null,section text not null,version text not null,mode text not null,decision text not null,note text not null,at text not null,primary key(task_id,section,version,mode))');
 function get(taskId){
  const task=store.getTask(taskId);if(task?.plan?.kind!=='client_demo')fail('Client task not found.',404);
  const packet=clientDemo.get(),brand=packet.brands.find(brand=>brand.id===task.plan.clientDemo.brandId)||task.plan.clientDemo.packet;
  if(!brand)fail('Client research not found.',404);
  const versions={research:digest([packet.preparedAt,brand.product,brand.icp,brand.script?.hook,brand.sources,brand.gaps,brand.reportUrl]),images:brand.persona?.imageUrl||brand.storyboardImageUrl?digest([packet.preparedAt,brand.persona,brand.storyboardImageUrl,brand.storyboardCaption,(brand.assets||[]).filter(asset=>asset.kind==='product')]):null,video:brand.sampleVideo?.url&&brand.sampleVideo.requestId?digest([brand.sampleVideo.url,brand.sampleVideo.requestId,brand.sampleVideo.verification?.final_sha256]):null};
  const reviews=store.db.prepare('select section,version,mode,decision,note,at from client_reviews where task_id=? order by at desc').all(taskId).filter(review=>review.version===versions[review.section]);
  return {task:{id:task.id,status:task.status},brand,versions,reviews,events:store.listEvents({taskId}).filter(event=>['client.review','terac.review.simulated'].includes(event.tool))};
 }
 function review(taskId,{section,version,decision,note='',mode='local'}={}){
  if(!['research','images','video'].includes(section)||!['approved','changes_requested'].includes(decision)||!['local','simulated'].includes(mode))fail('Choose a valid review action.');
  if(mode==='simulated'&&section==='images')fail('Simulated human review supports the ICP or generated video.');
  if(typeof note!=='string'||note.length>1000)fail('Use a review note of up to 1,000 characters.');
  if(decision==='changes_requested'&&!note.trim())fail('Describe the change you need.');
  const current=get(taskId);
  if(!current.versions[section])fail('This artifact is not ready for review.',409);
  if(version!==current.versions[section])fail('This task changed. Refresh and review the latest version.',409);
  const at=new Date().toISOString(),callId=randomUUID(),tool=mode==='simulated'?'terac.review.simulated':'client.review';
  store.db.prepare('insert into client_reviews(task_id,section,version,mode,decision,note,at) values(?,?,?,?,?,?,?) on conflict(task_id,section,version,mode) do update set decision=excluded.decision,note=excluded.note,at=excluded.at').run(taskId,section,version,mode,decision,note.trim(),at);
  store.addEvent({taskId,type:'tool_call',tool,title:mode==='simulated'?`Simulated Terac human review: ${section==='research'?'ICP document':'generated video'}`:`Review ${section}`,data:{callId,status:'running',input:{section,version,mode}}});
  store.addEvent({taskId,type:'tool_result',tool,title:mode==='simulated'?'Simulated review result':`Review saved: ${section}`,data:{callId,status:'success',costUsd:0,output:{decision,note:note.trim(),mode,realHumanPanel:false,productionAuthorized:false}}});
  return get(taskId);
 }
 return {get,review};
}
