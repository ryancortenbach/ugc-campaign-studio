import {z} from 'zod';
import {structured,llmEnabled} from './tools/llm.mjs';
import * as hf from './tools/higgsfield.mjs';
import {cleanCopy} from './brain.mjs';

// One personalized UGC video per outreach email. Everything here is cheap (Sonnet text and Haiku checkers).
// Nothing here submits to Higgsfield: the render stops at checks_passed until Ryan clicks approve himself.
export const MAX_REVISIONS=2;
const conceptSchema=z.object({identity:z.string(),wardrobe:z.string(),environment:z.string(),voice:z.string(),camera:z.string(),action:z.string(),dialogue:z.string(),audio:z.string(),creativeDirection:z.string()});
const constraints='No scarcity, sold out or sales claims. No invented product claims, prices, discounts, results or guarantees. No readable on-screen text and no logos.';

const rules=`Write ONE short vertical 9:16 UGC-style shot concept of exactly 5 seconds, filmed the way a customer or creator films on a phone. It must be personalized to this brand: show its real product and match its look, tone and customers, using only what the brand's own site text and notes below say. ${hf.renderMode} Never mention reference images, voice references, seeds or IDs. Lock one original character: identity (face, age, hair, build), wardrobe and environment, each under 40 words and specific enough to repeat exactly. Never copy a real creator's face, name or catchphrases, and never depict real people from the brand. camera is one setup in under 25 words, relative to the character only. action is one physically simple action in under 40 words that agrees with where the character faces. dialogue is the exact spoken words, at most 12 words, or empty for silence. audio names the ambience and any sound effect. voice describes the speaking voice. creativeDirection is one sentence on lighting, color and pacing. ${constraints} No em dashes.`;

const brandBrief=ctx=>JSON.stringify({brand:ctx.company,url:ctx.url,offerWeMakeForThem:ctx.offer,detailFromTheirSite:ctx.personalDetail||null,whyTheyFit:ctx.reasons||[],notes:ctx.evidence||null,siteText:String(ctx.homeText||'').slice(0,3000)});

// Same prompt layout as storyboard shots, so the renderer sees one consistent format. Returns a Higgsfield text-to-video input: 5 s, 720p.
export function conceptInput(fields){
 const clean=Object.fromEntries(Object.entries(fields).map(([k,v])=>[k,cleanCopy(String(v||'')).trim()]));
 const [shot]=hf.shotsFromStoryboard({brief:{brand:'Outreach video'},storyboard:{identity:clean.identity,wardrobe:clean.wardrobe,environment:clean.environment,voice:clean.voice,creativeDirection:clean.creativeDirection,constraints,shots:[{id:'shot-01',duration:5,camera:clean.camera,action:clean.action,dialogue:clean.dialogue,audio:clean.audio}]}});
 return hf.buildInput({prompt:shot.input.prompt,duration:5,resolution:'720p'});
}
export async function writeConcept(ctx){
 const out=await structured({role:'main',effort:'low',schema:conceptSchema,system:rules,prompt:brandBrief(ctx)});
 return {fields:out.data,input:conceptInput(out.data),cost:out.cost,model:out.model};
}
export async function reviseConcept(ctx,fields,checks){
 const findings=checks.results.flatMap(r=>r.issues.map(i=>({checker:r.name,...i})));
 const out=await structured({role:'main',effort:'low',schema:conceptSchema,system:`${rules} You are revising an existing concept. Fix every blocking and major finding by simplifying: remove details rather than adding new ones, because added detail creates new contradictions. Ignore any finding that asks for reference images, voice clips, seeds or asset IDs. Keep it personalized to the brand.`,prompt:JSON.stringify({brand:JSON.parse(brandBrief(ctx)),concept:fields,findings})});
 return {fields:out.data,input:conceptInput(out.data),cost:out.cost,model:out.model};
}

// The dependency bundle used by the runner and the server. Tests pass their own stubs of the same shape.
export const videoTools=(h=hf)=>({
 enabled:()=>!h.higgsfieldEnabled()?{ok:false,reason:'Higgsfield is not configured (HF_CREDENTIALS)'}:!llmEnabled()?{ok:false,reason:'Claude is not configured (ANTHROPIC_API_KEY), so the concept cannot be written or checked'}:{ok:true},
 concept:writeConcept,revise:reviseConcept,check:h.runCheckers,estimate:h.estimate,priceFrom:h.priceFrom,endpoint:h.endpoints['text-to-video']
});

// Steps 1 to 3: write the concept, run the Haiku checkers (revising up to twice), fetch the Higgsfield price, and park the render at
// checks_passed. Returns {render,usd} or {render,failed:true}. Throws only if nothing could be created. `spend(usd,note,renderId)` records every Claude cost.
export async function prepareLeadVideo({store,lead,ctx,video,spend=()=>{},log=()=>{}}){
 const company=ctx.company||lead.company||lead.domain;
 const costs=[];let render=null;
 const note=(usd,what)=>costs.push([usd||0,what]);
 try{
  log('tool_call',`Writing a video concept for ${company}`,{tool:'claude.video concept'});
  let made=await video.concept(ctx);note(made.cost,'video concept');
  let checks=await video.check({title:`${company} video`,input:made.input,brief:`Personalized 5 second UGC video for ${company} (${ctx.url||lead.url}).`});note(checks.cost,'video checkers');
  let revisions=0;
  while(!checks.passed&&revisions<MAX_REVISIONS){
   revisions++;
   log('tool_call',`Video concept for ${company} needs fixes, revising (${revisions} of ${MAX_REVISIONS})`,{tool:'claude.video revise',data:{notes:checks.results.flatMap(r=>r.issues.map(i=>i.fix)).slice(0,6)}});
   made=await video.revise(ctx,made.fields,checks);note(made.cost,'video concept revision');
   checks=await video.check({title:`${company} video`,input:made.input,brief:`Personalized 5 second UGC video for ${company} (${ctx.url||lead.url}).`});note(checks.cost,'video checkers');
  }
  render=store.createRender({title:`${company} video`,endpoint:video.endpoint||hf.endpoints['text-to-video'],input:made.input,leadId:lead.id});
  if(!checks.passed){
   store.updateRender(render.id,{status:'checks_failed',checks});
   log('error',`Video concept for ${company} did not pass the checkers after ${revisions} revision(s). Open render ${render.id} to revise it. Nothing was submitted.`,{tool:'higgsfield.checks',data:{renderId:render.id}});
   return {render:store.getRender(render.id),failed:true};
  }
  let price=null,error=null;
  try{price=video.priceFrom(await video.estimate(render.endpoint,made.input),made.input);if(!price)error='Higgsfield returned no usable price for this resolution';}catch(e){error=e.message;}
  render=store.updateRender(render.id,{status:'checks_passed',checks,estimate_usd:price,error});
  log('decision',price?`Video concept ready for your approval ($${price})`:`Video concept ready, but no price yet (${error}). Rerun its checks to fetch one.`,{tool:'higgsfield.estimate',data:{renderId:render.id,estimateUsd:price,prompt:made.input.prompt}});
  return {render,price};
 }finally{for(const [usd,what] of costs)spend(usd,`${what} for ${company}`,render?.id??null);}
}
