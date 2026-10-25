import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,rmSync} from 'node:fs';
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
  const r=store.createRender({title:`Shot ${n}`,endpoint:'text-to-video',input:{prompt:`shot ${n}`},group:'Brand UGC video v1',shotId:`s${n}`,storyboardId:board.id});
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
  assert.equal(out.ready,true);assert.equal(out.final.stale,false);assert.match(out.final.url,/^\/renders\/finals\/pay_1-[a-f0-9-]+\.mp4\?v=/);
  assert.ok(existsSync(path.join(f.renderDir,out.final.url.split('?')[0].slice('/renders/'.length))));
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
  // Gmail is stubbed off here too, so a real Gmail token on the machine running the tests cannot flip the setup report.
  const unset=createDelivery({store:f.store,env:{},renderDir:f.renderDir,stitch:f.fakeStitch,ffmpeg:()=>null,gmail:{gmailEnabled:()=>false}});
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
test('real ffmpeg joins mismatched clips into one 720x1280 video as long as their pictures',{skip:!ffmpeg&&'ffmpeg is not installed'},async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'mint-stitch-test-'));
 try{
  // One second of picture each: matching audio, no audio, and audio that runs on past the picture.
  const clip=(name,size,audioSeconds)=>{const out=path.join(dir,name);
   const r=spawnSync(ffmpeg,['-hide_banner','-loglevel','error','-y','-f','lavfi','-i',`testsrc2=size=${size}:rate=24:duration=1`,...(audioSeconds?['-f','lavfi','-i',`sine=frequency=440:duration=${audioSeconds}`]:[]),'-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p',...(audioSeconds?['-c:a','aac']:[]),out]);
   assert.equal(r.status,0,String(r.stderr));return out;};
  const out=path.join(dir,'finals','order.mp4');
  await stitch({clips:[clip('a.mp4','720x1280',1),clip('b.mp4','1080x1920',0),clip('c.mp4','720x1280',1.6)],captions:['Shot one caption that wraps onto two lines','Two','Three'],out,ffmpeg});
  const probe=spawnSync(ffmpeg,['-hide_banner','-i',out],{encoding:'utf8'}).stderr;
  assert.match(probe,/Video: h264.*720x1280/);assert.match(probe,/Audio: aac/);
  const [,h,m,s]=probe.match(/Duration: (\d+):(\d+):([\d.]+)/);
  // Audio that outlasts a shot would leave a frozen frame before the next one and stretch the final video.
  assert.ok(Math.abs(Number(h)*3600+Number(m)*60+Number(s)-3)<0.15,`duration ${s}`);
 }finally{rmSync(dir,{recursive:true,force:true});}
});


test('changed source renders mark both final and existing delivery stale and block a new upload',async()=>{
 const f=fixture(),sb=fakeSupabase(),gmail=fakeGmail();
 try{const d=createDelivery({store:f.store,env:ENV,renderDir:f.renderDir,stitch:f.fakeStitch,ffmpeg:()=>'ffmpeg',fetch:sb.fetch,gmail});await d.finish('pay_1');await d.deliver('pay_1');const before=sb.calls.length;f.shot(1,{review:'approved'});assert.equal(d.get('pay_1').final.stale,true);assert.equal(d.get('pay_1').delivery.stale,true);await assert.rejects(d.deliver('pay_1'),e=>e.status===409&&/stale/.test(e.message));assert.equal(sb.calls.length,before);assert.equal(gmail.drafts.length,1);}finally{f.done();}
});

