import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {voicesView} from './public/voices.js';
const voice=(over={})=>({id:1,name:'Fixture voice',description:'Original fixture voice direction',line:'Original fixture line',sample_file:'preview.wav',generated_voice_id:'gen_fixture',status:'checks_passed',created_at:'2026-10-29T10:00:00Z',...over});
async function fixture(t,list=[voice()],enabled=true){
 const dom=new JSDOM('<main></main>');t.after(()=>dom.window.close());
 for(const name of ['description','line','storyboardId'])Object.defineProperty(dom.window.HTMLFormElement.prototype,name,{get(){return this.elements.namedItem(name);}});
 const view=dom.window.document.querySelector('main'),calls=[];let response={voices:list,enabled};
 const api=async(path,body)=>{assert.equal(body,undefined,'Only mocked reads permitted');calls.push(path);if(path==='/api/voices')return response;assert.equal(path,'/api/storyboards');return {storyboards:[]};};
 const mount=()=>voicesView({view,api,esc:String,toast:()=>assert.fail('No action expected'),sbadge:s=>s[0],svg:()=>''});await mount();
 return {view,calls,mount,set:r=>response=r};
}

test('a checked voice cannot save when ElevenLabs is not configured',async t=>{
 const f=await fixture(t,[voice()],false);assert.equal(f.view.querySelector('[data-vsave]').disabled,true);assert.equal(f.view.querySelector('[data-vcheck]').disabled,true);assert.equal(f.view.querySelector('button[type="submit"]').disabled,true);
});
test('saving anyway is unavailable when ElevenLabs is not configured',async t=>{
 const f=await fixture(t,[voice({status:'checks_failed'})],false);assert.equal(f.view.querySelector('[data-force]').disabled,true);
});
test('a voice without a generated preview cannot offer a working save action',async t=>{
 const f=await fixture(t,[voice({generated_voice_id:null})]);assert.equal(f.view.querySelector('[data-vsave]').disabled,true);
});
test('a missing local sample disables checks without blocking a valid remote preview save',async t=>{
 const f=await fixture(t,[voice({sample_file:null})]);assert.equal(f.view.querySelector('audio'),null);assert.match(f.view.textContent,/No sample audio/);assert.equal(f.view.querySelector('[data-vcheck]').disabled,true);assert.equal(f.view.querySelector('[data-vsave]').disabled,false);
});
test('a later configured read restores valid save controls without duplicating cards',async t=>{
 const f=await fixture(t,[voice()],false);f.set({voices:[voice()],enabled:true});await f.mount();assert.equal(f.view.querySelector('[data-vsave]').disabled,false);assert.equal(f.view.querySelectorAll('.vcard').length,1);assert.deepEqual(f.calls,['/api/voices','/api/storyboards','/api/voices','/api/storyboards']);
});
test('a saved voice remains readable without provider setup or local audio',async t=>{
 const f=await fixture(t,[voice({status:'saved',sample_file:null,voice_id:'saved_fixture'})],false);assert.equal(f.view.querySelector('[data-vsave]'),null);assert.match(f.view.textContent,/saved_fixture/);assert.match(f.view.textContent,/No sample audio/);
});
test('checks in progress disable both checking again and saving',async t=>{
 const f=await fixture(t,[voice({status:'checking'})]);assert.equal(f.view.querySelector('[data-vcheck]').disabled,true);assert.equal(f.view.querySelector('[data-vsave]'),null);assert.match(f.view.querySelector('.vacts').textContent,/Save to my ElevenLabs voices/);
});

test('a configured failed-check preview retains its explicit save-anyway option',async t=>{
 const f=await fixture(t,[voice({status:'checks_failed'})]),button=f.view.querySelector('[data-force]');assert.equal(button.disabled,false);assert.equal(button.dataset.force,'1');assert.equal(button.textContent,'Save anyway');
});
