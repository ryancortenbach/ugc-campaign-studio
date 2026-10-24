import test from 'node:test';
import assert from 'node:assert/strict';
import {openStore} from './store.mjs';
import {createAutopilot} from './autopilot.mjs';

function setup(over={}){
 const store=openStore(':memory:');
 const live=new Set(),starts=[];
 const runner={start(prompt,opts){starts.push({prompt,opts});const t=store.createTask(prompt,opts);store.updateTask(t.id,{status:'running'});live.add(t.id);return t;},isRunning:id=>live.has(id)};
 const clock={t:Date.now()};
 const ap=createAutopilot({store,runner,now:()=>new Date(clock.t),...over});
 const finish=(id,status='done')=>{live.delete(id);store.updateTask(id,{status});};
 return {store,runner,ap,starts,live,clock,finish};
}
const titles=store=>store.listEvents().filter(e=>e.tool==='autopilot').map(e=>e.title);

test('off by default: tick does nothing, settings table exists', () => {
 const {ap,starts,store}=setup();
 store.createTask('Find streetwear brands');
 assert.equal(ap.tick(),'off');
 assert.equal(starts.length,0);
 const g=ap.get();
 assert.equal(g.enabled,false);assert.equal(g.dailyBudgetUsd,3);assert.equal(g.pauseMinutes,15);assert.equal(g.goalDefault,'Find streetwear brands');
});

test('enabled: starts next batch with goal and CRM suffix, logs one event', () => {
 const {ap,starts,store}=setup();
 ap.set({goal:'Find skincare brands in Brooklyn',model:'sonnet',enabled:true});
 assert.equal(starts.length,1);
 assert.equal(starts[0].prompt,'Find skincare brands in Brooklyn Find brands that are not already in the CRM.');
 assert.equal(starts[0].opts.model,'sonnet');
 const ev=store.listEvents().filter(e=>e.tool==='autopilot');
 assert.equal(ev.length,1);assert.equal(ev[0].type,'status');assert.equal(ev[0].title,'Autopilot started the next batch');assert.ok(ev[0].task_id);
});

test('goal defaults to the newest mission prompt, without a doubled suffix', () => {
 const {ap,starts,store,finish,clock}=setup();
 const t=store.createTask('Find denim brands Find brands that are not already in the CRM.');finish(t.id);
 ap.set({enabled:true,pauseMinutes:5});
 assert.equal(starts.length,0,'pause window after the last mission');
 clock.t+=6*60000;
 assert.equal(ap.tick(),'started');
 assert.equal(starts[0].prompt,'Find denim brands Find brands that are not already in the CRM.');
});

test('does not start while a mission is running', () => {
 const {ap,starts,store,live}=setup();
 const t=store.createTask('Manual mission');store.updateTask(t.id,{status:'running'});live.add(t.id);
 ap.set({enabled:true});
 assert.equal(ap.tick(),'running');assert.equal(starts.length,0);
});

test('a stale running row with no live runner does not block', () => {
 const {ap,starts,store}=setup();
 const t=store.createTask('Old crashed mission');store.updateTask(t.id,{status:'running'});
 ap.set({enabled:true});
 assert.equal(starts.length,1);
});

test('pause window: waits pauseMinutes after the last mission finished, then starts', () => {
 const {ap,starts,store,clock,finish}=setup();
 ap.set({enabled:true,goal:'Find brands',pauseMinutes:15});
 assert.equal(starts.length,1);
 finish(starts.length&&store.listTasks()[0].id);
 clock.t+=14*60000;assert.equal(ap.tick(),'pause');assert.equal(starts.length,1);
 clock.t+=2*60000;assert.equal(ap.tick(),'started');assert.equal(starts.length,2);
});

test('budget excludes higgsfield spend', () => {
 const {ap,starts,store}=setup();
 store.addSpend({provider:'higgsfield',usd:40});
 store.addSpend({provider:'claude',usd:1});
 ap.set({enabled:true,goal:'Find brands',dailyBudgetUsd:3});
 assert.equal(ap.get().spentToday,1);assert.equal(ap.get().budgetReached,false);
 assert.equal(starts.length,1);
});

test('budget reached blocks the batch and logs once per day', () => {
 const {ap,starts,store,clock}=setup();
 store.addSpend({provider:'exa',usd:2});store.addSpend({provider:'claude',usd:1.5});
 ap.set({enabled:true,goal:'Find brands',dailyBudgetUsd:3});
 assert.equal(ap.tick(),'budget');assert.equal(ap.tick(),'budget');assert.equal(ap.tick(),'budget');
 assert.equal(starts.length,0);
 assert.deepEqual(titles(store),['Autopilot paused: daily budget reached']);
 assert.equal(ap.get().budgetReached,true);
 // next local day: yesterday's spend no longer counts, so the batch starts
 clock.t+=24*3600000;
 assert.equal(ap.tick(),'started');assert.equal(starts.length,1);
});

test('budget day is local midnight: older spend does not count', () => {
 const {ap,store,clock}=setup();
 const mid=new Date(clock.t);mid.setHours(0,0,0,0);
 store.db.prepare('insert into spend(at,provider,usd) values(?,?,?)').run(new Date(mid.getTime()-1000).toISOString(),'claude',99);
 assert.equal(ap.get().spentToday,0);
});

test('never touches renders: only runner.start is called, no render rows approved', () => {
 const {ap,store}=setup();
 const r=store.createRender({title:'x',endpoint:'e',input:{}});
 ap.set({enabled:true,goal:'Find brands'});
 assert.equal(store.getRender(r.id).status,'draft');assert.equal(store.getRender(r.id).approved_at,null);
});

test('settings persist and bad values are rejected; start/stop timer is idempotent', () => {
 const {ap,store}=setup();
 ap.set({dailyBudgetUsd:7.5,pauseMinutes:30,model:'haiku'});
 const again=createAutopilot({store,runner:{start(){},isRunning:()=>false}});
 assert.equal(again.get().dailyBudgetUsd,7.5);assert.equal(again.get().pauseMinutes,30);assert.equal(again.get().model,'haiku');
 assert.throws(()=>ap.set({dailyBudgetUsd:'abc'}));
 ap.start();ap.start();ap.stop();ap.stop();
});
