import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {openStore} from './store.mjs';
import {createApp} from './server.mjs';
import {spendingPaused,spendingRequestAllowed} from './spending-policy.mjs';

test('no-spend review allows reports, local edits and stopping work, blocks paid and sending paths',()=>{
 for(const [method,url,body] of [
  ['GET','/api/tasks/7/ideas.pdf'],['GET','/api/whop/orders/pay_1/brief.pdf'],['GET','/api/leads/1/logo'],
  ['POST','/api/whop/orders/pay_1/context'],['POST','/api/tasks/7/storyboard'],
  ['POST','/api/production/call'],['POST','/api/tasks/7/control',{action:'stop'}],
  ['POST','/api/autopilot',{enabled:false}],['POST','/api/whop',{enabled:false}],
  ['POST','/api/browser/session-1/close'],['POST','/api/renders/1/cancel']
 ])assert.equal(spendingRequestAllowed(method,url,body),true,url);
 for(const [method,url,body] of [
  ['POST','/api/leads/1/video'],['POST','/api/leads/1/research'],['POST','/api/chat'],
  ['POST','/api/assistant'],['POST','/api/voices/design'],['POST','/api/storyboards'],
  ['POST','/api/renders/1/approve'],['POST','/api/renders/1/reconcile'],
  ['POST','/api/panels/1/launch'],['POST','/api/drafts/1/send-dm'],
  ['POST','/api/tasks/7/control',{action:'resume'}],['POST','/api/autopilot',{enabled:true}],
  ['POST','/api/whop',{enabled:true}],
  ['POST','/api/unknown-future-paid-action']
 ])assert.equal(spendingRequestAllowed(method,url,body),false,url);
});

test('persisted pause denies live HTTP work before provider handlers, leaves zero-budget tools available',async()=>{
 const store=openStore(':memory:');let providerCalls=0,localCalls=0;
 assert.equal(spendingPaused(store),false);
 const app=createApp({store,panelsWatch:true,panels:{start(){providerCalls++;}},
  logoNet:{exaImages:async()=>{providerCalls++;throw Error('Paid fallback must not run');},fetchImpl:async()=>{throw Error('No public logo in fixture');}},
  production:{call:async()=>{localCalls++;return {costUsd:0};}},
  video:{enabled(){providerCalls++;throw Error('must not run');}},
  requalifier:{run(){providerCalls++;}},assistant:{reply(){providerCalls++;}}});
 // The test creates an app first to initialize its settings, then persists the same flag used by the real app.
 store.db.prepare("insert into settings(key,value) values('spendingPaused','true')").run();
 assert.equal(spendingPaused(store),true);
 providerCalls=0;
 createApp({store,panelsWatch:true,panels:{start(){providerCalls++;}}});
 assert.equal(providerCalls,0,'panel watcher must stay off on a paused startup');
 const server=http.createServer(app);await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base=`http://127.0.0.1:${server.address().port}`;
 try{
  for(const url of ['/api/leads/1/video','/api/leads/1/research','/api/assistant','/api/leads/requalify','/api/renders/1/approve']){
   const response=await fetch(base+url,{method:'POST',body:'{}'});
   assert.equal(response.status,423,url);assert.equal((await response.json()).code,'spending_paused');
  }
  const lead=store.createLead({taskId:null,domain:`no-spend-${Date.now()}.example`,company:'Fixture',url:'https://fixture.example',market:'apparel',territory:'US'});
  const logo=await fetch(base+`/api/leads/${lead.id}/logo`);assert.equal(logo.status,404);
  const local=await fetch(base+'/api/production/call',{method:'POST',body:JSON.stringify({name:'workflow_rehearse'})});
  assert.equal(local.status,200);assert.equal(localCalls,1);assert.equal(providerCalls,0);
  assert.equal(store.listTasks().length,0);assert.equal(store.spendSummary().total,0);
 }finally{await new Promise(r=>server.close(r));store.db.close();}
});
