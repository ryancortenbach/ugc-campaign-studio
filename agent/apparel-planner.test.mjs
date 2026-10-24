import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {suggestBoards,swapCost,reviewLocalPlan,imageShotRequest,planningSystemPrompt} from './public/apparel-planner.js';
const research=JSON.parse(readFileSync(new URL('./public/apparel-storyboard-research-v1.json',import.meta.url)));

test('offline proposals stay coherent across categories and variation sets without making network calls',()=>{
 const old=globalThis.fetch;globalThis.fetch=()=>{throw Error('A planning action attempted a network call');};
 try{for(const category of ['T-shirt','Hoodie','Overshirt'])for(let variant=0;variant<12;variant++){
  const plans=suggestBoards({category,variant},research);
  assert.equal(plans.length,3);assert.equal(new Set(plans.map(p=>p.title)).size,3);
  for(const p of plans){assert.equal(p.category,category);assert.equal(p.durationSeconds,18);assert.deepEqual(p.localReview.issues,[]);assert.deepEqual(p.shots.map(s=>[s.start,s.duration]),[[0,6],[6,6],[12,6]]);assert.equal(p.generation.spendApproved,false);assert.equal(p.generation.submitted,false);assert.ok(p.sourceRuleIds.every(id=>research.rules.some(r=>r.id===id)));}
 }}finally{globalThis.fetch=old;}
});
test('changing apparel preserves generic spoken lines and source identity',()=>{
 const a=suggestBoards({category:'Hoodie',identity:'Approved original face'},research),b=suggestBoards({category:'T-shirt',identity:'Approved original face'},research);
 for(let i=0;i<a.length;i++){assert.equal(a[i].identity,b[i].identity);assert.deepEqual(a[i].shots.map(s=>s.dialogue),b[i].shots.map(s=>s.dialogue));assert.notEqual(a[i].wardrobe,b[i].wardrobe);}
});
test('cost model bills source and output, rejects the unsupported full-length source',()=>{
 assert.equal(swapCost(6),1.2);assert.equal(swapCost(6,1,10),12);assert.equal(swapCost(6,3,10),36);assert.ok(Math.abs(swapCost(6)*3-3.6)<1e-9);
 assert.throws(()=>swapCost(24),/4 and 15/);assert.throws(()=>swapCost(6,0),/1 to 3/);
});
test('local review detects timing, excessive speech, category leakage and accidental approval',()=>{
 const p=structuredClone(suggestBoards({},research)[0]);p.shots[1].start=8;p.shots[0].dialogue='hoodie '.repeat(20);p.generation.spendApproved=true;
 const issues=reviewLocalPlan(p).issues.join(' ');assert.match(issues,/gap or overlap/);assert.match(issues,/shorten/);assert.match(issues,/garment-specific/);assert.match(issues,/cannot grant spend/);
});
test('ImageGen request binds exact reference roles and stays a no-spend preparation',()=>{
 const p=suggestBoards({},research)[0];assert.throws(()=>imageShotRequest(p,p.shots[0],[]),/character reference/);
 const refs=[{id:'hero',name:'Approved hero',role:'character',url:'/storyboard-assets/current-hero-v1.png'},{id:'front',name:'Garment front',role:'apparel',url:'/uploads/front.png'}];
 const request=imageShotRequest(p,p.shots[1],refs);assert.equal(request.model,'gpt-image-2');assert.equal(request.n,1);assert.equal(request.quoteUsd,null);assert.equal(request.spendApproved,false);assert.equal(request.submitted,false);assert.deepEqual(request.references.map(r=>r.role),['character','apparel']);assert.match(request.prompt,/Image 1: character/);assert.match(request.prompt,/Image 2: apparel/);assert.match(request.prompt,/do not copy its environment or wardrobe/);assert.equal(request.size,'1008x1792');
});
test('agent prompt carries outreach, references, original authorship and paid-call boundary',()=>{
 const prompt=planningSystemPrompt(research);for(const s of ['outreach','Genjutsu Lite','reference','No spend approval','Do not call any paid'])assert.ok(prompt.includes(s),s);
});
