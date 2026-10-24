import test from 'node:test';
import assert from 'node:assert/strict';
import {openStore} from './store.mjs';
import {createAssistant,assistantTools} from './assistant.mjs';
import {productionToolDefinitions} from './production-research.mjs';

const text=t=>({type:'text',text:t});
const use=(id,name,input)=>({type:'tool_use',id,name,input});
const turn=(content,stop_reason,usage={input_tokens:1000,output_tokens:200})=>({content,stop_reason,usage,model:'claude-sonnet-5-5'});
function fakeClient(script){const calls=[];return {calls,beta:{messages:{create:async p=>{calls.push(JSON.parse(JSON.stringify(p)));const next=script.shift();if(!next)throw new Error('script empty');return typeof next==='function'?next(p):next;}}}};}
function fakeRunner(){const log=[];return {log,start:(prompt)=>{log.push(['start',prompt]);return {id:7,status:'queued'};},steer:(id,m)=>{log.push(['steer',id,m]);return {live:true};},control:(id,a)=>{log.push(['control',id,a]);return id===1;},isRunning:()=>false};}

test('tool list has no way to approve, submit, send, mark sent or delete',()=>{
 const names=assistantTools.map(t=>t.name);
 assert.deepEqual(names.sort(),['control_mission','find_leads','get_lead','get_mission','get_overview','start_mission','steer_mission',...productionToolDefinitions.map(t=>t.name)].sort());
 for(const n of names)assert.doesNotMatch(n,/approve|submit|render|send|sent|delete|remove|gmail/);
 const control=assistantTools.find(t=>t.name==='control_mission');
 assert.deepEqual(control.input_schema.properties.action.enum,['pause','resume','stop']);
 for(const t of assistantTools)assert.equal(t.input_schema.$schema,undefined);
});

test('read tools answer from the store and the loop feeds results back',async()=>{
 const store=openStore(':memory:');const runner=fakeRunner();
 const t=store.createTask('find hat brands');store.updateTask(t.id,{status:'running'});
 const l=store.createLead({taskId:t.id,domain:'hats.com',company:'Hats Co',url:'https://hats.com',market:'hats',territory:'NYC'});
 store.addEvent({taskId:t.id,leadId:l.id,type:'status',title:'Visiting hats.com'});
 const r=store.createRender({title:'Scene 1',endpoint:'x',input:{}});store.updateRender(r.id,{status:'checks_passed',estimate_usd:'1.50'});
 const client=fakeClient([
  turn([text('Let me look.'),use('a','get_overview',{})],'tool_use'),
  turn([use('b','get_mission',{id:t.id}),use('c','find_leads',{query:'HATS'}),use('d','get_lead',{id:l.id})],'tool_use'),
  turn([text('One mission running with one lead.')],'end_turn')
 ]);
 const a=createAssistant({store,runner,client});
 const out=await a.reply({message:'what is going on?'});
 assert.equal(out.reply,'One mission running with one lead.');
 assert.deepEqual(out.actions.map(x=>x.tool),['get_overview','get_mission','find_leads','get_lead']);
 const overview=JSON.parse(client.calls[1].messages.at(-1).content[0].content);
 assert.equal(overview.missions[0].status,'running');
 assert.equal(overview.pending_approvals.renders_awaiting_approval[0].id,r.id);
 assert.equal(overview.latest_events.length,2);
 assert.ok(overview.latest_events.some(e=>e.type==='tool_call'&&e.tool==='assistant.get_overview'));
 const second=client.calls[2].messages.at(-1).content.map(c=>JSON.parse(c.content));
 assert.equal(second[0].leads[0].domain,'hats.com');
 assert.equal(second[1].total,1);
 assert.equal(second[2].lead.company,'Hats Co');
 assert.equal(client.calls[0].tools.length,7+productionToolDefinitions.length);
});

test('act tools route to the runner, errors come back as tool errors',async()=>{
 const store=openStore(':memory:');const runner=fakeRunner();
 const t=store.createTask('x');
 const client=fakeClient([
  turn([use('a','start_mission',{prompt:'find jewelry brands in Queens'}),use('b','steer_mission',{id:t.id,message:'skip big chains'}),use('c','control_mission',{id:t.id,action:'pause'}),use('d','control_mission',{id:t.id,action:'delete'}),use('e','steer_mission',{id:999,message:'hi'})],'tool_use'),
  turn([text('Started mission 7 and paused your first one.')],'end_turn')
 ]);
 const a=createAssistant({store,runner,client});
 const out=await a.reply({message:'start jewelry and steer the other'});
 assert.deepEqual(runner.log,[['start','find jewelry brands in Queens'],['steer',t.id,'skip big chains'],['control',t.id,'pause']]);
 const results=client.calls[1].messages.at(-1).content;
 assert.equal(results[3].is_error,true);
 assert.equal(results[4].is_error,true);
 assert.match(out.actions[3].result_summary,/^error/);
 assert.equal(out.actions[0].result_summary,'started mission 7');
});

