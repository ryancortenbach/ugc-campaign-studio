import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';

const source=readFileSync(new URL('./public/app.js',import.meta.url),'utf8');
const handlerSource=source.slice(source.indexOf("$('#view').addEventListener('submit',async e=>{"),source.indexOf('// Whop orders:'));
const paintSource=source.slice(source.indexOf('function paintBody(g){'),source.indexOf('async function toggleSess(key){'));
const bodySource=source.slice(source.indexOf('function sessBody(g){'),source.indexOf('const bodyEl='));
const formHTML='<form data-steer="fixture"><input name="message"><button type="submit">Send</button></form>';
function fixture(t,{loadSession=async()=>{}}={}){
 const dom=new JSDOM(`<main id="view"><section id="session">${formHTML}</section></main>`);t.after(()=>dom.window.close());
 const {document}=dom.window,requests=[],notices=[],group={key:'fixture',live:[{id:17}],runs:[{id:17}]};
 Object.defineProperty(dom.window.HTMLFormElement.prototype,'message',{get(){return this.elements.namedItem('message');}});
 let handler;const view=document.querySelector('#view');view.addEventListener=(type,listener)=>{if(type==='submit')handler=listener;};
 const context=vm.createContext({document,$:selector=>document.querySelector(selector),groupByKey:key=>key==='fixture'?group:null,
  api:(path,body)=>new Promise((resolve,reject)=>requests.push({path,body,resolve,reject})),toast:(...args)=>notices.push(args),loadSession,
  bodyEl:()=>document.querySelector('#session'),state:{logOpen:new Set(),tasks:[]},leadsHTML:()=>'',threadHTML2:()=>'',ic:()=>'',consoleHTML:()=>''});
 vm.runInContext(bodySource+paintSource+handlerSource,context);
 return {document,requests,notices,form:()=>document.querySelector('form'),repaint:()=>context.paintBody(group),submit:form=>handler({target:form,preventDefault(){}})};
}

test('repeated steering submit while saving produces one request',async t=>{
 const f=fixture(t),form=f.form();form.message.value='First direction';
 const first=f.submit(form),second=f.submit(form);
 assert.equal(f.requests.length,1);assert.equal(form.querySelector('button').disabled,true);
 f.requests[0].resolve({live:true});await Promise.all([first,second]);
 assert.equal(f.form().message.value,'');assert.equal(f.form().querySelector('button').disabled,false);
});

test('a successful steer preserves newer input through the session refresh',async t=>{
 const f=fixture(t),form=f.form();form.message.value='  First direction  ';
 const pending=f.submit(form);form.message.value='New unsent direction';
 f.requests[0].resolve({live:true});await pending;
 assert.equal(f.requests[0].path,'/api/tasks/17/steer');assert.equal(f.requests[0].body.message,'First direction');
 assert.equal(f.form().message.value,'New unsent direction');
 const next=f.submit(f.form());assert.equal(f.requests[1].body.message,'New unsent direction');f.requests[1].resolve({live:false});await next;
 assert.equal(f.form().message.value,'');assert.equal(f.notices.at(-1)[0],'Saved');
});

test('edits made during the refresh remain unsent and visible',async t=>{
 let enter,release;const refreshing=new Promise(resolve=>enter=resolve),gate=new Promise(resolve=>release=resolve);
 const f=fixture(t,{loadSession:async()=>{enter();await gate;}}),form=f.form();form.message.value='Direction';
 const pending=f.submit(form);f.requests[0].resolve({live:true});await refreshing;
 form.message.value='Typed during refresh';release();await pending;
 assert.equal(f.form().message.value,'Typed during refresh');
});

test('a failed steer retains text and permits an explicit retry',async t=>{
 const f=fixture(t),form=f.form();form.message.value='Keep this direction';
 const pending=f.submit(form);f.requests[0].reject(Error('Temporary failure'));await pending;
 assert.equal(f.form().message.value,'Keep this direction');assert.equal(form.querySelector('button').disabled,false);
 assert.equal(f.notices.at(-1)[0],'Temporary failure');
 const retry=f.submit(form);f.requests[1].resolve({live:true});await retry;assert.equal(f.form().message.value,'');
});

test('completion from a detached steering form does not repaint a newer session form',async t=>{
 const f=fixture(t),form=f.form();form.message.value='Old direction';const pending=f.submit(form);
 f.document.querySelector('#session').innerHTML=formHTML;f.form().message.value='Current unsent text';const current=f.form();
 f.requests[0].resolve({live:true});await pending;
 assert.equal(f.form(),current);assert.equal(current.message.value,'Current unsent text');
});

test('a session repaint cannot bypass the pending steering submission',async t=>{
 const f=fixture(t),form=f.form();form.message.value='One direction';const pending=f.submit(form);
 f.repaint();const current=f.form();assert.notEqual(current,form);
 const duplicate=f.submit(current);assert.equal(f.requests.length,1);
 assert.equal(current.querySelector('button').disabled,true);
 current.message.value='Next unsent direction';f.requests[0].resolve({live:true});await Promise.all([pending,duplicate]);
 assert.equal(f.form(),current);assert.equal(current.message.value,'Next unsent direction');
 assert.equal(current.querySelector('button').disabled,false);
});

test('a remounted unchanged draft clears after success and recovers after failure',async t=>{
 const f=fixture(t);f.form().message.value='Direction';const pending=f.submit(f.form());
 f.repaint();f.requests[0].resolve({live:true});await pending;
 assert.equal(f.form().message.value,'');assert.equal(f.form().querySelector('button').disabled,false);
 f.form().message.value='Retry direction';const failed=f.submit(f.form());f.repaint();
 f.requests[1].reject(Error('Temporary failure'));await failed;
 assert.equal(f.form().message.value,'Retry direction');assert.equal(f.form().querySelector('button').disabled,false);
 const retry=f.submit(f.form());assert.equal(f.requests[2].body.message,'Retry direction');f.requests[2].resolve({live:false});await retry;
 assert.equal(f.form().message.value,'');
});
