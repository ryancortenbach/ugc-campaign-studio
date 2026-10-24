import test from 'node:test';
import assert from 'node:assert/strict';
import {openStore} from './store.mjs';
import {createClientDemo,clientDemoPromptBrands} from './client-demo.mjs';
import {spendingPaused,spendingRequestAllowed} from './spending-policy.mjs';
import {createAutopilot} from './autopilot.mjs';

function packet(){
 const brand=(id,name,website)=>({id,name,website,product:{summary:`${name} product research`},icp:{summary:'Audience hypothesis',evidence:[],hypotheses:['Validate audience']},script:{hook:`An original ${name} concept`},persona:{description:'An original fictional adult avatar',rationale:'Based on audience hypothesis',imageUrl:`/client-demo/${id}.png`},sources:[{title:'Official site',url:website}],gaps:['Revenue is not verified'],score:{total:65,max:100},reportUrl:`/client-demo/${id}.html`});
 return {version:1,mode:'demo',preparedAt:'2026-10-24',brands:[brand('awardscholar','Award Scholar','https://awardscholar.com'),brand('waddle','Waddle','https://waddlecouples.com')]};
}
function setup(t){
 const store=openStore(':memory:');
 t.after(()=>store.db.close());
 const data=packet();
 const demo=createClientDemo({store,readPacket:()=>data});
 return {store,demo,data};
}

test('known-brand prompts opt into saved demos only when demo or preview is explicit',()=>{
 for(const [input,ids] of [
  ['Make a demo for Award Scholar and Waddle',['awardscholar','waddle']],
  ['Preview awardscholar.com',['awardscholar']],
  ['Create a WADDLE preview',['waddle']],
  ['Create a streetwear demo',['disobedient','vylin']],
  ['Preview Disobedient and VYLIN',['disobedient','vylin']],
  ['demo for waddlecouples.com',['waddle']],
  ['Find people at Waddle',[]],['Send a scholarship email',[]],['Demo an unknown app',[]],['Demo waddleton',[]],['',[]],[null,[]]
 ])assert.deepEqual(clientDemoPromptBrands(input),ids,String(input));
});

test('two client tasks persist once and subsequent prompt or direct calls reuse them',t=>{
 const {store,demo,data}=setup(t);
 const created=demo.fromPrompt('Create a demo for Award Scholar and Waddle');
 assert.equal(created.demo,true);assert.equal(created.tasks.length,2);assert.equal(created.reused,false);
 assert.equal(store.listTasks().length,2);
 assert.deepEqual(new Set(created.tasks.map(task=>task.plan.clientDemo.brandId)),new Set(['awardscholar','waddle']));
 for(const task of created.tasks){
  assert.equal(task.plan.kind,'client_demo');assert.equal(task.status,'ready');
  assert.equal(task.plan.clientDemo.productionAuthorized,false);assert.equal(task.plan.clientDemo.sendingAuthorized,false);
  assert.equal(store.getTask(task.id).plan.clientDemo.stage,'human_review');
  const events=store.listEvents({taskId:task.id});
  assert.deepEqual(events.map(event=>event.tool),['client_demo.prepare','client_demo.prepare']);
  assert.equal(events[1].data.costUsd,0);assert.equal(events[1].data.output.sourceMode,'saved_sourced_research');
 }
 const before=store.listEvents().length;
 const reused=demo.fromPrompt('Preview both Award Scholar and Waddle');
 assert.equal(reused.reused,true);
 assert.deepEqual(reused.tasks.map(task=>task.id),created.tasks.map(task=>task.id));
 assert.equal(demo.prepare('waddle').task.id,created.tasks[1].id);
 assert.equal(store.listEvents().length,before);assert.equal(store.listTasks().length,2);
 assert.deepEqual(demo.get().brands.map(brand=>brand.taskId),created.tasks.map(task=>task.id));
 assert.equal(data.brands[0].taskId,undefined,'GET annotation must not mutate the saved packet');
});

test('unknown inputs do not create tasks, events or assistant rows',t=>{
 const {store,demo}=setup(t);
 for(const brandId of ['unknown','',null,undefined])assert.throws(()=>demo.prepare(brandId),error=>error.status===400);
 assert.equal(demo.fromPrompt('Find fitness brands'),null);
 assert.equal(demo.conversation('Preview a different app'),null);
 assert.equal(store.listTasks().length,0);assert.equal(store.listEvents().length,0);
 assert.equal(store.db.prepare("select name from sqlite_master where type='table' and name='assistant_messages'").get(),undefined);
});

