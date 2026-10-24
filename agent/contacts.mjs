import {extractEmails,extractSocials,excerptAround} from './tools/site.mjs';

// Ryan's rule: never a generic inbox. A lead needs a personal email that is literally printed on a public page, or an Instagram handle to DM.
// Emails are only ever copied out of fetched text. Nothing in this file builds an address from a name and a domain.
export const MAX_EXA_CALLS=3;
export const NO_CONTACT='No reachable contact';
export const ONLY_GENERIC='Only a generic inbox';
export const ROLE_WORDS=new Set(['info','support','cs','cx','returns','exchanges','billing','accounts','payments','hello','hi','hey','hola','contact','contactus','sales','press','team','admin','orders','order','help','care','service','services','customerservice','customercare','customersupport','wholesale','shop','store','marketing','partnerships','partnership','partners','partner','collabs','collab','collaborations','noreply','donotreply','office','general','inquiries','inquiry','enquiries','enquiry','mail','studio','media','pr','creators','creator','influencer','influencers','brand','brands','newsletter','feedback','questions','booking','bookings','events','community','social','content','hq','web','website','ecommerce','returns','billing','accounts','accounting','jobs','careers','hr','sale','ambassador','ambassadors']);
const FREE_MAIL=new Set(['gmail.com','googlemail.com','yahoo.com','outlook.com','hotmail.com','icloud.com','me.com','live.com','aol.com','proton.me','protonmail.com']);
const words=local=>local.toLowerCase().split(/[._+\-]+/).map(w=>w.replace(/\d+$/,'')).filter(Boolean);
const letters=s=>String(s||'').toLowerCase().replace(/[^a-z]/g,'');
const brandLabel=domain=>letters(String(domain||'').toLowerCase().replace(/^www\./,'').split('.')[0]);
const hostOf=u=>{try{return new URL(u).hostname.toLowerCase().replace(/^(www|m)\./,'');}catch{return '';}};
const sameDomain=(host,domain)=>Boolean(host&&domain)&&(host===domain||host.endsWith('.'+domain)||domain.endsWith('.'+host));
const cleanDomain=d=>String(d||'').toLowerCase().replace(/^www\./,'');

// 'role' for info@, support@, hello@ and the like; 'personal' for a first name, first.last or a named founder address;
// 'other' for anything that is neither (the brand's own name, an unrelated domain, a free mailbox with no name behind it).
export function classifyEmail(email,{domain='',names=[]}={}){
 const [local='',host='']=String(email||'').trim().toLowerCase().split('@');
 if(!local||!host)return 'other';
 const w=words(local);
 if(ROLE_WORDS.has(letters(local))||w.some(x=>ROLE_WORDS.has(x)))return 'role';
 domain=cleanDomain(domain);
 if(letters(local)===brandLabel(domain)||(w.length&&w.every(x=>x===brandLabel(domain))))return 'role';
 const sq=letters(local),known=names.map(n=>String(n||'').toLowerCase().split(/\s+/).map(letters).filter(x=>x.length>1)).filter(p=>p.length);
 const named=known.some(p=>{const f=p[0],l=p[p.length-1];return [f,l,f+l,l+f,f[0]+l,f+l[0]].includes(sq)||w.includes(f)||(p.length>1&&w.includes(l)&&w.length>1);});
 const free=FREE_MAIL.has(host),brandHost=sameDomain(host,domain);
 if(named&&(brandHost||free))return 'personal';
 if(/\d/.test(local.replace(/\d+$/,''))||!/^[a-z]+([._-][a-z]+)?\d*$/.test(local))return 'other';
 const two=w.length===2&&w.every(x=>/^[a-z]+$/.test(x))&&w[1].length>=2&&(w[0].length>=2||w[1].length>=3);
 if(two&&(brandHost||free))return 'personal';
 if(brandHost&&w.length===1&&/^[a-z]{3,14}$/.test(w[0]))return 'personal';
 return 'other';
}

// Personal first (brand domain before outside domains), then role, then other. Order inside a group is kept. Accepts strings or {email,...}.
export function rankContacts(emails,{domain='',names=[]}={}){
 const order={personal:0,role:1,other:2};
 const items=(emails||[]).map(e=>typeof e==='string'?{email:e}:e).filter(e=>e&&typeof e.email==='string'&&e.email.includes('@')).map(e=>({...e,email:e.email.trim().toLowerCase()}));
 const seen=new Set();
 return items.filter(e=>!seen.has(e.email)&&seen.add(e.email)).map((e,i)=>({e:{...e,kind:classifyEmail(e.email,{domain,names})},i,own:sameDomain(e.email.split('@')[1],cleanDomain(domain))?0:1}))
  .sort((a,b)=>order[a.e.kind]-order[b.e.kind]||(a.e.kind==='personal'?a.own-b.own:0)||a.i-b.i).map(x=>x.e);
}
export const firstPersonal=(emails,opts)=>rankContacts(emails,opts).find(e=>e.kind==='personal')||null;
export const firstName=name=>String(name||'').trim().split(/\s+/)[0]||null;

