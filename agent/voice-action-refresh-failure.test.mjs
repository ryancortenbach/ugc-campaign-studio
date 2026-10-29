import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {voicesView} from './public/voices.js';
const turn=()=>new Promise(setImmediate);
const voice=(over={})=>({id:1,name:'Fixture voice',description:'Warm original American voice with a measured pace.',line:'This original sample line has enough characters for voice design and speaks with a calm, measured pace for our fixture review.',sample_file:'fixture.wav',generated_voice_id:'gen_fixture',status:'checks_passed',created_at:'2026-10-29T16:28:00Z',...over});
async function fixture(t,{actionFail=false,initial=voice()}={}){
 const dom=new JSDOM('<main></main>');const previous=Object.getOwnPropertyDescriptor(globalThis,'window');globalThis.window=dom.window;dom.window.confirm=()=>true;
 t.after(()=>{dom.window.close();if(previous)Object.defineProperty(globalThis,'window',previous);else delete globalThis.window;});
 for(const key of ['description','line','storyboardId'])Object.defineProperty(dom.window.HTMLFormElement.prototype,key,{get(){return this.elements.namedItem(key);}});
 const view=dom.window.document.querySelector('main'),calls=[],notices=[];let reads=0,result=initial,failRead=true;
 const api=async(path,body)=>{
  calls.push({path,body});
  if(path==='/api/voices'){if(++reads>1&&failRead)throw Error('Voice list unavailable');return {voices:[result],enabled:true};}
  if(path==='/api/storyboards')return {storyboards:[]};
  if(actionFail)throw Error('Action failed');
  if(path==='/api/voices/design'){result=voice({id:2,name:'New preview',sample_file:'new.wav'});return {voices:[result]};}
  if(path==='/api/voices/1/save')result=voice({status:'saved',voice_id:'saved_fixture'});
  else {assert.equal(path,'/api/voices/1/check');result=voice({status:'checks_failed'});}
  return {voice:result};
 };
 const options={view,api,esc:String,toast:(...args)=>notices.push(args),sbadge:s=>s[0],svg:()=>''};await voicesView(options);
 return {view,calls,notices,options,recover:()=>failRead=false};
}
test('failed checks and a failed list reload leave the existing preview retryable',async t=>{
 const f=await fixture(t,{actionFail:true});await f.view.querySelector('[data-vcheck]').onclick();await turn();
 assert.equal(f.view.querySelector('[data-vcheck]').disabled,false);assert.equal(f.view.querySelector('audio').getAttribute('src'),'/voices/fixture.wav');
 assert.ok(f.notices.some(n=>n[0]==='Action failed'));assert.ok(f.notices.some(n=>/refresh/i.test(n[0])));
});
test('a confirmed check result remains visible if its list reload fails',async t=>{
 const f=await fixture(t);await f.view.querySelector('[data-vcheck]').onclick();await turn();
 assert.match(f.view.querySelector('.vcard .head').textContent,/Checks failed/);assert.equal(f.view.querySelector('[data-vcheck]').disabled,false);
 assert.equal(f.calls.filter(c=>c.path.endsWith('/check')).length,1);
});
test('a confirmed saved voice cannot offer duplicate saving after its reload fails',async t=>{
 const f=await fixture(t);await f.view.querySelector('[data-vsave]').onclick();await turn();
 assert.equal(f.view.querySelector('[data-vsave]'),null);assert.match(f.view.textContent,/saved_fixture/);
 assert.equal(f.calls.filter(c=>c.path.endsWith('/save')).length,1);
});
test('failed saving and failed reload retain a retryable save control',async t=>{
 const f=await fixture(t,{actionFail:true});await f.view.querySelector('[data-vsave]').onclick();await turn();
 assert.equal(f.view.querySelector('[data-vsave]').disabled,false);assert.equal(f.view.querySelector('[data-vsave]').textContent,'Save to my ElevenLabs voices');
});
test('successful design retains returned previews when the list reload fails',async t=>{
 const f=await fixture(t),form=f.view.querySelector('form');form.description.value=voice().description;form.line.value=voice().line;
 await form.onsubmit({preventDefault(){}});await turn();
 assert.ok([...f.view.querySelectorAll('.vcard .head')].some(head=>/New preview/.test(head.textContent)));assert.equal(f.view.querySelectorAll('.vcard').length,2);
 assert.equal(f.calls.filter(c=>c.path==='/api/voices/design').length,1);assert.ok(f.view.querySelector('audio[src="/voices/new.wav"]'));
});
test('a later successful ordinary read replaces the fallback with fresh server data',async t=>{
 const f=await fixture(t);await f.view.querySelector('[data-vsave]').onclick();await turn();
 assert.match(f.view.textContent,/saved_fixture/);f.recover();await voicesView(f.options);
 assert.equal(f.view.querySelectorAll('.vcard').length,1);assert.equal(f.view.querySelector('[data-vsave]'),null);
 assert.match(f.view.textContent,/saved_fixture/);
});
for(const firstId of [1,2])test(`saving preview ${firstId} serializes other actions through a failed reload`,async t=>{
 const dom=new JSDOM('<main></main>');t.after(()=>dom.window.close());
 for(const key of ['description','line','storyboardId'])Object.defineProperty(dom.window.HTMLFormElement.prototype,key,{get(){return this.elements.namedItem(key);}});
 const view=dom.window.document.querySelector('main'),rows=[voice(),voice({id:2,name:'Other preview'})],requests=[];let reads=0;
 await voicesView({view,esc:String,toast:()=>{},sbadge:s=>s[0],svg:()=>'',api:async(path,body)=>{
  if(path==='/api/voices'){if(reads++)throw Error('List unavailable');return {voices:rows,enabled:true};}
  if(path==='/api/storyboards')return {storyboards:[]};
  assert.ok(body);return new Promise(resolve=>requests.push({path,resolve}));
 }});
 const secondId=firstId===1?2:1,first=view.querySelector(`[data-vsave="${firstId}"]`),other=view.querySelector(`[data-vsave="${secondId}"]`);
 const pending=first.onclick();assert.equal(other.disabled,true);assert.equal(view.querySelector('[data-vcheck]').disabled,true);assert.equal(view.querySelector('button[type="submit"]').disabled,true);
 await other.onclick();assert.equal(requests.length,1);
 requests[0].resolve({voice:voice({id:firstId,status:'saved',voice_id:`saved_${firstId}`})});await pending;
 assert.match(view.textContent,new RegExp(`saved_${firstId}`));const next=view.querySelector(`[data-vsave="${secondId}"]`);assert.equal(next.disabled,false);
 const second=next.onclick();assert.equal(requests.length,2);requests[1].resolve({voice:voice({id:secondId,status:'saved',voice_id:`saved_${secondId}`})});await second;
 assert.match(view.textContent,/saved_1/);assert.match(view.textContent,/saved_2/);assert.equal(view.querySelector('[data-vsave]'),null);
});
