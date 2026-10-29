import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const source=readFileSync(new URL('./public/app.js',import.meta.url),'utf8');
const leadsSource=source.slice(source.indexOf('const leadFilters='),source.indexOf('// Drafts live inside Leads now.'));
const rows=[{id:1,company:'Alpha',domain:'a.example',status:'drafted'},{id:2,company:'Zulu',domain:'z.example',status:'awaiting_video'}];
const turn=()=>new Promise(setImmediate);
async function fixture(t){
 const dom=new JSDOM('<main id="view"></main>',{url:'https://fixture.example/#/leads'});t.after(()=>dom.window.close());
 const {document}=dom.window,preferences=new Map([['lfilter','all'],['lsort','newest']]),requests=[],notices=[];let first=true,active=true;
 const context=vm.createContext({document,history:dom.window.history,$:s=>document.querySelector(s),esc:String,ic:()=>'',closeMenus:()=>{},
  pref:{get:(k,v)=>preferences.get(k)||v,set:(k,v)=>preferences.set(k,v)},loadDraftMaps:async()=>[{id:11,lead_id:1}],tryGet:async()=>null,
  toast:(...a)=>notices.push(a),leadRow:r=>`<div class="trow" data-id="${r.id}">${r.company}</div>`,api:async(path,body)=>{
   if(path==='/api/leads/requalify'){assert.deepEqual(Object.keys(body),[]);return {checked:2,rejected:[]};}
   assert.equal(path,'/api/leads');assert.equal(body,undefined);if(first){first=false;return {leads:rows};}
   return new Promise((resolve,reject)=>requests.push({resolve,reject}));
  }});
 vm.runInContext(leadsSource,context);await context.leads(undefined,{isCurrent:()=>active});
 return {document,preferences,requests,notices,leave:()=>{active=false;document.querySelector('#view').innerHTML='<h2>Current task</h2>';}};
}
test('failed filter refresh retains displayed selection and preference, then retries explicitly',async t=>{
 const f=await fixture(t),button=f.document.querySelector('[data-lf="drafts"]'),pending=button.onclick();
 assert.equal(f.preferences.get('lfilter'),'all');f.requests[0].reject(Error('List unavailable'));await pending;await turn();
 assert.equal(f.preferences.get('lfilter'),'all');assert.equal(f.document.querySelector('[data-lf="all"]').getAttribute('aria-pressed'),'true');assert.equal(f.notices.length,1);
 const retry=button.onclick();f.requests[1].resolve({leads:rows});await retry;await turn();
 assert.equal(f.preferences.get('lfilter'),'drafts');assert.deepEqual([...f.document.querySelectorAll('.trow[data-id]')].map(n=>n.dataset.id),['1']);
});
test('failed sort refresh keeps its previous label and preference',async t=>{
 const f=await fixture(t),pending=f.document.querySelector('[data-ls="name"]').onclick();
 assert.equal(f.preferences.get('lsort'),'newest');f.requests[0].reject(Error('List unavailable'));await pending;await turn();
 assert.equal(f.preferences.get('lsort'),'newest');assert.equal(f.document.querySelector('#sortbtn span').textContent,'Newest');assert.equal(f.notices.length,1);
 const retry=f.document.querySelector('[data-ls="name"]').onclick();f.requests[1].resolve({leads:rows});await retry;
 assert.equal(f.preferences.get('lsort'),'name');assert.equal(f.document.querySelector('#sortbtn span').textContent,'Name');
 assert.deepEqual([...f.document.querySelectorAll('.trow[data-id]')].map(n=>n.dataset.id),['1','2']);
});
test('an older failed filter does not notify after a newer filter succeeds',async t=>{
 const f=await fixture(t),older=f.document.querySelector('[data-lf="drafts"]').onclick(),newer=f.document.querySelector('[data-lf="awaiting_video"]').onclick();
 f.requests[1].resolve({leads:rows});await newer;f.requests[0].reject(Error('Old failure'));await older;await turn();
 assert.equal(f.preferences.get('lfilter'),'awaiting_video');assert.equal(f.notices.length,0);
});
test('a failed newest selection prevents an older success from committing its preference',async t=>{
 const f=await fixture(t),older=f.document.querySelector('[data-lf="drafts"]').onclick(),newer=f.document.querySelector('[data-lf="issues"]').onclick();
 f.requests[1].reject(Error('Current failure'));await newer;f.requests[0].resolve({leads:rows});await older;await turn();
 assert.equal(f.preferences.get('lfilter'),'all');assert.equal(f.document.querySelector('[data-lf="all"]').getAttribute('aria-pressed'),'true');assert.equal(f.notices.length,1);
});
test('a departed filter read fails quietly without changing the new route',async t=>{
 const f=await fixture(t),pending=f.document.querySelector('[data-lf="drafts"]').onclick();f.leave();
 f.requests[0].reject(Error('Late failure'));await pending;await turn();
 assert.equal(f.document.querySelector('#view').textContent,'Current task');assert.equal(f.notices.length,0);
});
test('successful recheck followed by failed list reload restores its explicit retry control',async t=>{
 const f=await fixture(t),button=f.document.querySelector('#requalify'),pending=button.onclick({currentTarget:button});await turn();
 f.requests[0].reject(Error('Reload unavailable'));await pending;await turn();assert.equal(button.disabled,false);assert.equal(button.textContent,'Re-check brands');
 assert.ok(f.notices.some(n=>n[1]==='bad'));
});
test('a fresh rejected brand leaves the drafts filter empty even with a cached draft row',async t=>{
 const f=await fixture(t),pending=f.document.querySelector('[data-lf="drafts"]').onclick();
 f.requests[0].resolve({leads:rows.map(r=>r.id===1?{...r,status:'rejected'}:r)});await pending;
 assert.equal(f.preferences.get('lfilter'),'drafts');assert.equal(f.document.querySelectorAll('.trow[data-id]').length,0);
 assert.equal(f.document.querySelector('[data-lf="drafts"] .n').textContent,'0');assert.match(f.document.querySelector('#crm').textContent,/No brands match/);
});
for(const order of ['filter-sort','sort-filter'])test(`pending independent choices combine in ${order} order`,async t=>{
 const f=await fixture(t),filter=f.document.querySelector('[data-lf="drafts"]'),sort=f.document.querySelector('[data-ls="name"]');
 const older=(order==='filter-sort'?filter:sort).onclick(),newer=(order==='filter-sort'?sort:filter).onclick();
 f.requests[1].resolve({leads:rows});await newer;f.requests[0].resolve({leads:rows});await older;
 assert.equal(f.preferences.get('lfilter'),'drafts');assert.equal(f.preferences.get('lsort'),'name');
 assert.equal(f.document.querySelector('[data-lf="drafts"]').getAttribute('aria-pressed'),'true');assert.equal(f.document.querySelector('#sortbtn span').textContent,'Name');
 assert.deepEqual([...f.document.querySelectorAll('.trow[data-id]')].map(n=>n.dataset.id),['1']);
});
test('a failed combined choice clears pending intent before a later explicit selection',async t=>{
 const f=await fixture(t),older=f.document.querySelector('[data-lf="drafts"]').onclick(),newer=f.document.querySelector('[data-ls="name"]').onclick();
 f.requests[1].reject(Error('Combined failure'));await newer;f.requests[0].resolve({leads:rows});await older;
 assert.equal(f.preferences.get('lfilter'),'all');assert.equal(f.preferences.get('lsort'),'newest');
 const retry=f.document.querySelector('[data-lf="issues"]').onclick();f.requests[2].resolve({leads:rows});await retry;
 assert.equal(f.preferences.get('lfilter'),'issues');assert.equal(f.preferences.get('lsort'),'newest');
});
