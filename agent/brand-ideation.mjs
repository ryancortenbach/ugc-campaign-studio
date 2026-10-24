import {randomUUID} from 'node:crypto';
import {scrapeProductsDetailed,productDir} from './tools/products.mjs';
import {fetchHomepage} from './tools/site.mjs';
import {publicHttp} from './logo.mjs';
import {readFileSync,existsSync} from 'node:fs';
import path from 'node:path';
import {saveUpload,uploadDir} from './tools/uploads.mjs';

export const ideationEligible=lead=>['qualified','drafting','awaiting_video','drafted','contacted','replied','won'].includes(lead?.status);
export function snapshotProductReference(leadId,product){
 if(/^\/uploads\/[a-z0-9-]+\.(png|jpg|webp|gif)$/.test(product.referenceUrl||'')&&existsSync(path.join(uploadDir(),path.basename(product.referenceUrl))))return product.referenceUrl;
 if(!/^\d+\.(png|jpg|webp|gif)$/.test(product.image||''))throw Error('Product photo is not a supported cached image.');
 const type={png:'image/png',jpg:'image/jpeg',webp:'image/webp',gif:'image/gif'}[path.extname(product.image).slice(1)];
 const bytes=readFileSync(path.join(productDir,String(Number(leadId)),product.image));
 const upload=saveUpload({name:product.title,type,data:bytes.toString('base64')});return `/uploads/${upload.file}`;
}
export const fetchPublicHomepage=url=>fetchHomepage(url,{fetchImpl:async(raw,options)=>{
 let u=publicHttp(raw);if(!u)throw Error('Blocked brand URL');
 for(let hop=0;hop<4;hop++){
  const response=await fetch(u.href,{...options,redirect:'manual'});
  if(response.status>=300&&response.status<400&&response.headers.get('location')){u=publicHttp(new URL(response.headers.get('location'),u).href);if(!u)throw Error('Blocked brand redirect');continue;}
  return response;
 }
 throw Error('Too many brand redirects');
}});

