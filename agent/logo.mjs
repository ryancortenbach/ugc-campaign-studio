import {mkdirSync,readdirSync,readFileSync,writeFileSync,statSync} from 'node:fs';
import path from 'node:path';
import {pageImages} from './tools/exa.mjs';

// Brand logos for lead thumbnails. Each domain is resolved once and cached under <dataDir>/logos/<domain>.<ext>.
export const MAX_LOGO_BYTES=1024*1024,LOGO_TIMEOUT_MS=6000,MISS_TTL_MS=24*3600*1000;
const exts={'image/png':'png','image/jpeg':'jpg','image/jpg':'jpg','image/gif':'gif','image/webp':'webp','image/avif':'avif','image/svg+xml':'svg','image/x-icon':'ico','image/vnd.microsoft.icon':'ico'};
export const logoTypes=Object.fromEntries(Object.entries(exts).map(([t,e])=>[e,t==='image/jpg'?'image/jpeg':t]).reverse());
const safeDomain=d=>/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/.test(d)&&!d.includes('..')?d:null;
const privateHost=h=>{
 h=h.replace(/^\[|\]$/g,'').toLowerCase();
 if(h==='localhost'||h.endsWith('.localhost')||h.endsWith('.local')||h.endsWith('.internal'))return true;
 const v4=h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
 if(v4){const [a,b]=[Number(v4[1]),Number(v4[2])];return a===0||a===10||a===127||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&b===168)||(a===100&&b>=64&&b<=127);}
 return h.includes(':')&&(h==='::1'||h==='::'||/^f[cd]/.test(h)||h.startsWith('fe80')||h.startsWith('::ffff:'));
};
export const publicHttp=raw=>{try{const u=new URL(raw);return (u.protocol==='http:'||u.protocol==='https:')&&!privateHost(u.hostname)&&!u.username&&!u.password?u:null;}catch{return null;}};

// Reads at most `max` bytes, so a hostile or huge response is never held in memory.
async function readCapped(res,max){
 if(Number(res.headers.get('content-length')||0)>max)throw Error('Too large');
 const chunks=[];let size=0;
 for await(const chunk of res.body){size+=chunk.length;if(size>max){await res.body.cancel?.().catch(()=>{});throw Error('Too large');}chunks.push(Buffer.from(chunk));}
 return Buffer.concat(chunks);
}
// http(s) only, 6 second timeout, redirects re-checked hop by hop.
async function get(url,fetchImpl,accept){
 let u=publicHttp(url);if(!u)throw Error('Blocked URL');
 for(let hop=0;hop<4;hop++){
  const res=await fetchImpl(u.href,{redirect:'manual',signal:AbortSignal.timeout(LOGO_TIMEOUT_MS),headers:{Accept:accept,'User-Agent':'Mozilla/5.0 (compatible; MintLabsLogo/1.0)'}});
  if(res.status>=300&&res.status<400&&res.headers.get('location')){u=publicHttp(new URL(res.headers.get('location'),u).href);if(!u)throw Error('Blocked redirect');continue;}
  if(!res.ok)throw Error(`HTTP ${res.status}`);
  return {res,url:u};
 }
 throw Error('Too many redirects');
}
export async function fetchImage(url,fetchImpl=fetch){
 const {res}=await get(url,fetchImpl,'image/*');
 const type=(res.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
 if(!type.startsWith('image/'))throw Error('Not an image');
 const ext=exts[type];if(!ext)throw Error('Unsupported image type');
 const data=await readCapped(res,MAX_LOGO_BYTES);
 if(!data.length)throw Error('Empty image');
 return {data,ext,type};
}
const attr=(tag,name)=>(tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`,'i'))||[]).slice(1).find(Boolean)||'';
// apple-touch-icon first, then the other icons, then og:image.
export function iconCandidates(html,base){
 const found={apple:[],icon:[],og:[]};
 for(const tag of html.match(/<(?:link|meta)\b[^>]*>/gi)||[]){
  const href=attr(tag,'href')||attr(tag,'content');if(!href)continue;
  let abs;try{abs=new URL(href.replace(/&amp;/g,'&'),base).href;}catch{continue;}
  if(/^<link/i.test(tag)){const rel=attr(tag,'rel').toLowerCase();if(/apple-touch-icon/.test(rel))found.apple.push(abs);else if(/\bicon\b/.test(rel))found.icon.push(abs);}
  else if(/^(og:image|og:image:url|og:image:secure_url)$/i.test(attr(tag,'property')||attr(tag,'name')))found.og.push(abs);
 }
 return [...new Set([...found.apple,...found.icon,...found.og])];
}
async function fromHomepage(home,fetchImpl){
 const {res,url}=await get(home,fetchImpl,'text/html');
 if(!/html/i.test(res.headers.get('content-type')||'text/html'))throw Error('Not HTML');
 return iconCandidates((await readCapped(res,MAX_LOGO_BYTES)).toString('utf8'),url.href);
}

const flights=new Map();
export const cachedLogo=(dir,domain)=>{
 try{for(const f of readdirSync(dir)){const ext=path.extname(f).slice(1);if(f.slice(0,-ext.length-1)===domain&&logoTypes[ext])return {file:path.join(dir,f),type:logoTypes[ext]};}}catch{}
 return null;
};
const recentMiss=(dir,domain)=>{try{return Date.now()-statSync(path.join(dir,`${domain}.none`)).mtimeMs<MISS_TTL_MS;}catch{return false;}};

// Order: the favicon/image Exa returned with the search result, Exa contents for the homepage, the homepage's own icon tags, then Google's favicon service.
// Returns {file,type,source,exaCostUsd} or null. Concurrent requests for one domain share a single resolution.
export function resolveLogo({lead,dir,fetchImpl=fetch,exaImages=pageImages,onSpend=()=>{}}){
 const domain=safeDomain(String(lead.domain||'').toLowerCase());if(!domain)return Promise.resolve(null);
 const hit=cachedLogo(dir,domain);if(hit)return Promise.resolve({...hit,source:'cache'});
 if(recentMiss(dir,domain))return Promise.resolve(null);
 if(flights.has(domain))return flights.get(domain);
 const job=(async()=>{
  const home=lead.url||`https://${domain}/`;
  const save=(img,source)=>{mkdirSync(dir,{recursive:true});const file=path.join(dir,`${domain}.${img.ext}`);writeFileSync(file,img.data);return {file,type:img.type,source};};
  const tryUrls=async(urls,source)=>{for(const u of urls){try{return save(await fetchImage(u,fetchImpl),source);}catch{}}return null;};
  let out=lead.logo?await tryUrls([lead.logo],'exa search'):null;
  if(!out){
   try{const e=await exaImages(home,{request:fetchImpl});if(e){onSpend(e.costUsd??0.001,e.costUsd==null);out=await tryUrls([e.favicon,e.image].filter(Boolean),'exa contents');}}catch{}
  }
  if(!out){try{out=await tryUrls(await fromHomepage(home,fetchImpl),'homepage');}catch{}}
  if(!out)out=await tryUrls([`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`],'google favicons');
  if(!out){try{mkdirSync(dir,{recursive:true});writeFileSync(path.join(dir,`${domain}.none`),new Date().toISOString());}catch{}}
  return out;
 })().finally(()=>flights.delete(domain));
 flights.set(domain,job);
 return job;
}
export const readLogo=r=>({data:readFileSync(r.file),type:r.type});
