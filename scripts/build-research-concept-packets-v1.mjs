import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {productionPacket,fields} from '../public/brief.js';
import {makePlan,planFindings,planPrompt} from '../public/planner.js';
import {parseProductionPacket} from '../public/import-packet.js';
import {preflight} from '../src/readiness.js';
const save=(file,value)=>{const bytes=Buffer.from(value);if(existsSync(file)&&!readFileSync(file).equals(bytes))throw Error('Existing output differs. Preserve it and create a new version: '+file);writeFileSync(file,bytes);};
const digest=value=>createHash('sha256').update(value).digest('hex');
const source='docs/RESEARCH-FLAGGED-TRIAGE-v1.json';
const research=JSON.parse(readFileSync(source));
const output='docs/creative/research-concept-packets-v1';
const site='experiments/concept-packet-handoff-v1';
for(const dir of [output,site,`${site}/packets`,`${site}/runtime`])mkdirSync(dir,{recursive:true});
const settings=[
 {id:'mirror',environment:'Proposed fictional domestic mirror set, not approved.',camera:['Locked medium shot including the mirror and avatar.','Maintain the same framing for the proposed reflection discrepancy.','Small product-facing finish within the same composition.'],risk:'High: reflection/pose mismatch needs a controlled compositing or editing plan. Preserve accepted character geometry. No model capability or continuous motion proof exists.'},
 {id:'instructions',environment:'Proposed fictional private waiting area, not approved. No bystander likenesses.',camera:['Locked medium shot with package clearly in view.','Keep the instruction-sheet reveal readable in the same composition.','Product detail only after its exact use and claim are approved.'],risk:'Medium: unfolding geometry, hand contact and product readability need review. Do not imply easy setup or any product benefit without evidence.'},
 {id:'wardrobe',environment:'Proposed original avatar room, not approved. No television or game footage.',camera:['Locked medium shot showing the original outfit.','Widen only enough to reveal a harmless task and safe prop.','Hold a simple garment or product presentation.'],risk:'Medium: dressing gestures, garment consistency and prop contact need review. Do not substitute a third-party character outfit or source likeness.'}
];
const manifest={version:1,status:'draft_handoff_not_production_ready',source,sourceSha256:digest(readFileSync(source)),scope:'Three original research-derived planning packets. No brand qualification, asset approval, specialist model grading, generation, human study or outreach.',historicalAvatar:'Recovered penthouse workflow remains historical. No new identity or voice binding inferred. Existing personalized-character proposal remains separate and unmodified.',packets:[],runtimeCopies:{}};
for(const [i,row]of research.visual_cases.entries()){
 const option=settings[i],brief=Object.fromEntries(fields.map(([key])=>[key,'']));
 brief.audience='Proposed audience hypothesis: gaming and internet-culture viewers who recognize an exaggerated everyday situation. Based on the defined research sample, not a verified brand ICP.';
 brief.objective='One original five-second vertical planning draft. Test visual clarity and product legibility after the actual brand and assets are approved. No view or sales guarantee.';
 brief.creative=`Original concept: ${row.original_brief.title}. ${row.interpretation} Research context only: ${row.url}. Do not copy the source identity, dialogue, music, franchise footage or artwork.`;
 brief.constraints=`DRAFT ONLY. Brand, offer, commercial avatar and voice are unknown. No spending, model submission, outreach or publishing. No current quote. Source URLs are research provenance, not attached generation references. The old penthouse avatar and existing personalized-character proposal are not new commercial approval. ${option.risk} ${row.original_brief.required_before_generation.join('; ')}. Timings are proposed edit beats, not provider-supported clip durations. No new dialogue. Silent scene and sound design are proposals requiring approval.`;
 const packet=productionPacket(brief),plan=makePlan(brief,5);plan.environment=option.environment;plan.identity='';plan.wardrobe='';plan.voice='';plan.references=[];
 const beatDurations=i===1?[1.25,2.25,1.5]:[1.5,1.75,1.75];let cursor=0;
 plan.shots=row.original_brief.shots.map((shot,n)=>{const start=cursor;cursor+=beatDurations[n];return {id:`shot-0${n+1}`,start,duration:beatDurations[n],camera:option.camera[n],action:shot.description,dialogue:'',audio:row.original_brief.sound};});
 plan.constraints+=' Timings adjusted to exact quarter-second edit beats for this importer; original research brief timings are preserved separately.';
 plan.conceptSource={id:`research-5s-${option.id}-v1`,title:row.original_brief.title,reportUrl:'/research/report.html',sourceUrls:[row.url],sourceStatus:'research_context_only'};
 packet.production.storyboard=plan;packet.production.storyboardVersions=[];
 packet.handoff={id:option.id,title:row.original_brief.title,readiness:'blocked_missing_brand_assets_quote_and_approvals',risk:option.risk,required:row.original_brief.required_before_generation,assetBindings:[],outreachRecipient:null,renderedVideo:null};
 const text=JSON.stringify(packet,null,2)+'\n',parsed=parseProductionPacket(text),prompt=planPrompt(parsed.storyboard);
 const preflightIssues=preflight({brief:parsed.brief,prompt,references:parsed.storyboard.references,settings:{durationSeconds:5,estimatedCredits:null},lockedDialogue:[]});
 if(parsed.storyboard.references.length||parsed.storyboard.generation.spendApproved||parsed.storyboard.generation.submitted||!parsed.approvalsReset)throw Error('Unsafe imported state.');
 const file=`${option.id}-v1.json`;save(`${output}/${file}`,text);save(`${site}/packets/${file}`,text);
 manifest.packets.push({id:option.id,title:row.original_brief.title,file:`packets/${file}`,sha256:digest(text),bytes:Buffer.byteLength(text),sourceId:row.id,sourceUrl:row.url,missingIntake:fields.filter(([key])=>!parsed.brief[key].trim()).map(([key])=>key),plannerFindings:planFindings(parsed.storyboard),preflightIssues,parseApprovalsReset:parsed.approvalsReset,conceptSourceStatus:parsed.storyboard.conceptSource.sourceStatus,risk:option.risk,timingAdjustment:{reason:'Quarter-second planning beats avoid existing exact floating-point cursor comparison; original notes unchanged.',originalDurations:row.original_brief.shots.map(s=>Number((s.end-s.start).toFixed(3))),draftDurations:beatDurations},readiness:'blocked',generationSubmitted:false});
}
for(const name of ['brief.js','planner.js','import-packet.js']){const bytes=readFileSync(`public/${name}`);save(`${site}/runtime/${name}`,bytes);manifest.runtimeCopies[name]=digest(bytes);}
save(`${output}/manifest-v1.json`,JSON.stringify(manifest,null,2)+'\n');save(`${site}/manifest.json`,JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({packets:manifest.packets.map(p=>({id:p.id,missingIntake:p.missingIntake,preflightCategories:p.preflightIssues.map(f=>f.category),approvalReset:p.parseApprovalsReset})),runtimeCopiesExact:true}));
