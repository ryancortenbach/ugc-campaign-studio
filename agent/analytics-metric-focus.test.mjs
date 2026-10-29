import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {analyticsView} from './public/analytics.js';
import {summarizeAnalytics} from './analytics.mjs';

async function fixture(t){
 const dom=new JSDOM('<input id="other"><main></main>',{url:'http://mint.test/#/analytics'}),view=dom.window.document.querySelector('main'),calls=[];
 const originals=Object.fromEntries(['location','localStorage'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 globalThis.location=dom.window.location;globalThis.localStorage=dom.window.localStorage;
 t.after(()=>{dom.window.close();for(const [key,value] of Object.entries(originals))if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];});
 const snapshot=summarizeAnalytics({now:new Date('2026-10-29T14:00:00Z'),coverage:{status:'live'},spend:[{at:'2026-10-29T13:00:00Z',provider:'claude',usd:.62}]});
 await analyticsView({view,esc:String,api:async path=>{calls.push(path);assert.equal(path,'/api/analytics?range=today');return snapshot;}});
 return {dom,view,calls,document:dom.window.document};
}

test('switching to Spend retains keyboard focus on the replacement metric button',async t=>{
 const f=await fixture(t),button=f.view.querySelector('[data-ap-metric="spend"]');button.focus();button.click();
 const replacement=f.view.querySelector('[data-ap-metric="spend"]');
 assert.equal(f.document.activeElement,replacement);assert.equal(replacement.getAttribute('aria-pressed'),'true');
 assert.equal(f.view.querySelector('[data-ap-chart-label]').textContent,'$0.62');assert.equal(f.calls.length,1);
});

test('switching back to Revenue retains focus and its displayed values',async t=>{
 const f=await fixture(t);f.view.querySelector('[data-ap-metric="spend"]').click();
 const button=f.view.querySelector('[data-ap-metric="revenue"]');button.focus();button.click();
 assert.equal(f.document.activeElement,f.view.querySelector('[data-ap-metric="revenue"]'));
 assert.equal(f.view.querySelector('[data-ap-metric="revenue"]').getAttribute('aria-pressed'),'true');assert.equal(f.view.querySelector('[data-ap-chart-label]').textContent,'$0.00');assert.equal(f.calls.length,1);
});

test('programmatic metric switching does not take focus from another control',async t=>{
 const f=await fixture(t),other=f.document.querySelector('#other');other.focus();f.view.querySelector('[data-ap-metric="spend"]').click();
 assert.equal(f.document.activeElement,other);assert.equal(f.view.querySelector('[data-ap-metric="spend"]').getAttribute('aria-pressed'),'true');
});

test('the updated chart still supports bounded keyboard inspection without another API read',async t=>{
 const f=await fixture(t);f.view.querySelector('[data-ap-metric="spend"]').click();const plot=f.view.querySelector('.ap-an-chart');plot.focus();
 for(const key of ['Home','ArrowLeft','End','ArrowRight'])plot.dispatchEvent(new f.dom.window.KeyboardEvent('keydown',{key,bubbles:true}));
 assert.match(plot.getAttribute('aria-label'),/Recorded spend/);assert.doesNotMatch(plot.querySelector('svg').innerHTML,/NaN|Infinity|undefined/);assert.match(plot.querySelector('[data-ap-chart-label]').textContent,/\$0\.00/);assert.equal(f.calls.length,1);
});
