import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {readFileSync,readdirSync} from 'node:fs';
import {openStore} from './store.mjs';
import {createApp} from './server.mjs';
import {createBrowserLive} from './browser-live.mjs';
import {createInstagram,driveDm,hasInstagramSession} from './instagram.mjs';
import {draftReadiness} from './outreach.mjs';
import {FakeCdp,fakePage} from './browser-test-helpers.mjs';

const CLIP='https://cdn.example/clip-1.mp4';
const BODY=`Hi Beta team,\nWe made you a short video.\nP.S. A 5 second video made for Beta: ${CLIP}`;
const env={SOLARI_API_KEY:'test-key'};
const fast=()=>Promise.resolve();

// A fake Instagram page: Message button, composer, bubbles. failAt names a step that breaks.
function fakeIgPage(cdp,{failAt=null,loggedOut=false,noBubble=false,stuck=false}={}){
 const page=fakePage(cdp,{url:'about:blank'});
 page.composer='';page.bubbles=[];page.visited=[];page.typed=[];
 const loc=(over={})=>({first(){return this;},async waitFor(){if(over.fail)throw new Error('timeout');},async click(){if(over.fail)throw new Error('timeout');},async fill(){},async innerText(){return page.composer;}, ...over});
 page.goto=async u=>{page.visited.push(u);page.u=loggedOut?'https://www.instagram.com/accounts/login/':u;if(failAt==='open profile')throw new Error('net::ERR_FAILED');};
 page.getByRole=(role,{name}={})=>{
  if(name==='Message')return loc({fail:failAt==='message'});
  return loc({fail:true});   // "Not now" and the new-thread buttons are absent
 };
 page.locator=()=>loc({fail:failAt==='composer',innerText:async()=>page.composer});
 page.getByText=txt=>loc({fail:noBubble||!page.bubbles.some(b=>b.includes(txt))});
 page.keyboard={
  async insertText(t){if(failAt==='type message')throw new Error(`insertText failed for ${t}`);page.typed.push(t);page.composer+=t;},
  async press(k){if(k==='Shift+Enter'){page.composer+='\n';return;}if(k==='Enter'){if(failAt==='send')throw new Error('press failed');if(!stuck){page.bubbles.push(page.composer);page.composer='';}}}
 };
 return page;
}

// A fake Solari client that records launches and hands out fake pages.
function fakeClient({pageOpts={},storage=null,profiles=[]}={}){
 const c={launches:[],closed:0,saved:[],profiles:[...profiles],created:[],browsers:[]};
 c.profiles_api={
  async list(){return c.profiles;},
  async create({name}){const p={id:`prof-${name}`,name};c.created.push(name);c.profiles.push(p);return p;},
  async save(id,state){c.saved.push({id,state});return {version:1,sizeBytes:1};}
 };
 c.client={
  profiles:c.profiles_api,
  async launch(opts){
   c.launches.push(opts);
   const cdp=new FakeCdp(),page=fakeIgPage(cdp,pageOpts);
   const b={id:`sess-${c.launches.length}`,closedCount:0,page,cdp,context:{storageState:async()=>storage||{cookies:[],origins:[]}},async newPage(){return page;},async close(){b.closedCount++;}};
   c.browsers.push(b);return b;
  },
  async close(){c.closed++;}
 };
 return c;
}

function setup({connected=true,pageOpts,storage,clientOpts}={}){
 const store=openStore(':memory:'),live=createBrowserLive();
 const fc=fakeClient({pageOpts,storage,...clientOpts});
 const ig=createInstagram({store,live,makeClient:async()=>fc.client,env,holdMs:0,sleep:fast});
 if(connected)store.db.prepare("insert into settings(key,value) values('instagram',?)").run(JSON.stringify({profileId:'prof-1',connected:true,savedAt:'2026-10-24T00:00:00.000Z'}));
 return {store,live,fc,ig};
}
function dmDraft(store,{handle='betawear',status='dm_ready',withClip=true,body=BODY}={}){
 const lead=store.createLead({taskId:null,domain:'betawear.com',company:'Beta',url:'https://betawear.com/',market:'m',territory:'t'});
 store.updateLead(lead.id,{instagram_handle:handle});
 const render=store.createRender({title:'clip',endpoint:'e',input:{},leadId:lead.id});
 store.updateRender(render.id,{status:'completed',result_url:CLIP});
 const d=store.addDraft({leadId:lead.id,taskId:null,to:`@${handle}`,subject:'Hi',body,status,channel:'instagram_dm',renderId:withClip?render.id:null});
 return {lead,render,draft:d};
}

