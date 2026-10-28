import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {openStore} from './store.mjs';
import {createTaskStoryboards} from './task-storyboards.mjs';
import {taskStoryboardView,refreshTaskStoryboardActivity} from './public/task-storyboards.js';

test('task activity shows a legacy catalog result beside its request',async()=>{
 const dom=new JSDOM('<main></main>'),original=Object.getOwnPropertyDescriptor(globalThis,'document');
 try{
  globalThis.document=dom.window.document;
  const workspace={revision:1,task:{id:2,status:'researching'},lead:{company:'Test'},events:[{id:10,type:'tool_call',tool:'shopify.products',task_id:2,lead_id:3,data:{domain:'brand.example'}}]};
  const view=document.querySelector('main');await taskStoryboardView({view,api:async()=>({workspace}),esc:String,taskId:2});
  workspace.events.push({id:11,type:'tool_result',tool:'shopify.products',task_id:2,lead_id:3,data:{count:1,products:[{title:'Legacy catalog jacket'}]}});
  await refreshTaskStoryboardActivity();
  assert.equal(view.querySelectorAll('[data-ap-log]').length,1);
  const details=[...view.querySelectorAll('.ap-log-payload')];
  assert.equal(details.find(item=>item.querySelector('summary').textContent==='Input').querySelector('pre').textContent.includes('brand.example'),true);
  assert.equal(details.find(item=>item.querySelector('summary').textContent==='Result').querySelector('pre').textContent.includes('Legacy catalog jacket'),true);
 }finally{if(original)Object.defineProperty(globalThis,'document',original);else delete globalThis.document;dom.window.close();}
});

test('live activity keeps expanded tool details and keyboard focus while showing new results',async()=>{
 const dom=new JSDOM('<div id="view"></div>');
 const original=Object.getOwnPropertyDescriptor(globalThis,'document');
 try{
  globalThis.document=dom.window.document;
  const workspace={revision:1,task:{id:2,status:'researching'},lead:{company:'Test'},events:[{id:1,type:'tool_call',tool:'catalog.read',at:'2026-10-24T19:00:00Z',data:{callId:'catalog-1',status:'running',input:{domain:'test.example'}}}]};
  const view=document.querySelector('#view');
  await taskStoryboardView({view,api:async()=>({workspace}),esc:String,taskId:2});
  view.querySelector('.task-ideas-activity').open=true;
  const row=view.querySelector('[data-ap-log="1"]');row.open=true;
  row.querySelector('.ap-log-payload').open=true;
  row.querySelector('.ap-log-payload summary').focus();
  workspace.events.push({id:2,type:'tool_result',tool:'catalog.read',at:'2026-10-24T19:00:01Z',data:{callId:'catalog-1',status:'success',output:{products:3}}});
  workspace.events.push({id:3,type:'tool_call',tool:'ideas.local',at:'2026-10-24T19:00:02Z',data:{callId:'ideas-1',status:'running'}});
  await refreshTaskStoryboardActivity();
  const updated=view.querySelector('[data-ap-log="1"]');
  assert.equal(updated.open,true,'A live result must not collapse the tool being read');
  assert.equal(updated.querySelector('.ap-log-payload').open,true,'Expanded input must stay expanded');
  assert.equal(document.activeElement,updated.querySelector('.ap-log-payload summary'),'Keyboard focus must stay on the same disclosure');
  assert.equal(view.querySelector('.task-ideas-activity').open,true);
  assert.match(updated.textContent,/"products": 3/,'Updated result must still appear');
  assert.ok(view.querySelector('[data-ap-log="3"]'),'New calls must still appear');
 }finally{
  if(original)Object.defineProperty(globalThis,'document',original);else delete globalThis.document;
  dom.window.close();
 }
});

test('a late research response cannot replace newer ready progress and activity',async()=>{
 const dom=new JSDOM('<div id="view"></div>',{url:'http://127.0.0.1:3200/#/tasks/2'});
 const originals=Object.fromEntries(['window','document','localStorage','fetch','requestAnimationFrame'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 const store=openStore(':memory:'),boards=createTaskStoryboards({store});
 try{
  globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.localStorage=dom.window.localStorage;globalThis.requestAnimationFrame=fn=>fn();
  globalThis.fetch=async()=>({ok:true,json:async()=>JSON.parse(readFileSync(new URL('./public/apparel-storyboard-research-v1.json',import.meta.url),'utf8'))});
  const mission=store.createTask('Review');
  const lead=store.createLead({taskId:mission.id,company:'Test',domain:'test.example',url:'https://test.example',market:'streetwear',territory:'NYC',status:'qualified'});
  const initial=boards.ensure(lead.id);initial.task.status='researching';
  let first=true;const requests=[];
  const api=async()=>{if(first){first=false;return {workspace:initial};}return new Promise(resolve=>requests.push(resolve));};
  await taskStoryboardView({view:document.querySelector('#view'),api,esc:String,taskId:initial.task.id});
  const older=refreshTaskStoryboardActivity(),latest=refreshTaskStoryboardActivity();
  const ready=structuredClone(initial);ready.revision=1;ready.task.status='ready';
  ready.events=[{id:900,type:'tool_call',tool:'storyboard.local',title:'Latest planning evidence',at:'2026-10-24T19:00:00Z',data:{callId:'latest',status:'running',input:{marker:'latest-only-marker'}}}];
  requests[1]({workspace:ready});await latest;
  assert.match(document.querySelector('#task-ideas-status').textContent,/Ideas ready/);
  const latestActivity=document.querySelector('#task-board-activity').innerHTML;
  const latestReport=document.querySelector('#task-ideas-report').getAttribute('data');
  assert.match(latestActivity,/latest-only-marker/);
  requests[0]({workspace:initial});await older;
  assert.match(document.querySelector('#task-ideas-status').textContent,/Ideas ready/);
  assert.equal(document.querySelector('#task-board-activity').innerHTML,latestActivity);
  assert.equal(document.querySelector('#task-ideas-report').getAttribute('data'),latestReport);
 }finally{
  boards.close();store.db.close();dom.window.close();
  for(const [key,descriptor] of Object.entries(originals))if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];
 }
});
