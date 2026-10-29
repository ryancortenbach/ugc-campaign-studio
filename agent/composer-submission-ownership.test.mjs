import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const source=readFileSync(new URL('./public/app.js',import.meta.url),'utf8'),sendSource=source.slice(source.indexOf('async function sendComposer(){'),source.indexOf('// Speech:'));
const html='<form id="composer"><textarea name="message"></textarea><div id="clink" hidden><input type="url"></div></form>';
function fixture(t,{tool='mission'}={}){
 const dom=new JSDOM('<main>'+html+'</main>',{url:'https://fixture.example/#/home'});t.after(()=>dom.window.close());const {document}=dom.window;
 Object.defineProperty(dom.window.HTMLFormElement.prototype,'message',{get(){return this.elements.namedItem('message');}});
 const first={id:'old-file',key:'old',uploading:false,preview:'blob:old'},comp={tool,files:[first],links:['https://old.example'],busy:false},requests=[],revoked=[],notices=[];
 const context=vm.createContext({document,location:dom.window.location,comp,thread:{ok:true},$:s=>document.querySelector(s),syncComposer:()=>{},currentModel:()=> 'fixture-model',modelInfo:{'fixture-model':['Fixture']},tab:()=> 'home',paintThread:()=>{},voice:{speak:()=>{}},toast:(...a)=>notices.push(a),URL:{revokeObjectURL:url=>revoked.push(url)},api:(path,body)=>new Promise((resolve,reject)=>requests.push({path,body,resolve,reject}))});
 vm.runInContext(sendSource,context);document.querySelector('textarea').value='Original fixture message';
 const complete=()=>requests[0].resolve({task:{id:1},voices:[]});
 return {dom,document,comp,requests,revoked,notices,first,send:context.sendComposer,complete,input:()=>document.querySelector('textarea'),remount:()=>{document.querySelector('main').innerHTML=html;}};
}
for(const tool of ['mission','storyboard','shot'])test(`newer ${tool} text survives successful completion without forced navigation`,async t=>{
 const f=fixture(t,{tool}),pending=f.send();f.input().value='New unsent message';f.complete();await pending;assert.equal(f.input().value,'New unsent message');assert.equal(f.comp.files[0],f.first);assert.equal(f.revoked.length,0);assert.equal(f.dom.window.location.hash,'#/home');
});
test('newer attachment and reference link edits keep the complete next draft',async t=>{
 const f=fixture(t),pending=f.send(),next={id:'next-file',key:'next',uploading:false,preview:'blob:next'};f.comp.files.push(next);f.comp.links.push('https://next.example');f.complete();await pending;assert.equal(f.comp.files.length,2);assert.equal(f.comp.files[1],next);assert.deepEqual(f.comp.links,['https://old.example','https://next.example']);assert.equal(f.revoked.length,0);assert.deepEqual(Array.from(f.requests[0].body.attachments),['old-file']);assert.equal(f.dom.window.location.hash,'#/home');
});
test('a pending request cannot clear a replacement composer or its changed mode',async t=>{
 const f=fixture(t),pending=f.send();f.comp.tool='storyboard';f.remount();f.input().value='Replacement draft';f.complete();await pending;assert.equal(f.input().value,'Replacement draft');assert.equal(f.comp.files.length,1);assert.equal(f.revoked.length,0);assert.equal(f.dom.window.location.hash,'#/home');
});
test('successful completion after departure does not navigate back to its task',async t=>{
 const f=fixture(t),pending=f.send();f.dom.window.location.hash='#/leads';f.document.querySelector('main').innerHTML='<h2>Current Leads</h2>';f.complete();await pending;assert.equal(f.dom.window.location.hash,'#/leads');assert.equal(f.document.querySelector('h2').textContent,'Current Leads');assert.equal(f.comp.files.length,0);assert.deepEqual(f.revoked,['blob:old']);
});
test('an unsaved reference editor change prevents clearing and navigation',async t=>{
 const f=fixture(t),pending=f.send();f.document.querySelector('#clink').hidden=false;f.document.querySelector('#clink input').value='https://new-unsaved.example';f.complete();await pending;assert.equal(f.input().value,'Original fixture message');assert.equal(f.document.querySelector('#clink input').value,'https://new-unsaved.example');assert.equal(f.comp.files.length,1);assert.equal(f.revoked.length,0);assert.equal(f.dom.window.location.hash,'#/home');
});
test('unchanged successful submission still clears the submitted draft and opens its task',async t=>{
 const f=fixture(t),pending=f.send();f.complete();await pending;assert.equal(f.input().value,'');assert.equal(f.comp.files.length,0);assert.equal(f.comp.links.length,0);assert.deepEqual(f.revoked,['blob:old']);assert.equal(f.dom.window.location.hash,'#/tasks/1');
});
test('failed submission keeps the current draft and allows an explicit retry',async t=>{
 const f=fixture(t),pending=f.send();f.input().value='New draft after request';f.requests[0].reject(Error('Mock create failed'));await pending;assert.equal(f.input().value,'New draft after request');assert.equal(f.comp.files.length,1);assert.equal(f.revoked.length,0);assert.equal(f.comp.busy,false);assert.equal(f.dom.window.location.hash,'#/home');
});

test('a replacement composer in the same mode still owns its retained references',async t=>{
 const f=fixture(t),pending=f.send();f.remount();f.input().value='Original fixture message';f.complete();await pending;assert.equal(f.input().value,'Original fixture message');assert.equal(f.comp.files.length,1);assert.equal(f.revoked.length,0);assert.equal(f.dom.window.location.hash,'#/home');
});
test('reference-editor text present before submission stays available because it was not submitted',async t=>{
 const f=fixture(t);f.document.querySelector('#clink').hidden=false;f.document.querySelector('#clink input').value='https://unsaved-before.example';const pending=f.send();f.complete();await pending;assert.equal(f.document.querySelector('#clink input').value,'https://unsaved-before.example');assert.equal(f.input().value,'Original fixture message');assert.equal(f.comp.files.length,1);assert.equal(f.dom.window.location.hash,'#/home');
});
test('new raw text spacing is retained even when its trimmed message is unchanged',async t=>{
 const f=fixture(t),pending=f.send();f.input().value=' Original fixture message ';f.complete();await pending;assert.equal(f.input().value,' Original fixture message ');assert.equal(f.dom.window.location.hash,'#/home');
});
