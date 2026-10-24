import {z} from 'zod';
import {structured,llmEnabled} from './tools/llm.mjs';
import * as hf from './tools/higgsfield.mjs';
import {cleanCopy} from './brain.mjs';
import {randomUUID as uuid} from 'node:crypto';
import path from 'node:path';
import {publicHttp} from './logo.mjs';
import {pickHero} from './research.mjs';
import {APPAREL_KINDS} from './tools/products.mjs';
import {reviseUntilPassed,assertRevisionWorkAllowed} from './revision-harness.mjs';

// One personalized UGC video per outreach email. Everything here is cheap (Sonnet text and Haiku checkers).
// Nothing here submits to Higgsfield: the render stops at checks_passed until Ryan clicks approve himself.
// A lead video reaches review only when every checker scores at least PASS_SCORE. There is no revision-count limit.
export const PASS_SCORE=hf.PASS_SCORE;
const strong=checks=>Boolean(checks.passed)&&checks.results.every(r=>r.score>=hf.PASS_SCORE);
const conceptSchema=z.object({identity:z.string(),wardrobe:z.string(),environment:z.string(),voice:z.string(),camera:z.string(),action:z.string(),dialogue:z.string(),audio:z.string(),creativeDirection:z.string()});
const constraints='No scarcity, sold out or sales claims. No invented product claims, prices, discounts, results or guarantees. No readable on-screen text and no logos.';

const rules=`Write ONE short vertical 9:16 UGC-style shot concept of exactly 5 seconds, filmed the way a customer or creator films on a phone. It must be personalized to this brand: show its real product and match its look, tone and customers, using only what the brand's own site text and notes below say. ${hf.renderMode} Never mention reference images, voice references, seeds or IDs. Lock one original character: identity (face, age, hair, build), wardrobe and environment, each under 40 words and specific enough to repeat exactly. Never copy a real creator's face, name or catchphrases, and never depict real people from the brand. camera is one setup in under 25 words, relative to the character only. action is one physically simple action in under 40 words that agrees with where the character faces. dialogue is the exact spoken words, at most 12 words, or empty for silence. audio names the ambience and any sound effect. voice describes the speaking voice. creativeDirection is one sentence on lighting, color and pacing. ${constraints} No em dashes.`;

const brandBrief=ctx=>JSON.stringify({brand:ctx.company,url:ctx.url,offerWeMakeForThem:ctx.offer,detailFromTheirSite:ctx.personalDetail||null,whyTheyFit:ctx.reasons||[],notes:ctx.evidence||null,siteText:String(ctx.homeText||'').slice(0,3000),...(ctx.hero?{heroProduct:{title:ctx.hero.title,kind:ctx.hero.kind,price:ctx.hero.price||null,whyThisOne:ctx.hero.why||null},audience:ctx.profile?.audience||[],style:ctx.profile?.style||[],signatureProducts:ctx.profile?.signature||[]}:{})});

// With a hero product the clip has two steps: a reference still (the creator wearing the brand's real product, edited from its own photo), then a 5 second image-to-video that starts from that still.
const heroSchema=conceptSchema.extend({stillPrompt:z.string()});
const heroRules=`Write ONE short vertical 9:16 UGC-style 5 second video concept for this brand in two parts. The brand's REAL product photo is supplied to the image model as a reference, so the product must look exactly as pictured. Part 1, stillPrompt (under 70 words): a photo-real phone photo of ONE original creator who matches the brand's audience, wearing or holding that exact heroProduct, in a believable everyday UGC setting. Describe the person, pose, framing and place only. Do not describe the product's design beyond its title, because the reference photo carries it. Part 2: camera, action, dialogue, audio and creativeDirection describe only how the 5 seconds move starting from that photo. identity, wardrobe and environment describe what the still shows (wardrobe names the heroProduct), each under 40 words. Use only what the brand's site text, notes and profile say. Never mention reference images, voice references, seeds or IDs inside those fields. Never copy a real creator's face or catchphrases and never depict real people from the brand. camera is one setup in under 25 words. action is one physically simple action in under 40 words that agrees with where the creator faces. If the creator films a selfie, say which hand holds the phone and keep every other action to the free hand. The pose in stillPrompt must be exactly the opening pose of the video. dialogue is the exact spoken words, at most 8 words, or empty for silence, and says its window (for example 0.5 s to 3.5 s) at about 2.5 words per second. audio names the ambience and any sound effect. voice gives the speaker's approximate age, accent and tone. creativeDirection is one sentence on lighting, color and pacing. Only the garment from heroProduct appears; ignore any other object its title mentions. ${constraints} No em dashes.`;

