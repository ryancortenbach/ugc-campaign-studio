import test from 'node:test';
import assert from 'node:assert/strict';
import {toolLogRow,safeLogValue} from './public/tool-logs.js';
const e={id:1,type:'tool_call',tool:'exa.search',title:'Search brands',at:'2026-10-24T17:00:00Z',data:{input:{query:'small brands'}}};
test('historical tool requests show recorded status without fabricated timing or cost',()=>{
 const html=toolLogRow(e);assert.doesNotMatch(html,/>Recorded<|>Result<|<svg/);assert.doesNotMatch(html,/>Running<|\$0\.0000|\dms/);assert.match(html,/<details class="ap-log"/);
});
test('only matching call IDs resolve status and measured metadata',()=>{
 const start={...e,data:{callId:'a',status:'running',input:{query:'x'}}};
 const events=[{id:2,type:'tool_result',data:{callId:'b',status:'success',durationMs:99}},{id:3,type:'tool_result',data:{callId:'a',status:'success',durationMs:1250,costUsd:.004}}];
 const html=toolLogRow(start,{events});assert.doesNotMatch(html,/>Done</);assert.match(html,/1.3s/);assert.match(html,/\$0.0040/);assert.doesNotMatch(html,/99ms/);
});
test('untrusted payloads are escaped and credential fields are redacted',()=>{
 const html=toolLogRow({...e,tool:'<script>',data:{input:{authorization:'Bearer private',api_key:'private',session:'private',url:'https://x.test?token=private',text:'<img onerror=x>'}}});
 assert.doesNotMatch(html,/private|<script>|<img onerror/);assert.match(html,/&lt;script&gt;/);assert.match(html,/redacted/);
 assert.equal(safeLogValue({max_tokens:200}).max_tokens,200);
});
test('tool failures retain an expandable error and measured duration',()=>{
 const html=toolLogRow({...e,type:'tool_result',data:{status:'error',durationMs:0,error:'Not found'}});assert.match(html,/aria-label="Failed"/);assert.match(html,/>0ms</);assert.match(html,/Not found/);
});
test('legacy catalog calls keep request and result payloads without a call ID',()=>{
 const call={id:10,type:'tool_call',tool:'shopify.products',task_id:2,lead_id:3,data:{domain:'brand.example'}};
 const result={id:11,type:'tool_result',tool:'shopify.products',task_id:2,lead_id:3,data:{count:2,products:[{title:'Catalog jacket'}]}};
 const html=toolLogRow(call,{events:[call,result]});
 assert.match(html,/Catalog jacket/);assert.match(html,/<summary>Input<\/summary>/);assert.match(html,/<summary>Result<\/summary>/);assert.match(html,/brand.example/);
});
test('legacy result pairing respects lead context and consecutive calls of the same tool',()=>{
 const call={id:10,type:'tool_call',tool:'shopify.products',task_id:2,lead_id:3};
 const other={id:11,type:'tool_result',tool:'shopify.products',task_id:2,lead_id:9,data:{output:'Unrelated brand'}};
 assert.doesNotMatch(toolLogRow(call,{events:[call,other]}),/Unrelated brand/);
 const events=[call,{id:12,type:'tool_result',tool:'shopify.products',task_id:2,lead_id:3,data:{output:'First catalog'}},{...call,id:13},{id:14,type:'tool_result',tool:'shopify.products',task_id:2,lead_id:3,data:{output:'Second catalog'}}];
 assert.match(toolLogRow(call,{events}),/First catalog/);assert.doesNotMatch(toolLogRow(call,{events}),/Second catalog/);
 assert.match(toolLogRow(events[2],{events}),/Second catalog/);assert.doesNotMatch(toolLogRow(events[2],{events}),/First catalog/);
});
test('an intervening catalog error does not steal its fallback result',()=>{
 const call={id:10,type:'tool_call',tool:'shopify.products',task_id:2,lead_id:3};
 const events=[call,{...call,id:11,type:'error',title:'Could not read products'},{...call,id:12,type:'tool_result',data:{source:'none',count:0,products:[]}}];
 const html=toolLogRow(call,{events});assert.match(html,/<summary>Result<\/summary>/);assert.match(html,/&quot;source&quot;: &quot;none&quot;/);
});
test('legacy profile results with known model suffixes stay paired',()=>{
 const call={id:10,type:'tool_call',tool:'claude.profile',task_id:2,lead_id:3};
 for(const model of ['sonnet','claude-sonnet-5-5','claude-opus-4-1']){
  const result={...call,id:11,type:'tool_result',tool:`claude.profile (${model})`,data:{audience:['Streetwear shoppers']}};
  assert.match(toolLogRow(call,{events:[call,result]}),/Streetwear shoppers/,model);
 }
 const unrelated={...call,id:11,type:'tool_result',tool:'claude.profile (different operation)',data:{output:'Unrelated operation'}};
 assert.doesNotMatch(toolLogRow(call,{events:[call,unrelated]}),/Unrelated operation/);
});
