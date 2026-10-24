export function reviewInputKey(input){return JSON.stringify({prompt:input.prompt,brief:input.brief,references:input.references,settings:input.settings,lockedDialogue:input.lockedDialogue});}
export function reportedRequests(result){
 if(Number.isInteger(result?.modelCalls)&&result.modelCalls>=0)return result.modelCalls;
 if(!Array.isArray(result?.rounds)||!result.rounds.length)return null;
 let total=0;
 for(const round of result.rounds){if(!Number.isInteger(round.report?.modelCalls))return null;total+=round.report.modelCalls;if(round.revision)total++;}
 return total;
}
export function createReviewRecord(input,result,mode,at=new Date().toISOString()){
 const submittedInput=structuredClone({prompt:input.prompt,brief:input.brief,references:input.references,settings:input.settings,lockedDialogue:input.lockedDialogue});
 // A revised prompt is a different reviewed input from the submitted draft.
 const reviewedInput={...submittedInput,prompt:typeof result.prompt==='string'?result.prompt:submittedInput.prompt};
 return {schemaVersion:'1.0',createdAt:at,mode:mode==='agents'?'agents':'preflight',submittedInput,reviewedInput,inputKey:reviewInputKey(reviewedInput),result:structuredClone(result),reportedModelRequests:reportedRequests(result),spendApproved:false,generationSubmitted:false};
}
export function reviewFreshness(record,current){return current&&record.inputKey===reviewInputKey(current)?'matches_current_inputs':'stale_inputs';}
export function reviewLabel(record){if(record.result?.error)return 'Request failed';if(record.mode==='preflight')return 'Readiness only';return record.result.status==='ready_for_human_and_spend_review'?'Review gate passed. Human and spend approval pending':'Specialist review blocked or needs revision';}
