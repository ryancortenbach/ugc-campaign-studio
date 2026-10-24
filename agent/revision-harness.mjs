import {spendingPaused} from './spending-policy.mjs';

export function assertRevisionWorkAllowed(store){
 if(spendingPaused(store))throw Object.assign(Error('Paid work is paused. The revision remains saved for review.'),{code:'spending_paused',status:423});
}

// Quality failure is feedback for the next revision, never an attempt-limit exit.
export async function reviseUntilPassed({candidate,check,revise,accept=checks=>checks.passed,checkpoint=async()=>{},onChecked=async()=>{},onRevision=async()=>{}}){
 let revision=0;
 for(;;){
  await checkpoint();
  const checks=await check(candidate,revision);
  await onChecked(candidate,checks,revision);
  if(accept(checks))return {candidate,checks,revision};
  await checkpoint();
  revision++;
  await onRevision(candidate,checks,revision);
  candidate=await revise(candidate,checks,revision);
 }
}
