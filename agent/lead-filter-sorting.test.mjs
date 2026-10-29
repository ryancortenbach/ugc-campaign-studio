import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const source=readFileSync(new URL('./public/app.js',import.meta.url),'utf8');
const mapsSource=source.slice(source.indexOf('async function loadDraftMaps('),source.indexOf('const lstat='));
const leadsSource=source.slice(source.indexOf('const leadFilters='),source.indexOf('// Drafts live inside Leads now.'));
const lead=(id,status='drafted',company='Brand '+id)=>({id,status,company,domain:'brand'+id+'.example'});
async function fixture(t,list,{sort='newest',filter='all',drafts=[],packet=null}={}){
 const dom=new JSDOM('<main id="view"></main>',{url:'https://fixture.example/#/leads'});t.after(()=>dom.window.close());const {document}=dom.window,preferences=new Map([['lsort',sort],['lfilter',filter]]),state={gmail:new Map(),dm:new Map(),dr:new Map()},calls=[];let rows=list,mail=drafts;
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const context=vm.createContext({document,URL:dom.window.URL,history:dom.window.history,state,$:s=>document.querySelector(s),esc,ic:()=>'',closeMenus:()=>{},toast:()=>assert.fail('No mutations permitted'),pref:{get:(k,v)=>preferences.get(k)??v,set:(k,v)=>preferences.set(k,v)},api:async(path,body)=>{assert.equal(body,undefined);assert.equal(path,'/api/leads');calls.push(path);return {leads:rows};},tryGet:async path=>path==='/api/drafts'?{drafts:mail}:packet,leadRow:l=>`<div class="trow" data-id="${l.id}">${esc(l.company||l.domain)}</div>`});
 vm.runInContext(mapsSource+leadsSource,context);await context.leads();
 return {document,preferences,calls,mount:arg=>context.leads(arg),set:(next,nextMail=mail)=>{rows=next;mail=nextMail;},ids:()=>[...document.querySelectorAll('.trow[data-id]')].map(n=>Number(n.dataset.id)),count:k=>Number(document.querySelector(`[data-lf="${k}"] .n`).textContent)};
}

test('status sort places qualified research after drafting and before grading',async t=>{
 const f=await fixture(t,[lead(1,'drafted'),lead(2,'awaiting_video'),lead(3,'drafting'),lead(4,'qualified'),lead(5,'grading'),lead(6,'visiting')],{sort:'status'});assert.deepEqual(f.ids(),[1,2,3,4,5,6]);assert.equal(f.count('all'),6);
});
test('name sorting uses the domain when a company name is empty or missing',async t=>{
 const f=await fixture(t,[{...lead(1),company:null,domain:'alpha.example'},lead(2,'drafted','Zulu'),{...lead(3),company:'',domain:'beta.example'}],{sort:'name'});assert.deepEqual(f.ids(),[1,3,2]);assert.match(f.document.querySelector('#crm').textContent,/alpha.example/);
});
test('empty filters show an explicit message and recover when matching data arrives',async t=>{
 const f=await fixture(t,[lead(1)],{filter:'drafts'});assert.equal(f.ids().length,0);assert.equal(f.count('drafts'),0);assert.match(f.document.querySelector('#crm').textContent,/No brands match this filter/);f.set([lead(1)],[{id:11,lead_id:1,status:'gmail_draft'}]);await f.mount();assert.deepEqual(f.ids(),[1]);assert.equal(f.count('drafts'),1);
});
test('filter counts exclude rejected drafts and withdrawn records',async t=>{
 const f=await fixture(t,[lead(1),lead(2,'rejected'),lead(3,'awaiting_video'),lead(4,'error')],{filter:'drafts',drafts:[{id:11,lead_id:1,status:'gmail_draft'},{id:22,lead_id:2,status:'gmail_draft'},{id:33,lead_id:3,status:'withdrawn'}]});assert.deepEqual(f.ids(),[1]);assert.equal(f.count('all'),3);assert.equal(f.count('drafts'),1);assert.equal(f.count('awaiting_video'),1);assert.equal(f.count('issues'),1);assert.equal(f.count('rejected'),1);
});
test('invalid saved preferences fall back to visible default controls',async t=>{
 const f=await fixture(t,[lead(1),lead(2)],{sort:'removed-sort',filter:'removed-filter'});assert.deepEqual(f.ids(),[2,1]);assert.equal(f.document.querySelector('[data-lf][aria-pressed="true"]').dataset.lf,'all');assert.equal(f.document.querySelector('#sortbtn span').textContent,'Newest');
});
test('simulated purchases keep their priority while other brands use the selected sort',async t=>{
 const f=await fixture(t,[lead(1,'drafted','Alpha'),lead(2,'drafted','Zulu'),lead(3,'drafted','Beta')],{sort:'name',packet:{mode:'demo',brands:[{id:'disobedient',website:'https://www.brand2.example/'}]}});assert.deepEqual(f.ids(),[2,1,3]);assert.equal(f.count('all'),3);
});
test('status ties retain newest-first ordering within their group',async t=>{
 const f=await fixture(t,[lead(1,'qualified'),lead(3,'qualified'),lead(2,'qualified')],{sort:'status'});assert.deepEqual(f.ids(),[3,2,1]);
});
