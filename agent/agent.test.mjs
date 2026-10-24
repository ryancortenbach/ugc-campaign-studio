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

const page=(domain,email)=>({via:'fake',sessionId:null,screenshot:null,domain,pages:[{url:`https://${domain}/`,title:domain,chars:100}],homeText:'Shop new arrivals',contactText:'',emails:email?[{email,sourceUrl:`https://${domain}/contact`,excerpt:`write to ${email}`}]:[],best:email?{email,sourceUrl:`https://${domain}/contact`,excerpt:`write to ${email}`}:null});
function fakeTools(over={}){
 const calls={drafts:[],sends:0};
 const tools={
  calls,
  loadProfile:()=>({senderName:'Ryan',company:'Mint Labs',offer:'AI UGC',senderFact:'x',cta:'y',rules:'z'}),
  brainMode:()=>'fake',exaMode:()=>'rest',siteMode:()=>'solari',gmailEnabled:()=>true,draftAccount:()=>'rmc2249@columbia.edu',
  plan:async()=>({data:{reply:'ok',markets:['streetwear'],territories:['Brooklyn'],maxDrafts:2,qualify:'sells online',exclusions:[],searchQueries:[{query:'q1',market:'streetwear',territory:'Brooklyn'},{query:'q2',market:'streetwear',territory:'Queens'}]},cost:0.001,model:'fake'}),
  search:async q=>({via:'fake exa',costUsd:0.007,requestId:'r',results:q==='q1'?[{title:'Alpha | Shop',url:'https://alpha.com/x',text:'a'},{title:'Amazon',url:'https://www.amazon.com/y',text:''},{title:'NoMail',url:'https://nomail.com/',text:''},{title:'Beta',url:'https://beta.com/',text:''}]:[{title:'Gamma',url:'https://gamma.com/',text:''}]}),
  visit:async url=>{const d=new URL(url).hostname;return page(d,d==='nomail.com'?null:`hello@${d}`);},
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
 assert.deepEqual(tools.calls.drafts.map(d=>d.to),['hello@alpha.com','hello@beta.com']);
 const leads=store.listLeads({taskId:t.id});
 assert.ok(!leads.some(l=>l.domain==='amazon.com'));
 assert.equal(leads.find(l=>l.domain==='nomail.com').status,'skipped');
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
 assert.ok(!tools.calls.drafts.slice(before).some(d=>['hello@alpha.com','hello@beta.com'].includes(d.to)));
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
 assert.equal(cleanCopy('We really love it — truly! Call us!'),'We love it, truly. Call us!');
});

test('gmail module never sends and blocks header injection',()=>{
 const src=readFileSync(new URL('./tools/gmail.mjs',import.meta.url),'utf8');
 assert.ok(!/messages\/send|drafts\/send|\/send\b/.test(src));
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

test('higgsfield price sheet becomes a total for the chosen resolution and length',()=>{
 const sheet={type:'description',pricing_description:'your request costs roughly $0.2056 per second of generated video at 480p, $0.4622 at 720p, and $1.1372 at 1080p.'};
 assert.equal(priceFrom(sheet,{resolution:'720p',duration:5}),'2.31');
 assert.equal(priceFrom(sheet,{resolution:'1080p',duration:10}),'11.37');
 assert.equal(priceFrom({usd:'0.094'},{resolution:'720p',duration:5}),'0.09');
 assert.equal(priceFrom({},{resolution:'720p',duration:5}),null);
});
