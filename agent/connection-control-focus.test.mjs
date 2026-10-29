import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {connectionStatus} from './public/connection-status.js';
const source=readFileSync(new URL('./public/app.js',import.meta.url),'utf8');
const snippets=[source.slice(source.indexOf('async function tryGet(path){'),source.indexOf('// Connections: use')),source.slice(source.indexOf('function connRows(){'),source.indexOf('function renderShell(){')),source.slice(source.indexOf('async function loadConns(refresh){'),source.indexOf('// The right rail has three tabs.'))].join('\n');
const row={id:'gmail',name:'Gmail',on:true,ok:true,verification:'verified',checkedAt:'2026-10-29T15:48:00Z'};
function fixture(t){
 const dom=new JSDOM('<button id="outside">Outside</button><section id="connbody"></section>');t.after(()=>dom.window.close());
 const {document}=dom.window,state={conns:[row],connsApi:true,config:{integrations:[]}},requests=[],notices=[];let context;
 context=vm.createContext({document,state,connectionStatus,$:s=>document.querySelector(s),esc:String,ic:()=>'',logoImg:()=>'',ago:String,
  toast:(...a)=>notices.push(a),fetch:path=>new Promise(resolve=>requests.push({path,resolve})),renderShell:()=>context.paintConns()});
 vm.runInContext(snippets,context);context.paintConns();
 return {document,state,requests,notices,paint:context.paintConns,load:context.loadConns,button:()=>document.querySelector('#connrefresh')};
}

test('background connection refresh preserves focus on Check again',async t=>{
 const f=fixture(t),button=f.button();button.focus();const pending=f.load();
 f.requests[0].resolve(Response.json([row]));await pending;
 assert.equal(f.document.activeElement,f.button());assert.equal(f.button(),button);
});

test('unrelated shell repaints retain the focused connection control',t=>{
 const f=fixture(t),button=f.button();button.focus();f.paint();f.paint();
 assert.equal(f.button(),button);assert.equal(f.document.activeElement,button);
});

test('failed manual check reuses its control through pending shell repaints and retry',async t=>{
 const f=fixture(t),button=f.button();button.focus();const pending=button.onclick();f.paint();
 assert.equal(f.button(),button);assert.equal(button.disabled,true);
 f.requests[0].resolve(new Response('',{status:503}));await pending;
 assert.equal(f.button(),button);assert.equal(button.disabled,false);assert.equal(f.notices.length,1);
 const retry=button.onclick();assert.equal(f.requests.length,2);f.requests[1].resolve(Response.json([row]));await retry;
 assert.equal(f.button(),button);assert.equal(button.disabled,false);
});

test('a focused outside control stays focused while connection rows change',async t=>{
 const f=fixture(t),outside=f.document.querySelector('#outside');outside.focus();const pending=f.load();
 f.requests[0].resolve(Response.json([{...row,verification:'network_error',ok:false}]));await pending;
 assert.equal(f.document.activeElement,outside);assert.match(f.document.querySelector('#connbody').textContent,/Network/);
});

test('transitioning to unchecked fallback removes only the refresh control',t=>{
 const f=fixture(t);f.state.conns=null;f.state.connsApi=false;f.state.config.integrations=[row];f.paint();
 assert.equal(f.button(),null);assert.match(f.document.querySelector('#connbody').textContent,/Not checked/);
 f.state.conns=[row];f.state.connsApi=true;f.paint();
 assert.equal(f.document.querySelectorAll('#connrefresh').length,1);assert.equal(typeof f.button().onclick,'function');
});
