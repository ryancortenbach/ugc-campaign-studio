import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';

const packetUrl=new URL('./public/client-demo-data-v2.json',import.meta.url);
const invalid=message=>Object.assign(Error(message),{status:400});

// Explicit demo prompts load saved evidence. They never fall through to paid work.
export function clientDemoPromptBrands(message){
 const text=String(message||'');
 if(!/\b(demo|preview)\b/i.test(text))return [];
 const named=[/(?:award\s*scholar|awardscholar\.com)/i.test(text)&&'awardscholar',/\bwaddle\b|waddlecouples\.com/i.test(text)&&'waddle',/\bdisobedient\b|disobedientnyc\.com/i.test(text)&&'disobedient',/\bvylin\b|wearvylin\.com/i.test(text)&&'vylin'].filter(Boolean);
 return named.length?named:/\bstreetwear\b/i.test(text)?['disobedient','vylin']:[];
}

export function createClientDemo({store,readPacket=()=>JSON.parse(readFileSync(packetUrl,'utf8'))}){
 const existing=id=>store.listTasks().find(t=>t.plan?.kind==='client_demo'&&t.plan.clientDemo?.brandId===id);
 const packet=()=>{
  const data=readPacket();
  return {...data,brands:data.brands.map(brand=>({...brand,taskId:existing(brand.id)?.id||null}))};
 };
 function prepare(brandId){
  const brand=packet().brands.find(b=>b.id===brandId);
  if(!brand)throw invalid('Choose a client from the research demo.');
  const saved=existing(brandId);
  if(saved)return {task:saved,reused:true};
  const task=store.createTask(brand.name);
  store.updateTask(task.id,{status:'ready',summary:'Research and original avatar concepts prepared for human review. No sample generated or message sent.',plan:{kind:'client_demo',brand:brand.name,domain:new URL(brand.website).hostname.replace(/^www\./,''),clientDemo:{brandId:brand.id,version:1,stage:'human_review',reportUrl:brand.reportUrl,offerPdfUrl:brand.offerPdfUrl,packet:brand,sourceMode:'saved_sourced_research',productionAuthorized:false,sendingAuthorized:false},brief:{product:brand.product.summary,audience:brand.icp.summary,idea:brand.script.hook},creativeBrief:{researchBrief:brand.product.summary,icp:brand.icp,character:{appearance:brand.persona.description,wardrobe:brand.persona.wardrobe||'',rationale:brand.persona.rationale},sources:brand.sources,unknowns:brand.gaps}}});
  const callId=randomUUID();
  store.addEvent({taskId:task.id,type:'tool_call',tool:'client_demo.prepare',title:`Loading the saved ${brand.name} research demo`,data:{callId,input:{brandId},status:'running'}});
  store.addEvent({taskId:task.id,type:'tool_result',tool:'client_demo.prepare',title:`${brand.name} research, score, ICP and avatar ready for review`,data:{callId,status:'success',costUsd:0,output:{sourceMode:'saved_sourced_research',sources:brand.sources.length,imageUrl:brand.persona.imageUrl,score:brand.score.total,productionAuthorized:false,sendingAuthorized:false}}});
  return {task:store.getTask(task.id),reused:false};
 }
 function fromPrompt(message){
  const ids=clientDemoPromptBrands(message);
  if(!ids.length)return null;
  const results=ids.map(prepare),tasks=results.map(r=>r.task);
  return {task:tasks[0],tasks,demo:true,reused:results.every(r=>r.reused)};
 }
 function conversation(message){
  const out=fromPrompt(message);
  if(!out)return null;
  const reply=`Prepared ${out.tasks.map(t=>t.plan.brand).join(' and ')} as local research demos. Open their tasks to review founder evidence, commercial fit, ICP, original persona and content references. No paid generation or outreach was started.`;
  store.db.exec('create table if not exists assistant_messages(id integer primary key,at text not null,role text not null,content text not null)');
  const actions=out.tasks.map(t=>({tool:'prepare_client_demo',input:{brandId:t.plan.clientDemo.brandId,taskId:t.id},result_summary:`Task ${t.id}: saved research demo`}));
  const save=store.db.prepare('insert into assistant_messages(at,role,content) values(?,?,?)');
  save.run(new Date().toISOString(),'user',JSON.stringify({text:String(message)}));
  save.run(new Date().toISOString(),'assistant',JSON.stringify({text:reply,actions}));
  store.bus.emit('change',{kind:'assistant'});
  return {...out,reply,actions,cost:0};
 }
 return {get:packet,prepare,fromPrompt,conversation};
}
