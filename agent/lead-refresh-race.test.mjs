import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';

const source=readFileSync(new URL('./public/app.js',import.meta.url),'utf8');
const mapsSource=source.slice(source.indexOf('async function loadDraftMaps('),source.indexOf('const lstat='));
const leadsSource=source.slice(source.indexOf('const leadFilters='),source.indexOf('// Drafts live inside Leads now.'));
const lead=(id,company)=>({id,company,domain:`brand-${id}.example`,status:'drafted'});
const draft=(id,leadId)=>({id,lead_id:leadId,status:'gmail_draft',gmail_url:`https://mail.google.com/#drafts/${id}`});
function fixture(t){
 const dom=new JSDOM('<main id="view"></main>',{url:'https://fixture.example/#/leads'});t.after(()=>dom.window.close());
 const {document}=dom.window,requests=[],preferences=new Map(),state={gmail:new Map(),dm:new Map(),dr:new Map()};
 const request=(path)=>new Promise(resolve=>requests.push({path,resolve}));
 const pref={get:(key,value)=>preferences.get(key)||value,set:(key,value)=>preferences.set(key,value)};
 const context=vm.createContext({document,state,pref,history:dom.window.history,$:selector=>document.querySelector(selector),esc:String,ic:()=>'',closeMenus:()=>{},toast:()=>{},
  api:path=>{assert.equal(path,'/api/leads');return request(path);},
  tryGet:path=>{if(path==='/api/client-demo')return Promise.resolve(null);assert.equal(path,'/api/drafts');return request(path);},
  leadRow:row=>`<div class="trow" data-id="${row.id}">${row.company}</div>`});
 vm.runInContext(mapsSource+leadsSource+'\nthis.mountLeads=leads;',context);
 const resolve=(offset,leads,drafts)=>{requests[offset].resolve({leads});requests[offset+1].resolve({drafts});};
 return {document,state,pref,requests,resolve,mount:context.mountLeads,maps:context.loadDraftMaps};
}

test('an older Leads refresh cannot replace newer rows or draft maps after sorting',async t=>{
 const f=fixture(t),old=f.mount();f.pref.set('lsort','name');const current=f.mount();
 f.resolve(2,[lead(2,'Current brand')],[draft(22,2)]);await current;
 f.resolve(0,[lead(1,'Older brand')],[draft(11,1)]);await old;
 assert.equal(f.document.querySelector('.trow[data-id]').dataset.id,'2');
 assert.equal(f.document.querySelector('#sortbtn span').textContent,'Name');
 assert.equal(f.state.gmail.get(2),'https://mail.google.com/#drafts/22');assert.equal(f.state.gmail.has(1),false);
 assert.equal(f.state.dr.get(2).id,22);
});

test('a departed route cannot overwrite draft maps loaded by a newer Leads route',async t=>{
 const f=fixture(t);let active=true;
 const old=f.mount(undefined,{isCurrent:()=>active});active=false;
 const current=f.mount();f.resolve(2,[lead(2,'Current brand')],[draft(22,2)]);await current;
 f.resolve(0,[lead(1,'Older brand')],[draft(11,1)]);await old;
 assert.equal(f.document.querySelector('.trow[data-id]').dataset.id,'2');
 assert.equal(f.state.dr.has(1),false);assert.equal(f.state.dr.get(2).id,22);
});

test('a delayed lead list cannot repaint after its draft response was already consumed',async t=>{
 const f=fixture(t),old=f.mount();f.requests[1].resolve({drafts:[draft(11,1)]});await Promise.resolve();
 const current=f.mount();f.resolve(2,[lead(2,'Current brand')],[draft(22,2)]);await current;
 f.requests[0].resolve({leads:[lead(1,'Older brand')]});await old;
 assert.equal(f.document.querySelector('.trow[data-id]').dataset.id,'2');assert.equal(f.state.dr.get(2).id,22);
});

test('current loads retain sorting, filter counts and exclusion of withdrawn drafts',async t=>{
 const f=fixture(t);f.pref.set('lsort','name');const pending=f.mount('drafts');
 f.resolve(0,[lead(1,'Zulu'),lead(2,'Alpha'),lead(3,'Hidden')],[draft(11,1),draft(22,2),{...draft(33,3),status:'withdrawn'}]);await pending;
 assert.deepEqual([...f.document.querySelectorAll('.trow[data-id]')].map(row=>row.dataset.id),['2','1']);
 assert.equal(f.document.querySelector('[data-lf="drafts"]').getAttribute('aria-pressed'),'true');
 assert.equal(f.document.querySelector('[data-lf="drafts"] .n').textContent,'2');assert.equal(f.state.dr.has(3),false);
});

test('shared draft-map reads also ignore older responses outside a Leads mount',async t=>{
 const f=fixture(t),old=f.maps(),current=f.maps();
 f.requests[1].resolve({drafts:[draft(22,2)]});await current;
 f.requests[0].resolve({drafts:[draft(11,1)]});await old;
 assert.equal(f.state.dr.has(1),false);assert.equal(f.state.dr.get(2).id,22);
 assert.equal(f.state.gmail.get(2),'https://mail.google.com/#drafts/22');
});

test('a delayed Tasks control cannot remount Tasks after leaving for Leads',async t=>{
 const dom=new JSDOM('<main id="view"></main><input id="apswitch" type="checkbox">');t.after(()=>dom.window.close());
 const {document}=dom.window;let listener,release,active=true,calls=0;
 const input=document.querySelector('#apswitch');input.addEventListener=(type,handler)=>listener=handler;
 const context=vm.createContext({document,$:selector=>document.querySelector(selector),id:17,isCurrent:()=>active,
  api:()=>new Promise(resolve=>release=resolve),toast:()=>{},tasks:()=>{calls++;document.querySelector('#view').textContent='Old Tasks';}});
 const controlSource=source.slice(source.indexOf(" $('#apswitch')?.addEventListener('change'"),source.indexOf(" $('#whopswitch')?.addEventListener('change'"));
 vm.runInContext(controlSource,context);const pending=listener({target:input});
 active=false;document.querySelector('#view').textContent='Current Leads';release({enabled:false});await pending;
 assert.equal(calls,0);assert.equal(document.querySelector('#view').textContent,'Current Leads');assert.equal(input.disabled,false);
});

test('a current Tasks control forwards its route guard to the refresh',async t=>{
 const dom=new JSDOM('<input id="apswitch" type="checkbox">');t.after(()=>dom.window.close());
 const {document}=dom.window;let listener,options;
 const isCurrent=()=>true;document.querySelector('#apswitch').addEventListener=(type,handler)=>listener=handler;
 const context=vm.createContext({document,$:selector=>document.querySelector(selector),id:17,isCurrent,
  api:async()=>({enabled:false}),toast:()=>{},tasks:(id,opts)=>{assert.equal(id,17);options=opts;}});
 vm.runInContext(source.slice(source.indexOf(" $('#apswitch')?.addEventListener('change'"),source.indexOf(" $('#whopswitch')?.addEventListener('change'")),context);
 await listener({target:document.querySelector('#apswitch')});assert.equal(options?.isCurrent,isCurrent);
});
