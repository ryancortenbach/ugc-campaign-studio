import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtempSync,mkdirSync,writeFileSync,existsSync,rmSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {openStore} from './store.mjs';
import {createApp} from './server.mjs';
import {createWhopWatch} from './whopwatch.mjs';
import {createDelivery,deliveryEmail,findFfmpeg,stitch,wrapCaption,LINK_DAYS} from './delivery.mjs';

const ENV={SUPABASE_URL:'https://proj.supabase.co/',SUPABASE_SECRET_KEY:'sb_secret_test'};

// One paid order with a two-shot storyboard whose shots have finished rendering into files under renderDir.
function fixture({email='buyer@brand.example'}={}){
 const store=openStore(':memory:'),renderDir=mkdtempSync(path.join(tmpdir(),'mint-delivery-'));
 createWhopWatch({store,whop:{whopEnabled:()=>false}});
 const task=store.createTask('Whop order: UGC Starter from Brand');
 const board=store.createStoryboard({title:'Brand UGC video',brief:{},plan:{shots:[{id:'s1',dialogue:'I wear this every single day now'},{id:'s2',dialogue:'Link in bio'}]}});
 const shot=(n,{status='completed',review='pending',file=true}={})=>{
  const r=store.createRender({title:`Shot ${n}`,endpoint:'text-to-video',input:{prompt:`shot ${n}`},group:'Brand UGC video v1',shotId:`s${n}`});
  const local=file?`render-${r.id}.mp4`:null;if(local)writeFileSync(path.join(renderDir,local),`clip ${r.id}`);
  return store.updateRender(r.id,{status,local_file:local,review});
 };
 const renders=[shot(1),shot(2)];
 const at=new Date().toISOString();
 store.db.prepare('insert into whop_orders(payment_id,product,buyer_email,buyer_name,brand_domain,task_id,storyboard_id,render_ids,state,created_at,updated_at) values(?,?,?,?,?,?,?,?,?,?,?)')
  .run('pay_1','UGC Starter',email,'Dana Buyer','brand.example',task.id,board.id,JSON.stringify(renders.map(r=>r.id)),'ready',at,at);
 const stitched=[];
 const fakeStitch=async({clips,captions,out})=>{stitched.push({clips,captions});mkdirSync(path.dirname(out),{recursive:true});writeFileSync(out,`final ${stitched.length}`);return {captions:true};};
 const done=()=>rmSync(renderDir,{recursive:true,force:true});
 return {store,renderDir,task,renders,shot,stitched,fakeStitch,done};
}

function fakeSupabase({bucketExists=true}={}){
 const calls=[];
 const fetch=async(url,opts)=>{
  calls.push({url,method:opts.method,headers:opts.headers,body:opts.body});
  if(url.endsWith('/storage/v1/bucket'))return bucketExists?new Response(JSON.stringify({statusCode:'409',error:'Duplicate',message:'The resource already exists'}),{status:400}):Response.json({name:'deliveries'});
  if(url.includes('/object/sign/'))return Response.json({signedURL:`/object/sign/deliveries/${url.split('/object/sign/deliveries/')[1]}?token=abc`});
  if(url.includes('/object/deliveries/'))return Response.json({Key:'deliveries/x'});
  return new Response('not found',{status:404});
 };
 return {fetch,calls};
}
function fakeGmail(){
 const drafts=[];
 return {drafts,gmailEnabled:()=>true,
  createDraft:async d=>{drafts.push({...d,action:'create'});return {draftId:'draft1',url:'https://mail.google.com/mail/#drafts?compose=draft1'};},
  updateDraft:async d=>{drafts.push({...d,action:'update'});return {draftId:d.draftId,url:'https://mail.google.com/mail/#drafts?compose=draft1'};},
  sendDraft:async()=>{throw Error('delivery must never send');}};
}

test('captions wrap into at most four short lines',()=>{
 assert.deepEqual(wrapCaption('I wear this every single day now and honestly it never stretches out'),['I wear this every single','day now and honestly it','never stretches out']);
 assert.deepEqual(wrapCaption(''),[]);
 assert.equal(wrapCaption('word '.repeat(60)).length,4);
});

