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
 return page.evaluate(()=>({title:document.title,text:(document.body?.innerText||'').slice(0,20000),mailtos:[...document.querySelectorAll('a[href^="mailto:"]')].map(a=>a.getAttribute('href')),links:[...document.querySelectorAll('a[href]')].map(a=>({href:a.href,text:(a.innerText||a.getAttribute('aria-label')||'').trim().slice(0,60)})).slice(0,400)}));
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

async function visitWithFetch(url,domain){
 const pages=[];
 const get=async u=>{const res=await fetch(u,{signal:AbortSignal.timeout(15000),redirect:'follow',headers:{'User-Agent':'Mozilla/5.0 (Macintosh) MintLabsResearch/0.1'}});const html=await res.text();const text=html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/\s+/g,' ');const links=[...html.matchAll(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)].map(m=>{try{return {href:new URL(m[1],res.url).href,text:m[2].replace(/<[^>]+>/g,'').trim().slice(0,60)};}catch{return null;}}).filter(Boolean);return {url:res.url,title:(html.match(/<title[^>]*>([^<]*)/i)||[])[1]||'',text:text.slice(0,20000),mailtos:links.filter(l=>/^mailto:/i.test(l.href)).map(l=>l.href),links};};
 const home=await get(url);pages.push(home);
 const next=contactLink(home.links,url);
 if(next&&next!==home.url)pages.push(await get(next).catch(()=>({url:next,title:'',text:'',mailtos:[],links:[]})));
 return summarize(pages,domain,{via:'fetch (no Solari key)',sessionId:null,screenshot:null});
}

function summarize(pages,domain,meta){
 const sources=[];
 for(const p of pages)for(const email of extractEmails(p.text,p.mailtos))if(!sources.some(s=>s.email===email))sources.push({email,sourceUrl:p.url,excerpt:excerptAround(p.text,email)||null});
 const best=bestEmail(sources.map(s=>s.email),domain);
 return {...meta,domain,pages:pages.map(p=>({url:p.url,title:p.title,chars:p.text.length})),homeText:pages[0]?.text.slice(0,3000)||'',contactText:pages[1]?.text.slice(0,3000)||'',emails:sources,best:best?sources.find(s=>s.email===best):null};
}
