import test from 'node:test';
import assert from 'node:assert/strict';
import {connectionStatus} from './public/connection-status.js';
import {buildGroups,pairTools} from './public/live-feed-model.js';
test('configured keys and unauthenticated health never appear as verified connections',()=>{
 assert.equal(connectionStatus({on:true,ok:true,verification:'configured'})[0],'Configured');
 assert.equal(connectionStatus({on:true,ok:true,verification:'reachable'})[0],'Reachable');
 assert.equal(connectionStatus({on:true,ok:true,verification:'verified'})[0],'Connected');
 assert.equal(connectionStatus({on:true,ok:true})[0],'Not checked');
 assert.equal(connectionStatus({on:true,ok:false,verification:'network_error'})[0],'Network');
});
test('tool traces never cross task or brand ownership when IDs or titles overlap',()=>{
 const base={type:'tool_call',tool:'exa',data:{callId:'same'}};
 const events=[{...base,id:1,task_id:1,lead_id:2},{...base,id:2,task_id:1,lead_id:3},{id:3,type:'decision',title:'Same',task_id:1,lead_id:2},{id:4,type:'decision',title:'Same',task_id:1,lead_id:3}];
 const groups=buildGroups(events,e=>e.type==='decision');assert.equal(groups.length,2);assert.deepEqual(groups.map(g=>g.tools[0].lead_id),[2,3]);
 const pairs=pairTools([events[0],{id:5,type:'tool_result',tool:'exa',task_id:1,lead_id:3,data:{callId:'same'}}]);assert.equal(pairs.length,2);
});
test('actual legacy Exa REST and MCP producer names pair without joining different operations',()=>{
 for(const [call,result] of [['exa.search (REST)','api.exa.ai /search'],['exa.web_search_exa (MCP)','mcp.exa.ai web_search_exa']]){
  const pairs=pairTools([{id:1,type:'tool_call',tool:call,task_id:1,lead_id:2},{id:2,type:'tool_result',tool:result,task_id:1,lead_id:2}]);assert.equal(pairs.length,1);assert.ok(pairs[0].result);
 }
 const pairs=pairTools([{id:1,type:'tool_call',tool:'claude.plan',task_id:1},{id:2,type:'tool_result',tool:'claude.score',task_id:1}]);assert.equal(pairs.length,2);
});
