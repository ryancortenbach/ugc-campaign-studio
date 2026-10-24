// One explicitly authorized opening repair. Completed later footage stays local and unchanged.
import {readFileSync,writeFileSync,mkdirSync,existsSync,openSync,closeSync,unlinkSync} from 'node:fs';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {openStore} from '../agent/store.mjs';
const root=path.resolve(import.meta.dirname,'..'),work=path.join(root,'work/streetwear-demo-v1');
const stateFile=path.join(work,'disobedient-opening-state-v3.json'),lock=path.join(work,'disobedient-opening-v3.lock');
const authorization=JSON.parse(readFileSync(path.join(root,'research_notes/streetwear-demo-v1/disobedient-opening-authorization-v3.json')));
const endpoint='higgsfield/genjutsu-light/object-swap/v1.0',run=promisify(execFile),hash=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
if(!process.env.HF_CREDENTIALS)throw Error('Provider credentials unavailable.');
if(authorization.maxAdditionalUsd!==1.3||authorization.authorizedBy!=='user'||!authorization.generateAuthorized)throw Error('Bounded opening-repair authorization required.');
let fd;try{fd=openSync(lock,'wx');}catch{throw Error('An opening repair already owns the execution lock. Reconcile before running again.');}
writeFileSync(fd,JSON.stringify({pid:process.pid,startedAt:new Date().toISOString()}));
const release=()=>{if(fd!==undefined){closeSync(fd);fd=undefined;unlinkSync(lock);}};process.once('exit',release);
const store=openStore(),ips=new Map(),state=existsSync(stateFile)?JSON.parse(readFileSync(stateFile)):{version:3,status:'preparing',uploads:{}};
const save=()=>writeFileSync(stateFile,JSON.stringify(state,null,2)+'\n');
const clean=text=>String(text).replaceAll(process.env.HF_CREDENTIALS,'[redacted]').replace(/https:\/\/[^\s"']+\?[^\s"']+/g,'[signed-url-redacted]').slice(0,250);
async function request(url,{auth=false,body,upload,headers={},file,idempotencyKey}={}){
 const host=new URL(url).hostname;if(new URL(url).protocol!=='https:')throw Error('HTTPS is required.');
 if(auth&&host!=='api.higgsfield.ai')throw Error('Provider credentials cannot be sent to a storage host.');
 let ip=ips.get(host);if(!ip){const dns=await run('/usr/bin/dig',['+short','+time=2','+tries=1','@10.104.0.1',host,'A']);ip=dns.stdout.split(/\s+/).find(v=>/^\d+\.\d+\.\d+\.\d+$/.test(v));if(ip)ips.set(host,ip);}
 const args=['--silent','--show-error','--max-time','90',...(ip?['--resolve',`${host}:443:${ip}`]:[])];
 if(auth)args.push('-H',`Authorization: Key ${process.env.HF_CREDENTIALS}`);
 for(const [key,value] of Object.entries(headers)){if(/authorization|cookie/i.test(key))throw Error('Unexpected storage authorization header.');args.push('-H',`${key}: ${value}`);}
 if(idempotencyKey)args.push('-H',`Idempotency-Key: ${idempotencyKey}`);
 if(body)args.push('-X','POST','-H','Content-Type: application/json','--data-binary',JSON.stringify(body));
 if(upload)args.push('-X','PUT','--upload-file',upload);
 if(file)args.push('-o',file);
 args.push('-w','\n%{http_code}',url);
 let result;try{result=await run('/usr/bin/curl',args,{maxBuffer:5000000});}catch(error){throw Error(`Transport failed (exit ${Number(error.code)||'unknown'}). No automatic submit retry.`);}
 const split=result.stdout.lastIndexOf('\n'),status=Number(result.stdout.slice(split+1)),text=result.stdout.slice(0,split);
 if(status<200||status>=300)throw Error(`Provider/storage HTTP ${status}: ${clean(text)}`);
 return upload||file?null:JSON.parse(text);
}
async function upload(name,file,contentType){
 const sha=hash(file),saved=state.uploads[name];if(saved?.sha256===sha)return saved.url;
 const signed=await request('https://api.higgsfield.ai/files/generate-upload-url',{auth:true,body:{content_type:contentType}});
 if(!signed.upload_url||!signed.public_url||!signed.upload_headers)throw Error('Incomplete upload metadata.');
 await request(signed.upload_url,{upload:file,headers:signed.upload_headers});
 state.uploads[name]={url:signed.public_url,sha256:sha};save();console.log(`UPLOADED ${name}: content verified locally, URL kept private`);return signed.public_url;
}
try{
 const opening=path.join(work,'disobedient-opening-input-v3.mp4'),anchor=path.join(work,'disobedient-printed-anchor-v3.png');
 if(hash(opening)!==authorization.openingSha256||hash(anchor)!==authorization.anchorSha256)throw Error('The approved media changed.');
 const prompt=readFileSync(path.join(root,'research_notes/streetwear-demo-v1/disobedient-opening-prompt-v3.txt'),'utf8').trim();
 if(createHash('sha256').update(prompt).digest('hex')!==authorization.promptSha256)throw Error('The approved prompt changed.');
 const videoUrl=await upload('opening',opening,'video/mp4'),imageUrl=await upload('printed-garment-anchor',anchor,'image/png');
 const input={prompt,video_url:videoUrl,image_urls:[imageUrl],resolution:'720p'};
 if(!state.requestId){
  if(state.status==='submitting'||state.status==='submission_unknown')throw Error('An earlier submission is uncertain. No automatic retry.');
  const estimate=await request(`https://api.higgsfield.ai/estimate/${endpoint}`,{auth:true,body:input});
  state.estimate=estimate;save();
  const rate=Number(String(estimate.pricing_description||'').match(/720p\s*\$([\d.]+)/)?.[1]);
  const upper=12*rate;if(rate!==.1||upper>authorization.maxAdditionalUsd)throw Error('Current quote differs from the authorized price.');
  state.estimatedUsd=upper;save();console.log(`QUOTE opening repair: about $${upper.toFixed(2)}, authorized ceiling $1.30`);
  if(!process.argv.includes('--execute')){console.log('PREPARED: no generation submitted');process.exit(0);}
  const render=store.createRender({title:'Disobedient: consistent printed hoodie opening v3',endpoint,input,group:'Streetwear sample pilots',plan:{taskId:10,brandId:'disobedient',sourceSeconds:5.5,estimatedUsd:upper,repair:'Opening only. Preserve original last 0.5s locally.',approval:authorization.instruction}});
  const key=`mint-disobedient-opening-v3-${authorization.promptSha256.slice(0,18)}`;
  Object.assign(state,{status:'submitting',renderId:render.id,callId:'disobedient-opening-v3',submittedAt:new Date().toISOString(),submissionKey:key});save();
  store.updateRender(render.id,{status:'submitting',approved_at:authorization.authorizedAt,estimate_usd:upper.toFixed(2),submission_key:key});
  const task=store.getTask(10);store.updateTask(10,{summary:'Repairing the blank opening to match the later printed hoodie. No CTA or email send.',plan:{...task.plan,clientDemo:{...task.plan.clientDemo,stage:'rendering'}}});
  store.addEvent({taskId:10,type:'tool_call',tool:'higgsfield.genjutsu-light',title:'Repair opening shots to match the later printed hoodie',data:{callId:state.callId,status:'running',input:{endpoint,sourceSeconds:5.5,anchorSha256:authorization.anchorSha256,prompt},estimatedUsd:upper}});
  let submitted;try{submitted=await request(`https://api.higgsfield.ai/${endpoint}`,{auth:true,body:input,idempotencyKey:key});}catch(error){state.status='submission_unknown';state.error=clean(error.message);save();store.updateRender(render.id,{status:'submission_unknown',error:state.error});throw error;}
  if(!submitted.request_id){state.status='submission_unknown';save();throw Error('Provider receipt has no request ID. No retry submitted.');}
  state.requestId=submitted.request_id;state.status=submitted.status||'queued';save();
  store.updateRender(render.id,{request_id:state.requestId,status:state.status});store.addSpend({provider:'higgsfield',usd:upper,taskId:10,renderId:render.id,note:'Opening repair v3 estimate only; actual itemized charge unknown.'});store.addCost(10,upper);
  console.log(`SUBMITTED one opening repair: ${state.requestId}`);
 }
 const deadline=Date.now()+20*60*1000;
 while(Date.now()<deadline){
  if(state.status==='completed'&&state.file&&existsSync(state.file)&&hash(state.file)===state.outputSha256)break;
  if(['failed','nsfw','canceled'].includes(state.status))break;
  const out=await request(`https://api.higgsfield.ai/requests/${encodeURIComponent(state.requestId)}/status`,{auth:true});
  if(state.status!==out.status){state.status=out.status;save();store.updateRender(state.renderId,{status:state.status});console.log(`STATUS ${state.status}`);}
  if(out.status==='completed'){
   if(!out.video?.url)throw Error('Completed job has no video URL.');
   const file=path.join(work,'disobedient-opening-raw-v3.mp4');await request(out.video.url,{file});
   Object.assign(state,{file,outputSha256:hash(file),completedAt:new Date().toISOString()});save();
   // Leave review pending until the opening is joined to the preserved tail and visually checked.
   store.addEvent({taskId:10,type:'tool_result',tool:'higgsfield.genjutsu-light',title:'Opening repair completed; joining and visual review pending',data:{callId:state.callId,status:'success',output:{requestId:state.requestId,renderId:state.renderId,outputSha256:state.outputSha256}}});
   console.log(`COMPLETED opening repair: ${file}`);break;
  }
  if(['failed','nsfw','canceled'].includes(out.status)){
   state.error=clean(out.error||out.status);save();store.updateRender(state.renderId,{error:state.error});store.addEvent({taskId:10,type:'tool_result',tool:'higgsfield.genjutsu-light',title:'Opening repair failed; no automatic retry',data:{callId:state.callId,status:'error',error:state.error}});console.log(`FAILED ${state.error}`);break;
  }
  await new Promise(resolve=>setTimeout(resolve,5000));
 }
 console.log(JSON.stringify({status:state.status,requestId:state.requestId,renderId:state.renderId,automaticRetries:0,sends:0}));
}finally{store.db.close();release();}
