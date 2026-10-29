import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const source=readFileSync(new URL('./public/app.js',import.meta.url),'utf8');
const composerSource=source.slice(source.indexOf('const composerTools='),source.indexOf('async function sendComposer(){'));
const routeSource=source.slice(source.indexOf('let lastView,routeVersion=0;'),source.indexOf("window.addEventListener('hashchange',route);"));
function fixture(t){
 const dom=new JSDOM('<button id="outside">Outside</button><main id="view"></main><aside id="drawer" hidden></aside>',{url:'https://fixture.example/#/home'});t.after(()=>dom.window.close());
 const {document}=dom.window,preferences=new Map(),reads=[],notices=[];
 Object.defineProperty(dom.window.HTMLFormElement.prototype,'message',{get(){return this.elements.namedItem('message');}});
 const context=vm.createContext({document,location:dom.window.location,URL:dom.window.URL,URLSearchParams,Event:dom.window.Event,renderWatcher:null,
  $:s=>document.querySelector(s),esc:String,ic:()=>'',state:{config:{mainModels:['claude-sonnet-5-5','claude-haiku-5-5']}},
  pref:{get:(k,v)=>preferences.get(k)||v,set:(k,v)=>preferences.set(k,v)},toast:(...args)=>notices.push(args),renderShell:()=>{},
  loadState:()=>new Promise(resolve=>reads.push(resolve)),openRail:()=>assert.fail('No rail action expected'),api:()=>assert.fail('No provider or mutation calls expected')});
 vm.runInContext(composerSource+routeSource+`\nconst mountHome=()=>{document.querySelector('#view').innerHTML=composerHTML()+modesHTML();bindComposer();};const views={home:mountHome,tasks:()=>{document.querySelector('#view').innerHTML='<h2>Current task</h2>';}};mountHome();this.mount=route;this.composerState=comp;`,context);
 const open=(url,text='Unsent message')=>{document.querySelector('textarea').value=text;document.querySelector('[data-cact="link"]').click();document.querySelector('#clink input').value=url;};
 return {document,dom,reads,notices,open,mount:context.mount,comp:context.composerState};
}
test('a Home route refresh preserves its unsaved reference URL and open editor',async t=>{
 const f=fixture(t);f.open('https://brand.example/products/tee');const pending=f.mount();f.reads[0]();await pending;
 assert.equal(f.document.querySelector('#clink input').value,'https://brand.example/products/tee');assert.equal(f.document.querySelector('#clink').hidden,false);
 assert.equal(f.document.querySelector('textarea').value,'Unsent message');assert.equal(f.comp.links.length,0);
});
test('edits during the state read replace the earlier message and URL snapshots',async t=>{
 const f=fixture(t);f.open('https://old.example');const pending=f.mount();f.document.querySelector('#clink input').value='https://new.example';f.document.querySelector('textarea').value='Newer unsent message';
 f.reads[0]();await pending;assert.equal(f.document.querySelector('#clink input').value,'https://new.example');assert.equal(f.document.querySelector('textarea').value,'Newer unsent message');
});
test('deliberately cleared fields during the read cannot be restored from older text',async t=>{
 const f=fixture(t);f.open('https://old.example');const pending=f.mount();f.document.querySelector('#clink input').value='';f.document.querySelector('textarea').value='';
 f.reads[0]();await pending;assert.equal(f.document.querySelector('#clink input').value,'');assert.equal(f.document.querySelector('textarea').value,'');assert.equal(f.document.querySelector('#clink').hidden,false);
});
test('a rejected reference stays editable and focused through a Home refresh',async t=>{
 const f=fixture(t);f.open('not a URL');f.document.querySelector('#clinkadd').click();const pending=f.mount();f.reads[0]();await pending;
 assert.equal(f.document.querySelector('#clink input').value,'not a URL');assert.equal(f.document.querySelector('#clink').hidden,false);assert.equal(f.document.activeElement,f.document.querySelector('#clink input'));
 assert.equal(f.comp.links.length,0);assert.equal(f.notices.length,1);
});
test('an older route cannot overwrite the draft restored by a newer Home route',async t=>{
 const f=fixture(t);f.open('https://old.example');const old=f.mount();f.document.querySelector('#clink input').value='https://current.example';const current=f.mount();
 f.reads[1]();await current;const input=f.document.querySelector('#clink input');input.value='https://typed-after.example';f.reads[0]();await old;
 assert.equal(f.document.querySelector('#clink input'),input);assert.equal(input.value,'https://typed-after.example');
});
test('leaving Home does not populate a task with the old composer draft',async t=>{
 const f=fixture(t);f.open('https://reference.example');f.dom.window.location.hash='#/tasks';const pending=f.mount();f.reads[0]();await pending;
 assert.equal(f.document.querySelector('#view').textContent,'Current task');assert.equal(f.document.querySelector('#composer'),null);
});
test('focus changes during the state read follow the latest composer field',async t=>{
 const f=fixture(t);f.open('https://reference.example');const pending=f.mount();f.document.querySelector('textarea').focus();f.reads[0]();await pending;
 assert.equal(f.document.activeElement,f.document.querySelector('textarea'));
});
test('a refresh does not steal focus after the user moves outside the composer',async t=>{
 const f=fixture(t);f.open('https://reference.example');const pending=f.mount(),outside=f.document.querySelector('#outside');outside.focus();f.reads[0]();await pending;
 assert.equal(f.document.activeElement,outside);
});
test('a link accepted during the read stays attached once with its editor closed',async t=>{
 const f=fixture(t);f.open('https://reference.example');const pending=f.mount();f.document.querySelector('#clinkadd').click();f.reads[0]();await pending;
 assert.equal(f.comp.links.length,1);assert.equal(f.document.querySelectorAll('.cfile').length,1);assert.equal(f.document.querySelector('#clink input').value,'');assert.equal(f.document.querySelector('#clink').hidden,true);
});
for(const action of ['model','mode'])test(`a ${action} redraw during a pending Home refresh retains the latest draft`,async t=>{
 const f=fixture(t);f.open('https://reference.example');const pending=f.mount();
 if(action==='model')f.document.querySelector('[data-cmodel="claude-haiku-5-5"]').click();else f.document.querySelector('[data-ctool="storyboard"]').click();
 f.document.querySelector('textarea').value='Updated after redraw';f.document.querySelector('#clink input').value='https://redrawn.example';f.reads[0]();await pending;
 assert.equal(f.document.querySelector('textarea').value,'Updated after redraw');assert.equal(f.document.querySelector('#clink input').value,'https://redrawn.example');assert.equal(f.document.querySelector('#clink').hidden,false);
 if(action==='model')assert.match(f.document.querySelector('#cmodel').textContent,/Haiku/);else assert.equal(f.comp.tool,'storyboard');
});