test('the final video uses the newest finished version of each shot that review did not reject',async()=>{
 const f=fixture();
 try{
  const delivery=createDelivery({store:f.store,env:ENV,renderDir:f.renderDir,stitch:f.fakeStitch,ffmpeg:()=>'ffmpeg',gmail:fakeGmail()});
  const [one,two]=f.renders;
  // A rejected revision of shot 1 and an approved revision of shot 2: shot 1 keeps its original, shot 2 uses the revision.
  f.shot(1,{review:'rejected'});const approved=f.shot(2,{review:'approved'});f.shot(2,{status:'in_progress',file:false});
  const out=await delivery.finish('pay_1');
  assert.deepEqual(f.stitched[0].clips,[path.join(f.renderDir,one.local_file),path.join(f.renderDir,approved.local_file)]);
  assert.deepEqual(f.stitched[0].captions,['I wear this every single day now','Link in bio']);
  assert.equal(out.ready,true);assert.equal(out.final.stale,false);assert.match(out.final.url,/^\/renders\/finals\/pay_1\.mp4\?v=/);
  assert.ok(existsSync(path.join(f.renderDir,'finals','pay_1.mp4')));
  assert.equal(two.id<approved.id,true);
  assert.ok(f.store.listEvents({taskId:f.task.id}).some(e=>/Final video made from 2 shots/.test(e.title)));
  // A newer finished take of shot 1 makes the saved video stale until it is remade.
  f.shot(1,{review:'approved'});
  assert.equal(delivery.get('pay_1').final.stale,true);
  await delivery.finish('pay_1');
  assert.equal(delivery.get('pay_1').final.stale,false);
 }finally{f.done();}
});

test('an order with unfinished shots cannot be joined yet',async()=>{
 const f=fixture();
 try{
  f.store.updateRender(f.renders[1].id,{status:'in_progress',local_file:null});
  const delivery=createDelivery({store:f.store,env:ENV,renderDir:f.renderDir,stitch:f.fakeStitch,ffmpeg:()=>'ffmpeg'});
  const state=delivery.get('pay_1');
  assert.equal(state.ready,false);assert.deepEqual(state.shots.map(s=>s.status),['finished','in_progress']);
  await assert.rejects(delivery.finish('pay_1'),e=>e.status===409&&/1 of 2 shots are not finished: Shot 2/.test(e.message));
  assert.equal(f.stitched.length,0);
  await assert.rejects(delivery.finish('pay_missing'),e=>e.status===404);
 }finally{f.done();}
});

test('delivery uploads to a private bucket, signs a 30 day link and only drafts the email',async()=>{
 const f=fixture(),sb=fakeSupabase(),gmail=fakeGmail();
 try{
  const now=()=>new Date('2026-10-24T20:00:00Z');
  const delivery=createDelivery({store:f.store,env:ENV,renderDir:f.renderDir,stitch:f.fakeStitch,ffmpeg:()=>'ffmpeg',fetch:sb.fetch,gmail,now,sender:()=>'Mint Labs'});
  await assert.rejects(delivery.deliver('pay_1'),e=>e.status===409&&/Make the final video first/.test(e.message));
  await delivery.finish('pay_1');
  const out=await delivery.deliver('pay_1');
  const [bucket,upload,sign]=sb.calls;
  assert.deepEqual(JSON.parse(bucket.body),{id:'deliveries',name:'deliveries',public:false});
  assert.match(upload.url,/^https:\/\/proj\.supabase\.co\/storage\/v1\/object\/deliveries\/pay_1\/brand\.example-v1\.mp4$/);
  assert.equal(upload.headers['Content-Type'],'video/mp4');assert.equal(upload.headers['x-upsert'],'true');
  assert.equal(upload.headers.apikey,'sb_secret_test');assert.equal(upload.headers.Authorization,undefined,'new secret keys are not Bearer tokens');
  assert.equal(JSON.parse(sign.body).expiresIn,LINK_DAYS*86400);
  assert.match(out.delivery.link,/^https:\/\/proj\.supabase\.co\/storage\/v1\/object\/sign\/deliveries\/pay_1\/.+\?token=abc$/);
  assert.equal(out.delivery.expiresAt,'2026-11-23T20:00:00.000Z');
  assert.equal(gmail.drafts.length,1);assert.equal(gmail.drafts[0].to,'buyer@brand.example');
  assert.ok(gmail.drafts[0].body.includes(out.delivery.link));assert.match(gmail.drafts[0].body,/^Hi Dana,/);
  assert.doesNotMatch(gmail.drafts[0].body+gmail.drafts[0].subject,/[–—]/,'no em or en dashes');
  assert.equal(out.delivery.draftUrl,'https://mail.google.com/mail/#drafts?compose=draft1');assert.equal(out.delivery.stale,false);
  // Remaking the video marks the old link stale, and delivering again rewrites the same Gmail draft.
  await delivery.finish('pay_1');
  assert.equal(delivery.get('pay_1').delivery.stale,true);
  await delivery.deliver('pay_1');
  assert.match(sb.calls.at(-2).url,/\/pay_1\/brand\.example-v2\.mp4$/,'a remade video gets its own file and link');
  assert.deepEqual(gmail.drafts.map(d=>d.action),['create','update']);
  assert.equal(delivery.get('pay_1').delivery.stale,false);
 }finally{f.done();}
});

