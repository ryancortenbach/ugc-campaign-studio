import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,statSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {openStore} from './store.mjs';
import {createPanels,ageBand,incomeOptionIds,validAnswers,scoreResponses,readPricing,buildDraftArgs} from './panel.mjs';

const OPTIONS={
 'multi_select--country':[{id:'US',name:'United States'},{id:'UM',name:'United States Minor Outlying Islands'}],
 'multi_select--state':[{id:'US-NY',name:'New York'}],
 'multi_select--city':[{id:'US-NY-East New York',name:'East New York'},{id:'US-NY-New York City',name:'New York City'}],
 'multi_select--household_income':[{id:'under-30k',name:'Under $30,000'},{id:'80k-100k',name:'$80,000–$99,999'},{id:'100k-150k',name:'$100,000–$149,999'},{id:'150k-200k',name:'$150,000–$199,999'},{id:'over-200k',name:'$200,000+'}]
};
function fakeTerac({balance=100,priceCents=750}={}){
 const t={calls:[],launches:0,approved:[],submissions:[],created:null,status:'draft',participants:5};
 const opp=()=>({id:'opp1',status:t.status,num_participants:t.participants,pricing:{cost_per_participant_cents:priceCents,total_cost_cents:priceCents*t.participants,currency:'usd'},links:{dashboard:{draft_editor:'https://terac.test/draft?id=opp1',submissions:null}}});
 Object.assign(t,{
  enabled:()=>true,
  filterOptions:async(slug,search)=>OPTIONS[slug].filter(o=>!search||o.name.toLowerCase().includes(String(search).toLowerCase())),
  call:async(name,args)=>{t.calls.push([name,args]);if(name==='terac_list_projects')return {json:{data:[{id:'proj1'}]}};if(name==='terac_update_opportunity'){t.participants=args.num_participants;return {json:{}};}throw Error(`unexpected ${name}`);},
  createOpportunity:async args=>{t.created=args;t.participants=args.num_participants;return opp();},
  getOpportunity:async()=>opp(),
  balance:async()=>balance,
  launchDraft:async id=>{t.launches++;t.status='active';return {id};},
  listSubmissions:async()=>({data:t.submissions}),
  approveSubmission:async id=>{t.approved.push(id);}
 });
 return t;
}
function fakeSupabase(){
 const s={uploads:[],panels:[],deleted:[],responses:[]};
 Object.assign(s,{enabled:()=>true,offerUrl:token=>`https://db.test/storage/v1/object/public/offers/${token}.pdf`,uploadOffer:async(t,b)=>s.uploads.push([t,b.length]),insertPanel:async r=>s.panels.push(r),deletePanel:async t=>s.deleted.push(t),listResponses:async()=>s.responses});
 return s;
}
const good=(over={})=>({stop_scrolling:8,real_customer:7,check_out:6,clear_product:9,improve:'Show the fit sooner',...over});
function setup({terac=fakeTerac(),supabase=fakeSupabase(),territory='New York City'}={}){
 const store=openStore(':memory:');
 const lead=store.createLead({taskId:null,domain:'blannyc.com',company:'BLAN',url:'https://blannyc.com',market:'streetwear',territory});
 store.updateLead(lead.id,{brand_profile:{audience:['Brooklyn and NYC menswear fans']}});
 const render=store.createRender({title:'BLAN video',endpoint:'x',input:{},leadId:lead.id});
 store.updateRender(render.id,{status:'completed',result_url:'https://cdn.test/clip.mp4',checks:{passed:true,results:[{name:'Brand',score:90,summary:'ok',issues:[]},{name:'Voice',score:80,summary:'ok',issues:[]}]}});
 const panels=createPanels({store,terac,supabase,offerFor:async()=>({bytes:Buffer.from('%PDF-fake'),name:'offer.pdf'}),env:{PANEL_PUBLIC_URL:'https://panel.test'},wait:async()=>{}});
 return {store,lead,render,panels,terac,supabase};
}

