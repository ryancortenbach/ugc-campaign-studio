import {reviseUntilPassed,assertRevisionWorkAllowed} from './revision-harness.mjs';
// Watches Mint Labs purchases on Whop (read only) and starts the work for each new paid order: find the brand, research it,
// draft and check a storyboard, approve it, check every shot and price it. It stops at checks_passed. It never calls
// Higgsfield's submit, never emails or messages the buyer, and never writes to Whop. Rendering waits for Ryan's click.
import {z} from 'zod';
import path from 'node:path';
import * as whopApi from './tools/whop.mjs';
import {searchBrands} from './tools/exa.mjs';
import {visitSite,siteMode} from './tools/site.mjs';
import * as boards from './storyboard.mjs';
import * as hf from './tools/higgsfield.mjs';
import {structured,llmEnabled} from './tools/llm.mjs';
import {companyFrom} from './quality.mjs';
import {dataDir} from './store.mjs';
import {creativeResearchSchema,creativeResearchInstructions,normalizeCreativeResearch} from './creative-brief.mjs';
import {scrapeProductsDetailed} from './tools/products.mjs';
import {saveUpload} from './tools/uploads.mjs';
import {readFileSync} from 'node:fs';

const SOLARI_USD_PER_MS=0.10/3600000;
const FREE_MAIL=new Set(['gmail.com','googlemail.com','outlook.com','hotmail.com','live.com','msn.com','yahoo.com','ymail.com','rocketmail.com','icloud.com','me.com','mac.com','aol.com','proton.me','protonmail.com','pm.me','gmx.com','gmx.net','mail.com','zoho.com','hey.com','fastmail.com','duck.com','hushmail.com','qq.com','163.com','126.com','yandex.com','comcast.net','verizon.net','att.net','sbcglobal.net','bellsouth.net','cox.net']);
const NOT_A_BRAND=/(^|\.)(instagram|facebook|fb|tiktok|youtube|youtu|twitter|x|linkedin|pinterest|reddit|snapchat|threads|whop|linktr|linktree|beacons|carrd|notion|google|github|medium|substack|wikipedia|crunchbase|amazon|etsy|ebay|walmart|target|yelp|forbes|vogue)\.[a-z.]+$/;
const FIELD_HINT=/web|site|url|link|brand|company|business|store|shop|domain/i;

