import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {clientTaskReviewView} from './public/client-task-review.js';
const turn=()=>new Promise(setImmediate);
const call=id=>({id,type:'tool_call',tool:'client.review',title:'Review research',at:'2026-10-29T15:58:00Z',data:{callId:`fixture-${id}`,input:{section:'research'}}});
const packet=()=>({task:{id:10},brand:{name:'Fixture',assets:[],icp:{summary:'Audience hypothesis'}},versions:{research:'r1',images:'i1',video:null},reviews:[],events:[call(11),call(12)]});
async function fixture(t){
 const dom=new JSDOM('<main></main>');t.after(()=>dom.window.close());const view=dom.window.document.querySelector('main'),data=packet(),requests=[];let initial=true;
 await clientTaskReviewView({view,taskId:10,api:async(path,body)=>{
  assert.equal(path,'/api/tasks/10/client-review');
  if(body){assert.equal(body.decision,'changes_requested');throw Error('Feedback failed');}
  if(initial){initial=false;return data;}return new Promise((resolve,reject)=>requests.push({resolve,reject}));
 }});
 const payload=(id,label='Input')=>[...view.querySelector(`[data-ap-log="${id}"]`).querySelectorAll('.ap-log-payload')].find(n=>n.querySelector('summary').textContent===label);
 const open=()=>{view.querySelector('.ct-history').open=true;view.querySelector('[data-ap-log="11"]').open=true;payload(11).open=true;};
 const edit=()=>{view.querySelector('[data-ct-edit="images"]').click();const input=view.querySelector('textarea');input.value='Adjust the sleeve';input.dispatchEvent(new dom.window.Event('input'));};
 const fail=async()=>{edit();await view.querySelector('form').onsubmit({preventDefault(){}});};
 return {view,data,requests,payload,open,edit,fail};
}
test('opening image feedback preserves the inspected input payload',async t=>{
 const f=await fixture(t);f.open();f.edit();
 assert.equal(f.view.querySelector('.ct-history').open,true);assert.equal(f.view.querySelector('[data-ap-log="11"]').open,true);assert.equal(f.payload(11).open,true);
});
test('failed feedback and failed refresh retain the expanded payload',async t=>{
 const f=await fixture(t);f.open();await f.fail();assert.equal(f.payload(11).open,true);
 f.view.querySelector('[data-ct-refresh]').click();f.requests[0].reject(Error('Refresh failed'));await turn();
 assert.equal(f.payload(11).open,true);assert.equal(f.view.querySelector('textarea').value,'Adjust the sleeve');
});
test('payload state belongs to its event ID when refreshed rows reorder',async t=>{
 const f=await fixture(t);f.open();await f.fail();const fresh=packet();fresh.events.reverse();
 f.view.querySelector('[data-ct-refresh]').click();f.requests[0].resolve(fresh);await turn();
 assert.equal(f.payload(11).open,true);assert.equal(f.payload(12).open,false);
});
test('a deliberately closed payload stays closed on the next repaint',async t=>{
 const f=await fixture(t);f.open();f.edit();f.payload(11).open=false;
 await f.view.querySelector('form').onsubmit({preventDefault(){}});
 assert.equal(f.payload(11).open,false);assert.equal(f.view.querySelector('[data-ap-log="11"]').open,true);
});
test('new result payloads do not inherit the input payload expansion',async t=>{
 const f=await fixture(t);f.open();await f.fail();const fresh=packet();fresh.events.push({id:13,type:'tool_result',tool:'client.review',title:'Saved',at:'2026-10-29T15:58:01Z',data:{callId:'fixture-11',output:{decision:'changes_requested'}}});
 f.view.querySelector('[data-ct-refresh]').click();f.requests[0].resolve(fresh);await turn();
 assert.equal(f.payload(11).open,true);assert.equal(f.payload(11,'Result').open,false);
});
