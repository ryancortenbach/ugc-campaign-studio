import {z} from 'zod';
import {mkdirSync,writeFileSync,readdirSync} from 'node:fs';
import path from 'node:path';
import {publicHttp} from '../logo.mjs';
import {fetchHomepage} from './site.mjs';
import {structured,llmEnabled} from './llm.mjs';
import {dataDir} from '../store.mjs';

// Reads a brand's real catalog so the outreach video can show its actual clothes. Order: Shopify products.json, Shopify
// collections/all, Squarespace commerce JSON, then the homepage's own product links and og:image. Nothing here costs money
// except the optional Haiku call for titles the keyword rules cannot place.
export const MAX_PRODUCTS=24,MAX_IMAGE_BYTES=1572864,FETCH_TIMEOUT_MS=15000;
export const KINDS=['top','bottom','outerwear','footwear','headwear','accessory','other'];
export const APPAREL_KINDS=['top','bottom','outerwear','footwear','headwear'];
export const productDir=path.join(dataDir,'products');
const UA='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const imageExts={'image/png':'png','image/jpeg':'jpg','image/jpg':'jpg','image/webp':'webp','image/gif':'gif','image/avif':'avif'};
export const imageTypes={png:'image/png',jpg:'image/jpeg',webp:'image/webp',gif:'image/gif',avif:'image/avif'};

// Keyword rules. The first pattern list that matches a field wins, checked in this order, so "shirt jacket" is outerwear and "hat" never reads as a top.
const RULES=[
 ['other',/\bgift\s*cards?\b|\be-?gift\b|\bsample\b|\bshipping\b|\binsurance\b|\bwarranty\b/],
 ['footwear',/\b(shoes?|sneakers?|boots?|sandals?|slides?|loafers?|clogs?|trainers?|heels?|flats|moccasins?|slippers?|footwear)\b/],
 ['headwear',/\b(hats?|caps?|beanies?|visors?|bucket|trucker|snapback|dad hat|headwear|balaclava|beret)\b/],
 ['outerwear',/\b(jackets?|coats?|parkas?|puffers?|windbreakers?|bombers?|anoraks?|vests?|gilets?|fleece|blazers?|overcoats?|trench|outerwear|shackets?|raincoat|cardigans?)\b/],
 ['bottom',/\b(pants?|jeans?|trousers?|shorts?|skirts?|leggings?|joggers?|sweatpants?|chinos?|cargos?|bottoms?|denim pants|overalls?|bibs?)\b/],
 ['top',/\b(t-?shirts?|tees?|shirts?|tops?|tanks?|polos?|henleys?|sweaters?|knits?|hoodies?|sweatshirts?|crewnecks?|pullovers?|jerseys?|blouses?|longsleeves?|long sleeves?|turtlenecks?|bodysuits?|overshirts?|button-?ups?|tunics?|camis?)\b/],
 ['accessory',/\b(bags?|totes?|backpacks?|belts?|scarf|scarves|gloves?|socks?|wallets?|sunglasses|jewelry|jewellery|necklaces?|bracelets?|rings?|earrings?|keychains?|stickers?|accessor(?:y|ies)|bandanas?|ties?|watch(?:es)?|towels?|candles?|posters?|pins?)\b/]
];
const classifyText=text=>{const t=String(text||'').toLowerCase();if(!t.trim())return null;for(const [kind,re] of RULES)if(re.test(t))return kind;return null;};
// product_type is the most reliable field, then the title, then the tags.
export function classifyKind({title='',productType='',tags=[]}={}){
 const tagText=(Array.isArray(tags)?tags:String(tags).split(',')).join(' ');
 return classifyText(productType)||classifyText(title)||classifyText(tagText)||null;
}

export const absolute=(href,base)=>{try{return new URL(String(href).replace(/&amp;/g,'&'),base).href;}catch{return null;}};
// Shopify's CDN and Squarespace's CDN resize on request. Asking for ~1000px keeps every image under the byte cap and is plenty for a reference photo.
export function sizedImage(raw){
 const u=publicHttp(raw);if(!u)return null;
 if(u.protocol==='http:')u.protocol='https:';
 if(/(^|\.)cdn\.shopify\.com$/.test(u.hostname)||/\.shopifycdn\.com$/.test(u.hostname)){if(!u.searchParams.has('width'))u.searchParams.set('width','1000');}
 else if(/squarespace(-cdn)?\.com$/.test(u.hostname)){if(!u.searchParams.has('format'))u.searchParams.set('format','1000w');}
 return u.href;
}
const money=v=>{const n=Number(v);return Number.isFinite(n)&&n>0?n.toFixed(2):null;};

