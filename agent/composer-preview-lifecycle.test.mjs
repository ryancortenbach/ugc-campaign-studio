import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const source=readFileSync(new URL('./public/app.js',import.meta.url),'utf8');
const attachSource=source.slice(source.indexOf('function attachHTML(){'),source.indexOf('function composerHTML(){'));
const uploadSource=source.slice(source.indexOf('function bindAttach(){'),source.indexOf('async function sendComposer(){'));
const sendSource=source.slice(source.indexOf('async function sendComposer(){'),source.indexOf('// Speech:'));
const file={name:'fixture.png',type:'image/png',size:20};
function fixture(t,{readFail=false,uploadFail=false,holdUpload=false}={}){
 const dom=new JSDOM('<main><div id="cfiles"></div><form id="composer"><textarea name="message"></textarea></form></main>',{url:'https://fixture.example/#/home'});t.after(()=>dom.window.close());const {document}=dom.window;
 Object.defineProperty(dom.window.HTMLFormElement.prototype,'message',{get(){return this.elements.namedItem('message');}});
 const active=new Set(),revoked=[],comp={tool:'mission',files:[],links:[],busy:false},requests=[],uploads=[],notices=[];let n=0;
 const context=vm.createContext({document,location:dom.window.location,comp,thread:{ok:true},$:s=>document.querySelector(s),esc:String,ic:()=>'',syncComposer:()=>{},currentModel:()=> 'fixture-model',modelInfo:{'fixture-model':['Fixture']},tab:()=> 'home',paintThread:()=>{},voice:{speak:()=>{}},toast:(...a)=>notices.push(a),
  URL:{createObjectURL:()=>{const url='blob:fixture-'+(++n);active.add(url);return url;},revokeObjectURL:url=>{revoked.push(url);active.delete(url);}},
  FileReader:class{readAsDataURL(){if(readFail){this.onerror();return;}this.result='data:image/png;base64,fixture';this.onload();}},
  api:(path,body)=>{if(path==='/api/uploads'){uploads.push(body);if(holdUpload)return new Promise((resolve,reject)=>uploads.at(-1).complete={resolve,reject});if(uploadFail)return Promise.reject(Error('Mock upload failed'));return Promise.resolve({upload:{id:'upload-'+uploads.length}});}assert.equal(path,'/api/chat');return new Promise((resolve,reject)=>requests.push({body,resolve,reject}));}});
 vm.runInContext(attachSource+uploadSource+sendSource,context);document.querySelector('textarea').value='Inspect this fixture';
 return {document,comp,active,revoked,requests,uploads,notices,add:()=>context.addFiles([file]),send:context.sendComposer,remove:()=>document.querySelector('[data-unfile]').click(),redraw:()=>{document.querySelector('#cfiles').innerHTML=context.attachHTML();context.bindAttach();}};
}

test('uploaded image preview stays available until its attachment is removed',async t=>{
 const f=fixture(t);await f.add();assert.equal(f.active.size,1);assert.equal(f.revoked.length,0);f.remove();assert.equal(f.comp.files.length,0);assert.equal(f.active.size,0);assert.equal(f.revoked.length,1);
});
test('read failure releases its discarded image preview without an upload',async t=>{
 const f=fixture(t,{readFail:true});await f.add();assert.equal(f.comp.files.length,0);assert.equal(f.uploads.length,0);assert.equal(f.active.size,0);assert.equal(f.revoked.length,1);
});
test('upload failure releases its discarded image preview',async t=>{
 const f=fixture(t,{uploadFail:true});await f.add();assert.equal(f.comp.files.length,0);assert.equal(f.active.size,0);assert.equal(f.revoked.length,1);
});
test('removed pending preview is released only once if its upload later fails',async t=>{
 const f=fixture(t,{holdUpload:true}),pending=f.add();await Promise.resolve();f.remove();f.uploads[0].complete.reject(Error('Mock late upload failure'));await pending;assert.equal(f.active.size,0);assert.equal(f.revoked.length,1);
});
test('successful mocked task creation releases cleared attachment previews',async t=>{
 const f=fixture(t);await f.add();const pending=f.send();f.requests[0].resolve({task:{id:1}});await pending;assert.equal(f.comp.files.length,0);assert.equal(f.active.size,0);assert.equal(f.revoked.length,1);assert.equal(f.notices.some(n=>n[1]==='bad'),false);
});
test('failed mocked task creation retains previews until explicit retry succeeds',async t=>{
 const f=fixture(t);await f.add();const pending=f.send();f.requests[0].reject(Error('Mock task request failed'));await pending;assert.equal(f.comp.files.length,1);assert.equal(f.active.size,1);assert.equal(f.revoked.length,0);const retry=f.send();f.requests[1].resolve({task:{id:1}});await retry;assert.equal(f.active.size,0);
});
test('redrawing attached image markup does not prematurely release its preview',async t=>{
 const f=fixture(t);await f.add();f.document.querySelector('#cfiles').innerHTML='';f.redraw();assert.equal(f.active.size,1);assert.equal(f.revoked.length,0);assert.match(f.document.querySelector('.cfile img').getAttribute('src'),/^blob:fixture-/);
});
test('repeated add and remove cycles do not accumulate object URLs',async t=>{
 const f=fixture(t);for(let i=0;i<12;i++){await f.add();f.remove();}assert.equal(f.active.size,0);assert.equal(f.revoked.length,12);assert.equal(f.comp.files.length,0);
});
