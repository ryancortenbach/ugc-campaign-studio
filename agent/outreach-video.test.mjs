import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';

// No network, no credits: every Claude, Higgsfield, Gmail and Exa call is a stub, and the data folder is a temp dir.
const tmp=mkdtempSync(path.join(tmpdir(),'outreach-video-'));
process.env.AGENT_DATA_DIR=tmp;delete process.env.EXA_API_KEY;
const {openStore}=await import('./store.mjs');
const {createRunner}=await import('./runner.mjs');
const {createApp}=await import('./server.mjs');
const gmailTools=await import('./tools/gmail.mjs');
const {buildInput,priceFrom,endpoints}=await import('./tools/higgsfield.mjs');
const {searchBrands,pageImages}=await import('./tools/exa.mjs');
const logo=await import('./logo.mjs');
const {conceptInput,PASS_SCORE}=await import('./ugc.mjs');
const {PDFDocument,StandardFonts}=await import('pdf-lib');
const renderDir=path.join(tmp,'renders');mkdirSync(renderDir,{recursive:true});
// The real base offer PDF is gitignored, so every test here uses a small stand-in with the same two page layout.
{const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica);
 const p1=pdf.addPage([612,792]);p1.drawText('Hey everyone,',{x:54,y:676,size:11,font});pdf.addPage([612,792]).drawText('We will create 10 ads',{x:54,y:700,size:20,font});
 mkdirSync(path.join(tmp,'offer'),{recursive:true});writeFileSync(path.join(tmp,'offer','base-v3.pdf'),await pdf.save());}

const page=domain=>({via:'fake',sessionId:null,screenshot:null,domain,socials:{instagram:`https://www.instagram.com/${domain.split('.')[0]}/`},pages:[{url:`https://${domain}/`,title:domain,chars:100}],homeText:'Shop new arrivals of linen shirts',contactText:'',emails:[{email:`hello@${domain}`,sourceUrl:`https://${domain}/c`,excerpt:'x'}],best:{email:`hello@${domain}`,sourceUrl:`https://${domain}/c`,excerpt:'x'}});
const pass={passed:true,results:[{id:'a',name:'A',score:95,summary:'ok',issues:[],cost:0.001}],cost:0.003};
const fail={passed:false,results:[{id:'a',name:'A',score:40,summary:'bad',issues:[{severity:'major',evidence:'x',fix:'simplify the action'}],cost:0.001}],cost:0.003};
function videoStub({checks=[pass],enabled={ok:true}}={}){
 const calls={concept:0,revise:0,check:0,estimate:0};
 return {calls,enabled:()=>enabled,endpoint:endpoints['text-to-video'],priceFrom,
  concept:async ctx=>{calls.concept++;calls.ctx=ctx;return {fields:{},input:buildInput({prompt:`Vertical 9:16 video for ${ctx.company}`,duration:5,resolution:'720p'}),cost:0.004};},
  revise:async()=>{calls.revise++;return {fields:{},input:buildInput({prompt:`Revised ${calls.revise}`,duration:5,resolution:'720p'}),cost:0.003};},
  check:async()=>checks[Math.min(calls.check++,checks.length-1)],
  estimate:async()=>{calls.estimate++;return {pricing_description:'roughly $0.4622 per second of generated video at 720p'};}};
}
const offlineNet={fetchImpl:async()=>{throw Error('offline');},exaImages:async()=>null};
function fakeTools(over={}){
 const calls={drafts:[]};
 return {calls,
  loadProfile:()=>({senderName:'Ryan',company:'Mint Labs',offer:'AI UGC',senderFact:'x',cta:'y',rules:'z'}),
  brainMode:()=>'fake',exaMode:()=>'rest',siteMode:()=>'fetch',gmailEnabled:()=>true,draftAccount:()=>'rmc2249@columbia.edu',
  plan:async()=>({data:{reply:'ok',markets:['linen'],territories:['Brooklyn'],maxDrafts:2,qualify:'sells online',exclusions:[],searchQueries:[{query:'q1',market:'linen',territory:'Brooklyn'}]},cost:0.001,model:'fake'}),
  search:async()=>({via:'fake exa',costUsd:0.007,requestId:'r',results:[{title:'Alpha | Shop',url:'https://alpha.com/x',text:'a linen brand',favicon:'https://alpha.com/fav.png'},{title:'Beta',url:'https://beta.com/',text:'',image:'https://beta.com/og.jpg'},{title:'Gamma',url:'https://gamma.com/',text:''}]}),
  visit:async url=>page(new URL(url).hostname),
  logo:async()=>({ok:true,checked:true,cost:0,logo:{checked:true,isRealLogo:true,matchesBrand:true,quality:90,reason:'fake'}}),
  value:async()=>({data:{valueScore:90,verdict:'keep',reason:'established brand'},cost:0.0001,model:'fake'}),
  score:async({lead})=>({data:{company:lead.company,fitScore:80,decision:'pursue',reasons:['good'],risks:[],personalDetail:'detail'},cost:0.0001,model:'fake'}),
  draft:async({graded})=>({data:{subject:`Hi ${graded.company}`,body:'Hello\n\nRyan'},cost:0.001,model:'fake'}),
  createDraft:async d=>{calls.drafts.push(d);return {draftId:'d1',messageId:'m1',url:'https://mail.google.com/x'};},
  steer:async({currentPlan})=>({data:{reply:'ok',action:'continue',plan:currentPlan,skipDomains:[]},cost:0,model:'fake'}),
  video:videoStub(),...over};
}
async function serve(store,over={}){
 const created=[],updated=[];
 const sent=[];
 const gmailApi={...gmailTools,gmailEnabled:()=>true,MAX_ATTACH_BYTES:5000,sendDraft:async id=>{sent.push(id);return {messageId:`sent-${id}`,threadId:'t1'};},
  createDraft:async d=>{created.push(d);return {draftId:`new${created.length}`,messageId:'mm',url:`https://mail.google.com/new${created.length}`};},
  updateDraft:async d=>{updated.push(d);return {draftId:d.draftId,messageId:'m2',url:'https://mail.google.com/updated'};},...over.gmailApi};
 const hf={...(await import('./tools/higgsfield.mjs')),higgsfieldEnabled:()=>true,approveAndSubmit:async()=>{throw Error('a lead video must never be submitted without a click');},...over.hf};
 const server=http.createServer(createApp({store,runner:{start(){},control(){},steer(){},isRunning:()=>false},gmailApi,higgsfield:hf,video:over.video,logoNet:over.logoNet||offlineNet}));
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base=`http://127.0.0.1:${server.address().port}`;
 const call=(method,p,b)=>fetch(base+p,{method,headers:{'Content-Type':'application/json'},body:method==='POST'?JSON.stringify(b||{}):undefined});
 return {created,updated,sent,base,close:()=>new Promise(r=>server.close(r)),
  post:(p,b)=>call('POST',p,b).then(async r=>({status:r.status,body:await r.json()})),
  get:p=>call('GET',p).then(async r=>({status:r.status,body:await r.json()})),raw:p=>call('GET',p)};
}
const finish=(store,render,bytes='fake-mp4-bytes')=>{const file=`render-${render.id}.mp4`;writeFileSync(path.join(renderDir,file),bytes);return store.updateRender(render.id,{status:'completed',local_file:file,result_url:`https://cdn.example/${file}`,review:'pending'});};

