export function makePlan(brief={},duration=15){
 const first=Math.max(1,Math.round(duration*.2)),last=first;
 return {schemaVersion:'1.0',status:'draft_for_review',durationSeconds:duration,identity:brief.avatar||'',wardrobe:'',environment:'',voice:brief.voice||'',creativeDirection:brief.creative||'',offer:brief.offer||'',constraints:brief.constraints||'',references:[],shots:[
  {id:'shot-01',start:0,duration:first,camera:'Medium shot, locked camera',action:'Establish the original character and one audience-relevant situation.',dialogue:'',audio:'Room tone. Confirm the intended soundscape.'},
  {id:'shot-02',start:first,duration:duration-first-last,camera:'Product or action detail',action:'Show one approved product use or story action. Confirm exact prop and action before generation.',dialogue:'',audio:'One motivated sound effect, with timing to be specified.'},
  {id:'shot-03',start:duration-last,duration:last,camera:'Return to the character or product close-up',action:'Resolve the visual beat. Add the exact approved call to action in editing.',dialogue:'',audio:'Leave a clean ending for the edit.'}
 ],generation:{model:null,estimatedCredits:null,spendApproved:false,submitted:false}};
}
export function retimePlan(plan,duration){
 if(![5,15,30].includes(duration))throw Error('Choose a 5, 15, or 30 second draft.');
 const fresh=makePlan({},duration);return {...plan,durationSeconds:duration,shots:plan.shots.map((shot,i)=>({...shot,start:fresh.shots[i].start,duration:fresh.shots[i].duration}))};
}
export function planFindings(plan){
 const issues=[];
 for(const key of ['identity','wardrobe','environment','voice'])if(!plan[key]?.trim())issues.push('Specify '+key+'.');
 if(!plan.references?.length)issues.push('Attach actual versioned references before specialist review.');else if(plan.references.some(r=>!r?.tag||!r.role||!r.assetId||!(r.version>0)))issues.push('Complete every reference tag, role, asset ID and version.');
 for(const shot of plan.shots){const words=shot.dialogue.trim().split(/\s+/).filter(Boolean).length;if(words>shot.duration*2.5)issues.push(shot.id+': '+words+' dialogue words may exceed a natural delivery in '+shot.duration+' seconds.');}
 issues.push('Script, claims, references, voice and generation quote still require approval.');
 return issues;
}
export function planPrompt(plan){
 return ['DRAFT STORYBOARD. Review and approve before generation.', 'Duration: '+plan.durationSeconds+' seconds. Aspect ratio: 9:16.', 'Character identity: '+(plan.identity||'[TO CONFIRM]'), 'Wardrobe lock: '+(plan.wardrobe||'[TO CONFIRM]'), 'Environment lock: '+(plan.environment||'[TO CONFIRM]'),'Voice direction: '+(plan.voice||'[TO CONFIRM]'),'Creative direction from brief: '+plan.creativeDirection,'Offer from brief, not independently verified: '+plan.offer,'Constraints: '+plan.constraints,'Reference bindings: '+(plan.references.length?plan.references.map(r=>(r?.tag||'[MISSING TAG]')+' = '+(r?.role||'[MISSING ROLE]')+' / '+(r?.assetId||'[MISSING ASSET]')+' / version '+(r?.version||'[MISSING VERSION]')).join('; '):'[ACTUAL ATTACHMENTS REQUIRED]'),...plan.shots.map(shot=>shot.id+' ['+shot.start+'-'+(shot.start+shot.duration)+'s]\nCamera: '+shot.camera+'\nAction: '+shot.action+'\nDialogue: '+(shot.dialogue||'[NO DIALOGUE WRITTEN. CONFIRM SILENT OR SUPPLY SCRIPT]')+'\nAudio: '+shot.audio),'Do not invent product claims, change the reference identity, add unapproved dialogue, or submit generation.'].join('\n\n');
}
