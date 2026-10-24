// Bounded, explicitly authorized two-brand pilot. Never changes the app's global pause.
import {readFileSync,writeFileSync,mkdirSync,existsSync,openSync,closeSync,unlinkSync} from 'node:fs';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash,randomUUID} from 'node:crypto';
import path from 'node:path';
import {openStore} from '../agent/store.mjs';

const root=path.resolve(import.meta.dirname,'..'),dir=path.join(root,'work/streetwear-demo-v1');
const stateFile=path.join(dir,'generation-state-v1.json');
const authorizationFile=path.join(root,'research_notes/streetwear-demo-v1/production-authorization-v1.json');
const model='higgsfield/genjutsu-light/object-swap/v1.0';
const run=promisify(execFile),sha=v=>createHash('sha256').update(v).digest('hex');
const authorization=JSON.parse(readFileSync(authorizationFile,'utf8'));
if(authorization.maxTotalUsd!==3||authorization.retryCap!==0||authorization.authorizedBy!=='user'||!authorization.generateAuthorized)throw Error('The bounded generation authorization is missing.');
const brands=[{id:'disobedient',name:'Disobedient',taskId:10},{id:'vylin',name:'VYLIN',taskId:11}];
const inputs=brands.map(b=>({...b,input:JSON.parse(readFileSync(path.join(dir,`${b.id}-genjutsu-input-private.json`),'utf8'))}));
for(const b of inputs){
 if(b.input.resolution!=='720p'||!b.input.image_urls?.length||new URL(b.input.video_url).protocol!=='https:')throw Error('Pilot inputs do not match the approved scope.');
 if(sha(JSON.stringify(b.input))!==authorization.inputSha256[b.id])throw Error('The approved input has changed.');
}
if(!process.argv.includes('--execute')){
 console.log(JSON.stringify({mode:'dry_run',brands:brands.map(b=>b.id),estimatedTotalUsd:2.4,maxTotalUsd:3,retries:0,submissions:0}));process.exit(0);
}
if(!process.env.HF_CREDENTIALS)throw Error('Higgsfield credentials unavailable.');
mkdirSync(dir,{recursive:true});
const lockFile=path.join(dir,'generation-v1.lock');
let lockFd;
try{lockFd=openSync(lockFile,'wx');}catch{throw Error('A pilot execution lock already exists. Reconcile the active or interrupted process before continuing.');}
writeFileSync(lockFd,JSON.stringify({pid:process.pid,startedAt:new Date().toISOString()}));
const releaseLock=()=>{if(lockFd!==undefined){closeSync(lockFd);lockFd=undefined;unlinkSync(lockFile);}};
process.once('exit',releaseLock);
const store=openStore();
const state=existsSync(stateFile)?JSON.parse(readFileSync(stateFile,'utf8')):{version:1,authorization,model,jobs:[],estimatedTotalUsd:0};
const save=()=>writeFileSync(stateFile,JSON.stringify(state,null,2)+'\n');
const ipCache=new Map();
async function request(url,{body,auth=false,idempotencyKey,file}={}){
 const host=new URL(url).hostname;
 if(auth&&host!=='api.higgsfield.ai')throw Error('Provider credentials may only go to api.higgsfield.ai.');
 let ip=ipCache.get(host);
 if(!ip){const dns=await run('/usr/bin/dig',['+short','+time=2','+tries=1','@10.104.0.1',host,'A']);ip=dns.stdout.split(/\s+/).find(v=>/^\d+\.\d+\.\d+\.\d+$/.test(v));if(ip)ipCache.set(host,ip);}
 const args=['--silent','--show-error','--max-time',file?'120':'40',...(ip?['--resolve',`${host}:443:${ip}`]:[])];
 if(auth)args.push('-H',`Authorization: Key ${process.env.HF_CREDENTIALS}`);
 if(idempotencyKey)args.push('-H',`Idempotency-Key: ${idempotencyKey}`);
 if(body)args.push('-X','POST','-H','Content-Type: application/json','--data-binary',JSON.stringify(body));
 if(file)args.push('-o',file);
 args.push('-w','\n%{http_code}',url);
 let out;
 try{out=await run('/usr/bin/curl',args,{maxBuffer:4000000});}
 catch(error){throw Error(`Provider transport failed (exit ${Number(error.code)||'unknown'}). Request state must be reconciled; no automatic submit retry.`);}
 const split=out.stdout.lastIndexOf('\n'),status=Number(out.stdout.slice(split+1)),text=out.stdout.slice(0,split);
 if(status<200||status>=300)throw Error(`Provider HTTP ${status}: ${text.replaceAll(process.env.HF_CREDENTIALS,'[redacted]').slice(0,250)}`);
 return file?null:JSON.parse(text);
}
try{
 for(const b of inputs){
  const existing=state.jobs.find(j=>j.brandId===b.id);
  if(existing){if(!existing.requestId)throw Error(`Ambiguous earlier ${b.name} submit. Reconcile before any further paid request.`);continue;}
  const estimate=await request(`https://api.higgsfield.ai/estimate/${model}`,{body:b.input,auth:true});
  const rate=Number(String(estimate.pricing_description||'').match(/720p\s*\$([\d.]+)/)?.[1]);
  if(rate!==0.1||state.estimatedTotalUsd+12*rate>authorization.maxTotalUsd)throw Error('The live quote exceeds or differs from the approved estimate.');
  const callId=randomUUID(),key=`mint-streetwear-v1-${b.id}-${authorization.inputSha256[b.id].slice(0,16)}`;
  const render=store.createRender({title:`${b.name}: London character hoodie pilot`,endpoint:model,input:b.input,group:'Streetwear sample pilots',plan:{taskId:b.taskId,brandId:b.id,sourceSeconds:6,estimatedUsd:1.2,approval:authorization.scope}});
  const job={brandId:b.id,taskId:b.taskId,renderId:render.id,callId,idempotencyKey:key,status:'submitting',submittedAt:new Date().toISOString(),estimatedUsd:1.2};
  state.jobs.push(job);save();
  const task=store.getTask(b.taskId);
  store.updateTask(b.taskId,{status:'ready',summary:'Authorized hoodie sample is rendering. Email remains unsent.',plan:{...task.plan,clientDemo:{...task.plan.clientDemo,stage:'rendering',productionAuthorized:true,productionApproval:authorization,sendingAuthorized:false}}});
  store.updateRender(render.id,{status:'submitting',approved_at:authorization.authorizedAt,estimate_usd:'1.20',submission_key:key,review:'pending'});
  store.addEvent({taskId:b.taskId,type:'tool_call',tool:'higgsfield.genjutsu-light',title:`Render the ${b.name} hoodie pilot`,data:{callId,status:'running',input:{model,resolution:'720p',sourceSeconds:6,inputSha256:authorization.inputSha256[b.id],imageUrls:b.input.image_urls},estimatedUsd:1.2}});
  console.log(`SUBMIT ${b.name}: one six-second 720p repair, estimate $1.20, no retries`);
  let submitted;
  try{submitted=await request(`https://api.higgsfield.ai/${model}`,{body:b.input,auth:true,idempotencyKey:key});}
  catch(error){job.status='submission_ambiguous';job.error=error.message;save();store.updateRender(render.id,{status:'submission_unknown',error:error.message});throw error;}
  writeFileSync(path.join(dir,`${b.id}-submit-response-private.json`),JSON.stringify(submitted,null,2)+'\n');
  if(!submitted.request_id){job.status='submission_ambiguous';save();throw Error('Provider response has no request ID. No resubmission attempted.');}
  job.requestId=submitted.request_id;job.status=submitted.status||'queued';state.estimatedTotalUsd+=1.2;save();
  store.updateRender(render.id,{request_id:job.requestId,status:job.status});
  store.addSpend({provider:'higgsfield',usd:1.2,taskId:b.taskId,renderId:render.id,note:'Genjutsu pilot estimate: 6s input + 6s output at list 720p rate. Itemized actual charge not returned.'});
  store.addCost(b.taskId,1.2);
  console.log(`QUEUED ${b.name}: request ${job.requestId}`);
 }
 const locallyComplete=job=>job.status==='completed'&&job.file&&existsSync(job.file)&&sha(readFileSync(job.file))===job.outputSha256;
 const deadline=Date.now()+20*60*1000;
 while(Date.now()<deadline){
  for(const job of state.jobs.filter(j=>!['failed','canceled','nsfw'].includes(j.status)&&!locallyComplete(j))){
   const out=await request(`https://api.higgsfield.ai/requests/${encodeURIComponent(job.requestId)}/status`,{auth:true});
   writeFileSync(path.join(dir,`${job.brandId}-latest-status-private.json`),JSON.stringify(out,null,2)+'\n');
   if(out.status!==job.status){job.status=out.status;save();store.updateRender(job.renderId,{status:job.status});console.log(`STATUS ${job.brandId}: ${job.status}`);}
   if(job.status==='completed'){
    const url=out.video?.url;if(!url)throw Error('Completed request has no video URL.');
    const file=path.join(dir,`${job.brandId}-genjutsu-raw-v1.mp4`);await request(url,{file});
    job.file=file;job.completedAt=new Date().toISOString();job.outputSha256=sha(readFileSync(file));
    const target=path.join(root,'agent/.data/renders',`${job.brandId}-genjutsu-raw-v1.mp4`);mkdirSync(path.dirname(target),{recursive:true});writeFileSync(target,readFileSync(file));
    store.updateRender(job.renderId,{local_file:path.basename(target),result_url:url,review:'pending'});save();
    store.addEvent({taskId:job.taskId,type:'tool_result',tool:'higgsfield.genjutsu-light',title:`${job.brandId} hoodie render completed; QA pending`,data:{callId:job.callId,status:'success',output:{requestId:job.requestId,sha256:job.outputSha256,renderId:job.renderId,review:'pending'},estimatedUsd:1.2,actualItemizedUsd:null}});
    console.log(`COMPLETED ${job.brandId}: ${file}`);
   }else if(['failed','canceled','nsfw'].includes(job.status)){
    job.error=String(out.error||job.status);save();store.updateRender(job.renderId,{error:job.error});
    store.addEvent({taskId:job.taskId,type:'tool_result',tool:'higgsfield.genjutsu-light',title:`${job.brandId} pilot ${job.status}; no retry`,data:{callId:job.callId,status:'error',error:job.error}});
   }
  }
  if(state.jobs.every(j=>locallyComplete(j)||['failed','canceled','nsfw'].includes(j.status)))break;
  await new Promise(resolve=>setTimeout(resolve,5000));
 }
 console.log(JSON.stringify({jobs:state.jobs.map(j=>({brand:j.brandId,status:j.status,requestId:j.requestId})),estimatedTotalUsd:state.estimatedTotalUsd,actualItemizedUsd:null,globalPauseUnchanged:true,sends:0}));
}finally{store.db.close();releaseLock();}