// Only public catalog reads and local planning run here. No model, browser-session or generation provider is called.
export function createBrandIdeation({store,boards,watch=true,scrape=scrapeProductsDetailed,fetchHome=fetchPublicHomepage,snapshot=snapshotProductReference}={}){
 const db=store.db,active=new Map(),queue=[];let closed=false,running=0;
 db.exec('create table if not exists brand_ideation(lead_id integer primary key,status text not null,workspace_task_id integer,error text,result text,updated_at text not null)');
 const get=leadId=>{const r=db.prepare('select * from brand_ideation where lead_id=?').get(leadId);return r?{status:r.status,taskId:r.workspace_task_id,error:r.error,result:r.result?JSON.parse(r.result):null,updatedAt:r.updated_at}:null;};
 const set=(leadId,status,taskId,result=null,error=null)=>{
  db.prepare('insert into brand_ideation values(?,?,?,?,?,?) on conflict(lead_id) do update set status=excluded.status,workspace_task_id=excluded.workspace_task_id,error=excluded.error,result=excluded.result,updated_at=excluded.updated_at').run(leadId,status,taskId,error,result?JSON.stringify(result):null,new Date().toISOString());
  store.bus.emit('change',{kind:'ideation',leadId,ideation:get(leadId)});
  if(taskId)store.updateTask(taskId,{status:({queued:'research_queued',researching:'researching',ideating:'planning',ready:'ready',needs_research:'needs_research',failed:'failed',canceled:'stopped'})[status],summary:({queued:'Research queued.',researching:'Reading the brand site and public catalog.',ideating:'Preparing shot ideas from the research brief.',ready:'Ideas ready for review. No generation submitted.',needs_research:'Draft ideas saved. Missing research needs review.',failed:error,canceled:'Brand no longer qualifies. Planning stopped.'})[status]});
 };
 async function run(leadId){
  const lead=store.getLead(leadId);if(!ideationEligible(lead)){set(leadId,'canceled',get(leadId)?.taskId||null);return;}
  const workspace=boards.ensure(leadId),taskId=workspace.task.id;
  const event=(type,title,extra={})=>store.addEvent({taskId,leadId,type,title,...extra});
  const call=async(tool,title,input,fn)=>{
   const callId=randomUUID(),start=Date.now();
   event('tool_call',title,{tool,data:{callId,status:'running',input}});
   try{const output=await fn();event('tool_result',title,{tool,data:{callId,status:'success',durationMs:Date.now()-start,costUsd:0,output}});return output;}
   catch(error){event('tool_result',`${title}: ${error.message}`,{tool,data:{callId,status:'error',durationMs:Date.now()-start,costUsd:0,error:error.message}});throw error;}
  };
  try{
   set(leadId,'researching',taskId);event('status',`Researching ${lead.company||lead.domain}`,{tool:'research.local'});
   let products=Array.isArray(lead.products)?lead.products:[],home=null;const unknowns=[];
   if(products.length){await call('catalog.saved','Reading saved product references',{leadId},async()=>({count:products.length,products:products.map(p=>({title:p.title,url:p.url,kind:p.kind}))}));}
   else{
    try{
     const result=await call('catalog.public','Reading the public product catalog',{url:lead.url},async()=>{
      const found=await scrape({domain:lead.domain,url:lead.url,leadId,enabled:()=>false,fetchHome});
      if(found.cost)throw Error('Free catalog reader returned a provider cost. Planning stopped.');
      products=found.products||[];
      return {source:found.source,count:products.length,products:products.map(p=>({title:p.title,url:p.url,kind:p.kind}))};
     });
     if(!result.count)unknowns.push('No usable product photos found in the public catalog.');
    }catch(error){unknowns.push(`Catalog unavailable: ${error.message}`);}
   }
   try{home=await call('site.public','Reading brand positioning',{url:lead.url},async()=>{
    const page=await fetchHome(lead.url||`https://${lead.domain}/`);
    return {url:page.url||lead.url,text:String(page.text||'').slice(0,5000)};
   });}catch(error){unknowns.push(`Brand site unavailable: ${error.message}`);}
   if(closed)return;
   if(!ideationEligible(store.getLead(leadId))){set(leadId,'canceled',taskId);event('status','Brand no longer qualifies. Planning stopped.',{tool:'research.local'});return;}
   const hero=products.find(p=>['top','outerwear'].includes(p.kind)&&p.image);
   if(hero){try{hero.referenceUrl=await call('catalog.reference','Saving the garment reference',{title:hero.title,source:hero.url},()=>snapshot(leadId,hero));}catch(error){unknowns.push(`Garment photo unavailable: ${error.message}`);}}
   store.updateLead(leadId,{products});
   set(leadId,'ideating',taskId);event('status',`Ideation in progress for ${lead.company||lead.domain}`,{tool:'storyboard.local'});
   const result=await call('storyboard.local','Building the research brief and shot ideas',{productCount:products.length,source:home?.url||null,method:'Local template planning. No AI model call.'},async()=>{
    if(!products.some(p=>['top','outerwear'].includes(p.kind)&&p.referenceUrl))unknowns.push('No supported top or jacket with a cached product photo. Choose a garment reference.');
    const brief={products,source:home?.url||lead.url,excerpt:home?.text||'',unknowns:[...unknowns,'Audience demographics and ad performance are unverified.'],method:'Public catalog evidence and local storyboard templates. No model inference.'};
    const updated=boards.applyResearch(taskId,brief);
    return {schemaVersion:2,revision:updated.revision,concepts:updated.lab.plans.map(p=>p.title),productCount:products.length,usableGarment:products.some(p=>['top','outerwear'].includes(p.kind)&&p.referenceUrl),unknowns:brief.unknowns,method:brief.method};
   });
   const status=result.usableGarment&&home?.text?'ready':'needs_research';
   set(leadId,status,taskId,result);
   event('status',status==='ready'?`Storyboard ideas ready for ${lead.company||lead.domain}`:`Research needs review for ${lead.company||lead.domain}`,{tool:'storyboard.local',data:{costUsd:0,unknowns:result.unknowns}});
  }catch(error){set(leadId,'failed',taskId,null,error.message);event('error',`Ideation stopped: ${error.message}`,{tool:'storyboard.local'});}
 }
 function pump(){while(!closed&&running<2&&queue.length){const {leadId,resolve}=queue.shift();running++;Promise.resolve().then(()=>run(leadId)).catch(error=>{if(!closed)set(leadId,'failed',get(leadId)?.taskId||null,null,error.message);}).finally(()=>{active.delete(leadId);running--;resolve(closed?null:get(leadId));pump();});}}
 function start(leadId,{retry=false}={}){
  leadId=Number(leadId);if(closed)return Promise.resolve(null);if(active.has(leadId))return active.get(leadId);
  const lead=store.getLead(leadId);if(!ideationEligible(lead))return Promise.resolve(null);
  const old=get(leadId);if(old&&!retry&&!['queued','researching','ideating','canceled'].includes(old.status)&&(!old.result||old.result.schemaVersion===2))return Promise.resolve(old);
  const taskId=boards.ensure(leadId).task.id;let resolve;const promise=new Promise(r=>{resolve=r;});active.set(leadId,promise);
  set(leadId,'queued',taskId);queue.push({leadId,resolve});pump();return promise;
 }
 const change=c=>{if(c.kind==='lead'&&ideationEligible(c.lead))start(c.lead.id);};
 if(watch)store.bus.on('change',change);
 return {get,start,sync:()=>Promise.all(store.listLeads().filter(ideationEligible).map(l=>start(l.id))),wait:leadId=>active.get(Number(leadId))||Promise.resolve(get(Number(leadId))),close(){closed=true;store.bus.off('change',change);for(const job of queue.splice(0)){active.delete(job.leadId);job.resolve(get(job.leadId));}}};
}