test('the runner writes the email, makes a lead render, and parks it at checks_passed without submitting',async()=>{
 const store=openStore(':memory:');const tools=fakeTools();const runner=createRunner(store,tools);
 const t=runner.start('find linen brands');await runner.wait(t.id);
 assert.equal(store.getTask(t.id).status,'done');
 assert.equal(tools.calls.drafts.length,0,'no Gmail draft is created before the video is approved');
 const leads=store.listLeads({taskId:t.id});
 assert.equal(leads.length,2,'maxDrafts counts waiting drafts');
 assert.ok(leads.every(l=>l.status==='awaiting_video'));
 for(const l of leads){
  const [d]=store.listDrafts({leadId:l.id});
  assert.equal(d.status,'waiting_video');assert.equal(d.gmail_draft_id,null);assert.equal(d.render_id,null);
  const [r]=store.listRenders({leadId:l.id});
  assert.equal(r.lead_id,l.id);assert.equal(r.title,`${l.company} video`);
  assert.equal(r.status,'checks_passed');assert.equal(r.estimate_usd,'2.31');
  assert.equal(r.request_id,null);assert.equal(r.submission_key,null);assert.equal(r.approved_at,null);
  assert.equal(r.endpoint,endpoints['text-to-video']);assert.equal(r.input.duration,5);assert.equal(r.input.resolution,'720p');assert.equal(r.input.image_url,undefined);
  assert.ok(store.listEvents({leadId:l.id}).some(e=>e.title==='Video concept ready for your approval ($2.31)'));
 }
 assert.equal(store.spendSummary().providers.find(p=>p.provider==='higgsfield'),undefined,'no Higgsfield spend before a click');
 const claude=store.db.prepare("select * from spend where provider='claude' and note like 'video%'").all();
 assert.ok(claude.length>=4&&claude.every(r=>r.render_id&&r.task_id===t.id));
 assert.ok(store.getTask(t.id).cost_usd>0);
 assert.ok(store.listEvents({taskId:t.id}).some(e=>e.type==='draft'&&/held until its video is approved/.test(e.title)&&/Not sent/.test(e.title)));
});

test('video concepts continue beyond five revisions and reach approval only after passing',async()=>{
 const store=openStore(':memory:');const video=videoStub({checks:[...Array(8).fill(fail),pass]});
 const tools=fakeTools({video,plan:async()=>({data:{reply:'ok',markets:['x'],territories:['y'],maxDrafts:1,qualify:'q',exclusions:[],searchQueries:[{query:'q1',market:'x',territory:'y'}]},cost:0,model:'fake'})});
 const runner=createRunner(store,tools);await runner.wait(runner.start('go').id);
 assert.equal(video.calls.concept,1);assert.equal(video.calls.revise,8);assert.equal(video.calls.check,9);assert.equal(video.calls.estimate,1);
 const [r]=store.listRenders();assert.equal(r.status,'checks_passed');assert.equal(r.request_id,null);assert.equal(r.input.prompt,'Revised 8');
 assert.equal(r.approved_at,null);assert.ok(store.listEvents().some(e=>e.title.includes('revising (8)')));
});

test('a 89 on any one checker is not good enough: the render revises until every checker is at the pass score',async()=>{
 const store=openStore(':memory:');
 const at=score=>({passed:true,results:[{id:'a',name:'A',score:95,summary:'ok',issues:[],cost:0},{id:'b',name:'B',score,summary:'ok',issues:[],cost:0}],cost:0.002});
 const video=videoStub({checks:[at(PASS_SCORE-1),at(PASS_SCORE-1),at(PASS_SCORE)]});
 const tools=fakeTools({video,plan:async()=>({data:{reply:'ok',markets:['x'],territories:['y'],maxDrafts:1,qualify:'q',exclusions:[],searchQueries:[{query:'q1',market:'x',territory:'y'}]},cost:0,model:'fake'})});
 const runner=createRunner(store,tools);await runner.wait(runner.start('go').id);
 assert.equal(video.calls.revise,2);assert.equal(video.calls.check,3);
 assert.ok(store.listRenders().every(r=>r.status==='checks_passed'));
});

test('without Higgsfield the lead stays awaiting_video with a clear event and no render',async()=>{
 const store=openStore(':memory:');
 const video=videoStub({enabled:{ok:false,reason:'Higgsfield is not configured (HF_CREDENTIALS)'}});
 const tools=fakeTools({video});const runner=createRunner(store,tools);await runner.wait(runner.start('go').id);
 assert.equal(video.calls.concept,0);assert.equal(store.listRenders().length,0);assert.equal(tools.calls.drafts.length,0);
 const leads=store.listLeads();assert.ok(leads.length>0&&leads.every(l=>l.status==='awaiting_video'));
 assert.ok(store.listEvents({leadId:leads[0].id}).some(e=>/Higgsfield is not configured/.test(e.title)&&/awaiting_video/.test(e.title)));
 assert.ok(store.listDrafts().every(d=>d.status==='waiting_video'));
});

