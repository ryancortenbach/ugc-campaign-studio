import test from 'node:test';
import assert from 'node:assert/strict';
import {openStore} from './store.mjs';
import {createTaskStoryboards} from './task-storyboards.mjs';
import {createBrandIdeation} from './brand-ideation.mjs';
import {ideationPanel} from './public/brand-ideation.js';
import {icons} from './public/icons.js';

const product={title:'Blue Hoodie',kind:'top',image:'0.png',imageUrl:'https://brand.example/hoodie.png',url:'https://brand.example/products/hoodie'};
function setup(t,overrides={}){
 const store=openStore(':memory:'),boards=createTaskStoryboards({store}),calls=[];
 const jobs=createBrandIdeation({store,boards,snapshot:()=>'/uploads/approved.png',scrape:async options=>{calls.push(options);assert.equal(options.enabled(),false);return {products:[{...product}],source:'shopify /products.json',cost:0};},fetchHome:async()=>({url:'https://brand.example',text:'Independent clothing. Blue hoodie.'}),...overrides});
 const mission=store.createTask('Research brands');
 t.after(async()=>{jobs.close();await Promise.all(store.listLeads().map(l=>jobs.wait(l.id)));boards.close();store.db.close();});
 const add=(status='qualified')=>store.createLead({taskId:mission.id,company:'Brand',domain:`brand${store.listLeads().length}.example`,url:'https://brand.example',market:'streetwear',territory:'NYC',status});
 return {store,boards,jobs,calls,add};
}
test('qualification automatically researches and drafts, with paired real tool calls and no spend',async t=>{
 const {store,boards,jobs,calls,add}=setup(t),lead=add();
 assert.ok(jobs.get(lead.id));await jobs.wait(lead.id);
 const result=jobs.get(lead.id);assert.equal(result.status,'ready');assert.equal(calls.length,1);
 const workspace=boards.get(result.taskId);assert.equal(workspace.task.status,'ready');assert.equal(workspace.lab.options.category,'Hoodie');
 assert.equal(workspace.lab.refs.find(r=>r.role==='apparel').name,'Blue Hoodie');
 assert.match(workspace.lab.plans[0].researchEvidence.excerpt,/Independent clothing/);
 assert.match(workspace.lab.options.audience,/pending/);
 const events=store.listEvents({leadId:lead.id}),tools=events.filter(e=>e.type==='tool_call');assert.equal(tools.length,4);
 for(const call of tools){const result=events.find(e=>e.type==='tool_result'&&e.data.callId===call.data.callId);assert.ok(result);assert.equal(result.data.status,'success');assert.equal(result.data.costUsd,0);assert.ok(result.data.durationMs>=0);}
 store.updateLead(lead.id,{status:'drafting'});await jobs.sync();assert.equal(calls.length,1);
 assert.equal(store.spendSummary().total,0);assert.equal(store.listRenders().length,0);assert.equal(store.listDrafts().length,0);
});
test('unqualified brands stay idle, and later qualification starts once',async t=>{
 const {jobs,store,add,calls}=setup(t),lead=add('found');assert.equal(jobs.get(lead.id),null);
 store.updateLead(lead.id,{status:'qualified'});await jobs.wait(lead.id);assert.equal(calls.length,1);
});
test('missing catalog and blocked site finish as needs review, with honest failures',async t=>{
 const {jobs,store,boards,add}=setup(t,{scrape:async()=>{throw Error('HTTP 403');},fetchHome:async()=>{throw Error('Offline');}}),lead=add();
 await jobs.wait(lead.id);const result=jobs.get(lead.id);assert.equal(result.status,'needs_research');assert.match(result.result.unknowns.join(' '),/HTTP 403.*Offline/);
 assert.equal(boards.get(result.taskId).task.status,'needs_research');assert.equal(boards.get(result.taskId).lab.refs.some(r=>r.role==='apparel'),false);
 const events=store.listEvents({leadId:lead.id});assert.equal(events.filter(e=>e.type==='tool_result'&&e.data.status==='error').length,2);
});
test('in-flight research preserves shot edits and manually chosen references',async t=>{
 let release;const gate=new Promise(r=>{release=r;});
 const {jobs,boards,add}=setup(t,{fetchHome:async()=>{await gate;return {text:'Brand site'};}}),lead=add();
 const workspace=boards.ensure(lead.id),lab=structuredClone(workspace.lab);lab.plans[0].shots[0].dialogue='Keep this exact edit.';lab.refs.push({id:'own',name:'Chosen garment',url:'/uploads/own.png',role:'apparel'});
 boards.save(workspace.task.id,{revision:0,lab});release();await jobs.wait(lead.id);
 const saved=boards.get(workspace.task.id);assert.equal(saved.lab.plans[0].shots[0].dialogue,'Keep this exact edit.');assert.equal(saved.lab.refs.filter(r=>r.role==='apparel').length,1);assert.equal(saved.lab.refs.at(-1).id,'own');
});
test('rejection during research stops planning and does not attach draft references',async t=>{
 let release;const gate=new Promise(r=>{release=r;});
 const {jobs,store,boards,add}=setup(t,{fetchHome:async()=>{await gate;return {text:'Brand site'};}}),lead=add();
 await new Promise(r=>setImmediate(r));store.updateLead(lead.id,{status:'rejected'});release();await jobs.wait(lead.id);
 assert.equal(jobs.get(lead.id).status,'canceled');assert.equal(boards.get(jobs.get(lead.id).taskId).revision,0);
});
test('active UI uses the existing loader icon and finished UI stops spinning',()=>{
 const esc=s=>String(s).replaceAll('<','&lt;'),icon=name=>{assert.ok(icons[name]);return `<svg data-icon="${name}"></svg>`;};
 const working=ideationPanel({status:'ideating',taskId:2},[],{esc,icon});assert.match(working,/s-run/);assert.match(working,/data-icon="loader"/);assert.match(working,/Ideation in progress/);assert.doesNotMatch(working,/circle-alert|Make video/);
 const done=ideationPanel({status:'ready'},[],{esc,icon});assert.doesNotMatch(done,/s-run|data-icon="loader"/);
});
test('jackets remain jackets, and unsupported or missing photos never claim readiness',async t=>{
 for(const [title,kind,image,expected] of [['Leather Jacket','outerwear','0.png','Jacket'],['Classic Sneakers','footwear','0.png',null],['No photo Hoodie','top',null,null]]){
  const {jobs,boards,add}=setup(t,{scrape:async()=>({products:[{...product,title,kind,image}],source:'catalog',cost:0})}),lead=add();await jobs.wait(lead.id);
  const result=jobs.get(lead.id),w=boards.get(result.taskId);
  assert.equal(result.status,expected?'ready':'needs_research');
  if(expected){assert.equal(w.lab.options.category,expected);assert.equal(w.lab.plans[0].category,expected);assert.match(w.lab.plans[0].wardrobe,/jacket/);}
  else{assert.equal(w.lab.refs.some(r=>r.role==='apparel'),false);assert.match(result.result.unknowns.join(' '),/No supported top/);}
 }
});
test('new garment references invalidate staged image requests and include actual tool outputs',async t=>{
 let release;const gate=new Promise(r=>{release=r;});
 const {jobs,boards,store,add}=setup(t,{fetchHome:async()=>{await gate;return {text:'Brand site'};}}),lead=add();
 const w=boards.ensure(lead.id),lab=structuredClone(w.lab);lab.plans[0].imageRequests={shot01:{references:lab.refs}};boards.save(w.task.id,{revision:0,lab});
 release();await jobs.wait(lead.id);assert.equal(boards.get(w.task.id).lab.plans[0].imageRequests,undefined);
 const html=ideationPanel(jobs.get(lead.id),store.listEvents({leadId:lead.id}),{esc:String});assert.match(html,/Blue Hoodie/);assert.match(html,/shopify \/products.json/);assert.match(html,/>Result<\/summary>/);
});