test('a render change during upload blocks draft preparation',async()=>{
 const f=fixture(),sb=fakeSupabase(),gmail=fakeGmail();let entered,release;const seen=new Promise(r=>entered=r),hold=new Promise(r=>release=r);
 try{const fetch=async(url,opts)=>{const result=await sb.fetch(url,opts);if(url.includes('/object/deliveries/')){entered();await hold;}return result;};const d=createDelivery({store:f.store,env:ENV,renderDir:f.renderDir,stitch:f.fakeStitch,ffmpeg:()=>'ffmpeg',fetch,gmail});await d.finish('pay_1');const pending=d.deliver('pay_1');await seen;f.shot(1,{review:'approved'});release();await assert.rejects(pending,e=>e.status===409);assert.equal(gmail.drafts.length,0);assert.equal(d.get('pay_1').delivery,null);}finally{release?.();f.done();}
});

test('finishing blocks concurrent delivery and immutable final files preserve earlier bytes',async()=>{
 const f=fixture(),sb=fakeSupabase();let entered,release,count=0;const seen=new Promise(r=>entered=r),hold=new Promise(r=>release=r);
 try{const join=async args=>{if(++count===2){entered();await hold;}return f.fakeStitch(args);};const d=createDelivery({store:f.store,env:ENV,renderDir:f.renderDir,stitch:join,ffmpeg:()=>'ffmpeg',fetch:sb.fetch,gmail:fakeGmail()});const first=await d.finish('pay_1'),old=path.join(f.renderDir,first.final.url.split('?')[0].slice('/renders/'.length));const pending=d.finish('pay_1');await seen;try{await assert.rejects(d.deliver('pay_1'),e=>e.status===409&&/running/.test(e.message));}finally{release();await pending;}assert.equal(sb.calls.length,0);assert.notEqual(d.get('pay_1').final.url,first.final.url);assert.equal(readFileSync(old,'utf8'),'final 1');}finally{release?.();f.done();}
});

test('uncertain Gmail update does not fall back to creating a duplicate draft',async()=>{
 const f=fixture(),sb=fakeSupabase(),gmail=fakeGmail();
 try{const d=createDelivery({store:f.store,env:ENV,renderDir:f.renderDir,stitch:f.fakeStitch,ffmpeg:()=>'ffmpeg',fetch:sb.fetch,gmail});await d.finish('pay_1');await d.deliver('pay_1');gmail.updateDraft=async()=>{throw Error('accepted update response was lost');};await assert.rejects(d.deliver('pay_1'),/response was lost/);assert.equal(gmail.drafts.length,1);assert.equal(d.get('pay_1').delivery.draftUrl.includes('draft1'),true);}finally{f.done();}
});

test('confirmed missing Gmail draft can be recreated',async()=>{
 const f=fixture(),sb=fakeSupabase(),gmail=fakeGmail();
 try{const d=createDelivery({store:f.store,env:ENV,renderDir:f.renderDir,stitch:f.fakeStitch,ffmpeg:()=>'ffmpeg',fetch:sb.fetch,gmail});await d.finish('pay_1');await d.deliver('pay_1');gmail.updateDraft=async()=>{throw Object.assign(Error('not found'),{status:404});};await d.deliver('pay_1');assert.equal(gmail.drafts.length,2);}finally{f.done();}
});


test('a Gmail disconnect preserves known draft identity for reuse after reconnection',async()=>{
 const f=fixture(),sb=fakeSupabase(),gmail=fakeGmail();let connected=true;gmail.gmailEnabled=()=>connected;
 try{const d=createDelivery({store:f.store,env:ENV,renderDir:f.renderDir,stitch:f.fakeStitch,ffmpeg:()=>'ffmpeg',fetch:sb.fetch,gmail});await d.finish('pay_1');await d.deliver('pay_1');connected=false;const offline=await d.deliver('pay_1');assert.equal(offline.delivery.draftUrl,null);assert.equal(f.store.db.prepare('select draft_id from deliveries where payment_id=?').get('pay_1').draft_id,'draft1');connected=true;await d.deliver('pay_1');assert.deepEqual(gmail.drafts.map(x=>x.action),['create','update']);assert.equal(gmail.drafts[1].draftId,'draft1');}finally{f.done();}
});

