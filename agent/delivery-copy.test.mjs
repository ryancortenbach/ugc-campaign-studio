import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {paintDelivery} from './public/delivery.js';
async function fixture(t,{clipboard='deny'}={}){
 const dom=new JSDOM('<button id="outside">Outside</button><section></section>'),previous=Object.getOwnPropertyDescriptor(globalThis,'navigator'),calls=[],notices=[],writes=[],pending=[];let active=true;
 const writeText=text=>{writes.push(text);if(clipboard==='deny')return Promise.reject(Error('Denied'));if(clipboard==='hold')return new Promise((resolve,reject)=>pending.push({resolve,reject}));return Promise.resolve();};
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:clipboard==='absent'?{}:{clipboard:{writeText}}});
 t.after(()=>{dom.window.close();if(previous)Object.defineProperty(globalThis,'navigator',previous);else delete globalThis.navigator;});
 const {document}=dom.window,el=document.querySelector('section'),data={shots:[{renderId:1,title:'Fixture shot'}],ready:true,order:{buyerEmail:'buyer@example.invalid'},setup:{ffmpeg:true,storage:true},final:{url:'/renders/fixture.mp4',at:'2026-10-29T20:00:00Z',bytes:1024,stale:false},delivery:{link:'https://fixture.example/download',expiresAt:'2026-11-05T20:00:00Z',draftUrl:null,email:{subject:'Fixture subject',body:'Fixture body'},stale:false}};
 const paint=()=>paintDelivery({el,esc:String,paymentId:'pay_fixture',isCurrent:()=>active,toast:(...a)=>notices.push(a),api:async(path,body)=>{assert.equal(path,'/api/whop/orders/pay_fixture/delivery');assert.equal(body,undefined);calls.push(path);return structuredClone(data);}});await paint();
 const target=kind=>el.querySelector(kind==='link'?'.od-link input':'.od-email');
 const copy=kind=>{const b=el.querySelector(`[data-copy="${kind}"]`);b.focus();return b.onclick();};
 return {document,el,data,calls,notices,writes,pending,paint,target,copy,leave:()=>{active=false;el.innerHTML='<h2>Current page</h2>';}};
}
for(const kind of ['link','email'])test(`denied ${kind} copy focuses and selects the complete manual fallback`,async t=>{
 const f=await fixture(t);await f.copy(kind);const field=f.target(kind);assert.equal(f.document.activeElement,field);assert.equal(field.selectionStart,0);assert.equal(field.selectionEnd,field.value.length);assert.equal(f.writes[0],field.value);assert.equal(f.notices.at(-1)[0],'Press Command-C to copy');assert.equal(f.calls.length,1);
});
test('missing Clipboard API still focuses the manual download link',async t=>{
 const f=await fixture(t,{clipboard:'absent'});await f.copy('link');assert.equal(f.document.activeElement,f.target('link'));assert.equal(f.target('link').selectionEnd,f.target('link').value.length);assert.equal(f.writes.length,0);
});
test('successful clipboard copying retains the button focus and exact email text',async t=>{
 const f=await fixture(t,{clipboard:'ok'});await f.copy('email');assert.equal(f.writes[0],'Subject: Fixture subject\n\nFixture body');assert.equal(f.notices.at(-1)[0],'Copied');assert.equal(f.document.activeElement,f.el.querySelector('[data-copy="email"]'));assert.equal(f.calls.length,1);
});
test('a late clipboard rejection cannot select or notify on a departed page',async t=>{
 const f=await fixture(t,{clipboard:'hold'}),pending=f.copy('link');f.leave();const outside=f.document.querySelector('#outside');outside.focus();f.pending[0].reject(Error('Denied late'));await pending;assert.equal(f.document.activeElement,outside);assert.equal(f.notices.length,0);assert.equal(f.el.textContent,'Current page');
});
test('moving focus while clipboard permission is pending preserves the newer selection',async t=>{
 const f=await fixture(t,{clipboard:'hold'}),field=f.target('link');field.setSelectionRange(0,0);const pending=f.copy('link'),outside=f.document.querySelector('#outside');outside.focus();f.pending[0].reject(Error('Denied late'));await pending;assert.equal(f.document.activeElement,outside);assert.equal(field.selectionEnd,0);assert.equal(f.notices.length,0);
});
test('an old clipboard failure cannot select a replacement delivery link in the same host',async t=>{
 const f=await fixture(t,{clipboard:'hold'}),pending=f.copy('link');f.data.delivery.link='https://fixture.example/new-download';await f.paint();const field=f.target('link');field.setSelectionRange(0,0);field.focus();f.pending[0].reject(Error('Old copy rejected'));await pending;assert.equal(field.value,'https://fixture.example/new-download');assert.equal(field.selectionEnd,0);assert.equal(f.document.activeElement,field);assert.equal(f.notices.length,0);
});
