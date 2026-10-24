import {Solari} from '@solarisdk/browser';
import {writeFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';

export const siteMode=()=>process.env.SOLARI_API_KEY?'solari':'fetch';
const blocked=/(^|[._-])(no-?reply|donotreply|privacy|gdpr|legal|careers|jobs|returns|orders|billing|abuse|postmaster|webmaster|security|dpo)@|@(example\.|sentry|wixpress|.*\.png|.*\.jpg)|\.(png|jpe?g|gif|webp|svg)$/i;
const preferred=['partnerships','partner','collab','collabs','creators','influencer','marketing','brand','media','press','pr','hello','hi','team','contact','info','sales','support'];
const contactWords=/contact|partner|collab|wholesale|press|creator|influencer|ambassador|work with us|get in touch/i;

export function extractEmails(text='',mailtos=[]){
 const found=[...mailtos.map(m=>m.replace(/^mailto:/i,'').split('?')[0]),...(text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)||[])];
 return [...new Set(found.map(e=>decodeURIComponent(e).trim().toLowerCase()))].filter(e=>e.length<80&&!blocked.test(e));
}
export function rankEmail(email,domain){
 const [local,host]=email.split('@');
 const sameDomain=host===domain||host.endsWith('.'+domain)||domain.endsWith('.'+host);
 const index=preferred.findIndex(p=>local===p||local.startsWith(p));
 return (sameDomain?100:0)+(index<0?0:preferred.length-index);
}
export function bestEmail(emails,domain){return [...emails].sort((a,b)=>rankEmail(b,domain)-rankEmail(a,domain))[0]||null;}
export function excerptAround(text,needle,size=90){const i=text.toLowerCase().indexOf(needle.toLowerCase());return i<0?'':text.slice(Math.max(0,i-size),i+needle.length+size).replace(/\s+/g,' ').trim();}

async function readPage(page){
 return page.evaluate(()=>({title:document.title,text:(document.body?.innerText||'').slice(0,20000),mailtos:[...document.querySelectorAll('a[href^="mailto:"]')].map(a=>a.getAttribute('href')),links:[...document.querySelectorAll('a[href]')].map(a=>({href:a.href,text:(a.innerText||a.getAttribute('aria-label')||'').trim().slice(0,60)})).slice(0,400),socialLinks:[...document.querySelectorAll('a[href]')].map(a=>a.href).filter(h=>/instagram\.com|tiktok\.com|youtube\.com|x\.com|twitter\.com|facebook\.com/i.test(h)).slice(0,60)}));
}
function contactLink(links,base){
 const host=new URL(base).hostname.replace(/^www\./,'');
 const same=links.filter(l=>{try{const u=new URL(l.href);return u.protocol==='https:'&&u.hostname.replace(/^www\./,'')===host;}catch{return false;}});
 return (same.find(l=>contactWords.test(l.text))||same.find(l=>contactWords.test(l.href)))?.href||null;
}

// Visits the homepage and the best contact-like page, returns emails with the page each came from.
export async function visitSite(url,{shotDir,leadId}={}){
 const domain=new URL(url).hostname.replace(/^www\./,'');
 if(siteMode()==='fetch')return visitWithFetch(url,domain);
 const client=new Solari({apiKey:process.env.SOLARI_API_KEY,baseUrl:'https://api.getsolari.com'});
 const browser=await client.launch({stealth:false});
 const pages=[];let screenshot=null;
 try{
  const page=await browser.newPage();
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:30000});
  const home=await readPage(page);pages.push({url:page.url(),...home});
  if(shotDir){mkdirSync(shotDir,{recursive:true});screenshot=`lead-${leadId||domain}.png`;writeFileSync(path.join(shotDir,screenshot),await page.screenshot({fullPage:false}));}
  const next=contactLink(home.links,url);
  if(next&&next!==page.url()){await page.goto(next,{waitUntil:'domcontentloaded',timeout:30000});pages.push({url:page.url(),...await readPage(page)});}
 }finally{await browser.close().catch(()=>{});await client.close?.().catch?.(()=>{});}
 return summarize(pages,domain,{via:'solari.browser',sessionId:browser.id,screenshot});
}

// Turns fetched HTML into the same page shape Solari returns: text, mailto links and every anchor with an absolute href.
export function parseHtml(html,finalUrl){
 const text=html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/\s+/g,' ');
 const links=[...html.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)].map(m=>{try{return {href:new URL(m[1],finalUrl).href,text:m[2].replace(/<[^>]+>/g,'').trim().slice(0,60)};}catch{return null;}}).filter(Boolean);
 return {url:finalUrl,title:(html.match(/<title[^>]*>([^<]*)/i)||[])[1]||'',text:text.slice(0,20000),mailtos:links.filter(l=>/^mailto:/i.test(l.href)).map(l=>l.href),links};
}
const UA={'User-Agent':'Mozilla/5.0 (Macintosh) MintLabsResearch/0.1'};
async function visitWithFetch(url,domain){
 const pages=[];
 const get=async u=>{const res=await fetch(u,{signal:AbortSignal.timeout(15000),redirect:'follow',headers:UA});return parseHtml(await res.text(),res.url);};
 const home=await get(url);pages.push(home);
 const next=contactLink(home.links,url);
 if(next&&next!==home.url)pages.push(await get(next).catch(()=>({url:next,title:'',text:'',mailtos:[],links:[]})));
 return summarize(pages,domain,{via:'fetch (no Solari key)',sessionId:null,screenshot:null});
}

