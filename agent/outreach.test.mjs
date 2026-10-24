import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import zlib from 'node:zlib';
import {tmpdir} from 'node:os';
import path from 'node:path';

// No network and no real email: Gmail, Higgsfield and Exa are stubs, and the data folder is a temp dir.
const tmp=mkdtempSync(path.join(tmpdir(),'outreach-'));
process.env.AGENT_DATA_DIR=tmp;delete process.env.EXA_API_KEY;
const {PDFDocument,PDFName,StandardFonts}=await import('pdf-lib');
const {openStore}=await import('./store.mjs');
const {createApp}=await import('./server.mjs');
const {draftReadiness}=await import('./outreach.mjs');
const {personalizeOffer,buildLeadOffer,previewPage,offerFile}=await import('./tools/offerpdf.mjs');
const gmailTools=await import('./tools/gmail.mjs');
const {assistantTools}=await import('./assistant.mjs');

const renderDir=path.join(tmp,'renders');mkdirSync(renderDir,{recursive:true});
// The real base PDF is gitignored. This stand-in has the same two pages, with "Hey everyone," where the original has it.
const baseFile=path.join(tmp,'offer','base-v3.pdf');
mkdirSync(path.dirname(baseFile),{recursive:true});
{const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica);
 pdf.addPage([612,792]).drawText('Hey everyone,',{x:54,y:676,size:11,font});
 pdf.addPage([612,792]).drawText('We will create 10 ads',{x:54,y:700,size:20,font});
 writeFileSync(baseFile,await pdf.save());}
const baseBytes=readFileSync(baseFile);
// A real 4x4 red PNG, encoded here so the test needs no binary fixture.
const png=(()=>{
 const chunk=(type,data)=>{const len=Buffer.alloc(4);len.writeUInt32BE(data.length);const body=Buffer.concat([Buffer.from(type),data]);const crc=Buffer.alloc(4);crc.writeUInt32BE(zlib.crc32(body)>>>0);return Buffer.concat([len,body,crc]);};
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(4,0);ihdr.writeUInt32BE(4,4);ihdr[8]=8;ihdr[9]=2;
 const row=Buffer.concat([Buffer.from([0]),Buffer.from(Array.from({length:4},()=>[200,0,0]).flat())]);
 return Buffer.concat([Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(Buffer.concat([row,row,row,row]))),chunk('IEND',Buffer.alloc(0))]);
})();
const text=(file,page)=>execFileSync('pdftotext',['-f',String(page),'-l',String(page),'-layout',file,'-'],{encoding:'utf8'});
const inTmp=(name,bytes)=>{const f=path.join(tmp,name);writeFileSync(f,bytes);return f;};
const annots=async(bytes,pageIndex)=>{const pdf=await PDFDocument.load(bytes);const a=pdf.getPage(pageIndex).node.lookup(PDFName.of('Annots'));return a?a.asArray().map(r=>pdf.context.lookup(r)):[];};

test('personalizeOffer keeps 2 pages, greets by name, and draws the logo and a clickable clip link',async()=>{
 const url='https://cdn.example/render-7.mp4';
 const out=await personalizeOffer({base:baseBytes,company:'Alpha Wear',greetingName:'Jordan',logo:{bytes:png,mime:'image/png'},clip:{url,still:null}});
 assert.equal(out.subarray(0,5).toString(),'%PDF-');
 const doc=await PDFDocument.load(out);assert.equal(doc.getPageCount(),2);
 assert.deepEqual([doc.getPage(0).getWidth(),doc.getPage(0).getHeight()],[612,792]);
 const f=inTmp('a.pdf',out);
 assert.match(text(f,1),/Hey Jordan,/);
 assert.match(text(f,2),/We made this 5 second clip for Alpha Wear:/);assert.match(text(f,2),/cdn\.example\/render-7\.mp4/);
 const links=await annots(out,1);
 assert.ok(links.length>=1);
 const uri=links[0].lookup(PDFName.of('A')).lookup(PDFName.of('URI')).decodeText();
 assert.equal(uri,url);
 assert.equal(links[0].lookup(PDFName.of('Subtype')).toString(),'/Link');
 assert.ok(out.length>baseBytes.length,'the logo image is embedded');
});