test('legacy service role keys are also sent as the Bearer token, and missing setup is explained',async()=>{
 const f=fixture(),sb=fakeSupabase({bucketExists:false});
 try{
  const delivery=createDelivery({store:f.store,env:{SUPABASE_PANEL_URL:'https://panel.supabase.co',SUPABASE_PANEL_SERVICE_KEY:'eyJlegacy'},renderDir:f.renderDir,stitch:f.fakeStitch,ffmpeg:()=>'ffmpeg',fetch:sb.fetch,gmail:{gmailEnabled:()=>false}});
  await delivery.finish('pay_1');
  const out=await delivery.deliver('pay_1');
  assert.equal(sb.calls[1].headers.Authorization,'Bearer eyJlegacy');assert.match(sb.calls[1].url,/^https:\/\/panel\.supabase\.co\//);
  assert.equal(out.delivery.draftUrl,null);assert.match(out.delivery.email.body,/watch and download it here/);
  const unset=createDelivery({store:f.store,env:{},renderDir:f.renderDir,stitch:f.fakeStitch,ffmpeg:()=>null});
  assert.deepEqual(unset.get('pay_1').setup,{ffmpeg:false,storage:false,gmail:false});
  await assert.rejects(unset.deliver('pay_1'),e=>e.status===503&&/SUPABASE_SECRET_KEY/.test(e.message));
 }finally{f.done();}
 const g=fixture({email:null});
 try{
  const delivery=createDelivery({store:g.store,env:ENV,renderDir:g.renderDir,stitch:g.fakeStitch,ffmpeg:()=>'ffmpeg'});
  await delivery.finish('pay_1');
  await assert.rejects(delivery.deliver('pay_1'),e=>e.status===409&&/no buyer email/.test(e.message));
 }finally{g.done();}
});

test('the delivery email follows the sender writing rules',()=>{
 const {subject,body}=deliveryEmail({buyerName:'',brand:'brand.example',link:'https://x.example/v.mp4',expiresAt:'2026-11-23T20:00:00Z'});
 assert.equal(subject,'Your brand.example video from Mint Labs');
 assert.match(body,/^Hi there,/);assert.match(body,/works until November 23, 2026/);
 assert.ok(body.split(/\s+/).length<120);assert.ok((body.match(/!/g)||[]).length<=1);assert.doesNotMatch(body,/really/i);
});

test('routes run the delivery steps, and the no-spend pause still allows them',async()=>{
 const f=fixture(),sb=fakeSupabase(),gmail=fakeGmail();
 const delivery=createDelivery({store:f.store,env:ENV,renderDir:f.renderDir,stitch:f.fakeStitch,ffmpeg:()=>'ffmpeg',fetch:sb.fetch,gmail});
 const app=createApp({store:f.store,delivery,gmailApi:gmail});
 f.store.db.prepare("insert into settings(key,value) values('spendingPaused','true') on conflict(key) do update set value='true'").run();
 const server=http.createServer(app);await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base=`http://127.0.0.1:${server.address().port}/api/whop/orders/pay_1`;
 try{
  const before=await (await fetch(`${base}/delivery`)).json();
  assert.equal(before.ready,true);assert.equal(before.final,null);
  const made=await fetch(`${base}/final`,{method:'POST',body:'{}'});
  assert.equal(made.status,200);assert.ok((await made.json()).final);
  const sent=await fetch(`${base}/deliver`,{method:'POST',body:'{}'});
  assert.equal(sent.status,200);assert.match((await sent.json()).delivery.link,/token=abc/);
  assert.equal((await fetch(`${base.replace('pay_1','nope')}/delivery`)).status,404);
  assert.equal(f.store.spendSummary().total,0);
 }finally{await new Promise(r=>server.close(r));f.store.db.close();f.done();}
});

const ffmpeg=findFfmpeg();
test('real ffmpeg joins mismatched clips into one 720x1280 video',{skip:!ffmpeg&&'ffmpeg is not installed'},async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'mint-stitch-test-'));
 try{
  const clip=(name,size,audio)=>{const out=path.join(dir,name);
   const r=spawnSync(ffmpeg,['-hide_banner','-loglevel','error','-y','-f','lavfi','-i',`testsrc2=size=${size}:rate=24:duration=1`,...(audio?['-f','lavfi','-i','sine=frequency=440:duration=1']:[]),'-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p',...(audio?['-c:a','aac','-shortest']:[]),out]);
   assert.equal(r.status,0,String(r.stderr));return out;};
  const out=path.join(dir,'finals','order.mp4');
  await stitch({clips:[clip('a.mp4','720x1280',true),clip('b.mp4','1080x1920',false)],captions:['Shot one caption that wraps onto two lines','Two'],out,ffmpeg});
  const probe=spawnSync(ffmpeg,['-hide_banner','-i',out],{encoding:'utf8'}).stderr;
  assert.match(probe,/Video: h264.*720x1280/);assert.match(probe,/Audio: aac/);
  const [,h,m,s]=probe.match(/Duration: (\d+):(\d+):([\d.]+)/);
  assert.ok(Math.abs(Number(h)*3600+Number(m)*60+Number(s)-2)<0.3,`duration ${s}`);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
