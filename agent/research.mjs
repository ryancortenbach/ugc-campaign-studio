import {z} from 'zod';
import {readFileSync} from 'node:fs';
import {structured,llmEnabled} from './tools/llm.mjs';
import {scrapeProductsDetailed,cachedProductImage,APPAREL_KINDS,productDir} from './tools/products.mjs';
import {fetchHomepage} from './tools/site.mjs';
import {cleanCopy} from './brain.mjs';
import {creativeResearchSchema,creativeResearchInstructions,normalizeCreativeResearch} from './creative-brief.mjs';

// Brand research for a lead: the real catalog (free public JSON) plus one low effort Sonnet call that turns the site text and product list
// into audience and style chips and picks the one product that should star in the video. Nothing here touches Higgsfield.
const profileSchema=z.object({audience:z.array(z.string()),style:z.array(z.string()),signature:z.array(z.string()),hero:z.object({productIndex:z.number().int(),why:z.string()}),research:creativeResearchSchema});
const chip=s=>cleanCopy(String(s||'')).replace(/\s+/g,' ').trim().slice(0,48);
const chips=(list,max)=>[...new Set((Array.isArray(list)?list:[]).map(chip).filter(Boolean))].slice(0,max);
const norm=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const usable=p=>Boolean(p&&p.imageUrl);

// The hero must be a real product with a photo. A model answer outside the list is clamped into it, and a non-apparel or photo-less pick
// is swapped for the first apparel product that has a photo.
export function pickHero(products,wanted){
 const list=Array.isArray(products)?products:[];
 if(!list.length)return null;
 let i=Number.isFinite(Number(wanted?.productIndex))?Math.round(Number(wanted.productIndex)):0;
 i=Math.min(list.length-1,Math.max(0,i));
 let why=cleanCopy(String(wanted?.why||'')).replace(/\s+/g,' ').trim().slice(0,240);
 const good=p=>usable(p)&&APPAREL_KINDS.includes(p.kind);
 if(!good(list[i])){
  const alt=list.findIndex(good),any=list.findIndex(usable);
  const next=alt>=0?alt:any>=0?any:i;
  if(next!==i){i=next;why='Closest apparel product with a clean photo in the catalog.';}
 }
 return {productIndex:i,why};
}

export async function profileBrand({company,website='',homeText='',products=[],evidence='',llm=structured}){
 const list=(Array.isArray(products)?products:[]).slice(0,24);
 const system=`You profile a clothing brand for a short personalized UGC video pitch. Use ONLY facts in the site text, notes and product list you are given. Never invent claims, customers, locations, press or numbers. audience: 3 to 5 short chips (under 5 words each) naming who wears this, such as an age band, a city or a scene, only when the inputs support it. style: 3 to 5 short chips on the look and tone (fabrics, silhouettes, mood). signature: up to 4 product names that define the brand, copied exactly from the product list. hero: the productIndex of the single product that should star in a 5 second clip, an item of apparel worn on a person with a clean product photo, preferring a signature piece, and one sentence on why. If there are no products, use productIndex 0. No em dashes.`;
 const out=await llm({role:'main',effort:'medium',schema:profileSchema,system:system+' '+creativeResearchInstructions,prompt:JSON.stringify({brand:company,website,notes:evidence||null,siteText:String(homeText||'').slice(0,12000),products:list.map((p,index)=>({productIndex:index,title:p.title,url:p.url||null,kind:p.kind,price:p.price||null}))})});
 const d=out.data;
 const titles=list.map(p=>p.title);
 // Signature names must be real product titles. Close matches snap to the exact title; anything else is dropped.
 const signature=[...new Set((d.signature||[]).map(s=>{const n=norm(s);return titles.find(t=>norm(t)===n)||titles.find(t=>n&&(norm(t).includes(n)||n.includes(norm(t))))||null;}).filter(Boolean))].slice(0,4);
 return {audience:chips(d.audience,5),style:chips(d.style,5),signature,hero:pickHero(list,d.hero),...(d.research?{research:normalizeCreativeResearch(d.research,[website,...list.map(p=>p.url)]),researchModel:out.model}:{}),cost:out.cost||0,model:out.model};
}

const active=new Set();
export const isResearching=id=>active.has(Number(id));

