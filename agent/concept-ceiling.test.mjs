import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';

// No network: the video tools are stubs. A concept that never passes must stop at its Claude budget and keep its best version.
process.env.AGENT_DATA_DIR=mkdtempSync(path.join(tmpdir(),'concept-ceiling-'));
const {openStore}=await import('./store.mjs');
const {prepareLeadVideo,CONCEPT_CEILING_USD}=await import('./ugc.mjs');
const {buildInput}=await import('./tools/higgsfield.mjs');

const result=(score,i)=>({passed:false,cost:0.05,results:[{id:'a',name:'Audience fit',score:95,summary:'ok',issues:[],cost:0},{id:'b',name:'Camera and style',score,summary:`round ${i}`,issues:[{severity:'major',evidence:'x',fix:'y'}],cost:0}]});

test('a concept that never reaches the pass score stops at its budget, keeps the best revision and submits nothing',async()=>{
 assert.ok(CONCEPT_CEILING_USD>0&&CONCEPT_CEILING_USD<=1);
 const store=openStore(':memory:');
 const lead=store.createLead({taskId:null,domain:'zeta.com',company:'Zeta',url:'https://zeta.com/',market:'m',territory:'t'});
 const scores=[70,84,76,80,72,79,75];let n=0,revised=0,estimates=0;
 const video={endpoint:'bytedance/seedance-2.5/text-to-video',
  concept:async()=>({fields:{v:0},input:buildInput({prompt:'concept 0 long enough'}),cost:0.05}),
  revise:async()=>{revised++;return {fields:{v:revised},input:buildInput({prompt:`concept ${revised} long enough`}),cost:0.05};},
  check:async({input})=>{const i=n++;return result(scores[Math.min(i,scores.length-1)],i);},
  estimate:async()=>{estimates++;return {usd:1};},priceFrom:()=>'1.00'};
 const spent=[];
 const out=await prepareLeadVideo({store,lead,ctx:{company:'Zeta',url:'https://zeta.com/'},video,spend:usd=>spent.push(usd),ceilingUsd:0.3});
 assert.equal(out.failed,true);
 const r=store.getRender(out.render.id);
 assert.equal(r.status,'checks_failed');assert.match(r.error,/Concept budget reached/);
 assert.equal(Math.min(...r.checks.results.map(x=>x.score)),84,'the best revision (lowest checker 84) is the one kept');
 assert.equal(r.input.prompt.includes('concept 1'),true);
 assert.equal(estimates,0,'no price is fetched for a concept that never passed');
 assert.ok(spent.reduce((a,b)=>a+b,0)<=0.3+0.1+1e-9,'spend stops within one step of the ceiling');
 assert.equal(r.request_id,null);
});