// Plain homepage fetch for requalifying old leads: no Solari, 8 s timeout, 1.5 MB cap. Throws on HTTP errors so a bot-blocked site is never mistaken for a brand with no socials.
export async function fetchHomepage(url,{fetchImpl=fetch,timeoutMs=8000,maxBytes=1572864}={}){
 if(!/^https?:\/\//i.test(url))throw new Error('Not an http(s) URL');
 const res=await fetchImpl(url,{signal:AbortSignal.timeout(timeoutMs),redirect:'follow',headers:UA});
 if(!res.ok)throw new Error(`HTTP ${res.status}`);
 let html='';
 if(res.body?.getReader){const reader=res.body.getReader(),dec=new TextDecoder();let n=0;for(;;){const {done,value}=await reader.read();if(done)break;n+=value.length;html+=dec.decode(value,{stream:true});if(n>=maxBytes){await reader.cancel().catch(()=>{});break;}}}
 else html=await res.text();
 const page=parseHtml(html.slice(0,maxBytes),res.url||url);
 return {...page,socials:extractSocials(page.links)};
}

const RESERVED={
 instagram:new Set(['p','reel','reels','explore','accounts','stories','share','direct','tv','about','legal','developer','web','oauth','login','sharer','sharer.php','_u','privacy','directory','topics','tags','locations','challenge']),
 x:new Set(['share','intent','home','i','search','hashtag','login','explore','tweet','settings','compose','privacy','tos','about','messages','notifications']),
 facebook:new Set(['sharer','sharer.php','share','share.php','dialog','tr','plugins','login','login.php','groups','pages','events','watch','hashtag','policies','help','privacy','people','marketplace','gaming','reel','reels','photo','photo.php','permalink.php','story.php','profile.php','l.php','business','ads','public','video','videos','stories','v2.0','v3.0']),
 youtube:new Set(['watch','embed','shorts','playlist','results','feed','redirect','live','hashtag','channel','c','user','premium','about','t','gaming','howyoutubeworks','attribution_link'])
};
const NOT_BRAND=new Set(['instagram','facebook','tiktok','youtube','twitter','x','shopify','wix','squarespace','wordpress','meta','google','weebly','bigcommerce','woocommerce']);
const handleOk=h=>/^[A-Za-z0-9._-]{1,50}$/.test(h)&&!NOT_BRAND.has(h.toLowerCase());
// Finds a brand's own profile URLs among anchor hrefs (strings or {href}). Share links, posts, hashtags and platform home pages are ignored.
// Instagram needs /handle, TikTok needs /@handle, YouTube needs /@handle, /channel/ID, /c/name or /user/name. First hit per platform wins.
export function extractSocials(links=[]){
 const out={};
 for(const link of links){
  let u;try{u=new URL(typeof link==='string'?link:link?.href);}catch{continue;}
  if(u.protocol!=='https:'&&u.protocol!=='http:')continue;
  const host=u.hostname.toLowerCase().replace(/^(www|m|mobile|web)\./,'');
  const seg=u.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  if(host==='instagram.com'){
   if(!out.instagram&&seg.length===1&&!RESERVED.instagram.has(seg[0].toLowerCase())&&handleOk(seg[0]))out.instagram=`https://www.instagram.com/${seg[0].toLowerCase()}/`;
  }else if(host==='tiktok.com'){
   if(!out.tiktok&&seg.length===1&&/^@[A-Za-z0-9._]{2,40}$/.test(seg[0])&&handleOk(seg[0].slice(1)))out.tiktok=`https://www.tiktok.com/${seg[0].toLowerCase()}`;
  }else if(host==='youtube.com'){
   if(out.youtube)continue;
   if(seg.length===1&&/^@[A-Za-z0-9._-]{3,50}$/.test(seg[0])&&handleOk(seg[0].slice(1)))out.youtube=`https://www.youtube.com/${seg[0].toLowerCase()}`;
   else if(seg.length===2&&['channel','c','user'].includes(seg[0])&&/^[A-Za-z0-9._-]{2,60}$/.test(seg[1])&&handleOk(seg[1]))out.youtube=`https://www.youtube.com/${seg[0]}/${seg[1]}`;
  }else if(host==='x.com'||host==='twitter.com'){
   if(!out.x&&seg.length===1&&/^[A-Za-z0-9_]{1,15}$/.test(seg[0])&&!RESERVED.x.has(seg[0].toLowerCase())&&handleOk(seg[0]))out.x=`https://x.com/${seg[0].toLowerCase()}`;
  }else if(host==='facebook.com'||host==='fb.com'){
   if(!out.facebook&&seg.length===1&&/^[A-Za-z0-9.-]{3,60}$/.test(seg[0])&&!RESERVED.facebook.has(seg[0].toLowerCase())&&handleOk(seg[0]))out.facebook=`https://www.facebook.com/${seg[0].toLowerCase()}`;
  }
 }
 return out;
}

function summarize(pages,domain,meta){
 const sources=[];
 for(const p of pages)for(const email of extractEmails(p.text,p.mailtos))if(!sources.some(s=>s.email===email))sources.push({email,sourceUrl:p.url,excerpt:excerptAround(p.text,email)||null});
 const best=bestEmail(sources.map(s=>s.email),domain);
 return {...meta,domain,socials:extractSocials(pages.flatMap(p=>[...(p.links||[]),...(p.socialLinks||[])])),pages:pages.map(p=>({url:p.url,title:p.title,chars:p.text.length})),homeText:pages[0]?.text.slice(0,3000)||'',contactText:pages[1]?.text.slice(0,3000)||'',emails:sources,best:best?sources.find(s=>s.email===best):null};
}
