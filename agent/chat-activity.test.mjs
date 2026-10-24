import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {activityItems,activityHTML,mountChatActivity,taskArtifacts} from './public/chat-activity.js';
const call=(id,task,callId)=>({id,type:'tool_call',tool:'higgsfield.genjutsu-light',task_id:task,data:{callId,status:'running',input:{prompt:'Hoodie'},estimatedUsd:1.2}});
const result=(id,task,callId,status)=>({id,type:'tool_result',tool:'higgsfield.genjutsu-light',task_id:task,data:{callId,status,output:{requestId:'provider-id'}}});

test('activity pairs calls with their own task, and failures never show completed',()=>{
 const items=activityItems([call(1,10,'a'),call(2,11,'a'),result(3,11,'a','error')]);
 assert.equal(items.length,2);assert.equal(items[0].status,'running');assert.equal(items[1].status,'error');
 const html=activityHTML(items);assert.match(html,/Running/);assert.match(html,/Failed/);assert.doesNotMatch(html,/>Done</);
 assert.match(html,/Estimate: \$1.20/);assert.doesNotMatch(html,/Recorded cost/);
});

test('expandable activity redacts sensitive payloads and escapes content',()=>{
 const item=activityItems([call(1,10,'a')])[0];item.input={authorization:'Bearer private',api_key:'private',prompt:'<img onerror=bad()>'};
 const dom=new JSDOM(activityHTML([item]));
 assert.equal(dom.window.document.querySelector('[onerror],script'),null);
 assert.doesNotMatch(dom.window.document.body.textContent,/private/);
 assert.match(dom.window.document.body.textContent,/redacted/);
 const detail=dom.window.document.querySelector('.ap-chat-tool');assert.equal(detail.open,false);detail.querySelector('summary').click();assert.equal(detail.open,true);dom.window.close();
});

test('legacy action summaries stay recorded and a read-only task load attaches real artifacts',async()=>{
 const dom=new JSDOM('<main></main>'),host=dom.window.document.querySelector('main'),requests=[];
 const task={id:10,status:'ready',plan:{brand:'Disobedient',clientDemo:{packet:{offerPdfUrl:'/brief.pdf',reportUrl:'/research.html',sampleVideo:{url:'/sample.mp4'}}}}};
 await mountChatActivity(host,{actions:[{tool:'prepare_client_demo',input:{taskId:10},result_summary:'Saved task'}],read:async(url,signal)=>{requests.push(url);return {task,events:[call(1,10,'a'),result(2,10,'a','success')]};}});
 assert.deepEqual(requests,['/api/tasks/10']);assert.match(host.textContent,/Recorded/);assert.match(host.textContent,/Done/);
 assert.ok(host.querySelector('a[href="/brief.pdf"]'));assert.ok(host.querySelector('a[href="/sample.mp4"]'));assert.match(host.textContent,/Human review pending/);
 assert.equal(host.querySelectorAll('button').length,0);dom.window.close();
});

test('unsafe artifact links and stale task requests cannot overwrite a newer conversation',async()=>{
 assert.doesNotMatch(taskArtifacts({plan:{clientDemo:{packet:{offerPdfUrl:'javascript:bad()',sampleVideo:{url:'https://x.test?token=secret'}}}}}),/href="javascript:|token=secret/);
 const dom=new JSDOM('<main></main>'),host=dom.window.document.querySelector('main');let resolve;
 const old=mountChatActivity(host,{actions:[{tool:'prepare_client_demo',input:{taskId:10}}],read:()=>new Promise(r=>{resolve=r;})});
 await mountChatActivity(host,{actions:[{tool:'get_overview',status:'success',result_summary:'Current'}]});
 resolve({task:{id:10,plan:{brand:'Old'}},events:[]});await old;
 assert.match(host.textContent,/Current/);assert.doesNotMatch(host.textContent,/Old/);dom.window.close();
});