test('accepted create with lost response is recovered after restart without another create',async()=>{
 const f=fixture(),sb=fakeSupabase(),gmail=fakeGmail();let creates=0,savedToken;
 gmail.createDraft=async args=>{creates++;savedToken=args.deliveryToken;throw Error('response lost after acceptance');};gmail.findDeliveryDraft=async args=>{assert.equal(args.token,savedToken);return{draftId:'accepted',url:'https://mail.example.test/accepted'};};
 try{const opts={store:f.store,env:ENV,renderDir:f.renderDir,stitch:f.fakeStitch,ffmpeg:()=>'ffmpeg',fetch:sb.fetch,gmail};let d=createDelivery(opts);await d.finish('pay_1');await assert.rejects(d.deliver('pay_1'),e=>e.status===409);assert.equal(d.get('pay_1').draftRecovery.state,'unknown');d=createDelivery(opts);await d.deliver('pay_1');assert.equal(creates,1);assert.equal(gmail.drafts[0].action,'update');assert.equal(gmail.drafts[0].draftId,'accepted');assert.equal(d.get('pay_1').draftRecovery,null);}finally{f.done();}
});

test('missing recovery result blocks retries before new uploads or draft creation',async()=>{
 const f=fixture(),sb=fakeSupabase(),gmail=fakeGmail();let creates=0;gmail.createDraft=async()=>{creates++;throw Error('unknown result');};gmail.findDeliveryDraft=async()=>null;
 try{const d=createDelivery({store:f.store,env:ENV,renderDir:f.renderDir,stitch:f.fakeStitch,ffmpeg:()=>'ffmpeg',fetch:sb.fetch,gmail});await d.finish('pay_1');await assert.rejects(d.deliver('pay_1'));const calls=sb.calls.length;await assert.rejects(d.deliver('pay_1'),e=>e.status===409);assert.equal(creates,1);assert.equal(sb.calls.length,calls);}finally{f.done();}
});

test('local final-save failure after draft acceptance preserves the known ID for retry',async()=>{
 const f=fixture(),sb=fakeSupabase(),gmail=fakeGmail();
 try{const d=createDelivery({store:f.store,env:ENV,renderDir:f.renderDir,stitch:f.fakeStitch,ffmpeg:()=>'ffmpeg',fetch:sb.fetch,gmail});await d.finish('pay_1');f.store.db.exec("create trigger fail_delivery_save before update on deliveries when new.prepared_at is not null begin select raise(ABORT,'injected save failure');end;");await assert.rejects(d.deliver('pay_1'),/injected save/);f.store.db.exec('drop trigger fail_delivery_save');await d.deliver('pay_1');assert.deepEqual(gmail.drafts.map(x=>x.action),['create','update']);}finally{f.done();}
});

test('unknown intent cannot be reset by a stale token, early confirmation or string truthiness',async()=>{
 const f=fixture(),sb=fakeSupabase(),gmail=fakeGmail();let time=new Date('2026-10-24T20:00:00Z');gmail.createDraft=async()=>{throw Error('unknown');};gmail.findDeliveryDraft=async()=>null;
 try{const d=createDelivery({store:f.store,env:ENV,renderDir:f.renderDir,stitch:f.fakeStitch,ffmpeg:()=>'ffmpeg',fetch:sb.fetch,gmail,now:()=>time});await d.finish('pay_1');await assert.rejects(d.deliver('pay_1'));const token=d.get('pay_1').draftRecovery.intentToken;await assert.rejects(d.reconcileDraft('pay_1',{intentToken:'wrong',confirmNotCreated:true}));await assert.rejects(d.reconcileDraft('pay_1',{intentToken:token,confirmNotCreated:true}));time=new Date('2026-10-24T20:16:00Z');await assert.rejects(d.reconcileDraft('pay_1',{intentToken:token,confirmNotCreated:'false'}));await d.reconcileDraft('pay_1',{intentToken:token,confirmNotCreated:true});assert.equal(d.get('pay_1').draftRecovery,null);}finally{f.done();}
});


