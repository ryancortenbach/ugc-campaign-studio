import {createHash} from 'node:crypto';
export function fingerprint(input){return createHash('sha256').update(JSON.stringify({prompt:input?.prompt,brief:input?.brief,references:input?.references,settings:input?.settings,lockedDialogue:input?.lockedDialogue})).digest('hex');}
const nonempty=value=>typeof value==='string'&&value.trim().length>0;
const positive=value=>typeof value==='number'&&Number.isFinite(value)&&value>0;
export function preflight(input){
 const issues=[],prompt=typeof input?.prompt==='string'?input.prompt:'';
 const block=(category,evidence,fix)=>issues.push({severity:'blocking',category,evidence,fix});
 if(prompt.trim().length<100||prompt.length>30000)block('prompt','Prompt is missing, shorter than 100 characters or longer than 30000 characters.','Supply the complete production prompt within the supported length.');
 if(!Array.isArray(input?.references)||!input.references.length)block('references','No reference manifest supplied.','Attach an approved reference manifest with tag, role, asset ID and version.');
 if(Array.isArray(input?.references)&&input.references.length){
  if(input.references.length>100)block('references','Reference manifest exceeds 100 records.','Keep the intended versioned manifest within 100 records.');
  const invalid=input.references.filter(r=>!r||!nonempty(r.tag)||!nonempty(r.role)||!nonempty(r.assetId)||!Number.isSafeInteger(r.version)||r.version<1);
  if(invalid.length)block('references','Reference records are missing a tag, role, asset ID or positive integer version.','Supply nonempty text fields and a positive integer version for every reference.');
  const tags=input.references.map(r=>r?.tag).filter(nonempty);
  if(new Set(tags).size!==tags.length)block('references','Reference tags are duplicated.','Assign one unique role binding to each tag.');
  if(tags.some(tag=>!prompt.includes(tag)))block('references','A manifest tag is missing from the prompt.','Use every intended reference tag in the prompt and confirm the real attachment in Higgsfield.');
 }
 if(!positive(input?.settings?.durationSeconds))block('timing','No finite positive generation duration.','Set duration as a finite positive number and make the shot timeline fit it.');
 if(!positive(input?.settings?.estimatedCredits))block('budget','No finite positive cost estimate.','Obtain a current finite positive Higgsfield quote before requesting spend approval.');
 if(input?.lockedDialogue!==undefined){
  if(!Array.isArray(input.lockedDialogue)||input.lockedDialogue.length>100||input.lockedDialogue.some(line=>!nonempty(line)))block('dialogue','Approved dialogue must be an array of up to 100 nonempty exact lines.','Supply each approved dialogue line or leave the list empty for silent scenes.');
  else if(input.lockedDialogue.some(line=>!prompt.includes(line)))block('dialogue','An approved dialogue line is missing or changed in the prompt.','Restore every exact approved line before review.');
 }
 return issues;
}
