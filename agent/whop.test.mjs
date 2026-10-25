import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {readFileSync} from 'node:fs';
import {openStore} from './store.mjs';
import {createWhopWatch,identifyBrand,brandDomain,realWhopTools} from './whopwatch.mjs';
import {createApp} from './server.mjs';
import {normalizePayment,listPayments,buyerInfo,amountOf} from './tools/whop.mjs';
import {priceFrom,shotsFromStoryboard,endpoints} from './tools/higgsfield.mjs';

const money=n=>({currency:'usd',amount:String(n),decimals:2,display_decimals:2});
const pay=(id,over={})=>normalizePayment({id,status:'paid',substatus:'succeeded',total:money('541.25'),usd_total:money('541.25'),currency:'usd',created_at:'2026-10-24T16:00:00Z',customer_email:'buyer@acme.com',user:{id:'user_1',name:'Ann Lee',username:'ann'},member_id:'mber_1',membership_id:'mem_1',line_items:[{product_title:'AI UGC Videos',label:'AI UGC Videos'}],metadata:{},...over});

const plan={title:'Acme demo',identity:'A woman in her 20s, brown bob',wardrobe:'Green hoodie',environment:'Bright kitchen',voice:'Warm',creativeDirection:'Handheld',offer:'',constraints:'None',shots:[{id:'shot-01',duration:5,camera:'Medium selfie shot',action:'She holds up the product',dialogue:'I love this.',audio:'Room tone'},{id:'shot-02',duration:5,camera:'Close up',action:'She smiles',dialogue:'',audio:'Room tone'}]};
const pass={passed:true,results:[{name:'Continuity',score:95,issues:[]}],cost:0.02};
const fail={passed:false,results:[{name:'Continuity',score:60,issues:[{severity:'major',evidence:'x',fix:'y'}]}],cost:0.02};

function setup({payments=[],fields={},checks=[],visitFails=false,searchResults=[{url:'https://www.annlee.co/about',title:'Ann Lee',text:'Founder of Annlee'}],shotPasses=true,shotFailures=0,catalogProducts=[],research=null,onStoryboardCheck=null}={}){
 const store=openStore(':memory:');
 const state={payments:[...payments]};
 const calls={search:[],visit:[],draft:0,revise:0,check:0,estimate:0};
 const whop={whopEnabled:()=>true,listPayments:async()=>({payments:[...state.payments],next:null}),buyerInfo:async p=>({email:p.email,name:p.name,fields:fields[p.id]||[]})};
 const queue=[...checks];let shotChecks=0;
 const tools={
  llmEnabled:()=>true,siteMode:()=>'fetch',
  search:async q=>{calls.search.push(q);return {via:'exa',results:searchResults,costUsd:0.007};},
  visit:async url=>{calls.visit.push(url);if(visitFails)throw Error('boom');return {via:'fetch',pages:[{url,title:'Acme | Shoes'}],homeText:'Acme sells shoes',socials:{}};},
  catalog:async()=>({products:catalogProducts,source:'test fixture'}),
  makeBrief:async input=>{calls.briefProducts=input.products;return {brief:{...(research?{research}:{}),product:'Shoes',audience:'Runners',idea:'Unboxing',offer:'',identity:'a',wardrobe:'b',environment:'c',voice:'d'},cost:0.01,model:'sonnet-fixture'};},
  draft:async()=>{calls.draft++;return {plan:structuredClone(plan),cost:0.05};},
  check:async()=>{calls.check++;onStoryboardCheck?.();return queue.length?queue.shift():pass;},
  revise:async()=>{calls.revise++;return {plan:structuredClone(plan),cost:0.04};},
  shots:shotsFromStoryboard,endpoint:endpoints['text-to-video'],
  runCheckers:async()=>++shotChecks<=shotFailures?fail:shotPasses?pass:fail,
  reviseShot:async({input})=>{calls.shotRevisions=(calls.shotRevisions||0)+1;return {input:{...input,prompt:input.prompt+' Fixed.'},cost:0.01};},
  estimate:async()=>{calls.estimate++;return {usd:'1.50'};},priceFrom,higgsfieldEnabled:()=>true
 };
 const watch=createWhopWatch({store,runner:{isRunning:()=>false},tools,whop});
 return {store,state,calls,whop,tools,watch};
}
const titles=(store,taskId)=>store.listEvents({taskId}).map(e=>e.title);

