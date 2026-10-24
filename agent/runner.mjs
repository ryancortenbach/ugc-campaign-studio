import path from 'node:path';
import * as brain from './brain.mjs';
import {searchBrands,exaMode,exaFinder} from './tools/exa.mjs';
import {visitSite,siteMode,fetchHomepage} from './tools/site.mjs';
import {createDraft,gmailEnabled,draftAccount} from './tools/gmail.mjs';
import {dataDir} from './store.mjs';
import {withModel} from './tools/llm.mjs';
import {videoTools,prepareLeadVideo} from './ugc.mjs';
import {gateLead,logoGate,companyFrom} from './quality.mjs';
import {findPersonalContact,resolveContact} from './contacts.mjs';

class Stopped extends Error{}
const domainOf=url=>{try{const u=new URL(url);return u.protocol==='https:'||u.protocol==='http:'?u.hostname.replace(/^www\./,'').toLowerCase():null;}catch{return null;}};
const marketplace=/(^|\.)(amazon|etsy|ebay|walmart|target|instagram|facebook|tiktok|youtube|linkedin|reddit|pinterest|x|twitter|medium|substack|yelp|wikipedia|shopify|faire|crunchbase|forbes|nytimes|vogue|timeout|businessinsider|glossy|hypebeast|complex|refinery29)\.[a-z.]+$/;
const SOLARI_USD_PER_MS=0.10/3600000;

export const realTools={
 plan:brain.plan,score:brain.score,draft:brain.draft,draftDm:brain.draftDm,steer:brain.steer,findContact:args=>findPersonalContact({...args,exa:exaFinder}),
 search:searchBrands,visit:visitSite,createDraft,
 value:brain.valueGrade,logo:({lead,onSpend})=>logoGate({lead,onSpend,check:brain.logoCheck}),fetchHome:fetchHomepage,
 gmailEnabled,draftAccount,exaMode,siteMode,brainMode:brain.brainMode,loadProfile:brain.loadProfile,video:videoTools()
};