test('Exa favicon or image becomes the lead logo when the search returns one',async()=>{
 const store=openStore(':memory:');
 const s2=openStore(':memory:');const r2=createRunner(s2,fakeTools());await r2.wait(r2.start('go').id);
 const by=Object.fromEntries(s2.listLeads().map(l=>[l.domain,l.logo]));
 assert.equal(by['alpha.com'],'https://alpha.com/fav.png');
 assert.equal(by['beta.com'],'https://beta.com/og.jpg');
 assert.equal(by['gamma.com']??null,null);
 const keep=process.env.EXA_API_KEY;process.env.EXA_API_KEY='test-not-real';
 try{
  let body;const request=async(u,init)=>{body=init.body;return new Response(JSON.stringify({results:[{title:'T',url:'https://a.com/',text:'t',favicon:'https://a.com/f.ico',image:'javascript:alert(1)'}],costDollars:{total:0.007}}),{status:200});};
  const found=await searchBrands('q',{request});
  assert.equal(found.results[0].favicon,'https://a.com/f.ico');assert.equal(found.results[0].image,null);
  const imgs=await pageImages('https://a.com/',{request:async(u,init)=>{assert.equal(String(u),'https://api.exa.ai/contents');assert.deepEqual(JSON.parse(init.body).urls,['https://a.com/']);return new Response(JSON.stringify({results:[{url:'https://a.com/',favicon:'https://a.com/f.ico'}],costDollars:{total:0.001}}),{status:200});}});
  assert.deepEqual(imgs,{favicon:'https://a.com/f.ico',image:null,costUsd:0.001});
 }finally{if(keep===undefined)delete process.env.EXA_API_KEY;else process.env.EXA_API_KEY=keep;}
});

test('buildMime makes a multipart message with a base64 video/mp4 part and keeps the header guard',()=>{
 const data=Buffer.alloc(200,7);
 const mime=gmailTools.buildMime({from:'a@b.co',to:'x@y.co',subject:'Hi',body:'Line one\nLine two',attachment:{filename:'brand-video.mp4',mime:'video/mp4',data}});
 assert.match(mime,/Content-Type: multipart\/mixed; boundary="([^"]+)"/);
 const boundary=mime.match(/boundary="([^"]+)"/)[1];
 assert.equal(mime.split(`--${boundary}`).length,4);assert.ok(mime.endsWith(`--${boundary}--\r\n`));
 assert.match(mime,/Content-Type: video\/mp4; name="brand-video\.mp4"/);assert.match(mime,/Content-Transfer-Encoding: base64/);assert.match(mime,/Content-Disposition: attachment; filename="brand-video\.mp4"/);
 const part=mime.split(`--${boundary}`)[2].split('\r\n\r\n')[1];
 assert.ok(part.split('\r\n').every(l=>l.length<=76));
 assert.deepEqual(Buffer.from(part.replace(/\r\n/g,''),'base64'),data);
 assert.match(mime,/Line one\r\nLine two/);
 assert.ok(!/multipart/.test(gmailTools.buildMime({from:'a@b.co',to:'x@y.co',subject:'Hi',body:'b'})));
 assert.throws(()=>gmailTools.buildMime({from:'a',to:'x@y.z\r\nBcc: evil@z.z',subject:'s',body:'b',attachment:{filename:'a.mp4',mime:'video/mp4',data}}),/injection/);
 assert.throws(()=>gmailTools.buildMime({from:'a',to:'x@y.z',subject:'s\nBcc: e@z.z',body:'b',attachment:{filename:'a.mp4',mime:'video/mp4',data}}),/injection/);
 assert.throws(()=>gmailTools.buildMime({from:'a',to:'x@y.z',subject:'s',body:'b',attachment:{filename:'a.mp4"\r\nX: y',mime:'video/mp4',data}}),/injection/);
 assert.throws(()=>gmailTools.buildMime({from:'a',to:'x@y.z',subject:'s',body:'b',attachment:{filename:'a.mp4',mime:'video/mp4\r\nX: y',data}}),/injection/);
 assert.equal(gmailTools.MAX_ATTACH_BYTES,20*1024*1024);
});

async function leadWithRender(store,{gmail=false}={}){
 const lead=store.createLead({taskId:null,domain:'alpha.com',company:'Alpha',url:'https://alpha.com/',market:'m',territory:'t'});
 const draft=store.addDraft({leadId:lead.id,taskId:null,to:'hello@alpha.com',subject:'Hi Alpha',body:'Hello\n\nRyan',status:gmail?'gmail_draft':'waiting_video',gmailDraftId:gmail?'gd1':undefined,gmailUrl:gmail?'https://mail.google.com/old':undefined});
 store.updateLead(lead.id,{status:gmail?'drafted':'awaiting_video'});
 return {lead,draft};
}

