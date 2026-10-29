import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {taskStoryboardView,refreshTaskStoryboardActivity} from './public/task-storyboards.js';

const event=(id,type,tool='claude.profile',data)=>({id,type,tool,task_id:2,lead_id:3,at:'2026-10-29T04:30:00Z',title:type==='error'?'Brand profile failed for Fixture: temporary failure':'Profile Fixture',...(data?{data}:{})});
async function fixture(t,events){
 const dom=new JSDOM('<main></main>'),previous=Object.getOwnPropertyDescriptor(globalThis,'document');
 globalThis.document=dom.window.document;
 t.after(()=>{dom.window.close();if(previous)Object.defineProperty(globalThis,'document',previous);else delete globalThis.document;});
 const workspace={revision:1,task:{id:2,status:'researching'},lead:{company:'Fixture'},events};
 const view=document.querySelector('main');
 await taskStoryboardView({view,api:async()=>({workspace}),esc:String,taskId:2});
 return {dom,view,workspace};
}

test('task activity exposes a legacy profile failure with no result event',async t=>{
 const f=await fixture(t,[event(10,'tool_call')]);
 f.workspace.events.push(event(11,'error'));await refreshTaskStoryboardActivity();
 const failure=f.view.querySelector('[data-ap-log="11"]');
 assert.ok(failure,'Tool errors must remain inspectable when no result follows');
 assert.ok(failure.querySelector('[aria-label="Failed"]'));assert.match(failure.textContent,/temporary failure/);
 assert.ok(f.view.querySelector('[data-ap-log="10"]'));
 assert.doesNotMatch(failure.textContent,/\$0\.0000|\dms/);
});

test('expanded failure detail and focus survive a later activity update',async t=>{
 const f=await fixture(t,[event(10,'tool_call'),event(11,'error',undefined,{error:'Fixture error detail'})]);
 const failure=f.view.querySelector('[data-ap-log="11"]');assert.ok(failure);
 f.view.querySelector('.task-ideas-activity').open=true;failure.open=true;
 failure.querySelector('.ap-log-payload').open=true;failure.querySelector('.ap-log-payload summary').focus();
 f.workspace.events.push(event(12,'tool_call','shopify.products'),event(13,'tool_result','shopify.products',{output:{products:['Fixture jacket']}}));
 await refreshTaskStoryboardActivity();
 const updated=f.view.querySelector('[data-ap-log="11"]');assert.equal(updated.open,true);
 assert.equal(updated.querySelector('.ap-log-payload').open,true);
 assert.equal(document.activeElement,updated.querySelector('.ap-log-payload summary'));
 assert.match(f.view.querySelector('[data-ap-log="12"]').textContent,/Fixture jacket/);
 assert.equal(f.view.querySelector('[data-ap-log="13"]'),null,'Results stay paired rather than duplicating the activity row');
});

test('the compact activity limit includes recent tool errors in event order',async t=>{
 const events=Array.from({length:12},(_,index)=>event(index+1,'tool_call','shopify.products'));
 events.push(event(13,'error','shopify.products'));
 const f=await fixture(t,events),rows=[...f.view.querySelectorAll('[data-ap-log]')];
 assert.equal(rows.length,12);assert.equal(rows[0].dataset.apLog,'13');assert.equal(rows.at(-1).dataset.apLog,'2');
});