test('history persists, replays as context, and is capped at 40 turns',async()=>{
 const store=openStore(':memory:');
 const client=fakeClient([turn([text('Hi Ryan.')],'end_turn'),turn([text('Same.')],'end_turn')]);
 const a=createAssistant({store,runner:fakeRunner(),client});
 await a.reply({message:'hello'});
 const b=createAssistant({store,runner:fakeRunner(),client});
 assert.deepEqual(b.history().map(h=>[h.role,h.text]),[['user','hello'],['assistant','Hi Ryan.']]);
 await b.reply({message:'again'});
 assert.deepEqual(client.calls[1].messages.map(m=>m.content),['hello','Hi Ryan.','again']);
 assert.equal(store.db.prepare('select count(*) n from assistant_messages').get().n,4);
 for(let i=0;i<30;i++){store.db.prepare('insert into assistant_messages(at,role,content) values(?,?,?)').run('t','user',JSON.stringify({text:`u${i}`}));store.db.prepare('insert into assistant_messages(at,role,content) values(?,?,?)').run('t','assistant',JSON.stringify({text:`a${i}`}));}
 const c2=fakeClient([turn([text('ok')],'end_turn')]);
 await createAssistant({store,runner:fakeRunner(),client:c2}).reply({message:'last'});
 assert.equal(c2.calls[0].messages.length,41);
});

test('spend is recorded per call, the model and fallback options are right, change is emitted',async()=>{
 const store=openStore(':memory:');const events=[];store.bus.on('change',e=>events.push(e.kind));
 const client=fakeClient([turn([use('a','get_overview',{})],'tool_use',{input_tokens:1000000,output_tokens:0}),turn([text('Nothing running.')],'end_turn',{input_tokens:0,output_tokens:1000000})]);
 const a=createAssistant({store,runner:fakeRunner(),client});
 const out=await a.reply({message:'status?'});
 assert.equal(client.calls[0].model,'claude-sonnet-5-5');
 assert.deepEqual(client.calls[0].betas,['server-side-fallback-2026-07-01']);
 assert.equal(client.calls[0].fallbacks,'default');
 assert.ok(Math.abs(out.cost-12)<1e-9);
 const rows=store.db.prepare("select provider,usd,note from spend where note='assistant'").all();
 assert.equal(rows.length,2);assert.ok(rows.every(r=>r.provider==='claude'));
 assert.ok(Math.abs(store.spendSummary().total-12)<1e-9);
 assert.ok(events.includes('assistant'));
 const h=fakeClient([turn([text('hi')],'end_turn')]);
 await createAssistant({store,runner:fakeRunner(),client:h}).reply({message:'x',model:'claude-haiku-5-5'});
 assert.equal(h.calls[0].model,'claude-haiku-5-5');assert.equal(h.calls[0].betas,undefined);
});

test('rejects bad input, other models, and failed calls leave no half turn',async()=>{
 const store=openStore(':memory:');
 const a=createAssistant({store,runner:fakeRunner(),client:fakeClient([()=>{throw new Error('api down');}])});
 await assert.rejects(a.reply({message:''}),{status:400});
 await assert.rejects(a.reply({message:'x'.repeat(4001)}),{status:400});
 await assert.rejects(a.reply({message:'hi',model:'claude-opus-5-5'}),{status:400});
 await assert.rejects(a.reply({message:'hi'}),/api down/);
 assert.equal(a.history().length,0);
 const prior=process.env.ANTHROPIC_API_KEY;delete process.env.ANTHROPIC_API_KEY;
 try{await assert.rejects(createAssistant({store,runner:fakeRunner()}).reply({message:'hi'}),{status:503});}finally{if(prior!==undefined)process.env.ANTHROPIC_API_KEY=prior;}
});


test('assistant tools emit correlated lifecycle logs including rejected input, without invented tool costs',async()=>{
 const store=openStore(':memory:');
 const client=fakeClient([turn([use('a','find_leads',{query:'hats'}),use('b','control_mission',{id:1,action:'delete'})],'tool_use'),turn([text('Reviewed.')],'end_turn')]);
 await createAssistant({store,runner:fakeRunner(),client}).reply({message:'review'});
 const events=store.listEvents();
 assert.deepEqual(events.map(e=>e.type),['tool_call','tool_result','tool_call','tool_result']);
 assert.equal(events[0].data.callId,events[1].data.callId);
 assert.equal(events[2].data.callId,events[3].data.callId);
 assert.notEqual(events[0].data.callId,events[2].data.callId);
 assert.equal(events[1].data.status,'success');assert.equal(events[3].data.status,'error');
 assert.ok(events.every(e=>e.data.costUsd===undefined));
 assert.ok(events[1].data.durationMs>=0);assert.match(events[3].data.error,/Invalid/);
 assert.equal(JSON.parse(events[1].data.output).total,0);
});