test('approving the video for an Instagram DM lead marks the DM ready and never touches Gmail',async()=>{
 const store=openStore(':memory:');const s=await serve(store);
 try{
  const lead=store.createLead({taskId:null,domain:'beta.com',company:'Beta',url:'https://beta.com/',market:'m',territory:'t'});
  store.updateLead(lead.id,{status:'awaiting_video',instagram_handle:'betawear',contact_kind:'instagram'});
  const draft=store.addDraft({leadId:lead.id,taskId:null,to:'@betawear',subject:'Hi Beta',body:'Hey Beta',status:'waiting_video',channel:'instagram_dm'});
  const r=store.createRender({title:'Beta video',endpoint:endpoints['text-to-video'],input:buildInput({prompt:'p long enough'}),leadId:lead.id});
  finish(store,r,'MP4DATA');
  const out=await s.post(`/api/renders/${r.id}/review`,{decision:'approved'});
  assert.equal(out.status,200);assert.equal(out.body.attach.status,'dm_ready');
  assert.equal(s.created.length,0,'no Gmail draft is created for a DM');assert.equal(s.updated.length,0);
  const d=store.getDraft(draft.id);
  assert.equal(d.status,'dm_ready');assert.equal(d.render_id,r.id);assert.equal(d.gmail_draft_id,null);
  assert.equal(store.getLead(lead.id).status,'drafted');
  assert.ok(store.listEvents({leadId:lead.id}).some(e=>/Instagram DM ready for @betawear/.test(e.title)));
  const again=await s.post(`/api/renders/${r.id}/review`,{decision:'approved'});
  assert.equal(again.body.attach.status,'already_attached');assert.equal(s.created.length,0);
  assert.ok(d.body.includes(`https://cdn.example/render-${r.id}.mp4`),'a DM carries the clip link in its text');
  assert.deepEqual(out.body.draft.readiness,{ready:false,missing:['instagram']},'a DM is ready only when Instagram is connected (not here), it has a handle and the clip link is in the text');
 }finally{await s.close();}
});

test('approving a video skips the withdrawn email draft and marks the DM ready, with no Gmail call',async()=>{
 const store=openStore(':memory:');const s=await serve(store);
 try{
  const lead=store.createLead({taskId:null,domain:'blan.com',company:'Blan',url:'https://blan.com/',market:'m',territory:'t'});
  store.updateLead(lead.id,{status:'awaiting_video',instagram_handle:'blanwear',contact_kind:'instagram'});
  store.addDraft({leadId:lead.id,taskId:null,to:'@blanwear',subject:'Hi Blan',body:'Hey Blan',status:'waiting_video',channel:'instagram_dm'});
  const old=store.addDraft({leadId:lead.id,taskId:null,to:'info@blan.com',subject:'Old',body:'Old email',gmailDraftId:'gd1',gmailUrl:'https://mail.google.com/gd1',status:'withdrawn'});
  const dm=store.listDrafts({leadId:lead.id}).find(d=>d.channel==='instagram_dm');
  const newest=store.addDraft({leadId:lead.id,taskId:null,to:'info@blan.com',subject:'Older',body:'x',status:'withdrawn'});
  assert.ok(newest.id>dm.id,'the withdrawn email draft is the newest row, so a plain first-unsent pick would choose it');
  const r=store.createRender({title:'Blan video',endpoint:endpoints['text-to-video'],input:buildInput({prompt:'p long enough'}),leadId:lead.id});
  finish(store,r,'MP4DATA');
  const out=await s.post(`/api/renders/${r.id}/review`,{decision:'approved'});
  assert.equal(out.status,200);assert.equal(out.body.attach.status,'dm_ready');
  assert.equal(s.created.length,0);assert.equal(s.updated.length,0);
  assert.equal(store.getDraft(dm.id).status,'dm_ready');assert.equal(store.getDraft(dm.id).render_id,r.id);
  assert.equal(store.getDraft(old.id).status,'withdrawn');assert.equal(store.getDraft(old.id).render_id,null);
  assert.equal(store.getLead(lead.id).status,'drafted');
 }finally{await s.close();}
});

test('approving the finished scene creates the Gmail draft with the mp4 attached and finishes the lead',async()=>{
 const store=openStore(':memory:');const s=await serve(store);
 try{
  const {lead,draft}=await leadWithRender(store);
  const r=store.createRender({title:'Alpha video',endpoint:endpoints['text-to-video'],input:buildInput({prompt:'p long enough'}),leadId:lead.id});
  assert.equal((await s.post(`/api/renders/${r.id}/review`,{decision:'approved'})).status,409,'only finished renders');
  finish(store,r,'MP4DATA');
  const out=await s.post(`/api/renders/${r.id}/review`,{decision:'approved'});
  assert.equal(out.status,200);assert.equal(out.body.attach.status,'attached');
  assert.equal(s.created.length,1);assert.equal(s.updated.length,0);
  const sent=s.created[0];
  assert.equal(sent.to,'hello@alpha.com');assert.equal(sent.subject,'Hi Alpha');
  assert.equal(sent.body,`Hello\n\nRyan\n\nP.S. A 5 second video made for Alpha: https://cdn.example/render-${r.id}.mp4`,'the clip link is always in the body');
  assert.deepEqual(sent.attachments.map(a=>a.mime),['application/pdf','video/mp4']);assert.equal(sent.attachments[1].data.toString(),'MP4DATA');
  assert.equal(sent.attachments[0].data.subarray(0,5).toString(),'%PDF-');assert.equal(sent.attachments[0].filename,'alpha-offer.pdf');
  const mime=gmailTools.buildMime({from:'me@x.co',to:sent.to,subject:sent.subject,body:sent.body,attachments:sent.attachments});
  assert.match(mime,/Content-Type: application\/pdf; name="alpha-offer\.pdf"/);assert.match(mime,/Content-Type: video\/mp4/);
  assert.deepEqual(store.getDraft(draft.id).attachments.map(a=>a.kind),['offer_pdf','video']);
  const d=store.getDraft(draft.id);
  assert.equal(d.status,'gmail_draft');assert.equal(d.gmail_draft_id,'new1');assert.equal(d.gmail_url,'https://mail.google.com/new1');assert.equal(d.render_id,r.id);
  assert.equal(store.getLead(lead.id).status,'drafted');
  assert.ok(store.listEvents({leadId:lead.id}).some(e=>/with the offer PDF and the video attached\. Not sent\./.test(e.title)));
  const again=await s.post(`/api/renders/${r.id}/review`,{decision:'approved'});
  assert.equal(again.body.attach.status,'already_attached');assert.equal(s.created.length,1,'a second approval never makes a second draft');
 }finally{await s.close();}
});

