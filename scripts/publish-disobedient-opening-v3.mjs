// Publish the actual opening repair without changing other brands or authorizing outreach.
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import path from 'node:path';
import {openStore} from '../agent/store.mjs';
const root=path.resolve(import.meta.dirname,'..'),work=path.join(root,'work/streetwear-demo-v1'),pub=path.join(root,'agent/public');
const read=p=>JSON.parse(readFileSync(p,'utf8')),state=read(path.join(work,'disobedient-opening-state-v3.json'));
const packetFile=path.join(pub,'client-demo-data-v2.json'),packet=read(packetFile),brand=packet.brands.find(b=>b.id==='disobedient');
const plan=read(path.join(root,'research_notes/streetwear-demo-v1/disobedient-opening-repair-plan-v3.json'));
const store=openStore();
try{
 if(brand.revisionDraft?.storyboardUrl&&!brand.supersededConcepts?.some(c=>c.url===brand.revisionDraft.storyboardUrl))brand.supersededConcepts=[...(brand.supersededConcepts||[]),{url:brand.revisionDraft.storyboardUrl,note:'Superseded blank-front interpretation. User requested matching printed artwork in the opening.'}];
 brand.revisionDraft={...plan,status:state.status,requestId:state.requestId||null,renderId:state.renderId||null,paidRetryAuthorized:true,estimatedUsd:state.estimatedUsd};
 brand.storyboardImageUrl='/streetwear-demo-assets/disobedient-printed-anchor-v3.png';
 brand.storyboardCaption='Target garment from the existing later shot. The opening repair must match this same printed hoodie throughout. The earlier blank-front proposal is superseded.';
 brand.genjutsuPreparation.request=plan.request;
 brand.genjutsuPreparation.submission={requestId:state.requestId,status:state.status,submittedAt:state.submittedAt,completedAt:state.completedAt||null,error:state.error||null,estimatedUsd:state.estimatedUsd};
 brand.history=brand.history.filter(e=>!['opening-repair-v3','opening-join-v3','opening-qa-v3'].includes(e.id));
 brand.history.push({id:'opening-repair-v3',stage:4,tool:'higgsfield.genjutsu-light',title:'Repair the blank opening to match the printed later hoodie',mode:'recorded',kind:'tool',status:state.status,startedAt:state.submittedAt,completedAt:state.completedAt,input:{sourceOpeningSeconds:5.5,preservedTailSeconds:.5,anchorUrl:brand.storyboardImageUrl,prompt:plan.request.prompt},output:{requestId:state.requestId,renderId:state.renderId,estimatedUsd:state.estimatedUsd,actualItemizedUsd:null},note:'User clarified that the missing print in the early shots is the defect. One authorized repair, no automatic retries.'});
 const receiptFile=path.join(work,'disobedient-opening-finish-receipt-v3.json'),qaFile=path.join(work,'disobedient-opening-visual-qa-v3.json');
 let ready=false;
 if(existsSync(receiptFile)&&existsSync(qaFile)){
  const receipt=read(receiptFile),qa=read(qaFile),name='disobedient-garment-review-v3.mp4';
  if(!receipt.mediaChecksPassed||!existsSync(path.join(pub,'streetwear-demo-assets',name)))throw Error('Verified repaired media is missing.');
  if(brand.sampleVideo?.url&&!brand.archivedSampleVideos?.some(v=>v.url===brand.sampleVideo.url))brand.archivedSampleVideos=[...(brand.archivedSampleVideos||[]),brand.sampleVideo];
  brand.sampleVideo={url:`/streetwear-demo-assets/${name}`,title:'Disobedient: repaired printed hoodie opening v3',requestId:state.requestId,durationSeconds:6,status:qa.status==='needs_revision'?'needs_revision':'ready_for_human_review',containsCTA:false,ctaPreviewUrl:'/streetwear-demo-assets/disobedient-cta-preview-v1.png',cta:brand.cta,verification:receipt,visualQA:qa};
  const render=store.getRender(state.renderId),target=path.join(root,'agent/.data/renders',name);
  writeFileSync(target,readFileSync(path.join(pub,'streetwear-demo-assets',name)));
  store.updateRender(render.id,{status:'completed',local_file:name,review:'pending',plan:{...render.plan,finalSeconds:6,visualQA:qa}});
  brand.history.push({id:'opening-join-v3',stage:4,tool:'local video assembly',title:'Join the repaired opening to the unchanged later shot and restore original audio',mode:'recorded',kind:'tool',status:'complete',input:{repairedOpeningSeconds:5.5,preservedTailSeconds:.5},output:receipt,note:'No CTA appended during garment review.'},{id:'opening-qa-v3',stage:5,tool:'AI visual review',title:'Check printed garment continuity across the actual repaired video',mode:'recorded',kind:'analysis',status:qa.status,output:qa});
  for(const e of [{tool:'media.finish',callId:'opening-finish-v3',status:'success',title:'Assemble the corrected opening with the unchanged ending',output:receipt},{tool:'media.visual_review',callId:'opening-qa-v3',status:qa.status,title:'Review the repaired printed hoodie continuity',output:qa}])if(!store.listEvents({taskId:10}).some(x=>x.data?.callId===e.callId))store.addEvent({taskId:10,type:'tool_result',tool:e.tool,title:e.title,data:{callId:e.callId,status:e.status,output:e.output}});
  const previousRender=store.getRender(26);
  if(previousRender)store.updateRender(26,{plan:{...previousRender.plan,supersededByRenderId:state.renderId}});
  ready=true;
 }else if(brand.sampleVideo){
  brand.sampleVideo.title='Previous attempt: opening print is missing';
  brand.sampleVideo.visualQA={status:'needs_revision',findings:['Opening shots are blank, while later shots have printed chest artwork. The repair must make the print consistent from the first frame.'],humanApproval:false,outreachReady:false};
 }
 const task=store.getTask(10);store.updateTask(10,{summary:ready?'Repaired printed hoodie opening attached. Review the actual video before any CTA or email send.':['failed','nsfw','canceled'].includes(state.status)?`Opening repair failed: ${state.error}. No automatic retry.`:'Repairing the opening to match the existing printed hoodie. CTA remains separate. Email unsent.',plan:{...task.plan,clientDemo:{...task.plan.clientDemo,stage:ready?'final_human_review':['failed','nsfw','canceled'].includes(state.status)?'generation_failed':'rendering',packet:brand,sendingAuthorized:false}}});
 packet.preparedAt=new Date().toISOString();writeFileSync(packetFile,JSON.stringify(packet,null,2)+'\n');console.log(JSON.stringify({status:state.status,renderId:state.renderId,readyForReview:ready,sends:0}));
}finally{store.db.close();}
