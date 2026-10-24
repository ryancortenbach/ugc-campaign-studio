import {randomBytes} from 'node:crypto';
import {createTerac} from './tools/terac.mjs';

// Human panel: a finished 5 second clip is rated by real people recruited on Terac, and the average lands in the render's
// checker rings as one "Human panel" result. Answers are stored in the Supabase project "mint-labs-panel" (docs/sql/panel-v1.sql).
// Money rule: launchPanel() is the only function here that spends. It runs only for confirm:true and only after a balance check.
export const MIN_PARTICIPANTS=3,MAX_PARTICIPANTS=20,DEFAULT_PARTICIPANTS=5;
export const DEFAULT_PUBLIC_URL='https://duolingo-library-phone-v1.vercel.app';
export const RATING_KEYS=['stop_scrolling','real_customer','check_out','clear_product'];
export const PANEL_CHECK_NAME='Human panel';
export const INCOME_FLOOR=100000;
export const DEFAULT_AGE={min:18,max:44};
const fail=(status,message)=>Object.assign(Error(message),{status});

// ---------- Supabase (service key, server side only) ----------
export function createSupabase({env=process.env,fetch=globalThis.fetch}={}){
 const url=()=>String(env.SUPABASE_PANEL_URL||'').replace(/\/$/,''),key=()=>env.SUPABASE_PANEL_SERVICE_KEY||'';
 const enabled=()=>Boolean(url()&&key());
 const h=(extra={})=>({apikey:key(),Authorization:`Bearer ${key()}`,...extra});
 async function req(method,p,{body,headers,raw}={}){
  if(!enabled())throw fail(503,'The panel database is not set up. Run scripts/panel-supabase-setup.mjs.');
  const res=await fetch(`${url()}${p}`,{method,headers:h(headers),body,signal:AbortSignal.timeout(30000)});
  const text=await res.text();
  if(!res.ok)throw Error(`Supabase ${method} ${p.split('?')[0]} failed (HTTP ${res.status}): ${text.slice(0,200)}`);
  if(raw)return text;
  try{return text?JSON.parse(text):null;}catch{return null;}
 }
 return {
  enabled,
  offerUrl:token=>`${url()}/storage/v1/object/public/offers/${token}.pdf`,
  async uploadOffer(token,bytes){await req('POST',`/storage/v1/object/offers/${token}.pdf`,{body:bytes,headers:{'Content-Type':'application/pdf','x-upsert':'true'},raw:true});},
  async insertPanel(row){await req('POST','/rest/v1/panels',{body:JSON.stringify(row),headers:{'Content-Type':'application/json',Prefer:'return=minimal'},raw:true});},
  async deletePanel(token){await req('DELETE',`/rest/v1/panels?token=eq.${encodeURIComponent(token)}`,{raw:true});},
  async listResponses(token){return await req('GET',`/rest/v1/panel_responses?token=eq.${encodeURIComponent(token)}&select=id,submission_id,participant_id,answers,created_at&order=id.asc&limit=1000`)||[];}
 };
}

// ---------- answer validation and scoring ----------
// The same rules the database function enforces: four whole ratings 1 to 10 and one text of 1 to 1000 characters.
export function validAnswers(a){
 if(!a||typeof a!=='object'||Array.isArray(a))return false;
 if(Object.keys(a).length!==RATING_KEYS.length+1)return false;
 for(const k of RATING_KEYS)if(!Number.isInteger(a[k])||a[k]<1||a[k]>10)return false;
 return typeof a.improve==='string'&&a.improve.trim().length>=1&&a.improve.length<=1000;
}
export function scoreResponses(responses){
 const good=responses.filter(r=>validAnswers(r.answers));
 const n=good.length;
 if(!n)return {n:0,avg:{},mean:null,score:null};
 const avg=Object.fromEntries(RATING_KEYS.map(k=>[k,good.reduce((s,r)=>s+r.answers[k],0)/n]));
 const mean=RATING_KEYS.reduce((s,k)=>s+avg[k],0)/RATING_KEYS.length;
 return {n,avg,mean,score:Math.round(mean*10)};
}

