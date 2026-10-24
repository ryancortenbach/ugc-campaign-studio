import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {z} from 'zod';
import {suggestBoards} from './public/apparel-planner.js';

const here=path.dirname(fileURLToPath(import.meta.url));
const research=()=>JSON.parse(readFileSync(path.join(here,'public/apparel-storyboard-research-v1.json'),'utf8'));
const eligible=lead=>['qualified','drafting','awaiting_video','drafted','contacted','replied','won'].includes(lead?.status);
const fail=(message,status=400)=>Object.assign(Error(message),{status});
const asset=z.string().max(2000).refine(s=>(/^\/(?:uploads|storyboard-assets)\/[A-Za-z0-9_./% -]+$/.test(s)||/^\/api\/leads\/\d+\/products\/\d+\/image$/.test(s))&&!s.includes('..'),'Use an uploaded or saved storyboard asset.');
const planText=z.string().max(20000);
const shotSchema=z.object({id:z.string().min(1).max(100),start:z.number().nonnegative(),duration:z.number().min(1).max(30),camera:planText,action:planText,dialogue:planText,audio:planText,angle:z.string().optional()}).passthrough();
const planSchema=z.object({title:z.string().min(1).max(2000),category:z.string().min(1).max(100),identity:planText,wardrobe:planText,environment:planText,voice:planText,creativeDirection:planText,offer:planText,durationSeconds:z.number().positive(),shots:z.array(shotSchema).min(1).max(12),generation:z.object({spendApproved:z.literal(false),submitted:z.literal(false)}).passthrough()}).passthrough();
const referenceSchema=z.object({id:z.union([z.string(),z.number()]),name:z.string().max(500),url:asset,role:z.enum(['character','apparel','setting','pose'])}).passthrough();
const stateSchema=z.object({options:z.object({category:z.string().max(100),tone:z.string().max(300),audience:z.string().max(2000),variant:z.number().int().nonnegative(),identity:z.string().max(2000)}).passthrough(),selected:z.number().int().min(0).max(9),plans:z.array(planSchema).min(1).max(10),refs:z.array(referenceSchema).max(16),history:z.array(z.object({at:z.string().datetime(),plan:planSchema,refs:z.array(referenceSchema).max(16)})).max(12)}).strict();
const json=x=>JSON.stringify(x);
function noSpend(value){
 if(!value||typeof value!=='object')return;
 for(const [key,v] of Object.entries(value)){if(['spendApproved','submitted'].includes(key)&&v===true)throw fail('A storyboard draft cannot grant spending or submission approval.');noSpend(v);}
}
function initialLab(lead){
 const r=research(),hero=r.characters[0],category=/hoodie/i.test(lead.market||'')?'Hoodie':'T-shirt';
 const options={category,tone:'Dry confidence',audience:`Audience research pending for ${lead.company||lead.domain}.`,variant:0,identity:hero.identity};
 const plans=suggestBoards(options,r).map(p=>({...p,title:`${lead.company||lead.domain}: ${p.title}`,brand:lead.company||lead.domain,brandUrl:lead.url,referenceStatus:'Product reference and audience research pending.'}));
 return {options,selected:0,plans,refs:[{...hero,role:'character',origin:'existing_character'}],history:[]};
}
export function createTaskStoryboards({store}={}){
 const db=store.db;
 db.exec('create table if not exists brand_storyboard_tasks(lead_id integer primary key,task_id integer not null unique,mission_id integer,storyboard_id integer not null,lab text not null,revision integer not null default 0,created_at text not null,updated_at text not null)');
 db.exec('create table if not exists brand_storyboard_versions(task_id integer not null,revision integer not null,lab text not null,created_at text not null,primary key(task_id,revision))');
 const row=id=>db.prepare('select * from brand_storyboard_tasks where task_id=?').get(id);
 function get(taskId){
  const r=row(taskId);if(!r)throw fail('This task has no brand storyboard.',404);
  const lead=store.getLead(r.lead_id),board=store.getStoryboard(r.storyboard_id),lab=JSON.parse(r.lab),renders=store.listRenders({leadId:r.lead_id});
  const recent=db.prepare('select * from events where lead_id=? or task_id=? order by id desc limit 100').all(r.lead_id,r.task_id).map(e=>({...e,data:e.data?JSON.parse(e.data):null}));
  const events=new Map(recent.map(e=>[e.id,e]));
  return {task:store.getTask(r.task_id),lead,parentTaskId:r.mission_id,storyboard:board,lab,revision:r.revision,costUsd:0,
   stages:[{id:'brand',label:'Brand found',status:'done'},{id:'research',label:'Audience research',status:String(lab.options.audience||'').startsWith('Audience research pending')?'pending':'needs_review'},{id:'storyboard',label:'Storyboard draft',status:'ready'},{id:'references',label:'Product references',status:lab.refs.some(r=>r.role==='apparel')?'ready':'pending'},{id:'checks',label:'Review',status:board.checks?.passed?'passed':board.checks?'needs_changes':'pending'},{id:'render',label:'Render',status:renders[0]?.status||'not_started'}],
   events:[...events.values()].sort((a,b)=>a.id-b.id),renders,versions:db.prepare('select revision,created_at from brand_storyboard_versions where task_id=? order by revision desc limit 50').all(taskId)};
 }
 function version(taskId,revision){
  get(taskId);const record=db.prepare('select * from brand_storyboard_versions where task_id=? and revision=?').get(taskId,revision);
  if(!record)throw fail('Storyboard version not found.',404);
  return {revision:record.revision,createdAt:record.created_at,lab:JSON.parse(record.lab)};
 }
 function ensure(leadId){
  const lead=store.getLead(leadId);if(!lead)throw fail('Brand not found.',404);
  const old=db.prepare('select task_id from brand_storyboard_tasks where lead_id=?').get(leadId);if(old)return get(old.task_id);
  const at=new Date().toISOString(),lab=initialLab(lead),plan=lab.plans[0];let taskId,boardId;
  db.exec('begin immediate');
  try{
   const existing=db.prepare('select task_id from brand_storyboard_tasks where lead_id=?').get(leadId);
   if(existing){db.exec('commit');return get(existing.task_id);}
   taskId=Number(db.prepare('insert into tasks(prompt,status,plan,summary,created_at,updated_at) values(?,?,?,?,?,?)').run(`Storyboard: ${lead.company||lead.domain}`,'planning',json({kind:'brand_storyboard',leadId,parentTaskId:lead.task_id,brand:lead.company||lead.domain}),'Draft ready. Audience research and product reference pending.',at,at).lastInsertRowid);
   boardId=Number(db.prepare('insert into storyboards(title,brief,plan,status,version,cost_usd,created_at,updated_at) values(?,?,?,?,?,?,?,?)').run(plan.title,json({product:lead.company||lead.domain,website:lead.url,audience:lab.options.audience,taskId,leadId}),json(plan),'draft',1,0,at,at).lastInsertRowid);
   db.prepare('insert into brand_storyboard_tasks(lead_id,task_id,mission_id,storyboard_id,lab,created_at,updated_at) values(?,?,?,?,?,?,?)').run(leadId,taskId,lead.task_id,boardId,json(lab),at,at);
   db.prepare('insert into brand_storyboard_versions(task_id,revision,lab,created_at) values(?,?,?,?)').run(taskId,0,json(lab),at);
   db.exec('commit');
  }catch(e){db.exec('rollback');throw e;}
  store.addEvent({taskId,leadId,type:'status',tool:'storyboard.local',title:`Storyboard task created for ${lead.company||lead.domain}. Draft only, no paid generation.`,data:{parentTaskId:lead.task_id,storyboardId:boardId,costUsd:0}});
  store.bus.emit('change',{kind:'task',task:store.getTask(taskId)});
  return get(taskId);
 }
 function save(taskId,{revision,lab}={}){
  if(!Number.isInteger(revision)||revision<0)throw fail('Send the current storyboard revision.');
  try{lab=stateSchema.parse(lab);}catch(e){throw fail(e.issues?.map(i=>i.message).join('; ')||'Invalid storyboard draft.');}
  noSpend(lab);const serialized=json(lab);if(serialized.length>450000)throw fail('Storyboard draft exceeds the local size limit.',413);
  if(lab.selected>=lab.plans.length)throw fail('The selected storyboard does not exist.');
  for(const p of lab.plans){if(!Array.isArray(p.shots)||!p.shots.length||p.shots.length>12)throw fail('Each storyboard needs 1 to 12 shots.');}
  const r=row(taskId);if(!r)throw fail('Brand storyboard not found.',404);
  const at=new Date().toISOString();db.exec('begin immediate');
  try{
   const update=db.prepare('update brand_storyboard_tasks set lab=?,revision=revision+1,updated_at=? where task_id=? and revision=?').run(serialized,at,taskId,revision);
   if(Number(update.changes)!==1)throw fail('This storyboard changed in another view. Reload it before saving. Your local draft is retained.',409);
   const plan=lab.plans[lab.selected];db.prepare('update storyboards set title=?,plan=?,version=?,status=?,checks=null,updated_at=? where id=?').run(plan.title||'Brand storyboard',json(plan),revision+2,'draft',at,r.storyboard_id);
   db.prepare('insert into brand_storyboard_versions(task_id,revision,lab,created_at) values(?,?,?,?)').run(taskId,revision+1,serialized,at);
   db.prepare('update tasks set summary=?,updated_at=? where id=?').run(lab.refs.some(x=>x.role==='apparel')?'Storyboard saved. Ready for review.':'Storyboard saved. Product reference pending.',at,taskId);
   db.exec('commit');
  }catch(e){db.exec('rollback');throw e;}
  store.addEvent({taskId,leadId:r.lead_id,type:'status',tool:'storyboard.local',title:`Storyboard revision ${revision+1} saved. No generation submitted.`,data:{storyboardId:r.storyboard_id,revision:revision+1,costUsd:0}});
  return get(taskId);
 }
 const list=()=>db.prepare('select task_id from brand_storyboard_tasks order by updated_at desc').all().map(r=>{const w=get(r.task_id);return {taskId:r.task_id,leadId:w.lead.id,parentTaskId:w.parentTaskId,brand:w.lead.company||w.lead.domain,url:w.lead.url,title:w.storyboard.title,status:w.task.status,revision:w.revision,stages:w.stages};});
 const sync=()=>{for(const lead of store.listLeads())if(eligible(lead))ensure(lead.id);return list();};
 const onChange=change=>{if(change.kind==='lead'&&eligible(change.lead))ensure(change.lead.id);};
 store.bus.on('change',onChange);
 function applyResearch(taskId,brief){
  const current=get(taskId),lab=structuredClone(current.lab),lead=current.lead;
  const products=brief.products||[],heroIndex=products.findIndex(p=>['top','outerwear'].includes(p.kind)&&p.referenceUrl),hero=products[heroIndex];
  // Automatic research may enrich an edited draft, but never replace the user's shot list or reference choices.
  if(current.revision===0&&hero){
   const category=/hoodie/i.test(hero.title)?'Hoodie':hero.kind==='outerwear'?'Jacket':'T-shirt';
   lab.options.category=category;
   lab.plans=suggestBoards(lab.options,research()).map(p=>({...p,title:`${lead.company||lead.domain}: ${p.title}`,brand:lead.company||lead.domain,brandUrl:lead.url}));
  }
  const mutableRef=lab.refs.find(r=>r.role==='apparel'&&r.origin==='public_catalog'&&r.url.startsWith('/api/leads/')&&(r.sourceUrl===hero?.url||r.name===hero?.title));
  if(mutableRef&&hero){mutableRef.url=hero.referenceUrl;for(const plan of lab.plans)delete plan.imageRequests;}
  if(hero&&!lab.refs.some(r=>r.role==='apparel')&&lab.refs.length<16){lab.refs.push({id:`product-${lead.id}-${heroIndex}`,name:hero.title,url:hero.referenceUrl,role:'apparel',origin:'public_catalog',sourceUrl:hero.url});for(const plan of lab.plans)delete plan.imageRequests;}
  for(const plan of lab.plans){plan.researchEvidence={source:brief.source,excerpt:brief.excerpt,unknowns:brief.unknowns,method:brief.method};plan.referenceStatus=hero?`Product reference: ${hero.title}. Audience requires review.`:'Product reference and audience research require review.';}
  return save(taskId,{revision:current.revision,lab});
 }
 return {ensure,get,save,applyResearch,version,list,sync,close:()=>store.bus.off('change',onChange)};
}