test('without a name the greeting uses the company team; without a clip page 2 is untouched; without a logo the X area stays white',async()=>{
 const out=await personalizeOffer({base:baseBytes,company:'Alpha Wear',logo:null,clip:null});
 const f=inTmp('b.pdf',out);
 assert.match(text(f,1),/Hey Alpha Wear team,/);
 assert.ok(!/clip for/.test(text(f,2)));assert.equal((await annots(out,1)).length,0);
 for(const bad of ['javascript:alert(1)','not a url','file:///etc/passwd']){
  const o=await personalizeOffer({base:baseBytes,company:'X',clip:{url:bad,still:null}});
  assert.ok(!/clip for/.test(text(inTmp('c.pdf',o),2)),`${bad} is not linked`);
 }
});

test('SVG logos render into the PDF; other raster formats use sips and unreadable logos are skipped',async()=>{
 const svg=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="60"><rect width="120" height="60" fill="#c00"/></svg>');
 const plain=await personalizeOffer({base:baseBytes,company:'S',logo:null});
 const out=await personalizeOffer({base:baseBytes,company:'S',logo:{bytes:svg,mime:'image/svg+xml'}});
 if(process.platform==='darwin')assert.ok(out.length>plain.length,'the converted svg is embedded');
 const bad=await personalizeOffer({base:baseBytes,company:'S',logo:{bytes:Buffer.from('garbage'),mime:'image/webp'}});
 assert.equal((await PDFDocument.load(bad)).getPageCount(),2);
 const odd=await personalizeOffer({base:baseBytes,company:'Café 東京',greetingName:'Zoë 東'});
 assert.match(text(inTmp('d.pdf',odd),1),/Hey Zoë,/,'characters Helvetica cannot encode are dropped instead of throwing');
});

test('buildLeadOffer caches by lead and render and regenerates when an input changes',async()=>{
 const dir=path.join(tmp,'offer','leads');
 const args={baseFile,dir,leadId:5,renderId:9,company:'Alpha',greetingName:'Sam',logo:{bytes:png,mime:'image/png'},clip:{url:'https://cdn.example/a.mp4',still:null}};
 const one=await buildLeadOffer(args);
 assert.equal(one.file,offerFile(dir,5,9));assert.ok(one.file.endsWith('5-9.pdf'));assert.equal(one.cached,false);assert.equal(one.name,'alpha-offer.pdf');
 assert.equal((await buildLeadOffer(args)).cached,true);
 assert.equal((await buildLeadOffer({...args,company:'Alpha Two'})).cached,false);
 assert.equal((await buildLeadOffer({...args,company:'Alpha Two',clip:{url:'https://cdn.example/b.mp4',still:null}})).cached,false);
 const none=await buildLeadOffer({...args,renderId:null,clip:null});assert.ok(none.file.endsWith('5-none.pdf'));
 await assert.rejects(buildLeadOffer({...args,baseFile:path.join(tmp,'nope.pdf')}),/base offer PDF is missing/);
 const p1=previewPage(none.file,1);assert.equal(p1.subarray(1,4).toString(),'PNG');
 assert.ok(existsSync(none.file.replace(/\.pdf$/,'.p1.png')));
 assert.throws(()=>previewPage(none.file,3),/Page is 1 or 2/);
});

test('buildMime takes a list of attachments and still takes the single attachment',()=>{
 const a=Buffer.alloc(100,1),b=Buffer.alloc(100,2);
 const mime=gmailTools.buildMime({from:'a@b.co',to:'x@y.co',subject:'Hi',body:'Body',attachments:[{filename:'offer.pdf',mime:'application/pdf',data:a},{filename:'v.mp4',mime:'video/mp4',data:b}]});
 const boundary=mime.match(/boundary="([^"]+)"/)[1];
 assert.equal(mime.split(`--${boundary}`).length,5,'text part, two files, and the closing marker');
 assert.match(mime,/Content-Type: application\/pdf; name="offer\.pdf"/);assert.match(mime,/Content-Type: video\/mp4; name="v\.mp4"/);
 const single=gmailTools.buildMime({from:'a@b.co',to:'x@y.co',subject:'Hi',body:'Body',attachment:{filename:'v.mp4',mime:'video/mp4',data:b}});
 assert.equal(single.split(`--${single.match(/boundary="([^"]+)"/)[1]}`).length,4);
 assert.throws(()=>gmailTools.buildMime({from:'a',to:'x@y.z',subject:'s',body:'b',attachments:[{filename:'ok.pdf',mime:'application/pdf',data:a},{filename:'bad"\r\nX: y',mime:'application/pdf',data:a}]}),/injection/);
 assert.throws(()=>gmailTools.buildMime({from:'a',to:'x@y.z',subject:'s',body:'b',attachments:[{filename:'ok.pdf',mime:'application/pdf',data:'not a buffer'}]}),/Buffer/);
});

