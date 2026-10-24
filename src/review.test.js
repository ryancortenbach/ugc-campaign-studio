import {test}from'node:test';import assert from'node:assert/strict';import {fingerprint,preflight,reviewPrompt,reviewers}from'./review.js';
test('missing context stops model spending before any call',async()=>{const r=await reviewPrompt({prompt:'short'});assert.equal(r.status,'blocked');assert.equal(r.modelCalls,0);assert.equal(r.localIssues.length,4);});
test('approval binding changes when prompt or reference version changes',()=>{const a={prompt:'x',references:[{version:1}]};assert.notEqual(fingerprint(a),fingerprint({...a,prompt:'y'}));assert.notEqual(fingerprint(a),fingerprint({...a,references:[{version:2}]}));assert.equal(reviewers.length,7);});
test('complete preflight does not masquerade as specialist approval',()=>{assert.equal(preflight({prompt:'@character '+ 'a'.repeat(150),references:[{tag:'@character',role:'identity',assetId:'asset-1',version:1}],settings:{durationSeconds:5,estimatedCredits:35}}).length,0);});
import {runReviewLoop}from'./review.js';
test('review loop stops on missing context and cannot grant generation approval',async()=>{let revisions=0;const r=await runReviewLoop({prompt:'short',maxRounds:3},async()=>({status:'blocked',localIssues:[{}]}),async()=>{revisions++;});assert.equal(revisions,0);assert.equal(r.generationSubmitted,false);});
test('review loop enforces three-round maximum and preserves reference manifest',async()=>{let calls=0,revisions=0;const input={...validInput,maxRounds:99};const r=await runReviewLoop(input,async x=>{calls++;assert.deepEqual(x.references,input.references);return {status:'needs_revision',grades:[],errors:[]};},async()=>({prompt:validInput.prompt+' Revision '+(++revisions),changes:['change']}));assert.equal(calls,3);assert.equal(revisions,2);assert.equal(r.status,'revision_limit_reached');assert.equal(r.spendApproved,false);});
test('incomplete, duplicated or unbound references block before model calls',()=>{const issues=preflight({prompt:'x'.repeat(150),references:[{tag:'@character',role:'identity',assetId:'asset-1',version:1},{tag:'@character'}],settings:{durationSeconds:5,estimatedCredits:35}});assert.ok(issues.some(x=>x.evidence.includes('missing a tag')));assert.ok(issues.some(x=>x.evidence.includes('duplicated')));assert.ok(issues.some(x=>x.evidence.includes('missing from the prompt')));});
const validInput={prompt:'@character Walk into the room and show the approved product. Keep the same outfit and camera position. Say: This is the approved line.',lockedDialogue:['This is the approved line.'],references:[{tag:'@character',role:'identity',assetId:'approved-1',version:1}],settings:{durationSeconds:5,estimatedCredits:35}};
test('dialogue locks bind approval and missing exact dialogue blocks preflight',()=>{
 assert.equal(preflight(validInput).length,0);
 assert.notEqual(fingerprint(validInput),fingerprint({...validInput,lockedDialogue:[]}));
 assert.ok(preflight({...validInput,prompt:validInput.prompt.replace('approved line','new line')}).some(x=>x.category==='dialogue'));
});
test('a revision changing approved dialogue stops before another review and preserves the prior prompt',async()=>{
 let calls=0;
 const result=await runReviewLoop({...validInput,maxRounds:3},async()=>{calls++;return {status:'needs_revision'};},async()=>({prompt:validInput.prompt.replace('approved line','changed line'),changes:['Changed dialogue']}));
 assert.equal(calls,1);assert.equal(result.status,'blocked');assert.equal(result.prompt,validInput.prompt);assert.equal(result.rounds[0].revision.rejected,true);assert.equal(result.generationSubmitted,false);
});
test('invalid reviewer severity fails closed instead of silently disappearing from the final gate',async()=>{
 const result=await reviewPrompt(validInput,async()=>({score:99,summary:'fixture',issues:[{severity:'unknown',evidence:'fixture',fix:'fixture'}]}));
 assert.equal(result.status,'needs_revision');assert.equal(result.errors.length,7);assert.equal(result.finalJudge.verdict,'block');
});