test('DM readiness: ready only with Instagram connected, a handle and the clip link in the text',()=>{
 const render={id:3,status:'completed',result_url:CLIP};
 const draft={channel:'instagram_dm',to_email:'@beta',render_id:3,body:BODY,status:'dm_ready'};
 assert.deepEqual(draftReadiness({draft,lead:{},render,instagram:true}),{ready:true,missing:[]});
 assert.deepEqual(draftReadiness({draft,lead:{},render,instagram:false}),{ready:false,missing:['instagram']});
 assert.deepEqual(draftReadiness({draft,lead:{},render:null,instagram:false}),{ready:false,missing:['instagram','clip']});
 assert.deepEqual(draftReadiness({draft:{...draft,body:'no link here'},lead:{},render,instagram:true}).missing,['clip'],'the link has to be in the text');
 assert.deepEqual(draftReadiness({draft:{...draft,to_email:''},lead:{},render,instagram:true}).missing,['handle']);
 assert.deepEqual(draftReadiness({draft:{...draft,to_email:'@bad handle!'},lead:{instagram_handle:'beta.wear'},render,instagram:true}).ready,true,'the lead handle wins');
 assert.equal(draftReadiness({draft:{...draft,status:'sent'},lead:{},render,instagram:true}).ready,false);
 // email rules are untouched
 assert.deepEqual(draftReadiness({draft:{channel:'email',to_email:'a@b.com'},lead:{contact_kind:'personal',domain:'b.com'},render:null}).missing,['clip','pdf','gmail']);
});

test('status is false until a login is saved and never returns cookies',async()=>{
 const {ig}=setup({connected:false});
 assert.deepEqual(ig.status(),{connected:false,profileId:null,savedAt:null});
 const {ig:ig2}=setup();
 assert.deepEqual(Object.keys(ig2.status()).sort(),['connected','profileId','savedAt']);
 assert.equal(ig2.status().connected,true);
 assert.equal(hasInstagramSession({cookies:[{name:'sessionid',domain:'.instagram.com',value:'abc'}]}),true);
 assert.equal(hasInstagramSession({cookies:[{name:'sessionid',domain:'.instagram.com',value:''}]}),false);
 assert.equal(hasInstagramSession({cookies:[{name:'sessionid',domain:'.evil.com',value:'abc'}]}),false);
});

test('connect creates the mint-instagram profile, opens a stealth us-proxy session on the login page and registers it',async()=>{
 const {ig,fc,live,store}=setup({connected:false});
 const out=await ig.connect();
 assert.deepEqual(fc.created,['mint-instagram']);
 const L=fc.launches[0];
 assert.equal(L.stealth,true);assert.equal(L.proxy,'us');assert.equal(L.recording,false);assert.equal(L.profileId,'prof-mint-instagram');
 assert.deepEqual(fc.browsers[0].page.visited,['https://www.instagram.com/accounts/login/']);
 assert.equal(live.list()[0].purpose,'Instagram login');assert.equal(out.sessionId,'sess-1');
 const saved=JSON.parse(store.db.prepare("select value from settings where key='instagram'").get().value);
 assert.equal(saved.profileId,'prof-mint-instagram');assert.ok(!saved.connected,'not connected until the login is saved');
 assert.equal((await ig.connect()).reused,true,'a second press reuses the open login');assert.equal(fc.launches.length,1);
});

test('connect reuses an existing profile by name',async()=>{
 const {ig,fc}=setup({connected:false,clientOpts:{profiles:[{id:'old-1',name:'mint-instagram'}]}});
 await ig.connect();assert.deepEqual(fc.created,[]);assert.equal(fc.launches[0].profileId,'old-1');
});

test('save refuses until Instagram is logged in, then stores the state in the profile and closes the session',async()=>{
 const none=setup({connected:false});
 await assert.rejects(none.ig.save(),e=>e.status===409);
 const out=setup({connected:false});await out.ig.connect();
 await assert.rejects(out.ig.save(),e=>e.status===409&&/not logged in/i.test(e.message));
 assert.equal(out.fc.saved.length,0);assert.equal(out.live.list().length,1,'the session stays open so Ryan can finish');
 const ok=setup({connected:false,storage:{cookies:[{name:'sessionid',domain:'.instagram.com',value:'SECRET-COOKIE'}],origins:[]}});
 await ok.ig.connect();
 const st=await ok.ig.save();
 assert.equal(st.connected,true);assert.equal(st.profileId,'prof-mint-instagram');assert.ok(st.savedAt);
 assert.ok(!JSON.stringify(st).includes('SECRET-COOKIE'));
 assert.equal(ok.fc.saved.length,1);assert.equal(ok.fc.saved[0].id,'prof-mint-instagram');
 assert.equal(ok.fc.browsers[0].closedCount,1);assert.deepEqual(ok.live.list(),[]);
 assert.equal(ok.ig.status().connected,true);
});

