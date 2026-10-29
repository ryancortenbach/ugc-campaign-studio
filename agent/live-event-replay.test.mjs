import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {buildGroups,pairTools} from './public/live-feed-model.js';

const source=readFileSync(new URL('./public/app.js',import.meta.url),'utf8'),streamStart=source.indexOf('stream.onmessage=msg=>{');
const eventBranch=source.slice(source.indexOf(" if(change.kind==='event'){",streamStart),source.indexOf(" if(change.kind==='lead'){",streamStart));
const event=(id,type,over={})=>({id,type,tool:'catalog.read',task_id:2,lead_id:3,title:'Fixture step',at:'2026-10-29T09:24:37Z',data:{callId:'fixture-call'},...over});
function fixture(t){
 const dom=new JSDOM('<main id="livefeed"></main>');t.after(()=>dom.window.close());
 const state={live:[],lastStep:new Map(),sdata:new Map(),openSess:new Set(),logOpen:new Set(),openKids:new Set()},notices=[];let paints=0;
 const context=vm.createContext({document:dom.window.document,state,thread:{thinking:false},comp:{},railTypes:new Set(['tool_call','tool_result','decision']),
  tab:()=> 'home',noteDraft:()=>{},noteLead:()=>{},invalidateSession:()=>{},isTraceEv:e=>['tool_call','tool_result'].includes(e.type),scheduleLive:()=>paints++,
  eventNotification:()=>null,toast:(...a)=>notices.push(a),tidy:String});
 vm.runInContext(`this.deliver=event=>{const change={kind:'event',event};${eventBranch}};`,context);
 return {state,deliver:e=>context.deliver(structuredClone(e)),paints:()=>paints,notices,groups:()=>buildGroups(state.live,e=>e.type==='decision')};
}

test('replaying one result event does not create another trace child or schedule a repaint',t=>{
 const f=fixture(t),call=event(1,'tool_call'),result=event(2,'tool_result',{data:{callId:'fixture-call',status:'success',output:{products:2}}});
 f.deliver(call);f.deliver(result);const paints=f.paints();f.deliver(result);
 assert.equal(f.state.live.length,2);assert.equal(f.paints(),paints);
 const pairs=pairTools(f.groups()[0].tools);assert.equal(pairs.length,1);assert.equal(pairs[0].call.id,1);assert.equal(pairs[0].result.id,2);
});

test('a replayed call does not compete with the original call for its result',t=>{
 const f=fixture(t),call=event(1,'tool_call');f.deliver(call);f.deliver(call);f.deliver(event(2,'tool_result'));
 const pairs=pairTools(f.groups()[0].tools);assert.equal(pairs.length,1);assert.equal(pairs[0].call.id,1);assert.equal(pairs[0].result.id,2);
});

test('a replayed main event does not inflate its grouped repetition count',t=>{
 const f=fixture(t),decision=event(2,'decision');f.deliver(event(1,'tool_call'));f.deliver(decision);f.deliver(decision);
 const groups=f.groups();assert.equal(groups.length,1);assert.equal(groups[0].n,1);assert.equal(groups[0].tools.length,1);
});

test('distinct event IDs preserve legitimate repeated steps and task ownership',t=>{
 const f=fixture(t);f.deliver(event(1,'tool_call'));f.deliver(event(2,'tool_result'));
 f.deliver(event(3,'decision'));f.deliver(event(4,'decision'));f.deliver(event(5,'tool_call',{task_id:9,lead_id:8}));
 const groups=f.groups();assert.equal(f.state.live.length,5);assert.equal(groups.length,2);assert.equal(groups[0].n,2);
 assert.ok(groups[1].tools.every(e=>e.task_id===9&&e.lead_id===8));
});

test('a replay leaves existing expanded child state and the latest step untouched',t=>{
 const f=fixture(t),call=event(1,'tool_call');f.deliver(call);f.state.openKids.add(1);f.deliver(event(2,'tool_result'));
 const latest=f.state.lastStep.get(2),paints=f.paints();f.deliver(call);
 assert.equal(f.state.openKids.has(1),true);assert.equal(f.state.lastStep.get(2),latest);assert.equal(f.paints(),paints);
});

test('events without record IDs are retained rather than accidentally deduplicated',t=>{
 const f=fixture(t);f.deliver(event(undefined,'tool_call'));f.deliver(event(undefined,'tool_call',{title:'Another unkeyed step'}));
 assert.equal(f.state.live.length,2);assert.equal(f.paints(),2);
});