test('a delayed second delivery cannot replace a newly known draft intent',async()=>{
 const f=fixture(),sb=fakeSupabase(),gmail=fakeGmail();let entered,release;const seen=new Promise(r=>entered=r),hold=new Promise(r=>release=r);
 try{const base={store:f.store,env:ENV,renderDir:f.renderDir,stitch:f.fakeStitch,ffmpeg:()=>'ffmpeg',gmail};const a=createDelivery({...base,fetch:sb.fetch});await a.finish('pay_1');const b=createDelivery({...base,fetch:async(url,opts)=>{if(url.endsWith('/storage/v1/bucket')){entered();await hold;}return sb.fetch(url,opts);}});const delayed=b.deliver('pay_1');await seen;await a.deliver('pay_1');release();await assert.rejects(delayed,e=>e.status===409);assert.equal(gmail.drafts.filter(x=>x.action==='create').length,1);assert.equal(f.store.db.prepare('select draft_id from delivery_draft_intents where payment_id=?').get('pay_1').draft_id,'draft1');}finally{release?.();f.done();}
});

test('failure to save accepted intent identity is recoverable without creating again',async()=>{
 const f=fixture(),sb=fakeSupabase(),gmail=fakeGmail();let token;const create=gmail.createDraft;gmail.createDraft=async args=>{token=args.deliveryToken;return create(args);};gmail.findDeliveryDraft=async args=>{assert.equal(args.token,token);return{draftId:'draft1',url:'https://mail.example.test/draft1'};};
 try{const d=createDelivery({store:f.store,env:ENV,renderDir:f.renderDir,stitch:f.fakeStitch,ffmpeg:()=>'ffmpeg',fetch:sb.fetch,gmail});await d.finish('pay_1');f.store.db.exec("create trigger fail_intent before update on delivery_draft_intents when new.state='known' begin select raise(ABORT,'intent save failure');end;");await assert.rejects(d.deliver('pay_1'));f.store.db.exec('drop trigger fail_intent');await d.deliver('pay_1');assert.deepEqual(gmail.drafts.map(x=>x.action),['create','update']);}finally{f.done();}
});


test('draft reconciliation route works while paused and never creates or sends a second draft',async()=>{
 const f=fixture(),sb=fakeSupabase(),gmail=fakeGmail();let creates=0;gmail.createDraft=async()=>{creates++;throw Error('response lost');};gmail.findDeliveryDraft=async()=>({draftId:'recovered',url:'https://mail.example.test/recovered'});
 const d=createDelivery({store:f.store,env:ENV,renderDir:f.renderDir,stitch:f.fakeStitch,ffmpeg:()=>'ffmpeg',fetch:sb.fetch,gmail});let server;
 try{await d.finish('pay_1');await assert.rejects(d.deliver('pay_1'));const intentToken=d.get('pay_1').draftRecovery.intentToken;const app=createApp({store:f.store,delivery:d,gmailApi:gmail});f.store.db.prepare("insert into settings(key,value) values('spendingPaused','true') on conflict(key) do update set value='true'").run();server=http.createServer(app);await new Promise(r=>server.listen(0,'127.0.0.1',r));const res=await fetch(`http://127.0.0.1:${server.address().port}/api/whop/orders/pay_1/delivery-draft-reconcile`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({intentToken})});assert.equal(res.status,200);assert.equal((await res.json()).draftRecovery,null);assert.equal(creates,1);assert.equal(f.store.spendSummary().total,0);}finally{if(server)await new Promise(r=>server.close(r));f.done();}
});

