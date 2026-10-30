import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {JSDOM} from 'jsdom';
const source=readFileSync(new URL('./public/app.js',import.meta.url),'utf8');
const settingsSource=source.slice(source.indexOf('async function settings('),source.indexOf('\nasync function voices('));
const profile={senderName:'Fixture sender',company:'Fixture company',senderFact:'Saved fact',offer:'Saved offer',cta:'Saved CTA',rules:'Saved rules'};
const flush=()=>new Promise(resolve=>setImmediate(resolve));
async function fixture(t){
 const dom=new JSDOM('<main id="view"></main>');t.after(()=>dom.window.close());const {document,FormData}=dom.window,requests=[],state={config:{profile:{...profile}}};let reads=0;
 const context=vm.createContext({document,FormData,state,$:s=>document.querySelector(s),esc:v=>String(v??''),connRows:()=>[],autosize:()=>{},loadState:async()=>{reads++;},toast:()=>{},
  api:(path,body)=>{assert.equal(path,'/api/profile');return new Promise((resolve,reject)=>requests.push({body,resolve:()=>{state.config.profile={...body};resolve({profile:body});},reject}));}});
 vm.runInContext(settingsSource,context);await context.settings();
 const form=()=>document.querySelector('#profile'),field=name=>form().elements.namedItem(name),edit=(name,value)=>{field(name).value=value;field(name).dispatchEvent(new dom.window.Event('input',{bubbles:true}));};
 return {document,requests,state,form,field,edit,mount:context.settings,reads:()=>reads,submit:()=>form().onsubmit({preventDefault(){}}),status:()=>document.querySelector('#pfstate').textContent};
}
test('a Settings refresh keeps its pending save locked against duplicate submissions',async t=>{
 const f=await fixture(t);f.edit('offer','Submitted offer');const save=f.submit(),refresh=f.mount();await flush();
 assert.equal(f.document.querySelector('#pfsave').disabled,true);const duplicate=f.submit();assert.equal(f.requests.length,1);
 f.requests[0].resolve();await Promise.all([save,refresh,duplicate]);assert.equal(f.field('offer').value,'Submitted offer');assert.equal(f.status(),'All changes saved');
});
test('undoing to the old value during refresh stays dirty after the pending save succeeds',async t=>{
 const f=await fixture(t);f.edit('offer','Submitted offer');const save=f.submit(),refresh=f.mount();await flush();f.edit('offer',profile.offer);
 f.requests[0].resolve();await Promise.all([save,refresh]);assert.equal(f.field('offer').value,profile.offer);assert.equal(f.status(),'Unsaved changes');
 const undo=f.submit();assert.equal(f.requests[1].body.offer,profile.offer);f.requests[1].resolve();await undo;
});
test('a failed save during refresh retains the latest blank draft for retry',async t=>{
 const f=await fixture(t);f.edit('offer','Submitted offer');const save=f.submit(),refresh=f.mount();await flush();f.edit('offer','');f.edit('rules','Latest rules\nKeep sources');
 f.requests[0].reject(Error('Mock failure'));await Promise.all([save,refresh]);assert.equal(f.field('offer').value,'');assert.equal(f.status(),'Unsaved changes');
 const retry=f.submit();assert.equal(f.requests[1].body.offer,'');assert.equal(f.requests[1].body.rules,'Latest rules\nKeep sources');f.requests[1].resolve();await retry;
});
test('undoing a failed pending save during refresh returns to the saved baseline',async t=>{
 const f=await fixture(t);f.edit('offer','Submitted offer');const save=f.submit(),refresh=f.mount();await flush();f.edit('offer',profile.offer);
 f.requests[0].reject(Error('Mock failure'));await Promise.all([save,refresh]);assert.equal(f.status(),'All changes saved');await f.submit();assert.equal(f.requests.length,1);
});
test('navigation while refresh waits for a save leaves the new page untouched',async t=>{
 const f=await fixture(t);let current=true;f.edit('rules','Submitted rules');const save=f.submit(),refresh=f.mount(undefined,{isCurrent:()=>current});await flush();
 current=false;f.document.querySelector('#view').innerHTML='<h2>Current task</h2>';f.requests[0].resolve();await Promise.all([save,refresh]);assert.equal(f.document.querySelector('#view').textContent,'Current task');
});
