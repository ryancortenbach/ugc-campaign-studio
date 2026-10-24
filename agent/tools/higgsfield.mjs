import {z} from 'zod';
import {writeFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {reviewers} from '../../src/review.js';
import {structured,llmEnabled} from './llm.mjs';

// Every submit spends money on Ryan's Higgsfield account. Only approveAndSubmit() submits, and the server
// calls it only from his approve click on a render whose checks passed and whose estimate he has seen.
const base='https://api.higgsfield.ai';
export const higgsfieldEnabled=()=>/^[^:\s]+:[^:\s]+$/.test(process.env.HF_CREDENTIALS||'');
export const endpoints={'text-to-video':'bytedance/seedance-2.5/text-to-video','image-to-video':'bytedance/seedance-2.5/image-to-video'};
export const PASS_SCORE=85;

async function hf(pathname,init={}){
 if(!higgsfieldEnabled())throw Error('HF_CREDENTIALS is not set');
 const res=await fetch(`${base}/${pathname}`,{...init,headers:{Authorization:`Key ${process.env.HF_CREDENTIALS}`,'Content-Type':'application/json',...init.headers},signal:AbortSignal.timeout(30000)});
 const text=await res.text();let body;try{body=JSON.parse(text);}catch{body={raw:text.slice(0,300)};}
 if(!res.ok)throw Object.assign(Error(`Higgsfield ${pathname.split('?')[0]} failed with HTTP ${res.status}: ${(body.detail||body.message||body.raw||'').toString().slice(0,200)}`),{status:res.status});
 return body;
}
export function buildInput({prompt,imageUrl,duration=5,resolution='720p'}){
 const input={prompt,duration:Math.min(30,Math.max(4,Math.round(Number(duration)||5))),resolution:['480p','720p','1080p'].includes(resolution)?resolution:'720p'};
 if(imageUrl)input.image_url=imageUrl;
 return input;
}
export const estimate=(endpoint,input)=>hf(`estimate/${endpoint}`,{method:'POST',body:JSON.stringify(input)});
// Seedance returns a per-second price sheet instead of a total, so the total is rate at this resolution times seconds.
export function priceFrom(e,input){
 if(e?.usd!=null&&Number.isFinite(Number(e.usd)))return Number(e.usd).toFixed(2);
 const rates=Object.fromEntries([...String(e?.pricing_description||'').matchAll(/\$([\d.]+)(?: per second of generated video)? at (\d{3,4}p)/g)].map(m=>[m[2],Number(m[1])]));
 const rate=rates[input.resolution];
 return rate?(rate*input.duration).toFixed(2):null;
}
export async function approveAndSubmit(endpoint,input,idempotencyKey){return hf(endpoint,{method:'POST',headers:{'Idempotency-Key':idempotencyKey},body:JSON.stringify(input)});}
export const status=requestId=>hf(`requests/${encodeURIComponent(requestId)}/status`);
export const cancel=requestId=>hf(`requests/${encodeURIComponent(requestId)}/cancel`,{method:'POST'});

const gradeSchema=z.object({score:z.number().int(),summary:z.string(),issues:z.array(z.object({severity:z.enum(['blocking','major','minor']),evidence:z.string(),fix:z.string()}))});
// The seven scene checkers from src/review.js, run on Haiku 5.5 in parallel.
export async function runCheckers({title,input,brief=''}){
 if(!llmEnabled())throw Error('Checkers need ANTHROPIC_API_KEY');
 const results=await Promise.all(reviewers.map(async([id,name,focus])=>{
  try{const out=await structured({role:'grader',effort:'low',schema:gradeSchema,system:`You are the ${name} checker for a short AI-generated video shot. ${focus} Score 0 to 100. Use blocking or major only for problems that would visibly ruin or invalidate the render. Cite exact words from the prompt as evidence.`,prompt:JSON.stringify({shotTitle:title,brief,prompt:input.prompt,durationSeconds:input.duration,resolution:input.resolution,hasReferenceImage:Boolean(input.image_url)})});return {id,name,...out.data,cost:out.cost};}
  catch(error){return {id,name,score:0,summary:`Checker failed: ${error.message}`,issues:[{severity:'blocking',evidence:'checker unavailable',fix:'rerun checks'}],cost:0};}
 }));
 const passed=results.every(r=>r.score>=PASS_SCORE&&!r.issues.some(i=>i.severity!=='minor'));
 return {passed,results,cost:results.reduce((s,r)=>s+r.cost,0),checkedAt:new Date().toISOString()};
}
// Accepts a studio production packet, its storyboard, or a bare plan, and returns one render request per shot.
export function shotsFromStoryboard(packet){
 const seen=new Set();
 const find=o=>{if(!o||typeof o!=='object'||seen.has(o))return null;seen.add(o);if(Array.isArray(o.shots)&&o.shots.some(s=>s&&typeof s==='object'))return o;for(const v of Object.values(o)){const hit=find(v);if(hit)return hit;}return null;};
 const plan=find(packet);
 if(!plan)throw Error('No storyboard shots found in that JSON.');
 const lock=(label,v)=>v&&String(v).trim()?`${label}: ${String(v).trim()}`:null;
 const group=String(packet?.brief?.brand||packet?.brand||plan.offer||'Storyboard').slice(0,60);
 return plan.shots.filter(s=>s&&(s.action||s.camera)).slice(0,12).map((s,i)=>({group,shotId:String(s.id||`shot-${i+1}`),title:`${s.id||`shot-${i+1}`}: ${String(s.camera||'').slice(0,60)}`,input:buildInput({duration:Math.max(4,Number(s.duration)||5),prompt:['Vertical 9:16 video, one continuous shot.',lock('Character',plan.identity),lock('Wardrobe',plan.wardrobe),lock('Environment',plan.environment),lock('Camera',s.camera),lock('Action',s.action),s.dialogue&&s.dialogue.trim()?`Dialogue, spoken exactly: "${s.dialogue.trim()}"`:'No dialogue.',lock('Voice',plan.voice),lock('Audio',s.audio),lock('Creative direction',plan.creativeDirection),lock('Constraints',plan.constraints)].filter(Boolean).join('\n')})}));
}
export async function download(url,dir,name){mkdirSync(dir,{recursive:true});const res=await fetch(url,{signal:AbortSignal.timeout(120000)});if(!res.ok)throw Error(`Download failed with HTTP ${res.status}`);const file=path.join(dir,name);writeFileSync(file,Buffer.from(await res.arrayBuffer()));return file;}