test('approving a video for a personal email lead leaves the draft ready to send, and the app still sends nothing',async()=>{
 const store=openStore(':memory:');const s=await serve(store);
 try{
  const lead=store.createLead({taskId:null,domain:'alpha.com',company:'Alpha',url:'https://alpha.com/',market:'m',territory:'t'});
  store.updateLead(lead.id,{status:'awaiting_video',contact_kind:'personal',contact_name:'Jane Doe'});
  const draft=store.addDraft({leadId:lead.id,taskId:null,to:'jane@alpha.com',subject:'Hi Alpha',body:'Hello',status:'waiting_video'});
  const r=store.createRender({title:'Alpha video',endpoint:endpoints['text-to-video'],input:buildInput({prompt:'p long enough'}),leadId:lead.id});
  finish(store,r,'MP4DATA');
  const out=await s.post(`/api/renders/${r.id}/review`,{decision:'approved'});
  assert.equal(out.body.attach.status,'attached');
  assert.deepEqual(out.body.draft.readiness,{ready:true,missing:[]});
  assert.deepEqual(out.body.draft.attachments.map(a=>a.kind),['offer_pdf','video']);
  assert.match(s.created[0].body,/P\.S\. A 5 second video made for Alpha: https:\/\/cdn\.example\/render-\d+\.mp4$/);
  assert.equal(s.sent.length,0,'approval never sends');
  assert.equal(store.getDraft(draft.id).status,'gmail_draft');
  // a newer render replaces the old P.S. line instead of stacking a second one
  const r2=store.createRender({title:'Alpha video (v2)',endpoint:'x',input:buildInput({prompt:'p long enough'}),leadId:lead.id});
  finish(store,r2,'MP4V2');
  await s.post(`/api/renders/${r2.id}/review`,{decision:'approved'});
  const body=store.getDraft(draft.id).body;
  assert.equal(body.match(/P\.S\./g).length,1);assert.ok(body.includes(`render-${r2.id}.mp4`)&&!body.includes(`render-${r.id}.mp4`));
  assert.equal(s.updated.length,1);assert.equal(s.sent.length,0);
 }finally{await s.close();}
});

test('an oversized or missing file puts the video link in the body and says so',async()=>{
 const store=openStore(':memory:');const s=await serve(store);
 try{
  const {lead,draft}=await leadWithRender(store);
  const r=store.createRender({title:'Alpha video',endpoint:'x',input:buildInput({prompt:'p long enough'}),leadId:lead.id});
  finish(store,r,Buffer.alloc(6000,1));
  const out=await s.post(`/api/renders/${r.id}/review`,{decision:'approved'});
  assert.equal(out.body.attach.status,'linked');
  assert.deepEqual(s.created[0].attachments.map(a=>a.mime),['application/pdf'],'only the PDF fits');assert.match(s.created[0].body,/https:\/\/cdn\.example\/render-\d+\.mp4/);
  assert.match(store.getDraft(draft.id).body,/cdn\.example/);
  assert.ok(store.listEvents({leadId:lead.id}).some(e=>/video link in the body/.test(e.title)&&/over the/.test(e.title)));
  const l2=store.createLead({taskId:null,domain:'beta.com',company:'Beta',url:'https://beta.com/',market:'m',territory:'t'});
  const d2=store.addDraft({leadId:l2.id,taskId:null,to:'hello@beta.com',subject:'Hi',body:'B',status:'waiting_video'});
  const r2=store.createRender({title:'Beta video',endpoint:'x',input:buildInput({prompt:'p long enough'}),leadId:l2.id});
  store.updateRender(r2.id,{status:'completed',local_file:'nope.mp4',result_url:'https://cdn.example/beta.mp4',review:'pending'});
  assert.equal((await s.post(`/api/renders/${r2.id}/review`,{decision:'approved'})).body.attach.status,'linked');
  assert.match(s.created[1].body,/beta\.mp4/);assert.deepEqual(s.created[1].attachments.map(a=>a.mime),['application/pdf']);assert.ok(store.listEvents({leadId:l2.id}).some(e=>/file is missing/.test(e.title)));
  const l3=store.createLead({taskId:null,domain:'c.com',company:'C',url:'https://c.com/',market:'m',territory:'t'});
  store.addDraft({leadId:l3.id,taskId:null,to:'a@c.com',subject:'Hi',body:'B',status:'waiting_video'});
  const r3=store.createRender({title:'C video',endpoint:'x',input:buildInput({prompt:'p long enough'}),leadId:l3.id});
  store.updateRender(r3.id,{status:'completed',review:'pending'});
  assert.equal((await s.post(`/api/renders/${r3.id}/review`,{decision:'approved'})).body.attach.status,'failed');
  assert.equal(s.created.length,2);
 }finally{await s.close();}
});

test('a Gmail failure keeps the review, logs the error and can be retried by approving again',async()=>{
 const store=openStore(':memory:');let fail=true;
 const s=await serve(store,{gmailApi:{createDraft:async d=>{if(fail)throw Error('quota');return {draftId:'ok1',url:'u'};}}});
 try{
  const {lead,draft}=await leadWithRender(store);
  const r=store.createRender({title:'Alpha video',endpoint:'x',input:buildInput({prompt:'p long enough'}),leadId:lead.id});finish(store,r);
  const bad=await s.post(`/api/renders/${r.id}/review`,{decision:'approved'});
  assert.equal(bad.status,200);assert.equal(bad.body.render.review,'approved');assert.equal(bad.body.attach.status,'failed');
  assert.equal(store.getDraft(draft.id).status,'waiting_video');assert.equal(store.getLead(lead.id).status,'awaiting_video');
  fail=false;
  assert.equal((await s.post(`/api/renders/${r.id}/review`,{decision:'approved'})).body.attach.status,'attached');
  assert.equal(store.getDraft(draft.id).status,'gmail_draft');
 }finally{await s.close();}
});