test('baseline records every existing payment as historical and processes none', async () => {
 const {store,state,watch,calls}=setup({payments:[pay('pay_old1'),pay('pay_old2'),pay('pay_old3',{status:'open',substatus:'failed'})]});
 assert.equal(await watch.tick(),'baselined 3');
 const g=watch.get();
 assert.equal(g.baseline.done,true);assert.equal(g.baseline.count,3);assert.equal(g.counts.historical,3);
 assert.equal(store.listTasks().length,0);assert.equal(calls.visit.length,0);assert.equal(calls.draft,0);
 assert.equal(await watch.tick(),'watching');
 assert.equal(store.listTasks().length,0);
 state.payments.unshift(pay('pay_new'));
 assert.equal(await watch.tick(),'started 1');
 assert.equal(store.listTasks().length,1);
});

test('a new paid payment becomes a task and a storyboard, auto-approves, and stops at checks_passed with a price', async () => {
 const {store,state,watch,calls}=setup({payments:[pay('pay_old')]});
 await watch.tick();
 state.payments.unshift(pay('pay_1'));
 await watch.tick();
 const o=watch.order('pay_1');
 assert.equal(o.state,'ready');assert.equal(o.brand_domain,'acme.com');assert.equal(o.brand_source,'buyer email domain');
 const t=store.getTask(o.task_id);
 assert.equal(t.prompt,'Whop order: AI UGC Videos from Acme (acme.com)');assert.equal(t.status,'done');
 assert.match(t.summary,/^Ready for your approval: 2 shots, about \$3\.00 total/);
 assert.deepEqual(calls.visit,['https://acme.com/']);
 const sb=store.getStoryboard(o.storyboard_id);
 assert.equal(sb.status,'approved');assert.equal(sb.brief.source,'whop');
 const renders=store.listRenders();
 assert.equal(renders.length,2);
 for(const r of renders){assert.equal(r.storyboard_id,sb.id);assert.match(r.storyboard_plan_hash,/^[a-f0-9]{64}$/);assert.equal(r.status,'checks_passed');assert.equal(r.estimate_usd,'1.50');assert.equal(r.request_id,null);assert.equal(r.approved_at,null);}
 assert.deepEqual(o.render_ids.sort(),renders.map(r=>r.id).sort());
 assert.ok(titles(store,t.id).some(x=>x.startsWith('Ready for your approval: 2 shots, about $3.00 total')));
 const sp=store.spendSummary();
 assert.ok(sp.providers.find(p=>p.provider==='exa'));assert.ok(sp.providers.find(p=>p.provider==='claude'));assert.ok(!sp.providers.find(p=>p.provider==='higgsfield'));
 assert.ok(t.cost_usd>0);
});

test('checker notes trigger revisions until it passes', async () => {
 const {store,state,watch,calls}=setup({checks:[fail,fail]});
 await watch.tick();state.payments.unshift(pay('pay_1'));
 await watch.tick();
 const o=watch.order('pay_1');
 assert.equal(calls.revise,2);assert.equal(calls.check,3);
 assert.equal(o.state,'ready');
 assert.equal(store.getStoryboard(o.storyboard_id).version,3);
});

test('client storyboards continue beyond five revisions until the checkers pass',async()=>{
 const {store,state,watch,calls}=setup({checks:Array(8).fill(fail)});
 await watch.tick();state.payments.unshift(pay('pay_1'));await watch.tick();
 const o=watch.order('pay_1');assert.equal(calls.revise,8);assert.equal(calls.check,9);assert.equal(o.state,'ready');
 assert.equal(store.getStoryboard(o.storyboard_id).version,9);assert.ok(store.listRenders().every(r=>r.request_id===null));
});

test('individual client shots keep revising beyond five failures before being priced',async()=>{
 const {store,state,watch,calls}=setup({shotFailures:8});
 await watch.tick();state.payments.unshift(pay('pay_1'));await watch.tick();
 assert.equal(calls.shotRevisions,8);assert.equal(watch.order('pay_1').state,'ready');assert.ok(store.listRenders().every(r=>r.status==='checks_passed'&&r.request_id===null));
});