// ---------- audience ----------
// Age band from the brand's own audience lines when they state one; otherwise 18 to 44.
export function ageBand(audience){
 const text=(Array.isArray(audience)?audience:[audience]).filter(Boolean).join(' ; ').toLowerCase();
 let m=text.match(/\b(1[89]|[2-6]\d)\s*(?:-|to|–|through)\s*(1[89]|[2-6]\d)\b/);
 if(m){const lo=Number(m[1]),hi=Number(m[2]);if(lo<hi)return {min:Math.max(18,lo),max:Math.min(99,hi),source:'audience'};}
 m=text.match(/\b(1[89]|[2-6]\d)\s*\+/);
 if(m)return {min:Math.max(18,Number(m[1])),max:DEFAULT_AGE.max>Number(m[1])?DEFAULT_AGE.max:Number(m[1])+20,source:'audience'};
 if(/\bgen\s*-?z\b|zoomer/.test(text))return {min:18,max:28,source:'audience'};
 if(/\bmillennial/.test(text))return {min:28,max:43,source:'audience'};
 if(/\bcollege|\bstudent|\bundergrad/.test(text))return {min:18,max:24,source:'audience'};
 if(/\bearly 20s|\b20s\b|twenty-?somethings/.test(text))return {min:20,max:29,source:'audience'};
 if(/\b30s\b|thirty-?somethings/.test(text))return {min:30,max:39,source:'audience'};
 return {...DEFAULT_AGE,source:'default'};
}
// Option ids of every household income bracket whose lower bound is at least the floor. Names look like "$100,000–$149,999", "$200,000+", "Under $30,000".
export function incomeOptionIds(options,floor=INCOME_FLOOR){
 return (options||[]).filter(o=>{
  const name=String(o.name||'');
  if(/under|below|less/i.test(name))return false;
  const lo=Number((name.match(/\$\s*([\d,]+)/)||[])[1]?.replace(/,/g,''));
  return Number.isFinite(lo)&&lo>=floor;
 }).map(o=>o.id);
}
const norm=s=>String(s||'').trim().toLowerCase();
// "New York City" or "Austin, TX" -> {stateId,cityId,state,city}, matched against Terac's own option lists. Nothing is invented.
export async function resolveGeo(terac,territory,country='US'){
 const text=String(territory||'').trim();if(!text)return null;
 const parts=text.split(',').map(s=>s.trim()).filter(Boolean);
 let state=null,city=null;
 const opts=async(slug,extra)=>{try{const r=await terac.filterOptions(slug,extra.search,extra.scope);return Array.isArray(r)?r:[];}catch{return [];}};
 if(parts[1]){
  const st=await opts('multi_select--state',{search:parts[1],scope:{country_id:country}});
  state=st.find(o=>norm(o.name)===norm(parts[1])||norm(o.id).endsWith(`-${norm(parts[1])}`))||null;
 }
 const cities=await opts('multi_select--city',{search:parts[0],scope:{country_id:country,...(state?{state_id:state.id}:{})}});
 const exact=cities.filter(o=>norm(o.name)===norm(parts[0]));
 if(exact.length>=1&&(state||exact.length===1))city=exact[0];
 if(city&&!state){
  const sid=String(city.id).split('-').slice(0,2).join('-');
  const st=await opts('multi_select--state',{search:'',scope:{country_id:country}});
  state=st.find(o=>o.id===sid)||{id:sid,name:sid.split('-')[1]};
 }
 if(!state){
  const st=await opts('multi_select--state',{search:parts[0],scope:{country_id:country}});
  state=st.find(o=>norm(o.name)===norm(parts[0]))||null;
 }
 if(!state&&!city)return null;
 return {stateId:state?.id||null,state:state?.name||null,cityId:city?.id||null,city:city?.name||null};
}