test('new final binds its storyboard and changing that storyboard invalidates unchanged render IDs',async()=>{
 const f=fixture(),sb=fakeSupabase(),gmail=fakeGmail();try{const d=createDelivery({store:f.store,env:ENV,renderDir:f.renderDir,stitch:f.fakeStitch,ffmpeg:()=>'ffmpeg',fetch:sb.fetch,gmail});const original=f.store.db.prepare('select storyboard_id from whop_orders where payment_id=?').get('pay_1').storyboard_id;await d.finish('pay_1');assert.equal(d.get('pay_1').final.storyboardId,original);f.store.db.prepare('update whop_orders set storyboard_id=? where payment_id=?').run(original+1000,'pay_1');assert.equal(d.get('pay_1').final.stale,true);await assert.rejects(d.deliver('pay_1'),e=>e.status===409);assert.equal(gmail.drafts.length,0);}finally{f.done();}
});
test('legacy final binding migration preserves prior final bytes and leaves ownership unbound',async()=>{
 const f=fixture();try{const options={store:f.store,env:ENV,renderDir:f.renderDir,stitch:f.fakeStitch,ffmpeg:()=>'ffmpeg'};let d=createDelivery(options);await d.finish('pay_1');const file=f.store.db.prepare('select final_file from deliveries').get().final_file,bytes=readFileSync(path.join(f.renderDir,file));f.store.db.exec('alter table deliveries drop column final_storyboard_id');d=createDelivery(options);assert.equal(d.get('pay_1').final.storyboardId,null);assert.deepEqual(readFileSync(path.join(f.renderDir,file)),bytes);}finally{f.done();}
});

test('remaking from unrelated or legacy unproven clips never binds a different storyboard',async()=>{const f=fixture();try{const opts={store:f.store,env:ENV,renderDir:f.renderDir,stitch:f.fakeStitch,ffmpeg:()=>'ffmpeg'},d=createDelivery(opts);const b=f.store.createStoryboard({title:'Different',brief:{},plan:{shots:[{id:'other-1'},{id:'other-2'}]}});f.store.db.prepare('update whop_orders set storyboard_id=?').run(b.id);await d.finish('pay_1');assert.equal(d.get('pay_1').final.storyboardId,null);assert.equal(d.get('pay_1').final.stale,true);f.store.db.prepare('update renders set storyboard_id=null').run();await d.finish('pay_1');assert.equal(d.get('pay_1').final.storyboardId,null);}finally{f.done();}});

test('in-place storyboard changes invalidate bound finals and cannot rebind old render snapshots',async()=>{const f=fixture();try{const d=createDelivery({store:f.store,env:ENV,renderDir:f.renderDir,stitch:f.fakeStitch,ffmpeg:()=>'ffmpeg'});await d.finish('pay_1');const id=d.get('pay_1').final.storyboardId,b=f.store.getStoryboard(id);f.store.updateStoryboard(id,{plan:{...b.plan,voice:'Changed voice'}});assert.equal(d.get('pay_1').final.stale,true);await d.finish('pay_1');assert.equal(d.get('pay_1').final.storyboardId,null);}finally{f.done();}});

test('editing render input clears source provenance and invalidates an existing bound final',async()=>{const f=fixture();try{const d=createDelivery({store:f.store,env:ENV,renderDir:f.renderDir,stitch:f.fakeStitch,ffmpeg:()=>'ffmpeg'});await d.finish('pay_1');f.store.updateRender(f.renders[0].id,{input:{prompt:'different intent'}});assert.equal(f.store.getRender(f.renders[0].id).storyboard_plan_hash,null);assert.equal(d.get('pay_1').final.stale,true);await d.finish('pay_1');assert.equal(d.get('pay_1').final.storyboardId,null);}finally{f.done();}});

test('unchanged input and source metadata updates preserve the original source hash',()=>{const f=fixture();try{const r=f.store.getRender(f.renders[0].id);f.store.updateRender(r.id,{input:structuredClone(r.input),endpoint:r.endpoint,shot_id:r.shot_id,storyboard_id:r.storyboard_id,status:'checking'});assert.equal(f.store.getRender(r.id).storyboard_plan_hash,r.storyboard_plan_hash);}finally{f.done();}});