// Scrape the catalog, then profile the brand, then save both on the lead. `spend(usd,provider,note)` records every cost, `log(type,title,extra)` writes events.
// homeText comes from the runner's visit; the route variant fetches the homepage itself. Never throws for a missing catalog: the lead just keeps products [].
export async function researchLead({store,lead,spend=()=>{},log=()=>{},homeText=null,deps={}}){
 if(active.has(lead.id))throw Object.assign(Error('Research is already running for this lead.'),{status:409});
 active.add(lead.id);
 const scrape=deps.scrape||scrapeProductsDetailed,profiler=deps.profile||profileBrand,fetchHome=deps.fetchHome||fetchHomepage;
 const company=lead.company||lead.domain;
 try{
  log('tool_call',`Reading the product catalog for ${company}`,{tool:'shopify.products'});
  let scraped;
  try{scraped=await scrape({domain:lead.domain,url:lead.url,leadId:lead.id});}
  catch(e){log('error',`Could not read products for ${company}: ${e.message}`,{tool:'shopify.products'});scraped={products:[],source:'none',cost:0};}
  if(scraped.cost)spend(scraped.cost,'claude',`product kinds for ${company}`);
  const products=scraped.products||[];
  store.updateLead(lead.id,{products});
  const counts={};for(const p of products)counts[p.kind]=(counts[p.kind]||0)+1;
  log('tool_result',products.length?`Found ${products.length} product(s) for ${company} via ${scraped.source}: ${Object.entries(counts).map(([k,n])=>`${n} ${k}`).join(', ')}`:`No product catalog found for ${company}`,{tool:'shopify.products',data:{source:scraped.source,count:products.length,kinds:counts,products:products.map(p=>({title:p.title,kind:p.kind,price:p.price}))}});
  let text=homeText;
  if(text==null){try{text=(await fetchHome(lead.url||`https://${lead.domain}/`)).text||'';}catch{text='';}}
  if(!llmEnabled()&&!deps.profile){log('decision',`Brand profile skipped for ${company}: Claude is not configured`,{tool:'claude.profile'});return {products,profile:null};}
  log('tool_call',`Profiling ${company}: audience, style and hero product`,{tool:'claude.profile'});
  let profile=null;
  try{
   const out=await profiler({company,website:lead.url,homeText:text,products,evidence:[lead.evidence,lead.notes].filter(Boolean).join('\n')});
   spend(out.cost,'claude',`brand profile for ${company}`);
   const {cost,model,...rest}=out;profile=rest;
   store.updateLead(lead.id,{brand_profile:profile});
   const hero=profile.hero&&products[profile.hero.productIndex];
   log('tool_result',`Profile for ${company}: ${profile.audience.join(', ')||'no audience found'}${hero?`. Hero product: ${hero.title}`:''}`,{tool:`claude.profile (${model||'sonnet'})`,data:profile});
  }catch(e){log('error',`Brand profile failed for ${company}: ${e.message}`,{tool:'claude.profile'});}
  return {products,profile};
 }finally{active.delete(lead.id);}
}

// Route tuples in the same [method,regex,handler] shape as server.mjs. Pass the server's Raw class so the image route can answer with bytes.
export function researchRoutes({store,Raw,spend:spendFor,deps={},dir=productDir,start=p=>{p.catch(()=>{});}}){
 const notFound=m=>Object.assign(Error(m),{status:404});
 const ledger=lead=>spendFor?spendFor(lead):(usd,provider,note)=>{if(!usd)return;if(lead.task_id)store.addCost(lead.task_id,usd);store.addSpend({provider,usd,taskId:lead.task_id||null,note});};
 return [
  ['POST',/^\/api\/leads\/(\d+)\/research$/,m=>{
   const lead=store.getLead(Number(m[1]));if(!lead)throw notFound('No such lead');
   if(isResearching(lead.id))throw Object.assign(Error('Research is already running for this lead.'),{status:409});
   const log=(type,title,extra={})=>store.addEvent({taskId:lead.task_id,leadId:lead.id,type,title,...extra});
   start(researchLead({store,lead,spend:ledger(lead),log,deps}));
   return {started:true,lead:store.getLead(lead.id)};
  }],
  ['GET',/^\/api\/leads\/(\d+)\/products\/(\d+)\/image$/,m=>{
   const lead=store.getLead(Number(m[1]));if(!lead)throw notFound('No such lead');
   const n=Number(m[2]);if(!Array.isArray(lead.products)||!lead.products[n])throw notFound('No such product');
   const hit=cachedProductImage(lead.id,n,dir);if(!hit)throw notFound('No cached image for this product');
   if(!Raw)throw Error('Image route needs the server Raw class');
   return new Raw(hit.type,readFileSync(hit.file),{'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; sandbox"});
  }]
 ];
}
