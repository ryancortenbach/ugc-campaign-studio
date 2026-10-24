import {test} from 'node:test';import assert from 'node:assert/strict';
import {createReviewRecord,reviewFreshness,reviewLabel,reportedRequests} from '../public/review-records.js';
const input={prompt:'Draft prompt',brief:{brand:'Test brand'},references:[{tag:'@character',assetId:'fixture',version:1}],settings:{durationSeconds:5,estimatedCredits:0},lockedDialogue:['Exact words']};
test('readiness records preserve snapshots without becoming specialist or spend approval',()=>{
 const record=createReviewRecord({...input,authorization:'must not be stored'},{status:'preflight_only',modelCalls:0},'preflight');
 assert.equal(reviewLabel(record),'Readiness only');assert.equal(record.reportedModelRequests,0);assert.equal(record.spendApproved,false);assert.equal(record.submittedInput.authorization,undefined);
 assert.equal(reviewFreshness(record,input),'matches_current_inputs');assert.equal(reviewFreshness(record,{...input,prompt:'Changed draft'}),'stale_inputs');
});
test('revised prompts bind the report to the final reviewed draft, not the original submission',()=>{
 const record=createReviewRecord(input,{prompt:'Revised prompt',status:'ready_for_human_and_spend_review',modelCalls:15},'agents');
 assert.equal(reviewFreshness(record,input),'stale_inputs');assert.equal(reviewFreshness(record,{...input,prompt:'Revised prompt'}),'matches_current_inputs');assert.equal(record.submittedInput.prompt,'Draft prompt');assert.equal(record.spendApproved,false);
});
test('reference, brief, settings and dialogue edits invalidate prior evidence',()=>{
 const record=createReviewRecord(input,{status:'preflight_only'},'preflight');
 for(const change of [{references:[]},{brief:{brand:'Changed'}},{settings:{durationSeconds:15}},{lockedDialogue:['Different words']}])assert.equal(reviewFreshness(record,{...input,...change}),'stale_inputs');
 assert.equal(reviewFreshness(record,null),'stale_inputs');
});
test('unknown call totals stay unknown and known revision requests are included',()=>{
 assert.equal(reportedRequests({error:'Connection unavailable'}),null);
 assert.equal(reportedRequests({rounds:[{report:{modelCalls:7},revision:{attempted:true}},{report:{modelCalls:7}}]}),15);
 assert.equal(reportedRequests({rounds:[{report:{}}]}),null);
});
