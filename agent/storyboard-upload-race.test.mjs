import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {apparelView} from './public/apparel-storyboards.js';

async function fixture(run){
 const dom=new JSDOM('<main></main>',{url:'http://mint.test'});
 const originals=Object.fromEntries(['window','document','localStorage','fetch','FileReader'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 const requests=[];
 try{
  globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.localStorage=dom.window.localStorage;
  globalThis.FileReader=class{readAsDataURL(){this.result='data:image/png;base64,aW1hZ2U=';queueMicrotask(()=>this.onload());}};
  globalThis.fetch=async(url,options)=>{
   if(url==='/apparel-storyboard-research-v1.json')return {ok:true,json:async()=>JSON.parse(readFileSync(new URL('./public/apparel-storyboard-research-v1.json',import.meta.url)))};
   assert.equal(url,'/api/uploads');assert.equal(options.method,'POST');
   return new Promise((resolve,reject)=>requests.push({name:JSON.parse(options.body).name,resolve:()=>resolve({ok:true,json:async()=>({upload:{id:requests.length,name:JSON.parse(options.body).name,file:JSON.parse(options.body).name}})}),reject}));
  };
  const root=document.querySelector('main');await apparelView({view:root});
  const select=(shot,name)=>{
   const input=root.querySelector(`[data-ap-still-file="${shot}"]`);
   Object.defineProperty(input,'files',{value:[{name,type:'image/png',size:20}],configurable:true});
   return input.onchange();
  };
  const started=async count=>{for(let i=0;i<20&&requests.length<count;i++)await new Promise(resolve=>setImmediate(resolve));assert.equal(requests.length,count);};
  const lab=()=>JSON.parse(localStorage.getItem('mintlabs.apparel-storyboards.v1'));
  await run({root,select,started,requests,lab});
 }finally{dom.window.close();for(const [key,value] of Object.entries(originals))if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}
}

test('the latest still selection wins when an older upload finishes last',async()=>fixture(async({root,select,started,requests,lab})=>{
 const older=select(0,'older.png');await started(1);
 const newer=select(0,'newer.png');await started(2);
 requests[1].resolve();await newer;requests[0].resolve();await older;
 const plan=lab().plans[0];assert.equal(plan.stills[plan.shots[0].id].url,'/uploads/newer.png');
 assert.equal(root.querySelector('.ap-shot img').getAttribute('src'),'/uploads/newer.png');
}));

test('a stale upload failure cannot replace a newer successful import message',async()=>fixture(async({root,select,started,requests,lab})=>{
 const older=select(0,'older.png');await started(1);
 const newer=select(0,'newer.png');await started(2);
 requests[1].resolve();await newer;requests[0].reject(Error('Old upload failed'));await older;
 assert.equal(root.querySelector('[data-ap-message]').classList.contains('ap-error'),false);
 const plan=lab().plans[0];assert.equal(plan.stills[plan.shots[0].id].url,'/uploads/newer.png');
}));

test('uploads for different shots remain independent when completion order changes',async()=>fixture(async({select,started,requests,lab})=>{
 const first=select(0,'first.png');await started(1);const second=select(1,'second.png');await started(2);
 requests[1].resolve();await second;requests[0].resolve();await first;
 const plan=lab().plans[0];assert.equal(plan.stills[plan.shots[0].id].url,'/uploads/first.png');assert.equal(plan.stills[plan.shots[1].id].url,'/uploads/second.png');
}));

test('restoring a version while an upload waits does not attach it to the restored plan',async()=>fixture(async({root,select,started,requests,lab})=>{
 await root.querySelector('[data-ap-save]').onclick();
 const pending=select(0,'abandoned.png');await started(1);
 const history=root.querySelector('[data-ap-history]');history.value='0';history.onchange({target:history});
 const before=root.innerHTML;requests[0].resolve();await pending;
 assert.equal(root.innerHTML,before,'An upload from the replaced plan must not repaint the restored version');
 const plan=lab().plans[0];assert.equal(plan.stills?.[plan.shots[0].id],undefined);
}));

test('a current upload failure preserves the accepted still and can be retried',async()=>fixture(async({root,select,started,requests,lab})=>{
 const first=select(0,'accepted.png');await started(1);requests[0].resolve();await first;
 const failed=select(0,'retry.png');await started(2);requests[1].reject(Error('Upload failed'));await failed;
 assert.equal(root.querySelector('[data-ap-message]').textContent,'Upload failed');
 assert.equal(root.querySelector('[data-ap-message]').classList.contains('ap-error'),true);
 let plan=lab().plans[0];assert.equal(plan.stills[plan.shots[0].id].url,'/uploads/accepted.png');
 const retry=select(0,'retried.png');await started(3);requests[2].resolve();await retry;
 plan=lab().plans[0];assert.equal(plan.stills[plan.shots[0].id].url,'/uploads/retried.png');
 assert.equal(root.querySelector('[data-ap-message]').classList.contains('ap-error'),false);
}));