export function domainFrom(text){
 let s=String(text??'').trim().toLowerCase();if(!s)return null;
 s=s.replace(/^mailto:/,'');if(s.includes('@')&&!s.includes('/'))s=s.split('@').pop();
 const m=s.match(/^(?:https?:\/\/)?(?:www\.)?([a-z0-9][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)*\.[a-z]{2,})(?::\d+)?(?:[/?#].*)?$/);
 return m?m[1]:null;
}
export const brandDomain=text=>{const d=domainFrom(text);return d&&!FREE_MAIL.has(d)&&!/\.edu$/.test(d)&&!NOT_A_BRAND.test(d)?d:null;};

// Brand lookup order: a checkout answer that looks like a website or brand, the buyer's email domain unless it is free mail,
// then an Exa search on the company answer or a two word buyer name. Returns null when nothing is solid.
export async function identifyBrand({buyer,search}){
 const fields=buyer.fields||[];
 for(const f of fields.filter(f=>FIELD_HINT.test(f.question)))if(brandDomain(f.answer))return {domain:brandDomain(f.answer),source:`checkout field "${f.question}"`,costUsd:0};
 for(const f of fields)if(brandDomain(f.answer))return {domain:brandDomain(f.answer),source:`checkout field "${f.question}"`,costUsd:0};
 const mailDomain=String(buyer.email||'').split('@')[1]?.toLowerCase();
 if(mailDomain&&brandDomain(mailDomain))return {domain:mailDomain,source:'buyer email domain',costUsd:0};
 const company=fields.find(f=>FIELD_HINT.test(f.question)&&f.answer&&!brandDomain(f.answer))?.answer;
 const named=String(buyer.name||'').trim().split(/\s+/).filter(Boolean).length>=2?buyer.name.trim():null;
 const who=company||named;
 if(who&&search){
  const found=await search(`${who} brand official website`);
  for(const r of found.results||[]){let host;try{host=new URL(r.url).hostname.replace(/^www\./,'').toLowerCase();}catch{continue;}if(brandDomain(host))return {domain:host,source:`Exa search for "${who}"`,costUsd:found.costUsd||0};}
  return {domain:null,source:null,costUsd:found.costUsd||0};
 }
 return null;
}

const briefSchema=z.object({product:z.string(),audience:z.string(),idea:z.string(),offer:z.string(),identity:z.string(),wardrobe:z.string(),environment:z.string(),voice:z.string(),research:creativeResearchSchema});
async function makeBrief({brand,domain,purchased,homeText,evidence,products=[]}){
 const out=await structured({role:'main',effort:'medium',schema:briefSchema,maxTokens:6000,system:`A brand bought a short AI-made UGC video from Mint Labs. Write the brief for a 15 second vertical UGC-style video ad for THEIR product. Use only facts found in the site text and search evidence provided. Never invent product claims, prices, results, reviews or guarantees. product: what they sell, in one sentence. audience: who it is for. idea: one simple video concept a single original creator can act out. offer: only an offer the site itself states, else an empty string. identity, wardrobe, environment, voice: specific locks, each under 40 words, for one original character who is not a real person. No em dashes. ${creativeResearchInstructions}`,prompt:JSON.stringify({brand,domain,purchasedFromMintLabs:purchased,siteText:String(homeText||'').slice(0,12000),evidence:(evidence||[]).slice(0,8),products:products.map(p=>({title:p.title,url:p.url,imageUrl:p.imageUrl,kind:p.kind}))})});
 return {brief:out.data,cost:out.cost,model:out.model};
}
async function clientCatalog({domain,taskId}){
 const dir=path.join(dataDir,'client-products'),result=await scrapeProductsDetailed({domain,leadId:taskId,dir,enabled:()=>false});
 const products=[];
 for(const product of (result.products||[]).slice(0,12)){
  const p={...product};
  if(/^\d+\.(png|jpg|webp|gif)$/.test(p.image||''))try{const ext=path.extname(p.image).slice(1),mime={png:'image/png',jpg:'image/jpeg',webp:'image/webp',gif:'image/gif'}[ext],bytes=readFileSync(path.join(dir,String(Number(taskId)),p.image));const uploaded=saveUpload({name:p.title,type:mime,data:bytes.toString('base64')});p.referenceUrl=`/uploads/${uploaded.file}`;}catch{}
  if(/^\d+\.avif$/.test(p.image||''))p.referenceUrl=`/api/tasks/${Number(taskId)}/products/${Number(p.image.split('.')[0])}/image`;
  products.push(p);
 }
 return {products,source:result.source};
}
export const realWhopTools={catalog:clientCatalog,visit:visitSite,siteMode,search:q=>searchBrands(q,{numResults:5}),llmEnabled,makeBrief,draft:boards.draftStoryboard,check:boards.checkStoryboard,revise:boards.reviseStoryboard,shots:hf.shotsFromStoryboard,endpoint:hf.endpoints['text-to-video'],runCheckers:hf.runCheckers,reviseShot:hf.reviseShot,estimate:hf.estimate,priceFrom:hf.priceFrom,higgsfieldEnabled:hf.higgsfieldEnabled};

const money=n=>Number(n).toFixed(2);

export function createWhopWatch({store,runner,tools={},whop=whopApi,now=()=>new Date(),intervalMs=60000}={}){
 const db=store.db,T={...realWhopTools,...tools};
 db.exec('create table if not exists settings(key text primary key, value text)');
 db.exec('create table if not exists whop_orders(payment_id text primary key,status text,substatus text,amount real,currency text,product text,buyer_email text,buyer_name text,brand_domain text,brand_source text,task_id integer,storyboard_id integer,render_ids text,shots integer,estimate_usd real,state text not null,error text,payment text,payment_at text,created_at text not null,updated_at text not null)');
 const read=key=>{const r=db.prepare('select value from settings where key=?').get(key);if(!r)return undefined;try{return JSON.parse(r.value);}catch{return undefined;}};
 const write=(key,value)=>db.prepare('insert into settings(key,value) values(?,?) on conflict(key) do update set value=excluded.value').run(key,JSON.stringify(value));
 const enabled=()=>read('whop_enabled')??whop.whopEnabled();
 const iso=()=>new Date(now()).toISOString();
 const shotDir=path.join(dataDir,'shots');
 const active=new Map();
 let timer=null,polling=false,last='idle',cancelEpoch=0;

 const order=id=>{const r=db.prepare('select * from whop_orders where payment_id=?').get(id);return r&&{...r,render_ids:r.render_ids?JSON.parse(r.render_ids):[],payment:r.payment?JSON.parse(r.payment):null};};
 const upd=(id,fields)=>{const cols=Object.keys(fields);db.prepare(`update whop_orders set ${cols.map(c=>`${c}=?`).join(',')},updated_at=? where payment_id=?`).run(...cols.map(c=>c==='render_ids'||c==='payment'?JSON.stringify(fields[c]):fields[c]),iso(),id);const o=order(id);store.bus.emit('change',{kind:'whop',order:o});return o;};
 const insert=(p,state)=>{const at=iso();return Number(db.prepare('insert or ignore into whop_orders(payment_id,status,substatus,amount,currency,product,buyer_email,buyer_name,state,payment,payment_at,created_at,updated_at) values(?,?,?,?,?,?,?,?,?,?,?,?,?)').run(p.id,p.status,p.substatus,p.amount,p.currency,p.product,p.email,p.name,state,JSON.stringify(p),p.createdAt,at,at).changes)===1;};

 async function baseline(){
  const all=[];let after;
  for(let i=0;i<200;i++){const page=await whop.listPayments({after});all.push(...page.payments);if(!page.next)break;after=page.next;}
  db.exec('begin');
  try{for(const p of all)insert(p,'historical');db.exec('commit');}catch(e){db.exec('rollback');throw e;}
  write('whop_baselined_at',iso());write('whop_baseline_count',all.length);
  return all.length;
 }

 function failOrder(id,error){
  const o=order(id);if(error.cost>0){if(o?.task_id)store.addCost(o.task_id,error.cost);store.addSpend({provider:'claude',usd:error.cost,taskId:o?.task_id||null,note:'interrupted storyboard formatting repairs'});}upd(id,{state:'failed',error:error.message});
  if(o?.task_id){store.updateTask(o.task_id,{status:error.code==='work_stopped'?'stopped':'failed',summary:error.message});store.addEvent({taskId:o.task_id,type:'error',tool:'whop',title:`Order failed: ${error.message}`});}
 }

 async function run(pid){
  const epoch=cancelEpoch;
  const ensure=()=>{assertRevisionWorkAllowed(store);if(epoch!==cancelEpoch)throw Object.assign(Error('Stopped by operator. Saved work is retained.'),{code:'work_stopped'});};
  ensure();
  let o=order(pid);
  const p=o.payment||{};
  let task=o.task_id?store.getTask(o.task_id):null;
  const brandLabel=o.brand_domain||o.buyer_name||'unknown brand';
  if(!task){task=store.createTask(`Whop order: ${o.product} from ${brandLabel}`);}
  const taskId=task.id;
  upd(pid,{state:'working',error:null,task_id:taskId});
  store.updateTask(taskId,{status:'running',summary:null});
  const log=(type,title,extra={})=>store.addEvent({taskId,type,title,tool:'whop',...extra});
  const spend=(usd,provider,note,extra={})=>{if(usd>0){store.addCost(taskId,usd);store.addSpend({provider,usd,taskId,note,...extra});}};
  log('status',`Whop payment ${pid}: ${o.product}, $${money(o.amount)} ${String(o.currency).toUpperCase()}, buyer ${o.buyer_name||'unnamed'}${o.buyer_email?` (${o.buyer_email.split('@')[1]})`:''}. Read only: nothing is written to Whop and the buyer is never contacted.`);

  // 1. Brand
  if(!o.brand_domain){
   log('tool_call','Identifying the brand',{tool:'whop.brand'});
   const buyer=await whop.buyerInfo({...p,email:o.buyer_email,name:o.buyer_name});
   if(buyer.fields.length)log('tool_result',`Checkout answers: ${buyer.fields.map(f=>`${f.question}: ${f.answer}`).join('; ').slice(0,400)}`,{tool:'whop.members'});
   let hit=null;
   try{hit=await identifyBrand({buyer:{...buyer,email:buyer.email||o.buyer_email},search:q=>{ensure();return T.search(q);}});}
   catch(e){log('error',`Exa search for the brand failed: ${e.message}`,{tool:'exa'});}
   if(hit?.costUsd)spend(hit.costUsd,'exa','whop brand lookup');
   if(!hit?.domain){
    upd(pid,{state:'needs_brand'});
    store.updateTask(taskId,{status:'paused',summary:'Needs a brand domain. Set it on the Whop order to continue.'});
    log('decision',`Could not identify the brand for ${o.buyer_name||'this buyer'}: no website answer, and the email is ${buyer.email?'free mail':'missing'}. Set the brand domain on this order and the work continues.`,{tool:'whop.brand'});
    return;
   }
   o=upd(pid,{brand_domain:hit.domain,brand_source:hit.source});
  }
  log('decision',`Brand: ${o.brand_domain} (identified from ${o.brand_source||'the buyer'})`,{tool:'whop.brand'});
  if(!T.llmEnabled())throw Error('Storyboards need ANTHROPIC_API_KEY');

  // 2. Research
  const domain=o.brand_domain,home=`https://${domain}/`;
  log('tool_call',`Visiting ${home}`,{tool:T.siteMode()==='solari'?'solari.browser':'fetch'});
  ensure();
  const started=Date.now();let visit;
  try{visit=await T.visit(home,{shotDir});}
  catch(e){
   upd(pid,{state:'needs_brand',error:`Could not load ${domain}: ${e.message}`});
   store.updateTask(taskId,{status:'paused',summary:`Could not load ${domain}. Set the right brand domain to continue.`});
   log('error',`Could not load ${domain}: ${e.message}. Set the correct brand domain on this order and the work continues.`,{tool:'whop.brand'});
   return;
  }
  if(visit.via==='solari.browser')spend((Date.now()-started)*SOLARI_USD_PER_MS,'solari','whop brand visit');
  const company=companyFrom(visit.pages?.[0]?.title,domain);
  store.updateTask(taskId,{prompt:`Whop order: ${o.product} from ${company} (${domain})`});
  log('tool_result',`Loaded ${domain}: ${visit.pages?.length||0} page(s), ${(visit.homeText||'').length} characters of homepage text`,{tool:visit.via,data:{pages:visit.pages,socials:visit.socials}});
  let evidence=[];
  try{
   log('tool_call',`Searching for evidence about ${company}`,{tool:'exa'});
  ensure();
   const found=await T.search(`${company} ${domain} products brand`);spend(found.costUsd||0,'exa','whop brand evidence');
   evidence=(found.results||[]).slice(0,5).map(r=>({title:r.title,url:r.url,text:(r.text||'').slice(0,500)}));
   log('tool_result',`Exa returned ${(found.results||[]).length} pages`,{tool:found.via||'exa',data:{results:evidence.map(r=>({title:r.title,url:r.url}))}});
  }catch(e){log('error',`Exa evidence search failed: ${e.message}. Continuing with the site alone.`,{tool:'exa'});}

  // Preserve product references on this client task, independently of the outreach CRM.
  let products=[];
  log('tool_call','Reading product references',{tool:'catalog.public'});
  try{const catalog=await T.catalog({domain,taskId});products=catalog.products||[];log('tool_result',`Saved ${products.length} product references`,{tool:'catalog.public',data:{source:catalog.source,products:products.map(p=>({title:p.title,url:p.url,referenceUrl:p.referenceUrl||null}))}});}
  catch(error){log('error',`Product references unavailable: ${error.message}`,{tool:'catalog.public'});}
  store.updateTask(taskId,{plan:{...(store.getTask(taskId).plan||{}),kind:'client_project',brand:company,domain,productReferences:products,researchSources:evidence}});

  // 3. Storyboard
  log('tool_call','Writing the brief',{tool:'claude.brief'});
  ensure();
  const made=await T.makeBrief({brand:company,domain,purchased:o.product,homeText:visit.homeText,evidence,products});spend(made.cost,'claude','whop brief');
  const {research,...simpleBrief}=made.brief;
  const brief=Object.fromEntries(Object.entries({...simpleBrief,length:'15'}).map(([k,v])=>[k,String(v??'').slice(0,2000).trim()]).filter(([,v])=>v));
  if(!brief.product||!brief.idea)throw Error('The brief had no product or idea');
  Object.assign(brief,{brand:company,domain,purchased:o.product,source:'whop'});
  store.updateTask(taskId,{plan:{...(store.getTask(taskId).plan||{}),kind:'client_project',brand:company,domain,brief,creativeBrief:normalizeCreativeResearch(research,[`https://${domain}/`,...evidence.map(e=>e.url),...products.map(p=>p.url)]),researchModel:made.model||null,researchSources:evidence}});
  log('tool_call','Drafting the storyboard',{tool:'claude.storyboard'});
  ensure();
  const drafted=await T.draft(brief,{checkpoint:async()=>ensure()});
  let sb=store.createStoryboard({title:drafted.plan.title||`${company} UGC video`,brief,plan:drafted.plan,cost:drafted.cost});
  spend(drafted.cost,'claude','whop storyboard draft',{storyboardId:sb.id});
  upd(pid,{storyboard_id:sb.id});
  await reviseUntilPassed({candidate:sb,checkpoint:async()=>ensure(),
   check:async candidate=>{store.updateStoryboard(candidate.id,{status:'checking'});const checks=await T.check(candidate.plan);spend(checks.cost,'claude','whop storyboard checkers',{storyboardId:candidate.id});return checks;},
   onChecked:async(candidate,checks)=>{sb=store.updateStoryboard(candidate.id,{status:checks.passed?'checks_passed':'checks_failed',checks},checks.cost);log('tool_result',`Storyboard v${sb.version} ${checks.passed?'passed':'did not pass'} the checkers: ${checks.results.map(r=>`${r.name} ${r.score}`).join(', ')}`,{tool:'claude.check',data:{storyboardId:sb.id}});},
   onRevision:async(candidate,checks,revision)=>log('tool_call',`Revising the storyboard from the checker notes (revision ${revision})`,{tool:'claude.revise'}),
   revise:async(candidate,checks)=>{const rev=await T.revise(candidate.plan,checks,'',{checkpoint:async()=>ensure()});sb=store.createStoryboard({title:candidate.title,brief,plan:rev.plan,version:candidate.version+1,parentId:candidate.id,cost:rev.cost});spend(rev.cost,'claude','whop storyboard revision',{storyboardId:sb.id});upd(pid,{storyboard_id:sb.id});return sb;}
  });

  // 4. Approve the storyboard exactly like the approve route: its shots become renders, still unsubmitted.
  ensure();
  const shots=T.shots({brief:{brand:`${sb.title} v${sb.version}`},storyboard:sb.plan});
  const renders=shots.map(x=>store.createRender({title:x.title,endpoint:T.endpoint,input:x.input,group:x.group,shotId:x.shotId,storyboardId:sb.id}));
  store.updateStoryboard(sb.id,{status:'approved'});
  upd(pid,{render_ids:renders.map(r=>r.id),shots:renders.length});
  log('decision',`Storyboard v${sb.version} passed. Approved it: ${renders.length} shot(s) added to Renders.`,{tool:'whop.storyboard'});

  // 5. Check and price every shot. Nothing is submitted.
  let total=0,priced=0,ready=0;
  for(const r of renders){
   const reviewed=await reviseUntilPassed({candidate:r.input,checkpoint:async()=>ensure(),
    check:async input=>{store.updateRender(r.id,{status:'checking',input});const checks=await T.runCheckers({title:r.title,input});spend(checks.cost,'claude','whop shot checkers',{renderId:r.id});return checks;},
    onChecked:async(input,checks,revision)=>{store.updateRender(r.id,{checks});log('tool_result',`Shot review ${revision}: ${checks.passed?'passed':'applying feedback'}`,{tool:'claude.check',data:{renderId:r.id,revision,checks}});},
    onRevision:async(input,checks,revision)=>log('tool_call',`Revising ${r.title} from checker feedback (revision ${revision})`,{tool:'claude.revise',data:{renderId:r.id,revision}}),
    revise:async(input,checks)=>{const next=await T.reviseShot({title:r.title,input,checks});spend(next.cost,'claude','whop shot revision',{renderId:r.id});store.updateRender(r.id,{input:next.input,status:'checking'});return next.input;}
   });
   const checks=reviewed.checks;r.input=reviewed.candidate;
   let estimate=null,error=null;
   if(checks.passed&&T.higgsfieldEnabled()){try{const e=await T.estimate(r.endpoint,r.input);estimate=T.priceFrom(e,r.input);if(!estimate)error='Higgsfield returned no usable price for this resolution';}catch(e){error=e.message;}}
   store.updateRender(r.id,{status:checks.passed?'checks_passed':'checks_failed',checks,estimate_usd:estimate,error});
   if(checks.passed)ready++;
   if(estimate){total+=Number(estimate);priced++;}
  }
  upd(pid,{estimate_usd:total});
  const allReady=ready===renders.length;
  upd(pid,{state:allReady?'ready':'review'});
  const line=allReady?`Ready for your approval: ${renders.length} shots, about $${money(total)} total${priced<renders.length?` (${renders.length-priced} shot(s) without a price yet)`:''}`:`${ready} of ${renders.length} shots passed their checks, about $${money(total)} for those. Open Renders to review the rest.`;
  store.updateTask(taskId,{status:'done',summary:line});
  log('done',line,{tool:'whop',data:{storyboardId:sb.id,renderIds:renders.map(r=>r.id),estimateUsd:total}});
 }

 function launch(pid){
  if(active.has(pid))return active.get(pid);
  const p=run(pid).catch(e=>failOrder(pid,e)).finally(()=>active.delete(pid));
  active.set(pid,p);return p;
 }

 async function poll(){
  if(!enabled())return last='off';
  if(!read('whop_baselined_at')){const n=await baseline();return last=`baselined ${n}`;}
  const {payments}=await whop.listPayments();
  let n=0;
  for(const p of payments.slice().reverse()){
   if(!p.paid||order(p.id))continue;
   if(!insert(p,'working'))continue;
   launch(p.id);n++;
  }
  return last=n?`started ${n}`:'watching';
 }
 async function safePoll(){if(polling)return;polling=true;try{await poll();}catch(e){last=`error: ${e.message}`;}finally{polling=false;}}

 const counts=()=>Object.fromEntries(db.prepare('select state,count(*) n from whop_orders group by state').all().map(r=>[r.state,r.n]));
 const total=()=>db.prepare('select count(*) n from whop_orders').get().n;

 return {
  async tick(){const r=await poll();await Promise.all([...active.values()]);return r;},
  start(){
   if(timer)return this;
   for(const r of db.prepare("select payment_id,task_id from whop_orders where state='working'").all())if(!active.has(r.payment_id))failOrder(r.payment_id,Error('Interrupted by a restart. Click Run on the order to start it again.'));
   timer=setInterval(safePoll,intervalMs);timer.unref?.();safePoll();return this;
  },
  stop(){cancelEpoch++;if(timer){clearInterval(timer);timer=null;}},
  idle:()=>Promise.all([...active.values()]),
  summary(){return {enabled:enabled(),orders:total(),working:active.size};},
  get(){
   const at=read('whop_baselined_at')||null;
   return {enabled:enabled(),configured:whop.whopEnabled(),state:last,baseline:{done:Boolean(at),at,count:read('whop_baseline_count')??0},counts:counts(),total:total(),
    orders:db.prepare("select payment_id,status,substatus,amount,currency,product,buyer_email,buyer_name,brand_domain,brand_source,task_id,storyboard_id,render_ids,shots,estimate_usd,state,error,payment_at,created_at,updated_at from whop_orders order by coalesce(payment_at,created_at) desc limit 30").all().map(r=>({...r,render_ids:r.render_ids?JSON.parse(r.render_ids):[]}))};
  },
  set(patch={}){
   if('enabled' in patch){if(!patch.enabled)cancelEpoch++;write('whop_enabled',Boolean(patch.enabled));if(patch.enabled&&timer)safePoll();}
   return this.get();
  },
  order,
  // Ryan's brand correction for an order that stopped at needs_brand. Work continues in the background.
  setBrand(pid,input){
   const o=order(pid);
   if(!o)throw Object.assign(Error('No such Whop order'),{status:404});
   if(o.state!=='needs_brand')throw Object.assign(Error('This order is not waiting for a brand.'),{status:409});
   const domain=brandDomain(input);
   if(!domain)throw Object.assign(Error('Enter the brand website, like brand.com. Free mail and social sites do not count.'),{status:400});
   upd(pid,{brand_domain:domain,brand_source:'you set it',error:null});launch(pid);
   return order(pid);
  },
  // Starts work on an order that was baselined or failed. Only ever called from Ryan's click.
  runOrder(pid){
   const o=order(pid);
   if(!o)throw Object.assign(Error('No such Whop order'),{status:404});
   if(!['historical','failed','checks_failed'].includes(o.state))throw Object.assign(Error(`This order is ${o.state}.`),{status:409});
   if(!o.payment?.paid)throw Object.assign(Error('That payment was not a completed, unrefunded payment.'),{status:409});
   upd(pid,{state:'working',error:null,task_id:null,storyboard_id:null,render_ids:[],shots:null,estimate_usd:null});launch(pid);
   return order(pid);
  }
 };
}
