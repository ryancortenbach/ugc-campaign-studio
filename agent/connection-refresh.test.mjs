import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {connectionStatus} from './public/connection-status.js';

const source=readFileSync(new URL('./public/app.js',import.meta.url),'utf8');
const getSource=source.slice(source.indexOf('async function tryGet(path){'),source.indexOf('// Connections: use'));
const rowsSource=source.slice(source.indexOf('function connRows(){'),source.indexOf('function renderShell(){'));
const refreshSource=source.slice(source.indexOf('async function loadConns(refresh){'),source.indexOf('// The right rail has three tabs.'));
const row=(checkedAt,verification='verified')=>({id:'gmail',name:'Gmail',on:true,ok:verification==='verified',verification,checkedAt,detail:`Fixture ${checkedAt}`});
function fixture(t,{fetch,initial=[row('2026-10-27T12:00:00Z')]}={}){
 const dom=new JSDOM('<section id="connbody"></section>');t.after(()=>dom.window.close());
 const {document}=dom.window,notices=[],state={conns:initial,connsApi:Array.isArray(initial),config:{integrations:[{id:'gmail',name:'Gmail',on:true}]}};
 let context;context=vm.createContext({document,state,fetch,connectionStatus,$:selector=>document.querySelector(selector),esc:String,ic:()=>'',logoImg:()=>'',ago:String,
  toast:(...args)=>notices.push(args),renderShell:()=>context.paintConns()});
 vm.runInContext(getSource+rowsSource+refreshSource,context);context.paintConns();
 return {document,state,notices,load:context.loadConns};
}

test('failed manual refresh retains checked results and an enabled retry control',async t=>{
 const f=fixture(t,{fetch:async()=>new Response('',{status:503})});
 const before=f.state.conns;await f.document.querySelector('#connrefresh').onclick();
 assert.equal(f.state.conns,before);assert.equal(f.state.connsApi,true);
 assert.equal(f.document.querySelector('#connrefresh').disabled,false);
 assert.equal(f.document.querySelector('#connrefresh').classList.contains('spin'),false);
 assert.match(f.document.querySelector('#connbody').textContent,/Connected/);assert.equal(f.notices.length,1);
});

test('network failure preserves results and a later retry replaces them',async t=>{
 let fail=true;const fresh=row('2026-10-27T13:00:00Z','network_error');
 const f=fixture(t,{fetch:async()=>{if(fail)throw Error('Offline');return Response.json({connections:[fresh]});}});
 await f.document.querySelector('#connrefresh').onclick();fail=false;
 await f.document.querySelector('#connrefresh').onclick();
 assert.equal(f.state.conns[0].checkedAt,fresh.checkedAt);assert.match(f.document.querySelector('#connbody').textContent,/Network/);
});

test('an older response cannot overwrite a completed newer connection check',async t=>{
 const requests=[],f=fixture(t,{fetch:()=>new Promise(resolve=>requests.push(resolve))});
 const old=f.load(),fresh=f.load(true),newRow=row('2026-10-27T14:00:00Z','network_error');
 requests[1](Response.json([newRow]));await fresh;
 requests[0](Response.json([row('2026-10-27T13:00:00Z')]));await old;
 assert.equal(f.state.conns[0].checkedAt,newRow.checkedAt);assert.match(f.document.querySelector('#connbody').textContent,/Network/);
});

test('background refresh failure preserves checked results quietly',async t=>{
 const f=fixture(t,{fetch:async()=>new Response('',{status:500})}),before=f.state.conns;
 await f.load();assert.equal(f.state.conns,before);assert.equal(f.notices.length,0);
});

test('a missing initial connection endpoint retains the legacy unchecked fallback',async t=>{
 const f=fixture(t,{fetch:async()=>new Response('',{status:404}),initial:null});
 await f.load();assert.equal(f.state.connsApi,false);assert.equal(f.document.querySelector('#connrefresh'),null);
 assert.match(f.document.querySelector('#connbody').textContent,/Not checked/);assert.equal(f.notices.length,0);
});
