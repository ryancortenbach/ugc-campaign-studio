import test from 'node:test';
import assert from 'node:assert/strict';
import {reviseUntilPassed,assertRevisionWorkAllowed} from './revision-harness.mjs';
import {openStore} from './store.mjs';

test('quality feedback can require twelve revisions without an attempt-limit exit',async()=>{
 let revisions=0;const out=await reviseUntilPassed({candidate:0,check:async n=>({passed:n===12}),revise:async n=>{revisions++;return n+1;}});
 assert.equal(out.revision,12);assert.equal(revisions,12);assert.equal(out.candidate,12);
});
test('explicit pause interrupts the next revision while preserving its last checked candidate',async()=>{
 const store=openStore(':memory:');let edits=0,last=null;
 try{await assert.rejects(()=>reviseUntilPassed({candidate:'saved',checkpoint:async()=>assertRevisionWorkAllowed(store),check:async()=>({passed:false}),onChecked:async candidate=>{last=candidate;store.db.prepare("create table if not exists settings(key text primary key,value text)").run();store.db.prepare("insert into settings values('spendingPaused','true')").run();},revise:async()=>{edits++;}}),e=>e.code==='spending_paused');assert.equal(edits,0);assert.equal(last,'saved');}
 finally{store.db.close();}
});
