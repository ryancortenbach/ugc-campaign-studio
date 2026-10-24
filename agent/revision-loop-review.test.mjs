import test from 'node:test';
import assert from 'node:assert/strict';
import {openStore} from './store.mjs';
import {prepareLeadVideo} from './ugc.mjs';
import {createWhopWatch} from './whopwatch.mjs';

// All provider operations are local mocks. No credentials or live accounts are used.
const fail={passed:false,results:[{name:'Continuity',score:40,issues:[{severity:'major',fix:'Simplify'}]}],cost:0.02};
const pass={passed:true,results:[{name:'Continuity',score:95,issues:[]}],cost:0.02};
function pause(store){
 store.db.exec('create table if not exists settings(key text primary key,value text)');
 store.db.prepare("insert into settings(key,value) values('spendingPaused','true') on conflict(key) do update set value=excluded.value").run();
}
for(const productClip of [false,true])test(`UGC preserves completed ${productClip?'product plan':'text prompt'} revision when pause starts inside that call`,async()=>{
 const store=openStore(':memory:');
 try{
  const task=store.createTask('Mock mission');
  const lead=store.createLead({taskId:task.id,domain:'mock.invalid',company:'Mock',url:'https://mock.invalid',market:'apparel',territory:'test'});
  const input={prompt:'Original',duration:5};
  const revisedInput={...input,prompt:'Latest completed paid revision'};
  const plan=prompt=>({hero:{imageUrl:'https://mock.invalid/product.png'},still:{endpoint:'mock/still',input:{prompt}},video:{input:{prompt:'Motion'}}});
  let checks=0,revisions=0,prices=0;const costs=[];
  const video={endpoint:'mock/video',concept:async()=>({fields:{},input,plan:productClip?plan('Original'):null,cost:0.1}),
   check:async()=>{checks++;return fail;},
   revise:async()=>{revisions++;pause(store);return {fields:{},input:revisedInput,plan:productClip?plan(revisedInput.prompt):null,cost:0.2};},
   estimate:async()=>{prices++;throw Error('Must not price after pause');}};
  await assert.rejects(prepareLeadVideo({store,lead,ctx:{company:'Mock'},video,spend:usd=>costs.push(usd)}),e=>e.code==='spending_paused');
  const [render]=store.listRenders();
  assert.equal(render.input.prompt,revisedInput.prompt);
  if(productClip)assert.equal(render.plan.still.input.prompt,revisedInput.prompt);
  assert.equal(checks,1);assert.equal(revisions,1);assert.equal(prices,0);
  assert.deepEqual(costs,[0.1,0.02,0.2]);assert.equal(render.request_id,null);
 }finally{store.db.close();}
});

function whopFixture(mode){
 const store=openStore(':memory:'),payments=[];let checks=0,revisions=0;
 const plan={title:'Mock board',shots:[]};
 const tools={llmEnabled:()=>true,siteMode:()=>'fetch',visit:async()=>({via:'fetch',homeText:'Mock',pages:[]}),
  search:async()=>({results:[],costUsd:0}),catalog:async()=>({products:[]}),makeBrief:async()=>({brief:{product:'Shirt',idea:'Show shirt'},cost:0.1}),
  draft:async()=>{if(mode==='formatting'){pause(store);throw Object.assign(Error('Formatting interrupted'),{cost:0.37,code:'spending_paused'});}return {plan,cost:0.1};},
  check:async()=>pass,shots:()=>[{title:'Mock shot',input:{prompt:'Original'},group:'mock',shotId:'01'}],endpoint:'mock/video',
  runCheckers:async()=>{checks++;return fail;},reviseShot:async()=>{revisions++;pause(store);return {input:{prompt:'Saved completed shot revision'},cost:0.2};},
  higgsfieldEnabled:()=>false};
 const watch=createWhopWatch({store,tools,runner:{isRunning:()=>false},whop:{whopEnabled:()=>true,listPayments:async()=>({payments:[...payments],next:null}),buyerInfo:async()=>({email:'buyer@mock.invalid',name:'Mock Buyer',fields:[]})}});
 return {store,watch,payments,counts:()=>({checks,revisions})};
}
const payment={id:'mock_payment',status:'paid',substatus:'succeeded',paid:true,amount:100,currency:'usd',product:'Mock UGC',email:'buyer@mock.invalid',name:'Mock Buyer',createdAt:'2026-10-24T16:00:00Z'};
test('Whop preserves returned shot revision before the next pause checkpoint',async()=>{
 const {store,watch,payments,counts}=whopFixture('shot');
 try{
  await watch.tick();payments.push(payment);await watch.tick();
  assert.equal(watch.order(payment.id).state,'failed');
  assert.deepEqual(counts(),{checks:1,revisions:1});
  assert.equal(store.listRenders()[0].input.prompt,'Saved completed shot revision');
  assert.equal(store.listRenders()[0].request_id,null);
  assert.equal(store.db.prepare("select count(*) n from spend where note='whop shot revision'").get().n,1);
 }finally{store.db.close();}
});
test('Whop books interrupted formatting costs exactly once with no valid storyboard',async()=>{
 const {store,watch,payments}=whopFixture('formatting');
 try{
  await watch.tick();payments.push(payment);await watch.tick();
  const order=watch.order(payment.id);
  assert.equal(order.state,'failed');assert.equal(store.listStoryboards().length,0);
  const rows=store.db.prepare("select usd from spend where note='interrupted storyboard formatting repairs'").all();
  assert.equal(rows.length,1);assert.equal(rows[0].usd,0.37);
  assert.equal(store.getTask(order.task_id).cost_usd,0.47);
 }finally{store.db.close();}
});
