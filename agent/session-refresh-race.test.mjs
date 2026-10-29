import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('./public/app.js',import.meta.url),'utf8');
const loadSource=source.slice(source.indexOf('const sdOf='),source.indexOf('function leadsHTML('));
const threadSource=source.slice(source.indexOf('function threadHTML2('),source.indexOf('// "3 steps"'));
const streamSource=source.slice(source.indexOf('stream.onmessage=msg=>{'));
const group=(...ids)=>({runs:ids.map(id=>({id}))});
const snapshot=(id,label)=>({events:[{id,type:'draft',lead_id:1,data:{gmailUrl:`https://mail.google.com/#drafts/${id}`}}],steers:[{id,at:'2026-10-29T15:38:00Z',message:'Direction',reply:label}],leads:[]});
function fixture(){
 const state={sdata:new Map(),gmail:new Map(),live:[],lastStep:new Map(),openSess:new Set(),logOpen:new Set()},requests=[],stream={};
 const context=vm.createContext({state,stream,esc:String,claudeAv:()=>'',tab:()=> 'tasks',
  document:{querySelector:()=>null,body:{classList:{contains:()=>false}}},noteLead:()=>{},sessionGroups:()=>[],
  railTypes:new Set(),isTraceEv:()=>false,comp:{},eventNotification:()=>null,toast:()=>{},refreshCards:()=>{},
  noteDraft:e=>state.gmail.set(e.lead_id,e.data.gmailUrl),
  api:(path,body)=>{assert.equal(body,undefined);assert.match(path,/^\/api\/tasks\/\d+$/);return new Promise((resolve,reject)=>requests.push({path,resolve,reject}));}});
 vm.runInContext(loadSource+threadSource+streamSource,context);
 return {state,requests,load:context.loadSession,thread:context.threadHTML2,accept:change=>stream.onmessage({data:JSON.stringify(change)})};
}

test('an older session read cannot replace a newer steering reply or Gmail link',async()=>{
 const f=fixture(),g=group(17),old=f.load(g),latest=f.load(g);
 f.requests[1].resolve(snapshot(2,'Current reply'));await latest;
 f.requests[0].resolve(snapshot(1,'Old reply'));await old;
 assert.match(f.thread(g),/Current reply/);assert.doesNotMatch(f.thread(g),/Old reply/);
 assert.equal(f.state.gmail.get(1),'https://mail.google.com/#drafts/2');
 assert.equal(f.state.mission.events[0].id,2);
});

test('a newer failed read keeps the prior snapshot instead of accepting an older pending response',async()=>{
 const f=fixture(),g=group(17);f.state.sdata.set(17,snapshot(3,'Known reply'));
 const old=f.load(g),latest=f.load(g);f.requests[1].reject(Error('Offline'));await latest;
 f.requests[0].resolve(snapshot(1,'Old reply'));await old;
 assert.match(f.thread(g),/Known reply/);assert.equal(f.state.mission.events[0].id,3);
});

test('overlapping session groups fence reads by task rather than group',async()=>{
 const f=fixture(),older=f.load(group(17,18)),newer=f.load(group(18));
 f.requests[2].resolve(snapshot(3,'Newest 18'));await newer;
 f.requests[0].resolve(snapshot(1,'Task 17'));f.requests[1].resolve(snapshot(2,'Older 18'));await older;
 assert.equal(f.state.sdata.get(17).events[0].id,1);assert.equal(f.state.sdata.get(18).events[0].id,3);
});

test('independent task reads both commit even when their responses arrive in reverse order',async()=>{
 const f=fixture(),a=f.load(group(17)),b=f.load(group(18));
 f.requests[1].resolve(snapshot(2,'Task 18'));await b;f.requests[0].resolve(snapshot(1,'Task 17'));await a;
 assert.equal(f.state.sdata.size,2);assert.deepEqual(Array.from(f.state.mission.events,e=>e.id),[1,2]);
});

test('an explicit retry replaces last known data after a failed session read',async()=>{
 const f=fixture(),g=group(17);f.state.sdata.set(17,snapshot(1,'Known reply'));
 const failed=f.load(g);f.requests[0].reject(Error('Offline'));await failed;
 assert.match(f.thread(g),/Known reply/);
 const retry=f.load(g);f.requests[1].resolve(snapshot(2,'Recovered reply'));await retry;
 assert.match(f.thread(g),/Recovered reply/);assert.equal(f.state.gmail.get(1),'https://mail.google.com/#drafts/2');
});

