// Attach the verified full ad without changing production approval or sending anything.
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {openStore} from '../agent/store.mjs';
const root=path.resolve(import.meta.dirname,'..'),work=path.join(root,'work/disobedient-full-ad-v1');
const read=file=>JSON.parse(readFileSync(file,'utf8'));
const receipt=read(path.join(work,'final-receipt-v1.json')),qa=read(path.join(work,'visual-qa-v1.json'));
const source=path.join(root,'agent/public',receipt.url),sha=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
if(!existsSync(source)||sha(source)!==receipt.finalSha256||receipt.durationSeconds!==30||receipt.frames!==900||!receipt.allJoinedFrameHashesVerified||qa.status!=='checks_passed')throw Error('The complete ad must pass media and visual review before publishing.');
const packetFile=path.join(root,'agent/public/client-demo-data-v2.json'),packet=read(packetFile),brand=packet.brands.find(b=>b.id==='disobedient');
const store=openStore();
try{
 const filename=path.basename(source),target=path.join(root,'agent/.data/renders',filename);
 if(existsSync(target)&&sha(target)!==receipt.finalSha256)throw Error('A different local render file already exists.');
 if(!existsSync(target))writeFileSync(target,readFileSync(source));
 let render=store.listRenders().find(r=>r.plan?.assemblyId==='disobedient-full-ad-30s-v1');
 if(!render)render=store.createRender({title:'Disobedient: complete 30-second character ad',endpoint:'local/assembly',input:{sourceRequests:receipt.providerRequests,openingRequestId:brand.sampleVideo.requestId,ctaDestination:receipt.ctaDestination},group:'Disobedient 30-second ad',plan:{taskId:10,brandId:'disobedient',assemblyId:'disobedient-full-ad-30s-v1',finalSeconds:30,providerRequests:receipt.providerRequests,visualQA:qa,verification:receipt}});
 store.updateRender(render.id,{status:'completed',local_file:filename,review:render.review||'pending'});
 const state=read(path.join(work,'generation-state-v1.json'));
 for(const job of state.jobs){const part=store.getRender(job.renderId);store.updateRender(part.id,{plan:{...part.plan,supersededByRenderId:render.id}});}
 brand.demoFinalVideo={url:receipt.url,title:'Disobedient: full 30-second character ad',durationSeconds:30,renderId:render.id,status:'ready_for_human_review',verification:receipt,visualQA:qa,containsCTA:true,cta:{url:receipt.ctaDestination,displayWebsite:receipt.ctaDisplayWebsite}};
 brand.history=brand.history.filter(e=>e.id!=='full-ad-assembly-v1');
 brand.history.push({id:'full-ad-assembly-v1',stage:5,tool:'local video assembly',title:'Complete the 30-second character ad with the official hoodie and website CTA',mode:'recorded',kind:'tool',status:'complete',input:{providerRequests:receipt.providerRequests,reusedOpeningRequestId:brand.sampleVideo.requestId},output:receipt,note:'Generated garment edit reviewed at sampled frames. Original dialogue retained. Human delivery approval remains pending.'});
 const task=store.getTask(10);store.updateTask(10,{summary:'Corrected sample and complete 30-second character ad attached. Human delivery approval is pending. Email remains unsent.',plan:{...task.plan,clientDemo:{...task.plan.clientDemo,stage:'final_human_review',packet:brand,sendingAuthorized:false}}});
 if(!store.listEvents({taskId:10}).some(e=>e.data?.callId==='full-ad-assembly-v1'))store.addEvent({taskId:10,type:'tool_result',tool:'media.finish',title:'Complete 30-second Disobedient character ad with product and website CTA',data:{callId:'full-ad-assembly-v1',status:'success',output:{...receipt,renderId:render.id},costUsd:0}});
 // Preserve packet.preparedAt so unrelated research and image review versions stay valid.
 writeFileSync(packetFile,JSON.stringify(packet,null,2)+'\n');
 console.log(JSON.stringify({renderId:render.id,url:receipt.url,durationSeconds:30,humanApproval:false,sends:0}));
}finally{store.db.close();}
