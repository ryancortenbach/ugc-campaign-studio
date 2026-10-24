import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {openStore} from './store.mjs';
import {createCampaignDemo,campaignDemoTrigger} from './campaign-demo.mjs';
import {createApp} from './server.mjs';
import {createCampaignReplay,mountCampaignDemo} from './public/campaign-demo.js';
import {JSDOM} from 'jsdom';

const packet=()=>({preparedAt:'2026-10-24',brands:[{id:'disobedient',name:'Disobedient',website:'https://disobedientnyc.com',taskId:10,demoKind:'streetwear',persona:{environment:'London'},assets:[{kind:'product',title:'Hoodie back',imageUrl:'/hoodie.jpg'}],sampleVideo:{url:'/sample.mp4',requestId:'real-request',durationSeconds:6,visualQA:{status:'checks_passed'}},demoFinalVideo:{url:'/final.mp4',durationSeconds:30},history:[{mode:'recorded',tool:'Exa.web_search_exa',input:{query:'Disobedient'},output:{sources:2}}]},{id:'vylin',name:'VYLIN',website:'https://wearvylin.com',taskId:11,assets:[],history:[]}]});
const service=store=>createCampaignDemo({store,clientDemo:{get:packet,prepare:id=>({task:{id:id==='disobedient'?10:11,plan:{brand:id}}})},assetExists:url=>Boolean(url)});

test('only explicit rehearsal triggers intercept normal chat, while the requested demo prompt is supported',()=>{
 assert.equal(campaignDemoTrigger('Find me streetwear brands we can run AI UGC content campaigns for.'),true);
 assert.equal(campaignDemoTrigger('Run the streetwear demo'),true);
 assert.equal(campaignDemoTrigger('Find 8 streetwear brands in Brooklyn'),false);
 assert.equal(campaignDemoTrigger('Send an email to Disobedient'),false);
});

test('the complete scenario preserves sample-before-outreach-before-checkout-before-final order and marks unexecuted services simulated',()=>{
 const store=openStore(':memory:'),demo=service(store),data=demo.get();
 const ids=data.steps.map(s=>s.id);
 assert.ok(ids.indexOf('sample')<ids.indexOf('outreach'));assert.ok(ids.indexOf('outreach')<ids.indexOf('reply'));assert.ok(ids.indexOf('reply')<ids.indexOf('checkout'));assert.ok(ids.indexOf('paid')<ids.indexOf('full-render'));
 for(const id of ['review','review-approved','outreach','reply','checkout','paid'])assert.equal(data.steps.find(s=>s.id===id).mode,'simulated');
 assert.equal(data.steps.find(s=>s.id==='delivery').output.durationSeconds,30);
 assert.equal(data.visualStyle.id,'ps2-cutscene');assert.match(data.steps.find(s=>s.id==='character').input.visualStyle.direction,/low-poly/);
 assert.equal(data.steps.find(s=>s.id==='character').output.conceptUrl,null);
 assert.equal(data.steps.find(s=>s.id==='outreach').input.attachments[0].url,'/sample.mp4');
 assert.doesNotMatch(JSON.stringify(data),/\.pdf/);
 assert.ok(Object.values(data.safety).every(value=>value===false));
 const start=demo.start('Find me streetwear brands we can run AI UGC content campaigns for');
 assert.equal(start.url,'#/walkthrough/disobedient?autoplay=1');assert.equal(start.tasks.length,2);assert.equal(store.spendSummary().total,0);assert.equal(store.listDrafts().length,0);assert.equal(store.listRenders().length,0);
 store.db.close();
});

