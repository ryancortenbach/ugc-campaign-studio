import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';

const source=readFileSync(new URL('./public/app.js',import.meta.url),'utf8');
const tabsSource=source.slice(source.indexOf('const railTabs='),source.indexOf('// The rail is a pullout:'));
function fixture(t){
 const dom=new JSDOM('<input id="other"><div id="rtabs" role="tablist"></div><section id="livefeed"></section><section id="spendbody" hidden></section><section id="connbody" hidden></section><section id="browserbody" hidden><button id="browser-control">Existing browser control</button></section>');
 t.after(()=>dom.window.close());const {document}=dom.window,preferences=new Map(),calls=[];
 const context=vm.createContext({document,$:selector=>document.querySelector(selector),ic:()=>'',pref:{get:(key,fallback)=>preferences.get(key)||fallback,set:(key,value)=>preferences.set(key,value)},
  paintSpend:()=>calls.push('paintSpend'),renderSpend:async()=>calls.push('renderSpend'),paintConns:()=>calls.push('paintConns'),loadConns:async()=>calls.push('loadConns')});
 vm.runInContext(tabsSource+'\nthis.showTab=setRailTab;',context);context.showTab('live');
 return {document,calls,preferences,show:context.showTab};
}

test('activating each rail tab retains keyboard focus on its replacement control',t=>{
 const f=fixture(t),panels={live:'livefeed',spend:'spendbody',conn:'connbody',browser:'browserbody'};
 for(const tab of ['spend','conn','browser','live']){
  const button=f.document.querySelector(`[data-rtab="${tab}"]`);button.focus();button.click();
  const current=f.document.querySelector(`[data-rtab="${tab}"]`);
  assert.equal(f.document.activeElement,current);assert.equal(current.getAttribute('aria-selected'),'true');assert.equal(f.preferences.get('railtab'),tab);
  for(const [key,id] of Object.entries(panels))assert.equal(f.document.querySelector('#'+id).hidden,key!==tab);
 }
});

test('a rail update never steals focus from another control',t=>{
 const f=fixture(t),other=f.document.querySelector('#other');other.focus();f.show('conn');assert.equal(f.document.activeElement,other);
});

test('repainting the current rail tab retains focus and one selected tab',t=>{
 const f=fixture(t);f.document.querySelector('[data-rtab="live"]').focus();f.show('live');
 assert.equal(f.document.activeElement,f.document.querySelector('[data-rtab="live"]'));assert.equal(f.document.querySelectorAll('[aria-selected="true"]').length,1);
});

test('switching to Browser preserves its mounted controls and starts no provider operation',t=>{
 const f=fixture(t),control=f.document.querySelector('#browser-control');f.show('browser');
 assert.equal(f.document.querySelector('#browser-control'),control);assert.equal(f.document.querySelector('#browserbody').hidden,false);assert.equal(f.calls.length,0);
});