// ---------- the Terac draft ----------
export const SCREENER=[
 {key:'clothing_spend',text:'About how much do you spend on clothing in a typical month?',pick:'one',answers:[
  {text:'Under $50',qualify_logic:'reject'},{text:'$50 to $99',qualify_logic:'may'},{text:'$100 to $199',qualify_logic:'may'},{text:'$200 or more',qualify_logic:'may'},{text:'I do not buy my own clothing',qualify_logic:'reject'}]},
 {key:'shop_where',text:'Where do you usually buy clothes?',pick:'one',answers:[
  {text:'Online, on brand websites',qualify_logic:'may'},{text:'Online, on marketplaces or apps',qualify_logic:'may'},{text:'In stores',qualify_logic:'may'},{text:'Secondhand or thrift',qualify_logic:'may'},{text:'None of the above',qualify_logic:'reject'}]}
];
export const taskUrl=(base,token)=>`${String(base).replace(/\/$/,'')}/panel/?t=${token}`;
export function buildDraftArgs({projectId,token,participants,publicUrl,brand,renderId,age,geo,incomeIds,countryId='US'}){
 const filters=[{'integer--age':{$gte:age.min,$lte:age.max}},{'multi_select--country':{$in:[countryId]}}];
 if(geo?.stateId)filters.push({'multi_select--state':{$in:[geo.stateId]}});
 if(geo?.cityId)filters.push({'multi_select--city':{$in:[geo.cityId]}});
 filters.push({'multi_select--household_income':{$in:incomeIds}});
 return {
  title:'Rate a 5 second clothing ad (3 min)',
  internal_title:`Mint Labs panel: ${brand} (render #${renderId})`.slice(0,200),
  description:'Watch a 5 second video ad and read a 2 page offer from a clothing brand, then rate it in a short form. About 3 minutes. For adults who buy their own clothes.',
  project_id:projectId,num_participants:participants,business_type:'b2c',
  filters,
  tasks:[{sequence:1,task_type:'interview',
   // manual_review: Mint Labs approves only submissions that have a valid stored response, so nobody is paid for an empty visit.
   review_type:'manual_review',task_url:taskUrl(publicUrl,token),title:'Watch and rate the video',
   description:'Watch the 5 second video, open the 2 page offer, then answer five short questions.',duration_minutes:3}],
  screening_questions:SCREENER
 };
}
const money=v=>{const n=typeof v==='string'?Number(v.replace(/[^0-9.\-]/g,'')):Number(v);return Number.isFinite(n)?n:null;};
// Terac prices a draft as pricing:{cost_per_participant_cents,total_cost_cents,currency}. Null until its estimate lands.
export function readPricing(opp){
 const p=opp?.pricing||{};
 const cents=v=>{const n=Number(v);return Number.isFinite(n)&&v!==null&&v!==undefined&&v!==''?n/100:null;};
 const per=cents(p.cost_per_participant_cents),total=cents(p.total_cost_cents);
 return {per,total};
}

