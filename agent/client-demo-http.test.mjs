import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {readFileSync,existsSync} from 'node:fs';
import {PDFDocument} from 'pdf-lib';
import {openStore} from './store.mjs';
import {createApp} from './server.mjs';

test('real demo packet, chat, tasks and PDF attachments work while paid work stays paused',async t=>{
 const store=openStore(':memory:');
 store.db.exec("create table settings(key text primary key,value text);insert into settings values('spendingPaused','true')");
 let providerCalls=0;
 const forbidden=()=>{providerCalls++;throw Error('No provider work in a saved demo');};
 const server=http.createServer(createApp({store,runner:{start:forbidden,isRunning:()=>false},assistant:{reply:forbidden,history:()=>[]}}));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(async()=>{await new Promise(resolve=>server.close(resolve));store.db.close();});
 const base=`http://127.0.0.1:${server.address().port}`;
 const post=(path,body)=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 const packet=await (await fetch(base+'/api/client-demo')).json();
 assert.deepEqual(packet.activeBrandIds,['disobedient','vylin']);
 assert.deepEqual(packet.brands.map(b=>b.id),['disobedient','vylin','awardscholar','waddle']);
 for(const brand of packet.brands){
  assert.equal(brand.score.total,brand.score.components.reduce((n,c)=>n+c.score,0));
  assert.ok(brand.history.some(e=>e.tool==='Exa.web_search_exa'));
  assert.ok(brand.history.some(e=>['storyboard','imagegen'].includes(e.id)&&e.mode==='recorded'));
  assert.ok(brand.history.some(e=>e.id==='pdf'&&e.mode==='recorded'));
  assert.ok(brand.history.filter(e=>e.mode==='simulated').every(e=>e.status==='pending'));
  for(const url of [brand.persona.imageUrl,brand.storyboardImageUrl,brand.offerPdfUrl,brand.reportUrl,...brand.references.map(r=>r.imageUrl)])assert.ok(existsSync(new URL('./public'+url,import.meta.url)),url);
  const response=await fetch(base+brand.offerPdfUrl);
  assert.match(response.headers.get('content-type'),/^application\/pdf/);
  assert.equal((await PDFDocument.load(await response.arrayBuffer())).getPageCount(),2);
 }
 const response=await post('/api/assistant',{message:'Create a streetwear demo for Disobedient and VYLIN'});
 assert.equal(response.status,200);
 const first=await response.json();assert.equal(first.tasks.length,2);
 for(const task of first.tasks){
  assert.equal(task.plan.kind,'client_demo');
  assert.equal(task.plan.clientDemo.packet.id,task.plan.clientDemo.brandId);
  assert.equal(task.plan.clientDemo.productionAuthorized,false);
  assert.equal(task.plan.clientDemo.sendingAuthorized,false);
  assert.match(task.plan.clientDemo.offerPdfUrl,/(?:offer|brief)-v1\.pdf$/);
  const detail=await (await fetch(base+`/api/tasks/${task.id}`)).json();
  assert.deepEqual(detail.events.map(e=>e.tool),['client_demo.prepare','client_demo.prepare']);
 }
 const second=await (await post('/api/chat',{message:'Preview Disobedient and VYLIN'})).json();
 assert.equal(second.reused,true);assert.deepEqual(second.tasks.map(t=>t.id),first.tasks.map(t=>t.id));
 assert.equal((await post('/api/client-demo/tasks',{brandId:'unknown'})).status,400);
 assert.equal((await post('/api/assistant',{message:'Find Waddle emails and send a sample'})).status,423);
 assert.equal(store.listTasks().length,2);assert.equal(store.listLeads().length,0);assert.equal(store.listDrafts().length,0);
 assert.equal(store.spendSummary().total,0);assert.equal(providerCalls,0);
 assert.equal(store.db.prepare("select value from settings where key='spendingPaused'").get().value,'true');
 assert.ok(first.actions.every(a=>Number.isInteger(a.input.taskId)));
 assert.ok(!readFileSync(new URL('./public/client-demo-data-v2.json',import.meta.url),'utf8').includes('/Users/'));
});
