import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {voicesView} from './public/voices.js';

const description='Warm American voice with a calm and measured delivery.';
const line='This is an original fixture sample for testing voice design. It contains enough characters to satisfy the minimum sample length.';
const boards=[{id:1,title:'First fixture',version:1,plan:{voice:description}},{id:2,title:'Second fixture',version:1,plan:{voice:'Bright British fixture voice with a lively delivery.'}}];
const turn=()=>new Promise(resolve=>setImmediate(resolve));
async function fixture(t,{delayRefresh=false,includeVoice=false}={}){
 const dom=new JSDOM('<main></main>'),previous=Object.getOwnPropertyDescriptor(globalThis,'window');globalThis.window=dom.window;
 t.after(()=>{dom.window.close();if(previous)Object.defineProperty(globalThis,'window',previous);else delete globalThis.window;});
 let confirmations=0,reads=0;dom.window.confirm=()=>{confirmations++;return true;};
 for(const name of ['description','line','storyboardId'])Object.defineProperty(dom.window.HTMLFormElement.prototype,name,{get(){return this.elements.namedItem(name);}});
 const view=dom.window.document.querySelector('main'),requests=[],refreshes=[];
 const api=async(path,body)=>{
  if(path==='/api/storyboards')return {storyboards:boards};
  if(path==='/api/voices'){reads++;if(delayRefresh&&reads>1)return new Promise(resolve=>refreshes.push(resolve));return {voices:includeVoice?[{id:1,name:'Existing fixture',description,line,status:'needs_checks',sample_file:'fixture.wav',created_at:'2026-10-29T06:00:00Z'}]:[],enabled:true};}
  if(path==='/api/voices/1/check')return {voice:{status:'checks_passed'}};
  assert.equal(path,'/api/voices/design');return new Promise((resolve,reject)=>requests.push({body,resolve:()=>resolve({voices:[]}),reject}));
 };
 await voicesView({view,api,esc:String,toast:()=>{},sbadge:()=>'',svg:()=>''});view.querySelector('#newvoicebtn').click();
 const form=()=>view.querySelector('#newvoice');form().description.value=description;form().line.value=line;
 return {view,form,requests,refreshes,confirmations:()=>confirmations,submit:()=>form().onsubmit({preventDefault(){}})};
}

test('newer voice form edits survive completion and still need an explicit design request',async t=>{
 const f=await fixture(t),pending=f.submit();f.form().description.value='A different voice direction for the next unsent design.';f.form().line.value=line+' Next draft.';
 f.requests[0].resolve();await pending;await turn();
 assert.equal(f.form().description.value,'A different voice direction for the next unsent design.');assert.equal(f.form().line.value,line+' Next draft.');assert.equal(f.view.querySelector('#newvoicecard').hidden,false);assert.equal(f.requests.length,1);
 const next=f.submit();assert.equal(f.requests[1].body.line,line+' Next draft.');assert.equal(f.confirmations(),2);f.requests[1].resolve();await next;await turn();
 assert.equal(f.form().line.value,'');assert.equal(f.view.querySelector('#newvoicecard').hidden,true);
});

test('edits made while the refreshed voice list is loading remain in the form',async t=>{
 const f=await fixture(t,{delayRefresh:true}),pending=f.submit();f.requests[0].resolve();await turn();assert.equal(f.refreshes.length,1);
 f.view.querySelector('#newvoicebtn').click();f.form().description.value='Late edit while previews are being refreshed.';f.form().line.value=line+' Written during refresh.';
 f.refreshes[0]({voices:[],enabled:true});await pending;await turn();
 assert.equal(f.form().description.value,'Late edit while previews are being refreshed.');assert.equal(f.form().line.value,line+' Written during refresh.');assert.equal(f.view.querySelector('#newvoicecard').hidden,false);
});

test('an unchanged submitted design clears its form after success',async t=>{
 const f=await fixture(t),pending=f.submit();f.requests[0].resolve();await pending;await turn();
 assert.equal(f.form().description.value,'');assert.equal(f.form().line.value,'');assert.equal(f.view.querySelector('#newvoicecard').hidden,true);assert.equal(f.requests.length,1);
});

test('a failed design preserves the current draft and restores its submit control',async t=>{
 const f=await fixture(t),pending=f.submit();f.form().line.value=line+' Keep this on failure.';f.requests[0].reject(Error('Mock design failure'));await pending;
 assert.equal(f.form().line.value,line+' Keep this on failure.');assert.equal(f.form().querySelector('[type="submit"]').disabled,false);assert.equal(f.view.querySelector('#newvoicecard').hidden,false);
});

test('a newer storyboard selection retains its description and autofill behavior after refresh',async t=>{
 const f=await fixture(t),choose=id=>{f.form().storyboardId.value=String(id);f.form().storyboardId.dispatchEvent(new window.Event('change'));};
 f.form().description.value='';choose(1);const pending=f.submit();choose(2);f.requests[0].resolve();await pending;await turn();
 assert.equal(f.form().storyboardId.value,'2');assert.equal(f.form().description.value,boards[1].plan.voice);assert.equal(f.view.querySelector('#newvoicecard').hidden,false);
 choose(1);assert.equal(f.form().description.value,boards[0].plan.voice);assert.equal(f.requests.length,1);
});

test('an unrelated preview check does not replay a pending design as a new valid draft',async t=>{
 const f=await fixture(t,{includeVoice:true}),original=f.form(),pending=f.submit();
 await f.view.querySelector('[data-vcheck]').onclick();await turn();
 assert.notEqual(f.form(),original);assert.equal(f.form().description.value,'');assert.equal(f.form().line.value,'');
 await f.submit();assert.equal(f.requests.length,1);assert.equal(f.confirmations(),1);
 f.requests[0].resolve();await pending;await turn();assert.equal(f.form().line.value,'');
});
