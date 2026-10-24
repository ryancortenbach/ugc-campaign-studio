import {test} from 'node:test';
import assert from 'node:assert/strict';
import {makePlan,retimePlan,planFindings,planPrompt} from '../public/planner.js';
test('storyboard drafts retain supplied facts and leave unknown creative approvals unset',()=>{
 const plan=makePlan({avatar:'Original character',voice:'Original voice',offer:'T-shirt $59.99',constraints:'No unverified claims'});
 assert.equal(plan.identity,'Original character');assert.equal(plan.environment,'');assert.equal(plan.wardrobe,'');
 assert.ok(plan.shots.every(shot=>shot.dialogue===''));assert.equal(plan.generation.submitted,false);assert.equal(plan.generation.spendApproved,false);
 const prompt=planPrompt(plan);assert.ok(prompt.includes('T-shirt $59.99'));assert.ok(prompt.includes('No unverified claims'));assert.ok(planFindings(plan).includes('Specify environment.'));
});
test('retiming makes contiguous shots of the requested total and preserves the written script',()=>{
 const original=makePlan();original.shots[1].dialogue='The approved words.';
 for(const duration of [5,15,30]){const plan=retimePlan(original,duration);assert.equal(plan.shots.reduce((n,s)=>n+s.duration,0),duration);assert.equal(plan.shots[1].start,plan.shots[0].duration);assert.equal(plan.shots[2].start+plan.shots[2].duration,duration);assert.equal(plan.shots[1].dialogue,'The approved words.');}
 assert.equal(original.durationSeconds,15);assert.throws(()=>retimePlan(original,0));
});
test('long dialogue is flagged for timing and malformed reference metadata does not pretend to bind assets',()=>{
 const plan=makePlan({},5);plan.shots[0].dialogue='one two three four five six';plan.references=[null];
 assert.ok(planFindings(plan).some(x=>x.includes('may exceed')));assert.ok(planPrompt(plan).includes('[MISSING ASSET]'));
});
