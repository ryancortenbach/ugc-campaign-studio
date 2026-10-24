// Presentation allocations replay the saved campaign budget. They never write to the spend ledger.
export const campaignBudget={higgsfield:7.20,claude:3.22,exa:.12,solari:.001,terac:0,elevenlabs:null};
export function campaignCosts(steps,index,{budget=campaignBudget,voiceCharacters=0}={}){
 const reached=new Set(steps.slice(0,index+1).map(s=>s.id)),has=id=>reached.has(id),fraction={
  exa:has('research')?1:0,solari:has('solari-research')?1:0,
  claude:has('full-render')?1:has('outreach')?.8:has('character')?.65:has('icp')?.4:has('task')?.1:0,
  higgsfield:has('full-render')?1:has('sample')?1/6:0,terac:has('terac-sync')?1:0,elevenlabs:has('voice')?1:0
 };
 return Object.fromEntries(Object.entries(fraction).map(([provider,f])=>[provider,{spent:budget[provider]==null?null:budget[provider]*f,usage:provider==='terac'?(f?'1 project created':'0 projects'):provider==='elevenlabs'?`${Math.round(voiceCharacters*f).toLocaleString('en-US')} characters used`:null,basis:provider==='terac'?'Creating a project is free. No recruitment was launched.':'Saved campaign cost allocation for presentation playback. No new provider submission.'}]));
}
