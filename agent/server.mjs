import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {readFileSync,statSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {openStore,dataDir} from './store.mjs';
import {createRunner,realTools} from './runner.mjs';
import {saveProfile} from './brain.mjs';
import {models,llmEnabled,withModel,mainModels} from './tools/llm.mjs';
import {saveUpload,getUpload,uploadDir} from './tools/uploads.mjs';
import * as hf from './tools/higgsfield.mjs';
import * as boards from './storyboard.mjs';
import * as eleven from './tools/elevenlabs.mjs';
import {checkVoice as defaultCheckVoice} from './voicecheck.mjs';
import * as gmailTools from './tools/gmail.mjs';
import {videoTools,prepareLeadVideo} from './ugc.mjs';
import {resolveLogo,readLogo} from './logo.mjs';
import {createAssistant} from './assistant.mjs';
import {createAutopilot} from './autopilot.mjs';
import {createSentWatch} from './sentwatch.mjs';
import {createRequalifier} from './quality.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const pub=path.join(here,'public'),shots=path.join(dataDir,'shots'),renderDir=path.join(dataDir,'renders'),logoDir=path.join(dataDir,'logos');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.gif':'image/gif','.webp':'image/webp','.mp4':'video/mp4','.mp3':'audio/mpeg'};
// Chat requests may name a writing model and attached files from /api/uploads.
const chatModel=b=>{if(b.model==null||b.model==='')return null;if(!mainModels.includes(b.model))throw Object.assign(Error('Pick Sonnet 5.5 or Haiku 5.5.'),{status:400});return b.model;};
const chatFiles=b=>{const ids=Array.isArray(b.attachments)?b.attachments:[];if(ids.length>5)throw Object.assign(Error('Attach up to 5 files.'),{status:400});return ids.map(id=>{const u=getUpload(id);if(!u)throw Object.assign(Error('An attached file is missing. Attach it again.'),{status:400});return u;});};
class Raw{constructor(type,data,headers={}){this.type=type;this.data=data;this.headers=headers;}}
export function createApp({store=openStore(),runner,higgsfield=hf,checkVoice=defaultCheckVoice,gmailApi=gmailTools,video,logoNet={},autopilot,assistant,requalifier}={}){
 runner??=createRunner(store);
 autopilot??=createAutopilot({store,runner});
 assistant??=createAssistant({store,runner});
 requalifier??=createRequalifier({store,tools:realTools});
 video??=videoTools(higgsfield);
 const integrations=()=>{
  const gmail=realTools.gmailEnabled()?realTools.draftAccount():null,solari=realTools.siteMode()==='solari',whop=Boolean(process.env.WHOP_API_KEY);
  return [
   {id:'claude',name:'Claude',on:llmEnabled(),detail:llmEnabled()?'Sonnet 5.5 plans and writes. Haiku 5.5 grades.':'Add ANTHROPIC_API_KEY'},
   {id:'exa',name:'Exa',on:true,detail:realTools.exaMode()==='rest'?'Brand search':'Free search'},
   {id:'solari',name:'Solari',on:solari,detail:solari?'Cloud browsers visit brand sites':'Add SOLARI_API_KEY'},
   {id:'gmail',name:'Gmail',on:Boolean(gmail),detail:gmail?`Drafts in ${gmail}. Never sent.`:'Add a Gmail token'},
   {id:'higgsfield',name:'Higgsfield',on:higgsfield.higgsfieldEnabled(),detail:higgsfield.higgsfieldEnabled()?'Renders only after your approval':'Add HF_CREDENTIALS'},
   {id:'whop',name:'Whop',on:whop,detail:whop?'Watching Mint Labs purchases':'Add WHOP_API_KEY'},
   {id:'elevenlabs',name:'ElevenLabs',on:eleven.elevenEnabled(),detail:eleven.elevenEnabled()?'Voices are made only when you click':'Add ELEVENLABS_API_KEY'}
  ];
 };
 const config=()=>({brain:realTools.brainMode(),models,mainModels,exa:realTools.exaMode(),sites:realTools.siteMode(),gmail:realTools.gmailEnabled()?realTools.draftAccount():null,higgsfield:higgsfield.higgsfieldEnabled(),checkers:llmEnabled(),integrations:integrations(),profile:realTools.loadProfile(),stats:store.stats()});
 // Renders whose approve request is still waiting on Higgsfield in this process. A submitting row missing here was cut off by a restart.
 const inFlight=new Set();
 // Applies one Higgsfield status answer. Returns true while the render is still running.
 async function applyStatus(id,s){
  if(s.status!==store.getRender(id).status)store.updateRender(id,{status:s.status});
  if(s.status==='completed'){const url=s.video?.url||s.images?.[0]?.url||null;let local=null;if(url){try{local=path.basename(await higgsfield.download(url,renderDir,`render-${id}.mp4`));}catch(e){store.updateRender(id,{error:e.message});}}store.updateRender(id,{result_url:url,local_file:local,review:'pending'});{const done=store.getRender(id),l=done.lead_id&&store.getLead(done.lead_id);if(l)leadLog(l,'status',`The video for ${l.company} finished rendering. Review it to put it on the email draft.`,{tool:'higgsfield'});}return false;}
  if(['failed','nsfw','canceled'].includes(s.status)){store.updateRender(id,{error:s.error||s.status});return false;}
  return true;
 }
 // ElevenLabs bills in characters, and its API returns no price. Dollars are estimated only when the plan invoice gives one, otherwise the ledger row records usage with zero dollars.
 let subCache=null,designing=false;
 const subscription=async()=>{if(subCache&&Date.now()-subCache.at<30000)return subCache.value;const value=await eleven.subscription();subCache={at:Date.now(),value};return value;};
 const voiceSpend=async({characters,note,storyboardId=null})=>{let per=null;try{per=(await eleven.subscription()).usdPerChar;}catch{}const usd=per&&characters?characters*per:0;if(usd>0)store.addSpend({provider:'elevenlabs',usd,storyboardId,note:`${note}, ${characters} characters (estimated from plan price)`});else store.addUsage({provider:'elevenlabs',storyboardId,note:`${note}, ${characters} characters (dollars unknown)`});subCache=null;};
 const voiceOr404=id=>{const v=store.getVoice(id);if(!v)throw Object.assign(Error('No such voice'),{status:404});return v;};

 // Lead videos. A render with a lead_id is a personalized outreach video: when Ryan approves the finished scene its mp4 goes onto
 // that lead's Gmail draft (created now, or the existing draft rewritten in place). Drafts only: nothing here sends or deletes.
 const leadLog=(lead,type,title,extra={})=>store.addEvent({taskId:lead.task_id,leadId:lead.id,type,title,...extra});
 const attaching=new Set(),preparing=new Set();
 async function attachVideo(r){
  const lead=store.getLead(r.lead_id);if(!lead)return {status:'skipped',message:'The lead for this video no longer exists.'};
  const draft=store.listDrafts({leadId:lead.id}).find(d=>d.status!=='sent')||null;
  if(!draft){leadLog(lead,'error',`Video approved for ${lead.company}, but its email was already sent or is missing. Nothing was attached.`,{tool:'gmail.drafts'});return {status:'skipped',message:'No unsent draft to attach the video to.'};}
  if(draft.render_id===r.id&&draft.status==='gmail_draft')return {status:'already_attached',draft,lead};
  if(attaching.has(r.id))return {status:'busy',message:'This video is already being attached.'};
  attaching.add(r.id);
  try{
   let attachment=null,why=null;
   const file=r.local_file?path.join(renderDir,path.basename(r.local_file)):null;
   try{const st=file&&statSync(file);if(!st||!st.isFile())why='the video file is missing';else if(st.size>gmailApi.MAX_ATTACH_BYTES)why=`the video is ${(st.size/1048576).toFixed(1)} MB, over the ${gmailApi.MAX_ATTACH_BYTES/1048576} MB limit`;else attachment={filename:`${(lead.domain||'brand').replace(/[^a-z0-9.-]/gi,'-')}-video.mp4`,mime:'video/mp4',data:readFileSync(file)};}catch{why='the video file is missing';}
   const link=r.result_url?`\n\nP.S. A short video made for ${lead.company}: ${r.result_url}`:'';
   if(!attachment&&!link){leadLog(lead,'error',`Video approved for ${lead.company}, but ${why} and there is no link either. Gmail draft not changed.`,{tool:'gmail.drafts'});return {status:'failed',message:`Cannot attach: ${why}, and no video link is saved.`};}
   const send=async withFile=>{
    const body=withFile?draft.body:draft.body+link;
    const fields={to:draft.to_email,subject:draft.subject,body,attachment:withFile?attachment:null};
    let res;
    if(draft.status==='gmail_draft'&&draft.gmail_draft_id){
     leadLog(lead,'tool_call',`Updating the Gmail draft for ${lead.company} with its video`,{tool:'gmail.drafts.update'});
     try{res=await gmailApi.updateDraft({draftId:draft.gmail_draft_id,...fields});}
     catch(e){if(e.status!==404)throw e;leadLog(lead,'error',`The old Gmail draft is gone (404), so a new one is created instead.`,{tool:'gmail.drafts.update'});res=await gmailApi.createDraft(fields);}
    }else{
     leadLog(lead,'tool_call',`Saving the Gmail draft for ${lead.company} with its video`,{tool:'gmail.drafts.create'});
     res=await gmailApi.createDraft(fields);
    }
    return {res,body};
   };
   let sent,linked=!attachment;
   if(!gmailApi.gmailEnabled()){
    const body=draft.body+link;
    store.updateDraft(draft.id,{status:'crm_only',body,render_id:r.id});
    if(lead.status==='awaiting_video')store.updateLead(lead.id,{status:'drafted'});
    leadLog(lead,'draft',`Video approved for ${lead.company}. Gmail is not configured, so the email with the video link is saved in the CRM only. Not sent.`,{tool:'crm'});
    return {status:'crm_only',draft:store.getDraft(draft.id),lead:store.getLead(lead.id)};
   }
   try{sent=await send(Boolean(attachment));}
   catch(e){
    if(!attachment||!link)throw e;
    leadLog(lead,'error',`Gmail refused the video attachment (${e.message}). Falling back to the video link in the body.`,{tool:'gmail.drafts'});
    linked=true;sent=await send(false);
   }
   store.updateDraft(draft.id,{status:'gmail_draft',gmail_draft_id:sent.res.draftId,gmail_url:sent.res.url,render_id:r.id,body:sent.body});
   if(lead.status==='awaiting_video')store.updateLead(lead.id,{status:'drafted'});
   leadLog(lead,'draft',linked?`Draft ready in Gmail for ${draft.to_email} with the video link in the body${why?` (${why})`:''}. Not sent.`:`Draft ready in Gmail for ${draft.to_email} with the video attached. Not sent.`,{tool:'gmail.drafts',data:{subject:draft.subject,body:sent.body,gmailUrl:sent.res.url,renderId:r.id,attached:!linked}});
   return {status:linked?'linked':'attached',draft:store.getDraft(draft.id),lead:store.getLead(lead.id)};
  }catch(e){
   leadLog(lead,'error',`Could not put the video on the Gmail draft for ${lead.company}: ${e.message}. Approve the scene again to retry.`,{tool:'gmail.drafts'});
   return {status:'failed',message:e.message};
  }finally{attaching.delete(r.id);}
 }
 const claudeSpend=lead=>(usd,note,renderId)=>{if(usd){if(lead.task_id)store.addCost(lead.task_id,usd);store.addSpend({provider:'claude',usd,taskId:lead.task_id||null,renderId,note});}};
 async function pollRender(id){
  for(let i=0;i<180;i++){
   const r=store.getRender(id);if(!r?.request_id||!['queued','in_progress'].includes(r.status))return;
   await new Promise(res=>setTimeout(res,Math.min(10000,2000+i*1000)));
   try{if(!await applyStatus(id,await higgsfield.status(r.request_id)))return;}catch(e){store.updateRender(id,{error:e.message});}
  }
 }
 const routes=[
  ['GET',/^\/api\/state$/,()=>({config:config(),tasks:store.listTasks()})],
  ['POST',/^\/api\/chat$/,(m,b)=>{const text=String(b.message||'').trim();if(text.length<3||text.length>2000)throw Object.assign(Error('Write a request between 3 and 2000 characters.'),{status:400});return {task:runner.start(text,{model:chatModel(b),attachments:chatFiles(b)})};}],
  ['POST',/^\/api\/uploads$/,(m,b)=>({upload:saveUpload(b)})],
  ['GET',/^\/api\/tasks\/(\d+)$/,m=>{const id=Number(m[1]);const task=store.getTask(id);if(!task)throw Object.assign(Error('No such task'),{status:404});return {task,running:runner.isRunning(id),events:store.listEvents({taskId:id}),steers:store.listSteers(id),leads:store.listLeads({taskId:id}),drafts:store.listDrafts({taskId:id})};}],
  ['POST',/^\/api\/tasks\/(\d+)\/steer$/,(m,b)=>{const text=String(b.message||'').trim();if(!text)throw Object.assign(Error('Write a steering message.'),{status:400});return runner.steer(Number(m[1]),text);}],
  ['POST',/^\/api\/tasks\/(\d+)\/control$/,(m,b)=>{if(!['pause','resume','stop'].includes(b.action))throw Object.assign(Error('Unknown action'),{status:400});return {ok:runner.control(Number(m[1]),b.action)};}],
  ['GET',/^\/api\/assistant$/,()=>({messages:assistant.history(),enabled:llmEnabled(),mainModels})],
  ['POST',/^\/api\/assistant$/,async(m,b)=>{if(!llmEnabled())throw Object.assign(Error('Add ANTHROPIC_API_KEY to talk to Mint.'),{status:503});const message=String(b.message??'').trim();if(message.length<1||message.length>4000)throw Object.assign(Error('Write a message between 1 and 4000 characters.'),{status:400});if(b.model!=null&&b.model!==''&&!mainModels.includes(b.model))throw Object.assign(Error('Pick Sonnet 5.5 or Haiku 5.5.'),{status:400});return await assistant.reply({message,model:b.model||null});}],
  ['GET',/^\/api\/autopilot$/,()=>autopilot.get()],
  ['POST',/^\/api\/autopilot$/,(m,b)=>{
   const bad=t=>Object.assign(Error(t),{status:400}),patch={};
   if('enabled' in b){if(typeof b.enabled!=='boolean')throw bad('enabled must be true or false');patch.enabled=b.enabled;}
   if('goal' in b){if(typeof b.goal!=='string'||b.goal.length>2000)throw bad('Keep the goal under 2000 characters.');patch.goal=b.goal;}
   if('model' in b){if(b.model&&!mainModels.includes(b.model))throw bad('Pick Sonnet 5.5 or Haiku 5.5.');patch.model=b.model||null;}
   if('dailyBudgetUsd' in b){const n=Number(b.dailyBudgetUsd);if(!Number.isFinite(n)||n<0.5||n>50)throw bad('Daily budget must be between $0.50 and $50.');patch.dailyBudgetUsd=n;}
   if('pauseMinutes' in b){const n=Number(b.pauseMinutes);if(!Number.isFinite(n)||n<5||n>240)throw bad('Pause must be between 5 and 240 minutes.');patch.pauseMinutes=n;}
   return autopilot.set(patch);
  }],
  ['GET',/^\/api\/spend$/,()=>store.spendSummary()],
  ['GET',/^\/api\/metrics$/,(m,b,url)=>{const range=url.searchParams.get('range')||'week';if(!['today','week','month','year'].includes(range))throw Object.assign(Error('Range is today, week, month or year.'),{status:400});return store.metrics(range);}],
  ['GET',/^\/api\/events$/,()=>({events:store.listEvents({limit:150})})],
  ['GET',/^\/api\/leads$/,()=>({leads:store.listLeads()})],
  // Re-grades leads from before the quality gate. Marks rejects only: nothing is deleted and Gmail is never called.
  ['POST',/^\/api\/leads\/requalify$/,()=>requalifier.run()],
  ['GET',/^\/api\/drafts$/,()=>({drafts:store.listDrafts().map(d=>{const l=store.getLead(d.lead_id)||{};return {...d,company:l.company,domain:l.domain,screenshot:l.screenshot};})})],
  ['POST',/^\/api\/drafts\/(\d+)\/sent$/,m=>{const d=store.markDraftSent(Number(m[1]));if(!d)throw Object.assign(Error('No such draft'),{status:404});return {draft:d};}],
  ['GET',/^\/api\/leads\/(\d+)$/,m=>{const lead=store.getLead(Number(m[1]));if(!lead)throw Object.assign(Error('No such lead'),{status:404});return {lead,events:store.listEvents({leadId:lead.id}),drafts:store.listDrafts({leadId:lead.id}),renders:store.listRenders({leadId:lead.id})};}],
  ['POST',/^\/api\/leads\/(\d+)\/video$/,async m=>{
   const lead=store.getLead(Number(m[1]));if(!lead)throw Object.assign(Error('No such lead'),{status:404});
   if(!['drafted','awaiting_video'].includes(lead.status))throw Object.assign(Error(`A video can be made for drafted or awaiting_video leads, not ${lead.status}.`),{status:409});
   const ready=video.enabled();
   if(!ready.ok){leadLog(lead,'decision',`No video made for ${lead.company}: ${ready.reason}.`,{tool:'higgsfield'});throw Object.assign(Error(`${ready.reason}.`),{status:503});}
   const draft=store.listDrafts({leadId:lead.id})[0];
   if(draft?.render_id&&draft.status==='gmail_draft')throw Object.assign(Error('This lead already has a video on its draft.'),{status:409});
   const busy=store.listRenders({leadId:lead.id}).find(x=>!['checks_failed','failed','nsfw','canceled','submission_unknown'].includes(x.status)&&x.review!=='rejected');
   if(busy||preparing.has(lead.id))throw Object.assign(Error(`This lead already has a video in progress (render ${busy?.id??'starting'}). Finish or reject it first.`),{status:409});
   preparing.add(lead.id);
   try{
    const out=await prepareLeadVideo({store,lead,ctx:{company:lead.company||lead.domain,url:lead.url,offer:realTools.loadProfile().offer,personalDetail:'',reasons:lead.reasons,evidence:[lead.evidence,lead.notes].filter(Boolean).join('\n'),homeText:''},video,spend:claudeSpend(lead),log:(type,title,extra={})=>leadLog(lead,type,title,extra)});
    return {render:out.render,failed:Boolean(out.failed),lead:store.getLead(lead.id)};
   }finally{preparing.delete(lead.id);}
  }],
  ['GET',/^\/api\/leads\/(\d+)\/logo$/,async m=>{
   const lead=store.getLead(Number(m[1]));if(!lead)throw Object.assign(Error('No such lead'),{status:404});
   const hit=await resolveLogo({lead,dir:logoDir,...logoNet,onSpend:(usd,estimated)=>store.addSpend({provider:'exa',usd,taskId:lead.task_id||null,note:`logo lookup (contents)${estimated?', price estimated':''}`})});
   if(!hit)throw Object.assign(Error('No logo found'),{status:404});
   return new Raw(hit.type,readLogo(hit).data,{'Cache-Control':'public, max-age=86400','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; sandbox"});
  }],
  ['POST',/^\/api\/leads\/(\d+)$/,(m,b)=>{const allowed=['found','awaiting_video','drafted','contacted','replied','won','lost','skipped'];const fields={};if(b.status!==undefined){if(!allowed.includes(b.status))throw Object.assign(Error('Unknown status'),{status:400});fields.status=b.status;}if(typeof b.notes==='string')fields.notes=b.notes.slice(0,4000);return {lead:store.updateLead(Number(m[1]),fields)};}],
  ['POST',/^\/api\/profile$/,(m,b)=>({profile:saveProfile(b)})],
  ['GET',/^\/api\/renders$/,()=>({renders:store.listRenders().map(r=>r.status==='submitting'&&!inFlight.has(r.id)?{...r,stale:true}:r),enabled:higgsfield.higgsfieldEnabled()})],
  ['POST',/^\/api\/renders$/,(m,b)=>{const prompt=String(b.prompt||'').trim();if(prompt.length<10)throw Object.assign(Error('Write a shot prompt of at least 10 characters.'),{status:400});const input=higgsfield.buildInput({prompt,imageUrl:b.imageUrl||null,duration:b.duration,resolution:b.resolution});return {render:store.createRender({title:String(b.title||'Untitled shot').slice(0,120),endpoint:input.image_url?higgsfield.endpoints['image-to-video']:higgsfield.endpoints['text-to-video'],input})};}],
  ['GET',/^\/api\/voices$/,async()=>{const enabled=eleven.elevenEnabled();let sub=null,error=null;if(enabled){try{sub=await subscription();}catch(e){error=e.message;}}return {voices:store.listVoices(),enabled,subscription:sub,error};}],
  ['POST',/^\/api\/voices\/design$/,async(m,b)=>{
   const description=String(b.description||'').trim(),line=String(b.line||'').trim(),storyboardId=b.storyboardId?Number(b.storyboardId):null;
   if(description.length<20||description.length>1000)throw Object.assign(Error('Describe the voice in 20 to 1000 characters: age, gender, accent, tone and pace.'),{status:400});
   if(line.length<eleven.LINE_MIN||line.length>eleven.LINE_MAX)throw Object.assign(Error(`Write a sample line of ${eleven.LINE_MIN} to ${eleven.LINE_MAX} characters. ElevenLabs needs at least ${eleven.LINE_MIN} to design a voice.`),{status:400});
   if(storyboardId&&!store.getStoryboard(storyboardId))throw Object.assign(Error('No such storyboard'),{status:404});
   if(!eleven.elevenEnabled())throw Object.assign(Error('Add ELEVENLABS_API_KEY or ~/.elevenlabs/key'),{status:503});
   if(designing)throw Object.assign(Error('A voice design is already running.'),{status:409});
   designing=true;
   try{
    const out=await eleven.designVoices({description,text:line});
    await voiceSpend({characters:out.characters,note:'voice design',storyboardId});
    const short=description.split(/\s+/).slice(0,4).join(' ').slice(0,40);
    return {voices:out.previews.map((p,i)=>store.createVoice({name:`${short} ${i+1}`,description,line:out.text,generatedVoiceId:p.generatedVoiceId,sampleFile:p.file,storyboardId,characters:i===0?out.characters:0}))};
   }finally{designing=false;}
  }],
  ['POST',/^\/api\/voices\/(\d+)\/check$/,async(m,b)=>{
   const v=voiceOr404(Number(m[1]));
   if(v.status==='checking')throw Object.assign(Error('Checks are already running.'),{status:409});
   if(!v.sample_file)throw Object.assign(Error('This voice has no sample to check.'),{status:409});
   if(!llmEnabled())throw Object.assign(Error('Voice checks need ANTHROPIC_API_KEY'),{status:503});
   if(!eleven.elevenEnabled()&&!v.checks?.transcript)throw Object.assign(Error('Add ELEVENLABS_API_KEY or ~/.elevenlabs/key'),{status:503});
   store.updateVoice(v.id,{status:'checking'});
   try{
    const audio=readFileSync(path.join(eleven.voiceDir(),v.sample_file)),sb=v.storyboard_id?store.getStoryboard(v.storyboard_id):null;
    // A stored transcript is reused so a rerun does not pay for speech to text again, unless the operator asks for a fresh one.
    const checks=await checkVoice({voice:v,audio,spec:sb?.plan?.voice||v.description,cachedTranscript:b.retranscribe?null:v.checks?.transcript||null});
    if(checks.transcribed)store.addUsage({provider:'elevenlabs',storyboardId:v.storyboard_id,note:`voice check transcription, ${checks.transcript.durationSecs??'unknown'} seconds of audio (dollars unknown)`});
    store.addSpend({provider:'claude',usd:checks.cost,storyboardId:v.storyboard_id,note:'voice checkers'});
    return {voice:store.updateVoice(v.id,{status:v.status==='saved'?'saved':checks.passed?'checks_passed':'checks_failed',checks})};
   }catch(e){store.updateVoice(v.id,{status:v.status});throw e;}
  }],
  ['POST',/^\/api\/voices\/(\d+)\/save$/,async(m,b)=>{
   const v=voiceOr404(Number(m[1]));
   if(v.status==='saved')throw Object.assign(Error('This voice is already saved.'),{status:409});
   if(v.status==='checking')throw Object.assign(Error('Checks are still running.'),{status:409});
   if(v.status!=='checks_passed'&&b.force!==true)throw Object.assign(Error('The checks have to pass before this voice is saved. Save it anyway only if you listened and it is right.'),{status:409});
   if(!v.generated_voice_id)throw Object.assign(Error('This voice has no preview to save.'),{status:409});
   const out=await eleven.saveVoice({generatedVoiceId:v.generated_voice_id,name:String(b.name||v.name).trim().slice(0,100)||v.name,description:v.description});
   subCache=null;
   return {voice:store.updateVoice(v.id,{status:'saved',voice_id:out.voiceId,name:out.name})};
  }],
  ['GET',/^\/api\/storyboards$/,()=>({storyboards:store.listStoryboards()})],
  ['POST',/^\/api\/storyboards$/,async(m,b)=>{const brief=Object.fromEntries(['product','audience','idea','offer','identity','wardrobe','environment','voice','length'].map(k=>[k,String(b[k]??'').slice(0,2000).trim()]).filter(([,v])=>v));if(!brief.product||!brief.idea)throw Object.assign(Error('Describe the product and the video idea.'),{status:400});if(!llmEnabled())throw Object.assign(Error('Storyboards need ANTHROPIC_API_KEY'),{status:503});const files=chatFiles(b);const out=await withModel(chatModel(b),()=>boards.draftStoryboard(brief,{attachments:files}));const sb=store.createStoryboard({title:out.plan.title||brief.product.slice(0,60),brief,plan:out.plan,cost:out.cost});store.addSpend({provider:'claude',usd:out.cost,storyboardId:sb.id,note:'storyboard draft'});return {storyboard:sb};}],
  ['POST',/^\/api\/storyboards\/(\d+)\/check$/,async m=>{const s=store.getStoryboard(Number(m[1]));if(!s)throw Object.assign(Error('No such storyboard'),{status:404});if(s.status==='approved')throw Object.assign(Error('Already approved'),{status:409});store.updateStoryboard(s.id,{status:'checking'});try{const checks=await boards.checkStoryboard(s.plan);store.addSpend({provider:'claude',usd:checks.cost,storyboardId:s.id,note:'storyboard checkers'});return {storyboard:store.updateStoryboard(s.id,{status:checks.passed?'checks_passed':'checks_failed',checks},checks.cost)};}catch(e){store.updateStoryboard(s.id,{status:'draft'});throw e;}}],
  ['POST',/^\/api\/storyboards\/(\d+)\/revise$/,async(m,b)=>{const s=store.getStoryboard(Number(m[1]));if(!s)throw Object.assign(Error('No such storyboard'),{status:404});if(!s.checks&&!String(b.note||'').trim())throw Object.assign(Error('Run the checkers or write a note first.'),{status:409});const out=await boards.reviseStoryboard(s.plan,s.checks||{results:[]},String(b.note||'').slice(0,2000));const sb=store.createStoryboard({title:s.title,brief:s.brief,plan:out.plan,version:s.version+1,parentId:s.id,cost:out.cost});store.addSpend({provider:'claude',usd:out.cost,storyboardId:sb.id,note:'storyboard revision'});return {storyboard:sb};}],
  ['POST',/^\/api\/storyboards\/(\d+)\/approve$/,m=>{const s=store.getStoryboard(Number(m[1]));if(!s)throw Object.assign(Error('No such storyboard'),{status:404});if(s.status!=='checks_passed')throw Object.assign(Error('The checkers have to pass before you can approve it.'),{status:409});const shots=higgsfield.shotsFromStoryboard({brief:{brand:`${s.title} v${s.version}`},storyboard:s.plan});const renders=shots.map(x=>store.createRender({title:x.title,endpoint:higgsfield.endpoints['text-to-video'],input:x.input,group:x.group,shotId:x.shotId}));return {storyboard:store.updateStoryboard(s.id,{status:'approved'}),renders};}],
  ['POST',/^\/api\/renders\/import$/,(m,b)=>{const shots=higgsfield.shotsFromStoryboard(b.packet);return {renders:shots.map(s=>store.createRender({title:s.title,endpoint:s.input.image_url?higgsfield.endpoints['image-to-video']:higgsfield.endpoints['text-to-video'],input:s.input,group:s.group,shotId:s.shotId}))};}],
  ['POST',/^\/api\/renders\/(\d+)\/review$/,async(m,b)=>{const r=store.getRender(Number(m[1]));if(!r)throw Object.assign(Error('No such render'),{status:404});if(r.status!=='completed')throw Object.assign(Error('Only finished renders can be reviewed.'),{status:409});if(!['approved','rejected'].includes(b.decision))throw Object.assign(Error('Choose approve or reject.'),{status:400});const note=String(b.note||'').slice(0,2000);if(b.decision==='rejected'&&!note.trim())throw Object.assign(Error('Say what to fix so the next render can be better.'),{status:400});const render=store.updateRender(r.id,{review:b.decision,review_note:note||null,reviewed_at:new Date().toISOString()});if(b.decision!=='approved'||!render.lead_id)return {render};const attach=await attachVideo(render);return {render,attach,draft:attach.draft||null,lead:attach.lead||store.getLead(render.lead_id)};}],
  ['POST',/^\/api\/renders\/(\d+)\/revise$/,m=>{const r=store.getRender(Number(m[1]));if(!r)throw Object.assign(Error('No such render'),{status:404});if(['submitting','submission_unknown'].includes(r.status))throw Object.assign(Error('Reconcile this render with Higgsfield first. A new version now could pay for the same shot twice.'),{status:409});const prompt=r.review_note?`${r.input.prompt}\n\nFix from review of render ${r.id}: ${r.review_note}`:r.input.prompt;const version=Number(r.title.match(/ \(v(\d+)\)$/)?.[1]||1)+1;return {render:store.createRender({title:`${r.title.replace(/ \(v\d+\)$/,'')} (v${version})`,endpoint:r.endpoint,input:{...r.input,prompt},group:r.group_name,shotId:r.shot_id,leadId:r.lead_id})};}],
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
    const updated=store.updateRender(r.id,{status:submitted.status||'queued',request_id:requestId,error:null});{const l=r.lead_id&&store.getLead(r.lead_id);if(l)leadLog(l,'status',`You approved the video for ${l.company} ($${r.estimate_usd}). It is rendering.`,{tool:'higgsfield'});}pollRender(r.id);return {render:updated};
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
    if(method==='POST'){let raw='';const cap=url.pathname==='/api/uploads'?8000000:64000;for await(const chunk of req){raw+=chunk;if(raw.length>cap)return send(413,{error:'Request too large'});}body=raw?JSON.parse(raw):{};}
    const out=await fn(m,body,url);
    if(out instanceof Raw){res.writeHead(200,{'Content-Type':out.type,...out.headers});return res.end(out.data);}
    return send(200,out);
   }catch(error){return send(error.status||(error instanceof SyntaxError?400:500),{error:error.message});}
  }
  try{
   const [root,rel]=url.pathname.startsWith('/shots/')?[shots,url.pathname.slice(7)]:url.pathname.startsWith('/uploads/')?[uploadDir(),url.pathname.slice(9)]:url.pathname.startsWith('/renders/')?[renderDir,url.pathname.slice(9)]:url.pathname.startsWith('/voices/')?[eleven.voiceDir(),url.pathname.slice(8)]:[pub,url.pathname==='/'?'index.html':url.pathname.slice(1)];
   const file=path.resolve(root,decodeURIComponent(rel));
   if(!file.startsWith(root+path.sep))return send(403,{error:'Forbidden'});
   const data=await readFile(file),type=mime[path.extname(file)]||'application/octet-stream',range=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range||'');
   // Safari and the desktop app only play audio and video from servers that answer byte range requests.
   if(range&&(range[1]||range[2])){const size=data.length,start=range[1]?Number(range[1]):Math.max(0,size-Number(range[2])),end=range[1]&&range[2]?Math.min(size-1,Number(range[2])):size-1;if(start>end||start>=size){res.writeHead(416,{'Content-Range':`bytes */${size}`});return res.end();}res.writeHead(206,{'Content-Type':type,'Content-Range':`bytes ${start}-${end}/${size}`,'Content-Length':end-start+1,'Accept-Ranges':'bytes','X-Content-Type-Options':'nosniff'});return res.end(data.subarray(start,end+1));}
   res.writeHead(200,{'Content-Type':type,'Accept-Ranges':'bytes','X-Content-Type-Options':'nosniff'});res.end(data);
  }catch{send(404,{error:'Not found'});}
 };
}

if(process.argv[1]===fileURLToPath(import.meta.url)){
 const port=Number(process.env.AGENT_PORT||3200);
 // Autopilot and the sent-mail watcher share the app's store and runner, and only run when the server is launched directly.
 const store=openStore(),runner=createRunner(store),autopilot=createAutopilot({store,runner});
 http.createServer(createApp({store,runner,autopilot})).listen(port,'127.0.0.1',()=>{
  console.log(`Mint Labs agent ready at http://127.0.0.1:${port}`);
  autopilot.start();
  if(realTools.gmailEnabled())createSentWatch({store}).start();
 });
}