test('autoplay reaches the actual sample and resumes through the visual review wait before payment and final media',()=>{
 const store=openStore(':memory:'),data=service(store).get(),pending=[],states=[];
 const controller=createCampaignReplay({steps:data.steps,onChange:s=>states.push(s),schedule:fn=>{pending.push(fn);return fn;},cancel:fn=>{const i=pending.indexOf(fn);if(i>=0)pending.splice(i,1);}});
 controller.play();while(controller.state.playing)pending.shift()();
 assert.equal(data.steps[controller.state.index].id,'sample');
 controller.play();assert.equal(data.steps[controller.state.index].id,'review');assert.equal(controller.state.playing,true);
 while(controller.state.playing)pending.shift()();
 assert.equal(data.steps[controller.state.index].id,'delivery');assert.equal(controller.state.completed,true);
 controller.reset();assert.equal(controller.state.index,-1);assert.equal(pending.length,0);
 controller.dispose();controller.play();assert.equal(controller.state.index,-1);store.db.close();
});

test('missing samples cannot proceed to a fake outreach send, and missing finals cannot show the short sample as the final ad',()=>{
 const store=openStore(':memory:'),data=service(store).get('vylin');
 const c=createCampaignReplay({steps:data.steps,onChange:()=>{}});
 for(let i=0;i<8;i++)c.next();
 assert.equal(data.steps[c.state.index].id,'sample');assert.match(c.state.error,/no saved sample/);c.dispose();
 const d=service(store).get();d.steps.find(s=>s.id==='full-render').output.videoUrl=null;
 const c2=createCampaignReplay({steps:d.steps,onChange:()=>{}});for(let i=0;i<15;i++)c2.next();
 assert.equal(d.steps[c2.state.index].id,'full-render');assert.match(c2.state.error,/finished ad/);c2.dispose();store.db.close();
});

test('the exact chat prompt works while spending is paused, and creates no provider work or real checkout',async t=>{
 const store=openStore(':memory:');store.db.exec("create table settings(key text primary key,value text);insert into settings values('spendingPaused','true')");
 let calls=0;const forbidden=()=>{calls++;throw Error('External execution is forbidden in replay');};
 const server=http.createServer(createApp({store,runner:{start:forbidden,isRunning:()=>false},assistant:{reply:forbidden,history:()=>[]}}));await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));store.db.close();});
 const base=`http://127.0.0.1:${server.address().port}`;
 const reviewsBefore=store.db.prepare('select count(*) n from client_reviews').get().n;
 const r=await fetch(base+'/api/assistant',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:'Find me streetwear brands we can run AI UGC content campaigns for'})});
 assert.equal(r.status,200);const data=await r.json();assert.equal(data.mode,'rehearsal');assert.match(data.url,/#\/walkthrough\/disobedient\?autoplay=1/);
 const scenario=await (await fetch(base+'/api/campaign-demo/disobedient')).json();assert.ok(scenario.steps.some(s=>s.provider==='Whop MCP'&&s.mode==='simulated'));
 assert.equal(store.db.prepare('select count(*) n from client_reviews').get().n,reviewsBefore);
 assert.equal(calls,0);assert.equal(store.listDrafts().length,0);assert.equal(store.listRenders().length,0);assert.equal(store.spendSummary().total,0);assert.equal(store.db.prepare('select count(*) n from whop_orders').get().n,0);
});

test('chat progress shows inline tools without a stage dashboard and makes only read requests',async()=>{
 const store=openStore(':memory:'),data=service(store).get(),dom=new JSDOM('<main id="view"></main>',{url:'http://local/#/home'}),host=dom.window.document.querySelector('main'),calls=[];
 dom.window.HTMLMediaElement.prototype.play=function(){return Promise.resolve();};dom.window.HTMLMediaElement.prototype.pause=function(){};
 const handle=await mountCampaignDemo(host,{fetch:async(url,options)=>{calls.push([url,options]);return {ok:true,json:async()=>data};}});
 assert.equal(handle.data.brands.length,1);assert.equal(handle.data.brands[0].id,'disobedient');
 assert.doesNotMatch(host.textContent,/VYLIN|next step|reset|tool call history|demo|simulat/i);
 handle.controller.play();handle.controller.pause();assert.match(host.textContent,/Create the campaign task/);
 for(let i=0;i<4;i++)handle.controller.next();
 const player=host.querySelector('video');assert.equal(player.getAttribute('src'),'/sample.mp4');assert.equal(player.controls,false);
 player.currentTime=2.5;handle.respond('pause');assert.equal(host.querySelector('video'),player);assert.equal(player.currentTime,2.5);
 handle.respond('continue');assert.equal(host.querySelector('video'),player);assert.equal(player.currentTime,2.5);
 assert.deepEqual(calls.map(c=>c[0]),['/api/campaign-demo/disobedient']);handle.dispose();dom.window.close();store.db.close();
});

