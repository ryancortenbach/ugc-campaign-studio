import test from 'node:test';
import assert from 'node:assert/strict';
import {renderGroup,reviewReady,renderLength,renderModel,watchRecords} from './public/render-monitor.js';
import {needsTaskReview} from './public/task-review-queue.js';

test('the task queue retires an older rejected scene when a newer repaired render replaces it',()=>{
 const previous={status:'completed',review:'rejected',plan:{visualQA:{status:'needs_revision'},supersededByRenderId:28}};
 assert.equal(needsTaskReview(previous),false);
 assert.equal(needsTaskReview({status:'completed',review:'pending',local_file:'v3.mp4',plan:{}}),true);
 assert.equal(needsTaskReview({status:'in_progress',review:'pending',plan:{}}),false);
});

test('pending review metadata cannot turn active or failed jobs into reviewable scenes',()=>{
 for(const status of ['queued','in_progress','submitting','checking']){
  const r={status,review:'pending'};
  assert.equal(reviewReady(r),false);assert.equal(renderGroup(r),'work');
 }
 assert.equal(renderGroup({status:'failed',review:'pending'}),'fix');
 assert.equal(reviewReady({status:'completed',review:'pending'}),false);
 assert.equal(reviewReady({status:'completed',review:'pending',local_file:'sample.mp4'}),true);
 assert.equal(renderGroup({status:'completed',review:'pending',local_file:'sample.mp4'}),'you');
 assert.equal(renderModel({endpoint:'higgsfield/genjutsu-light/object-swap/v1.0'}),'Genjutsu Light');
 assert.equal(renderLength({input:{},plan:{sourceSeconds:6}}),6);
});

test('polling detects external SQLite changes, defers while playing, and never loses the deferred update',async()=>{
 let data={renders:[{status:'in_progress'}]},busy=true;const updates=[],jobs=[];
 const watcher=watchRecords({initial:data,read:async()=>data,canUpdate:()=>!busy,onChange:d=>updates.push(d),schedule:fn=>{jobs.push(fn);return fn;},cancel:()=>{}});
 data={renders:[{status:'completed',local_file:'sample.mp4'}]};
 await watcher.tick();assert.equal(updates.length,0);
 busy=false;await watcher.tick();assert.equal(updates.length,1);
 await watcher.tick();assert.equal(updates.length,1);
 watcher.stop();await watcher.tick();assert.equal(updates.length,1);
});

test('leaving the route discards a late response and a failed poll can recover',async()=>{
 let current=true,resolve;const updates=[],statuses=[];
 const watcher=watchRecords({read:()=>new Promise(r=>{resolve=r;}),onChange:d=>updates.push(d),onStatus:s=>statuses.push(s),isCurrent:()=>current,schedule:()=>0,cancel:()=>{}});
 const pending=watcher.tick();current=false;resolve({renders:[]});await pending;
 assert.equal(updates.length,0);assert.equal(statuses.length,0);
 let fail=true;
 const recovery=watchRecords({read:async()=>{if(fail)throw Error('Offline');return {renders:[]};},onChange:d=>updates.push(d),onStatus:s=>statuses.push(s),schedule:()=>0,cancel:()=>{}});
 await recovery.tick();assert.equal(statuses.at(-1).ok,false);
 fail=false;await recovery.tick();assert.equal(statuses.at(-1).ok,true);assert.equal(updates.length,1);
 recovery.stop();
});
