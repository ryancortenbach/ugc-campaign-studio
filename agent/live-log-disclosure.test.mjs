import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {buildGroups,pairTools} from './public/live-feed-model.js';
import {toolLogDetails} from './public/tool-logs.js';
const source=readFileSync(new URL('./public/app.js',import.meta.url),'utf8');
const snippet=source.slice(source.indexOf('const toolLabels='),source.indexOf('const video='));
const event=(id,type='tool_call',over={})=>({id,type,task_id:2,lead_id:3,tool:'catalog.read',title:`Fixture step ${id}`,at:'2026-10-29T20:31:00Z',data:{callId:`fixture-${id}`,input:{page:id}},...over});
function fixture(t,events=[event(1)]){
 const dom=new JSDOM('<button id="outside">Outside</button><nav id="rtabs"><button data-rtab="live">Live</button></nav><main id="livefeed"></main>');t.after(()=>dom.window.close());
 const {document}=dom.window,state={live:structuredClone(events).reverse(),tasks:[],lastStep:new Map(),sdata:new Map(),openKids:new Set()},esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const context=vm.createContext({document,state,$:s=>document.querySelector(s),buildGroups,pairTools,toolLogDetails,esc,URL,brandSvg:new Set(),icons:{},logoFor:()=>null,logoSrc:()=>'',logoTile:()=>'',eventNotification:()=>null,time:()=>'',clearTimeout,setTimeout,api:()=>assert.fail('No API calls'),location:{}});
 vm.runInContext(snippet+'\nthis.paint=renderLive;',context);context.paint();
 const row=id=>document.querySelector(`[data-kid="${id}"]`),open=id=>{const button=row(id).querySelector('.kd-main');button.focus();button.click();return row(id);};
 return {document,state,row,open,paint:context.paint,append:e=>{state.live.unshift(structuredClone(e));context.paint();},payload:id=>row(id).querySelector('.ap-log-payload')};
}
test('opening and closing a Live tool retains focus on its replacement button',t=>{
 const f=fixture(t);f.open(1);assert.equal(f.document.activeElement,f.row(1).querySelector('.kd-main'));f.row(1).querySelector('.kd-main').click();assert.equal(f.document.activeElement,f.row(1).querySelector('.kd-main'));assert.equal(f.row(1).classList.contains('open'),false);
});
test('new activity retains expanded Input and its summary focus',t=>{
 const f=fixture(t);f.open(1);const input=f.payload(1);input.open=true;input.querySelector('summary').focus();f.append(event(2,'decision',{data:{}}));assert.equal(f.payload(1).open,true);assert.equal(f.document.activeElement,f.payload(1).querySelector('summary'));
});
test('a newly paired failure preserves Input while its new Error starts collapsed',t=>{
 const f=fixture(t);f.open(1);f.payload(1).open=true;f.payload(1).querySelector('summary').focus();f.append(event(2,'tool_result',{data:{callId:'fixture-1',status:'error',error:'Fixture error'}}));const details=[...f.row(1).querySelectorAll('.ap-log-payload')];assert.equal(details[0].open,true);assert.equal(details[1].querySelector('summary').textContent,'Error');assert.equal(details[1].open,false);assert.equal(f.document.activeElement,details[0].querySelector('summary'));
});
test('an explicitly collapsed payload stays collapsed on a later repaint',t=>{
 const f=fixture(t);f.open(1);f.payload(1).open=true;f.paint();f.payload(1).open=false;f.append(event(2,'decision',{data:{}}));assert.equal(f.payload(1).open,false);assert.equal(f.row(1).classList.contains('open'),true);
});
test('another tool starts closed instead of inheriting a different event disclosure',t=>{
 const f=fixture(t);f.open(1);f.payload(1).open=true;f.append(event(2,'tool_call',{lead_id:9}));assert.equal(f.row(2).classList.contains('open'),false);assert.equal(f.row(2).querySelector('.ap-log-payload'),null);
});
test('pruning an inspected tool returns focus to the Live tab',t=>{
 const f=fixture(t);f.open(1);f.payload(1).open=true;f.payload(1).querySelector('summary').focus();f.state.live=Array.from({length:41},(_,i)=>event(i+2,'decision',{lead_id:i+20,data:{}})).reverse().concat(f.state.live);f.paint();assert.equal(f.row(1),null);assert.equal(f.document.activeElement,f.document.querySelector('[data-rtab="live"]'));
});
test('a Live repaint leaves outside focus untouched',t=>{
 const f=fixture(t);f.open(1);f.payload(1).open=true;const outside=f.document.querySelector('#outside');outside.focus();f.append(event(2,'decision',{data:{}}));assert.equal(f.document.activeElement,outside);
});
