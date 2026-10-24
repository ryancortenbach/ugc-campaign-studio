import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {openStore} from './store.mjs';
import {createTaskStoryboards} from './task-storyboards.mjs';
import {apparelView} from './public/apparel-storyboards.js';

test('an open lab accepts research references and saves its next edit against the new revision',async()=>{
 const dom=new JSDOM('<div id="lab"></div>',{url:'http://127.0.0.1:3200'}),store=openStore(':memory:'),boards=createTaskStoryboards({store});
 const originals=Object.fromEntries(['window','document','localStorage','fetch','requestAnimationFrame'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 const mission=store.createTask('test'),lead=store.createLead({taskId:mission.id,company:'A',domain:'a.example',url:'https://a.example',market:'streetwear',territory:'NYC',status:'qualified'}),initial=boards.ensure(lead.id),posts=[];
 try{
  globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.localStorage=dom.window.localStorage;globalThis.requestAnimationFrame=fn=>fn();
  globalThis.fetch=async(url,options)=>{
   if(url==='/apparel-storyboard-research-v1.json')return {ok:true,json:async()=>JSON.parse(readFileSync(new URL('./public/apparel-storyboard-research-v1.json',import.meta.url),'utf8'))};
   const body=JSON.parse(options.body);posts.push(body);const saved=boards.save(initial.task.id,body);return {ok:true,json:async()=>({workspace:saved})};
  };
  const root=document.querySelector('#lab'),controller=await apparelView({view:root,workspace:initial,esc:String});
  const input=root.querySelector('[data-ap-shot][data-ap-field="dialogue"]');input.focus();const value=input.value;
  const researched=boards.applyResearch(initial.task.id,{products:[{title:'Real jacket',kind:'outerwear',image:'0.png',referenceUrl:'/uploads/garment.png',url:'https://a.example/jacket'}],source:lead.url,excerpt:'Jacket',unknowns:[],method:'Local test'});
  assert.equal(controller.refresh(researched),true);assert.equal(document.activeElement,input);assert.equal(input.value,value);
  input.value='My focused edit.';input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));await controller.flush();
  assert.equal(posts.at(-1).revision,1);assert.equal(posts.at(-1).lab.plans[0].shots[0].dialogue,'My focused edit.');assert.equal(posts.at(-1).lab.refs.at(-1).url,'/uploads/garment.png');
  input.blur();await new Promise(r=>queueMicrotask(r));assert.ok(root.querySelector('img[src="/uploads/garment.png"]'));assert.equal(boards.get(initial.task.id).revision,2);
 }finally{boards.close();store.db.close();dom.window.close();for(const [k,d] of Object.entries(originals))if(d)Object.defineProperty(globalThis,k,d);else delete globalThis[k];}
});
