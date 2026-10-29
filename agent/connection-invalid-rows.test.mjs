import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {connectionStatus} from './public/connection-status.js';
const source=readFileSync(new URL('./public/app.js',import.meta.url),'utf8');
const snippets=[source.slice(source.indexOf('async function tryGet(path){'),source.indexOf('// Connections: use')),source.slice(source.indexOf('function connRows(){'),source.indexOf('function renderShell(){')),source.slice(source.indexOf('async function loadConns(refresh){'),source.indexOf('// The right rail has three tabs.'))].join('\n');
const checked={id:'gmail',name:'Gmail',on:true,ok:true,verification:'verified',checkedAt:'2026-10-29T12:00:00Z'};
function fixture(t,{initial=[checked],responses=[]}={}){
 const dom=new JSDOM('<section id="connbody"></section>');t.after(()=>dom.window.close());const {document}=dom.window,state={conns:initial,connsApi:Array.isArray(initial),config:{integrations:[{id:'gmail',name:'Gmail',on:true}]}},notices=[],paths=[];let context;
 context=vm.createContext({document,state,connectionStatus,$:s=>document.querySelector(s),esc:String,ic:()=>'',logoImg:()=>'',ago:String,toast:(...a)=>notices.push(a),fetch:async path=>{paths.push(path);assert.ok(responses.length);return Response.json(responses.shift());},renderShell:()=>context.paintConns()});
 vm.runInContext(snippets,context);context.paintConns();return {document,state,notices,paths,responses,load:context.loadConns,body:()=>document.querySelector('#connbody')};
}

test('a null connection row cannot break the shell or replace checked results',async t=>{
 const f=fixture(t,{responses:[[null]]}),before=f.state.conns;await assert.doesNotReject(f.load(true));assert.equal(f.state.conns,before);assert.match(f.body().textContent,/Connected/);assert.equal(f.notices.length,1);assert.equal(f.document.querySelector('#connrefresh').disabled,false);
});
test('primitive and array rows are rejected instead of replacing provider records',async t=>{
 const f=fixture(t,{responses:[[false],[42],['invalid'],[[]]]}),before=f.state.conns;for(let i=0;i<4;i++){await f.load(true);assert.equal(f.state.conns,before);assert.equal(f.document.querySelector('#connrefresh').disabled,false);}assert.equal(f.notices.length,4);
});
test('a mixed response does not partially replace known data before an invalid row fails',async t=>{
 const f=fixture(t,{responses:[{connections:[{...checked,checkedAt:'new-but-invalid-batch'},null]}]}),before=f.state.conns;await assert.doesNotReject(f.load(true));assert.equal(f.state.conns,before);assert.equal(f.state.conns[0].checkedAt,checked.checkedAt);
});
test('an invalid initial row retains unchecked fallback rather than claiming API data',async t=>{
 const f=fixture(t,{initial:null,responses:[[null]]});await assert.doesNotReject(f.load(true));assert.equal(f.state.connsApi,false);assert.match(f.body().textContent,/Not checked/);assert.equal(f.document.querySelector('#connrefresh'),null);assert.equal(f.notices.length,1);
});
test('a valid retry after malformed rows replaces retained status and restores the control',async t=>{
 const f=fixture(t,{responses:[[null],{connections:[{...checked,verification:'network_error',ok:false}]}]});await assert.doesNotReject(f.load(true));await f.load(true);assert.match(f.body().textContent,/Network/);assert.equal(f.state.conns[0].verification,'network_error');assert.equal(f.document.querySelector('#connrefresh').disabled,false);assert.equal(f.notices.length,1);
});
test('background malformed rows keep checked results without an alert',async t=>{
 const f=fixture(t,{responses:[[null]]}),before=f.state.conns;await assert.doesNotReject(f.load());assert.equal(f.state.conns,before);assert.equal(f.notices.length,0);
});
test('valid unfamiliar provider objects remain accepted with their explicit verification',async t=>{
 const f=fixture(t,{responses:[{connections:[{id:'fixture_provider',name:'Fixture provider',on:true,ok:true,verification:'configured'}]}]});await f.load(true);assert.equal(f.state.conns[0].id,'fixture_provider');assert.match(f.body().textContent,/Configured/);assert.match(f.body().textContent,/0 verified · 1 ready/);assert.equal(f.notices.length,0);
});
