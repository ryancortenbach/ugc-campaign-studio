import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {openStore,dataDir} from './store.mjs';
import {createRunner,realTools} from './runner.mjs';
import {saveProfile} from './brain.mjs';
import {models,llmEnabled} from './tools/llm.mjs';
import * as hf from './tools/higgsfield.mjs';
import * as boards from './storyboard.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const pub=path.join(here,'public'),shots=path.join(dataDir,'shots'),renderDir=path.join(dataDir,'renders');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.png':'image/png','.mp4':'video/mp4'};
export function createApp({store=openStore(),runner,higgsfield=hf}={}){
 runner??=createRunner(store);
 const integrations=()=>{
  const gmail=realTools.gmailEnabled()?realTools.draftAccount():null,solari=realTools.siteMode()==='solari',whop=Boolean(process.env.WHOP_API_KEY);
  return [
   {id:'claude',name:'Claude',on:llmEnabled(),detail:llmEnabled()?'Sonnet 5.5 plans and writes. Haiku 5.5 grades.':'Add ANTHROPIC_API_KEY'},
   {id:'exa',name:'Exa',on:true,detail:realTools.exaMode()==='rest'?'Brand search':'Free search'},
   {id:'solari',name:'Solari',on:solari,detail:solari?'Cloud browsers visit brand sites':'Add SOLARI_API_KEY'},
   {id:'gmail',name:'Gmail',on:Boolean(gmail),detail:gmail?`Drafts in ${gmail}. Never sent.`:'Add a Gmail token'},
   {id:'higgsfield',name:'Higgsfield',on:higgsfield.higgsfieldEnabled(),detail:higgsfield.higgsfieldEnabled()?'Renders only after your approval':'Add HF_CREDENTIALS'},
   {id:'whop',name:'Whop',on:whop,detail:whop?'Watching Mint Labs purchases':'Add WHOP_API_KEY'}
  ];
 };
 const config=()=>({brain:realTools.brainMode(),models,exa:realTools.exaMode(),sites:realTools.siteMode(),gmail:realTools.gmailEnabled()?realTools.draftAccount():null,higgsfield:higgsfield.higgsfieldEnabled(),checkers:llmEnabled(),integrations:integrations(),profile:realTools.loadProfile(),stats:store.stats()});
 // Renders whose approve request is still waiting on Higgsfield in this process. A submitting row missing here was cut off by a restart.
 const inFlight=new Set();
 // Applies one Higgsfield status answer. Returns true while the render is still running.
 async function applyStatus(id,s){
  if(s.status!==store.getRender(id).status)store.updateRender(id,{status:s.status});
  if(s.status==='completed'){const url=s.video?.url||s.images?.[0]?.url||null;let local=null;if(url){try{local=path.basename(await higgsfield.download(url,renderDir,`render-${id}.mp4`));}catch(e){store.updateRender(id,{error:e.message});}}store.updateRender(id,{result_url:url,local_file:local,review:'pending'});return false;}
  if(['failed','nsfw','canceled'].includes(s.status)){store.updateRender(id,{error:s.error||s.status});return false;}
  return true;
 }
 async function pollRender(id){
  for(let i=0;i<180;i++){
   const r=store.getRender(id);if(!r?.request_id||!['queued','in_progress'].includes(r.status))return;
   await new Promise(res=>setTimeout(res,Math.min(10000,2000+i*1000)));
   try{if(!await applyStatus(id,await higgsfield.status(r.request_id)))return;}catch(e){store.updateRender(id,{error:e.message});}
  }
 }
 const routes=[
  ['GET',/^\/api\/state$/,()=>({config:config(),tasks:store.listTasks()})],
  ['POST',/^\/api\/chat$/,(m,b)=>{const text=String(b.message||'').trim();if(text.length<3||text.length>2000)throw Object.assign(Error('Write a request between 3 and 2000 characters.'),{status:400});return {task:runner.start(text)};}],
  ['GET',/^\/api\/tasks\/(\d+)$/,m=>{const id=Number(m[1]);const task=store.getTask(id);if(!task)throw Object.assign(Error('No such task'),{status:404});return {task,running:runner.isRunning(id),events:store.listEvents({taskId:id}),steers:store.listSteers(id),leads:store.listLeads({taskId:id}),drafts:store.listDrafts({taskId:id})};}],
  ['POST',/^\/api\/tasks\/(\d+)\/steer$/,(m,b)=>{const text=String(b.message||'').trim();if(!text)throw Object.assign(Error('Write a steering message.'),{status:400});return runner.steer(Number(m[1]),text);}],
  ['POST',/^\/api\/tasks\/(\d+)\/control$/,(m,b)=>{if(!['pause','resume','stop'].includes(b.action))throw Object.assign(Error('Unknown action'),{status:400});return {ok:runner.control(Number(m[1]),b.action)};}],
  ['GET',/^\/api\/spend$/,()=>store.spendSummary()],
  ['GET',/^\/api\/metrics$/,(m,b,url)=>{const range=url.searchParams.get('range')||'week';if(!['today','week','month','year'].includes(range))throw Object.assign(Error('Range is today, week, month or year.'),{status:400});return store.metrics(range);}],
  ['GET',/^\/api\/events$/,()=>({events:store.listEvents({limit:150})})],
  ['GET',/^\/api\/leads$/,()=>({leads:store.listLeads()})],
  ['GET',/^\/api\/drafts$/,()=>({drafts:store.listDrafts().map(d=>{const l=store.getLead(d.lead_id)||{};return {...d,company:l.company,domain:l.domain,screenshot:l.screenshot};})})],
  ['POST',/^\/api\/drafts\/(\d+)\/sent$/,m=>{const d=store.markDraftSent(Number(m[1]));if(!d)throw Object.assign(Error('No such draft'),{status:404});return {draft:d};}],
  ['GET',/^\/api\/leads\/(\d+)$/,m=>{const lead=store.getLead(Number(m[1]));if(!lead)throw Object.assign(Error('No such lead'),{status:404});return {lead,events:store.listEvents({leadId:lead.id}),drafts:store.listDrafts({leadId:lead.id})};}],
  ['POST',/^\/api\/leads\/(\d+)$/,(m,b)=>{const allowed=['found','drafted','contacted','replied','won','lost','skipped'];const fields={};if(b.status!==undefined){if(!allowed.includes(b.status))throw Object.assign(Error('Unknown status'),{status:400});fields.status=b.status;}if(typeof b.notes==='string')fields.notes=b.notes.slice(0,4000);return {lead:store.updateLead(Number(m[1]),fields)};}],
  ['POST',/^\/api\/profile$/,(m,b)=>({profile:saveProfile(b)})],
  ['GET',/^\/api\/renders$/,()=>({renders:store.listRenders().map(r=>r.status==='submitting'&&!inFlight.has(r.id)?{...r,stale:true}:r),enabled:higgsfield.higgsfieldEnabled()})],
  ['POST',/^\/api\/renders$/,(m,b)=>{const prompt=String(b.prompt||'').trim();if(prompt.length<10)throw Object.assign(Error('Write a shot prompt of at least 10 characters.'),{status:400});const input=higgsfield.buildInput({prompt,imageUrl:b.imageUrl||null,duration:b.duration,resolution:b.resolution});return {render:store.createRender({title:String(b.title||'Untitled shot').slice(0,120),endpoint:input.image_url?higgsfield.endpoints['image-to-video']:higgsfield.endpoints['text-to-video'],input})};}],
  ['GET',/^\/api\/storyboards$/,()=>({storyboards:store.listStoryboards()})],
  ['POST',/^\/api\/storyboards$/,async(m,b)=>{const brief=Object.fromEntries(['product','audience','idea','offer','identity','wardrobe','environment','voice','length'].map(k=>[k,String(b[k]??'').slice(0,2000).trim()]).filter(([,v])=>v));if(!brief.product||!brief.idea)throw Object.assign(Error('Describe the product and the video idea.'),{status:400});if(!llmEnabled())throw Object.assign(Error('Storyboards need ANTHROPIC_API_KEY'),{status:503});const out=await boards.draftStoryboard(brief);const sb=store.createStoryboard({title:out.plan.title||brief.product.slice(0,60),brief,plan:out.plan,cost:out.cost});store.addSpend({provider:'claude',usd:out.cost,storyboardId:sb.id,note:'storyboard draft'});return {storyboard:sb};}],
  ['POST',/^\/api\/storyboards\/(\d+)\/check$/,async m=>{const s=store.getStoryboard(Number(m[1]));if(!s)throw Object.assign(Error('No such storyboard'),{status:404});if(s.status==='approved')throw Object.assign(Error('Already approved'),{status:409});store.updateStoryboard(s.id,{status:'checking'});try{const checks=await boards.checkStoryboard(s.plan);store.addSpend({provider:'claude',usd:checks.cost,storyboardId:s.id,note:'storyboard checkers'});return {storyboard:store.updateStoryboard(s.id,{status:checks.passed?'checks_passed':'checks_failed',checks},checks.cost)};}catch(e){store.updateStoryboard(s.id,{status:'draft'});throw e;}}],
  ['POST',/^\/api\/storyboards\/(\d+)\/revise$/,async(m,b)=>{const s=store.getStoryboard(Number(m[1]));if(!s)throw Object.assign(Error('No such storyboard'),{status:404});if(!s.checks&&!String(b.note||'').trim())throw Object.assign(Error('Run the checkers or write a note first.'),{status:409});const out=await boards.reviseStoryboard(s.plan,s.checks||{results:[]},String(b.note||'').slice(0,2000));const sb=store.createStoryboard({title:s.title,brief:s.brief,plan:out.plan,version:s.version+1,parentId:s.id,cost:out.cost});store.addSpend({provider:'claude',usd:out.cost,storyboardId:sb.id,note:'storyboard revision'});return {storyboard:sb};}],
  ['POST',/^\/api\/storyboards\/(\d+)\/approve$/,m=>{const s=store.getStoryboard(Number(m[1]));if(!s)throw Object.assign(Error('No such storyboard'),{status:404});if(s.status!=='checks_passed')throw Object.assign(Error('The checkers have to pass before you can approve it.'),{status:409});const shots=higgsfield.shotsFromStoryboard({brief:{brand:`${s.title} v${s.version}`},storyboard:s.plan});const renders=shots.map(x=>store.createRender({title:x.title,endpoint:higgsfield.endpoints['text-to-video'],input:x.input,group:x.group,shotId:x.shotId}));return {storyboard:store.updateStoryboard(s.id,{status:'approved'}),renders};}],
  ['POST',/^\/api\/renders\/import$/,(m,b)=>{const shots=higgsfield.shotsFromStoryboard(b.packet);return {renders:shots.map(s=>store.createRender({title:s.title,endpoint:s.input.image_url?higgsfield.endpoints['image-to-video']:higgsfield.endpoints['text-to-video'],input:s.input,group:s.group,shotId:s.shotId}))};}],
  ['POST',/^\/api\/renders\/(\d+)\/review$/,(m,b)=>{const r=store.getRender(Number(m[1]));if(!r)throw Object.assign(Error('No such render'),{status:404});if(r.status!=='completed')throw Object.assign(Error('Only finished renders can be reviewed.'),{status:409});if(!['approved','rejected'].includes(b.decision))throw Object.assign(Error('Choose approve or reject.'),{status:400});const note=String(b.note||'').slice(0,2000);if(b.decision==='rejected'&&!note.trim())throw Object.assign(Error('Say what to fix so the next render can be better.'),{status:400});return {render:store.updateRender(r.id,{review:b.decision,review_note:note||null,reviewed_at:new Date().toISOString()})};}],
  ['POST',/^\/api\/renders\/(\d+)\/revise$/,m=>{const r=store.getRender(Number(m[1]));if(!r)throw Object.assign(Error('No such render'),{status:404});if(['submitting','submission_unknown'].includes(r.status))throw Object.assign(Error('Reconcile this render with Higgsfield first. A new version now could pay for the same shot twice.'),{status:409});const prompt=r.review_note?`${r.input.prompt}\n\nFix from review of render ${r.id}: ${r.review_note}`:r.input.prompt;const version=Number(r.title.match(/ \(v(\d+)\)$/)?.[1]||1)+1;return {render:store.createRender({title:`${r.title.replace(/ \(v\d+\)$/,'')} (v${version})`,endpoint:r.endpoint,input:{...r.input,prompt},group:r.group_name,shotId:r.shot_id})};}],
  ['POST',/^\/api\/renders\/(\d+)\/check$/,async m=>{const r=store.getRender(Number(m[1]));if(!r)throw Object.assign(Error('No such render'),{status:404});if(!['draft','checks_failed','checks_passed'].includes(r.status))throw Object.assign(Error(`Render is ${r.status}`),{status:409});store.updateRender(r.id,{status:'checking'});let checks;try{checks=await higgsfield.runCheckers({title:r.title,input:r.input});}catch(e){store.updateRender(r.id,{status:'draft',error:e.message});throw e;}store.addSpend({provider:'claude',usd:checks.cost,renderId:r.id,note:'shot checkers'});let estimate=null,error=null;if(checks.passed&&higgsfield.higgsfieldEnabled()){try{const e=await higgsfield.estimate(r.endpoint,r.input);estimate=higgsfield.priceFrom(e,r.input);if(!estimate)error='Higgsfield returned no usable price for this resolution';}catch(e){error=e.message;}}return {render:store.updateRender(r.id,{status:checks.passed?'checks_passed':'checks_failed',checks,estimate_usd:estimate,error})};}],
  ['POST',/^\/api\/renders\/(\d+)\/approve$/,async(m,b)=>{
   const r=store.getRender(Number(m[1]));if(!r)throw Object.assign(Error('No such render'),{status:404});
   if(r.status!=='checks_passed')throw Object.assign(Error('Run the checkers and pass them before approving. Submitting or uncertain renders cannot be resubmitted.'),{status:409});
   if(!Number.isFinite(Number(r.estimate_usd))||Number(r.estimate_usd)<=0)throw Object.assign(Error('No finite positive price estimate. Rerun checks to fetch one.'),{status:409});
   if(String(b.estimate)!==String(r.estimate_usd))throw Object.assign(Error('The estimate changed. Review it and approve again.'),{status:409});
   const key=`render-${r.id}-${randomUUID()}`;
   const claimed=store.claimRenderSubmission(r.id,r.estimate_usd,key);if(!claimed)throw Object.assign(Error('This render was already claimed or its estimate changed. No additional submission started.'),{status:409});
   inFlight.add(r.id);
   try{const submitted=await higgsfield.approveAndSubmit(r.endpoint,r.input,claimed.submission_key);const requestId=submitted.request_id||submitted.id;
    if(typeof requestId!=='string'||!requestId.trim())throw Error('Provider response did not identify a request.');
    store.addSpend({provider:'higgsfield',usd:Number(r.estimate_usd),renderId:r.id,note:'approved render estimate'});
    const updated=store.updateRender(r.id,{status:submitted.status||'queued',request_id:requestId,error:null});pollRender(r.id);return {render:updated};
   }catch{store.updateRender(r.id,{status:'submission_unknown',error:'Submission outcome is uncertain. Check Higgsfield using the saved submission key before any new render attempt.'});throw Object.assign(Error('Submission outcome is uncertain. No automatic retry is allowed. Reconcile the saved submission key in Higgsfield.'),{status:502});}
   finally{inFlight.delete(r.id);}
  }],
  // The only way out of an uncertain submission. Someone checks Higgsfield, then either pastes the request ID it shows or confirms it never started.
  ['POST',/^\/api\/renders\/(\d+)\/reconcile$/,async(m,b)=>{
   const r=store.getRender(Number(m[1]));if(!r)throw Object.assign(Error('No such render'),{status:404});
   if(inFlight.has(r.id))throw Object.assign(Error('Higgsfield has not answered this submission yet. Wait for it to finish.'),{status:409});
   if(!['submitting','submission_unknown'].includes(r.status)||r.request_id)throw Object.assign(Error('Only a render with an uncertain submission needs reconciling.'),{status:409});
   if(b.outcome==='not_submitted'){const back=store.reconcileRender(r.id);if(!back)throw Object.assign(Error('This render changed. Reload and try again.'),{status:409});return {render:back};}
   if(b.outcome!=='submitted')throw Object.assign(Error('Say whether Higgsfield shows this render: submitted or not_submitted.'),{status:400});
   const requestId=String(b.requestId??'').trim();if(!/^[\w.:-]{1,200}$/.test(requestId))throw Object.assign(Error('Paste the request ID Higgsfield shows for this render.'),{status:400});
   let s;try{s=await higgsfield.status(requestId);}catch(e){throw Object.assign(Error(`Higgsfield did not confirm that request ID. ${e.message}`),{status:400});}
   if(typeof s?.status!=='string'||!s.status)throw Object.assign(Error('Higgsfield returned no status for that request ID.'),{status:400});
   if(!store.reconcileRender(r.id,{requestId}))throw Object.assign(Error('This render changed. Reload and try again.'),{status:409});
   store.addSpend({provider:'higgsfield',usd:Number(r.estimate_usd),renderId:r.id,note:'reconciled render estimate'});
   applyStatus(r.id,s).then(running=>{if(running)pollRender(r.id);}).catch(e=>store.updateRender(r.id,{error:e.message}));
   return {render:store.getRender(r.id)};
  }],
  ['POST',/^\/api\/renders\/(\d+)\/cancel$/,async m=>{const r=store.getRender(Number(m[1]));if(!r?.request_id)throw Object.assign(Error('Nothing submitted'),{status:409});await higgsfield.cancel(r.request_id);return {render:store.updateRender(r.id,{status:'canceled'})};}]
 ];
 return async function handle(req,res){
  const url=new URL(req.url,'http://localhost');
  const send=(code,data)=>{res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  if(url.pathname==='/api/stream'){
   res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-store',Connection:'keep-alive'});
   const push=change=>res.write(`data: ${JSON.stringify(change)}\n\n`);
   store.bus.on('change',push);const ping=setInterval(()=>res.write(': ping\n\n'),20000);
   req.on('close',()=>{store.bus.off('change',push);clearInterval(ping);});return;
  }
  for(const [method,pattern,fn] of routes){
   const m=url.pathname.match(pattern);if(!m||req.method!==method)continue;
   try{
    let body={};
    if(method==='POST'){let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>64000)return send(413,{error:'Request too large'});}body=raw?JSON.parse(raw):{};}
    return send(200,await fn(m,body,url));
   }catch(error){return send(error.status||(error instanceof SyntaxError?400:500),{error:error.message});}
  }
  try{
   const [root,rel]=url.pathname.startsWith('/shots/')?[shots,url.pathname.slice(7)]:url.pathname.startsWith('/renders/')?[renderDir,url.pathname.slice(9)]:[pub,url.pathname==='/'?'index.html':url.pathname.slice(1)];
   const file=path.resolve(root,decodeURIComponent(rel));
   if(!file.startsWith(root+path.sep))return send(403,{error:'Forbidden'});
   const data=await readFile(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','X-Content-Type-Options':'nosniff'});res.end(data);
  }catch{send(404,{error:'Not found'});}
 };
}

if(process.argv[1]===fileURLToPath(import.meta.url)){
 const port=Number(process.env.AGENT_PORT||3200);
 http.createServer(createApp()).listen(port,'127.0.0.1',()=>console.log(`Mint Labs agent ready at http://127.0.0.1:${port}`));
}
