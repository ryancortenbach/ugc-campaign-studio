import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {openStore} from './store.mjs';
import {createTaskStoryboards} from './task-storyboards.mjs';
import {taskStoryboardView,refreshTaskStoryboardActivity} from './public/task-storyboards.js';

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
