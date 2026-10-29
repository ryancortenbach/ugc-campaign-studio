import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {rendersView} from './public/renders-view.js';
const turn=()=>new Promise(resolve=>setImmediate(resolve));
const record=status=>({id:42,title:'Cancel confirmation fixture',status,request_id:'mock-request',input:{prompt:'Fixture'},plan:{},created_at:'2026-10-29T12:00:00Z'});
async function fixture(t){
 const dom=new JSDOM('<main></main>'),view=dom.window.document.querySelector('main'),requests=[],notices=[],calls=[];let active=true,failRead=false;
 const api=async(path,body)=>{calls.push(path);if(path==='/api/state')return {config:{spendingPaused:true}};if(path==='/api/leads')return {leads:[]};if(path==='/api/renders'){assert.equal(body,undefined);if(failRead)throw Error('Mock list read failure');return {renders:[record('queued')]};}assert.equal(path,'/api/renders/42/cancel');assert.deepEqual(body,{});return new Promise((resolve,reject)=>requests.push({resolve:()=>resolve({render:record('canceled')}),reject}));};
 const controller=await rendersView({view,api,toast:(...a)=>notices.push(a),poll:false,isCurrent:()=>active});view.querySelector('.rv-card').click();
 t.after(()=>{controller.stop();dom.window.close();});
 return {dom,view,controller,requests,notices,calls,cancel:()=>view.querySelector('[data-a="cancel"]'),failRead:()=>failRead=true,leave:()=>{active=false;view.innerHTML='<h2>New route fixture</h2>';}};
}
test('confirmed cancellation survives a failed list refresh without offering another Cancel',async t=>{
 const f=await fixture(t);f.cancel().click();f.failRead();f.requests[0].resolve();await turn();assert.equal(f.controller.state.list[0].status,'canceled');assert.equal(f.cancel(),null);assert.match(f.view.querySelector('.rvp-head').textContent,/Canceled/);assert.equal(f.notices.filter(x=>x[0]==='Render canceled').length,1);f.view.querySelector('[data-tab="work"]').click();assert.equal(f.view.querySelector('#render-empty').hidden,false);
});
test('a newer streamed status is not overwritten by the older cancellation response',async t=>{
 const f=await fixture(t);f.cancel().click();f.dom.window.mintRendersView.patch(record('in_progress'));f.failRead();f.requests[0].resolve();await turn();assert.equal(f.controller.state.list[0].status,'in_progress');assert.match(f.view.querySelector('.rvp-head').textContent,/Rendering/);
});
test('an unconfirmed cancellation failure never fabricates a canceled state',async t=>{
 const f=await fixture(t);f.cancel().click();f.failRead();f.requests[0].reject(Error('Mock cancellation failed'));await turn();assert.equal(f.controller.state.list[0].status,'queued');assert.equal(f.cancel().disabled,false);assert.equal(f.notices.at(-1)[0],'Mock cancellation failed');
});
test('a confirmed cancellation cannot repaint after route departure',async t=>{
 const f=await fixture(t);f.cancel().click();f.leave();f.failRead();f.requests[0].resolve();await turn();assert.equal(f.view.textContent,'New route fixture');assert.equal(f.controller.state.list[0].status,'queued');
});