test('sendDraft posts {id} to drafts/send and returns the message and thread ids',async()=>{
 const tokenFile=inTmp('token.json',JSON.stringify({client_id:'c',client_secret:'s',refresh_token:'r',token_uri:'https://oauth.test/token'}));
 const keep={fetch:globalThis.fetch,token:process.env.GMAIL_TOKEN_PATH,acct:process.env.GMAIL_DRAFT_ACCOUNT};
 process.env.GMAIL_TOKEN_PATH=tokenFile;process.env.GMAIL_DRAFT_ACCOUNT='me@test.co';
 const seen=[];
 globalThis.fetch=async(u,init={})=>{
  seen.push({url:String(u),method:init.method||'GET',body:init.body});
  if(String(u).startsWith('https://oauth.test'))return new Response(JSON.stringify({access_token:'t',expires_in:3600}),{status:200});
  if(String(u).endsWith('/profile'))return new Response(JSON.stringify({emailAddress:'me@test.co'}),{status:200});
  if(String(u).endsWith('/drafts/send'))return new Response(JSON.stringify({id:'msg1',threadId:'thr1'}),{status:200});
  return new Response('{}',{status:404});
 };
 try{
  assert.deepEqual(await gmailTools.sendDraft('r-123_abc'),{messageId:'msg1',threadId:'thr1'});
  const post=seen.find(x=>x.url.endsWith('/drafts/send'));
  assert.equal(post.method,'POST');assert.deepEqual(JSON.parse(post.body),{id:'r-123_abc'});
  await assert.rejects(gmailTools.sendDraft('../evil'),/Invalid Gmail draft id/);
 }finally{
  globalThis.fetch=keep.fetch;
  for(const [k,v] of [['GMAIL_TOKEN_PATH',keep.token],['GMAIL_DRAFT_ACCOUNT',keep.acct]])if(v===undefined)delete process.env[k];else process.env[k]=v;
 }
});

const pdfMeta=[{kind:'offer_pdf',filename:'alpha-offer.pdf',mime:'application/pdf',bytes:100}];
const base={draft:{channel:'email',to_email:'jane@alpha.com',render_id:3,gmail_draft_id:'g1',status:'gmail_draft',attachments:pdfMeta},lead:{domain:'alpha.com',contact_kind:'personal',contact_name:'Jane Doe'},render:{id:3,status:'completed',result_url:'https://cdn.example/3.mp4'}};
const ready=over=>draftReadiness({draft:{...base.draft,...over.draft},lead:{...base.lead,...over.lead},render:'render' in over?over.render:base.render});

