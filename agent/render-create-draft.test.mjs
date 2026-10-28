import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {rendersView} from './public/renders-view.js';

const turn=()=>new Promise(resolve=>setImmediate(resolve));
async function fixture(run){
 const dom=new JSDOM('<main></main>'),view=dom.window.document.querySelector('main'),requests=[],notices=[];let controller;
 try{
  const records=[],api=async(path,body)=>{
   if(path==='/api/state')return {config:{spendingPaused:true}};
   if(path==='/api/leads')return {leads:[]};
   assert.equal(path,'/api/renders');if(body===undefined)return {renders:[...records],enabled:true};
   return new Promise((resolve,reject)=>requests.push({body,reject,resolve(){const render={id:records.length+1,title:body.title,input:{prompt:body.prompt,duration:body.duration,resolution:body.resolution},status:'draft'};records.push(render);resolve({render});}}));
  };
  controller=await rendersView({view,api,toast:(...args)=>notices.push(args),poll:false});
  const form=view.querySelector('form.rv-new');
  for(const name of ['title','prompt','duration','resolution'])Object.defineProperty(form,name,{get(){return this.elements.namedItem(name);}});
  view.querySelector('[data-a="newshot"]').click();
  form.title.value='First shot';form.prompt.value='Original draft prompt';
  const submit=()=>form.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));
  await run({view,form,requests,notices,submit});
 }finally{controller?.stop();dom.window.close();}
}

test('repeated new-shot submissions make only one pending draft request',async()=>fixture(async({form,requests,submit})=>{
 submit();submit();assert.equal(requests.length,1,'Repeated submits must not create duplicate drafts');
 assert.equal(form.querySelector('button[type="submit"]').disabled,true);
 requests[0].resolve();await turn();assert.equal(form.hidden,true);assert.equal(form.title.value,'');
 assert.equal(form.querySelector('button[type="submit"]').disabled,false);
}));

test('newer shot edits survive completion of an older draft request',async()=>fixture(async({form,requests,submit})=>{
 submit();form.title.value='Next shot';form.prompt.value='Keep this new prompt';requests[0].resolve();await turn();
 assert.equal(form.title.value,'Next shot');assert.equal(form.prompt.value,'Keep this new prompt');assert.equal(form.hidden,false);
 assert.equal(requests[0].body.title,'First shot');
 submit();assert.equal(requests[1].body.title,'Next shot');requests[1].resolve();await turn();assert.equal(form.hidden,true);
}));

test('a failed new-shot save retains the draft and enables retry',async()=>fixture(async({form,requests,notices,submit})=>{
 submit();requests[0].reject(Error('Temporary save failure'));await turn();
 assert.equal(form.title.value,'First shot');assert.equal(form.prompt.value,'Original draft prompt');assert.equal(form.hidden,false);
 assert.equal(form.querySelector('button[type="submit"]').disabled,false);assert.equal(notices.at(-1)[1],'bad');
 submit();requests[1].resolve();await turn();assert.equal(form.hidden,true);assert.equal(notices.at(-1)[0],'Shot added');
}));
