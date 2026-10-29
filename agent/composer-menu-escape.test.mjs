import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const source=readFileSync(new URL('./public/app.js',import.meta.url),'utf8');
const snippet=source.slice(source.indexOf('const composerTools='),source.indexOf('async function sendComposer(){'));
function fixture(t){
 const dom=new JSDOM('<main id="view"></main>');t.after(()=>dom.window.close());const {document}=dom.window;
 Object.defineProperty(dom.window.HTMLFormElement.prototype,'message',{get(){return this.elements.namedItem('message');}});
 const context=vm.createContext({document,URL:dom.window.URL,$:s=>document.querySelector(s),esc:String,ic:()=>'',pref:{get:(k,d)=>d,set:()=>{}},state:{config:{mainModels:['claude-sonnet-5-5','claude-haiku-5-5']}},toast:()=>assert.fail('No action expected'),api:()=>assert.fail('No API calls allowed')});
 vm.runInContext(snippet+'\ndocument.querySelector("#view").innerHTML=composerHTML();bindComposer();',context);
 const key=(target,key='Escape')=>{const event=new dom.window.KeyboardEvent('keydown',{key,bubbles:true,cancelable:true});target.dispatchEvent(event);return event;};
 return {document,key,button:id=>document.querySelector('#'+id),menu:id=>document.querySelector('#'+id+'menu')};
}
for(const id of ['cplus','cmodel']){
 test(`${id} Escape from an option closes the menu and returns focus to its trigger`,t=>{
  const f=fixture(t),button=f.button(id),menu=f.menu(id);button.focus();button.click();const option=menu.querySelector('button');option.focus();const event=f.key(option);assert.equal(menu.hidden,true);assert.equal(button.getAttribute('aria-expanded'),'false');assert.equal(f.document.activeElement,button);assert.equal(event.defaultPrevented,true);button.click();assert.equal(menu.hidden,false);
 });
 test(`${id} Escape from its open trigger closes the menu`,t=>{
  const f=fixture(t),button=f.button(id);button.focus();button.click();const event=f.key(button);assert.equal(f.menu(id).hidden,true);assert.equal(button.getAttribute('aria-expanded'),'false');assert.equal(f.document.activeElement,button);assert.equal(event.defaultPrevented,true);
 });
}
test('a handled menu Escape does not also reach an enclosing document layer',t=>{
 const f=fixture(t);let escapes=0;f.document.addEventListener('keydown',e=>{if(e.key==='Escape')escapes++;});f.button('cmodel').click();const option=f.menu('cmodel').querySelector('button');option.focus();f.key(option);assert.equal(escapes,0);assert.equal(f.menu('cmodel').hidden,true);
});
test('Escape on a closed menu remains available to other layers',t=>{
 const f=fixture(t);let escapes=0;f.document.addEventListener('keydown',e=>{if(e.key==='Escape')escapes++;});const button=f.button('cplus');button.focus();const event=f.key(button);assert.equal(event.defaultPrevented,false);assert.equal(escapes,1);assert.equal(f.document.activeElement,button);
});
test('menu dismissal preserves the unsent message and open link editor',t=>{
 const f=fixture(t),message=f.document.querySelector('textarea');message.value='Keep this draft';f.document.querySelector('[data-cact="link"]').click();const input=f.document.querySelector('#clink input');input.value='https://unsaved.example/product';f.button('cmodel').click();const option=f.menu('cmodel').querySelector('button');option.focus();f.key(option);assert.equal(f.menu('cmodel').hidden,true);assert.equal(f.document.querySelector('textarea'),message);assert.equal(message.value,'Keep this draft');assert.equal(input.value,'https://unsaved.example/product');assert.equal(f.document.querySelector('#clink').hidden,false);
});
test('other option keys do not dismiss or consume the menu',t=>{
 const f=fixture(t);f.button('cplus').click();const option=f.menu('cplus').querySelector('button');option.focus();const event=f.key(option,'ArrowDown');assert.equal(f.menu('cplus').hidden,false);assert.equal(event.defaultPrevented,false);assert.equal(f.document.activeElement,option);
});