test('brand identification order: checkout field, email domain, Exa, then needs_brand', async () => {
 const search=async q=>({results:[{url:'https://www.linkedin.com/in/ann'},{url:'https://www.annlee.co/'}],costUsd:0.007,q});
 const field=await identifyBrand({buyer:{email:'a@gmail.com',name:'Ann Lee',fields:[{question:'Your website',answer:'https://www.Fieldbrand.com/shop'}]},search});
 assert.deepEqual([field.domain,field.source],['fieldbrand.com','checkout field "Your website"']);
 const both=await identifyBrand({buyer:{email:'a@mailbrand.com',name:'Ann Lee',fields:[{question:'Website',answer:'fieldbrand.com'}]},search});
 assert.equal(both.domain,'fieldbrand.com');
 const mail=await identifyBrand({buyer:{email:'a@mailbrand.com',name:'Ann Lee',fields:[]},search});
 assert.deepEqual([mail.domain,mail.source],['mailbrand.com','buyer email domain']);
 for(const free of ['gmail.com','outlook.com','yahoo.com','icloud.com','school.edu']){
  const hit=await identifyBrand({buyer:{email:`a@${free}`,name:'Ann Lee',fields:[]},search});
  assert.equal(hit.domain,'annlee.co');assert.match(hit.source,/^Exa search for "Ann Lee"/);
 }
 const company=await identifyBrand({buyer:{email:'a@gmail.com',name:'Ann',fields:[{question:'Company name',answer:'Glow Co'}]},search:async q=>({results:[{url:'https://glow.co'}],costUsd:0,q})});
 assert.equal(company.domain,'glow.co');assert.match(company.source,/Glow Co/);
 assert.equal(await identifyBrand({buyer:{email:'a@gmail.com',name:'Don',fields:[]},search}),null);
 assert.equal(brandDomain('https://instagram.com/x'),null);assert.equal(brandDomain('gmail.com'),null);assert.equal(brandDomain('Shop.Brand.com/path'),'shop.brand.com');
});

test('free mail with a one word name stops at needs_brand, and the brand route continues it', async () => {
 const {store,state,watch,calls}=setup({});
 await watch.tick();
 state.payments.unshift(pay('pay_1',{customer_email:'don@gmail.com',user:{id:'u',name:'Don',username:'don'}}));
 await watch.tick();
 let o=watch.order('pay_1');
 assert.equal(o.state,'needs_brand');assert.equal(calls.visit.length,0);assert.equal(calls.draft,0);
 assert.equal(store.getTask(o.task_id).status,'paused');
 assert.ok(titles(store,o.task_id).some(t=>/Could not identify the brand/.test(t)));
 assert.throws(()=>watch.setBrand('pay_1','gmail.com'),/Enter the brand website/);
 watch.setBrand('pay_1','https://www.Dons-Brand.com/');
 await watch.idle();
 o=watch.order('pay_1');
 assert.equal(o.state,'ready');assert.equal(o.brand_domain,'dons-brand.com');assert.equal(o.brand_source,'you set it');
 assert.equal(o.task_id,1);assert.equal(store.listTasks().length,1);
});

test('free mail with a full name falls back to an Exa search and records it', async () => {
 const {state,watch,calls}=setup({});
 await watch.tick();
 state.payments.unshift(pay('pay_1',{customer_email:'ann@outlook.com'}));
 await watch.tick();
 const o=watch.order('pay_1');
 assert.equal(o.brand_domain,'annlee.co');assert.match(o.brand_source,/^Exa search/);
 assert.match(calls.search[0],/Ann Lee/);
});

test('an unreachable site goes to needs_brand instead of burning model spend', async () => {
 const {store,state,watch,calls}=setup({visitFails:true});
 await watch.tick();state.payments.unshift(pay('pay_1'));
 await watch.tick();
 const o=watch.order('pay_1');
 assert.equal(o.state,'needs_brand');assert.match(o.error,/Could not load acme.com/);assert.equal(calls.draft,0);
});

test('failed, open, refunded and free payments are ignored', async () => {
 const {store,state,watch}=setup({});
 await watch.tick();
 state.payments.unshift(pay('pay_f',{status:'open',substatus:'failed'}),pay('pay_r',{substatus:'refunded'}),pay('pay_r2',{refunded_amount:money('541.25')}),pay('pay_z',{total:money('0.00'),usd_total:money('0.00')}),pay('pay_p',{status:'pending',substatus:'pending'}));
 assert.equal(await watch.tick(),'watching');
 assert.equal(store.listTasks().length,0);assert.equal(watch.get().total,0);
 state.payments[state.payments.findIndex(p=>p.id==='pay_p')]=pay('pay_p');
 assert.equal(await watch.tick(),'started 1');
});

test('the same payment is never processed twice, even across watcher restarts', async () => {
 const {store,state,watch,whop,tools,calls}=setup({});
 await watch.tick();state.payments.unshift(pay('pay_1'));
 await Promise.all([watch.tick(),watch.tick()]);
 await watch.tick();
 assert.equal(store.listTasks().length,1);assert.equal(calls.draft,1);
 const again=createWhopWatch({store,runner:{isRunning:()=>false},tools,whop});
 await again.tick();await again.tick();
 assert.equal(store.listTasks().length,1);assert.equal(calls.draft,1);assert.equal(store.listRenders().length,2);
});