test('draft carries city, state, age and income filters with option ids from Terac', async()=>{
 const {panels,terac,supabase,store,render}=setup();
 const p=await panels.createPanel({renderId:render.id,participants:5});
 const f=Object.assign({},...terac.created.filters);
 assert.deepEqual(f['integer--age'],{$gte:18,$lte:44});
 assert.deepEqual(f['multi_select--country'],{$in:['US']});
 assert.deepEqual(f['multi_select--state'],{$in:['US-NY']});
 assert.deepEqual(f['multi_select--city'],{$in:['US-NY-New York City']});
 assert.deepEqual(f['multi_select--household_income'],{$in:['100k-150k','150k-200k','over-200k']});
 const task=terac.created.tasks[0];
 assert.equal(task.task_type,'interview');assert.equal(task.review_type,'manual_review');assert.equal(task.duration_minutes,3);
 assert.match(task.task_url,/^https:\/\/panel\.test\/panel\/\?t=[A-Za-z0-9_-]{16,}$/);
 assert.ok(terac.created.description.length<=280);
 assert.ok(terac.created.screening_questions.every(q=>q.answers.some(a=>a.qualify_logic==='reject')));
 assert.equal(p.status,'draft');assert.equal(p.price_per_participant,7.5);assert.equal(p.total_usd,37.5);
 assert.equal(p.links.draft_editor,'https://terac.test/draft?id=opp1');
 assert.equal(supabase.uploads.length,1);assert.equal(supabase.panels[0].brand,'BLAN');assert.equal(supabase.panels[0].clip_url,'https://cdn.test/clip.mp4');
 assert.equal(terac.launches,0);
 assert.equal(store.listPanels({renderId:render.id}).length,1);
 await assert.rejects(panels.createPanel({renderId:render.id}),/already has a human panel/);
});
test('participant count is bounded and a render must be finished', async()=>{
 const {panels,store,render}=setup();
 await assert.rejects(panels.createPanel({renderId:render.id,participants:2}),/3 to 20/);
 await assert.rejects(panels.createPanel({renderId:render.id,participants:21}),/3 to 20/);
 store.updateRender(render.id,{status:'queued'});
 await assert.rejects(panels.createPanel({renderId:render.id}),/finished video/);
});
test('age band comes from the audience when it states one, else 18 to 44', () => {
 assert.deepEqual(ageBand(['Women 25-34 who shop online']).min,25);
 assert.equal(ageBand(['Women 25 to 34']).max,34);
 assert.equal(ageBand(['College students']).max,24);
 assert.deepEqual([ageBand(['NYC menswear fans']).min,ageBand(['NYC menswear fans']).max],[18,44]);
 assert.deepEqual(incomeOptionIds(OPTIONS['multi_select--household_income']),['100k-150k','150k-200k','over-200k']);
});
test('launch refuses without confirm:true and never reaches Terac', async()=>{
 const {panels,terac,render}=setup();
 const p=await panels.createPanel({renderId:render.id});
 for(const arg of [undefined,{},{confirm:false},{confirm:'true'},{confirm:1}])await assert.rejects(panels.launchPanel(p.id,arg),/confirm:true/);
 assert.equal(terac.launches,0);
});
test('launch refuses when the balance is below the total', async()=>{
 const terac=fakeTerac({balance:20});
 const {panels,store,render}=setup({terac});
 const p=await panels.createPanel({renderId:render.id});
 await assert.rejects(panels.launchPanel(p.id,{confirm:true}),e=>e.status===402&&/\$20\.00/.test(e.message));
 assert.equal(terac.launches,0);assert.equal(store.getPanel(p.id).status,'draft');
});
test('launch calls Terac exactly once, even when clicked twice', async()=>{
 const {panels,terac,store,render}=setup();
 const p=await panels.createPanel({renderId:render.id});
 const [a,b]=await Promise.allSettled([panels.launchPanel(p.id,{confirm:true}),panels.launchPanel(p.id,{confirm:true})]);
 assert.equal([a,b].filter(x=>x.status==='fulfilled').length,1);
 assert.equal(terac.launches,1);assert.equal(store.getPanel(p.id).status,'launched');
 await assert.rejects(panels.launchPanel(p.id,{confirm:true}),/already launched/);
 assert.equal(terac.launches,1);
});
test('changing the head count updates the draft and the price', async()=>{
 const {panels,terac,render}=setup();
 const p=await panels.createPanel({renderId:render.id});
 const q=await panels.setParticipants(p.id,8);
 assert.equal(q.participants,8);assert.equal(q.total_usd,60);
 assert.deepEqual(terac.calls.find(c=>c[0]==='terac_update_opportunity')[1],{opportunityId:'opp1',num_participants:8});
 await assert.rejects(panels.setParticipants(p.id,2),/3 to 20/);
});
test('sync writes exactly one Human panel result and leaves the other checkers alone', async()=>{
 const {panels,terac,supabase,store,render}=setup();
 const p=await panels.createPanel({renderId:render.id,participants:3});
 await panels.launchPanel(p.id,{confirm:true});
 supabase.responses=[{submission_id:'s1',answers:good()},{submission_id:'s2',answers:good({stop_scrolling:6})}];
 await panels.syncPanel(p.id);
 supabase.responses.push({submission_id:'s3',answers:good({stop_scrolling:10,real_customer:10,check_out:10,clear_product:10})});
 await panels.syncPanel(p.id);
 const r=store.getRender(render.id);
 const humans=r.checks.results.filter(x=>x.name==='Human panel');
 assert.equal(humans.length,1);
 assert.deepEqual(r.checks.results.filter(x=>x.name!=='Human panel').map(x=>[x.name,x.score]),[['Brand',90],['Voice',80]]);
 assert.equal(humans[0].n,3);assert.equal(humans[0].panelId,p.id);assert.deepEqual(humans[0].issues,[]);
 assert.match(humans[0].summary,/^3 people, avg \d\.\d\/10$/);
 assert.ok(humans[0].score>=0&&humans[0].score<=100);
 assert.equal(store.getPanel(p.id).status,'complete');
});
test('sync emits a render change so the UI stream updates', async()=>{
 const {panels,supabase,store,render}=setup();
 const p=await panels.createPanel({renderId:render.id});
 await panels.launchPanel(p.id,{confirm:true});
 const seen=[];store.bus.on('change',c=>seen.push(c.kind));
 supabase.responses=[{submission_id:'s1',answers:good()}];
 await panels.syncPanel(p.id);
 assert.ok(seen.includes('panel')&&seen.includes('render'));
});
test('only submissions with a valid stored response are approved', async()=>{
 const {panels,terac,supabase,render}=setup();
 const p=await panels.createPanel({renderId:render.id});
 await panels.launchPanel(p.id,{confirm:true});
 terac.submissions=[{id:'sValid',status:'awaiting_review'},{id:'sBad',status:'awaiting_review'},{id:'sNone',status:'awaiting_review'},{id:'sDone',status:'approved'},{id:'sWork',status:'in_progress'}];
 supabase.responses=[{submission_id:'sValid',answers:good()},{submission_id:'sBad',answers:good({check_out:11})},{submission_id:'sOther',answers:good()}];
 await panels.syncPanel(p.id);
 assert.deepEqual(terac.approved,['sValid']);
 for(const bad of [good({improve:''}),good({improve:'x'.repeat(1001)}),{...good(),extra:1},{stop_scrolling:5},good({real_customer:5.5}),good({clear_product:'9'}),null])assert.equal(validAnswers(bad),false);
 assert.equal(validAnswers(good()),true);
 const s=scoreResponses([{answers:good()},{answers:good({check_out:11})}]);
 assert.equal(s.n,1);
});
test('pricing is read from cents', () => {
 assert.deepEqual(readPricing({pricing:{cost_per_participant_cents:750,total_cost_cents:3750}}),{per:7.5,total:37.5});
 assert.deepEqual(readPricing({pricing:null}),{per:null,total:null});
});
test('draft args never invent a city when none matches', () => {
 const a=buildDraftArgs({projectId:'p',token:'tok',participants:5,publicUrl:'https://x.test',brand:'B',renderId:1,age:{min:18,max:44},geo:null,incomeIds:['over-200k']});
 assert.equal(a.filters.some(f=>'multi_select--city' in f||'multi_select--state' in f),false);
});
test('nothing but the confirm route can launch', () => {
 const here=path.dirname(fileURLToPath(import.meta.url));
 const hits=[];
 const walk=d=>{for(const n of readdirSync(d)){if(['node_modules','.data','knowledge'].includes(n))continue;const f=path.join(d,n);if(statSync(f).isDirectory()){walk(f);continue;}if(!/\.(mjs|js)$/.test(n)||/\.test\.mjs$/.test(n))continue;const t=readFileSync(f,'utf8');if(/terac_launch_draft_opportunity|launchDraft\s*\(|launchPanel\s*\(/.test(t))hits.push(path.relative(here,f));}};
 walk(here);
 assert.deepEqual(hits.sort(),['panel.mjs','server.mjs','tools/terac.mjs']);
 const server=readFileSync(path.join(here,'server.mjs'),'utf8');
 assert.equal((server.match(/launchPanel\s*\(/g)||[]).length,1);
 assert.match(server,/\/api\\\/panels\\\/\(\\d\+\)\\\/launch\$\/,async\(m,b\)=>\(\{panel:await panels\.launchPanel\(Number\(m\[1\]\),\{confirm:b\.confirm\}\)\}\)/);
 const panel=readFileSync(path.join(here,'panel.mjs'),'utf8');
 assert.equal((panel.match(/launchDraft\s*\(/g)||[]).length,1);
});