test('send-dm refuses without confirm, for email drafts, when not connected, when not ready, and never opens a browser',async()=>{
 const a=setup(),{draft}=dmDraft(a.store);
 await assert.rejects(a.ig.sendDm(draft.id,{}),e=>e.status===400);
 await assert.rejects(a.ig.sendDm(draft.id,{confirm:'yes'}),e=>e.status===400);
 await assert.rejects(a.ig.sendDm(9999,{confirm:true}),e=>e.status===404);
 const email=a.store.addDraft({leadId:draft.lead_id,taskId:null,to:'a@b.com',subject:'s',body:'b',status:'gmail_draft'});
 await assert.rejects(a.ig.sendDm(email.id,{confirm:true}),e=>e.status===409);
 const b=setup({connected:false}),{draft:d2}=dmDraft(b.store);
 await assert.rejects(b.ig.sendDm(d2.id,{confirm:true}),e=>e.status===409&&e.extra.missing.includes('instagram'));
 const c=setup(),{draft:d3}=dmDraft(c.store,{withClip:false});
 await assert.rejects(c.ig.sendDm(d3.id,{confirm:true}),e=>e.status===409&&e.extra.missing.includes('clip'));
 for(const x of [a,b,c])assert.equal(x.fc.launches.length,0);
 assert.equal(a.store.getDraft(draft.id).status,'dm_ready');
});

test('send-dm types the draft, presses Enter, verifies the bubble, marks it sent once, logs it, and closes the session',async()=>{
 const {ig,store,fc,live}=setup(),{draft,lead}=dmDraft(store);
 let seen=null;live.on(c=>{if(c.op==='start')seen=c.session;});
 const out=await ig.sendDm(draft.id,{confirm:true});
 assert.equal(out.draft.status,'sent');assert.equal(store.getDraft(draft.id).status,'sent');assert.equal(store.getLead(lead.id).status,'contacted');
 const L=fc.launches[0];assert.equal(L.profileId,'prof-1');assert.equal(L.stealth,true);assert.equal(L.proxy,'us');assert.equal(L.recording,false);
 assert.equal(seen.purpose,'DM to @betawear');assert.equal(seen.leadId,lead.id);
 const page=fc.browsers[0].page;
 assert.equal(page.visited[0],'https://www.instagram.com/betawear/');
 assert.equal(page.bubbles.length,1);assert.equal(page.bubbles[0],BODY);
 const evs=store.listEvents({leadId:lead.id}).filter(e=>e.tool==='instagram.dm');
 assert.equal(evs.length,1);assert.equal(evs[0].type,'draft');assert.equal(evs[0].title,'DM sent to @betawear');
 await out.closed;
 assert.equal(fc.browsers[0].closedCount,1);assert.deepEqual(live.list(),[]);
 // a second send is refused and nothing is typed again
 await assert.rejects(ig.sendDm(draft.id,{confirm:true}),e=>e.status===409&&/already sent/.test(e.message));
 assert.equal(fc.launches.length,1);assert.equal(page.bubbles.length,1);
 assert.equal(store.listEvents({leadId:lead.id}).filter(e=>e.tool==='instagram.dm').length,1);
});

test('send-dm keeps the session open for the hold time before closing it',async()=>{
 const store=openStore(':memory:'),live=createBrowserLive(),fc=fakeClient();let held=null,release;
 const gate=new Promise(r=>{release=r;});
 const ig=createInstagram({store,live,makeClient:async()=>fc.client,env,holdMs:5000,sleep:ms=>{if(ms===5000){held=ms;return gate;}return Promise.resolve();}});
 store.db.prepare("insert into settings(key,value) values('instagram',?)").run(JSON.stringify({profileId:'p',connected:true}));
 const {draft}=dmDraft(store);
 const out=await ig.sendDm(draft.id,{confirm:true});
 assert.equal(held,5000);assert.equal(fc.browsers[0].closedCount,0,'still open for Ryan to watch');assert.equal(live.list().length,1);
 release();await out.closed;assert.equal(fc.browsers[0].closedCount,1);
});

