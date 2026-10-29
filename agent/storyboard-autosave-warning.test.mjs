import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {apparelView} from './public/apparel-storyboards.js';
async function fixture(t){
 const dom=new JSDOM('<main></main>',{url:'https://fixture.example'}),keys=['document','localStorage','fetch'],originals=Object.fromEntries(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)])),saved=new Map();let full=false,calls=0;
 globalThis.document=dom.window.document;
 globalThis.localStorage={getItem:k=>saved.get(k)||null,setItem:(k,v)=>{if(full)throw Error('Quota exceeded');saved.set(k,v);},removeItem:k=>saved.delete(k)};
 globalThis.fetch=async(path,options)=>{calls++;assert.equal(path,'/apparel-storyboard-research-v1.json');assert.equal(options,undefined,'No provider or upload requests allowed');return {ok:true,json:async()=>JSON.parse(readFileSync(new URL('./public/apparel-storyboard-research-v1.json',import.meta.url),'utf8'))};};
 t.after(()=>{dom.window.close();for(const k of keys)if(originals[k])Object.defineProperty(globalThis,k,originals[k]);else delete globalThis[k];});
 const root=document.querySelector('main');await apparelView({view:root});
 const edit=(field,value)=>{const el=root.querySelector(`[data-ap-shot="0"][data-ap-field="${field}"]`);el.value=value;el.dispatchEvent(new dom.window.Event('input'));return el;};
 return {root,edit,full:v=>full=v,message:()=>root.querySelector('[data-ap-message]'),lab:()=>JSON.parse(saved.get('mintlabs.apparel-storyboards.v1')),calls:()=>calls};
}
test('failed automatic local saves immediately warn while retaining multiline edits',async t=>{
 const f=await fixture(t),before=f.lab().plans[0].shots[0].dialogue;f.full(true);const value='First fixture line\n\nSecond line: <b>literal</b> and café.';const input=f.edit('dialogue',value);
 assert.match(f.message().textContent,/Could not save this draft locally/);assert.equal(f.message().classList.contains('ap-error'),true);assert.equal(input.value,value);assert.equal(f.lab().plans[0].shots[0].dialogue,before);assert.equal(f.calls(),1);assert.equal(f.root.querySelector('b.literal'),null);
});
test('a successful automatic retry clears its own stale storage warning and saves latest text',async t=>{
 const f=await fixture(t);f.full(true);f.edit('camera','Uncached fixture camera.');assert.match(f.message().textContent,/Could not save/);
 f.full(false);f.edit('camera','Recovered camera\nwith a second line.');assert.equal(f.message().textContent,'');assert.equal(f.message().classList.contains('ap-error'),false);assert.equal(f.lab().plans[0].shots[0].camera,'Recovered camera\nwith a second line.');
});
test('a successful automatic save preserves an unrelated newer validation notice',async t=>{
 const f=await fixture(t);f.full(true);f.edit('action','Unsaved action.');f.message().textContent='Keep this independent validation notice.';f.message().classList.add('ap-error');f.full(false);f.edit('action','Saved action.');assert.equal(f.message().textContent,'Keep this independent validation notice.');assert.equal(f.message().classList.contains('ap-error'),true);assert.equal(f.lab().plans[0].shots[0].action,'Saved action.');
});
test('a failed local staging save also reports that the draft was not cached',async t=>{
 const f=await fixture(t);f.full(true);f.root.querySelector('[data-ap-image="0"]').click();assert.equal(f.root.querySelector('[data-ap-image="0"]').getAttribute('aria-pressed'),'true');assert.match(f.message().textContent,/Could not save this draft locally/);assert.equal(f.message().classList.contains('ap-error'),true);assert.equal(f.lab().plans[0].imageRequests,undefined);assert.equal(f.calls(),1);
});