// Same prompt layout as storyboard shots, so the renderer sees one consistent format. Returns a Higgsfield text-to-video input: 5 s, 720p.
export function conceptInput(fields){
 const clean=Object.fromEntries(Object.entries(fields).map(([k,v])=>[k,cleanCopy(String(v||'')).trim()]));
 const [shot]=hf.shotsFromStoryboard({brief:{brand:'Outreach video'},storyboard:{identity:clean.identity,wardrobe:clean.wardrobe,environment:clean.environment,voice:clean.voice,creativeDirection:clean.creativeDirection,constraints,shots:[{id:'shot-01',duration:5,camera:clean.camera,action:clean.action,dialogue:clean.dialogue,audio:clean.audio}]}});
 return hf.buildInput({prompt:shot.input.prompt,duration:5,resolution:'720p'});
}
// The motion prompt for the image-to-video step. The creator, wardrobe and place already live in the still, so only the shot is described.
export function heroVideoInput(fields){
 const clean=Object.fromEntries(Object.entries(fields).map(([k,v])=>[k,cleanCopy(String(v||'')).trim()]));
 const [shot]=hf.shotsFromStoryboard({brief:{brand:'Outreach video'},storyboard:{voice:clean.voice,creativeDirection:clean.creativeDirection,constraints,shots:[{id:'shot-01',duration:5,camera:clean.camera,action:clean.action,dialogue:clean.dialogue,audio:clean.audio}]}});
 return hf.buildInput({prompt:`${shot.input.prompt}\nThe first frame is the creator photo generated in step 1 (not the product photo). Keep the same person, outfit and product throughout.`,duration:5,resolution:'720p'});
}
export function heroStillInput(fields,hero){
 const clean=cleanCopy(String(fields.stillPrompt||'')).trim();
 const prompt=`Photo-real vertical 9:16 smartphone photo, candid UGC style, natural light. ${clean} The product is the ${hero.title} (${hero.kind}) from the reference image: reproduce its color, cut, fabric and design exactly as pictured. Keep the garment's own small brand mark exactly as pictured; add no other text or logos. Show only this garment from the reference, fully in frame.`;
 return hf.buildStillInput({prompt,imageUrl:hero.imageUrl});
}
// What the checkers and the approval card see: both steps as one plan.
export const planCheckInput=plan=>({prompt:`Step 1 (image model; its input is the brand's real product photo): generate ONE new photo of the creator wearing that exact product. Prompt: ${plan.still.input.prompt}\n\nStep 2 (video model): animate the photo generated in step 1 for 5 seconds. Prompt: ${plan.video.input.prompt}`,duration:5,resolution:'720p',image_url:plan.hero.imageUrl});
export const checkInput=made=>made.plan?planCheckInput(made.plan):made.input;
const buildPlan=(fields,ctx)=>{
 const hero=ctx.hero;
 return {type:'product_clip',step:'still',hero:{index:hero.index,title:hero.title,kind:hero.kind,imageUrl:hero.imageUrl,price:hero.price||null,why:hero.why||null},profile:{audience:ctx.profile?.audience||[],style:ctx.profile?.style||[]},
  still:{endpoint:hf.endpoints['reference-still'],input:heroStillInput(fields,hero),estimate_usd:null,status:'pending',request_id:null,submission_key:null,result_url:null,local_file:null},
  video:{endpoint:hf.endpoints['image-to-video'],input:heroVideoInput(fields),estimate_usd:null,status:'pending',request_id:null,submission_key:null,imageFrom:'still.result_url'}};
};
const conceptOut=(out,ctx)=>ctx.hero
 ?(plan=>({fields:out.data,input:plan.video.input,plan,cost:out.cost,model:out.model}))(buildPlan(out.data,ctx))
 :{fields:out.data,input:conceptInput(out.data),cost:out.cost,model:out.model};

