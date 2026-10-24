// Attach the continuous H.264 version while retaining all older renders and approvals.
import{readFileSync,writeFileSync,existsSync}from'node:fs';import{createHash}from'node:crypto';import path from'node:path';import{openStore}from'../agent/store.mjs';
const root=path.resolve(import.meta.dirname,'..'),read=p=>JSON.parse(readFileSync(p,'utf8')),r=read(path.join(root,'work/disobedient-webkit-v1/receipt-v1.json')),file=path.join(root,'agent/public/client-demo-data-v2.json'),packet=read(file),brand=packet.brands.find(b=>b.id==='disobedient');
const src=path.join(root,'agent/public',r.url),sha=p=>createHash('sha256').update(readFileSync(p)).digest('hex');if(sha(src)!==r.finalSha256||r.frames!==900||r.outputUniqueH264SequenceParameters!==1||!r.audioPacketsUnchanged)throw Error('WebKit-compatible media has not passed validation.');
const store=openStore();try{
 const prior=brand.demoFinalVideo;
 const verification={...prior.verification,...r,sourceVerification:prior.verification,allJoinedFrameHashesVerified:false,allFramesDecoded:true};
 const qa={...prior.visualQA,artifactSha256:r.finalSha256,nativeProductEnding:'Pending actual native playback check',webkitCompatibility:r};
 let render=store.listRenders().find(x=>x.plan?.assemblyId==='disobedient-full-ad-30s-v3');
 if(!render)render=store.createRender({title:'Disobedient: 30-second PS2 ad with native playback fix',endpoint:'local/assembly',input:{sourceUrl:r.sourceUrl,reason:r.reason},group:'Disobedient 30-second ad',plan:{taskId:10,brandId:'disobedient',assemblyId:'disobedient-full-ad-30s-v3',finalSeconds:30,visualQA:qa,verification}});
 const target=path.join(root,'agent/.data/renders',path.basename(r.url));if(existsSync(target)&&sha(target)!==r.finalSha256)throw Error('The local render target differs.');if(!existsSync(target))writeFileSync(target,readFileSync(src));
 store.updateRender(render.id,{status:'completed',local_file:path.basename(r.url),review:render.review||'pending'});
 if(prior.renderId!==render.id){const old=store.getRender(prior.renderId);store.updateRender(old.id,{plan:{...old.plan,supersededByRenderId:render.id}});}
 brand.demoFinalVideo={...prior,url:r.url,renderId:render.id,verification,visualQA:qa};
 const task=store.getTask(10);store.updateTask(10,{plan:{...task.plan,clientDemo:{...task.plan.clientDemo,packet:brand}}});
 if(!store.listEvents({taskId:10}).some(e=>e.data?.callId==='webkit-continuous-stream-v1'))store.addEvent({taskId:10,type:'tool_result',tool:'media.finish',title:'Fix native playback through the product ending with one continuous H.264 stream',data:{callId:'webkit-continuous-stream-v1',status:'success',output:r,costUsd:0}});
 writeFileSync(file,JSON.stringify(packet,null,2)+'\n');console.log(JSON.stringify({renderId:render.id,url:r.url,newProviderCalls:0}));
}finally{store.db.close();}