test('draftReadiness is ready only with a personal email, a linked clip, the PDF and a Gmail draft',()=>{
 assert.deepEqual(ready({}),{ready:true,missing:[]});
 assert.deepEqual(ready({draft:{to_email:'info@alpha.com'}}),{ready:false,missing:['email']},'role inbox');
 assert.deepEqual(ready({draft:{to_email:'support@alpha.com'}}).missing,['email']);
 assert.deepEqual(ready({draft:{channel:'instagram_dm',to_email:'@alpha'}}).missing,['instagram','clip'],'a DM needs Instagram connected and the clip link in its text');
 assert.deepEqual(ready({lead:{contact_kind:'role'}}).missing,['email']);
 assert.deepEqual(ready({lead:{contact_kind:null}}).missing,['email']);
 assert.deepEqual(ready({render:null}).missing,['clip']);
 assert.deepEqual(ready({render:{id:3,status:'completed',result_url:null}}).missing,['clip'],'no result url');
 assert.deepEqual(ready({render:{id:3,status:'in_progress',result_url:'https://x.co/a.mp4'}}).missing,['clip'],'not completed');
 assert.deepEqual(ready({render:{id:4,status:'completed',result_url:'https://x.co/a.mp4'}}).missing,['clip'],'a render the draft is not linked to');
 assert.deepEqual(ready({draft:{attachments:[]}}).missing,['pdf']);
 assert.deepEqual(ready({draft:{attachments:[{kind:'video',filename:'v.mp4',mime:'video/mp4'}]}}).missing,['pdf'],'a video alone is not the offer');
 assert.deepEqual(ready({draft:{gmail_draft_id:null}}).missing,['gmail']);
 assert.deepEqual(ready({draft:{channel:'instagram_dm',to_email:'@a',render_id:null,gmail_draft_id:null,attachments:[]},render:null}),{ready:false,missing:['instagram','clip']});
 assert.equal(ready({draft:{status:'sent'}}).ready,false,'a sent draft is never ready');
 assert.deepEqual(ready({draft:{status:'sent'}}).missing,[]);
});

async function serve(store){
 const sent=[];
 const gmailApi={...gmailTools,gmailEnabled:()=>true,sendDraft:async id=>{sent.push(id);return {messageId:`m-${id}`,threadId:'t'};},createDraft:async()=>{throw Error('unused');},updateDraft:async()=>{throw Error('unused');}};
 const offlineNet={fetchImpl:async()=>{throw Error('offline');},exaImages:async()=>null};
 const server=http.createServer(createApp({store,runner:{start(){},control(){},steer(){},isRunning:()=>false},gmailApi,logoNet:offlineNet}));
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base=`http://127.0.0.1:${server.address().port}`;
 const call=(method,p,b)=>fetch(base+p,{method,headers:{'Content-Type':'application/json'},body:method==='POST'?JSON.stringify(b||{}):undefined});
 return {sent,close:()=>new Promise(r=>server.close(r)),
  post:(p,b)=>call('POST',p,b).then(async r=>({status:r.status,body:await r.json()})),
  get:p=>call('GET',p).then(async r=>({status:r.status,body:await r.json()})),raw:p=>call('GET',p)};
}
function readyDraft(store,{email='jane@alpha.com',kind='personal',domain='alpha.com',pdf=true}={}){
 const lead=store.createLead({taskId:null,domain,company:'Alpha',url:`https://${domain}/`,market:'m',territory:'t'});
 store.updateLead(lead.id,{status:'drafted',contact_kind:kind,contact_name:'Jane Doe'});
 const render=store.createRender({title:'Alpha video',endpoint:'x',input:{prompt:'p'},leadId:lead.id});
 writeFileSync(path.join(renderDir,`render-${render.id}.mp4`),'not a real video');
 store.updateRender(render.id,{status:'completed',local_file:`render-${render.id}.mp4`,result_url:`https://cdn.example/render-${render.id}.mp4`,review:'approved'});
 const draft=store.addDraft({leadId:lead.id,taskId:null,to:email,subject:'Hi Alpha',body:'Hello',status:'gmail_draft',gmailDraftId:'gd1',gmailUrl:'https://mail.google.com/x',renderId:render.id,attachments:pdf?pdfMeta:[]});
 return {lead,render,draft};
}

test('drafts carry readiness in GET /api/drafts, /api/leads/:id and /api/tasks/:id',async()=>{
 const store=openStore(':memory:');const s=await serve(store);
 try{
  const task=store.createTask('find brands');
  const {lead,draft}=readyDraft(store);
  store.db.prepare('update leads set task_id=? where id=?').run(task.id,lead.id);store.db.prepare('update drafts set task_id=? where id=?').run(task.id,draft.id);
  const role=readyDraft(store,{email:'info@beta.com',domain:'beta.com'});
  const all=await s.get('/api/drafts');
  assert.deepEqual(all.body.drafts.find(d=>d.id===draft.id).readiness,{ready:true,missing:[]});
  assert.deepEqual(all.body.drafts.find(d=>d.id===role.draft.id).readiness,{ready:false,missing:['email']});
  assert.deepEqual(all.body.drafts.find(d=>d.id===draft.id).attachments,pdfMeta);
  assert.deepEqual((await s.get(`/api/leads/${lead.id}`)).body.drafts[0].readiness,{ready:true,missing:[]});
  assert.deepEqual((await s.get(`/api/tasks/${task.id}`)).body.drafts[0].readiness,{ready:true,missing:[]});
 }finally{await s.close();}
});