test('automatic chat review produces Gmail, Whop and video notifications without writes',async()=>{
 const store=openStore(':memory:'),data=service(store).get(),dom=new JSDOM('<main id="view"></main>',{url:'http://local/#/home'}),host=dom.window.document.querySelector('main'),calls=[],pending=[],notices=[];
 dom.window.HTMLMediaElement.prototype.play=function(){return Promise.resolve();};dom.window.HTMLMediaElement.prototype.pause=function(){};
 const handle=await mountCampaignDemo(host,{autoPlay:true,onNotify:n=>notices.push(n),fetch:async(url,options)=>{calls.push([url,options]);return {ok:true,json:async()=>data};},schedule:(fn,ms)=>{const job={fn,ms};pending.push(job);return job;},cancel:job=>{const i=pending.indexOf(job);if(i>=0)pending.splice(i,1);}});
 while(handle.controller.state.playing)pending.shift().fn();
 assert.equal(data.steps[handle.controller.state.index].id,'sample');
 host.querySelector('video').dispatchEvent(new dom.window.Event('ended'));
 assert.match(host.textContent,/Waiting/);assert.equal(pending[0].ms,4500);
 pending.shift().fn();assert.equal(notices.at(-1).title,'Sample approved');
 while(handle.controller.state.playing){pending.shift().fn();assert.doesNotMatch(host.textContent,/demo|simulat|VYLIN/i);}
 assert.equal(data.steps[handle.controller.state.index].id,'delivery');
 assert.deepEqual(notices.map(n=>n.provider),['terac','gmail','gmail','whop','whop','higgsfield']);
 assert.equal(notices.find(n=>n.title==='Checkout successful').detail,'Tobin checked out for $500');
 assert.deepEqual(calls,[['/api/campaign-demo/disobedient',undefined]]);handle.dispose();dom.window.close();store.db.close();
});

test('persistent chat includes actual saved ICP and Terac evidence and survives route changes',async()=>{
 const store=openStore(':memory:'),data=service(store).get(),dom=new JSDOM('<main id="view"><div id="chat"></div></main><aside id="cache" hidden></aside>',{url:'http://local/#/home'}),host=dom.window.document.querySelector('#chat'),pending=[],calls=[];
 dom.window.HTMLMediaElement.prototype.play=function(){return Promise.resolve();};dom.window.HTMLMediaElement.prototype.pause=function(){};
 const handle=await mountCampaignDemo(host,{autoPlay:true,persistent:true,fetch:async(url,options)=>{calls.push([url,options]);return {ok:true,json:async()=>url.startsWith('/api/campaign-demo')?data:url==='/api/client-demo'?{brands:[{id:'disobedient',reportUrl:'/icp.pdf'}]}:{realToolCall:true,checkedAt:new Date().toISOString(),balanceUsd:100}};},schedule:(fn,ms)=>{const job={fn,ms};pending.push(job);return job;},cancel:job=>{const i=pending.indexOf(job);if(i>=0)pending.splice(i,1);}});
 assert.ok(handle.data.steps.some(s=>s.id==='icp'&&s.output.url==='/icp.pdf'));
 assert.ok(handle.data.steps.some(s=>s.id==='terac-sync'&&s.input.tool==='terac_get_context'));
 dom.window.document.querySelector('#cache').append(host);dom.window.location.hash='#/tasks';await Promise.resolve();
 pending.shift().fn();assert.equal(handle.controller.state.index,1);
 assert.ok(calls.every(([,options])=>options===undefined));handle.dispose();dom.window.close();store.db.close();
});
