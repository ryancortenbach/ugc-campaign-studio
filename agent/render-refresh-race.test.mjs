import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {rendersView} from './public/renders-view.js';

const record=status=>({id:42,title:'Queued fixture',status,input:{prompt:'Fixture',resolution:'720p'},plan:{},created_at:'2026-10-27T20:00:00Z'});
const turn=()=>new Promise(resolve=>setImmediate(resolve));
async function fixture(run){
 const dom=new JSDOM('<main></main>',{url:'http://mint.test'}),view=dom.window.document.querySelector('main');
 const original={setTimeout:globalThis.setTimeout,clearTimeout:globalThis.clearTimeout},timers=new Map(),reads=[],calls=[];
 let nextTimer=0,controller,canceled=false;
 try{
  globalThis.setTimeout=fn=>{timers.set(++nextTimer,fn);return nextTimer;};globalThis.clearTimeout=id=>timers.delete(id);
  const api=async(path,body)=>{
   calls.push([path,body]);
   if(path==='/api/state')return {config:{spendingPaused:true}};
   if(path==='/api/leads')return {leads:[]};
   if(path==='/api/renders/42/cancel'){canceled=true;return {};}
   assert.equal(path,'/api/renders');assert.equal(body,undefined);
   if(!reads.length){reads.push(null);return {renders:[record('queued')]};}
   if(canceled)return {renders:[record('canceled')]};
   return new Promise((resolve,reject)=>reads.push({resolve:status=>resolve({renders:[record(status)]}),reject}));
  };
  controller=await rendersView({view,api,poll:true});
  const poll=()=>{const [id,fn]=timers.entries().next().value;timers.delete(id);return fn();};
  await run({dom,view,controller,poll,reads,calls});
 }finally{controller?.stop();globalThis.setTimeout=original.setTimeout;globalThis.clearTimeout=original.clearTimeout;dom.window.close();}
}

test('an older poll cannot undo a completed render cancellation',async()=>fixture(async({view,poll,reads,calls,controller})=>{
 const pending=poll();await turn();assert.equal(reads.length,2);
 view.querySelector('.rv-card').click();view.querySelector('[data-a="cancel"]').click();
 for(let i=0;i<10&&controller.state.list[0].status!=='canceled';i++)await turn();
 assert.equal(controller.state.list[0].status,'canceled');
 reads[1].resolve('queued');await pending;
 assert.equal(controller.state.list[0].status,'canceled','Old poll must not resurrect a canceled render');
 assert.equal(calls.filter(([path])=>path.endsWith('/cancel')).length,1);
 view.querySelector('[data-tab="all"]').click();assert.equal(view.querySelector('[data-a="cancel"]'),null);
}));

test('a pending poll cannot overwrite newer stream progress',async()=>fixture(async({dom,controller,poll,reads})=>{
 const pending=poll();await turn();dom.window.mintRendersView.patch(record('in_progress'));
 reads[1].resolve('queued');await pending;
 assert.equal(controller.state.list[0].status,'in_progress');
}));

test('a stale poll failure does not mark a newer stream update offline',async()=>fixture(async({dom,view,poll,reads})=>{
 const pending=poll();await turn();dom.window.mintRendersView.patch(record('in_progress'));
 reads[1].reject(Error('Old request timed out'));await pending;
 assert.equal(view.querySelector('.rv-offline').hidden,true);
}));

test('a current poll failure remains visible and the next poll can recover',async()=>fixture(async({view,poll,reads,controller})=>{
 let pending=poll();await turn();reads[1].reject(Error('Request failed'));await pending;
 assert.equal(view.querySelector('.rv-offline').hidden,false);
 pending=poll();await turn();reads[2].resolve('in_progress');await pending;
 assert.equal(view.querySelector('.rv-offline').hidden,true);assert.equal(controller.state.list[0].status,'in_progress');
}));

test('a stopped render view ignores an outstanding poll response',async()=>fixture(async({controller,poll,reads})=>{
 const pending=poll();await turn();controller.stop();reads[1].resolve('in_progress');await pending;
 assert.equal(controller.state.list[0].status,'queued');
}));