test('POST /api/leads/:id/video for a drafted lead makes a held render, then approval updates the existing Gmail draft in place',async()=>{
 const store=openStore(':memory:');const video=videoStub();const s=await serve(store,{video});
 try{
  const {lead,draft}=await leadWithRender(store,{gmail:true});
  const made=await s.post(`/api/leads/${lead.id}/video`);
  assert.equal(made.status,200);
  assert.equal(made.body.render.status,'checks_passed');assert.equal(made.body.render.lead_id,lead.id);assert.equal(made.body.render.estimate_usd,'2.31');assert.equal(made.body.render.title,'Alpha video');
  assert.equal(made.body.render.request_id,null);assert.equal(store.getLead(lead.id).status,'drafted');
  assert.equal((await s.post(`/api/leads/${lead.id}/video`)).status,409,'one video in progress at a time');
  assert.equal(s.created.length+s.updated.length,0,'nothing touches Gmail before approval');
  const detail=await s.get(`/api/leads/${lead.id}`);
  assert.equal(detail.body.renders.length,1);assert.equal(detail.body.renders[0].id,made.body.render.id);
  assert.ok(detail.body.drafts.length===1&&detail.body.events.length>0);
  finish(store,made.body.render,'VIDEO');
  const ok=await s.post(`/api/renders/${made.body.render.id}/review`,{decision:'approved'});
  assert.equal(ok.body.attach.status,'attached');
  assert.equal(s.created.length,0,'the existing draft is updated, not duplicated');assert.equal(s.updated.length,1);
  assert.equal(s.updated[0].draftId,'gd1');assert.equal(s.updated[0].attachments[1].data.toString(),'VIDEO');assert.equal(s.updated[0].subject,'Hi Alpha');
  const d=store.getDraft(draft.id);assert.equal(d.render_id,made.body.render.id);assert.equal(d.gmail_draft_id,'gd1');assert.equal(d.gmail_url,'https://mail.google.com/updated');assert.equal(d.status,'gmail_draft');
  assert.equal((await s.post(`/api/leads/${lead.id}/video`)).status,409,'already has a video');
  assert.equal((await s.post('/api/leads/9999/video')).status,404);
  const l2=store.createLead({taskId:null,domain:'z.com',company:'Z',url:'https://z.com/',market:'m',territory:'t'});
  store.updateLead(l2.id,{status:'contacted'});assert.equal((await s.post(`/api/leads/${l2.id}/video`)).status,409);
 }finally{await s.close();}
});

test('a deleted Gmail draft (404 on update) falls back to a new draft, and the lead video route needs Higgsfield',async()=>{
 const store=openStore(':memory:');
 const s=await serve(store,{gmailApi:{updateDraft:async()=>{throw Object.assign(Error('gone'),{status:404});}}});
 try{
  const {lead,draft}=await leadWithRender(store,{gmail:true});
  const r=store.createRender({title:'Alpha video',endpoint:'x',input:buildInput({prompt:'p long enough'}),leadId:lead.id});finish(store,r);
  const out=await s.post(`/api/renders/${r.id}/review`,{decision:'approved'});
  assert.equal(out.body.attach.status,'attached');assert.equal(s.created.length,1);assert.equal(store.getDraft(draft.id).gmail_draft_id,'new1');
 }finally{await s.close();}
 const store2=openStore(':memory:');const off=videoStub({enabled:{ok:false,reason:'Higgsfield is not configured (HF_CREDENTIALS)'}});
 const s2=await serve(store2,{video:off});
 try{
  const {lead}=await leadWithRender(store2);
  const res=await s2.post(`/api/leads/${lead.id}/video`);
  assert.equal(res.status,503);assert.match(res.body.error,/not configured/);assert.equal(off.calls.concept,0);assert.equal(store2.listRenders().length,0);
  assert.ok(store2.listEvents({leadId:lead.id}).some(e=>/not configured/.test(e.title)));
 }finally{await s2.close();}
});

test('a rejected lead scene follows the revise flow and the revision keeps the lead',async()=>{
 const store=openStore(':memory:');const s=await serve(store);
 try{
  const {lead,draft}=await leadWithRender(store);
  const r=store.createRender({title:'Alpha video',endpoint:'x',input:buildInput({prompt:'p long enough'}),leadId:lead.id});finish(store,r);
  const rej=await s.post(`/api/renders/${r.id}/review`,{decision:'rejected',note:'Wrong shirt color'});
  assert.equal(rej.body.render.review,'rejected');assert.equal(s.created.length,0);assert.equal(store.getDraft(draft.id).status,'waiting_video');
  const v2=await s.post(`/api/renders/${r.id}/revise`,{});
  assert.equal(v2.body.render.lead_id,lead.id);assert.equal(v2.body.render.title,'Alpha video (v2)');assert.equal(v2.body.render.status,'draft');assert.equal(v2.body.render.request_id,null);
  assert.equal((await s.post(`/api/renders/${v2.body.render.id}/approve`,{estimate:'1'})).status,409);
 }finally{await s.close();}
});

// ---- logos ----
const png=Buffer.concat([Buffer.from([0x89,0x50,0x4e,0x47]),Buffer.alloc(100,1)]);
function netStub(table){
 const seen=[];
 const fetchImpl=async(url,init={})=>{
  url=String(url);seen.push(url);
  const hit=table[url];if(!hit)return new Response('nope',{status:404});
  if(hit instanceof Response)return hit.clone();
  const {status=200,type='image/png',body=png,headers={}}=hit;
  return new Response(body,{status,headers:{'Content-Type':type,...headers}});
 };
 return {seen,fetchImpl};
}
const tmpLogos=()=>mkdtempSync(path.join(tmpdir(),'logos-'));
const lead0=over=>({id:1,domain:'brand.com',url:'https://brand.com/',logo:null,...over});

