import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {apparelView} from './public/apparel-storyboards.js';

test('a failed local storyboard save reports failure and can be retried without losing edits',async()=>{
 const dom=new JSDOM('<main></main>',{url:'http://mint.test'});
 const originals=Object.fromEntries(['window','document','localStorage','fetch'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 let full=false;const saved=new Map();
 try{
  globalThis.window=dom.window;globalThis.document=dom.window.document;
  globalThis.localStorage={getItem:key=>saved.get(key)||null,setItem:(key,value)=>{if(full)throw new Error('Quota exceeded');saved.set(key,value);},removeItem:key=>saved.delete(key)};
  globalThis.fetch=async url=>{assert.equal(url,'/apparel-storyboard-research-v1.json');return {ok:true,json:async()=>JSON.parse(readFileSync(new URL('./public/apparel-storyboard-research-v1.json',import.meta.url)))};};
  const root=document.querySelector('main');await apparelView({view:root});
  full=true;
  const input=root.querySelector('[data-ap-field="dialogue"]');input.value='Keep this unsaved line.';input.dispatchEvent(new dom.window.Event('input'));
  await root.querySelector('[data-ap-save]').onclick();
  const message=root.querySelector('[data-ap-message]');
  assert.ok(message.classList.contains('ap-error'),'Storage failure must not appear as success');
  assert.doesNotMatch(message.textContent,/version saved locally|Server saving will/);
  assert.equal(root.querySelector('[data-ap-field="dialogue"]').value,'Keep this unsaved line.');
  full=false;await root.querySelector('[data-ap-save]').onclick();
  assert.equal(root.querySelector('[data-ap-message]').textContent,'Storyboard version saved locally.');
  assert.equal(root.querySelector('[data-ap-message]').classList.contains('ap-error'),false);
  const lab=JSON.parse([...saved.values()][0]);
  assert.equal(lab.plans[0].shots[0].dialogue,'Keep this unsaved line.');
  full=true;let posts=0;
  globalThis.fetch=async(url,options)=>{
   if(!options)return {ok:true,json:async()=>JSON.parse(readFileSync(new URL('./public/apparel-storyboard-research-v1.json',import.meta.url)))};
   assert.equal(url,'/api/tasks/42/storyboard');const body=JSON.parse(options.body);assert.equal(body.revision,1);posts++;
   return {ok:true,json:async()=>({workspace:{task:{id:42},revision:2,lab:body.lab}})};
  };
  await apparelView({view:root,workspace:{task:{id:42},revision:1,lab}});
  await root.querySelector('[data-ap-save]').onclick();
  assert.equal(posts,1,'Server persistence must still be attempted when the local cache is full');
  assert.match(root.querySelector('[data-ap-message]').textContent,/Saved to this brand task, revision 2/);
 }finally{dom.window.close();for(const [key,value] of Object.entries(originals))if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}
});
