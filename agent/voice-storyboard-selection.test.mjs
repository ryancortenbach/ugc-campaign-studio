import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {voicesView} from './public/voices.js';

const boards=[{id:1,title:'First fixture',version:1,plan:{voice:'Warm American voice, relaxed and measured.'}},{id:2,title:'Second fixture',version:1,plan:{voice:'Bright British voice, quick and energetic.'}}];
async function fixture(t){
 const dom=new JSDOM('<main></main>');t.after(()=>dom.window.close());
 for(const name of ['description','line','storyboardId'])Object.defineProperty(dom.window.HTMLFormElement.prototype,name,{get(){return this.elements.namedItem(name);}});
 const view=dom.window.document.querySelector('main'),calls=[];
 const api=async(path,body)=>{
  calls.push(path);assert.equal(body,undefined,'Selection must never invoke a paid mutation');
  if(path==='/api/voices')return {voices:[],enabled:true};
  assert.equal(path,'/api/storyboards');return {storyboards:boards};
 };
 await voicesView({view,api,esc:String,toast:()=>{},sbadge:()=>'',svg:()=>''});
 const form=view.querySelector('#newvoice');
 const choose=id=>{form.storyboardId.value=String(id);form.storyboardId.dispatchEvent(new dom.window.Event('change',{bubbles:true}));};
 return {form,choose,calls};
}

test('switching storyboard updates a voice description that still matches the previous autofill',async t=>{
 const f=await fixture(t);f.form.line.value='Keep this unsent sample line';
 f.choose(1);assert.equal(f.form.description.value,boards[0].plan.voice);
 f.choose(2);assert.equal(f.form.description.value,boards[1].plan.voice);assert.equal(f.form.storyboardId.value,'2');
 assert.equal(f.form.line.value,'Keep this unsent sample line');assert.deepEqual(f.calls,['/api/voices','/api/storyboards']);
});

test('switching storyboard preserves a customized voice description',async t=>{
 const f=await fixture(t);f.choose(1);f.form.description.value='My customized voice direction with a softer delivery.';f.choose(2);
 assert.equal(f.form.description.value,'My customized voice direction with a softer delivery.');assert.equal(f.form.storyboardId.value,'2');
});

test('clearing the description lets the next selected storyboard fill it again',async t=>{
 const f=await fixture(t);f.choose(1);f.form.description.value='  ';f.choose(2);
 assert.equal(f.form.description.value,boards[1].plan.voice);
});

test('choosing None keeps the current description and later selection can replace untouched autofill',async t=>{
 const f=await fixture(t);f.choose(1);f.choose('');assert.equal(f.form.description.value,boards[0].plan.voice);assert.equal(f.form.storyboardId.value,'');
 f.choose(2);assert.equal(f.form.description.value,boards[1].plan.voice);
});
