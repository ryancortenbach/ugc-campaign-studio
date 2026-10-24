import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {openStore} from './store.mjs';
import {createRunner} from './runner.mjs';
import {rulesPlan,cleanCopy} from './brain.mjs';
import {extractEmails,bestEmail} from './tools/site.mjs';
import {buildMime} from './tools/gmail.mjs';
import {buildInput,priceFrom,shotsFromStoryboard} from './tools/higgsfield.mjs';
import http from 'node:http';
import {createApp} from './server.mjs';

const page=(domain,email)=>({via:'fake',sessionId:null,screenshot:null,domain,socials:email?{instagram:`https://www.instagram.com/${domain.split('.')[0]}/`}:{tiktok:`https://www.tiktok.com/@${domain.split('.')[0]}`},pages:[{url:`https://${domain}/`,title:domain,chars:100}],homeText:'Shop new arrivals',contactText:'',emails:email?[{email,sourceUrl:`https://${domain}/contact`,excerpt:`write to ${email}`}]:[],best:email?{email,sourceUrl:`https://${domain}/contact`,excerpt:`write to ${email}`}:null});
function fakeTools(over={}){
 const calls={drafts:[],sends:0};
 const tools={
  calls,
  loadProfile:()=>({senderName:'Ryan',company:'Mint Labs',offer:'AI UGC',senderFact:'x',cta:'y',rules:'z'}),
  brainMode:()=>'fake',exaMode:()=>'rest',siteMode:()=>'solari',gmailEnabled:()=>true,draftAccount:()=>'rmc2249@columbia.edu',
  plan:async()=>({data:{reply:'ok',markets:['streetwear'],territories:['Brooklyn'],maxDrafts:2,qualify:'sells online',exclusions:[],searchQueries:[{query:'q1',market:'streetwear',territory:'Brooklyn'},{query:'q2',market:'streetwear',territory:'Queens'}]},cost:0.001,model:'fake'}),
  search:async q=>({via:'fake exa',costUsd:0.007,requestId:'r',results:q==='q1'?[{title:'Alpha | Shop',url:'https://alpha.com/x',text:'a'},{title:'Amazon',url:'https://www.amazon.com/y',text:''},{title:'NoMail',url:'https://nomail.com/',text:''},{title:'Beta',url:'https://beta.com/',text:''}]:[{title:'Gamma',url:'https://gamma.com/',text:''}]}),
  visit:async url=>{const d=new URL(url).hostname;return page(d,d==='nomail.com'?null:`sam.lee@${d}`);},
  logo:async()=>({ok:true,checked:true,cost:0,logo:{checked:true,isRealLogo:true,matchesBrand:true,quality:90,reason:'fake'}}),
  value:async()=>({data:{valueScore:90,verdict:'keep',reason:'established brand'},cost:0.0001,model:'fake'}),
  score:async({lead,visit})=>({data:{company:lead.company,fitScore:80,decision:'pursue',reasons:['good'],risks:[],personalDetail:'detail'},cost:0.0001,model:'fake'}),
  draft:async({graded})=>({data:{subject:`Hi ${graded.company}`,body:'Body'},cost:0.001,model:'fake'}),
  createDraft:async d=>{calls.drafts.push(d);return {draftId:'d1',messageId:'m1',url:'https://mail.google.com/x'};},
  steer:async({currentPlan})=>({data:{reply:'stopping',action:'stop',plan:currentPlan,skipDomains:[]},cost:0,model:'fake'}),
  ...over
 };
 return tools;
}

test('runner finds leads, skips marketplaces and no-email sites, drafts up to the limit',async()=>{
 const store=openStore(':memory:');const tools=fakeTools();const runner=createRunner(store,tools);
 const t=runner.start('find streetwear brands in Brooklyn');await runner.wait(t.id);
 const task=store.getTask(t.id);
 assert.equal(task.status,'done');
 assert.equal(tools.calls.drafts.length,2);
 assert.deepEqual(tools.calls.drafts.map(d=>d.to),['sam.lee@alpha.com','sam.lee@beta.com']);
 const leads=store.listLeads({taskId:t.id});
 assert.ok(!leads.some(l=>l.domain==='amazon.com'));
 assert.equal(leads.find(l=>l.domain==='nomail.com').status,'rejected');assert.equal(leads.find(l=>l.domain==='nomail.com').notes,'No reachable contact');
 assert.equal(leads.filter(l=>l.status==='drafted').length,2);
 assert.ok(task.cost_usd>0);
 const events=store.listEvents({taskId:t.id});
 assert.ok(events.some(e=>e.type==='decision'&&/marketplace/.test(e.title)));
 assert.ok(events.some(e=>e.type==='draft'&&/Not sent/.test(e.title)));
});

