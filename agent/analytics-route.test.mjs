import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {openStore} from './store.mjs';
import {createApp} from './server.mjs';

test('Analytics GET routes period and refresh to the read-only service, never starts work',async()=>{
 const calls=[],store=openStore(':memory:');
 const server=http.createServer(createApp({store,analytics:{get:async input=>{calls.push(input);return {totals:{revenue:1000},coverage:{status:'cached'}};}}}));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const base=`http://127.0.0.1:${server.address().port}`;
  const response=await fetch(base+'/api/analytics?range=month&refresh=1');assert.equal(response.status,200);assert.equal((await response.json()).totals.revenue,1000);
  assert.deepEqual(calls,[{range:'month',refresh:true}]);
  assert.equal(store.listTasks().length,0);assert.equal(store.listEvents().length,0);
  const denied=await fetch(base+'/api/analytics',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(denied.status,404);assert.equal(calls.length,1);
 }finally{await new Promise(resolve=>server.close(resolve));store.db.close();}
});
