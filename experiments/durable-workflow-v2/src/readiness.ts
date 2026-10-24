import {sleep} from 'workflow';
export async function readinessWorkflowV2(input: unknown){
 'use workflow';
 const started=await timestamp();
 await sleep('15s');
 const report=await check(input);
 return {...report,started,completed:await timestamp(),spendApproved:false,generationSubmitted:false};
}
async function timestamp(){'use step';return new Date().toISOString();}
async function check(input: unknown){
 'use step';
 const {preflight,fingerprint}=await import('../lib/review.js');
 const issues=preflight(input);
 return {status:issues.length?'needs_attention':'ready_for_specialist_review',issues,fingerprint:fingerprint(input),modelCalls:0};
}