test('logo resolution order: Exa search URL, Exa contents, homepage tags, Google favicons',async()=>{
 const dir=tmpLogos();let net=netStub({'https://cdn.exa/fav.png':{}});
 let r=await logo.resolveLogo({lead:lead0({logo:'https://cdn.exa/fav.png'}),dir,fetchImpl:net.fetchImpl,exaImages:async()=>{throw Error('must not be called');}});
 assert.equal(r.source,'exa search');assert.deepEqual(net.seen,['https://cdn.exa/fav.png']);assert.ok(existsSync(path.join(dir,'brand.com.png')));
 net.seen.length=0;r=await logo.resolveLogo({lead:lead0({logo:'https://cdn.exa/fav.png'}),dir,fetchImpl:net.fetchImpl});
 assert.equal(r.source,'cache');assert.equal(net.seen.length,0,'each domain is resolved once');

 const dir2=tmpLogos();let spend=[];net=netStub({'https://x.com/exa-fav.png':{}});
 r=await logo.resolveLogo({lead:lead0({logo:'https://bad.example/missing.png'}),dir:dir2,fetchImpl:net.fetchImpl,exaImages:async url=>{assert.equal(url,'https://brand.com/');return {favicon:'https://x.com/exa-fav.png',image:null,costUsd:0.001};},onSpend:(usd,est)=>spend.push([usd,est])});
 assert.equal(r.source,'exa contents');assert.deepEqual(net.seen,['https://bad.example/missing.png','https://x.com/exa-fav.png']);assert.deepEqual(spend,[[0.001,false]]);

 const dir3=tmpLogos();net=netStub({
  'https://brand.com/':{type:'text/html',body:'<html><head><meta property="og:image" content="/og.jpg"><link rel="icon" href="/icon.png"><link rel="apple-touch-icon" href="/apple.png"></head></html>'},
  '/apple':{},'https://brand.com/apple.png':{},'https://brand.com/icon.png':{},'https://brand.com/og.jpg':{type:'image/jpeg'}});
 r=await logo.resolveLogo({lead:lead0(),dir:dir3,fetchImpl:net.fetchImpl,exaImages:async()=>null});
 assert.equal(r.source,'homepage');assert.deepEqual(net.seen,['https://brand.com/','https://brand.com/apple.png']);

 const dir4=tmpLogos();net=netStub({'https://brand.com/':{type:'text/html',body:'<meta property="og:image" content="https://brand.com/og.jpg"><link rel="icon" href="icon.png">'},'https://brand.com/og.jpg':{type:'image/jpeg'}});
 r=await logo.resolveLogo({lead:lead0(),dir:dir4,fetchImpl:net.fetchImpl,exaImages:async()=>null});
 assert.equal(r.source,'homepage');assert.equal(r.type,'image/jpeg');assert.deepEqual(net.seen,['https://brand.com/','https://brand.com/icon.png','https://brand.com/og.jpg']);

 const dir5=tmpLogos();const google='https://www.google.com/s2/favicons?domain=brand.com&sz=128';net=netStub({[google]:{type:'image/x-icon'}});
 r=await logo.resolveLogo({lead:lead0(),dir:dir5,fetchImpl:net.fetchImpl,exaImages:async()=>null});
 assert.equal(r.source,'google favicons');assert.equal(net.seen.at(-1),google);assert.ok(existsSync(path.join(dir5,'brand.com.ico')));
});

test('logo limits: 1 MB cap, image content types only, http(s) only, no private hosts, misses are cached',async()=>{
 const big=Buffer.alloc(logo.MAX_LOGO_BYTES+1,1);
 await assert.rejects(logo.fetchImage('https://a.com/x.png',netStub({'https://a.com/x.png':{body:big}}).fetchImpl),/Too large/);
 await assert.rejects(logo.fetchImage('https://a.com/x.png',netStub({'https://a.com/x.png':{body:Buffer.from('x'),headers:{'Content-Length':String(big.length)}}}).fetchImpl),/Too large/);
 const ok=await logo.fetchImage('https://a.com/x.png',netStub({'https://a.com/x.png':{body:Buffer.alloc(logo.MAX_LOGO_BYTES,1)}}).fetchImpl);assert.equal(ok.data.length,logo.MAX_LOGO_BYTES);
 await assert.rejects(logo.fetchImage('https://a.com/x.png',netStub({'https://a.com/x.png':{type:'text/html',body:'<html>'}}).fetchImpl),/Not an image/);
 await assert.rejects(logo.fetchImage('https://a.com/x.png',netStub({'https://a.com/x.png':{type:'application/octet-stream'}}).fetchImpl),/Not an image/);
 for(const u of ['ftp://a.com/x.png','file:///etc/passwd','javascript:alert(1)','http://localhost/x.png','http://127.0.0.1:3200/api/state','http://192.168.1.5/x.png','http://169.254.169.254/latest','http://[::1]/x.png','https://user:pw@a.com/x.png'])
  await assert.rejects(logo.fetchImage(u,async()=>{throw Error('fetch must not run');}),/Blocked/,u);
 const redirect=netStub({'https://a.com/x.png':{status:302,headers:{Location:'http://127.0.0.1:3200/api/state'}}});
 await assert.rejects(logo.fetchImage('https://a.com/x.png',redirect.fetchImpl),/Blocked redirect/);assert.equal(redirect.seen.length,1);
 const hop=netStub({'https://a.com/x.png':{status:301,headers:{Location:'https://cdn.a.com/y.png'}},'https://cdn.a.com/y.png':{}});
 assert.equal((await logo.fetchImage('https://a.com/x.png',hop.fetchImpl)).ext,'png');
 const dir=tmpLogos();const net=netStub({});
 assert.equal(await logo.resolveLogo({lead:lead0({logo:'https://a.com/x.png'}),dir,fetchImpl:net.fetchImpl,exaImages:async()=>null}),null);
 const n=net.seen.length;assert.ok(n>0);
 assert.equal(await logo.resolveLogo({lead:lead0(),dir,fetchImpl:net.fetchImpl,exaImages:async()=>null}),null);assert.equal(net.seen.length,n,'a miss is remembered too');
 assert.equal(await logo.resolveLogo({lead:lead0({domain:'../etc'}),dir,fetchImpl:net.fetchImpl}),null);
 assert.deepEqual(readdirSync(dir),['brand.com.none']);
});