test('a domain already in the CRM is never contacted twice',async()=>{
 const store=openStore(':memory:');const tools=fakeTools();const runner=createRunner(store,tools);
 await runner.wait(runner.start('first').id);
 const before=tools.calls.drafts.length;
 const second=runner.start('second');await runner.wait(second.id);
 assert.ok(!tools.calls.drafts.slice(before).some(d=>['sam.lee@alpha.com','sam.lee@beta.com'].includes(d.to)));
 assert.ok(store.listEvents({taskId:second.id}).some(e=>/already in CRM/.test(e.title)));
});

test('a stop steer halts the mission before the next lead',async()=>{
 const store=openStore(':memory:');
 let gate;const hold=new Promise(r=>{gate=r;});
 const tools=fakeTools({search:async()=>{await hold;return {via:'fake',costUsd:0,requestId:null,results:[{title:'Alpha',url:'https://alpha.com/',text:''},{title:'Beta',url:'https://beta.com/',text:''}]};}});
 const runner=createRunner(store,tools);
 const t=runner.start('find brands');
 await new Promise(r=>setTimeout(r,20));
 runner.steer(t.id,'stop now');gate();
 await runner.wait(t.id);
 assert.equal(store.getTask(t.id).status,'stopped');
 assert.equal(tools.calls.drafts.length,0);
 assert.equal(store.listSteers(t.id)[0].reply,'stopping');
});

test('rules planner reads count and territories',()=>{
 const p=rulesPlan('find 8 skincare brands in Brooklyn and Los Angeles');
 assert.equal(p.maxDrafts,8);
 assert.deepEqual(p.territories,['Brooklyn','Los Angeles']);
 assert.equal(p.searchQueries.length,2);
});

test('email extraction drops noreply and picks the brand inbox',()=>{
 const emails=extractEmails('Write to partnerships@brand.co or noreply@brand.co or privacy@brand.co',['mailto:hello@brand.co?subject=hi']);
 assert.deepEqual(emails.sort(),['hello@brand.co','partnerships@brand.co']);
 assert.equal(bestEmail(['hello@brand.co','partnerships@brand.co','x@gmail.com'],'brand.co'),'partnerships@brand.co');
});

test('copy cleanup removes em dashes, "really" and extra exclamation marks',()=>{
 assert.equal(cleanCopy('We really love it \u2014 truly! Call us!'),'We love it, truly. Call us!');
});

test('gmail module sends only through sendDraft and blocks header injection',()=>{
 const src=readFileSync(new URL('./tools/gmail.mjs',import.meta.url),'utf8');
 assert.ok(!/messages\/send|users\/me\/messages/.test(src));
 assert.equal(src.match(/drafts\/send/g).length,1,'one send endpoint');
 assert.match(src,/export async function sendDraft[\s\S]*drafts\/send/);
 assert.throws(()=>buildMime({from:'a@b.c',to:'x@y.z\r\nBcc: evil@z.z',subject:'s',body:'b'}),/injection/);
});

test('higgsfield input clamps duration and resolution',()=>{
 assert.deepEqual(buildInput({prompt:'p',duration:99,resolution:'4k'}),{prompt:'p',duration:30,resolution:'720p'});
 assert.equal(buildInput({prompt:'p',imageUrl:'https://x/y.png'}).image_url,'https://x/y.png');
});

test('a studio storyboard becomes one render per shot with locks and exact dialogue',()=>{
 const packet={brief:{brand:'Mint Tees'},storyboard:{identity:'Original PS2-era character, silver jacket',wardrobe:'Silver jacket',environment:'Penthouse at night',voice:'Calm',shots:[{id:'shot-01',duration:3,camera:'Medium shot',action:'Turns to camera',dialogue:'You are early.',audio:'Room tone'},{id:'shot-02',duration:9,camera:'Close-up',action:'Holds up shirt',dialogue:'',audio:''}]}};
 const shots=shotsFromStoryboard(packet);
 assert.equal(shots.length,2);
 assert.equal(shots[0].group,'Mint Tees');
 assert.equal(shots[0].input.duration,4);
 assert.match(shots[0].input.prompt,/Wardrobe: Silver jacket/);
 assert.match(shots[0].input.prompt,/spoken exactly: "You are early\."/);
 assert.match(shots[1].input.prompt,/No dialogue\./);
 assert.throws(()=>shotsFromStoryboard({nothing:true}),/No storyboard shots/);
});

