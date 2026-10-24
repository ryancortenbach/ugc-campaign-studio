import {z} from 'zod';
import {reviewers} from '../src/review.js';
import {structured} from './tools/llm.mjs';
import {PASS_SCORE,renderMode} from './tools/higgsfield.mjs';
import {cleanCopy} from './brain.mjs';

// Same shape the studio's planner exports, so storyboards move between the studio and the agent.
const shotSchema=z.object({id:z.string(),duration:z.number().int(),camera:z.string(),action:z.string(),dialogue:z.string(),audio:z.string()});
const planSchema=z.object({title:z.string(),identity:z.string(),wardrobe:z.string(),environment:z.string(),voice:z.string(),creativeDirection:z.string(),offer:z.string(),constraints:z.string(),shots:z.array(shotSchema)});
const gradeSchema=z.object({score:z.number().int(),summary:z.string(),issues:z.array(z.object({severity:z.enum(['blocking','major','minor']),evidence:z.string(),fix:z.string()}))});

const rules=total=>`Write a storyboard for one vertical 9:16 short-form video of about ${total} seconds, rendered shot by shot. ${renderMode} Never mention reference images, voice references, seeds or IDs. Use 2 to 4 shots, each 4 to 10 seconds, ids shot-01, shot-02 and so on. Lock one original character: identity (face, age, hair, build), wardrobe and environment must be specific enough to repeat exactly in every shot, in under 60 words each. Never copy a real creator's face, name or catchphrases. Do not repeat identity, wardrobe or environment inside camera or action, because the pipeline adds them. Each shot has one camera setup in under 25 words, described relative to the character only (distance, angle, framing, movement), never relative to furniture. Each shot has one physically simple action in under 40 words, and it must agree with where the character faces and where the camera is. No scarcity, sold out or sales claims. Dialogue is the exact spoken words, at most 2.5 words per second of the shot, or empty for silence. Audio names the ambience and any sound effect with timing. No invented product claims, prices, results or guarantees. No em dashes.`;

export function normalizePlan(plan){
 let start=0;
 const shots=plan.shots.slice(0,6).map((s,i)=>{const duration=Math.min(10,Math.max(4,Math.round(s.duration)||5));const shot={...s,id:`shot-${String(i+1).padStart(2,'0')}`,start,duration,dialogue:cleanCopy(s.dialogue||'')};start+=duration;return shot;});
 return {schemaVersion:'1.0',status:'draft_for_review',...plan,durationSeconds:start,references:plan.references||[],shots,generation:{model:'bytedance/seedance-2.5',estimatedCredits:null,spendApproved:false,submitted:false}};
}

// Rejects output where the model leaked JSON or markup into a text field or dropped shots.
export function malformed(plan,minShots=2){
 const texts=[plan.title,plan.identity,plan.wardrobe,plan.environment,plan.voice,plan.creativeDirection,plan.offer,plan.constraints,...plan.shots.flatMap(s=>[s.id,s.camera,s.action,s.dialogue,s.audio])];
 if(plan.shots.length<minShots)return `only ${plan.shots.length} shot(s)`;
 const bad=texts.find(t=>/\{\s*\\?"|\\?"\s*\}|<\/?\w+>|"(id|duration|camera|action|dialogue|audio)"\s*:/.test(String(t||'')));
 return bad?`structured text leaked into a field: ${String(bad).slice(0,80)}`:null;
}
async function generate(args,minShots,checkpoint=async()=>{}){
 let cost=0,problem=null;
 try{
  for(;;){
   await checkpoint();
   const out=await structured(problem?{...args,prompt:args.prompt+`\n\nRepair the previous malformed output: ${problem}. Return ordinary text inside every text field and preserve the required shots.`}:args);cost+=out.cost;
   problem=malformed(out.data,minShots);
   if(!problem)return {plan:normalizePlan(out.data),cost,model:out.model};
  }
 }catch(error){error.cost=cost;throw error;}
}

export async function draftStoryboard(brief,{attachments=[],checkpoint=async()=>{}}={}){
 const total=[5,15,30].includes(Number(brief.length))?Number(brief.length):15;
 return generate({role:'main',effort:'high',schema:planSchema,maxTokens:16000,attachments,system:rules(total),prompt:JSON.stringify(brief)},Math.min(2,Math.ceil(total/10)),checkpoint);
}

export async function checkStoryboard(plan){
 const results=await Promise.all(reviewers.map(async([id,name,focus])=>{
  try{const out=await structured({role:'grader',effort:'medium',schema:gradeSchema,system:`You are the ${name} checker for a storyboard of a short AI-generated vertical video. ${focus} ${renderMode} Do not flag the absence of reference files; judge whether the text locks are specific enough to keep the character, outfit and setting identical across separate renders. Score 0 to 100. Use blocking or major only for problems that would visibly ruin the video, break continuity between shots, or make a false claim. Cite the shot id and exact words as evidence. Give a concrete fix for every issue that can be made by editing the storyboard text.`,prompt:JSON.stringify(plan)});return {id,name,...out.data,cost:out.cost};}
  catch(error){return {id,name,score:0,summary:`Checker failed: ${error.message}`,issues:[{severity:'blocking',evidence:'checker unavailable',fix:'rerun checks'}],cost:0};}
 }));
 return {passed:results.every(r=>r.score>=PASS_SCORE&&!r.issues.some(i=>i.severity!=='minor')),results,cost:results.reduce((s,r)=>s+r.cost,0),checkedAt:new Date().toISOString()};
}

export async function reviseStoryboard(plan,checks,note='',{checkpoint=async()=>{}}={}){
 const findings=checks.results.flatMap(r=>r.issues.map(i=>({checker:r.name,...i})));
 return generate({role:'main',effort:'high',schema:planSchema,maxTokens:16000,system:`${rules(plan.durationSeconds)} You are revising an existing storyboard. Fix every blocking and major finding, and minor ones where it is cheap, without changing the concept or any dialogue the operator wrote unless a finding says that line is the problem. Fix by simplifying: remove details that are not needed rather than adding new ones, because added detail creates new contradictions. Ignore any finding that asks for reference images, voice clips, seeds or asset IDs, since this renderer cannot use them. Before answering, reread every shot against identity, wardrobe, environment, camera, action, dialogue timing and constraints, and remove every contradiction. Keep the title.`,prompt:JSON.stringify({storyboard:plan,findings,operatorNote:note})},Math.min(2,plan.shots.length),checkpoint);
}