// Shopify /products.json -> raw product rows. Currency is not in this payload, so it comes from /meta.json when available.
export function parseShopify(json,base,currency=null){
 const list=Array.isArray(json?.products)?json.products:[];
 return list.map(p=>{
  const image=p?.images?.[0]?.src||p?.image?.src||null;
  const prices=(p?.variants||[]).map(v=>money(v?.price)).filter(Boolean);
  return {title:String(p?.title||'').trim(),productType:String(p?.product_type||''),tags:Array.isArray(p?.tags)?p.tags:String(p?.tags||'').split(',').map(s=>s.trim()).filter(Boolean),
   url:p?.handle?absolute(`/products/${p.handle}`,base):null,imageUrl:image?sizedImage(absolute(image,base)):null,price:prices[0]||null,currency};
 }).filter(p=>p.title);
}
// Squarespace commerce collections answer ?format=json with an items array.
export function parseSquarespace(json,base){
 const list=Array.isArray(json?.items)?json.items:[];
 return list.filter(i=>i&&i.title&&(i.structuredContent||i.productType!=null||i.priceMoney)).map(i=>{
  const sc=i.structuredContent||{};
  const variant=(sc.variants||i.variants||[]).map(v=>v?.salePriceMoney?.value&&Number(v.salePriceMoney.value)>0?v.salePriceMoney:v?.priceMoney).find(m=>money(m?.value));
  const direct=[sc.priceMoney,i.priceMoney].find(m=>money(m?.value));
  const money_=variant||direct||null;
  // The item's own assetUrl is often a bare folder that redirects to a placeholder; its first gallery image holds the real file.
  const real=u=>u&&/\.(jpe?g|png|webp|gif)$/i.test(new URL(u,base).pathname)?u:null;
  const image=real(i.items?.[0]?.assetUrl)||real(i.assetUrl)||i.items?.[0]?.assetUrl||i.assetUrl||null;
  return {title:String(i.title).trim(),productType:'',tags:[...(i.tags||[]),...(i.categories||[])].map(String),url:i.fullUrl?absolute(i.fullUrl,base):null,
   imageUrl:image?sizedImage(absolute(image,base)):null,price:money(money_?.value),currency:money_?.currency||null};
 });
}
const attr=(tag,name)=>(tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`,'i'))||[]).slice(1).find(Boolean)||'';
export function parseMeta(html,base){
 const meta={};
 for(const tag of html.match(/<meta\b[^>]*>/gi)||[]){const key=(attr(tag,'property')||attr(tag,'name')).toLowerCase();const val=attr(tag,'content');if(key&&val&&!(key in meta))meta[key]=val.replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'");}
 const image=meta['og:image:secure_url']||meta['og:image']||meta['twitter:image']||null;
 return {title:meta['og:title']||meta['twitter:title']||'',image:image?absolute(image,base):null,price:money(meta['product:price:amount']||meta['og:price:amount']),currency:meta['product:price:currency']||meta['og:price:currency']||null};
}

async function guardedFetch(url,{fetchImpl=fetch,accept='*/*',maxHops=4}={}){
 let u=publicHttp(url);if(!u)throw Error('Blocked URL');
 for(let hop=0;hop<maxHops;hop++){
  const res=await fetchImpl(u.href,{redirect:'manual',signal:AbortSignal.timeout(FETCH_TIMEOUT_MS),headers:{Accept:accept,'User-Agent':UA}});
  if(res.status>=300&&res.status<400&&res.headers.get('location')){u=publicHttp(new URL(res.headers.get('location'),u).href);if(!u)throw Error('Blocked redirect');continue;}
  return {res,url:u};
 }
 throw Error('Too many redirects');
}
async function readCapped(res,max){
 if(Number(res.headers.get('content-length')||0)>max)throw Error('Too large');
 const chunks=[];let size=0;
 for await(const chunk of res.body){size+=chunk.length;if(size>max){await res.body.cancel?.().catch(()=>{});throw Error('Too large');}chunks.push(Buffer.from(chunk));}
 return Buffer.concat(chunks);
}
const getJson=async(url,fetchImpl)=>{
 const {res}=await guardedFetch(url,{fetchImpl,accept:'application/json'});
 if(!res.ok)throw Error(`HTTP ${res.status}`);
 const type=(res.headers.get('content-type')||'').toLowerCase();
 if(!/json/.test(type))throw Error('Not JSON');
 return JSON.parse((await readCapped(res,6*1024*1024)).toString('utf8'));
};
const getHtml=async(url,fetchImpl)=>{
 const {res,url:final}=await guardedFetch(url,{fetchImpl,accept:'text/html'});
 if(!res.ok)throw Error(`HTTP ${res.status}`);
 return {html:(await readCapped(res,1572864)).toString('utf8'),url:final.href};
};

// Image guard: public http(s) only (private, loopback and link-local hosts blocked, redirects re-checked), image content types only, at most 1.5 MB.
export async function fetchProductImage(url,{fetchImpl=fetch,maxBytes=MAX_IMAGE_BYTES}={}){
 const {res}=await guardedFetch(url,{fetchImpl,accept:'image/*'});
 if(!res.ok)throw Error(`HTTP ${res.status}`);
 const type=(res.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
 if(!type.startsWith('image/'))throw Error('Not an image');
 const ext=imageExts[type];if(!ext)throw Error('Unsupported image type');
 const data=await readCapped(res,maxBytes);
 if(!data.length)throw Error('Empty image');
 return {data,ext,type};
}

const kindSchema=z.object({kinds:z.array(z.object({index:z.number().int(),kind:z.enum(KINDS)}))});
// Haiku only sees titles the rules could not place. Returns {kinds:Map(index->kind), cost}.
export async function classifyLeftovers(items,{llm=structured,enabled=llmEnabled}={}){
 const kinds=new Map();if(!items.length||!enabled())return {kinds,cost:0};
 try{
  const out=await llm({role:'grader',effort:'low',schema:kindSchema,system:'Classify each clothing-store product into exactly one kind: top (shirts, tees, sweaters, hoodies), bottom (pants, jeans, shorts, skirts), outerwear (jackets, coats, vests), footwear, headwear, accessory (bags, belts, socks, jewelry, small goods), or other (gift cards, non-wearable items, anything unclear). Judge only from the given title, type and tags.',prompt:JSON.stringify(items.map(i=>({index:i.index,title:i.title,productType:i.productType,tags:i.tags.slice(0,8)})))});
  for(const k of out.data.kinds)if(KINDS.includes(k.kind))kinds.set(k.index,k.kind);
  return {kinds,cost:out.cost||0};
 }catch{return {kinds,cost:0};}
}

// Up to MAX_PRODUCTS, interleaved by kind so a brand with 40 tees still shows its pants and jackets.
export function pickVariety(items,max=MAX_PRODUCTS){
 const buckets=new Map(KINDS.map(k=>[k,[]]));
 for(const it of items)buckets.get(it.kind)?.push(it);
 const out=[];
 while(out.length<max&&[...buckets.values()].some(b=>b.length))for(const b of buckets.values()){if(b.length&&out.length<max)out.push(b.shift());}
 return out;
}

const safeHost=d=>{const h=String(d||'').trim().toLowerCase().replace(/^https?:\/\//,'').replace(/\/.*$/,'');return /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/.test(h)&&!h.includes('..')?h:null;};
// Store titles are shown in Mint Labs, so dashes from the source site become a plain hyphen (house style bans the long dash).
const cleanTitle=t=>String(t||'').replace(/\s*[\u2014\u2013]\s*/g,' - ').replace(/\s+/g,' ').trim();
const dedupe=items=>{const seen=new Set();return items.filter(i=>{const k=(i.url||i.title).toLowerCase();if(seen.has(k))return false;seen.add(k);return true;});};

async function viaShopify(base,fetchImpl){
 let currency=null;
 try{const meta=await getJson(`${base}/meta.json`,fetchImpl);if(typeof meta?.currency==='string')currency=meta.currency;}catch{}
 for(const p of ['/products.json?limit=50','/collections/all/products.json?limit=50']){
  try{const items=parseShopify(await getJson(`${base}${p}`,fetchImpl),base,currency);if(items.length)return {items,source:p.startsWith('/products')?'shopify /products.json':'shopify /collections/all'};}catch{}
 }
 return null;
}
async function viaSquarespace(base,links,fetchImpl){
 const paths=new Set(['/shop']);
 for(const l of links){try{const u=new URL(l.href);if(u.origin!==new URL(base).origin)continue;if(/^\/(shop|store)(\/[^/]+)?\/?$/.test(u.pathname)&&!/\/p\//.test(u.pathname))paths.add(u.pathname.replace(/\/$/,''));}catch{}}
 const all=[];
 for(const p of [...paths].slice(0,4)){
  try{const items=parseSquarespace(await getJson(`${base}${p}?format=json`,fetchImpl),base);all.push(...items);}catch{}
  if(all.length>=MAX_PRODUCTS*2)break;
 }
 const items=dedupe(all);
 return items.length?{items,source:'squarespace ?format=json'}:null;
}
// Last resort: product-looking links from the homepage, each read for its og:image and title. Falls back to the homepage og:image as one "other" row.
async function viaHomepage(base,home,fetchImpl){
 const hrefs=[...new Set((home?.links||[]).map(l=>l.href).filter(h=>{try{const u=new URL(h);return u.origin===new URL(base).origin&&/\/(products?|shop\/p|p)\/[^/]+/.test(u.pathname);}catch{return false;}}))].slice(0,8);
 const items=[];
 for(const href of hrefs){
  try{const {html,url}=await getHtml(href,fetchImpl);const m=parseMeta(html,url);if(m.image&&m.title)items.push({title:m.title.replace(/\s*[|\-].*$/,'').trim()||m.title,productType:'',tags:[],url:href,imageUrl:sizedImage(m.image),price:m.price,currency:m.currency});}catch{}
 }
 if(items.length)return {items,source:'homepage product pages'};
 try{
  const {html,url}=await getHtml(`${base}/`,fetchImpl);const m=parseMeta(html,url);
  if(m.image)return {items:[{title:m.title||'Homepage image',productType:'',tags:[],url:`${base}/`,imageUrl:sizedImage(m.image),price:null,currency:null}],source:'homepage og:image'};
 }catch{}
 return null;
}

// {domain,url} -> {products,source,cost}. products: [{title,kind,url,imageUrl,price,currency,image}] where image is the cached file name (<n>.<ext>) when
// leadId is given and the download passed the guard. `fetchHome` is the runner's existing site helper (plain fetch, no browser).
export async function scrapeProductsDetailed({domain,url,leadId=null,dir=productDir,fetchImpl=fetch,fetchHome=fetchHomepage,llm,enabled}={}){
 const host=safeHost(domain||(url&&new URL(url).hostname));
 if(!host)throw Error('A valid domain is required');
 const base=`https://${host}`;
 if(!publicHttp(base))throw Error('Blocked domain');
 let found=await viaShopify(base,fetchImpl),home=null;
 if(!found){try{home=await fetchHome(url||`${base}/`);}catch{}}
 if(!found)found=await viaSquarespace(base,home?.links||[],fetchImpl);
 if(!found)found=await viaHomepage(base,home,fetchImpl);
 if(!found)return {products:[],source:'none',cost:0,leftovers:0};
 const rows=dedupe(found.items).filter(i=>i.imageUrl&&!/\bgift\s*cards?\b/i.test(i.title)).map((i,index)=>({...i,title:cleanTitle(i.title),index,kind:classifyKind(i)}));
 const leftovers=rows.filter(r=>!r.kind);
 const ai=await classifyLeftovers(leftovers,{llm,enabled});
 for(const r of leftovers)r.kind=ai.kinds.get(r.index)||'other';
 const slim=({title,kind,url:u,imageUrl,price,currency})=>({title,kind,url:u,imageUrl,price,currency,image:null});
 if(leadId==null)return {products:pickVariety(rows).map(slim),source:found.source,cost:ai.cost,leftovers:leftovers.length};
 // With a lead, a product only counts if its picture passed the guard, so every kept row has a usable reference photo. Extra candidates cover failed downloads.
 const candidates=pickVariety(rows,MAX_PRODUCTS+12).map(slim);
 const got=await Promise.all(candidates.map(async p=>{try{return await fetchProductImage(p.imageUrl,{fetchImpl});}catch{return null;}}));
 const folder=path.join(dir,String(Number(leadId)));mkdirSync(folder,{recursive:true});
 const products=[];
 candidates.forEach((p,i)=>{if(got[i]&&products.length<MAX_PRODUCTS){const name=`${products.length}.${got[i].ext}`;writeFileSync(path.join(folder,name),got[i].data);products.push({...p,image:name});}});
 return {products,source:found.source,cost:ai.cost,leftovers:leftovers.length};
}
export async function scrapeProducts(args){return (await scrapeProductsDetailed(args)).products;}

// The cached picture for product n of a lead, or null.
export function cachedProductImage(leadId,n,dir=productDir){
 try{
  const folder=path.join(dir,String(Number(leadId)));
  for(const f of readdirSync(folder)){const ext=path.extname(f).slice(1);if(f.slice(0,-ext.length-1)===String(Number(n))&&imageTypes[ext])return {file:path.join(folder,f),type:imageTypes[ext]};}
 }catch{}
 return null;
}