test('send-dm failure leaves the draft unsent, logs the failing step, and closes the session',async()=>{
 for(const failAt of ['open profile','composer','type message','send']){
  const {ig,store,fc,live}=setup({pageOpts:{failAt}}),{draft,lead}=dmDraft(store);
  await assert.rejects(ig.sendDm(draft.id,{confirm:true}),e=>e.status===502);
  assert.equal(store.getDraft(draft.id).status,'dm_ready',failAt);
  const err=store.listEvents({leadId:lead.id}).find(e=>e.type==='error'&&e.tool==='instagram.dm');
  assert.ok(err,failAt);assert.match(err.title,new RegExp(`failed at ${failAt}`));assert.ok(!err.title.includes('We made you'),'the message text is not logged');
  assert.equal(fc.browsers[0].closedCount,1,failAt);assert.deepEqual(live.list(),[]);
  assert.equal(store.listEvents({leadId:lead.id}).filter(e=>e.type==='draft').length,0);
 }
});

test('send-dm: a message that never appears as a bubble is not marked sent',async()=>{
 const a=setup({pageOpts:{noBubble:true}}),x=dmDraft(a.store);
 await assert.rejects(a.ig.sendDm(x.draft.id,{confirm:true}),e=>e.status===502&&e.extra.step==='verify');
 assert.equal(a.store.getDraft(x.draft.id).status,'dm_ready');
 const b=setup({pageOpts:{stuck:true}}),y=dmDraft(b.store);
 await assert.rejects(b.ig.sendDm(y.draft.id,{confirm:true}),e=>e.extra.step==='verify');
 assert.equal(b.store.getDraft(y.draft.id).status,'dm_ready');
});

test('send-dm: a logged-out Instagram marks it disconnected so the UI asks to reconnect',async()=>{
 const {ig,store}=setup({pageOpts:{loggedOut:true}}),{draft}=dmDraft(store);
 await assert.rejects(ig.sendDm(draft.id,{confirm:true}),e=>e.status===502);
 assert.equal(ig.status().connected,false);assert.equal(store.getDraft(draft.id).status,'dm_ready');
});

test('send-dm: two clicks at once send exactly once',async()=>{
 const {ig,store,fc}=setup(),{draft}=dmDraft(store);
 const [a,b]=await Promise.allSettled([ig.sendDm(draft.id,{confirm:true}),ig.sendDm(draft.id,{confirm:true})]);
 assert.equal([a,b].filter(x=>x.status==='fulfilled').length,1);
 assert.equal([a,b].find(x=>x.status==='rejected').reason.status,409);
 assert.equal(fc.launches.length,1);assert.equal(fc.browsers[0].page.bubbles.length,1);
});

test('the message body never reaches an event or error even if the browser error echoes it',async()=>{
 const {ig,store,fc}=setup({pageOpts:{failAt:'type message'}}),{draft,lead}=dmDraft(store);
 const err=await ig.sendDm(draft.id,{confirm:true}).catch(e=>e);
 const text=JSON.stringify([err.message,store.listEvents({leadId:lead.id})]);
 for(const frag of ['We made you','Hi Beta team',CLIP])assert.ok(!text.includes(frag),frag);
 assert.ok(fc.browsers[0].page.typed.length>=0);
});

test('driveDm opens the profile, types line by line with Shift+Enter, and sends once',async()=>{
 const page=fakeIgPage(new FakeCdp());
 await driveDm(page,{handle:'abc',text:'one\ntwo',sleep:fast});
 assert.deepEqual(page.typed,['one','two']);assert.deepEqual(page.bubbles,['one\ntwo']);assert.equal(page.visited[0],'https://www.instagram.com/abc/');
});

async function serve(over={}){
 const store=openStore(':memory:'),live=createBrowserLive(),fc=fakeClient();
 const instagram=createInstagram({store,live,makeClient:async()=>fc.client,env,holdMs:0,sleep:fast});
 const server=http.createServer(createApp({store,runner:{start(){},control(){},steer(){},isRunning:()=>false},browserLive:live,instagram}));
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base=`http://127.0.0.1:${server.address().port}`;
 const call=(m,p,b)=>fetch(base+p,{method:m,headers:{'Content-Type':'application/json'},body:m==='POST'?JSON.stringify(b||{}):undefined}).then(async r=>({status:r.status,body:await r.json().catch(()=>null)}));
 return {store,live,fc,instagram,call,base,close:()=>{server.closeAllConnections?.();return new Promise(r=>server.close(r));}};
}