test('finished renders need a review, and a rejection needs a reason',async()=>{
 const store=openStore(':memory:');
 const server=http.createServer(createApp({store,runner:{start(){},control(){},steer(){},isRunning:()=>false}}));
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base=`http://127.0.0.1:${server.address().port}`;
 const post=(p,b)=>fetch(base+p,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)}).then(async r=>({status:r.status,body:await r.json()}));
 try{
  const r=store.createRender({title:'shot-01: Medium',endpoint:'x',input:buildInput({prompt:'a test prompt here'})});
  assert.equal((await post(`/api/renders/${r.id}/review`,{decision:'approved'})).status,409);
  store.updateRender(r.id,{status:'completed',review:'pending'});
  assert.equal((await post(`/api/renders/${r.id}/review`,{decision:'rejected'})).status,400);
  const rej=await post(`/api/renders/${r.id}/review`,{decision:'rejected',note:'Jacket turned blue'});
  assert.equal(rej.body.render.review,'rejected');
  const v2=await post(`/api/renders/${r.id}/revise`,{});
  assert.equal(v2.body.render.title,'shot-01: Medium (v2)');
  assert.match(v2.body.render.input.prompt,/Jacket turned blue/);
  assert.equal(v2.body.render.status,'draft');
  assert.equal((await post(`/api/renders/${v2.body.render.id}/approve`,{estimate:'1'})).status,409);
 }finally{server.close();}
});