test('orders cut off by a restart are marked failed on start, not rerun', async () => {
 const {store,watch,calls}=setup({});
 store.db.prepare("insert into whop_orders(payment_id,state,payment,created_at,updated_at) values('pay_x','working','{}','t','t')").run();
 watch.start();watch.stop();
 assert.equal(watch.order('pay_x').state,'failed');assert.match(watch.order('pay_x').error,/restart/);
 assert.equal(calls.draft,0);
});

test('disabled watcher does nothing and enabling works from settings', async () => {
 const {state,watch}=setup({payments:[pay('pay_old')]});
 watch.set({enabled:false});
 assert.equal(await watch.tick(),'off');assert.equal(watch.get().baseline.done,false);
 assert.equal(watch.set({enabled:true}).enabled,true);
 assert.equal(await watch.tick(),'baselined 1');
});

test('Whop client is read only: GET with a bearer key, paged, money and fields normalized', async () => {
 const prior=process.env.WHOP_API_KEY;process.env.WHOP_API_KEY='apik_test';
 try{
 const seen=[];
 const request=async(url,init)=>{seen.push({url:String(url),method:init.method,auth:init.headers.Authorization});
  if(String(url).includes('/members/'))return {ok:true,json:async()=>({email:'m@brand.io',display_name:'Mia Mo'})};
  if(String(url).includes('/memberships/'))return {ok:true,json:async()=>({custom_field_responses:[{id:'c',question:'Website',answer:'brand.io'}]})};
  return {ok:true,json:async()=>({data:[{id:'pay_a',status:'paid',substatus:'succeeded',total:money('20.50'),currency:'usd',line_items:[{product_title:'P'}],member_id:'mber_9',membership_id:'mem_9'}],page_info:{has_next_page:true,end_cursor:'CUR'}})};};
 const out=await listPayments({after:'X',request});
 assert.equal(seen[0].method,'GET');assert.equal(seen[0].auth,'Bearer apik_test');
 assert.match(seen[0].url,/^https:\/\/api\.whop\.com\/api\/v1\/payments\?first=100&after=X&order=created_at&direction=desc$/);
 assert.equal(out.next,'CUR');assert.equal(out.payments[0].amount,20.5);assert.equal(out.payments[0].paid,true);assert.equal(out.payments[0].product,'P');
 const buyer=await buyerInfo(out.payments[0],{request});
 assert.deepEqual([buyer.email,buyer.name,buyer.fields[0].answer],['m@brand.io','Mia Mo','brand.io']);
 assert.ok(seen.every(s=>s.method==='GET'));
 assert.equal(amountOf(12),12);assert.equal(amountOf(null),0);
 }finally{if(prior===undefined)delete process.env.WHOP_API_KEY;else process.env.WHOP_API_KEY=prior;}
});

test('whopwatch never calls the Higgsfield submit', () => {
 const src=readFileSync(new URL('./whopwatch.mjs',import.meta.url),'utf8');
 assert.ok(!/approveAndSubmit|api\.higgsfield|sendMail|send-email|method:\s*'(POST|PUT|PATCH|DELETE)'/.test(src));
 assert.ok(!('approveAndSubmit' in realWhopTools));
});

test('routes: state, toggle, brand, run', async () => {
 const {store,state,watch}=setup({payments:[pay('pay_old'),pay('pay_oldfail',{status:'open',substatus:'failed'})]});
 const server=http.createServer(createApp({store,runner:{start(){},control(){},steer(){},isRunning:()=>false},whopwatch:watch}));
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base=`http://127.0.0.1:${server.address().port}`;
 const get=p=>fetch(base+p).then(async r=>({status:r.status,body:await r.json()}));
 const post=(p,b={})=>fetch(base+p,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)}).then(async r=>({status:r.status,body:await r.json()}));
 try{
  await watch.tick();
  let r=await get('/api/whop');
  assert.equal(r.status,200);assert.equal(r.body.baseline.count,2);assert.equal(r.body.orders.length,2);assert.equal(r.body.orders[0].state,'historical');assert.equal(typeof r.body.enabled,'boolean');
  assert.equal((await post('/api/whop',{enabled:'yes'})).status,400);
  assert.equal((await post('/api/whop',{enabled:false})).body.enabled,false);
  assert.equal((await post('/api/whop',{enabled:true})).body.enabled,true);
  const cfg=await get('/api/state');
  assert.match(cfg.body.config.integrations.find(i=>i.id==='whop').detail,/^Watching Mint Labs purchases\. 2 orders so far$/);
  assert.equal((await post('/api/whop/orders/pay_nope/run')).status,404);
  assert.equal((await post('/api/whop/orders/pay_oldfail/run')).status,409);
  assert.equal((await post('/api/whop/orders/pay_old/brand',{domain:'x.com'})).status,409);
  r=await post('/api/whop/orders/pay_old/run');
  assert.equal(r.status,200);assert.equal(r.body.order.state,'working');
  await watch.idle();
  assert.equal(watch.order('pay_old').state,'ready');
  assert.equal((await post('/api/whop/orders/pay_old/run')).status,409);
  state.payments.unshift(pay('pay_n',{customer_email:'d@gmail.com',user:{id:'u',name:'Don',username:'d'}}));
  await watch.tick();
  assert.equal((await post('/api/whop/orders/pay_n/brand',{domain:'nope'})).status,400);
  r=await post('/api/whop/orders/pay_n/brand',{domain:'don.com'});
  assert.equal(r.status,200);assert.equal(r.body.order.brand_domain,'don.com');
  await watch.idle();
  assert.equal(watch.order('pay_n').state,'ready');
 }finally{server.close();}
});

