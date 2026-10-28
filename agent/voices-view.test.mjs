import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {voicesView} from './public/voices.js';

const description='Warm, relaxed American voice with a measured pace.';
const line='This is an original sample line for checking the voice design form. It has enough characters to reach the documented minimum.';
async function fixture(run){
 const dom=new JSDOM('<main></main>'),previous=Object.getOwnPropertyDescriptor(globalThis,'window'),calls=[],notices=[];
 let confirmations=0,fail=true,allow=true;
 try{
  globalThis.window=dom.window;dom.window.confirm=()=>{confirmations++;return allow;};
  for(const name of ['description','line','storyboardId'])Object.defineProperty(dom.window.HTMLFormElement.prototype,name,{get(){return this.elements.namedItem(name);}});
  const view=dom.window.document.querySelector('main'),api=async(path,body)=>{
   if(path==='/api/voices')return {voices:[],enabled:true};
   if(path==='/api/storyboards')return {storyboards:[]};
   assert.equal(path,'/api/voices/design');calls.push(body);if(fail)throw Error('Temporary design failure');return {voices:[{}, {}, {}]};
  };
  await voicesView({view,api,esc:String,toast:(...args)=>notices.push(args),sbadge:()=>'',svg:()=>''});
  const form=view.querySelector('form');
  await run({view,form,calls,notices,confirmations:()=>confirmations,succeed:()=>fail=false,deny:()=>allow=false});
 }finally{dom.window.close();if(previous)Object.defineProperty(globalThis,'window',previous);else delete globalThis.window;}
}

test('invalid voice inputs never reach the credit confirmation or design request',async()=>fixture(async({form,calls,notices,confirmations})=>{
 for(const [spec,text] of [['short',line],['x'.repeat(1001),line],[description,'short'],[description,'x'.repeat(1001)],[description,' '.repeat(120)]]){
  form.description.value=spec;form.line.value=text;
  await form.onsubmit({preventDefault(){}});
  assert.equal(confirmations(),0,'Invalid input must be rejected before asking to use credits');assert.equal(calls.length,0);
  assert.equal(notices.at(-1)[1],'bad');assert.equal(form.querySelector('button[type="submit"]').disabled,false);
 }
}));

test('valid voice input retains the credit confirmation and can retry after a failed request',async()=>fixture(async({form,calls,notices,confirmations,succeed})=>{
 form.description.value=' '+description+' ';form.line.value=' '+line+' ';
 await form.onsubmit({preventDefault(){}});
 assert.equal(confirmations(),1);assert.equal(calls.length,1);assert.equal(calls[0].description,description);assert.equal(calls[0].line,line);
 assert.equal(form.line.value,' '+line+' ');assert.equal(form.querySelector('button[type="submit"]').disabled,false);assert.equal(form.querySelector('button[type="submit"]').textContent,'Design voices');
 succeed();await form.onsubmit({preventDefault(){}});
 assert.equal(confirmations(),2);assert.equal(calls.length,2);assert.equal(notices.at(-1)[0],'Voices designed');
}));

test('canceling the credit confirmation leaves valid inputs and makes no design request',async()=>fixture(async({form,calls,confirmations,deny})=>{
 form.description.value=description;form.line.value=line;deny();
 await form.onsubmit({preventDefault(){}});
 assert.equal(confirmations(),1);assert.equal(calls.length,0);assert.equal(form.line.value,line);
 assert.equal(form.querySelector('button[type="submit"]').disabled,false);
}));