test('a delayed read cannot erase an accepted streamed draft or regress its Gmail link',async()=>{
 const f=fixture(),g=group(17);f.state.sdata.set(17,snapshot(1,'Known reply'));
 const pending=f.load(g),event={...snapshot(2,'').events[0],task_id:17,title:'Draft ready'};
 f.accept({kind:'event',event});f.requests[0].resolve(snapshot(1,'Old reply'));await new Promise(setImmediate);
 assert.deepEqual(Array.from(f.state.sdata.get(17).events,e=>e.id),[1,2]);
 assert.equal(f.state.gmail.get(1),'https://mail.google.com/#drafts/2');
 assert.equal(f.state.mission.events.at(-1).id,2);
 const fresh=snapshot(3,'Fresh reply');fresh.events=[...f.state.sdata.get(17).events];
 f.requests[1].resolve(fresh);await pending;assert.match(f.thread(g),/Fresh reply/);
});

test('a delayed read cannot replace newer streamed lead data',async()=>{
 const f=fixture(),g=group(17),known=snapshot(1,'Known reply');known.leads=[{id:1,task_id:17,status:'found'}];f.state.sdata.set(17,known);
 const pending=f.load(g);f.accept({kind:'lead',lead:{id:1,task_id:17,status:'drafted'}});
 const old=snapshot(1,'Old reply');old.leads=[{id:1,task_id:17,status:'found'}];f.requests[0].resolve(old);await new Promise(setImmediate);
 assert.equal(f.state.sdata.get(17).leads[0].status,'drafted');
 const fresh=snapshot(2,'Fresh reply');fresh.leads=[{id:1,task_id:17,status:'drafted'}];f.requests[1].resolve(fresh);await pending;
 assert.equal(f.state.sdata.get(17).leads[0].status,'drafted');
});

test('a stream update before the first snapshot still protects the newest Gmail link',async()=>{
 const f=fixture(),pending=f.load(group(17));
 f.accept({kind:'event',event:{...snapshot(2,'').events[0],task_id:17,title:'Draft ready'}});
 f.requests[0].resolve(snapshot(1,'Old reply'));await new Promise(setImmediate);
 assert.equal(f.state.gmail.get(1),'https://mail.google.com/#drafts/2');
 f.requests[1].resolve(snapshot(2,'Fresh reply'));await pending;assert.match(f.thread(group(17)),/Fresh reply/);
});

test('a duplicate streamed event does not invalidate a current history read',async()=>{
 const f=fixture(),event={...snapshot(1,'').events[0],task_id:17,title:'Draft ready'};f.state.live.push(event);
 const pending=f.load(group(17));f.accept({kind:'event',event});f.requests[0].resolve(snapshot(2,'Fresh reply'));await pending;
 assert.match(f.thread(group(17)),/Fresh reply/);
});

test('a failed reread retains accepted live data and allows explicit recovery',async()=>{
 const f=fixture(),g=group(17);f.state.sdata.set(17,snapshot(1,'Known reply'));
 const pending=f.load(g);f.accept({kind:'event',event:{...snapshot(2,'').events[0],task_id:17,title:'Draft ready'}});
 f.requests[0].resolve(snapshot(1,'Old reply'));await new Promise(setImmediate);
 f.requests[1].reject(Error('Offline'));await pending;
 assert.equal(f.state.sdata.get(17).events.at(-1).id,2);assert.equal(f.state.gmail.get(1),'https://mail.google.com/#drafts/2');
 const retry=f.load(g);f.requests[2].resolve(snapshot(3,'Recovered'));await retry;assert.match(f.thread(g),/Recovered/);
});

test('a newer load supersedes a reread started after a live update',async()=>{
 const f=fixture(),g=group(17),old=f.load(g);
 f.accept({kind:'event',event:{...snapshot(2,'').events[0],task_id:17,title:'Draft ready'}});
 f.requests[0].resolve(snapshot(1,'Old reply'));await new Promise(setImmediate);
 const latest=f.load(g);f.requests[2].resolve(snapshot(4,'Latest reply'));await latest;
 f.requests[1].resolve(snapshot(3,'Superseded retry'));await old;
 assert.match(f.thread(g),/Latest reply/);assert.equal(f.state.gmail.get(1),'https://mail.google.com/#drafts/4');
});

test('another task live update does not force a reread of an independent task',async()=>{
 const f=fixture(),pending=f.load(group(17));
 f.accept({kind:'lead',lead:{id:1,task_id:18,status:'drafted'}});
 f.requests[0].resolve(snapshot(1,'Current reply'));await pending;
 assert.equal(f.requests.length,1);assert.match(f.thread(group(17)),/Current reply/);
});