test('routes: sessions list, control, input, close and the DM send round trip over HTTP',async()=>{
 const s=await serve();
 try{
  assert.deepEqual((await s.call('GET','/api/browser/sessions')).body,[]);
  assert.deepEqual((await s.call('GET','/api/instagram/status')).body,{connected:false,profileId:null,savedAt:null});
  const cdp=new FakeCdp();await s.live.register({id:'v1',purpose:'Visiting acme.com',page:fakePage(cdp),cdp});
  const list=(await s.call('GET','/api/browser/sessions')).body;
  assert.equal(list.length,1);assert.deepEqual(Object.keys(list[0]).sort(),['control','hasFrame','id','leadId','purpose','startedAt','title','url'].sort());
  assert.equal((await s.call('POST','/api/browser/v1/input',{type:'type',text:'x'})).status,409);
  assert.equal((await s.call('POST','/api/browser/v1/control',{on:true})).body.session.control,true);
  assert.equal((await s.call('POST','/api/browser/v1/input',{type:'type',text:'x'})).status,200);
  assert.equal((await s.call('POST','/api/browser/v1/close',{})).status,200);
  assert.deepEqual((await s.call('GET','/api/browser/sessions')).body,[]);
  // DM: refused while Instagram is not connected, readiness comes back on the drafts list
  const {draft}=dmDraft(s.store);
  const drafts=(await s.call('GET','/api/drafts')).body.drafts;
  assert.deepEqual(drafts.find(d=>d.id===draft.id).readiness,{ready:false,missing:['instagram']});
  const no=await s.call('POST',`/api/drafts/${draft.id}/send-dm`,{confirm:true});assert.equal(no.status,409);assert.deepEqual(no.body.missing,['instagram']);
  s.store.db.prepare("insert into settings(key,value) values('instagram',?)").run(JSON.stringify({profileId:'p',connected:true}));
  assert.equal((await s.call('POST',`/api/drafts/${draft.id}/send-dm`,{})).status,400);
  const ok=await s.call('POST',`/api/drafts/${draft.id}/send-dm`,{confirm:true});
  assert.equal(ok.status,200);assert.equal(ok.body.draft.status,'sent');assert.equal(ok.body.draft.readiness.ready,false);
  assert.equal((await s.call('POST',`/api/drafts/${draft.id}/send-dm`,{confirm:true})).status,409);
  assert.equal(s.fc.browsers.length,1);
 }finally{await s.close();}
});

test('the SSE stream announces browser sessions starting, changing and ending',async()=>{
 const s=await serve();
 try{
  // Node sends the stream's headers with its first write, so open it, give it a moment to subscribe, then cause the events.
  const opening=fetch(`${s.base}/api/stream`);await new Promise(r=>setTimeout(r,100));
  const cdp=new FakeCdp();await s.live.register({id:'v9',purpose:'Visiting x.com',page:fakePage(cdp),cdp});
  const res=await opening;const reader=res.body.getReader();const dec=new TextDecoder();let buf='';
  const next=async re=>{for(let i=0;i<40&&!re.test(buf);i++){const {value}=await reader.read();buf+=dec.decode(value);}return re.test(buf);};
  assert.ok(await next(/"kind":"browser","op":"start"[^\n]*"id":"v9"/));
  await s.live.unregister('v9');
  assert.ok(await next(/"kind":"browser","op":"end","id":"v9"/));
  await reader.cancel();
 }finally{await s.close();}
});

// Nothing but Ryan's click may send a DM. The runner, autopilot, whopwatch, the requalifier, the assistant and brand ideation never touch it.
test('nothing else in the codebase can call send-dm or sendDm',()=>{
 const here=new URL('./',import.meta.url);
 const allowed={'send-dm':new Set(['server.mjs','instagram.mjs','browser-live.mjs','public/app.js']),'sendDm':new Set(['server.mjs','instagram.mjs'])};
 const files=[...readdirSync(here).filter(f=>/\.(mjs|js)$/.test(f)&&!/\.test\.mjs$/.test(f)&&f!=='browser-test-helpers.mjs'),...readdirSync(new URL('./tools/',here)).map(f=>`tools/${f}`).filter(f=>/\.(mjs|js)$/.test(f)),...readdirSync(new URL('./public/',here)).filter(f=>f.endsWith('.js')).map(f=>`public/${f}`)];
 for(const f of files){
  const text=readFileSync(new URL(f,here),'utf8');
  for(const [needle,ok] of Object.entries(allowed))if(text.includes(needle))assert.ok(ok.has(f),`${f} must not reference ${needle}`);
 }
 // the runner family specifically
 for(const f of ['runner.mjs','autopilot.mjs','whopwatch.mjs','quality.mjs','assistant.mjs','brand-ideation.mjs','sentwatch.mjs']){
  const text=readFileSync(new URL(f,here),'utf8');assert.ok(!/send-dm|sendDm|instagram\.mjs/.test(text),f);
 }
 const app=readFileSync(new URL('public/app.js',here),'utf8');
 assert.equal((app.match(/send-dm/g)||[]).length,1,'one call site, the drawer send button');
});
