import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {analyticsView} from './public/analytics.js';
import {summarizeAnalytics} from './analytics.mjs';

async function fixture(t,{usd=.004,coverage='live',unpriced=false}={}){
 const dom=new JSDOM('<main></main>',{url:'https://fixture.example/#/analytics'}),originals=Object.fromEntries(['location','localStorage'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 globalThis.location=dom.window.location;globalThis.localStorage=dom.window.localStorage;
 t.after(()=>{dom.window.close();for(const [key,descriptor] of Object.entries(originals))if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];});
 const at='2026-10-29T09:00:00Z',spend=[{at,provider:'claude',usd}];
 if(unpriced)spend.push({at,provider:'higgsfield',balance:100},{at,provider:'elevenlabs',usage:150});
 const data=summarizeAnalytics({now:new Date('2026-10-29T09:54:37Z'),coverage:{status:coverage},spend}),calls=[];
 const view=dom.window.document.querySelector('main');
 await analyticsView({view,esc:String,api:async path=>{calls.push(path);assert.equal(path,'/api/analytics?range=today');return data;}});
 return {dom,view,data,calls,spend:()=>view.querySelectorAll('.ap-an-money-card strong')[1]};
}

test('positive recorded spend below one cent does not appear as zero dollars',async t=>{
 const f=await fixture(t);assert.equal(f.data.totals.spend,.004);assert.equal(f.spend().textContent,'<$0.01');
});

test('small-spend chart totals and inspected buckets use the same nonzero display',async t=>{
 const f=await fixture(t);f.view.querySelector('[data-ap-metric="spend"]').click();
 assert.equal(f.view.querySelector('[data-ap-chart-label]').textContent,'<$0.01');
 const plot=f.view.querySelector('.ap-an-chart');plot.focus();plot.dispatchEvent(new f.dom.window.KeyboardEvent('keydown',{key:'End',bubbles:true}));
 assert.match(plot.querySelector('[data-ap-chart-label]').textContent,/<\$0\.01$/);assert.equal(f.calls.length,1);
});

for(const [usd,expected] of [[0,'$0.00'],[.01,'$0.01']])test(`recorded spend ${usd} retains its existing money formatting`,async t=>{
 const f=await fixture(t,{usd});assert.equal(f.spend().textContent,expected);
});

test('unavailable revenue stays unavailable beside a known small recorded expense',async t=>{
 const f=await fixture(t,{coverage:'unavailable'});assert.equal(f.view.querySelector('.ap-an-money-card strong').textContent,'Unavailable');
 assert.equal(f.spend().textContent,'<$0.01');assert.match(f.view.querySelector('.ap-an-sync').textContent,/Not synced/);
});

test('usage and balance metadata without a priced ledger amount do not inflate recorded spend',async t=>{
 const f=await fixture(t,{unpriced:true});assert.equal(f.data.totals.spend,.004);assert.deepEqual(f.data.providers,[{id:'claude',usd:.004}]);
 assert.equal(f.spend().textContent,'<$0.01');assert.doesNotMatch(f.view.innerHTML,/NaN|Infinity/);
});