const NAME_WORD="[A-Z][a-z]{1,14}",NAME=`${NAME_WORD}(?:\\s+[A-Z][a-z'’-]{1,18}){0,2}`;
const TITLE='(?:[Cc]o-?[Ff]ounder|[Ff]ounder|[Oo]wner|CEO|[Cc]reator)';
const NAME_PATTERNS=[
 new RegExp(`(?:[Ff]ounded|[Ss]tarted|[Cc]reated|[Oo]wned|[Rr]un|[Ll]aunched|[Bb]uilt|[Mm]ade)\\s+by\\s+(${NAME})`,'g'),
 new RegExp(`(${NAME})\\s*(?:,|-|\\bis\\b|\\bwas\\b)?\\s*(?:the\\s+|our\\s+|a\\s+)?(?:and\\s+)?${TITLE}\\b`,'g'),
 new RegExp(`${TITLE}\\s*(?::|-|,|\\bis\\b)\\s*(${NAME})`,'g'),
 new RegExp(`(?:I'm|I’m|I am|My name is)\\s+(${NAME})`,'g')
];
const LEAD_STOP=new Set(['meet','hi','hello','hey','our','the','welcome','about','by','from','with','founder','owner','ceo','im','i','and','a','an','this','we','who','why','shop','read','story']);
const NOT_NAME=new Set(['inc','llc','co','company','studio','team','shop','store','brand','collection','collections','story','home','contact','us','and','of','for','the','our','new','all','products','product','email','instagram','founder','owner','creator','ceo','read','more','learn']);
// Founder or owner name from public text. Used for the greeting and for recognising a named address. It is never used to build an email.
export function extractFounderName(text,brand=''){
 const brandWords=new Set(String(brand).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
 for(const re of NAME_PATTERNS)for(const m of String(text||'').matchAll(re)){
  let parts=m[1].trim().split(/\s+/);
  while(parts.length&&LEAD_STOP.has(parts[0].toLowerCase()))parts.shift();
  while(parts.length&&LEAD_STOP.has(parts[parts.length-1].toLowerCase()))parts.pop();
  if(!parts.length||parts.length>3||parts.some(p=>NOT_NAME.has(p.toLowerCase())||brandWords.has(p.toLowerCase())))continue;
  return parts.join(' ');
 }
 return null;
}

// The brand's Instagram: the profile linked from its site first, else an instagram.com link printed in the given text.
export function instagramFrom(socials={},texts=[]){
 const fromUrl=u=>{const h=u&&extractSocials([u]).instagram;const handle=h&&new URL(h).pathname.split('/').filter(Boolean)[0];return handle?{handle,url:`https://www.instagram.com/${handle}/`}:null;};
 const direct=fromUrl(socials?.instagram);if(direct)return direct;
 for(const t of texts)for(const m of String(t||'').matchAll(/instagram\.com\/([A-Za-z0-9._]{2,30})/gi)){const hit=fromUrl(`https://www.instagram.com/${m[1]}/`);if(hit)return hit;}
 return null;
}

// Looks for a person to write to. exa: {search(query)->{results:[{url,text}],costUsd}, contents(urls)->same}. onSpend(usd,note) gets each call's real cost.
// At most maxCalls Exa calls per lead; stops as soon as a personal email shows up in public text. Returns
// {kind:'personal'|'instagram'|'role'|'none', personal, role, name, instagram:{handle,url}|null, calls, costUsd, errors, failed}.
export async function findPersonalContact({brand,domain,homepageText='',socials={},emails=[],exa,onSpend=()=>{},maxCalls=MAX_EXA_CALLS}){
 domain=cleanDomain(domain);const brandLower=String(brand||'').toLowerCase();
 const st={calls:0,costUsd:0,errors:[]};
 const pool=[],seenEmail=new Set();let name=extractFounderName(homepageText,brand);
 let ig=instagramFrom(socials,[homepageText]);
 const addEmails=(list)=>{for(const e of list||[])if(e?.email&&!seenEmail.has(e.email.toLowerCase())){seenEmail.add(e.email.toLowerCase());pool.push({...e,email:e.email.toLowerCase()});}};
 addEmails(emails);
 const rank=()=>rankContacts(pool,{domain,names:[name]});
 const done=()=>rank().some(e=>e.kind==='personal');
 const consume=items=>{
  for(const r of items||[]){
   const text=String(r.text||''),host=hostOf(r.url),own=sameDomain(host,domain);
   let igPage=false;
   if(host==='instagram.com'){
    const handle=new URL(r.url).pathname.split('/').filter(Boolean)[0]?.toLowerCase();
    if(ig?(handle===ig.handle.toLowerCase()):text.toLowerCase().includes(domain)){igPage=true;if(!ig&&handle){const found=instagramFrom({},[`instagram.com/${handle}`]);if(found)ig=found;}}
   }
   const mentions=own||igPage||text.toLowerCase().includes(brandLower)||text.toLowerCase().includes(domain);
   if(!mentions)continue;
   const found=extractEmails(text);
   for(const email of found)if(own||igPage||sameDomain(email.split('@')[1],domain))addEmails([{email,sourceUrl:r.url,excerpt:excerptAround(text,email)||null}]);
   if(!name&&(own||igPage||text.toLowerCase().includes(brandLower)))name=extractFounderName(text,brand);
   if(!ig&&own)ig=instagramFrom({},[text]);
  }
 };
 const call=async(label,fn)=>{
  if(st.calls>=maxCalls)return null;
  st.calls++;
  try{
   const out=await fn();
   if(out?.skipped){st.calls--;return null;}
   if(out?.costUsd>0){st.costUsd+=out.costUsd;onSpend(out.costUsd,label);}
   return out;
  }catch(error){st.errors.push(`${label}: ${error.message}`);return null;}
 };
 const seenUrls=new Set();
 // 1. Who runs the brand, and is an address printed anywhere public?
 const first=await call('exa search: founder',()=>exa.search(`${brand} founder owner contact email (${domain})`));
 for(const r of first?.results||[])seenUrls.add(r.url);
 consume(first?.results);
 // 2. The brand's own about or team page and its Instagram profile, read directly.
 if(!done()&&st.calls<maxCalls){
  const abouts=['/pages/about','/about','/pages/about-us'].map(p=>`https://${domain}${p}`).filter(u=>!seenUrls.has(u));
  const known=[...seenUrls].some(u=>sameDomain(hostOf(u),domain)&&/about|team|story|founder/i.test(u));
  const urls=[...(known?[]:abouts),...(ig?[ig.url]:[])];
  if(urls.length){const out=await call('exa contents: about and instagram',()=>exa.contents(urls));consume(out?.results);}
 }
 // 3. One more search aimed at the person, only when a name or nothing else turned something up.
 if(!done()&&st.calls<maxCalls){
  const out=await call('exa search: person',()=>exa.search(name?`${name} ${brand} email`:`${brand} owner email instagram`));
  consume(out?.results);
 }
 const ranked=rank(),personal=ranked.find(e=>e.kind==='personal')||null,role=ranked.find(e=>e.kind==='role')||null;
 const kind=personal?'personal':ig?'instagram':role?'role':'none';
 return {kind,personal,role,name,instagram:ig,calls:st.calls,costUsd:st.costUsd,errors:st.errors,failed:Boolean(!personal&&st.calls>0&&st.errors.length>=st.calls)};
}

// One contact decision for a lead, shared by the runner and requalify.
// emails: what the site already showed ({email,sourceUrl,excerpt}). find: findPersonalContact bound to Exa, or undefined when no lookup is wired.
// Returns {kind,email,sourceUrl,excerpt,name,handle,instagramUrl,uncertain,reason}. kind 'role' and 'none' carry the rejection reason.
export async function resolveContact({brand,domain,homepageText='',socials={},emails=[],find,onSpend,log=()=>{}}){
 const local=rankContacts(emails,{domain});
 const mk=(kind,extra={})=>({kind,email:null,sourceUrl:null,excerpt:null,name:null,handle:null,instagramUrl:null,uncertain:false,reason:null,...extra});
 const pick=(p,name,ig)=>mk('personal',{email:p.email,sourceUrl:p.sourceUrl||null,excerpt:p.excerpt||null,name:name||null,handle:ig?.handle||null,instagramUrl:ig?.url||null});
 const siteIg=instagramFrom(socials,[homepageText]);
 const sitePersonal=local.find(e=>e.kind==='personal');
 if(sitePersonal)return pick(sitePersonal,extractFounderName(homepageText,brand),siteIg);
 let found=null;
 if(find){
  log('tool_call',`Looking for a personal contact for ${brand}`,{tool:'exa.contact'});
  try{found=await find({brand,domain,homepageText,socials,emails:local,onSpend});}
  catch(error){return mk('none',{uncertain:true,reason:`Contact lookup failed: ${error.message}`});}
  log('tool_result',found.personal?`Found ${found.personal.email} on ${found.personal.sourceUrl}`:found.instagram?`No personal email. Instagram @${found.instagram.handle} is the channel`:found.role?'Only a generic inbox found':'No public contact found',{tool:'exa.contact',data:{calls:found.calls,costUsd:found.costUsd,name:found.name,errors:found.errors}});
 }
 const ig=found?.instagram||siteIg,name=found?.name||extractFounderName(homepageText,brand);
 if(found?.personal)return pick(found.personal,name,ig);
 if(found?.failed&&!ig)return mk(found.role?'role':'none',{uncertain:true,reason:`Contact lookup failed: ${found.errors[0]}`});
 if(ig)return mk('instagram',{name,handle:ig.handle,instagramUrl:ig.url});
 if(found?.role||local.some(e=>e.kind==='role'))return mk('role',{name,reason:ONLY_GENERIC});
 return mk('none',{name,reason:NO_CONTACT});
}
