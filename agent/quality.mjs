import path from 'node:path';
import {createHash} from 'node:crypto';
import {dataDir} from './store.mjs';
import {resolveLogo,readLogo} from './logo.mjs';
import {extractSocials} from './tools/site.mjs';

// Only high-value leads: socials, a real logo and a Haiku brand grader all have to pass before any email or video is written.
export const VALUE_MIN=70;
export const hasSocial=s=>Boolean(s&&(s.instagram||s.tiktok));
export const NO_SOCIALS='No Instagram or TikTok linked from the site';

// Brand names. Titles from search results sometimes carry markup, e.g. '<div class="logo__image'.
const entities={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',ndash:'-',mdash:'-',hellip:'...',rsquo:"'",lsquo:"'",ldquo:'"',rdquo:'"',copy:'',reg:'',trade:''};
const decode=s=>s.replace(/&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/gi,(m,d,h,n)=>{if(d||h){const c=Number(d||parseInt(h,16));return c>0&&c<0x110000?String.fromCodePoint(c):' ';}return n.toLowerCase() in entities?entities[n.toLowerCase()]:m;});
export function cleanCompany(raw){
 let s=decode(String(raw??''));
 s=decode(s.replace(/<[^>]*>?/g,' ')).replace(/<[^>]*>?/g,' ');
 return s.replace(/[\u0000-\u001f\u007f​-‍﻿]/g,' ').replace(/\s+/g,' ').trim();
}
const markupish=s=>!s||/[<>{}=]|&[a-z#0-9]+;|\bclass\b|https?:|^[^a-z0-9]+$/i.test(s)||s.length>80||!/[a-z0-9]/i.test(s);
export function brandFromDomain(domain){
 const parts=String(domain||'').toLowerCase().replace(/^www\./,'').split('.').filter(Boolean);
 const base=parts.length>2&&parts[parts.length-2].length<=3?parts[parts.length-3]:parts.length>1?parts[parts.length-2]:parts[0]||'';
 return base.split(/[-_]+/).filter(Boolean).map(w=>w[0].toUpperCase()+w.slice(1)).join(' ')||domain||'Unknown brand';
}
// Search-result title to brand name: cleaned, cut at the first separator, and the domain's brand part when nothing sensible is left.
export function companyFrom(raw,domain,{split=true}={}){
 const cleaned=cleanCompany(raw);
 const name=(split?cleaned.split(/[|\-\u2013\u2014:\u2022]/)[0]:cleaned).trim();
 return markupish(name)?brandFromDomain(domain):name;
}

// Google's s2 favicon service answers with a 16x16 globe for sites it has no icon for. Any image that small is not a usable brand mark.
export const DEFAULT_FAVICON_SHA256=new Set(['59bfe9bc385ad69f50793ce4a53397316d7a875a7148a63c16df9b674c6cda64']);
export function imageSize(data,type=''){
 try{
  if(data.length>24&&data.readUInt32BE(0)===0x89504e47)return {w:data.readUInt32BE(16),h:data.readUInt32BE(20)};
  if(data.length>10&&data.toString('latin1',0,3)==='GIF')return {w:data.readUInt16LE(6),h:data.readUInt16LE(8)};
  if(data.length>8&&data.readUInt16LE(0)===0&&data.readUInt16LE(2)===1){let w=0,h=0;for(let i=0;i<Math.min(data.readUInt16LE(4),32);i++){w=Math.max(w,data[6+i*16]||256);h=Math.max(h,data[7+i*16]||256);}return {w,h};}
  if(data[0]===0xff&&data[1]===0xd8){for(let i=2;i<data.length-9;){if(data[i]!==0xff){i++;continue;}const m=data[i+1];if(m>=0xc0&&m<=0xcf&&![0xc4,0xc8,0xcc].includes(m))return {h:data.readUInt16BE(i+5),w:data.readUInt16BE(i+7)};i+=2+data.readUInt16BE(i+2);}}
 }catch{}
 return null;
}
export function isDefaultFavicon(data,type){
 if(DEFAULT_FAVICON_SHA256.has(createHash('sha256').update(data).digest('hex')))return true;
 const size=imageSize(data,type);
 return Boolean(size&&Math.max(size.w,size.h)<=16);
}
const visionTypes=new Set(['image/png','image/jpeg','image/gif','image/webp']);

// Resolves the brand logo, drops the default globe, then has the vision checker look at it. check: ({data,type,company,domain}) => {data:{isRealLogo,matchesBrand,quality,reason},cost,model}
export async function logoGate({lead,dir=path.join(dataDir,'logos'),resolve=resolveLogo,read=readLogo,check,onSpend=()=>{}}){
 let hit=null;
 try{hit=await resolve({lead,dir,onSpend});}catch{}
 if(!hit)return {ok:false,reason:'No logo found',cost:0};
 let img;try{img=read(hit);}catch{return {ok:false,reason:'No logo found',cost:0};}
 if(!img?.data?.length||isDefaultFavicon(img.data,img.type))return {ok:false,reason:'No logo found',detail:'only a default or tiny placeholder icon',cost:0};
 if(!visionTypes.has(img.type))return {ok:true,checked:false,source:hit.source,cost:0,logo:{source:hit.source,checked:false}};
 const out=await check({data:img.data,type:img.type,company:lead.company,domain:lead.domain});
 const c=out.data,bad=!c.isRealLogo||!c.matchesBrand;
 const logo={source:hit.source,checked:true,isRealLogo:c.isRealLogo,matchesBrand:c.matchesBrand,quality:c.quality,reason:c.reason};
 return bad?{ok:false,reason:`Logo failed the check: ${c.reason}`,short:c.isRealLogo?'logo does not match this brand':'logo is not a real brand mark',cost:out.cost,model:out.model,logo}:{ok:true,checked:true,source:hit.source,cost:out.cost,model:out.model,logo};
}

// The shared gate for new leads and requalify: socials, then logo, then the Haiku brand grader. Never touches Gmail.
// tools: {logo({lead,onSpend}), value({lead,site,socials,exa})}; spend(usd,provider,note); log(type,title,extra).
export async function gateLead({lead,socials,site={},exa={},tools,spend=()=>{},log=()=>{}}){
 const at=()=>new Date().toISOString();
 const reject=(reason,title,extra={})=>({pass:false,reason,title,value:{score:extra.score??0,verdict:'reject',reason,checkedAt:at(),...(extra.logo?{logo:extra.logo}:{})}});
 if(!hasSocial(socials))return reject(NO_SOCIALS,`Skipped ${lead.company}: no Instagram or TikTok`);
 log('tool_call',`Checking the logo for ${lead.company}`,{tool:'logo'});
 const logo=await tools.logo({lead,onSpend:usd=>spend(usd,'exa','logo lookup (contents)')});
 spend(logo.cost,'claude','logo check');
 if(!logo.ok)return reject(logo.reason,`Skipped ${lead.company}: ${logo.short||'no logo found'}`,{logo:logo.logo});
 log('tool_call',`Grading brand quality for ${lead.company}`,{tool:'claude.value'});
 const graded=await tools.value({lead,site,socials,exa});
 spend(graded.cost,'claude','brand value check');
 const g=graded.data,score=Math.max(0,Math.min(100,Math.round(g.valueScore)));
 const value={score,verdict:g.verdict,reason:g.reason,checkedAt:at(),...(logo.logo?{logo:logo.logo}:{})};
 if(g.verdict==='reject'||score<VALUE_MIN)return {...reject(g.reason,`Skipped ${lead.company}: low-value brand (${score}/100). ${g.reason}`,{score,logo:logo.logo}),value:{...value,verdict:'reject'},model:graded.model};
 return {pass:true,value,model:graded.model};
}

// POST /api/leads/requalify. Re-grades leads from before the gate existed. Rejects are only marked: nothing is deleted and no Gmail call is made.
// Drafts of rejected leads are listed so they can be removed by hand.
const SKIP_STATUSES=new Set(['rejected','visiting','grading','drafting','contacted','replied','won','lost']);
export function createRequalifier({store,tools,concurrency=4}){
 let busy=false;
 return {
  get busy(){return busy;},
  async run(){
   if(busy)throw Object.assign(new Error('Requalify is already running.'),{status:409});
   busy=true;
   try{
    const todo=store.listLeads().filter(l=>!l.value&&!SKIP_STATUSES.has(l.status)).reverse();
    const out={checked:0,kept:0,rejected:[],unchecked:[],withdrawnDrafts:[]};
    const one=async lead=>{
     const spend=(usd,provider,note)=>{if(usd>0){if(lead.task_id)store.addCost(lead.task_id,usd);store.addSpend({provider,usd,taskId:lead.task_id||null,note:`requalify: ${note}`});}};
     let page;
     try{page=await tools.fetchHome(lead.url||`https://${lead.domain}/`);}
     catch(error){out.unchecked.push({id:lead.id,company:lead.company,reason:`Could not load the site: ${error.message}`});return;}
     if(!page?.links?.length){out.unchecked.push({id:lead.id,company:lead.company,reason:'The page had no links (it may need a browser), so it was not judged'});return;}
     const socials=page.socials||extractSocials(page.links);
     const fixed=/[<>]/.test(lead.company||'')?companyFrom(lead.company,lead.domain,{split:false}):null;
     if(fixed)lead=store.updateLead(lead.id,{company:fixed});
     let gate;
     try{gate=await gateLead({lead,socials,site:{homeText:(page.text||'').slice(0,3000),contactText:'',best:null},exa:{title:lead.company,url:lead.url,text:lead.evidence||''},tools,spend});}
     catch(error){out.unchecked.push({id:lead.id,company:lead.company,reason:`Check failed: ${error.message}`});return;}
     out.checked++;
     if(gate.pass){store.updateLead(lead.id,{socials,value:gate.value});out.kept++;return;}
     store.updateLead(lead.id,{socials,status:'rejected',notes:gate.reason,value:gate.value});
     store.addEvent({taskId:lead.task_id||null,leadId:lead.id,type:'decision',tool:'requalify',title:gate.title});
     out.rejected.push({id:lead.id,company:lead.company,reason:gate.reason});
     for(const d of store.listDrafts({leadId:lead.id}))if(d.status!=='sent'&&d.gmail_url)out.withdrawnDrafts.push({leadId:lead.id,to:d.to_email,gmail_url:d.gmail_url});
    };
    let i=0;
    await Promise.all(Array.from({length:Math.min(concurrency,todo.length)},async()=>{while(i<todo.length)await one(todo[i++]);}));
    out.rejected.sort((a,b)=>a.id-b.id);
    return out;
   }finally{busy=false;}
  }
 };
}
