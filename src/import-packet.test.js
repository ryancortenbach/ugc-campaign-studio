import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseProductionPacket} from '../public/import-packet.js';
import {makePlan} from '../public/planner.js';
import {productionPacket} from './brief.js';
function fixture(){const packet=productionPacket({brand:'Original brand',avatar:'Original avatar'});packet.production.storyboard=makePlan(packet.brief);packet.production.storyboardVersions=[{savedAt:'2026-10-24T07:00:00Z',reason:'First draft',plan:makePlan(packet.brief,5)}];return packet;}
test('exported packets import their current storyboard and history without trusting approval flags',()=>{
 const input=fixture();input.approvals.spend=true;input.production.storyboard.generation={spendApproved:true,submitted:true,estimatedCredits:99};input.production.storyboardVersions[0].plan.generation.submitted=true;
 const result=parseProductionPacket(JSON.stringify(input));
 assert.equal(result.brief.brand,'Original brand');assert.equal(result.versions.length,1);assert.equal(result.versions[0].plan.durationSeconds,5);
 assert.equal(result.storyboard.generation.spendApproved,false);assert.equal(result.storyboard.generation.submitted,false);assert.equal(result.storyboard.generation.estimatedCredits,null);assert.equal(result.versions[0].plan.generation.submitted,false);assert.equal(result.approvalsReset,true);
 assert.equal(input.approvals.spend,true);
});
test('legacy brief-only packets remain importable and unknown properties are discarded',()=>{
 const result=parseProductionPacket(JSON.stringify({brief:{brand:'Legacy',injected:'unexpected'},other:'unexpected'}));
 assert.equal(result.storyboard.durationSeconds,15);assert.equal(result.brief.brand,'Legacy');assert.equal(result.brief.injected,undefined);assert.equal(result.other,undefined);
});
test('malformed or oversized packets and inconsistent timelines are rejected',()=>{
 for(const source of ['not JSON','[]','{}',JSON.stringify({brief:{brand:42}}),' '.repeat(2*1024*1024+1)])assert.throws(()=>parseProductionPacket(source));
 const packet=fixture();packet.production.storyboard.shots[1].start=99;assert.throws(()=>parseProductionPacket(JSON.stringify(packet)),/contiguous/);
 packet.production.storyboard=makePlan();packet.production.storyboard.references=[null];assert.throws(()=>parseProductionPacket(JSON.stringify(packet)),/reference/);
});
test('authored decimal edit beats import and round trip in current and historical plans',()=>{
 const input=fixture(),plan=makePlan(input.brief,5);
 plan.shots.forEach((shot,index)=>Object.assign(shot,{start:[0,1.2,3.4][index],duration:[1.2,2.2,1.6][index]}));
 input.production.storyboard=plan;input.production.storyboardVersions[0].plan=structuredClone(plan);
 plan.generation={spendApproved:true,submitted:true,estimatedCredits:50};
 const original=JSON.stringify(input),result=parseProductionPacket(original);
 for(const imported of [result.storyboard,result.versions[0].plan]){
  assert.deepEqual(imported.shots.map(({start,duration})=>({start,duration})),plan.shots.map(({start,duration})=>({start,duration})));
  assert.equal(imported.generation.spendApproved,false);assert.equal(imported.generation.submitted,false);
 }
 const roundTrip=parseProductionPacket(JSON.stringify({...input,production:{storyboard:result.storyboard,storyboardVersions:result.versions}}));
 assert.deepEqual(roundTrip.storyboard,result.storyboard);assert.equal(JSON.stringify(input),original);
});
test('decimal tolerance still rejects real gaps, overlaps and invalid timing types',()=>{
 for(const start of [1.2+1e-10,1.2-1e-10,'1.2',null,-1,Infinity,NaN]){
  const input=fixture(),plan=makePlan({},5);
  plan.shots.forEach((shot,index)=>Object.assign(shot,{start:[0,1.2,3.4][index],duration:[1.2,2.2,1.6][index]}));
  plan.shots[1].start=start;input.production.storyboard=plan;
  assert.throws(()=>parseProductionPacket(JSON.stringify(input)),/contiguous/);
 }
 const input=fixture();input.production.storyboard.shots[0].start=-Number.EPSILON;
 assert.throws(()=>parseProductionPacket(JSON.stringify(input)),/contiguous/);
 input.production.storyboard=makePlan({},5);input.production.storyboard.shots[2].duration+=.01;
 assert.throws(()=>parseProductionPacket(JSON.stringify(input)),/add up/);
});
