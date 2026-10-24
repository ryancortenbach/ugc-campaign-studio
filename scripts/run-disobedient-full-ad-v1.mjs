// Two authorized remaining segments for the complete 30-second ad. No automatic retries.
import {readFileSync,writeFileSync,mkdirSync,existsSync,openSync,closeSync,unlinkSync} from 'node:fs';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {openStore} from '../agent/store.mjs';
const root=path.resolve(import.meta.dirname,'..'),work=path.join(root,'work/disobedient-full-ad-v1');
const stateFile=path.join(work,'generation-state-v1.json'),lock=path.join(work,'generation-v1.lock');
const authorization=JSON.parse(readFileSync(path.join(root,'research_notes/streetwear-demo-v1/disobedient-full-ad-authorization-v1.json')));
const endpoint='higgsfield/genjutsu-light/object-swap/v1.0',run=promisify(execFile),hash=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
if(!process.env.HF_CREDENTIALS||authorization.maxAdditionalUsd!==3.6||!authorization.generateAuthorized||authorization.authorizedBy!=='user')throw Error('Bounded full-ad authorization or credentials unavailable.');
let fd;try{fd=openSync(lock,'wx');}catch{throw Error('A full-ad execution lock exists. Reconcile before restarting.');}
writeFileSync(fd,JSON.stringify({pid:process.pid,startedAt:new Date().toISOString()}));
const release=()=>{if(fd!==undefined){closeSync(fd);fd=undefined;unlinkSync(lock);}};process.once('exit',release);
const store=openStore(),ips=new Map(),state=existsSync(stateFile)?JSON.parse(readFileSync(stateFile)):{version:1,jobs:[],uploads:{},estimatedTotalUsd:0};
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
 const anchor=path.join(root,'work/streetwear-demo-v1/disobedient-printed-anchor-v3.png');
 if(hash(anchor)!==authorization.anchorSha256)throw Error('The printed garment anchor changed.');
 const prompt=readFileSync(path.join(root,'research_notes/streetwear-demo-v1/disobedient-full-ad-prompt-v1.txt'),'utf8').trim();
 const imageUrl=await upload('printed-hoodie',anchor,'image/png');
 for(const name of ['middle-a','middle-b']){
  const file=path.join(work,`${name}-input-v1.mp4`);if(hash(file)!==authorization.inputs[name])throw Error('A bound source segment changed.');
  const prior=state.jobs.find(j=>j.name===name);if(prior){if(!prior.requestId)throw Error('A previous submission is uncertain. No retry.');continue;}
  const videoUrl=await upload(name,file,'video/mp4');
  const input={prompt,video_url:videoUrl,image_urls:[imageUrl],resolution:'720p'};
  const quote=await request(`https://api.higgsfield.ai/estimate/${endpoint}`,{auth:true,body:input});
  const rate=Number(String(quote.pricing_description||'').match(/720p\s*\$([\d.]+)/)?.[1]);
  const usd=Number((18*rate).toFixed(2));
  if(rate!==.1||state.estimatedTotalUsd+usd>authorization.maxAdditionalUsd)throw Error('Live quote exceeds the full-ad authorization.');
  const callId=`disobedient-full-${name}-v1`,key=`mint-${callId}-${hash(file).slice(0,14)}`;
  const render=store.createRender({title:`Disobedient full ad: ${name}`,endpoint,input,group:'Disobedient 30-second ad',plan:{taskId:10,brandId:'disobedient',sourceSeconds:8.6,estimatedUsd:usd,approval:authorization.instruction}});
  const job={name,callId,renderId:render.id,status:'submitting',submittedAt:new Date().toISOString(),estimatedUsd:usd,key};
  state.jobs.push(job);save();store.updateRender(render.id,{status:'submitting',approved_at:authorization.authorizedAt,estimate_usd:usd.toFixed(2),submission_key:key});
  store.addEvent({taskId:10,type:'tool_call',tool:'higgsfield.genjutsu-light',title:`Render the full-ad ${name} section with the same printed hoodie`,data:{callId,status:'running',input:{sourceSeconds:8.6,anchorSha256:authorization.anchorSha256,prompt},estimatedUsd:usd}});
  console.log(`QUOTE ${name}: about $${usd.toFixed(2)}; total ceiling $3.60`);
  let result;try{result=await request(`https://api.higgsfield.ai/${endpoint}`,{auth:true,body:input,idempotencyKey:key});}catch(error){job.status='submission_unknown';job.error=clean(error.message);save();store.updateRender(render.id,{status:'submission_unknown',error:job.error});throw error;}
  if(!result.request_id){job.status='submission_unknown';save();throw Error('No provider request ID. No retry.');}
  Object.assign(job,{requestId:result.request_id,status:result.status||'queued'});state.estimatedTotalUsd+=usd;save();
  store.updateRender(render.id,{request_id:job.requestId,status:job.status});store.addSpend({provider:'higgsfield',usd,taskId:10,renderId:render.id,note:'Full 30-second ad segment estimate only. Actual itemized charge unknown.'});store.addCost(10,usd);
  console.log(`SUBMITTED ${name}: ${job.requestId}`);
 }
 const complete=j=>j.status==='completed'&&j.file&&existsSync(j.file)&&hash(j.file)===j.outputSha256;
 const deadline=Date.now()+20*60*1000;
 while(Date.now()<deadline){
  for(const job of state.jobs.filter(j=>!complete(j)&&!['failed','nsfw','canceled'].includes(j.status))){
   const out=await request(`https://api.higgsfield.ai/requests/${encodeURIComponent(job.requestId)}/status`,{auth:true});
   if(job.status!==out.status){job.status=out.status;save();store.updateRender(job.renderId,{status:job.status});console.log(`STATUS ${job.name}: ${job.status}`);}
   if(out.status==='completed'){
    if(!out.video?.url)throw Error('Completed segment has no video.');
    const file=path.join(work,`${job.name}-raw-v1.mp4`);await request(out.video.url,{file});
    Object.assign(job,{file,outputSha256:hash(file),completedAt:new Date().toISOString()});save();
    store.addEvent({taskId:10,type:'tool_result',tool:'higgsfield.genjutsu-light',title:`Full-ad ${job.name} finished; visual review pending`,data:{callId:job.callId,status:'success',output:{requestId:job.requestId,renderId:job.renderId,sha256:job.outputSha256}}});
    console.log(`COMPLETED ${job.name}`);
   }else if(['failed','nsfw','canceled'].includes(out.status)){
    job.error=clean(out.error||out.status);save();store.updateRender(job.renderId,{error:job.error});
    store.addEvent({taskId:10,type:'tool_result',tool:'higgsfield.genjutsu-light',title:`Full-ad ${job.name} failed; no retry`,data:{callId:job.callId,status:'error',error:job.error}});console.log(`FAILED ${job.name}: ${job.error}`);
   }
  }
  if(state.jobs.every(j=>complete(j)||['failed','nsfw','canceled'].includes(j.status)))break;
  await new Promise(resolve=>setTimeout(resolve,5000));
 }
 console.log(JSON.stringify({jobs:state.jobs.map(j=>({name:j.name,status:j.status,requestId:j.requestId})),estimatedTotalUsd:state.estimatedTotalUsd,sends:0}));
}finally{store.db.close();release();}
