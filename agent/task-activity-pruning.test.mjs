import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {taskStoryboardView,refreshTaskStoryboardActivity} from './public/task-storyboards.js';

const event=id=>({id,type:'tool_call',tool:'catalog.read',task_id:2,lead_id:3,at:'2026-10-29T06:00:00Z',data:{callId:`fixture-${id}`,input:{page:id}}});
async function fixture(t,events){
 const dom=new JSDOM('<button id="other">Other control</button><main></main>'),previous=Object.getOwnPropertyDescriptor(globalThis,'document');
 globalThis.document=dom.window.document;
 t.after(()=>{dom.window.close();if(previous)Object.defineProperty(globalThis,'document',previous);else delete globalThis.document;});
 const view=document.querySelector('main'),workspace={revision:1,task:{id:2,status:'researching'},lead:{company:'Fixture'},events};let fail=false;
 await taskStoryboardView({view,api:async()=>{if(fail)throw Error('Mock read failure');return {workspace};},esc:String,taskId:2});
 const focusRow=id=>{view.querySelector('.task-ideas-activity').open=true;const row=view.querySelector(`[data-ap-log="${id}"]`);row.open=true;row.querySelector('.ap-log-payload').open=true;const summary=row.querySelector('.ap-log-payload summary');summary.focus();return summary;};
 return {dom,view,workspace,focusRow,setFailure:value=>fail=value,document:dom.window.document};
}

test('pruning the focused oldest tool returns focus to Task activity',async t=>{
 const f=await fixture(t,Array.from({length:12},(_,i)=>event(i+1)));f.focusRow(1);
 f.workspace.events.push(event(13));await refreshTaskStoryboardActivity();
 assert.equal(f.view.querySelector('[data-ap-log="1"]'),null);assert.equal(f.view.querySelectorAll('[data-ap-log]').length,12);
 assert.equal(f.document.activeElement,f.view.querySelector('.task-ideas-activity > summary'));
 assert.equal(f.view.querySelector('.task-ideas-activity').open,true);
});

test('an empty activity update keeps a keyboard return point after its focused row disappears',async t=>{
 const f=await fixture(t,[event(1)]);f.focusRow(1);f.workspace.events=[];await refreshTaskStoryboardActivity();
 assert.match(f.view.querySelector('#task-board-activity').textContent,/Research tool calls will appear here/);
 assert.equal(f.document.activeElement,f.view.querySelector('.task-ideas-activity > summary'));
});

test('a failed activity read preserves expanded details and focus and later recovers',async t=>{
 const f=await fixture(t,[event(1)]),focused=f.focusRow(1),before=f.view.innerHTML;
 f.setFailure(true);await refreshTaskStoryboardActivity();assert.equal(f.view.innerHTML,before);assert.equal(f.document.activeElement,focused);
 f.setFailure(false);f.workspace.events.push(event(2));await refreshTaskStoryboardActivity();
 assert.equal(f.view.querySelectorAll('[data-ap-log]').length,2);assert.equal(f.view.querySelector('[data-ap-log="1"]').open,true);
 assert.equal(f.document.activeElement,f.view.querySelector('[data-ap-log="1"] .ap-log-payload summary'));
});

test('activity pruning leaves focus outside the activity section untouched',async t=>{
 const f=await fixture(t,Array.from({length:12},(_,i)=>event(i+1))),other=f.document.querySelector('#other');other.focus();
 f.workspace.events.push(event(13));await refreshTaskStoryboardActivity();assert.equal(f.document.activeElement,other);
});
