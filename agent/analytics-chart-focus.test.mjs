import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {analyticsView} from './public/analytics.js';
import {summarizeAnalytics} from './analytics.mjs';
const turn=()=>new Promise(setImmediate);
const snapshot=(range='today',now='2026-10-29T18:00:00Z',usd=.1)=>summarizeAnalytics({range,now:new Date(now),coverage:{status:'live'},spend:[{at:'2026-10-29T05:00:00Z',provider:'claude',usd}]});
async function fixture(t){
 const dom=new JSDOM('<button id="outside">Outside</button><main></main>',{url:'https://fixture.example/#/analytics'}),view=dom.window.document.querySelector('main'),requests=[];
 const old=Object.fromEntries(['location','localStorage'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));globalThis.location=dom.window.location;globalThis.localStorage=dom.window.localStorage;
 t.after(()=>{dom.window.close();for(const [k,v] of Object.entries(old))if(v)Object.defineProperty(globalThis,k,v);else delete globalThis[k];});let first=true;
 await analyticsView({view,esc:String,toast:()=>{},api:async path=>{assert.match(path,/^\/api\/analytics\?range=(today|week)(&refresh=1)?$/);if(first){first=false;return snapshot();}return new Promise((resolve,reject)=>requests.push({resolve,reject}));}});
 const plot=()=>view.querySelector('.ap-an-chart'),key=k=>plot().dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:k,bubbles:true,cancelable:true}));
 const inspect=()=>{plot().focus();key('Home');key('ArrowRight');};
 const start=()=>{view.querySelector('[data-ap-metric="spend"]').click();view.querySelector('[data-ap-refresh]').click();inspect();};
 return {dom,view,requests,plot,key,inspect,start,label:()=>view.querySelector('[data-ap-chart-label]').textContent};
}
test('successful refresh retains chart focus and the inspected bucket with updated values',async t=>{
 const f=await fixture(t);f.start();assert.equal(f.label(),'1 AM EDT · $0.10');f.requests[0].resolve(snapshot('today','2026-10-29T19:08:00Z',.82));await turn();assert.equal(f.dom.window.document.activeElement,f.plot());assert.equal(f.label(),'1 AM EDT · $0.82');f.key('ArrowRight');assert.equal(f.label(),'2 AM EDT · $0.00');
});
test('failed refresh keeps keyboard focus and its previous inspected bucket',async t=>{
 const f=await fixture(t);f.start();f.requests[0].reject(Error('Mock failure'));await turn();assert.equal(f.dom.window.document.activeElement,f.plot());assert.equal(f.label(),'1 AM EDT · $0.10');f.key('ArrowLeft');assert.equal(f.label(),'12 AM EDT · $0.00');
});
test('a changed period without the inspected bucket restores focus at its latest bucket',async t=>{
 const f=await fixture(t);f.view.querySelector('[data-ap-range="week"]').click();f.inspect();f.requests[0].resolve(snapshot('week'));await turn();assert.equal(f.dom.window.document.activeElement,f.plot());assert.equal(f.label(),'Oct 29 · $0.00');f.key('ArrowLeft');assert.equal(f.label(),'Oct 28 · $0.00');
});
test('a new day without the old bucket retains focus on current data',async t=>{
 const f=await fixture(t);f.start();f.requests[0].resolve(snapshot('today','2026-10-30T05:10:00Z'));await turn();assert.equal(f.dom.window.document.activeElement,f.plot());assert.equal(f.label(),'1 AM EDT · $0.00');f.key('Home');assert.equal(f.label(),'12 AM EDT · $0.00');
});
test('moving outside the chart during its refresh does not take focus back',async t=>{
 const f=await fixture(t);f.start();const outside=f.dom.window.document.querySelector('#outside');outside.focus();f.requests[0].resolve(snapshot());await turn();assert.equal(f.dom.window.document.activeElement,outside);
});
test('moving to a metric control during the read retains that newer focus',async t=>{
 const f=await fixture(t);f.start();const metric=f.view.querySelector('[data-ap-metric="revenue"]');metric.focus();metric.click();f.requests[0].resolve(snapshot());await turn();assert.equal(f.dom.window.document.activeElement,f.view.querySelector('[data-ap-metric="revenue"]'));assert.equal(f.view.querySelector('[data-ap-metric="revenue"]').getAttribute('aria-pressed'),'true');
});
test('a departed response cannot recreate or focus the previous chart',async t=>{
 const f=await fixture(t);f.start();f.dom.window.location.hash='#/tasks';f.view.innerHTML='<h2>Current task</h2>';const outside=f.dom.window.document.querySelector('#outside');outside.focus();f.requests[0].resolve(snapshot());await turn();assert.equal(f.dom.window.document.activeElement,outside);assert.equal(f.view.textContent,'Current task');assert.equal(f.plot(),null);
});
