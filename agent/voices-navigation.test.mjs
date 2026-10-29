import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {voicesView} from './public/voices.js';

function fixture(t,api){
 const dom=new JSDOM('<main></main>');t.after(()=>dom.window.close());
 for(const name of ['description','line','storyboardId'])Object.defineProperty(dom.window.HTMLFormElement.prototype,name,{get(){return this.elements.namedItem(name);}});
 const view=dom.window.document.querySelector('main');let active=true;
 const options={view,api,esc:String,toast:()=>{},sbadge:()=>'',svg:()=>'',isCurrent:()=>active};
 return {view,options,leave(){active=false;view.innerHTML='<h2>Current task</h2>';}};
}
const empty={voices:[],enabled:true};

test('leaving Voices during its initial load cannot replace the new route',async t=>{
 let release;const calls=[],f=fixture(t,path=>{calls.push(path);return path==='/api/voices'?new Promise(resolve=>release=resolve):Promise.resolve({storyboards:[]});});
 const pending=voicesView(f.options);f.leave();release(empty);await pending;
 assert.equal(f.view.textContent,'Current task');assert.deepEqual(calls,['/api/voices']);
});

test('leaving Voices during the storyboard read also preserves the new route',async t=>{
 let release,enter;const entered=new Promise(resolve=>enter=resolve);
 const f=fixture(t,async path=>{if(path==='/api/voices')return empty;enter();return new Promise(resolve=>release=resolve);});
 const pending=voicesView(f.options);await entered;f.leave();release({storyboards:[]});await pending;
 assert.equal(f.view.textContent,'Current task');
});

test('an older mount cannot overwrite a newer mount on the same view',async t=>{
 let release,reads=0;
 const f=fixture(t,async path=>{if(path==='/api/storyboards')return {storyboards:[]};if(++reads===1)return new Promise(resolve=>release=resolve);return {voices:[],enabled:false};});
 const old=voicesView(f.options);await voicesView(f.options);
 assert.match(f.view.textContent,/Add ELEVENLABS_API_KEY/);release(empty);await old;
 assert.match(f.view.textContent,/Add ELEVENLABS_API_KEY/);
});

test('a pending voice check cannot remount Voices after navigation',async t=>{
 let release,reads=0;
 const voice={id:1,name:'Fixture voice',description:'Fixture description',line:'Fixture sample',created_at:'2026-10-27T12:00:00Z',status:'needs_checks',sample_file:'fixture.wav'};
 const f=fixture(t,async path=>{if(path==='/api/voices'){reads++;return {voices:[voice],enabled:true};}if(path==='/api/storyboards')return {storyboards:[]};assert.equal(path,'/api/voices/1/check');return new Promise(resolve=>release=resolve);});
 await voicesView(f.options);const pending=f.view.querySelector('[data-vcheck]').onclick();f.leave();
 release({voice:{status:'checks_passed'}});await pending;await new Promise(resolve=>setImmediate(resolve));
 assert.equal(reads,1);assert.equal(f.view.textContent,'Current task');
});

test('a failed initial load propagates to the route without altering its existing content',async t=>{
 const f=fixture(t,async()=>{throw Error('Temporary failure');});f.view.textContent='Previous content';
 await assert.rejects(voicesView(f.options),/Temporary failure/);assert.equal(f.view.textContent,'Previous content');
});

test('the app Voices route forwards its navigation guard into the view',async()=>{
 const source=readFileSync(new URL('./public/app.js',import.meta.url),'utf8');let options;
 const guard=()=>false,context=vm.createContext({voicesView:async value=>options=value,$:()=>({}),api:()=>{},esc:String,toast:()=>{},sbadge:()=>'',svg:()=>''});
 vm.runInContext(source.slice(source.indexOf('async function voices('),source.indexOf('async function production('))+'\nthis.mount=voices;',context);
 await context.mount(undefined,{isCurrent:guard});assert.equal(options.isCurrent,guard);
});
