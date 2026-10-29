import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {rendersView} from './public/renders-view.js';
const turn=()=>new Promise(setImmediate);
const record=(over={})=>({id:7,title:'New fixture shot',status:'draft',input:{prompt:'Original fixture prompt',duration:5,resolution:'720p'},plan:{},created_at:'2026-10-29T16:58:00Z',...over});
async function fixture(t,{poll=false}={}){
 const dom=new JSDOM('<main></main>'),view=dom.window.document.querySelector('main'),posts=[],reads=[],notices=[],timers=new Map();let readCount=0,mode='fail',active=true,nextTimer=0;
 const original={setTimeout:globalThis.setTimeout,clearTimeout:globalThis.clearTimeout};
 if(poll){globalThis.setTimeout=fn=>{timers.set(++nextTimer,fn);return nextTimer;};globalThis.clearTimeout=id=>timers.delete(id);}
 const api=async(path,body)=>{
  if(path==='/api/state')return {config:{spendingPaused:true}};
  if(path==='/api/leads')return {leads:[]};
  assert.equal(path,'/api/renders');
  if(body!==undefined)return new Promise((resolve,reject)=>posts.push({body,resolve:r=>resolve({render:r||record()}),reject}));
  if(!readCount++)return {renders:[]};
  if(mode==='fail')throw Error('List reload unavailable');
  return new Promise((resolve,reject)=>reads.push({resolve:list=>resolve({renders:list}),reject}));
 };
 const controller=await rendersView({view,api,poll,isCurrent:()=>active,toast:(...a)=>notices.push(a)});
 t.after(()=>{controller.stop();if(poll){globalThis.setTimeout=original.setTimeout;globalThis.clearTimeout=original.clearTimeout;}dom.window.close();});
 const form=view.querySelector('.rv-new');for(const name of ['title','prompt','duration','resolution'])Object.defineProperty(form,name,{get(){return this.elements.namedItem(name);}});
 view.querySelector('[data-a="newshot"]').click();form.title.value='New fixture shot';form.prompt.value='Original fixture prompt';
 const submit=()=>form.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));
 return {dom,view,form,controller,posts,reads,notices,submit,hold:()=>mode='hold',fail:()=>mode='fail',leave:()=>{active=false;view.innerHTML='<h2>Current task</h2>';},poll:()=>{const [id,fn]=timers.entries().next().value;timers.delete(id);return fn();}};
}
test('a confirmed new shot remains visible when its follow-up list read fails',async t=>{
 const f=await fixture(t);f.submit();f.posts[0].resolve();await turn();
 assert.equal(f.controller.state.list[0]?.id,7);assert.equal(f.view.querySelectorAll('.rv-card').length,1);
 assert.equal(f.form.hidden,true);assert.equal(f.form.querySelector('[type="submit"]').disabled,false);assert.equal(f.posts.length,1);
});
test('newer unsent shot fields survive alongside a confirmed shot after a failed reload',async t=>{
 const f=await fixture(t);f.submit();f.form.title.value='Next shot';f.form.prompt.value='Keep this next prompt';f.posts[0].resolve();await turn();
 assert.equal(f.form.hidden,false);assert.equal(f.form.title.value,'Next shot');assert.equal(f.form.prompt.value,'Keep this next prompt');assert.equal(f.controller.state.list[0]?.id,7);
});
test('an older poll cannot erase the confirmed shot after its follow-up read fails',async t=>{
 const f=await fixture(t,{poll:true});f.hold();const old=f.poll();await turn();assert.equal(f.reads.length,1);
 f.fail();f.submit();f.posts[0].resolve();await turn();f.reads[0].resolve([]);await old;
 assert.equal(f.controller.state.list[0]?.id,7);assert.equal(f.view.querySelectorAll('.rv-card').length,1);
});
test('a newer streamed record remains authoritative over the older creation response',async t=>{
 const f=await fixture(t);f.submit();f.dom.window.mintRendersView.patch(record({status:'in_progress'}));f.posts[0].resolve();await turn();
 assert.equal(f.controller.state.list.length,1);assert.equal(f.controller.state.list[0].status,'in_progress');
});
test('a rejected creation invents no record and retains the input for retry',async t=>{
 const f=await fixture(t);f.submit();f.posts[0].reject(Error('Draft save failed'));await turn();
 assert.equal(f.controller.state.list.length,0);assert.equal(f.form.title.value,'New fixture shot');assert.equal(f.form.hidden,false);assert.equal(f.form.querySelector('[type="submit"]').disabled,false);
 assert.equal(f.notices.at(-1)[0],'Draft save failed');
});
test('a confirmed creation cannot repaint a departed route',async t=>{
 const f=await fixture(t);f.submit();f.leave();f.posts[0].resolve();await turn();
 assert.equal(f.view.textContent,'Current task');assert.equal(f.controller.state.list.length,0);
});
test('creating from an empty Done tab reveals the confirmed draft despite a failed reload',async t=>{
 const f=await fixture(t);f.view.querySelector('[data-tab="done"]').click();f.submit();f.posts[0].resolve();await turn();
 assert.equal(f.view.querySelector('[data-tab="you"]').getAttribute('aria-selected'),'true');assert.equal(f.view.querySelectorAll('.rv-card').length,1);
});
test('a later successful poll replaces the fallback with the current record without duplication',async t=>{
 const f=await fixture(t,{poll:true});f.submit();f.posts[0].resolve();await turn();f.hold();const pending=f.poll();await turn();
 f.reads[0].resolve([record({title:'Updated fixture title',status:'checks_failed'})]);await pending;
 assert.equal(f.controller.state.list.length,1);assert.equal(f.controller.state.list[0].title,'Updated fixture title');assert.equal(f.view.querySelectorAll('.rv-card').length,1);assert.equal(f.posts.length,1);
});