test('storyboards are normalized, gated by checkers, and approval sends shots to renders',async()=>{
 const {normalizePlan,malformed}=await import('./storyboard.mjs');
 const base={title:'t',identity:'i',wardrobe:'w',environment:'e',voice:'v',creativeDirection:'c',offer:'o',constraints:''};
 assert.equal(malformed({...base,shots:[{id:'shot-01',duration:5,camera:'c',action:'a',dialogue:'',audio:'room tone'},{id:'shot-02',duration:5,camera:'c',action:'a',dialogue:'Hi.',audio:'x'}]}),null);
 assert.match(malformed({...base,shots:[{id:'shot-01',duration:5,camera:'c',action:'a',dialogue:'',audio:'tone.\\"}, {\\"id\\":\\"shot-02\\"'},{id:'shot-02',duration:5,camera:'c',action:'a',dialogue:'',audio:''}]}),/leaked/);
 assert.match(malformed({...base,shots:[{id:'shot-01',duration:5,camera:'c',action:'a',dialogue:'',audio:''}]}),/only 1 shot/);
 const plan=normalizePlan({title:'Drop day',identity:'i',wardrobe:'w',environment:'e',voice:'v',creativeDirection:'c',offer:'o',constraints:'',shots:[{id:'a',duration:2,camera:'Wide',action:'Walks in',dialogue:'Okay \u2014 here it is',audio:'Door'},{id:'b',duration:30,camera:'Close',action:'Holds shirt',dialogue:'',audio:''}]});
 assert.deepEqual(plan.shots.map(s=>[s.id,s.start,s.duration]),[['shot-01',0,4],['shot-02',4,10]]);
 assert.equal(plan.durationSeconds,14);
 assert.equal(plan.shots[0].dialogue,'Okay, here it is');
 const store=openStore(':memory:');
 const server=http.createServer(createApp({store,runner:{start(){},control(){},steer(){},isRunning:()=>false}}));
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const post=(p,b={})=>fetch(`http://127.0.0.1:${server.address().port}${p}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)}).then(async r=>({status:r.status,body:await r.json()}));
 try{
  const s=store.createStoryboard({title:'Drop day',brief:{product:'tee',idea:'x'},plan});
  assert.equal((await post(`/api/storyboards/${s.id}/approve`)).status,409);
  store.updateStoryboard(s.id,{status:'checks_passed'});
  const ok=await post(`/api/storyboards/${s.id}/approve`);
  assert.equal(ok.body.storyboard.status,'approved');
  assert.equal(ok.body.renders.length,2);
  assert.ok(ok.body.renders.every(r=>r.status==='draft'&&r.group_name==='Drop day v1'));
  assert.equal((await post(`/api/storyboards/${s.id}/check`)).status,409);
 }finally{server.close();}
});

test('spend is itemized by provider with a today column',async()=>{
 const store=openStore(':memory:');const tools=fakeTools();const runner=createRunner(store,tools);
 await runner.wait(runner.start('find brands').id);
 store.addSpend({provider:'higgsfield',usd:2.31,renderId:1,note:'approved render estimate'});
 const s=store.spendSummary();
 const by=Object.fromEntries(s.providers.map(p=>[p.provider,p.total]));
 assert.ok(by.claude>0&&by.exa>0&&by.higgsfield===2.31);
 assert.equal(Math.round(s.total*1e6),Math.round((by.claude+by.exa+by.higgsfield)*1e6));
 assert.equal(Math.round(s.today*1e6),Math.round(s.total*1e6));
 assert.equal(Math.round(store.stats().spend*1e6),Math.round(s.total*1e6));
});

test('home metrics bucket drafts, leads and spend by range',async()=>{
 const store=openStore(':memory:');const tools=fakeTools();const runner=createRunner(store,tools);
 await runner.wait(runner.start('find brands').id);
 const drafts=store.listDrafts().length,leads=store.listLeads().length;
 for(const [range,n] of [['today',24],['week',7],['month',30],['year',12]]){
  const m=store.metrics(range);
  assert.equal(m.series.length,n);
  assert.equal(m.totals.drafts,drafts);assert.equal(m.totals.leads,leads);assert.equal(m.totals.missions,1);
  assert.equal(Math.round(m.totals.spend*1e6),Math.round(store.spendSummary().total*1e6));
  assert.equal(m.series[range==='today'?new Date().getHours():n-1].drafts,drafts);
 }
 const [t]=store.listTasks();assert.equal(t.drafts,drafts);assert.equal(t.working,0);
});

test('marking a draft sent by hand moves the brand to contacted',async()=>{
 const store=openStore(':memory:');const tools=fakeTools();const runner=createRunner(store,tools);
 await runner.wait(runner.start('find brands').id);
 const [d]=store.listDrafts();
 assert.equal(store.markDraftSent(d.id).status,'sent');
 assert.equal(store.getLead(d.lead_id).status,'contacted');
 assert.equal(store.markDraftSent(99999),null);
});

test('chat attachments are stored, typed, and handed to the planner with the chosen model',async()=>{
 const {mkdtempSync}=await import('node:fs');const {tmpdir}=await import('node:os');const path=await import('node:path');
 process.env.AGENT_UPLOAD_DIR=mkdtempSync(path.join(tmpdir(),'mint-up-'));
 const {saveUpload,getUpload,attachmentBlocks}=await import('./tools/uploads.mjs');
 const {currentMainModel}=await import('./tools/llm.mjs');
 const png=saveUpload({name:'brief.png',type:'image/png',data:Buffer.from('fakepng').toString('base64')});
 const txt=saveUpload({name:'brands.csv',type:'',data:Buffer.from('name\nVYLIN').toString('base64')});
 assert.equal(png.kind,'image');assert.equal(txt.kind,'text');assert.deepEqual(getUpload(png.id),png);
 assert.equal(getUpload('../../etc/passwd'),null);
 assert.throws(()=>saveUpload({name:'x.exe',type:'application/x-msdownload',data:'AA=='}),/Attach an image/);
 const blocks=attachmentBlocks([png,txt]);
 assert.equal(blocks[0].type,'image');assert.match(blocks[1].text,/brands\.csv[\s\S]*VYLIN/);
 const seen={};
 const store=openStore(':memory:');
 const runner=createRunner(store,fakeTools({plan:async(prompt,profile,attachments)=>{seen.files=attachments;seen.model=currentMainModel();return {data:{reply:'ok',markets:['x'],territories:['y'],maxDrafts:1,qualify:'q',exclusions:[],searchQueries:[]},cost:0,model:'fake'};}}));
 const t=runner.start('find brands',{model:'claude-haiku-5-5',attachments:[png]});
 await runner.wait(t.id);
 assert.equal(seen.model,'claude-haiku-5-5');assert.equal(seen.files[0].id,png.id);
 assert.equal(store.getTask(t.id).model,'claude-haiku-5-5');
 const server=http.createServer(createApp({store,runner:{start:(p,o)=>({id:1,prompt:p,...o}),control(){},steer(){},isRunning:()=>false}}));
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const post=(p,b)=>fetch(`http://127.0.0.1:${server.address().port}${p}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)}).then(async r=>({status:r.status,body:await r.json()}));
 try{
  assert.equal((await post('/api/chat',{message:'find brands',model:'claude-opus-5-5'})).status,400);
  assert.equal((await post('/api/chat',{message:'find brands',attachments:['nope']})).status,400);
  const ok=await post('/api/chat',{message:'find brands',model:'claude-sonnet-5-5',attachments:[txt.id]});
  assert.equal(ok.status,200);assert.equal(ok.body.task.attachments[0].name,'brands.csv');
  const up=await post('/api/uploads',{name:'note.txt',type:'text/plain',data:Buffer.from('hi').toString('base64')});
  assert.equal(up.status,200);assert.equal(up.body.upload.kind,'text');
 }finally{server.close();}
});

test('higgsfield price sheet becomes a total for the chosen resolution and length',()=>{
 const sheet={type:'description',pricing_description:'your request costs roughly $0.2056 per second of generated video at 480p, $0.4622 at 720p, and $1.1372 at 1080p.'};
 assert.equal(priceFrom(sheet,{resolution:'720p',duration:5}),'2.31');
 assert.equal(priceFrom(sheet,{resolution:'1080p',duration:10}),'11.37');
 assert.equal(priceFrom({usd:'0.094'},{resolution:'720p',duration:5}),'0.09');
 assert.equal(priceFrom({},{resolution:'720p',duration:5}),null);
});