test('GET /api/leads/:id/logo serves the cached image, records the Exa cost, and 404s so the UI shows a letter',async()=>{
 const store=openStore(':memory:');
 const net=netStub({'https://brand.com/':{type:'text/html',body:'<link rel="apple-touch-icon" href="/a.png">'},'https://brand.com/a.png':{}});
 const s=await serve(store,{logoNet:{fetchImpl:net.fetchImpl,exaImages:async()=>({favicon:null,image:null,costUsd:0.001})}});
 try{
  const lead=store.createLead({taskId:null,domain:'brand-route-test.com',company:'B',url:'https://brand.com/',market:'m',territory:'t'});
  const res=await s.raw(`/api/leads/${lead.id}/logo`);
  assert.equal(res.status,200);assert.equal(res.headers.get('content-type'),'image/png');assert.equal(res.headers.get('x-content-type-options'),'nosniff');
  assert.deepEqual(Buffer.from(await res.arrayBuffer()),png);
  const exa=store.spendSummary().providers.find(p=>p.provider==='exa');assert.equal(exa.total,0.001);
  const n=net.seen.length;assert.equal((await s.raw(`/api/leads/${lead.id}/logo`)).status,200);assert.equal(net.seen.length,n);
  const none=store.createLead({taskId:null,domain:'nothing-here.com',company:'N',url:'https://nothing-here.com/',market:'m',territory:'t'});
  assert.equal((await s.raw(`/api/leads/${none.id}/logo`)).status,404);
  assert.equal((await s.raw('/api/leads/9999/logo')).status,404);
 }finally{await s.close();}
});

test('the concept input is a 5 second 720p text-to-video request with no reference file and no em dash',()=>{
 const input=conceptInput({identity:'Woman, 25, curly hair',wardrobe:'Linen shirt',environment:'Sunny kitchen',voice:'Warm',camera:'Medium close-up, handheld',action:'Holds up the shirt and smiles',dialogue:`This is my new favorite ${String.fromCharCode(0x2014)} so soft.`,audio:'Room tone',creativeDirection:'Natural light'});
 assert.equal(input.duration,5);assert.equal(input.resolution,'720p');assert.equal(input.image_url,undefined);
 assert.match(input.prompt,/^Vertical 9:16 video/);assert.match(input.prompt,/No scarcity, sold out or sales claims/);
 assert.ok(!input.prompt.includes(String.fromCharCode(0x2014)));
});

test('no em dash character in the new outreach video code',()=>{
 const dash=String.fromCharCode(0x2014);
 for(const f of ['ugc.mjs','logo.mjs','outreach-video.test.mjs','outreach.mjs','outreach.test.mjs','tools/offerpdf.mjs','runner.mjs','brain.mjs','server.mjs','store.mjs','tools/gmail.mjs','tools/exa.mjs','tools/higgsfield.mjs']){
  assert.ok(!readFileSync(path.join(import.meta.dirname,f),'utf8').includes(dash),`${f} has an em dash`);
 }
});

test('approving a product clip submits the reference photo first, then the video from that photo once it finishes',{timeout:20000},async()=>{
 const store=openStore(':memory:');const subs=[];
 const hfOver={
  approveAndSubmit:async(endpoint,input,key)=>{subs.push({endpoint,input,key});return {request_id:`req${subs.length}`,status:'queued'};},
  status:async id=>id==='req1'?{status:'completed',images:[{url:'https://cdn.example/still.png'}]}:{status:'completed',video:{url:'https://cdn.example/clip.mp4'}},
  download:async(url,dir,name)=>{writeFileSync(path.join(dir,name),'x');return path.join(dir,name);}
 };
 const s=await serve(store,{hf:hfOver});
 try{
  const lead=store.createLead({taskId:null,domain:'gamma.com',company:'Gamma',url:'https://gamma.com/',market:'m',territory:'t'});
  const plan={type:'product_clip',step:'still',hero:{index:0,title:'Jeans',kind:'bottom',imageUrl:'https://cdn.example/jeans.jpg'},profile:{audience:[],style:[]},
   still:{endpoint:endpoints['reference-still'],input:{prompt:'creator wearing the jeans',image_urls:['https://cdn.example/jeans.jpg']},estimate_usd:'0.07',status:'draft'},
   video:{endpoint:endpoints['image-to-video'],input:{prompt:'she turns to the camera',duration:5,resolution:'720p'},estimate_usd:'2.31',status:'draft'}};
  const r=store.createRender({title:'Gamma video',endpoint:plan.still.endpoint,input:plan.still.input,leadId:lead.id,plan});
  store.updateRender(r.id,{status:'checks_passed',estimate_usd:'2.38'});
  const out=await s.post(`/api/renders/${r.id}/approve`,{estimate:'2.38'});
  assert.equal(out.status,200,JSON.stringify(out.body));
  assert.equal(subs.length,1,'only the reference photo is submitted at the click');assert.equal(subs[0].endpoint,endpoints['reference-still']);
  const spent=()=>store.db.prepare("select usd from spend where provider='higgsfield' order by id").all().map(x=>x.usd);
  assert.deepEqual(spent(),[0.07]);
  const deadline=Date.now()+15000;
  while(store.getRender(r.id).status!=='completed'&&Date.now()<deadline)await new Promise(res=>setTimeout(res,200));
  assert.equal(subs.length,2,'the video is submitted once the photo finishes');
  assert.equal(subs[1].endpoint,endpoints['image-to-video']);assert.equal(subs[1].input.image_url,'https://cdn.example/still.png');
  assert.notEqual(subs[0].key,subs[1].key,'each step has its own idempotency key');
  assert.deepEqual(spent(),[0.07,2.31]);
  const done=store.getRender(r.id);assert.equal(done.status,'completed');assert.equal(done.plan.step,'video');assert.equal(done.plan.still.result_url,'https://cdn.example/still.png');
  const again=await s.post(`/api/renders/${r.id}/approve`,{estimate:'2.38'});assert.equal(again.status,409);assert.equal(subs.length,2);
 }finally{await s.close();}
});
