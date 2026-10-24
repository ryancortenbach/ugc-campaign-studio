// Attach actual provider and local finishing receipts to the existing demo tasks.
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import path from 'node:path';
import {openStore} from '../agent/store.mjs';

const root=path.resolve(import.meta.dirname,'..');
const pub=path.join(root,'agent/public'),work=path.join(root,'work/streetwear-demo-v1');
const read=file=>JSON.parse(readFileSync(file,'utf8'));
const state=read(path.join(work,'generation-state-v1.json'));
const authorization=read(path.join(root,'research_notes/streetwear-demo-v1/production-authorization-v1.json'));
const packetFile=path.join(pub,'client-demo-data-v2.json'),packet=read(packetFile);
const store=openStore();
try{
 for(const job of state.jobs){
  const brand=packet.brands.find(b=>b.id===job.brandId);if(!brand)throw Error('Generated brand has no demo task.');
  const task=store.getTask(job.taskId);
  brand.genjutsuPreparation.submission={requestId:job.requestId||null,status:job.status,submittedAt:job.submittedAt,completedAt:job.completedAt||null,estimatedUsd:job.estimatedUsd,actualItemizedUsd:null,error:job.error||null};
  brand.genjutsuPreparation.limitations=brand.genjutsuPreparation.limitations.filter(s=>!s.startsWith('Preparation only;'));
  brand.history=brand.history.filter(e=>!['genjutsu-render','sample-assembly','motion-qa'].includes(e.id));
  const gate=brand.history.find(e=>e.id==='production-approval');
  if(gate)Object.assign(gate,{title:'User authorized the bounded sample generation',status:'complete',input:{maxTotalUsd:3,retryCap:0},output:{approved:true,generationOnly:true,sendingAuthorized:false},note:'User requested generation after reviewing the displayed hoodie concepts and the quoted ceiling. This does not record approval of the finished media.'});
  brand.history.push({id:'genjutsu-render',stage:4,tool:'higgsfield.genjutsu-light',title:`${brand.name}: actual hoodie video render`,mode:'recorded',kind:'tool',status:job.status,startedAt:job.submittedAt,completedAt:job.completedAt,input:{model:state.model,resolution:'720p',sourceSeconds:6,inputSha256:authorization.inputSha256[brand.id]},output:{requestId:job.requestId,renderId:job.renderId,estimatedUsd:job.estimatedUsd,actualItemizedUsd:null,rawVideoSha256:job.outputSha256||null,error:job.error||null},evidence:[],note:'Actual provider receipt. Final human review and email sending remain separate.'});
  const sampleFile=path.join(pub,`streetwear-demo-assets/${brand.id}-sample-v1.mp4`);
  const receiptFile=path.join(work,'postprocess-v1',`${brand.id}-postprocess-receipt-v1.json`);
  if(existsSync(sampleFile)&&existsSync(receiptFile)){
   const receiptBundle=read(receiptFile),receipt=receiptBundle.results.find(r=>r.brand===brand.id);
   const qaFile=path.join(work,`${brand.id}-visual-qa-v1.json`),visualQA=existsSync(qaFile)?read(qaFile):{status:'pending',humanApproval:false,outreachReady:false};
   if(!receipt||receipt.status!=='local_media_checks_passed_human_review_pending')throw Error('Local media verification is missing.');
   brand.sampleVideo={url:`/streetwear-demo-assets/${brand.id}-sample-v1.mp4`,title:`${brand.name}: generated hoodie sample`,requestId:job.requestId,status:'ready_for_human_review',durationSeconds:receipt.final_metadata.duration,cta:brand.cta,verification:receipt,visualQA};
   const reviewName=`${brand.id}-garment-review-v2.mp4`,reviewFile=path.join(pub,'streetwear-demo-assets',reviewName);
   if(visualQA.status==='needs_revision'&&existsSync(reviewFile)){
    brand.sampleVideo.assembledVideoUrl=brand.sampleVideo.url;
    brand.sampleVideo.url=`/streetwear-demo-assets/${reviewName}`;
    brand.sampleVideo.ctaPreviewUrl=`/streetwear-demo-assets/${brand.id}-cta-preview-v1.png`;
    brand.sampleVideo.durationSeconds=6;
    brand.sampleVideo.containsCTA=false;
    brand.sampleVideo.status='needs_revision';
   }
   brand.history.push({id:'sample-assembly',stage:4,tool:'ffmpeg + local CTA assembly',title:'Restore source audio and add the brand website CTA',mode:'recorded',kind:'tool',status:'complete',input:{sourceSeconds:6,endCardSeconds:2,cta:brand.cta},output:{videoUrl:brand.sampleVideo.url,verification:receipt},evidence:[{url:brand.sampleVideo.url,title:'Actual generated and finished sample'}],note:'Generated garment video with local audio/CTA finishing. Human approval is pending.'});
   brand.outboundDemo.message=`Hi ${brand.name} team, I made a short sample using our London game character and your ${brand.id==='vylin'?'Cream Headphones Black Zip Hoodie':'Low Lives Hoodie'}. The two-page brief explains the audience hypothesis, product references and creative plan. The CTA leads to your product page: ${brand.cta.url}. Would this be a useful creative direction to test?`;
   brand.outboundDemo.status='draft';
   for(const event of [
    {tool:'media.finish',callId:`finish:${job.requestId}`,title:'Restore the source audio and attach the brand website CTA',status:'success',input:{sourceSeconds:6,ctaSeconds:2},output:{url:brand.sampleVideo.url,durationSeconds:receipt.final_metadata.duration,rawFramesUnchanged:true,audioLagSamples:receipt.audio.peak_lag_samples}},
    {tool:'media.visual_review',callId:`visual-review:${job.requestId}`,title:'Review the generated garment continuity',status:visualQA.status,input:{url:brand.sampleVideo.url},output:visualQA}
   ])if(!store.listEvents({taskId:job.taskId}).some(e=>e.data?.callId===event.callId)){
    store.addEvent({taskId:job.taskId,type:'tool_call',tool:event.tool,title:event.title,data:{callId:event.callId,status:'running',input:event.input}});
    store.addEvent({taskId:job.taskId,type:'tool_result',tool:event.tool,title:event.title,data:{callId:event.callId,status:event.status,output:event.output}});
   }
   brand.history.push({id:'motion-qa',stage:5,tool:'AI visual review + local media verification',title:'Review garment continuity and the website CTA',mode:'recorded',kind:'analysis',status:visualQA.status,input:{sampleUrl:brand.sampleVideo.url},output:visualQA,note:'Human review is pending. The generated garment requires revision before outreach.'});
   const displayFile=path.join(pub,brand.sampleVideo.url.slice(1));
   const target=path.join(root,'agent/.data/renders',path.basename(displayFile));
   writeFileSync(target,readFileSync(displayFile));
   const render=store.getRender(job.renderId);
   store.updateRender(job.renderId,{local_file:path.basename(target),plan:{...render.plan,finalSeconds:brand.sampleVideo.durationSeconds,visualQA},...(render.reviewed_at?{}:{review:'pending'})});
  }
  const currentGaps=brand.gaps.filter(s=>!s.startsWith('Human concept approval, production quote approval'));
  brand.gaps=[...currentGaps,brand.sampleVideo?'Final human review of the generated sample before any email send':job.status==='failed'?`Provider failed: ${job.error||'Unknown error'}. No retry submitted.`:'Actual branded render/finishing and frame review in progress'];
  store.updateTask(task.id,{status:'ready',summary:brand.sampleVideo?.visualQA?.status==='needs_revision'?'Hoodie artwork is inconsistent. Revision required. Garment footage and CTA preview are separate; email unsent.':brand.sampleVideo?'Generated hoodie sample, two-page brief and website CTA attached. Final review pending; email unsent.':job.status==='failed'?`Hoodie generation failed: ${job.error}. No retry. Email unsent.`:'Authorized hoodie video generation in progress. Email remains unsent.',plan:{...task.plan,clientDemo:{...task.plan.clientDemo,productionAuthorized:true,productionApproval:authorization,stage:brand.sampleVideo?.visualQA?.status==='needs_revision'?'revision_required':brand.sampleVideo?'final_human_review':job.status==='failed'?'generation_failed':'rendering',sendingAuthorized:false,packet:brand}}});
 }
 packet.preparedAt=new Date().toISOString();
 writeFileSync(packetFile,JSON.stringify(packet,null,2)+'\n');
 console.log(JSON.stringify({attached:packet.brands.filter(b=>b.sampleVideo).map(b=>b.id),providerJobs:state.jobs.map(j=>({brand:j.brandId,status:j.status})),sends:0}));
}finally{store.db.close();}