// ---------- the module ----------
export function createPanels({store,terac=createTerac(),supabase=createSupabase(),offerFor,env=process.env,pollMs=60000,log=()=>{},wait=ms=>new Promise(r=>setTimeout(r,ms))}={}){
 const publicUrl=()=>env.PANEL_PUBLIC_URL||DEFAULT_PUBLIC_URL;
 const launching=new Set(),syncing=new Set(),creating=new Set();
 let projectId=null;

 const pricing=opp=>readPricing(opp);
 const linksOf=opp=>opp?.links?.dashboard||opp?.dashboard||null;
 const applyOpp=(panel,opp)=>{
  const {per,total}=pricing(opp);
  const n=Number(opp?.num_participants)||panel.participants;
  return store.updatePanel(panel.id,{participants:n,price_per_participant:per??panel.price_per_participant,total_usd:total??panel.total_usd,links:linksOf(opp)||panel.links});
 };
 const publicPanel=p=>p&&{...p,configured:true};

 async function getProjectId(){
  if(projectId)return projectId;
  const r=await terac.call('terac_list_projects',{});
  const id=(r.json?.data||[])[0]?.id;
  if(!id)throw fail(502,'Terac has no project to file the panel under.');
  return projectId=id;
 }

 // Terac's price estimate can land a moment after the draft does. Re-reads the draft a few times until it carries a total.
 async function settle(oppId,opp){
  let cur=opp;
  for(let i=0;i<8&&pricing(cur).total==null;i++){await wait(i?3000:1500);cur=await terac.getOpportunity(oppId);}
  return cur;
 }

 async function createPanel({renderId,participants=DEFAULT_PARTICIPANTS}){
  const n=Number(participants);
  if(!Number.isInteger(n)||n<MIN_PARTICIPANTS||n>MAX_PARTICIPANTS)throw fail(400,`Pick ${MIN_PARTICIPANTS} to ${MAX_PARTICIPANTS} people.`);
  const render=store.getRender(Number(renderId));
  if(!render)throw fail(404,'No such render');
  if(render.status!=='completed'||!render.result_url)throw fail(409,'The human check needs a finished video with a link.');
  if(creating.has(render.id))throw fail(409,'A panel is already being set up for this video. Terac takes a few minutes.');
  const live=store.listPanels({renderId:render.id}).find(p=>p.status!=='failed');
  if(live)throw fail(409,'This video already has a human panel.');
  const lead=render.lead_id?store.getLead(render.lead_id):null;
  if(!lead)throw fail(409,'This video is not tied to a brand, so there is no offer PDF to show the panel.');
  if(!terac.enabled())throw fail(503,'Add TERAC_API_KEY first.');
  if(!supabase.enabled())throw fail(503,'The panel database is not set up. Run scripts/panel-supabase-setup.mjs.');
  const brand=lead.company||lead.domain;
  const token=randomBytes(16).toString('base64url');
  creating.add(render.id);
  try{
  // 1. offer PDF into the public bucket, then the panels row the task page reads
  const offer=await offerFor(lead,render);
  await supabase.uploadOffer(token,offer.bytes);
  await supabase.insertPanel({token,brand,clip_url:render.result_url,offer_pdf_url:supabase.offerUrl(token)});
  try{
   // 2. the Terac draft (free, nothing recruited)
   const age=ageBand(lead.brand_profile?.audience);
   const geo=await resolveGeo(terac,lead.territory);
   const incomeIds=incomeOptionIds(await terac.filterOptions('multi_select--household_income'));
   if(!incomeIds.length)throw Error('Terac returned no household income brackets at or above $100,000.');
   const countryId=((await terac.filterOptions('multi_select--country','United States'))||[]).find(o=>o.id==='US')?.id;
   if(!countryId)throw Error('Terac has no United States country option.');
   const args=buildDraftArgs({projectId:await getProjectId(),token,participants:n,publicUrl:publicUrl(),brand,renderId:render.id,age,geo,incomeIds,countryId});
   const opp=await terac.createOpportunity(args);
   const oppId=opp?.id||opp?.data?.id;
   if(!oppId)throw Error(`Terac did not return an opportunity id${opp?.text?`: ${String(opp.text).slice(0,160)}`:''}`);
   const priced=await settle(oppId,opp);
   const {per,total}=pricing(priced);
   const audience={country:'United States',state:geo?.state||null,city:geo?.city||null,age:`${age.min} to ${age.max}`,ageSource:age.source,income:'$100,000 a year or more',filters:args.filters};
   const panel=store.createPanel({renderId:render.id,token,opportunityId:oppId,participants:n,pricePerParticipant:per,totalUsd:total,links:linksOf(priced)||linksOf(opp),audience});
   return publicPanel(panel);
  }catch(e){
   try{await supabase.deletePanel(token);}catch{}
   throw e;
  }
  }finally{creating.delete(render.id);}
 }

 // Changes the head count on the draft (free) and reads the new price back.
 async function setParticipants(id,participants){
  const n=Number(participants);
  if(!Number.isInteger(n)||n<MIN_PARTICIPANTS||n>MAX_PARTICIPANTS)throw fail(400,`Pick ${MIN_PARTICIPANTS} to ${MAX_PARTICIPANTS} people.`);
  const panel=store.getPanel(id);if(!panel)throw fail(404,'No such panel');
  if(panel.status!=='draft')throw fail(409,'Only a draft can change its size.');
  await terac.call('terac_update_opportunity',{opportunityId:panel.opportunity_id,num_participants:n},120000);
  const opp=await terac.getOpportunity(panel.opportunity_id);
  store.updatePanel(id,{participants:n});
  return publicPanel(applyOpp(store.getPanel(id),opp));
 }

 // The only spend. Needs confirm:true, a draft, a known total and a balance that covers it.
 async function launchPanel(id,{confirm}={}){
  if(confirm!==true)throw fail(400,'Launching spends money. Send confirm:true from the Start button.');
  const panel=store.getPanel(id);if(!panel)throw fail(404,'No such panel');
  if(panel.status!=='draft')throw fail(409,'This panel was already launched.');
  if(launching.has(id))throw fail(409,'This panel is already launching.');
  launching.add(id);
  try{
   let total=panel.total_usd;
   const opp=await terac.getOpportunity(panel.opportunity_id);
   const status=String(opp?.status||'').toLowerCase();
   if(status&&status!=='draft')throw fail(409,`Terac says this opportunity is ${status}, not a draft.`);
   const fresh=applyOpp(store.getPanel(id),opp);total=fresh.total_usd;
   if(total==null)throw fail(409,'Terac has not priced this panel yet, so it was not launched.');
   const balance=await terac.balance();
   if(balance<total)throw fail(402,`The Terac balance is $${balance.toFixed(2)} and this panel costs $${Number(total).toFixed(2)}. Add credit first.`);
   await terac.launchDraft(panel.opportunity_id);
   let done=store.updatePanel(id,{status:'launched',error:null});
   // The launched study has its own dashboard links (submissions, recruitment). A failed read here must not hide that it launched.
   try{done=applyOpp(done,await terac.getOpportunity(panel.opportunity_id));}catch{}
   return publicPanel(done);
  }finally{launching.delete(id);}
 }

 // Reads the stored responses, pays (approves) only the submissions that have a valid one, and writes the score into the render.
 async function syncPanel(id){
  const panel=store.getPanel(id);if(!panel)throw fail(404,'No such panel');
  if(panel.status==='draft')return publicPanel(panel);
  if(syncing.has(id))return publicPanel(panel);
  syncing.add(id);
  try{
   const responses=await supabase.listResponses(panel.token);
   const valid=new Map(responses.filter(r=>validAnswers(r.answers)).map(r=>[String(r.submission_id),r]));
   let list=[];
   try{const r=await terac.listSubmissions(panel.opportunity_id,{limit:100});list=r?.data||[];}catch(e){log(`panel ${id}: submissions unavailable (${e.message})`);}
   let approved=list.filter(s=>s.status==='approved').length;
   for(const s of list){
    if(s.status!=='awaiting_review')continue;
    if(!valid.has(String(s.id)))continue; // no valid stored response: never approved
    try{await terac.approveSubmission(s.id);approved++;}catch(e){log(`panel ${id}: approve ${s.id} failed (${e.message})`);}
   }
   const scored=scoreResponses([...valid.values()]);
   const complete=scored.n>=panel.participants;
   const next={responses:scored.n,score:scored.score,status:complete?'complete':'launched',error:null};
   const updated=store.updatePanel(id,next);
   if(scored.n>0)writeCheck(updated,scored);
   return publicPanel(updated);
  }finally{syncing.delete(id);}
 }
 // Replaces this render's earlier Human panel entry and leaves every other checker as it was.
 function writeCheck(panel,scored){
  const render=store.getRender(panel.render_id);if(!render)return;
  const base=render.checks||{passed:true,results:[]};
  const entry={name:PANEL_CHECK_NAME,score:scored.score,summary:`${scored.n} ${scored.n===1?'person':'people'}, avg ${scored.mean.toFixed(1)}/10`,n:scored.n,panelId:panel.id,issues:[]};
  const results=[...(base.results||[]).filter(r=>r.name!==PANEL_CHECK_NAME),entry];
  store.updateRender(render.id,{checks:{...base,results}});
 }

 const active=()=>store.listPanels().filter(p=>p.status==='launched');
 let timer=null;
 async function tick(){for(const p of active()){try{await syncPanel(p.id);}catch(e){log(`panel ${p.id} sync failed: ${e.message}`);}}}
 function start(){if(timer)return;timer=setInterval(()=>{if(active().length)tick();},pollMs);timer.unref?.();}
 function stop(){if(timer)clearInterval(timer);timer=null;}

 return {createPanel,setParticipants,launchPanel,syncPanel,start,stop,tick,list:renderId=>store.listPanels(renderId?{renderId:Number(renderId)}:{}).map(publicPanel),get:id=>publicPanel(store.getPanel(id)),readiness:()=>({terac:terac.enabled(),database:supabase.enabled(),publicUrl:publicUrl()})};
}
