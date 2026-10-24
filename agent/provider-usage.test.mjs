import test from 'node:test';
import assert from 'node:assert/strict';
import {higgsfieldMonthUsage} from './provider-usage.mjs';
import {createCosts} from './costs.mjs';
const now=new Date('2026-10-24T19:00:00Z'),env={HF_CREDENTIALS:'id:test-secret',ELEVENLABS_KEY_FILE:'/missing/key'};
const response=x=>new Response(JSON.stringify(x),{headers:{'content-type':'application/json'}});
const bucket=(day,cost)=>({bucket:`2026-10-${day}T00:00:00`,results:[{model:'genjutsu',cost,currency:'USD',quantity:'1'}]});
test('Higgsfield reads every usage page without generation calls and keeps its estimate out of ledger totals',async()=>{
 const calls=[],fetch=async(url,options)=>{calls.push({url:new URL(url),options});const page=Number(new URL(url).searchParams.get('page'));return response({page,limit:1,total:2,time_series:[bucket(page===1?'16':'24',page===1?'8.2507':'1.2000')]});};
 const usage=await higgsfieldMonthUsage(fetch,env,now);assert.equal(usage.estimatedUsd,9.4507);assert.equal(usage.todayEstimatedUsd,1.2);assert.equal(usage.requests,2);
 assert.equal(calls.length,2);for(const call of calls){assert.equal(call.url.pathname,'/models/usage');assert.equal(call.options.method,undefined);assert.equal(call.options.headers.Authorization,'Key id:test-secret');assert.equal(call.url.searchParams.get('start'),'2026-10-01T00:00:00.000Z');}
 const store={spendSummary:()=>({providers:[{provider:'higgsfield',total:1.2,today:1.2,count:1}]})};
 const costs=await createCosts({store,fetch,env,now:()=>now.getTime()}).get(),row=costs.providers.find(p=>p.id==='higgsfield');
 assert.equal(row.accountEstimateUsd,9.4507);assert.equal(row.spentUsd,1.2);assert.equal(costs.allTimeUsd,1.2);assert.equal(costs.coverage,'partial');assert.doesNotMatch(JSON.stringify(costs),/test-secret/);
});
test('only a complete empty history establishes zero, malformed or failed usage stays unavailable',async()=>{
 assert.equal((await higgsfieldMonthUsage(async()=>response({page:1,limit:100,total:0,time_series:[]}),env,now)).estimatedUsd,0);
 for(const data of [{page:1,limit:100,total:2,time_series:[]},{page:1,limit:100,time_series:[]},{page:1,limit:100,total:1,time_series:[bucket('24','')]}])await assert.rejects(()=>higgsfieldMonthUsage(async()=>response(data),env,now));
 for(const stamp of ['2026-09-15T00:00:00','2026-10-25T00:00:00','2026-10-32T00:00:00'])await assert.rejects(()=>higgsfieldMonthUsage(async()=>response({page:1,limit:100,total:1,time_series:[{...bucket('24','7'),bucket:stamp}]}),env,now));
 const result=await createCosts({store:{spendSummary:()=>({providers:[]})},env,fetch:async()=>new Response('',{status:403})}).get();
 const row=result.providers.find(p=>p.id==='higgsfield');assert.equal(row.spentUsd,null);assert.equal(row.accountEstimateUsd,undefined);assert.match(row.detail,/403/);
});
