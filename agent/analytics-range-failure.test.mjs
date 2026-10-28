import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {analyticsView} from './public/analytics.js';
import {summarizeAnalytics} from './analytics.mjs';

const turn=()=>new Promise(resolve=>setImmediate(resolve));
test('an analytics range commits only after its data loads, with failure and retry preserving the displayed period',async()=>{
 const dom=new JSDOM('<main></main>',{url:'http://mint.test/#/analytics'}),view=dom.window.document.querySelector('main');
 const originals=Object.fromEntries(['location','localStorage'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 const requests=[],notices=[];let first=true;
 const data=range=>summarizeAnalytics({range,now:new Date('2026-10-27T20:00:00Z'),coverage:{status:'live'}});
 try{
  globalThis.location=dom.window.location;globalThis.localStorage=dom.window.localStorage;
  localStorage.setItem('mintlabs.analytics.range','today');
  const api=url=>{if(first){first=false;return Promise.resolve(data('today'));}return new Promise((resolve,reject)=>requests.push({url,resolve,reject}));};
  await analyticsView({view,api,esc:String,toast:(...args)=>notices.push(args)});
  const selected=()=>view.querySelector('[data-ap-range][aria-pressed="true"]').dataset.apRange;
  view.querySelector('[data-ap-range="week"]').click();
  assert.equal(requests[0].url,'/api/analytics?range=week');
  assert.equal(selected(),'today','Pending requests must not relabel the currently displayed data');
  assert.equal(localStorage.getItem('mintlabs.analytics.range'),'today');
  assert.ok([...view.querySelectorAll('[data-ap-range]')].every(button=>button.disabled));
  view.querySelector('[data-ap-range="month"]').click();assert.equal(requests.length,1);
  requests[0].reject(Error('Temporary failure'));await turn();
  assert.equal(selected(),'today');assert.equal(localStorage.getItem('mintlabs.analytics.range'),'today');
  assert.equal(notices.at(-1)[0],'Analytics could not refresh');
  assert.equal(view.querySelector('[data-ap-refresh]').disabled,false);
  view.querySelector('[data-ap-refresh]').click();assert.equal(requests[1].url,'/api/analytics?range=today&refresh=1');requests[1].resolve(data('today'));await turn();
  view.querySelector('[data-ap-range="week"]').click();requests[2].resolve(data('week'));await turn();
  assert.equal(selected(),'week');assert.equal(localStorage.getItem('mintlabs.analytics.range'),'week');
  assert.match(view.querySelector('.ap-an-money').textContent,/\$0\.00/);
  const plot=view.querySelector('.ap-an-chart');plot.focus();
  plot.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Home',bubbles:true}));
  assert.ok(plot.querySelector('[data-ap-chart-label]').textContent.includes('$0.00'));
 }finally{dom.window.close();for(const [key,value] of Object.entries(originals))if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}
});
