import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';

const source=readFileSync(new URL('./public/app.js',import.meta.url),'utf8');
const composerSource=source.slice(source.indexOf('const composerTools='),source.indexOf('async function sendComposer(){'));
function fixture(t){
 const dom=new JSDOM('<main id="view"></main>');t.after(()=>dom.window.close());
 const {document}=dom.window,notices=[];
 Object.defineProperty(dom.window.HTMLFormElement.prototype,'message',{get(){return this.elements.namedItem('message');}});
 const context=vm.createContext({document,URL:dom.window.URL,$:selector=>document.querySelector(selector),esc:value=>String(value??''),ic:()=>'',pref:{get:(key,fallback)=>fallback},state:{config:{mainModels:[]}},toast:(...args)=>notices.push(args)});
 vm.runInContext(composerSource+'\nthis.composerState=comp;document.querySelector("#view").innerHTML=composerHTML();bindComposer();',context);
 const input=document.querySelector('#clink input');
 const add=value=>{document.querySelector('[data-cact="link"]').click();input.value=value;document.querySelector('#clinkadd').click();};
 return {dom,document,input,add,notices,comp:context.composerState};
}

test('a pasted URL followed by notes is rejected and retained for correction',t=>{
 const f=fixture(t),text='https://brand.example Look at this product';f.add(text);
 assert.equal(f.comp.links.length,0);assert.equal(f.input.value,text);assert.equal(f.document.querySelector('#clink').hidden,false);
 assert.equal(f.notices.at(-1)[0],'Paste a full link starting with https://');
});

test('a URL with an invalid port is rejected instead of becoming an attachment',t=>{
 const f=fixture(t);f.add('https://brand.example:not-a-port/product');
 assert.equal(f.comp.links.length,0);assert.equal(f.notices.at(-1)[1],'bad');
});

test('valid HTTP and HTTPS references retain their exact trimmed URL and clear the editor',t=>{
 const f=fixture(t);
 for(const url of ['https://brand.example/products/tee?variant=blue%20gray#details','http://shop.example:8080/catalog']){
  f.add('  '+url+'  ');assert.equal(f.comp.links.at(-1),url);assert.equal(f.input.value,'');assert.equal(f.document.querySelector('#clink').hidden,true);
 }
 assert.equal(f.document.querySelectorAll('[data-unlink]').length,2);assert.equal(f.notices.length,0);
});

test('unsupported schemes and missing hostnames remain invalid',t=>{
 const f=fixture(t);
 for(const url of ['ftp://brand.example/product','javascript:alert(1)','https://','brand.example/product']){f.add(url);assert.equal(f.comp.links.length,0);}
 assert.equal(f.notices.length,4);
});

test('Enter adds one reference without submitting and removed links keep their correct index',t=>{
 const f=fixture(t);f.document.querySelector('[data-cact="link"]').click();f.input.value='https://one.example';
 const event=new f.dom.window.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true});f.input.dispatchEvent(event);
 assert.equal(event.defaultPrevented,true);assert.equal(f.comp.links.length,1);
 f.add('https://two.example');f.document.querySelector('[data-unlink="0"]').click();
 assert.equal(f.comp.links.length,1);assert.equal(f.comp.links[0],'https://two.example');
 f.document.querySelector('[data-unlink="0"]').click();assert.equal(f.comp.links.length,0);assert.equal(f.document.querySelectorAll('.cfile').length,0);
});