test('a client with no CRM lead keeps catalog photos and the complete research brief on its own task',async()=>{
 const {mkdtempSync,rmSync}=await import('node:fs'),{tmpdir}=await import('node:os'),path=await import('node:path');
 const {saveUpload}=await import('./tools/uploads.mjs'),{clientOrderReport}=await import('./creative-brief.mjs'),{buildTaskIdeasPdf}=await import('./task-ideas-pdf.mjs'),{PDFDocument,PDFName}=await import('pdf-lib');
 const folder=mkdtempSync(path.join(tmpdir(),'mint-client-photo-')),previous=process.env.AGENT_UPLOAD_DIR;process.env.AGENT_UPLOAD_DIR=folder;
 let store;
 try{
  const upload=saveUpload({name:'Actual product',type:'image/png',data:readFileSync(new URL('./public/favicon.png',import.meta.url)).toString('base64')});
  const catalogProducts=[{title:'Real product',url:'https://acme.com/products/real',image:'0.png',referenceUrl:`/uploads/${upload.file}`}];
  const research={researchBrief:'Saved Sonnet narrative.',icp:{summary:'ICP candidate.',motivations:['Comfort'],evidence:['Catalog'],unknowns:['Age unknown']},character:{appearance:'An original character.',wardrobe:'Brand garment.',rationale:'Clear silhouette.'},designDirections:[{name:'Clean',description:'Muted colors.',rationale:'Fits catalog.'}],gameAffinities:[{name:'Game A',basis:'hypothesis',sourceUrl:null,rationale:'Possible treatment.'}],environments:[{name:'Street',description:'Quiet sidewalk.',rationale:'Clothing is visible.'}],sources:[{url:'https://acme.com/products/real',observation:'Product source'}],unknowns:['Performance unverified.']};
  const fixture=setup({catalogProducts,research});store=fixture.store;await fixture.watch.tick();fixture.state.payments.unshift(pay('pay_complete'));await fixture.watch.tick();
  const order=fixture.watch.order('pay_complete'),task=store.getTask(order.task_id);assert.equal(store.listLeads().length,0);assert.deepEqual(task.plan.productReferences,catalogProducts);assert.equal(task.plan.creativeBrief.researchBrief,'Saved Sonnet narrative.');assert.equal(task.plan.researchModel,'sonnet-fixture');assert.deepEqual(fixture.calls.briefProducts,catalogProducts);
  const report=clientOrderReport({store,paymentId:'pay_complete'});assert.deepEqual(report.lead.products,catalogProducts);const pdf=await PDFDocument.load((await buildTaskIdeasPdf(report)).bytes);assert.ok(pdf.getPages().some(p=>p.node.Resources()?.lookup(PDFName.of('XObject'))?.keys().length));
 }finally{store?.db.close();if(previous===undefined)delete process.env.AGENT_UPLOAD_DIR;else process.env.AGENT_UPLOAD_DIR=previous;rmSync(folder,{recursive:true,force:true});}
});

test('turning the watcher off interrupts an active revision before the next paid call',async()=>{
 let activeWatch;const {state,watch,calls}=setup({checks:Array(20).fill(fail),onStoryboardCheck:()=>{if(calls.check===7)activeWatch.set({enabled:false});}});activeWatch=watch;
 await watch.tick();state.payments.unshift(pay('pay_stop'));await watch.tick();
 assert.equal(calls.check,7);assert.equal(calls.revise,6);assert.equal(watch.order('pay_stop').state,'failed');assert.match(watch.order('pay_stop').error,/Stopped by operator/);
});
