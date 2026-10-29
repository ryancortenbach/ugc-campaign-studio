import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {JSDOM} from 'jsdom';
const source=readFileSync(new URL('./public/app.js',import.meta.url),'utf8');
const settingsSource=source.slice(source.indexOf('async function settings('),source.indexOf('\nasync function voices('));
const routeSource=source.slice(source.indexOf('let lastView,routeVersion=0;'),source.indexOf("window.addEventListener('hashchange',route);"));
const profile={senderName:'Fixture sender',company:'Fixture company',senderFact:'Fixture fact',offer:'Fixture offer',cta:'Fixture CTA',rules:'Fixture rules'};
async function fixture(t){
 const dom=new JSDOM('<main id="view"></main><aside id="drawer" hidden></aside>',{url:'https://fixture.example/#/settings'});t.after(()=>dom.window.close());
 const {document}=dom.window,state={config:{profile:{...profile}}},requests=[];let hold=false,release,onRead=()=>{};
 const context=vm.createContext({document,FormData:dom.window.FormData,state,$:s=>document.querySelector(s),esc:s=>String(s??''),loadState:async()=>{if(hold){hold=false;await new Promise(resolve=>release=resolve);}onRead();},connRows:()=>[],autosize:()=>{},toast:()=>{},api:(path,body)=>{assert.equal(path,'/api/profile');return new Promise(resolve=>requests.push({body,resolve}));},location:dom.window.location,URLSearchParams:dom.window.URLSearchParams,Event:dom.window.Event,renderWatcher:null,renderShell:()=>{},openRail:()=>{},home:()=>{}});
 vm.runInContext(settingsSource+'\nconst views={settings};\n'+routeSource,context);await context.route();
 const field=name=>document.querySelector(`[name="${name}"]`),edit=(name,value)=>{field(name).value=value;field(name).dispatchEvent(new dom.window.Event('input',{bubbles:true}));};
 return {document,state,requests,field,edit,route:context.route,mount:context.settings,readState:fn=>onRead=fn,hold:()=>hold=true,release:()=>release(),submit:()=>document.querySelector('#profile').onsubmit({preventDefault(){}}),status:()=>document.querySelector('#pfstate').textContent};
}
test('refreshing Settings preserves edits to an existing nonempty field',async t=>{
 const f=await fixture(t);f.edit('senderName','Edited sender');await f.route();assert.equal(f.field('senderName').value,'Edited sender');assert.equal(f.status(),'Unsaved changes');const pending=f.submit();assert.equal(f.requests[0].body.senderName,'Edited sender');f.requests[0].resolve({});await pending;
});
test('refreshing Settings preserves deliberately cleared text and multiline fields',async t=>{
 const f=await fixture(t);f.edit('senderName','');f.edit('rules','');await f.route();assert.equal(f.field('senderName').value,'');assert.equal(f.field('rules').value,'');assert.equal(f.status(),'Unsaved changes');assert.equal(f.document.querySelector('#pfsave').disabled,false);
});
test('edits made during a pending route refresh supersede its earlier captured text',async t=>{
 const f=await fixture(t);f.edit('offer','Earlier draft');f.hold();const pending=f.route();f.edit('offer','');f.edit('rules','Latest rules\nsecond line');f.release();await pending;assert.equal(f.field('offer').value,'');assert.equal(f.field('rules').value,'Latest rules\nsecond line');assert.equal(f.status(),'Unsaved changes');
});
test('unchanged fields adopt fresh server values while dirty fields remain local',async t=>{
 const f=await fixture(t);f.edit('rules','My unsaved rules');f.state.config.profile.company='Fresh server company';await f.route();assert.equal(f.field('company').value,'Fresh server company');assert.equal(f.field('rules').value,'My unsaved rules');assert.equal(f.status(),'Unsaved changes');assert.equal(f.requests.length,0);
});
test('a clean Settings refresh displays changed server values without inventing a draft',async t=>{
 const f=await fixture(t);f.state.config.profile.senderName='Fresh server sender';await f.route();assert.equal(f.field('senderName').value,'Fresh server sender');assert.equal(f.status(),'All changes saved');assert.equal(f.document.querySelector('#pfsave').disabled,true);assert.equal(f.requests.length,0);
});
test('save completion during a refresh preserves a newer cleared draft against the saved snapshot',async t=>{
 const f=await fixture(t);f.edit('offer','Submitted offer');const saving=f.submit();f.hold();const refreshing=f.route();f.edit('offer','');f.state.config.profile.offer='Submitted offer';f.requests[0].resolve({});await saving;f.release();await refreshing;assert.equal(f.field('offer').value,'');assert.equal(f.status(),'Unsaved changes');const retry=f.submit();assert.equal(f.requests[1].body.offer,'');f.requests[1].resolve({});await retry;assert.equal(f.status(),'All changes saved');
});
test('a state read captured before successful save cannot restore old values as saved',async t=>{
 const f=await fixture(t);f.edit('offer','Confirmed saved offer');const saving=f.submit();let reads=0;f.readState(()=>{f.state.config.profile={...profile,...(reads++?{offer:'Confirmed saved offer'}:{})};});f.hold();const refreshing=f.mount();f.requests[0].resolve({});await saving;f.release();await refreshing;assert.equal(f.field('offer').value,'Confirmed saved offer');assert.equal(f.status(),'All changes saved');assert.equal(f.document.querySelector('#pfsave').disabled,true);assert.equal(f.requests.length,1);
});
test('saving away from and back to the original value still invalidates an intervening read',async t=>{
 const f=await fixture(t);f.edit('offer','Intermediate saved offer');const first=f.submit();let reads=0;f.readState(()=>{f.state.config.profile={...profile,...(reads++?{}:{offer:'Intermediate saved offer'})};});f.hold();const refreshing=f.mount();f.requests[0].resolve({});await first;f.edit('offer',profile.offer);const second=f.submit();f.requests[1].resolve({});await second;f.release();await refreshing;assert.equal(f.field('offer').value,profile.offer);assert.equal(f.status(),'All changes saved');assert.equal(f.requests.length,2);
});