// Picks the hero product and brand chips off a lead (saved by research). Returns null when the lead has no usable apparel photo, which keeps the old text-to-video path.
export function heroFromLead(lead){
 const products=Array.isArray(lead?.products)?lead.products:[];
 if(!products.length)return null;
 const picked=pickHero(products,lead.brand_profile?.hero||{productIndex:0,why:''});
 const p=picked&&products[picked.productIndex];
 if(!p||!p.imageUrl||!publicHttp(p.imageUrl)||!APPAREL_KINDS.includes(p.kind))return null;
 const prof=lead.brand_profile||{};
 return {hero:{index:picked.productIndex,title:p.title,kind:p.kind,imageUrl:p.imageUrl,price:p.price||null,why:picked.why||null},profile:{audience:prof.audience||[],style:prof.style||[],signature:prof.signature||[]}};
}

export async function writeConcept(ctx,llm=structured){
 const out=await llm({role:'main',effort:'low',schema:ctx.hero?heroSchema:conceptSchema,system:ctx.hero?heroRules:rules,prompt:brandBrief(ctx)});
 return conceptOut(out,ctx);
}
export async function reviseConcept(ctx,fields,checks,llm=structured){
 const findings=checks.results.flatMap(r=>r.issues.map(i=>({checker:r.name,...i})));
 const base=ctx.hero?heroRules:rules;
 const out=await llm({role:'main',effort:'low',schema:ctx.hero?heroSchema:conceptSchema,system:`${base} You are revising an existing concept. Every checker must score at least ${hf.PASS_SCORE}, so resolve every finding, including minor ones, with the smallest exact edit. When a finding asks for a precise bound (a dialogue time window inside the 5 seconds, framing that keeps the whole product in frame, a camera drift limit, the voice's age and accent, how the product's own label looks), add that one bounded detail. When two details contradict, delete one. Never add new story beats, props, people or claims, and keep every field inside its word limit. This is a private pitch sample for the brand, not a public testimonial, so no call to action and no AI disclosure line are needed. Ignore any finding that asks for reference images, voice clips, seeds or asset IDs. Keep it personalized to the brand.`,prompt:JSON.stringify({brand:JSON.parse(brandBrief(ctx)),concept:fields,findings})});
 return conceptOut(out,ctx);
}

// The dependency bundle used by the runner and the server. Tests pass their own stubs of the same shape.
export const videoTools=(h=hf)=>({
 enabled:()=>!h.higgsfieldEnabled()?{ok:false,reason:'Higgsfield is not configured (HF_CREDENTIALS)'}:!llmEnabled()?{ok:false,reason:'Claude is not configured (ANTHROPIC_API_KEY), so the concept cannot be written or checked'}:{ok:true},
 concept:writeConcept,revise:reviseConcept,check:h.runCheckers,estimate:h.estimate,priceFrom:h.priceFrom,endpoint:h.endpoints['text-to-video']
});

const total=(...n)=>n.every(x=>x!=null&&Number.isFinite(Number(x)))?n.reduce((s,x)=>s+Number(x),0).toFixed(2):null;
// Free: Higgsfield estimate endpoints only. The video step is priced with the product photo standing in for the not yet made still.
async function estimateSteps(video,plan){
 const still=video.priceFrom(await video.estimate(plan.still.endpoint,plan.still.input),plan.still.input);
 const vid=video.priceFrom(await video.estimate(plan.video.endpoint,{...plan.video.input,image_url:plan.hero.imageUrl}),plan.video.input);
 return {still,video:vid,total:total(still,vid)};
}

