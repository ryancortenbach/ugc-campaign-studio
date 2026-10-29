import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const source=readFileSync(new URL('./public/app.js',import.meta.url),'utf8');
const snippet=source.slice(source.indexOf('const leadFilters='),source.indexOf('// Drafts live inside Leads now.'));
async function fixture(t){
 const dom=new JSDOM('<button id="outside">Outside</button><main id="view"></main>',{url:'https://fixture.example/#/leads'});t.after(()=>dom.window.close());
 const {document}=dom.window,requests=[],prefs=new Map();let initial=true,active=true;
 const context=vm.createContext({document,history:dom.window.history,$:s=>document.querySelector(s),esc:String,ic:()=>'',state:{},closeMenus:()=>{},toast:()=>{},leadRow:()=>'',pref:{get:(k,d)=>prefs.get(k)||d,set:(k,v)=>prefs.set(k,v)},loadDraftMaps:async()=>[],tryGet:async()=>null,
  api:async(path,body)=>{assert.equal(path,'/api/leads');assert.equal(body,undefined);if(initial){initial=false;return {leads:[]};}return new Promise((resolve,reject)=>requests.push({resolve:()=>resolve({leads:[]}),reject}));}});
 vm.runInContext(snippet,context);const mount=()=>context.leads(undefined,{isCurrent:()=>active});await mount();
 return {document,requests,mount,leave:()=>{active=false;document.querySelector('#view').innerHTML='<h2>Current task</h2>';},filter:k=>document.querySelector(`[data-lf="${k}"]`),sort:k=>document.querySelector(`[data-ls="${k}"]`)};
}
test('successful filtering retains focus on its replacement filter even when empty',async t=>{
 const f=await fixture(t),button=f.filter('drafts');button.focus();const pending=button.onclick();f.requests[0].resolve();await pending;assert.equal(f.document.activeElement,f.filter('drafts'));assert.equal(f.filter('drafts').getAttribute('aria-pressed'),'true');assert.match(f.document.querySelector('#crm').textContent,/No brands match/);
});
test('successful sorting returns option focus to the closed sort trigger',async t=>{
 const f=await fixture(t);f.document.querySelector('#sortbtn').click();const option=f.sort('name');option.focus();const pending=option.onclick();f.requests[0].resolve();await pending;assert.equal(f.document.activeElement,f.document.querySelector('#sortbtn'));assert.equal(f.document.querySelector('#sortmenu').hidden,true);assert.equal(f.document.querySelector('#sortbtn').getAttribute('aria-expanded'),'false');assert.equal(f.document.querySelector('#sortbtn span').textContent,'Name');
});
test('an ordinary list refresh retains focus on the sort trigger',async t=>{
 const f=await fixture(t);f.document.querySelector('#sortbtn').focus();const pending=f.mount();f.requests[0].resolve();await pending;assert.equal(f.document.activeElement,f.document.querySelector('#sortbtn'));
});
test('focus moved outside while a filter is pending is not taken back',async t=>{
 const f=await fixture(t),button=f.filter('drafts');button.focus();const pending=button.onclick(),outside=f.document.querySelector('#outside');outside.focus();f.requests[0].resolve();await pending;assert.equal(f.document.activeElement,outside);
});
test('the latest focused toolbar control wins over the original pending filter',async t=>{
 const f=await fixture(t);f.filter('drafts').focus();const pending=f.filter('drafts').onclick();f.filter('issues').focus();f.requests[0].resolve();await pending;assert.equal(f.document.activeElement,f.filter('issues'));assert.equal(f.filter('drafts').getAttribute('aria-pressed'),'true');
});
test('a failed filter read retains the original focused control',async t=>{
 const f=await fixture(t),button=f.filter('drafts');button.focus();const pending=button.onclick();f.requests[0].reject(Error('Mock failure'));await pending;assert.equal(f.document.activeElement,button);assert.equal(button.isConnected,true);
});
test('a departed read cannot restore focus into the previous toolbar',async t=>{
 const f=await fixture(t);f.filter('drafts').focus();const pending=f.filter('drafts').onclick();f.leave();const outside=f.document.querySelector('#outside');outside.focus();f.requests[0].resolve();await pending;assert.equal(f.document.activeElement,outside);assert.equal(f.document.querySelector('#view').textContent,'Current task');
});