test('demo conversation stores the actual prompt, assistant reply and task actions',t=>{
 const {store,demo}=setup(t);
 const emitted=[];store.bus.on('change',event=>emitted.push(event));
 const prompt='Create a research demo for Award Scholar and Waddle';
 const result=demo.conversation(prompt);
 assert.equal(result.cost,0);assert.equal(result.tasks.length,2);
 assert.match(result.reply,/No paid generation or outreach was started/);
 const rows=store.db.prepare('select * from assistant_messages order by id').all();
 assert.deepEqual(rows.map(row=>row.role),['user','assistant']);
 assert.equal(JSON.parse(rows[0].content).text,prompt);
 const assistant=JSON.parse(rows[1].content);
 assert.equal(assistant.text,result.reply);
 assert.deepEqual(assistant.actions.map(action=>action.input.brandId),['awardscholar','waddle']);
 for(const action of assistant.actions)assert.equal(action.tool,'prepare_client_demo');
 assert.ok(emitted.some(event=>event.kind==='assistant'));
 const again=demo.conversation(prompt);assert.equal(again.reused,true);assert.equal(store.listTasks().length,2);
});

test('saved client demos leave persisted spending pause and provider ledger untouched',async t=>{
 const {store,demo}=setup(t);
 store.db.exec('create table if not exists settings(key text primary key,value text)');
 store.db.prepare("insert into settings(key,value) values('spendingPaused','true')").run();
 const originalFetch=globalThis.fetch;let networkCalls=0;
 globalThis.fetch=async()=>{networkCalls++;throw Error('No network calls are allowed in the saved demo');};
 try{
  assert.equal(spendingPaused(store),true);
  assert.equal(spendingRequestAllowed('POST','/api/assistant',{message:'Create a demo for Award Scholar and Waddle'}),true);
  const result=demo.conversation('Create a demo for Award Scholar and Waddle');
  assert.equal(result.tasks.length,2);assert.equal(result.cost,0);
  assert.equal(spendingPaused(store),true);assert.equal(store.spendSummary().total,0);assert.equal(networkCalls,0);
  assert.equal(store.listLeads().length,0);assert.equal(store.listDrafts().length,0);
 }finally{globalThis.fetch=originalFetch;}
});

test('the pause exception remains narrow and unrelated generation or sending stays blocked',()=>{
 for(const path of ['/api/chat','/api/assistant']){
  assert.equal(spendingRequestAllowed('POST',path,{message:'Preview Waddle'}),true,path);
  for(const message of ['Find Waddle contacts','Create a sample for Award Scholar','Preview an unknown company',''])assert.equal(spendingRequestAllowed('POST',path,{message}),false,`${path}: ${message}`);
 }
 assert.equal(spendingRequestAllowed('POST','/api/client-demo/tasks',{brandId:'waddle'}),true);
 for(const path of ['/api/voices/design','/api/storyboards','/api/renders/1/approve','/api/drafts/1/send-dm','/api/unknown'])assert.equal(spendingRequestAllowed('POST',path,{message:'Preview Waddle'}),false,path);
 assert.equal(spendingRequestAllowed('POST','/api/autopilot',{enabled:true}),false);
 assert.equal(spendingRequestAllowed('POST','/api/tasks/1/control',{action:'resume'}),false);
});

test('autopilot does not adopt demo tasks as goals or completion cooldowns',t=>{
 const {store,demo}=setup(t),starts=[];
 const now=new Date('2026-10-24T19:00:00Z');
 const runner={start(prompt){starts.push(prompt);return {id:999};},isRunning:()=>false};
 const autopilot=createAutopilot({store,runner,now:()=>now});
 demo.fromPrompt('Create a demo for Award Scholar and Waddle');
 assert.equal(autopilot.get().goalDefault,'');
 autopilot.set({enabled:true});assert.equal(autopilot.tick(),'no goal');assert.equal(starts.length,0);
 autopilot.set({enabled:false});
 const mission=store.createTask('Find skincare brands');store.updateTask(mission.id,{status:'done'});
 store.db.prepare('update tasks set updated_at=? where id=?').run('2026-10-24T18:00:00Z',mission.id);
 for(const task of store.listTasks().filter(task=>task.plan?.kind==='client_demo')){
  store.updateTask(task.id,{status:'done'});
  store.db.prepare('update tasks set updated_at=? where id=?').run(now.toISOString(),task.id);
 }
 assert.equal(autopilot.get().goalDefault,'Find skincare brands');
 assert.equal(autopilot.get().lastFinishedAt,'2026-10-24T18:00:00.000Z');
 autopilot.set({enabled:true});
 assert.deepEqual(starts,['Find skincare brands Find brands that are not already in the CRM.']);
});
