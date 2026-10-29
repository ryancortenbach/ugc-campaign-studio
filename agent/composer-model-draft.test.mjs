import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';

const source=readFileSync(new URL('./public/app.js',import.meta.url),'utf8');
const composerSource=source.slice(source.indexOf('const composerTools='),source.indexOf('async function sendComposer(){'));
function fixture(t){
 const dom=new JSDOM('<main id="view"></main>');t.after(()=>dom.window.close());const {document}=dom.window,preferences=new Map(),notices=[];
 Object.defineProperty(dom.window.HTMLFormElement.prototype,'message',{get(){return this.elements.namedItem('message');}});
 const context=vm.createContext({document,URL:dom.window.URL,$:selector=>document.querySelector(selector),esc:value=>String(value??''),ic:()=>'',pref:{get:(key,fallback)=>preferences.get(key)||fallback,set:(key,value)=>preferences.set(key,value)},state:{config:{mainModels:['claude-sonnet-5-5','claude-haiku-5-5']}},toast:(...args)=>notices.push(args)});
 vm.runInContext(composerSource+'\nthis.composerState=comp;document.querySelector("#view").innerHTML=composerHTML()+modesHTML();bindComposer();',context);
 const openLink=value=>{document.querySelector('[data-cact="link"]').click();document.querySelector('#clink input').value=value;};
 const switchModel=()=>{document.querySelector('#cmodel').click();document.querySelector('[data-cmodel="claude-haiku-5-5"]').click();};
 return {document,preferences,notices,openLink,switchModel,comp:context.composerState};
}

test('changing the model preserves the open reference editor and its unsaved URL',t=>{
 const f=fixture(t);f.document.querySelector('textarea').value='Keep this unsent message';f.openLink('https://brand.example/products/tee');f.switchModel();
 assert.equal(f.preferences.get('model'),'claude-haiku-5-5');assert.equal(f.document.querySelector('textarea').value,'Keep this unsent message');
 assert.equal(f.document.querySelector('#clink input').value,'https://brand.example/products/tee');assert.equal(f.document.querySelector('#clink').hidden,false);assert.equal(f.comp.links.length,0);
 f.document.querySelector('#clinkadd').click();assert.equal(f.comp.links.length,1);assert.equal(f.comp.links[0],'https://brand.example/products/tee');assert.equal(f.document.querySelector('#clink input').value,'');
});

test('a rejected link remains editable after choosing a model',t=>{
 const f=fixture(t);f.openLink('https://brand.example pasted notes');f.document.querySelector('#clinkadd').click();assert.equal(f.notices.at(-1)[1],'bad');
 f.switchModel();assert.equal(f.document.querySelector('#clink input').value,'https://brand.example pasted notes');assert.equal(f.document.querySelector('#clink').hidden,false);assert.equal(f.comp.links.length,0);
});

test('saved links and file references survive model changes without duplication',t=>{
 const f=fixture(t);f.openLink('https://brand.example');f.document.querySelector('#clinkadd').click();
 const file={key:'fixture-file',name:'reference.png',id:'fixture-upload',uploading:false};f.comp.files.push(file);f.switchModel();
 assert.equal(f.comp.files[0],file);assert.equal(f.comp.links.length,1);assert.equal(f.comp.links[0],'https://brand.example');assert.equal(f.document.querySelectorAll('.cfile').length,2);assert.equal(f.document.querySelector('#clink').hidden,true);
});

test('a model change keeps an unused link editor hidden',t=>{
 const f=fixture(t);f.switchModel();assert.equal(f.document.querySelector('#clink').hidden,true);assert.equal(f.document.querySelector('#clink input').value,'');
});

test('switching composer mode also preserves the unsaved reference editor',t=>{
 const f=fixture(t);f.openLink('https://reference.example/shot');f.document.querySelector('[data-ctool="storyboard"]').click();
 assert.equal(f.comp.tool,'storyboard');assert.equal(f.document.querySelector('#clink input').value,'https://reference.example/shot');assert.equal(f.document.querySelector('#clink').hidden,false);assert.equal(f.comp.links.length,0);
});