test('POST /api/drafts/:id/send: 400 without confirm, 409 with missing, 200 sends exactly once, a second send is refused',async()=>{
 const store=openStore(':memory:');const s=await serve(store);
 try{
  const {lead,draft}=readyDraft(store);
  const none=await s.post('/api/drafts/9999/send',{confirm:true});assert.equal(none.status,404);
  for(const body of [{},{confirm:'yes'},{confirm:false}]){const r=await s.post(`/api/drafts/${draft.id}/send`,body);assert.equal(r.status,400,JSON.stringify(body));}
  assert.equal(s.sent.length,0,'nothing is sent without confirm');
  // each missing piece blocks the send and is named
  const role=readyDraft(store,{email:'info@beta.com',domain:'beta.com'});
  const blocked=await s.post(`/api/drafts/${role.draft.id}/send`,{confirm:true});
  assert.equal(blocked.status,409);assert.deepEqual(blocked.body.missing,['email']);
  const nopdf=readyDraft(store,{domain:'gamma.com',email:'jane@gamma.com',pdf:false});
  const b2=await s.post(`/api/drafts/${nopdf.draft.id}/send`,{confirm:true});assert.equal(b2.status,409);assert.deepEqual(b2.body.missing,['pdf']);
  const dm=store.createLead({taskId:null,domain:'dm.com',company:'DM',url:'https://dm.com/',market:'m',territory:'t'});
  const dmDraft=store.addDraft({leadId:dm.id,taskId:null,to:'@dm',subject:'Hi',body:'x',status:'dm_ready',channel:'instagram_dm'});
  const b3=await s.post(`/api/drafts/${dmDraft.id}/send`,{confirm:true});assert.equal(b3.status,409);assert.deepEqual(b3.body.missing,['instagram','clip']);
  assert.equal(s.sent.length,0);
  // the ready draft goes out once
  const ok=await s.post(`/api/drafts/${draft.id}/send`,{confirm:true});
  assert.equal(ok.status,200);assert.deepEqual(s.sent,['gd1']);
  assert.equal(ok.body.messageId,'m-gd1');assert.equal(ok.body.draft.status,'sent');assert.equal(ok.body.draft.readiness.ready,false);
  assert.equal(store.getDraft(draft.id).status,'sent');assert.equal(store.getLead(lead.id).status,'contacted');
  const ev=store.listEvents({leadId:lead.id}).find(e=>e.tool==='gmail.send');
  assert.ok(ev);assert.equal(ev.type,'draft');assert.equal(ev.title,'Sent to jane@alpha.com');
  const again=await s.post(`/api/drafts/${draft.id}/send`,{confirm:true});
  assert.equal(again.status,409);assert.match(again.body.error,/already sent/);assert.equal(s.sent.length,1,'the second click sends nothing');
 }finally{await s.close();}
});

test('a Gmail failure on send marks nothing as sent and can be retried; two clicks at once send once',async()=>{
 const store=openStore(':memory:');
 const calls=[];let fail=true,release;
 const gate=new Promise(r=>{release=r;});
 const gmailApi={...gmailTools,gmailEnabled:()=>true,sendDraft:async id=>{calls.push(id);if(fail)throw Error('quota');await gate;return {messageId:'m',threadId:'t'};}};
 const server=http.createServer(createApp({store,runner:{start(){},control(){},steer(){},isRunning:()=>false},gmailApi}));
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const url=`http://127.0.0.1:${server.address().port}`;
 const post=id=>fetch(`${url}/api/drafts/${id}/send`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({confirm:true})}).then(async r=>({status:r.status,body:await r.json()}));
 try{
  const {draft,lead}=readyDraft(store);
  const bad=await post(draft.id);assert.equal(bad.status,502);assert.equal(store.getDraft(draft.id).status,'gmail_draft');
  assert.ok(store.listEvents({leadId:lead.id}).some(e=>e.type==='error'&&/Sending to jane@alpha.com failed/.test(e.title)));
  fail=false;
  const first=post(draft.id);
  await new Promise(r=>setTimeout(r,50));
  const second=await post(draft.id);assert.equal(second.status,409);assert.match(second.body.error,/already being sent/);
  release();assert.equal((await first).status,200);
  assert.equal(calls.length,2,'one failed attempt and one real send');
 }finally{await new Promise(r=>server.close(r));}
});