export function createRunner(store,tools=realTools){
 const controls=new Map();
 const running=new Map();
 const shotDir=path.join(dataDir,'shots');

 function control(taskId,action){
  const c=controls.get(taskId);if(!c)return false;
  if(action==='pause'){c.paused=true;store.updateTask(taskId,{status:'paused'});}
  if(action==='resume'){c.paused=false;store.updateTask(taskId,{status:'running'});c.wake?.();}
  if(action==='stop'){c.stopped=true;c.wake?.();}
  store.addEvent({taskId,type:'status',title:`Operator pressed ${action}`});
  return true;
 }

 async function run(taskId){
  const task=store.getTask(taskId);
  const c={paused:false,stopped:false,skip:new Set()};controls.set(taskId,c);
  const log=(type,title,extra={})=>store.addEvent({taskId,type,title,...extra});
  const spend=(usd,provider,note)=>{if(usd){store.addCost(taskId,usd);store.addSpend({provider,usd,taskId,note});}};
  let current;
  const checkpoint=async progress=>{
   for(const s of store.pendingSteers(taskId)){
    log('steer',`Steering: ${s.message}`,{tool:'operator'});
    try{
     const out=await tools.steer({message:s.message,currentPlan:current,progress});spend(out.cost,'claude');
     const {plan:next,action,skipDomains,reply}=out.data;
     current={...current,...next,reply:current.reply,maxDrafts:Math.min(15,Math.max(1,next.maxDrafts||current.maxDrafts))};
     progress.queue.splice(0,progress.queue.length,...current.searchQueries);
     for(const d of skipDomains)c.skip.add(d.replace(/^www\./,'').toLowerCase());
     store.updateTask(taskId,{plan:current});store.markSteer(s.id,reply);
     log('steer',reply,{tool:`claude.steer (${out.model})`,data:{action,skipDomains,plan:current}});
     if(action==='stop')c.stopped=true;if(action==='pause')control(taskId,'pause');
    }catch(error){store.markSteer(s.id,`Could not apply: ${error.message}`);log('error',`Steering failed: ${error.message}`);}
   }
   while(c.paused&&!c.stopped)await new Promise(r=>{c.wake=r;setTimeout(r,1500);});
   if(c.stopped)throw new Stopped();
  };
  try{
   store.updateTask(taskId,{status:'running'});
   const profile=tools.loadProfile();
   log('status',`Started. Brain: ${tools.brainMode()}. Search: Exa ${tools.exaMode()==='rest'?'REST API':'free MCP'}. Sites: ${tools.siteMode()==='solari'?'Solari cloud browser':'plain fetch'}. Drafts: ${tools.gmailEnabled()?`Gmail drafts in ${tools.draftAccount()}`:'saved in CRM only'}.${tools.video?` Video: ${tools.video.enabled().ok?'each email waits for a personalized video you approve':'off, '+tools.video.enabled().reason}.`:''}`);
   log('tool_call','Planning the search',{tool:'claude.plan',data:{prompt:task.prompt}});
   const planned=await tools.plan(task.prompt,profile,task.attachments);spend(planned.cost,'claude');
   current={...planned.data,maxDrafts:Math.min(15,Math.max(1,planned.data.maxDrafts||5)),offer:profile.offer};
   store.updateTask(taskId,{plan:current});
   log('plan',current.reply,{tool:`claude.plan (${planned.model})`,detail:`Markets: ${current.markets.join(', ')}. Territories: ${current.territories.join(', ')}. Good fit: ${current.qualify}`,data:current});
   const progress={queue:[...current.searchQueries],drafted:0,visited:0,skipped:0,rejected:0,noContact:0};
   const seen=new Set();
   while(progress.queue.length&&progress.drafted<current.maxDrafts){
    await checkpoint({...progress,remainingQueries:progress.queue});
    const q=progress.queue.shift();
    log('tool_call',`Searching: ${q.query}`,{tool:tools.exaMode()==='rest'?'exa.search (REST)':'exa.web_search_exa (MCP)',data:q});
    let found;
    try{found=await tools.search(q.query);spend(found.costUsd||0,'exa');}
    catch(error){log('error',`Exa search failed: ${error.message}`,{tool:'exa'});continue;}
    log('tool_result',`Exa returned ${found.results.length} pages${found.costUsd!=null?` ($${found.costUsd.toFixed(4)})`:''}`,{tool:found.via,data:{requestId:found.requestId,results:found.results.map(r=>({title:r.title,url:r.url}))}});
    for(const r of found.results){
     if(progress.drafted>=current.maxDrafts)break;
     await checkpoint({...progress,remainingQueries:progress.queue});
     const domain=domainOf(r.url);
     if(!domain||seen.has(domain))continue;seen.add(domain);
     if(marketplace.test(domain)){log('decision',`Skipped ${domain}: marketplace, social or publisher site`,{tool:'rules'});continue;}
     if(c.skip.has(domain)){log('decision',`Skipped ${domain}: operator asked to skip it`,{tool:'operator'});continue;}
     const existing=store.findLeadByDomain(domain);
     if(existing){log('decision',`Skipped ${domain}: already in CRM as ${existing.status} (lead ${existing.id})`,{tool:'crm',leadId:existing.id});continue;}
     const home=`https://${new URL(r.url).hostname}/`;
     const lead=store.createLead({taskId,domain,company:companyFrom(r.title,domain),url:home,market:q.market,territory:q.territory,evidence:r.text.slice(0,600),logo:r.favicon||r.image||null});
     log('lead',`New lead: ${lead.company} (${domain})`,{tool:'crm.create',leadId:lead.id,data:{url:r.url}});
     let visit;
     store.updateLead(lead.id,{status:'visiting'});
     const started=Date.now();
     log('tool_call',`Visiting ${home}`,{tool:tools.siteMode()==='solari'?'solari.browser':'fetch',leadId:lead.id});
     try{visit=await tools.visit(home,{shotDir,leadId:lead.id});}
     catch(error){store.updateLead(lead.id,{status:'unreachable',notes:error.message});log('error',`Could not load ${domain}: ${error.message}`,{tool:'solari.browser',leadId:lead.id});continue;}
     if(visit.via==='solari.browser')spend((Date.now()-started)*SOLARI_USD_PER_MS,'solari');
     progress.visited++;
     store.updateLead(lead.id,{emails:visit.emails,screenshot:visit.screenshot,contact_email:visit.best?.email||null,contact_source:visit.best?.sourceUrl||null,contact_excerpt:visit.best?.excerpt||null,socials:visit.socials||{},status:'grading'});
     log('tool_result',visit.best?`Found ${visit.emails.length} email(s). Best: ${visit.best.email} on ${visit.best.sourceUrl}`:`No public email on ${visit.pages.map(p=>p.url).join(' or ')}`,{tool:visit.via,leadId:lead.id,data:{session:visit.sessionId,pages:visit.pages,emails:visit.emails}});
     const reject=gate=>{progress.rejected++;store.updateLead(lead.id,{status:'rejected',notes:gate.reason,value:gate.value});log('decision',gate.title,{tool:'quality gate',leadId:lead.id,data:{reason:gate.reason,value:gate.value}});};
     let gate;
     try{gate=await gateLead({lead,socials:visit.socials,site:visit,exa:{title:r.title,url:r.url,text:(r.text||'').slice(0,1500)},tools,spend,log:(type,title,extra={})=>log(type,title,{leadId:lead.id,...extra})});}
     catch(error){store.updateLead(lead.id,{status:'error',notes:error.message});log('error',`Quality check failed: ${error.message}`,{leadId:lead.id});continue;}
     if(!gate.pass){reject(gate);continue;}
     store.updateLead(lead.id,{value:gate.value});
     log('tool_result',`Brand quality ${gate.value.score}/100: keep. ${gate.value.reason}`,{tool:'claude.value',leadId:lead.id,data:gate.value});
     log('tool_call',`Grading fit for ${lead.company}`,{tool:'claude.score',leadId:lead.id});
     let graded;
     try{graded=await tools.score({lead,visit,planned:{...q,offer:current.offer,qualify:current.qualify,exclusions:current.exclusions}});spend(graded.cost,'claude');}
     catch(error){store.updateLead(lead.id,{status:'error',notes:error.message});log('error',`Grading failed: ${error.message}`,{leadId:lead.id});continue;}
     const g=graded.data;g.company=companyFrom(g.company||lead.company,domain,{split:false});
     store.updateLead(lead.id,{company:g.company||lead.company,fit_score:g.fitScore,reasons:g.reasons,risks:g.risks});
     if(g.decision!=='pursue'){
      progress.skipped++;store.updateLead(lead.id,{status:'skipped'});
      log('decision',`Skipped ${g.company||lead.company}: ${g.risks.join('; ')||'below threshold'}`,{tool:`claude.score (${graded.model})`,leadId:lead.id,data:g});
      continue;
     }
     log('decision',`Pursuing ${g.company}: ${g.reasons.join('; ')}`,{tool:`claude.score (${graded.model})`,leadId:lead.id,data:g});
     // Qualification starts the zero-budget research workspace immediately, before contact lookup or outreach drafting.
     store.updateLead(lead.id,{status:'qualified'});
     // Ryan's rule: a personal email printed on a public page, or an Instagram to DM. Never a generic inbox, never a guessed address.
     let contact;
     try{contact=await resolveContact({brand:g.company||lead.company,domain,homepageText:`${visit.homeText||''}\n${visit.contactText||''}`,socials:visit.socials,emails:visit.emails,find:tools.findContact,onSpend:(usd,note)=>spend(usd,'exa',`contact lookup: ${note}`),log:(type,title,extra={})=>log(type,title,{leadId:lead.id,...extra})});}
     catch(error){store.updateLead(lead.id,{status:'error',notes:error.message});log('error',`Contact lookup failed: ${error.message}`,{leadId:lead.id});continue;}
     store.updateLead(lead.id,{contact_kind:contact.kind,instagram_handle:contact.handle,contact_name:contact.name,contact_email:contact.email,contact_source:contact.sourceUrl,contact_excerpt:contact.excerpt});
     if(contact.uncertain){store.updateLead(lead.id,{status:'error',notes:contact.reason});log('error',`${contact.reason}. The lead was not rejected; requalify can retry it.`,{tool:'exa.contact',leadId:lead.id});continue;}
     if(contact.kind==='role'||contact.kind==='none'){
      progress.noContact++;store.updateLead(lead.id,{status:'rejected',notes:contact.reason});
      log('decision',`Rejected ${g.company}: ${contact.reason.toLowerCase()}`,{tool:'contact rule',leadId:lead.id,data:{reason:contact.reason}});
      continue;
     }
     const dm=contact.kind==='instagram',target=dm?`@${contact.handle}`:contact.email;
     store.updateLead(lead.id,{status:'drafting'});
     log('tool_call',dm?`Writing an Instagram DM to ${target}`:`Writing email to ${target}${contact.name?` (${contact.name})`:''}`,{tool:dm?'claude.draftDm':'claude.draft',leadId:lead.id});
     let written;
     try{written=await (dm?(tools.draftDm||brain.draftDm):tools.draft)({lead:{...lead,company:g.company},profile,graded:g,contact});spend(written.cost,'claude');}
     catch(error){store.updateLead(lead.id,{status:'error',notes:error.message});log('error',`Drafting failed: ${error.message}`,{leadId:lead.id});continue;}
     const channel=dm?'instagram_dm':'email',noun=dm?`Instagram DM for ${target}`:`Email for ${target}`;
     // Research the brand (real catalog, audience, hero product) before any video concept is written. Never blocks the lead: a failure just means no product references.
     if(tools.research){
      try{await tools.research({store,lead:store.getLead(lead.id),spend,log:(type,title,extra={})=>log(type,title,{leadId:lead.id,...extra}),homeText:visit.homeText});}
      catch(error){log('error',`Research failed for ${g.company}: ${error.message}. Continuing without product references.`,{tool:'shopify.products',leadId:lead.id});}
     }
     if(tools.video){
      store.addDraft({leadId:lead.id,taskId,to:target,...written.data,channel,status:'waiting_video'});
      store.updateLead(lead.id,{status:'awaiting_video'});
      progress.drafted++;
      log('draft',`${noun} written and held until its video is approved. Not sent.`,{tool:'crm',leadId:lead.id,data:{subject:written.data.subject,body:written.data.body,gmailUrl:null,channel}});
      const ready=tools.video.enabled();
      if(!ready.ok){log('decision',`No video made for ${g.company}: ${ready.reason}. The lead stays awaiting_video and its Gmail draft is not created.`,{tool:'higgsfield',leadId:lead.id});continue;}
      try{await prepareLeadVideo({store,lead:store.getLead(lead.id),ctx:{company:g.company,url:home,offer:current.offer,personalDetail:g.personalDetail,reasons:g.reasons,evidence:lead.evidence,homeText:visit.homeText},video:tools.video,checkpoint:()=>checkpoint({...progress,remainingQueries:progress.queue}),spend:(usd,note,renderId)=>{if(usd){store.addCost(taskId,usd);store.addSpend({provider:'claude',usd,taskId,renderId,note});}},log:(type,title,extra={})=>log(type,title,{leadId:lead.id,...extra})});}
      catch(error){if(error instanceof Stopped)throw error;log('error',`Video concept failed for ${g.company}: ${error.message}. The lead stays awaiting_video.`,{tool:'claude.video',leadId:lead.id});}
      continue;
     }
     let gmail=null;
     if(!dm&&tools.gmailEnabled()){
      log('tool_call',`Saving Gmail draft in ${tools.draftAccount()}`,{tool:'gmail.drafts.create',leadId:lead.id});
      try{gmail=await tools.createDraft({to:target,...written.data});}
      catch(error){log('error',`Gmail draft failed, kept in CRM: ${error.message}`,{tool:'gmail.drafts.create',leadId:lead.id});}
     }
     store.addDraft({leadId:lead.id,taskId,to:target,...written.data,channel,gmailDraftId:gmail?.draftId,gmailUrl:gmail?.url,status:gmail?'gmail_draft':'crm_only'});
     store.updateLead(lead.id,{status:'drafted'});
     progress.drafted++;
     log('draft',dm?`Instagram DM for ${target} saved in CRM. Not sent.`:gmail?`Draft ready in Gmail for ${target}. Not sent.`:`Draft saved in CRM for ${target}. Not sent.`,{tool:gmail?'gmail.drafts.create':'crm',leadId:lead.id,data:{subject:written.data.subject,body:written.data.body,gmailUrl:gmail?.url||null,channel}});
    }
   }
   const summary=`${progress.drafted} draft(s), ${progress.visited} site(s) visited, ${progress.skipped} skipped${progress.rejected?`, ${progress.rejected} rejected as low value`:''}${progress.noContact?`, ${progress.noContact} rejected with no personal contact`:''}.`;
   store.updateTask(taskId,{status:'done',summary});log('done',`Finished: ${summary}`);
  }catch(error){
   if(error instanceof Stopped){store.updateTask(taskId,{status:'stopped',summary:'Stopped by operator.'});log('status','Stopped by operator. Nothing further will run.');}
   else{store.updateTask(taskId,{status:'failed',summary:error.message});log('error',`Task failed: ${error.message}`);}
  }finally{controls.delete(taskId);running.delete(taskId);}
 }

 return {
  start(prompt,{model=null,attachments=[]}={}){const t=store.createTask(prompt,{model,attachments});running.set(t.id,withModel(model,()=>run(t.id)));return t;},
  control,
  steer(taskId,message){const s=store.addSteer(taskId,message);const live=controls.has(taskId);store.addEvent({taskId,type:'steer',tool:'operator',title:live?`Queued steer: ${message}`:`Noted (task not running): ${message}`});return {...s,live};},
  isRunning:taskId=>controls.has(taskId),
  wait:taskId=>running.get(taskId)
 };
}
