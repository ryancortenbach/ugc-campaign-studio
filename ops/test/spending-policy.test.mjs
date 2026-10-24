import test from 'node:test';
import assert from 'node:assert/strict';
import {protectPaidTools} from '../lib/spending-policy.mjs';
import {tick,approveSpend,submitShot,saveSettings} from '../lib/pipeline.mjs';
import {memoryDb} from '../lib/db.mjs';
import {fakeTools,harness} from './helpers.mjs';

test('the default server policy blocks every billed tool before invoking the provider',async()=>{
 const raw=fakeTools(),tools=protectPaidTools(raw);
 for(const method of ['angles','draftStoryboard','checkStoryboard','reviseStoryboard','runCheckers','submit'])await assert.rejects(()=>tools[method](),e=>e.status===423&&e.code==='spending_paused');
 assert.ok(Object.values(raw.calls).every(n=>n===0));assert.equal(tools.ready().spendingPaused,true);
});
test('a paused tick leaves queued production and ledger unchanged without provider calls',async()=>{
 const db=memoryDb(),raw=fakeTools(),tools=protectPaidTools(raw);
 await db.insert('orders',{id:1,status:'in_production',brief:{brand:'Fictional'}});await db.insert('videos',{id:1,order_id:1,status:'queued'});
 await db.find('settings');const before=JSON.stringify(db.tables);const result=await tick({db,tools,baseUrl:'https://fictional.test'});
 assert.equal(result.spendingPaused,true);assert.equal(JSON.stringify(db.tables),before);assert.ok(Object.values(raw.calls).every(n=>n===0));
});
test('manual and direct submissions fail before claiming a shot while paused',async()=>{
 const db=memoryDb(),raw=fakeTools(),tools=protectPaidTools(raw);const shot=await db.insert('shots',{video_id:1,status:'attention',resume_status:'priced',estimate_usd:7});
 await assert.rejects(()=>approveSpend(db,tools,shot.id),e=>e.status===423);
 await assert.rejects(()=>submitShot(db,tools,shot,{order:{id:1},video:{id:1}}),e=>e.status===423);
 assert.equal((await db.get('shots',shot.id)).status,'attention');assert.equal(raw.calls.submit,0);
 await assert.rejects(()=>saveSettings(db,{OPS_PAID_WORK_ENABLED:true}),/Unknown setting/);
});
test('public heartbeat and operator tick cannot bypass the paused server policy',async()=>{
 const raw=fakeTools(),h=harness({tools:protectPaidTools(raw)});
 const publicResult=await h.call('POST','/api/tick');assert.equal(publicResult.status,202);
 const operator=await h.op('POST','/api/ops/tick');assert.equal(operator.body.report.spendingPaused,true);
 assert.ok(Object.values(raw.calls).every(n=>n===0));
});
test('only an explicit enabled server policy delegates to the supplied fake provider',async()=>{
 const raw=fakeTools(),tools=protectPaidTools(raw,{enabled:true});await tools.angles({},1);assert.equal(raw.calls.angles,1);assert.equal(tools.ready().spendingPaused,false);
});