// Write the concept and keep applying checker feedback until every checker scores PASS_SCORE or more,
// fetch the Higgsfield price, and park the render at checks_passed. Returns the passing render and price. Provider errors and explicit stop/pause requests retain the current render.
// `spend(usd,note,renderId)` records every Claude cost. Nothing here submits to Higgsfield.
export async function prepareLeadVideo({store,lead,ctx,video,spend=()=>{},log=()=>{},checkpoint=async()=>{}}){
 const company=ctx.company||lead.company||lead.domain;
 const costs=[];let render=null;
 const note=(usd,what)=>{if(render)spend(usd||0,`${what} for ${company}`,render.id);else costs.push([usd||0,what]);};
 const ready=async()=>{assertRevisionWorkAllowed(store);await checkpoint();assertRevisionWorkAllowed(store);};
 try{
  await ready();
  // A researched lead with a usable apparel photo gets the two-step product clip. Otherwise this stays text-to-video.
  if(!ctx.hero){const h=heroFromLead(lead);if(h)ctx={...ctx,...h};}
  const brief=`Personalized 5 second UGC pitch sample for ${company} (${ctx.url||lead.url}), sent privately to the brand to show what we can make. It is not a published testimonial, so it has no call to action and no disclosure line.${ctx.hero?` The brand's real product, ${ctx.hero.title}, is the image model's reference photo.`:''}`;
  log('tool_call',ctx.hero?`Writing a video concept for ${company} around ${ctx.hero.title}`:`Writing a video concept for ${company}`,{tool:'claude.video concept'});
  let made=await video.concept(ctx);note(made.cost,'video concept');
  render=store.createRender({title:`${company} video`,endpoint:made.plan?made.plan.still.endpoint:(video.endpoint||hf.endpoints['text-to-video']),input:made.plan?made.plan.still.input:made.input,leadId:lead.id,plan:made.plan||null});
  for(const [usd,what] of costs.splice(0))spend(usd,`${what} for ${company}`,render.id);
  const reviewed=await reviseUntilPassed({candidate:made,checkpoint:ready,accept:strong,
   check:async candidate=>{store.updateRender(render.id,{status:'checking',input:candidate.plan?candidate.plan.still.input:candidate.input,plan:candidate.plan||null});const checks=await video.check({title:`${company} video`,input:checkInput(candidate),brief});note(checks.cost,'video checkers');return checks;},
   onChecked:async(candidate,checks,revision)=>{store.updateRender(render.id,{input:candidate.plan?candidate.plan.still.input:candidate.input,plan:candidate.plan||null,status:strong(checks)?'checks_passed':'checking',checks});log('tool_result',`Video review ${revision}: ${strong(checks)?'passed':'applying feedback'}`,{tool:'higgsfield.checks',data:{renderId:render.id,revision,checks}});},
   onRevision:async(candidate,checks,revision)=>log('tool_call',`Video concept for ${company} needs fixes, revising (${revision})`,{tool:'claude.video revise',data:{revision,notes:checks.results.flatMap(r=>r.issues.map(i=>i.fix)).slice(0,6),lowest:Math.min(...checks.results.map(r=>r.score))}}),
   revise:async(candidate,checks)=>{const next=await video.revise(ctx,candidate.fields,checks);note(next.cost,'video concept revision');store.updateRender(render.id,{input:next.plan?next.plan.still.input:next.input,plan:next.plan||null,status:'checking'});return next;}
  });
  made=reviewed.candidate;const checks=reviewed.checks;
  const plan=made.plan||null;
  let price=null,error=null,steps=null;
  try{
   if(plan){steps=await estimateSteps(video,plan);price=steps.total;if(!price)error='Higgsfield returned no usable price for one of the two steps';}
   else{price=video.priceFrom(await video.estimate(render.endpoint,made.input),made.input);if(!price)error='Higgsfield returned no usable price for this resolution';}
  }catch(e){error=e.message;}
  const fields={status:'checks_passed',checks,estimate_usd:price,error};
  if(plan&&steps)fields.plan={...plan,still:{...plan.still,estimate_usd:steps.still},video:{...plan.video,estimate_usd:steps.video}};
  render=store.updateRender(render.id,fields);
  log('decision',price?(plan?`Video concept ready for your approval ($${price}: reference photo $${steps.still} + video $${steps.video})`:`Video concept ready for your approval ($${price})`):`Video concept ready, but no price yet (${error}). Rerun its checks to fetch one.`,{tool:'higgsfield.estimate',data:{renderId:render.id,estimateUsd:price,steps,prompt:made.input.prompt,stillPrompt:plan?.still.input.prompt||null}});
  return {render,price};
 }catch(error){if(render)store.updateRender(render.id,{status:'checks_failed',error:error.message});throw error;}
 finally{for(const [usd,what] of costs)spend(usd,`${what} for ${company}`,render?.id??null);}
}