test('GET /api/leads/:id/offer.pdf and offer/:page.png serve the personalized offer for the lead and its current render',async()=>{
 const store=openStore(':memory:');const s=await serve(store);
 try{
  const {lead,render}=readyDraft(store);
  const res=await s.raw(`/api/leads/${lead.id}/offer.pdf`);
  assert.equal(res.status,200);assert.equal(res.headers.get('content-type'),'application/pdf');assert.match(res.headers.get('content-disposition'),/^inline;/);
  const bytes=Buffer.from(await res.arrayBuffer());
  assert.equal((await PDFDocument.load(bytes)).getPageCount(),2);
  const f=inTmp('route.pdf',bytes);assert.match(text(f,1),/Hey Jane,/);assert.match(text(f,2),new RegExp(`render-${render.id}\\.mp4`));
  assert.ok(existsSync(offerFile(path.join(tmp,'offer','leads'),lead.id,render.id)),'cached as <leadId>-<renderId>.pdf');
  for(const page of [1,2]){const png=await s.raw(`/api/leads/${lead.id}/offer/${page}.png`);assert.equal(png.status,200);assert.equal(png.headers.get('content-type'),'image/png');assert.equal(Buffer.from(await png.arrayBuffer()).subarray(1,4).toString(),'PNG');}
  assert.equal((await s.raw(`/api/leads/${lead.id}/offer/3.png`)).status,404);
  assert.equal((await s.raw('/api/leads/9999/offer.pdf')).status,404);
  const bare=store.createLead({taskId:null,domain:'bare.com',company:'Bare',url:'https://bare.com/',market:'m',territory:'t'});
  const none=Buffer.from(await (await s.raw(`/api/leads/${bare.id}/offer.pdf`)).arrayBuffer());
  assert.match(text(inTmp('none.pdf',none),1),/Hey Bare team,/);assert.ok(!/clip for/.test(text(inTmp('none.pdf',none),2)));
  assert.ok(existsSync(offerFile(path.join(tmp,'offer','leads'),bare.id,null)));
 }finally{await s.close();}
});

test('nothing but the send route can send: the assistant has no send tool and no background module touches sendDraft',()=>{
 const names=assistantTools.map(t=>t.name);
 assert.ok(names.length>0);
 assert.ok(!names.some(n=>/send|gmail|email|mail/i.test(n)),`assistant tools: ${names.join(', ')}`);
 const here=import.meta.dirname,pattern=/sendDraft|drafts\/send|gmail\.send/;
 for(const f of ['runner.mjs','autopilot.mjs','whopwatch.mjs','quality.mjs','assistant.mjs','sentwatch.mjs','ugc.mjs','brain.mjs','costs.mjs','connections.mjs','production-research.mjs','storyboard.mjs','voicecheck.mjs','outreach.mjs','contacts.mjs','tools/offerpdf.mjs']){
  assert.ok(!pattern.test(readFileSync(path.join(here,f),'utf8')),`${f} must not be able to send`);
 }
 const server=readFileSync(path.join(here,'server.mjs'),'utf8');
 assert.equal(server.match(/\.sendDraft\(/g).length,1,'the server has exactly one send call');
 assert.match(server,/\['POST',\/\^\\\/api\\\/drafts\\\/\(\\d\+\)\\\/send\$\/,[\s\S]{0,1500}gmailApi\.sendDraft\(/,'and it sits in the send route');
});

test('no em dash character in the offer code',()=>{
 const dash=String.fromCharCode(0x2014);
 for(const f of ['outreach.mjs','outreach.test.mjs','tools/offerpdf.mjs','tools/gmail.mjs','server.mjs','store.mjs','outreach-video.test.mjs'])
  assert.ok(!readFileSync(path.join(import.meta.dirname,f),'utf8').includes(dash),`${f} has an em dash`);
});
