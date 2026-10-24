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
