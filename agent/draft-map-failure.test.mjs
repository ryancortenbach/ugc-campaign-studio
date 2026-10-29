import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';

const source=readFileSync(new URL('./public/app.js',import.meta.url),'utf8');
const mapsSource=source.slice(source.indexOf('async function loadDraftMaps('),source.indexOf('const lstat='));
const leadsSource=source.slice(source.indexOf('const leadFilters='),source.indexOf('// Drafts live inside Leads now.'));
const lead={id:1,company:'Fixture brand',domain:'fixture.example',status:'drafted'};
const draft={id:11,lead_id:1,status:'gmail_draft',channel:'email',gmail_url:'https://mail.google.com/#drafts/11'};
function fixture(t){
 const dom=new JSDOM('<main id="view"></main>',{url:'https://fixture.example/#/leads'});t.after(()=>dom.window.close());
 const {document}=dom.window,state={gmail:new Map(),dm:new Map(),dr:new Map()},requests=[],preferences=new Map();
 const context=vm.createContext({document,state,history:dom.window.history,$:s=>document.querySelector(s),esc:String,ic:()=>'',closeMenus:()=>{},toast:()=>{},
  pref:{get:(k,v)=>preferences.get(k)||v,set:(k,v)=>preferences.set(k,v)},
  api:async path=>{assert.equal(path,'/api/leads');return {leads:[lead]};},
  tryGet:path=>{if(path==='/api/client-demo')return Promise.resolve(null);assert.equal(path,'/api/drafts');return new Promise(resolve=>requests.push(resolve));},
  leadRow:l=>`<div class="trow" data-id="${l.id}">${l.company}</div>`});
 vm.runInContext(mapsSource+leadsSource+'\nthis.mount=leads;',context);
 return {document,state,requests,maps:context.loadDraftMaps,mount:context.mount};
}
async function seed(f,drafts=[draft]){const p=f.maps();f.requests.at(-1)({drafts});await p;}

test('a failed draft reload retains the last known filter rows, count and Gmail link',async t=>{
 const f=fixture(t);await seed(f);
 const pending=f.mount('drafts');f.requests.at(-1)(null);await pending;
 assert.ok(f.document.querySelector('.trow[data-id="1"]'),'A failed read must not turn a known draft into an empty filter');
 assert.equal(f.document.querySelector('[data-lf="drafts"] .n').textContent,'1');
 assert.equal(f.state.dr.get(1)?.id,11);assert.equal(f.state.gmail.get(1),draft.gmail_url);
});

test('a failed shared reload retains primary drafts and DM readiness',async t=>{
 const f=fixture(t),dm={...draft,channel:'instagram_dm',status:'dm_ready',to_email:'@fixture',gmail_url:null};await seed(f,[dm]);
 const pending=f.maps();f.requests.at(-1)(null);const list=await pending;
 assert.equal(list.length,1);assert.equal(list[0].id,11);assert.equal(f.state.dr.get(1)?.id,11);
 assert.equal(f.state.dm.get(1)?.handle,'fixture');assert.equal(f.state.dm.get(1)?.status,'dm_ready');
});

test('a successful empty draft response removes prior maps and filter rows',async t=>{
 const f=fixture(t);await seed(f);
 const pending=f.mount('drafts');f.requests.at(-1)({drafts:[]});await pending;
 assert.equal(f.document.querySelector('.trow[data-id]'),null);assert.equal(f.document.querySelector('[data-lf="drafts"] .n').textContent,'0');
 assert.equal(f.state.dr.size,0);assert.equal(f.state.gmail.size,0);assert.equal(f.state.dm.size,0);
});

test('a successful retry replaces retained drafts and excludes withdrawn entries',async t=>{
 const f=fixture(t);await seed(f);const failed=f.maps();f.requests.at(-1)(null);await failed;
 await seed(f,[{...draft,id:22,gmail_url:'https://mail.google.com/#drafts/22'},{...draft,id:99,lead_id:2,status:'withdrawn'}]);
 assert.equal(f.state.dr.get(1).id,22);assert.equal(f.state.gmail.get(1),'https://mail.google.com/#drafts/22');assert.equal(f.state.dr.has(2),false);
});

test('an older successful read cannot overwrite maps after a newer failed reload',async t=>{
 const f=fixture(t);await seed(f);const old=f.maps(),oldResolve=f.requests.at(-1),latest=f.maps();
 f.requests.at(-1)(null);await latest;oldResolve({drafts:[{...draft,id:33}]});await old;
 assert.equal(f.state.dr.get(1)?.id,11);assert.equal(f.state.gmail.get(1),draft.gmail_url);
});

test('an initial failed read has no cached drafts or links to invent',async t=>{
 const f=fixture(t),pending=f.mount('drafts');f.requests.at(-1)(null);await pending;
 assert.equal(f.document.querySelector('.trow[data-id]'),null);assert.equal(f.document.querySelector('[data-lf="drafts"] .n').textContent,'0');
 assert.equal(f.state.dr.size,0);assert.equal(f.state.gmail.size,0);assert.equal(f.state.dm.size,0);
});

test('a late failed read cannot clear maps replaced by a newer successful load',async t=>{
 const f=fixture(t);await seed(f);const old=f.maps(),oldResolve=f.requests.at(-1);
 await seed(f,[{...draft,id:22,gmail_url:'https://mail.google.com/#drafts/22'}]);oldResolve(null);await old;
 assert.equal(f.state.dr.get(1).id,22);assert.equal(f.state.gmail.get(1),'https://mail.google.com/#drafts/22');
});
