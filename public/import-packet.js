import {fields,normalizeBrief} from './brief.js';
import {makePlan} from './planner.js';
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
function text(value,label,max=6000){if(value===undefined)return '';if(typeof value!=='string'||value.length>max)throw Error(label+' must be text up to '+max+' characters.');return value;}
function normalizePlan(input,brief){
 if(!object(input))throw Error('Storyboard must be an object.');
 if(![5,15,30].includes(input.durationSeconds))throw Error('Storyboard duration must be 5, 15, or 30 seconds.');
 if(!Array.isArray(input.shots)||input.shots.length!==3)throw Error('Storyboard must contain exactly three timed shots.');
 const plan=makePlan(brief,input.durationSeconds);
 for(const key of ['identity','wardrobe','environment','voice','creativeDirection','offer','constraints'])plan[key]=text(input[key],key);
 let cursor=0;
 plan.shots=input.shots.map((shot,index)=>{if(!object(shot)||shot.start!==cursor||!Number.isFinite(shot.duration)||shot.duration<=0)throw Error('Shot timings must be positive and contiguous.');cursor+=shot.duration;return {id:'shot-0'+(index+1),start:shot.start,duration:shot.duration,camera:text(shot.camera,'Camera'),action:text(shot.action,'Action'),dialogue:text(shot.dialogue,'Dialogue'),audio:text(shot.audio,'Audio')};});
 if(Math.abs(cursor-input.durationSeconds)>.001)throw Error('Shot durations must add up to the storyboard duration.');
 if(!Array.isArray(input.references)||input.references.length>100)throw Error('References must be an array of up to 100 records.');
 plan.references=input.references.map(ref=>{if(!object(ref)||!Number.isInteger(ref.version)||ref.version<1)throw Error('Each reference needs a positive integer version.');const result={tag:text(ref.tag,'Reference tag',200),role:text(ref.role,'Reference role',200),assetId:text(ref.assetId,'Reference asset ID',1000),version:ref.version};if(!result.tag||!result.role||!result.assetId)throw Error('Each reference needs a tag, role and asset ID.');return result;});
 // Imported planning data never grants approval or describes an executed request.
 plan.status='draft_for_review';plan.generation={model:null,estimatedCredits:null,spendApproved:false,submitted:false};return plan;
}
export function parseProductionPacket(source){
 if(typeof source!=='string'||new TextEncoder().encode(source).length>2*1024*1024)throw Error('Choose a JSON packet no larger than 2 MB.');
 let packet;try{packet=JSON.parse(source);}catch{throw Error('The selected file is not valid JSON.');}
 if(!object(packet)||!object(packet.brief))throw Error('Choose an exported production packet containing a brief.');
 for(const [key]of fields)if(packet.brief[key]!==undefined)text(packet.brief[key],key);
 const brief=normalizeBrief(packet.brief),storyboard=packet.production?.storyboard?normalizePlan(packet.production.storyboard,brief):makePlan(brief);
 const history=packet.production?.storyboardVersions??[];if(!Array.isArray(history)||history.length>500)throw Error('Storyboard history must be an array of up to 500 versions.');
 const versions=history.map(version=>{if(!object(version))throw Error('Invalid storyboard version.');return {savedAt:text(version.savedAt,'Version date',100),reason:text(version.reason,'Version reason',1000),plan:normalizePlan(version.plan,brief)};});
 return {brief,storyboard,versions,sourceSchemaVersion:text(packet.schemaVersion,'Schema version',100),approvalsReset:true};
}