// Approval and status handling for the two-step product clip. The render row always mirrors the CURRENT step (endpoint, input, request_id, status),
// so the server's existing poll loop keeps working: the still is step 'still', then when it completes the video is submitted and the row flips to step 'video'.
// Nothing here runs until Ryan's approve click calls clips.approve. Every Higgsfield call carries its own Idempotency-Key, and spend is recorded per step.
export function createClips({store,higgsfield=hf,renderDir,newKey=uuid}){
 const planOf=r=>r?.plan?.type==='product_clip'?r.plan:null;
 const say=(r,type,title,extra={})=>{const l=r.lead_id&&store.getLead(r.lead_id);if(l)store.addEvent({taskId:l.task_id,leadId:l.id,type,title,tool:'higgsfield',...extra});};
 const bad=(m,status)=>Object.assign(Error(m),{status});
 const stepUsd=(r)=>{const p=planOf(r);return p?(p.step==='video'?p.video.estimate_usd:p.still.estimate_usd):r.estimate_usd;};
 return {
  planOf,
  // What the ledger records at this render's approve click: the still's price for a product clip (the video is recorded when it is submitted), else the whole estimate.
  approveUsd:stepUsd,
  // Combined estimate for a render's current plan (still + video), or the single estimate. Free.
  async estimateFor(r){
   const p=planOf(r);
   if(!p)return higgsfield.priceFrom(await higgsfield.estimate(r.endpoint,r.input),r.input);
   return (await estimateSteps({estimate:higgsfield.estimate,priceFrom:higgsfield.priceFrom},p)).total;
  },
  // Drop-in for POST /api/renders/:id/approve. The ONLY place that submits, and it runs from the click. Returns {render} or throws an Error with .status.
  async approve(id,body={},{inFlight=new Set(),poll=()=>{}}={}){
   const r=store.getRender(Number(id));if(!r)throw bad('No such render',404);
   if(r.status!=='checks_passed')throw bad('Run the checkers and pass them before approving. Submitting or uncertain renders cannot be resubmitted.',409);
   if(!Number.isFinite(Number(r.estimate_usd))||Number(r.estimate_usd)<=0)throw bad('No finite positive price estimate. Rerun checks to fetch one.',409);
   if(String(body.estimate)!==String(r.estimate_usd))throw bad('The estimate changed. Review it and approve again.',409);
   const key=`render-${r.id}-${newKey()}`;
   const claimed=store.claimRenderSubmission(r.id,r.estimate_usd,key);if(!claimed)throw bad('This render was already claimed or its estimate changed. No additional submission started.',409);
   inFlight.add(r.id);
   try{
    const submitted=await higgsfield.approveAndSubmit(r.endpoint,r.input,claimed.submission_key);const requestId=submitted.request_id||submitted.id;
    if(typeof requestId!=='string'||!requestId.trim())throw Error('Provider response did not identify a request.');
    const p=planOf(r),usd=Number(stepUsd(r));
    store.addSpend({provider:'higgsfield',usd,renderId:r.id,taskId:null,note:p?'approved reference photo step estimate':'approved render estimate'});
    const fields={status:submitted.status||'queued',request_id:requestId,error:null};
    if(p){const st={status:submitted.status||'queued',request_id:requestId,submission_key:claimed.submission_key,spent_usd:usd};fields.plan=p.step==='video'?{...p,video:{...p.video,...st}}:{...p,still:{...p.still,...st}};}
    const updated=store.updateRender(r.id,fields);
    const l=r.lead_id&&store.getLead(r.lead_id);
    if(l)say(r,'status',p?`You approved the video for ${l.company} ($${r.estimate_usd}: reference photo $${p.still.estimate_usd}, then video $${p.video.estimate_usd}). The reference photo is rendering first.`:`You approved the video for ${l.company} ($${r.estimate_usd}). It is rendering.`);
    poll(r.id);
    return {render:updated};
   }catch{
    store.updateRender(r.id,{status:'submission_unknown',error:'Submission outcome is uncertain. Check Higgsfield using the saved submission key before any new render attempt.'});
    throw bad('Submission outcome is uncertain. No automatic retry is allowed. Reconcile the saved submission key in Higgsfield.',502);
   }finally{inFlight.delete(r.id);}
  },
  // Call at the top of the server's applyStatus(id,s). Returns null when this render is not a product clip waiting on its still (the server handles it as before),
  // else {running} after handling it: when the still completes the video is submitted here with the still's result as image_url.
  async onStatus(id,s){
   const r=store.getRender(id),p=planOf(r);
   if(!p||p.step!=='still')return null;
   const fail=why=>{store.updateRender(id,{status:'failed',error:why,plan:{...p,still:{...p.still,status:s.status}}});say(r,'error',`The reference photo for this lead's video did not finish (${why}). No video was submitted.`);return {running:false};};
   if(['failed','nsfw','canceled'].includes(s.status))return fail(s.error||s.status);
   if(s.status!=='completed'){if(s.status&&s.status!==r.status)store.updateRender(id,{status:s.status,plan:{...p,still:{...p.still,status:s.status}}});return {running:true};}
   const url=s.images?.[0]?.url||s.image?.url||null;
   if(!url||!publicHttp(url))return fail('Higgsfield returned no usable image');
   let local=null;
   if(renderDir){try{const ext=(path.extname(new URL(url).pathname).slice(1)||'png').toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,5)||'png';local=path.basename(await higgsfield.download(url,renderDir,`render-${id}-still.${ext}`));}catch{}}
   const key=`render-${id}-video-${newKey()}`;
   const vInput={...p.video.input,image_url:url};
   const done={...p.still,status:'completed',result_url:url,local_file:local};
   store.updateRender(id,{endpoint:p.video.endpoint,input:vInput,status:'submitting',request_id:null,submission_key:key,error:null,plan:{...p,step:'video',still:done,video:{...p.video,input:vInput,status:'submitting',submission_key:key}}});
   say(r,'status',`The reference photo is ready. Submitting the 5 second video from it.`);
   try{
    const sub=await higgsfield.approveAndSubmit(p.video.endpoint,vInput,key);const requestId=sub.request_id||sub.id;
    if(typeof requestId!=='string'||!requestId.trim())throw Error('Provider response did not identify a request.');
    const usd=Number(p.video.estimate_usd);
    store.addSpend({provider:'higgsfield',usd,renderId:id,note:'video step estimate (after the reference photo finished)'});
    store.updateRender(id,{status:sub.status||'queued',request_id:requestId,plan:{...p,step:'video',still:done,video:{...p.video,input:vInput,status:sub.status||'queued',request_id:requestId,submission_key:key,spent_usd:usd}}});
    return {running:true};
   }catch{
    store.updateRender(id,{status:'submission_unknown',error:'The reference photo finished, but the video submission outcome is uncertain. Check Higgsfield using the saved submission key before any new attempt.'});
    say(r,'error','The reference photo finished, but the video submission outcome is uncertain. Not retried automatically.');
    return {running:false};
   }
  }
 };
}
