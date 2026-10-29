import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';

const source=readFileSync(new URL('./public/app.js',import.meta.url),'utf8');
const sendSource=source.slice(source.indexOf('async function sendComposer(){'),source.indexOf('// Speech:'));
const syncSource=source.slice(source.indexOf('function syncComposer(){'),source.indexOf('function closeMenus(){'));
const html='<form id="composer"><textarea name="message"></textarea><button id="csend" type="button"></button><button id="cdictate" type="button"></button></form>';
function fixture(t){
 const dom=new JSDOM(`<main>${html}</main>`,{url:'http://fixture.test/#/home'});t.after(()=>dom.window.close());
 const {document}=dom.window;Object.defineProperty(dom.window.HTMLFormElement.prototype,'message',{get(){return this.elements.namedItem('message');}});
 const comp={tool:'mission',files:[],links:[],busy:false},thread={ok:true,messages:[],thinking:false},requests=[],notices=[];
 const context=vm.createContext({document,location:dom.window.location,comp,thread,listening:null,$:selector=>document.querySelector(selector),ic:()=>'',
  currentModel:()=> 'fixture-model',tab:()=>dom.window.location.hash.slice(2),paintThread:()=>{},voice:{speak:()=>{}},toast:(...args)=>notices.push(args),
  api:(path,body)=>{assert.equal(path,'/api/assistant');return new Promise((resolve,reject)=>requests.push({body,resolve,reject}));}});
 vm.runInContext(syncSource+sendSource,context);
 return {document,comp,thread,requests,notices,send:context.sendComposer,input:()=>document.querySelector('textarea'),remount:()=>document.querySelector('main').innerHTML=html};
}

test('a failed assistant reply cannot overwrite a newer unsent message',async t=>{
 const f=fixture(t);f.input().value='First message';const pending=f.send();
 f.input().value='New unsent message';f.requests[0].reject(Error('Temporary failure'));await pending;
 assert.equal(f.input().value,'New unsent message');assert.equal(f.requests[0].body.message,'First message');
 assert.equal(f.comp.busy,false);assert.equal(f.thread.thinking,false);assert.equal(f.notices.at(-1)[0],'Temporary failure');
});

test('failed text is restored into an untouched replacement composer',async t=>{
 const f=fixture(t);f.input().value='Retry this message';const pending=f.send();f.remount();
 f.requests[0].reject(Error('Temporary failure'));await pending;
 assert.equal(f.input().value,'Retry this message');assert.equal(f.document.querySelector('#csend').disabled,false);
});

test('failed text remains retryable when the composer was left empty',async t=>{
 const f=fixture(t);f.input().value='Retry this message';const pending=f.send();
 f.requests[0].reject(Error('Temporary failure'));await pending;
 assert.equal(f.input().value,'Retry this message');const retry=f.send();
 assert.equal(f.requests[1].body.message,'Retry this message');f.requests[1].resolve({reply:'Fixture response'});await retry;
 assert.equal(f.input().value,'');assert.equal(f.thread.messages.at(-1).text,'Fixture response');
});

test('successful replies preserve the next draft and repeated send stays blocked while waiting',async t=>{
 const f=fixture(t);f.input().value='First message';const pending=f.send();f.input().value='Next draft';
 await f.send();assert.equal(f.requests.length,1);f.requests[0].resolve({reply:'Fixture response'});await pending;
 assert.equal(f.input().value,'Next draft');assert.equal(f.document.querySelector('#csend').disabled,false);
});

test('a late reply failure leaves a different page untouched',async t=>{
 const f=fixture(t);f.input().value='First message';const pending=f.send();
 f.document.querySelector('main').innerHTML='<h2>Current task</h2>';f.requests[0].reject(Error('Temporary failure'));await pending;
 assert.equal(f.document.querySelector('main').textContent,'Current task');assert.equal(f.comp.busy,false);
});

for(const kind of ['files','links'])test(`a failed reply does not mix retry text into a new ${kind} draft`,async t=>{
 const f=fixture(t);f.input().value='First message';const pending=f.send();
 f.comp[kind].push(kind==='files'?{id:'new-reference',uploading:false}:'https://next.example');
 f.requests[0].reject(Error('Temporary failure'));await pending;
 assert.equal(f.input().value,'');assert.equal(f.comp[kind].length,1);
});

test('a failed reply does not populate a different composer mode',async t=>{
 const f=fixture(t);f.input().value='Find brands';const pending=f.send();f.comp.tool='shot';f.remount();
 f.requests[0].reject(Error('Temporary failure'));await pending;assert.equal(f.input().value,'');
});
