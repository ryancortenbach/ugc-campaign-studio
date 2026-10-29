import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';

const source=readFileSync(new URL('./public/app.js',import.meta.url),'utf8');
const closeSource=source.slice(source.indexOf('function closeMenus(){'),source.indexOf('function bindComposer(){'));
const clickSource=source.slice(source.indexOf("document.addEventListener('click',e=>{if(!e.target.closest('.cwrap'))"),source.indexOf('const thread='));
const leadsSource=source.slice(source.indexOf('const leadFilters='),source.indexOf('// Drafts live inside Leads now.'));
async function fixture(t){
 const dom=new JSDOM('<button id="other" aria-expanded="true">Other control</button><main id="view"></main><button id="cplus" aria-expanded="false">Attachments</button><div class="cmenu" id="cplusmenu" hidden></div><button id="cmodel" aria-expanded="false">Model</button><div class="cmenu" id="cmodelmenu" hidden></div>',{url:'http://mint.test/#/leads'});
 t.after(()=>dom.window.close());const {document}=dom.window,preferences=new Map(),calls=[];
 const context=vm.createContext({document,history:dom.window.history,$:selector=>document.querySelector(selector),esc:String,ic:()=>'',state:{},toast:()=>{},leadRow:()=>'',pref:{get:(key,fallback)=>preferences.get(key)||fallback,set:(key,value)=>preferences.set(key,value)},
  loadDraftMaps:async()=>[],tryGet:async path=>{assert.equal(path,'/api/client-demo');return null;},api:async(path,body)=>{assert.equal(path,'/api/leads');assert.equal(body,undefined);calls.push(path);return {leads:[]};}});
 vm.runInContext(closeSource+clickSource+leadsSource+'\nthis.mountLeads=leads;this.dismiss=closeMenus;',context);await context.mountLeads();
 return {document,preferences,calls,dismiss:context.dismiss};
}

test('outside dismissal closes the sort menu and its expanded announcement together',async t=>{
 const f=await fixture(t),button=f.document.querySelector('#sortbtn'),menu=f.document.querySelector('#sortmenu');button.click();
 assert.equal(menu.hidden,false);assert.equal(button.getAttribute('aria-expanded'),'true');
 f.document.querySelector('#other').click();
 assert.equal(menu.hidden,true);assert.equal(button.getAttribute('aria-expanded'),'false');
});

test('the sort trigger can still toggle its menu open and closed',async t=>{
 const f=await fixture(t),button=f.document.querySelector('#sortbtn'),menu=f.document.querySelector('#sortmenu');
 button.click();button.click();assert.equal(menu.hidden,true);assert.equal(button.getAttribute('aria-expanded'),'false');
 button.click();assert.equal(menu.hidden,false);assert.equal(button.getAttribute('aria-expanded'),'true');
});

test('shared dismissal resets known menu triggers without changing unrelated disclosures',async t=>{
 const f=await fixture(t);
 for(const id of ['sortbtn','cplus','cmodel'])f.document.querySelector('#'+id).setAttribute('aria-expanded','true');
 for(const menu of f.document.querySelectorAll('.cmenu'))menu.hidden=false;
 f.dismiss();
 for(const id of ['sortbtn','cplus','cmodel'])assert.equal(f.document.querySelector('#'+id).getAttribute('aria-expanded'),'false');
 assert.ok([...f.document.querySelectorAll('.cmenu')].every(menu=>menu.hidden));assert.equal(f.document.querySelector('#other').getAttribute('aria-expanded'),'true');
});

test('selecting a sort option retains its preference and returns to a closed menu',async t=>{
 const f=await fixture(t);f.document.querySelector('#sortbtn').click();f.document.querySelector('[data-ls="name"]').click();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(f.preferences.get('lsort'),'name');assert.equal(f.document.querySelector('#sortbtn span').textContent,'Name');assert.equal(f.document.querySelector('#sortmenu').hidden,true);assert.equal(f.document.querySelector('#sortbtn').getAttribute('aria-expanded'),'false');assert.equal(f.calls.length,2);
});
