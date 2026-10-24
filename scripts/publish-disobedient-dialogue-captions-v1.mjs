// Publish the user's spoken-subtitle correction. Preserve earlier versions and actual approvals.
import{readFileSync,writeFileSync,existsSync}from'node:fs';import{createHash}from'node:crypto';import path from'node:path';import{openStore}from'../agent/store.mjs';
const root=path.resolve(import.meta.dirname,'..'),read=p=>JSON.parse(readFileSync(p,'utf8')),w=path.join(root,'work/disobedient-dialogue-captions-v1'),r=read(path.join(w,'receipt-v1.json'));
const sha=p=>createHash('sha256').update(readFileSync(p)).digest('hex'),file=path.join(root,'agent/public/client-demo-data-v2.json'),packet=read(file),brand=packet.brands.find(b=>b.id==='disobedient'),store=openStore();
for(const [url,hash]of[[r.sampleUrl,r.sampleSha256],[r.url,r.finalSha256]])if(sha(path.join(root,'agent/public',url))!==hash)throw Error('Captioned media hash changed.');
try{
 const qa={...brand.demoFinalVideo.visualQA,artifactSha256:r.finalSha256,findings:brand.demoFinalVideo.visualQA.findings.filter(x=>!x.includes('timed product advertising copy')),captionReview:'Opening captions match the saved spoken-word transcript and original caption timings. The unchanged sample speech aligns with the original full speech within 5 milliseconds. Later subtitles remain unchanged.',textIsDialogueTranscription:true,humanApproval:false};
 qa.findings.push('The opening now uses the spoken subtitles. Advertising text overlays were removed.');
 const previous=brand.demoFinalVideo;let render=store.listRenders().find(x=>x.plan?.assemblyId==='disobedient-full-ad-30s-v2');
 if(!render)render=store.createRender({title:'Disobedient: 30-second PS2 ad with spoken subtitles',endpoint:'local/assembly',input:{sourceRequests:r.providerRequests,captionSource:r.captionSource},group:'Disobedient 30-second ad',plan:{taskId:10,brandId:'disobedient',assemblyId:'disobedient-full-ad-30s-v2',finalSeconds:30,visualQA:qa,verification:r}});
 for(const [url,hash]of[[r.sampleUrl,r.sampleSha256],[r.url,r.finalSha256]]){const to=path.join(root,'agent/.data/renders',path.basename(url));if(existsSync(to)&&sha(to)!==hash)throw Error('Existing render file differs.');if(!existsSync(to))writeFileSync(to,readFileSync(path.join(root,'agent/public',url)));}
 store.updateRender(render.id,{status:'completed',local_file:path.basename(r.url),review:render.review||'pending'});
 if(previous.renderId&&previous.renderId!==render.id){const old=store.getRender(previous.renderId);store.updateRender(old.id,{plan:{...old.plan,supersededByRenderId:render.id}});}
 if(!brand.archivedSampleVideos?.some(x=>x.url===brand.sampleVideo.url))brand.archivedSampleVideos=[...(brand.archivedSampleVideos||[]),brand.sampleVideo];
 brand.sampleVideo={...brand.sampleVideo,url:r.sampleUrl,title:'Disobedient PS2 character sample with spoken subtitles',status:'ready_for_human_review',verification:{...brand.sampleVideo.verification,captionReceipt:r},visualQA:{...brand.sampleVideo.visualQA,textIsDialogueTranscription:true},containsCTA:false};
 brand.demoSampleVideo={...brand.sampleVideo,durationSeconds:6};
 brand.demoFinalVideo={...previous,url:r.url,renderId:render.id,title:'Disobedient: full 30-second PS2 ad with spoken subtitles',verification:r,visualQA:qa};
 const opening=store.getRender(28);store.updateRender(28,{local_file:path.basename(r.sampleUrl),review:'pending',plan:{...opening.plan,captionReceipt:r,textIsDialogueTranscription:true}});
 const task=store.getTask(10);store.updateTask(10,{summary:'PS2 character sample and complete 30-second ad now use the actual spoken subtitles. Human delivery approval remains pending.',plan:{...task.plan,clientDemo:{...task.plan.clientDemo,packet:brand}}});
 if(!store.listEvents({taskId:10}).some(e=>e.data?.callId==='dialogue-captions-v1'))store.addEvent({taskId:10,type:'tool_result',tool:'media.captions',title:'Match subtitles to the character speech in the sample and full PS2 ad',data:{callId:'dialogue-captions-v1',status:'success',output:r,costUsd:0}});
 writeFileSync(file,JSON.stringify(packet,null,2)+'\n');console.log(JSON.stringify({sample:r.sampleUrl,final:r.url,renderId:render.id,sends:0}));
}finally{store.db.close();}
