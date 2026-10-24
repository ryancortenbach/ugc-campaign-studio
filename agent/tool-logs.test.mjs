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
