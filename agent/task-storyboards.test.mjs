import test from 'node:test';
import assert from 'node:assert/strict';
import {openStore} from './store.mjs';
import {createTaskStoryboards} from './task-storyboards.mjs';
const setup=t=>{const store=openStore(':memory:'),boards=createTaskStoryboards({store});t.after(()=>{boards.close();store.db.close();});return {store,boards};};
const add=(store,task,name,domain)=>store.createLead({taskId:task.id,company:name,domain,url:`https://${domain}`,market:'streetwear',territory:'NYC',status:'drafted'});

test('each qualified outreach brand spawns its own persistent planning task, without paid calls',t=>{
 const {store,boards}=setup(t),mission=store.createTask('Outreach to apparel brands');
 const first=add(store,mission,'Same display name','one.example'),second=add(store,mission,'Same display name','two.example');
 const work=boards.list();assert.equal(work.length,2);assert.notEqual(work[0].taskId,work[1].taskId);
 assert.deepEqual(new Set(work.map(w=>w.leadId)),new Set([first.id,second.id]));
 for(const w of work){const detail=boards.get(w.taskId);assert.equal(detail.parentTaskId,mission.id);assert.equal(detail.task.plan.kind,'brand_storyboard');assert.equal(detail.task.status,'planning');assert.equal(detail.lab.plans[0].generation.submitted,false);assert.ok(detail.events.length);}
 assert.equal(store.spendSummary().total,0);assert.equal(store.listRenders().length,0);
 assert.equal(boards.sync().length,2);assert.equal(boards.ensure(first.id).task.id,work.find(w=>w.leadId===first.id).taskId);
});
test('rejected brands do not spawn automatically, and qualifying later creates exactly one task',t=>{
 const {store,boards}=setup(t),mission=store.createTask('Outreach');
 const lead=store.createLead({taskId:mission.id,company:'Rejected',domain:'reject.example',url:'https://reject.example',market:'streetwear',territory:'NYC',status:'rejected'});
 assert.equal(boards.sync().length,0);store.updateLead(lead.id,{status:'drafting'});assert.equal(boards.list().length,1);
 store.updateLead(lead.id,{status:'drafted'});assert.equal(boards.list().length,1);
});
test('brand reference and scene edits remain isolated, and stale revisions are rejected',t=>{
 const {store,boards}=setup(t),mission=store.createTask('Outreach');
 const a=boards.ensure(add(store,mission,'A','a.example').id),b=boards.ensure(add(store,mission,'B','b.example').id);
 const draft=structuredClone(a.lab);draft.refs.push({id:12,name:'A tee',url:'/uploads/a.png',role:'apparel'});draft.plans[0].shots[0].dialogue='A brand draft.';
 const saved=boards.save(a.task.id,{revision:0,lab:draft});assert.equal(saved.revision,1);assert.equal(saved.lab.refs.at(-1).name,'A tee');
 assert.equal(boards.get(b.task.id).revision,0);assert.ok(!boards.get(b.task.id).lab.refs.some(r=>r.id===12));
 assert.throws(()=>boards.save(a.task.id,{revision:0,lab:a.lab}),e=>e.status===409);
 assert.equal(boards.version(a.task.id,0).lab.plans[0].shots[0].dialogue,a.lab.plans[0].shots[0].dialogue);
 assert.equal(boards.get(a.task.id).stages.find(s=>s.id==='references').status,'ready');
});
test('all saved revisions remain accessible after more than twelve edits',t=>{
 const {store,boards}=setup(t),mission=store.createTask('Outreach'),w=boards.ensure(add(store,mission,'A','a.example').id);
 for(let revision=0;revision<15;revision++){const lab=structuredClone(w.lab);lab.plans[0].shots[0].dialogue=`Revision ${revision+1}.`;boards.save(w.task.id,{revision,lab});}
 assert.equal(boards.version(w.task.id,1).lab.plans[0].shots[0].dialogue,'Revision 1.');assert.equal(boards.get(w.task.id).revision,15);
 assert.throws(()=>boards.version(w.task.id,1234),e=>e.status===404);
});
test('malformed scenes, untrusted asset URLs and spending flags never commit a broken draft',t=>{
 const {store,boards}=setup(t),mission=store.createTask('Outreach'),w=boards.ensure(add(store,mission,'A','a.example').id);
 const badOptions=structuredClone(w.lab);badOptions.options.audience=1;assert.throws(()=>boards.save(w.task.id,{revision:0,lab:badOptions}),e=>e.status===400);
 const malformed=structuredClone(w.lab);malformed.plans[0].shots=[null];assert.throws(()=>boards.save(w.task.id,{revision:0,lab:malformed}),e=>e.status===400);
 const spending=structuredClone(w.lab);spending.plans[0].generation.submitted=true;assert.throws(()=>boards.save(w.task.id,{revision:0,lab:spending}));
 const unsafe=structuredClone(w.lab);unsafe.refs[0].url='javascript:alert(1)';assert.throws(()=>boards.save(w.task.id,{revision:0,lab:unsafe}));
 assert.equal(boards.get(w.task.id).revision,0);assert.equal(boards.get(w.task.id).versions.length,1);
});
test('activity includes the newest brand event after a long mission log',t=>{
 const {store,boards}=setup(t),mission=store.createTask('Outreach'),lead=add(store,mission,'A','a.example'),w=boards.ensure(lead.id);
 for(let i=0;i<1100;i++)store.addEvent({taskId:mission.id,leadId:lead.id,type:'status',title:`Step ${i}`});
 assert.equal(boards.get(w.task.id).events.at(-1).title,'Step 1099');
});
