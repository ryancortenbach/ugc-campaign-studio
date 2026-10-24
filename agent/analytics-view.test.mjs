import test from 'node:test';
import assert from 'node:assert/strict';
import {analyticsView} from './public/analytics.js';
import {summarizeAnalytics} from './analytics.mjs';

test('an earlier Analytics mount cannot overwrite a later period after navigation',async()=>{
 const previous=Object.fromEntries(['location','localStorage'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 let savedRange='today';
 globalThis.location={hash:'#/analytics'};
 globalThis.localStorage={getItem:()=>savedRange,setItem(){}};
 const view={isConnected:true,innerHTML:'',querySelectorAll:()=>[],querySelector:selector=>selector==='[data-ap-refresh]'?{}:null};
 const requests=[];
 const api=url=>new Promise(resolve=>requests.push({url,resolve}));
 const now=new Date('2026-10-24T18:00:00Z');
 try{
  const first=analyticsView({view,api,esc:String});
  globalThis.location.hash='#/home';
  globalThis.location.hash='#/analytics';
  savedRange='month';
  const second=analyticsView({view,api,esc:String});
  assert.equal(requests[0].url,'/api/analytics?range=today');
  assert.equal(requests[1].url,'/api/analytics?range=month');
  requests[1].resolve(summarizeAnalytics({range:'month',now,coverage:{status:'live'}}));
  await second;
  const latest=view.innerHTML;
  assert.doesNotMatch(latest,/ap-an-lists|Spend by provider|Data details|<h2>Sales/);
  assert.match(latest,/data-ap-range="month"[^>]*class="on"/);
  requests[0].resolve(summarizeAnalytics({range:'today',now,coverage:{status:'live'}}));
  await first;
  assert.equal(view.innerHTML,latest,'The older Today response must not replace the newer Month view.');
 }finally{
  for(const [key,descriptor] of Object.entries(previous))if(descriptor===undefined)delete globalThis[key];else Object.defineProperty(globalThis,key,descriptor);
 }
});
