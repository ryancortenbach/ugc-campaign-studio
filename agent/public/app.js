import {mountTaskReviewQueue} from './task-review-queue.js';
import {mountChatActivity} from './chat-activity.js';
import {renderActive,reviewReady,renderGroup,renderLength,renderModel,watchRecords} from './render-monitor.js';
import {icons} from './icons.js';
import {voicesView} from './voices.js';
import {connectionStatus} from './connection-status.js';
import {ideationPanel} from './brand-ideation.js';
import {buildGroups,pairTools} from './live-feed-model.js';
import {paidTaskOrders,taskSection,sortTaskGroups} from './task-list-model.js';
import {notificationIcon,eventNotification} from './provider-notifications.js';
import {primaryLeadStatus,contactSummary} from './lead-badges.js';
// tool-logs.js is untracked: load it dynamically and fall back to plain log rows if it is missing.
const {toolLogDetails}=await import('./tool-logs.js').catch(()=>({toolLogDetails:null}));
const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const time=at=>at?new Date(at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}):'';
const ago=at=>{const s=Math.max(0,(Date.now()-new Date(at))/1000);return s<60?`${Math.floor(s)}s ago`:s<3600?`${Math.floor(s/60)}m ago`:s<86400?`${Math.floor(s/3600)}h ago`:new Date(at).toLocaleDateString();};
const money=n=>`$${Number(n||0).toFixed(Number(n)<1?4:2)}`;
async function api(path,body){const res=await fetch(path,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await res.json().catch(()=>({}));if(!res.ok)throw Error(data.error||`HTTP ${res.status}`);return data;}
const glyph={ok:'<path d="M5 12.5l4.5 4.5L19 7.5"/>',bad:'<path d="M7 7l10 10M17 7L7 17"/>',run:'<path d="M12 4a8 8 0 1 0 8 8"/>',wait:'<circle cx="12" cy="12" r="8"/><path d="M12 8v4.5l3 1.8"/>',you:'<path d="M12 6v8M12 17.5v.5"/>',idle:'<circle cx="12" cy="12" r="8"/><path d="M6.5 17.5l11-11"/>',info:'<path d="M12 11v6M12 7.5v.5"/>',
 play:'<path d="M8 5.5v13l10.5-6.5z" style="fill:currentColor"/>',pause:'<path d="M8.5 6v12M15.5 6v12"/>',stop:'<rect x="6.5" y="6.5" width="11" height="11" rx="1.5" style="fill:currentColor"/>',clone:'<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6A1.5 1.5 0 0 0 14 4.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5"/>',
 open:'<path d="M14 4.5h5.5V10M19.5 4.5L11 13M17 13.5v5a1 1 0 0 1-1 1H5.5a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h5"/>',mail:'<rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="M4 7l8 6 8-6"/>',eye:'<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>'};
const svg=k=>`<svg viewBox="0 0 24 24" aria-hidden="true">${k==='ok'?icons.check:glyph[k]}</svg>`;
const ic=n=>`<svg class="lu" viewBox="0 0 24 24" aria-hidden="true">${icons[n]}</svg>`;
const recentNotices=new Map();
// Compact notifications identify the provider and retain delivery deduplication.
function toast(title,kind='info',sub='',provider=null,key=null){
 let box=$('#toasts');if(!box){box=document.createElement('div');box.id='toasts';document.body.append(box);}
 const keys=(Array.isArray(key)?key:[key]).filter(value=>value!=null).map(String);
 const remember=notice=>{for(const alias of keys)recentNotices.set(alias,notice);while(recentNotices.size>256)recentNotices.delete(recentNotices.keys().next().value);};
 const previous=keys.map(alias=>recentNotices.get(alias)).find(Boolean);if(previous){remember(previous);return previous;}
 const t=document.createElement('div');t.className=`toast t-${kind}`;
 if(keys.length)t.dataset.noticeKey=keys[0];remember(t);t.setAttribute('role',kind==='bad'?'alert':'status');
 const logo=notificationIcon(provider);
 t.innerHTML=`<i${logo?' class="toast-provider"':''}>${logo||svg(kind==='ok'?'ok':kind==='bad'?'bad':'info')}</i><div style="min-width:0"><b>${esc(title)}</b>${sub?`<span>${esc(sub)}</span>`:''}</div><button class="x" title="Dismiss">×</button>`;
 t.querySelector('.x').onclick=()=>t.remove();box.prepend(t);while(box.children.length>4)box.lastChild.remove();setTimeout(()=>t.remove(),kind==='bad'?9000:5000);
 return t;
}

// Status palette from Cyber 4.5: orange working, yellow needs you, green done, red failed, white waiting.
const leadStatus={found:['Queued','s-wait'],qualified:['Research in progress','s-run'],visiting:['Visiting site','s-run'],grading:['Checking fit','s-run'],drafting:['Writing email','s-run'],awaiting_video:['Waiting for video','s-you'],drafted:['Drafted','s-wait'],rejected:['Not a fit','s-idle'],skipped:['Skipped','s-idle'],unreachable:['Site unreachable','s-bad'],error:['Error','s-bad'],contacted:['Contacted','s-ok'],replied:['Replied','s-ok'],won:['Won','s-ok'],lost:['Lost','s-bad']};
const taskStatus={queued:['Queued','s-wait'],running:['Running','s-run'],paused:['Paused','s-wait'],done:['Done','s-ok'],stopped:['Stopped','s-idle'],failed:['Failed','s-bad'],planning:['Planning','s-run'],researching:['Researching','s-run'],research_queued:['Research queued','s-wait'],ready:['Ideas ready','s-ok'],needs_research:['Needs research','s-you']};
const pill=([label,cls])=>`<span class="pill ${cls}">${esc(label)}</span>`;
const sbadge=([label,cls])=>`<span class="sbadge ${cls}"><i>${svg(cls.slice(2))}</i><b>${esc(label)}</b></span>`;
// Small colored chip: icon plus a short label, in the status palette.
const schip=([label,cls],icon,extra='')=>`<span class="schip ${cls}${extra}">${icon?ic(icon):''}${esc(label)}</span>`;
const statusIcon={'s-ok':'circle-check','s-bad':'circle-x','s-you':'circle-alert','s-run':'loader','s-wait':'clock','s-idle':'ban'};
const instaUrl=l=>l.instagram_handle?`https://www.instagram.com/${encodeURIComponent(String(l.instagram_handle).replace(/^@/,''))}/`:(l.socials?.instagram&&/^https:\/\//.test(l.socials.instagram)?l.socials.instagram:'');
const brandSvg=new Set(['instagram','tiktok','youtube','facebook']);
const igMark=()=>`<img class="si" src="${logoSrc('instagram')}" alt="">`;
// Short tag invalidates product-photo caches after a re-scrape.
const photoTag=u=>[...String(u||'')].reduce((h,c)=>(h*31+c.charCodeAt(0))|0,0).toString(36);
// Contact discovery distinguishes personal addresses, shared inboxes and missing email.
function contactChip(l){
 const contact=contactSummary(l);
 return `<span class="schip ${contact.cls}" data-contact-summary title="${esc(contact.detail)}">${ic(contact.icon)}${esc(contact.label)}</span>`;
}
const ls=s=>leadStatus[s]||[s,'s-idle'];const ts=s=>taskStatus[s]||[s,'s-idle'];
const titles={analytics:'Analytics',home:'Home',tasks:'Tasks',leads:'Leads',drafts:'Drafts',storyboards:'Storyboards',renders:'Renders',voices:'Voices',settings:'Settings',production:'Production','client-demo':'Tasks',walkthrough:'Campaign'};
const logoFor=tool=>{const t=String(tool||'').toLowerCase();return t.startsWith('claude')?'claude':t.includes('exa')?'exa':t.startsWith('solari')?'solari':t.startsWith('gmail')?'gmail':t.includes('higgsfield')?'higgsfield':t.includes('elevenlabs')?'elevenlabs':t.includes('whop')?'whop':t.includes('terac')?'terac':t.includes('instagram')?'instagram':null;};
const MARKS={instagram:'data:image/svg+xml;utf8,'+encodeURIComponent("<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\"><defs><linearGradient id=\"g\" x1=\"0\" y1=\"1\" x2=\"1\" y2=\"0\"><stop offset=\"0\" stop-color=\"#FEDA75\"/><stop offset=\".28\" stop-color=\"#FA7E1E\"/><stop offset=\".52\" stop-color=\"#D62976\"/><stop offset=\".78\" stop-color=\"#962FBF\"/><stop offset=\"1\" stop-color=\"#4F5BD5\"/></linearGradient></defs><g fill=\"url(#g)\"><path d=\"M7.0301.084c-1.2768.0602-2.1487.264-2.911.5634-.7888.3075-1.4575.72-2.1228 1.3877-.6652.6677-1.075 1.3368-1.3802 2.127-.2954.7638-.4956 1.6365-.552 2.914-.0564 1.2775-.0689 1.6882-.0626 4.947.0062 3.2586.0206 3.6671.0825 4.9473.061 1.2765.264 2.1482.5635 2.9107.308.7889.72 1.4573 1.388 2.1228.6679.6655 1.3365 1.0743 2.1285 1.38.7632.295 1.6361.4961 2.9134.552 1.2773.056 1.6884.069 4.9462.0627 3.2578-.0062 3.668-.0207 4.9478-.0814 1.28-.0607 2.147-.2652 2.9098-.5633.7889-.3086 1.4578-.72 2.1228-1.3881.665-.6682 1.0745-1.3378 1.3795-2.1284.2957-.7632.4966-1.636.552-2.9124.056-1.2809.0692-1.6898.063-4.948-.0063-3.2583-.021-3.6668-.0817-4.9465-.0607-1.2797-.264-2.1487-.5633-2.9117-.3084-.7889-.72-1.4568-1.3876-2.1228C21.2982 1.33 20.628.9208 19.8378.6165 19.074.321 18.2017.1197 16.9244.0645 15.6471.0093 15.236-.005 11.977.0014 8.718.0076 8.31.0215 7.0301.0839m.1402 21.6932c-1.17-.0509-1.8053-.2453-2.2287-.408-.5606-.216-.96-.4771-1.3819-.895-.422-.4178-.6811-.8186-.9-1.378-.1644-.4234-.3624-1.058-.4171-2.228-.0595-1.2645-.072-1.6442-.079-4.848-.007-3.2037.0053-3.583.0607-4.848.05-1.169.2456-1.805.408-2.2282.216-.5613.4762-.96.895-1.3816.4188-.4217.8184-.6814 1.3783-.9003.423-.1651 1.0575-.3614 2.227-.4171 1.2655-.06 1.6447-.072 4.848-.079 3.2033-.007 3.5835.005 4.8495.0608 1.169.0508 1.8053.2445 2.228.408.5608.216.96.4754 1.3816.895.4217.4194.6816.8176.9005 1.3787.1653.4217.3617 1.056.4169 2.2263.0602 1.2655.0739 1.645.0796 4.848.0058 3.203-.0055 3.5834-.061 4.848-.051 1.17-.245 1.8055-.408 2.2294-.216.5604-.4763.96-.8954 1.3814-.419.4215-.8181.6811-1.3783.9-.4224.1649-1.0577.3617-2.2262.4174-1.2656.0595-1.6448.072-4.8493.079-3.2045.007-3.5825-.006-4.848-.0608M16.953 5.5864A1.44 1.44 0 1 0 18.39 4.144a1.44 1.44 0 0 0-1.437 1.4424M5.8385 12.012c.0067 3.4032 2.7706 6.1557 6.173 6.1493 3.4026-.0065 6.157-2.7701 6.1506-6.1733-.0065-3.4032-2.771-6.1565-6.174-6.1498-3.403.0067-6.156 2.771-6.1496 6.1738M8 12.0077a4 4 0 1 1 4.008 3.9921A3.9996 3.9996 0 0 1 8 12.0077\"/></g></svg>"),tiktok:'data:image/svg+xml;utf8,'+encodeURIComponent("<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\"><rect width=\"24\" height=\"24\" rx=\"5.5\" fill=\"#000\"/><g transform=\"translate(5.2 5.2) scale(.6)\"><g transform=\"translate(-.9 -.7)\" fill=\"#25F4EE\"><path d=\"M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z\"/></g><g transform=\"translate(.9 .7)\" fill=\"#FE2C55\"><path d=\"M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z\"/></g><g fill=\"#fff\"><path d=\"M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z\"/></g></g></svg>"),youtube:'data:image/svg+xml;utf8,'+encodeURIComponent("<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\"><g fill=\"#FF0000\"><path d=\"M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z\"/></g></svg>"),facebook:'data:image/svg+xml;utf8,'+encodeURIComponent("<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 24 24\"><g fill=\"#1877F2\"><path d=\"M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z\"/></g></svg>")};
// The server does not serve .svg, so the four social marks ship inline.
const logoSrc=name=>MARKS[name]||`/logos/${name}.png`;
const logoTile=(name,cls='ico')=>`<span class="${cls}"><img src="${logoSrc(name)}" alt=""></span>`;

const state={config:null,tasks:[],mission:null,selectedLead:null,openEvents:new Set(),live:[],lastStep:new Map(),gmail:new Map(),dm:new Map(),dr:new Map(),openSess:new Set(),openKids:new Set(),logOpen:new Set(),sdata:new Map(),conns:null,connsApi:false,spendData:null,spendTotal:false,whop:null,whopConfirm:null,hashOpened:null};
const pref={get(k,d){try{return localStorage.getItem(k)||d;}catch{return d;}},set(k,v){try{localStorage.setItem(k,v);}catch{}}};
const tab=()=>(location.hash.slice(2).split('?')[0].split('/')[0]||'home');

async function loadState(){const d=await api('/api/state');state.config=d.config;state.tasks=d.tasks;renderShell();}
// Plain GET that returns null instead of throwing, so a backend route that does not exist yet (404) falls back quietly.
async function tryGet(path){try{const res=await fetch(path);if(!res.ok)return null;return await res.json();}catch{return null;}}
// Connections: use /api/connections when it exists, else the integration list from /api/state.
function connRows(){
 const src=Array.isArray(state.conns)&&state.conns.length?state.conns:(state.config?.integrations||[]).map(i=>({id:i.id,name:i.name,on:i.on,ok:i.on,detail:i.detail}));
 return src.map(i=>({...i,st:connectionStatus(i)}));
}
function renderShell(){
 const c=state.config;if(!c)return;
 $('#pagetitle').textContent=(tab()==='orders'?'Client brief':titles[tab()])||'Home';
 document.querySelectorAll('#tabs a,#tabs-foot a').forEach(a=>a.classList.toggle('on',a.dataset.tab===(tab()==='drafts'?'leads':tab()==='orders'?'tasks':tab())));
 const rt=document.querySelector('#tabs a[data-tab="renders"]');rt.querySelector('.badge')?.remove();{const n=c.stats.needsYou??c.stats.reviews;if(n)rt.insertAdjacentHTML('beforeend',`<span class="badge" title="Renders waiting for your approval or review">${n}</span>`);}
 const rows=connRows(),bad=rows.filter(r=>r.st[1]==='s-bad'||r.st[1]==='s-you').length,errs=rows.filter(r=>r.st[1]==='s-bad').length;
 $('#intdot').className=`dot ${bad?(errs?'off':'part'):'on'}`;
 $('#intlabel').textContent=bad?`${bad} need${bad===1?'s':''} attention`:rows.every(r=>r.verification==='verified')?'All connected':'Connections ready';
 $('#intbtn').classList.toggle('warn',Boolean(bad));
 if(railTab==='conn')paintConns();
}
const providerName={claude:'Claude',exa:'Exa',solari:'Solari',higgsfield:'Higgsfield',whop:'Whop',gmail:'Gmail',elevenlabs:'ElevenLabs'};
const logoImg=(id,name)=>`<span class="plogo"><img src="/logos/${esc(id)}.png" alt="" onerror="this.remove()"><b>${esc((name||id||'?')[0])}</b></span>`;
// Spend tab: /api/costs when the backend has it, else /api/spend.
// Money in the normal UI font: two decimals, under a cent reads <$0.01, zero reads $0.
const usd=n=>{if(n==null||!Number.isFinite(Number(n)))return '';n=Number(n);return n===0?'$0':n<0.01?'<$0.01':'$'+n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});};
const kfmt=n=>{n=Number(String(n).replace(/,/g,''));return n>=1000?`${Math.round(n/1000)}k`:String(n);};
// Spend tab: /api/costs when the backend has it, else /api/spend. Whop revenue comes from /api/whop and is shown as Collected.
async function renderSpend(){
 const [costs,whop]=await Promise.all([tryGet('/api/costs'),tryGet('/api/whop')]);
 if(costs&&Array.isArray(costs.providers)){
  state.spendData={all:Number(costs.allTimeUsd||0),today:Number(costs.todayUsd||0),partial:costs.coverage!=='complete',basis:costs.basis,providers:costs.providers.map(p=>({id:p.id,name:p.name||providerName[p.id]||p.id,spent:p.spentUsd,today:p.todayUsd,balance:p.balanceUsd,usage:p.usage,detail:p.detail,billingUrl:p.billingUrl,coverage:p.coverage,accountEstimate:p.accountEstimateUsd}))};
 }else{
  const s=await tryGet('/api/spend');if(!s)return;
  state.spendData={all:Number(s.total||0),today:Number(s.today||0),providers:(s.providers||[]).map(p=>({id:p.provider,name:providerName[p.provider]||p.provider,spent:p.total,today:p.today,balance:null,usage:`${p.count} charge${p.count===1?'':'s'}`,detail:''}))};
 }
 if(whop&&Array.isArray(whop.orders)){const paid=whop.orders.filter(o=>o.status==='paid');state.spendData.earned={sum:paid.reduce((n,o)=>n+(Number(o.amount)||0),0),count:paid.length};}
 else state.spendData.earned=null;
 if(railTab==='spend')paintSpend();
}
function paintSpend(){
 const d=state.spendData;if(!d){$('#spendbody').innerHTML='<div class="empty">Loading.</div>';return;}
 const list=d.providers.filter(p=>p.id!=='whop').sort((a,b)=>(Number(b.spent)||0)-(Number(a.spent)||0));
 const chipFor=p=>{
  if(p.accountEstimate!=null)return '<span class="sp-chip">This month</span>';
  if(p.id==='terac'&&p.balance!=null)return `<span class="sp-chip">${esc('$'+(Number(p.balance)%1?Number(p.balance).toFixed(2):Number(p.balance)))} credit</span>`;
  const m=String(p.usage||'').match(/([\d,]+) of ([\d,]+) char/);
  return m?`<span class="sp-chip">${kfmt(m[1])} of ${kfmt(m[2])} chars</span>`:'';
 };
 $('#spendbody').innerHTML=`<div class="sp-tiles">${d.earned?`<div class="sp-tile"><span class="sp-lab"><img src="/logos/whop.png" alt="">Collected</span><b>${usd(d.earned.sum)}</b><i>${d.earned.count} paid order${d.earned.count===1?'':'s'}</i></div>`:''}<div class="sp-tile"><span class="sp-lab" title="${esc(d.basis||'Priced calls recorded by Mint')}">Recorded spend</span><b>${usd(d.all)}</b><i>Today ${usd(d.today)||'$0'}${d.partial?' · Partial':''}</i></div></div>
 <div class="sp-list">${list.map(p=>{const known=p.spent!=null,share=d.all>0&&known?Math.min(100,(Number(p.spent)/d.all)*100):0;return `<details class="sp-provider"><summary class="sp-row" title="${esc(p.detail||'')}">${logoImg(p.id,p.name)}<div class="sp-name"><div class="sp-top"><b>${esc(p.name)}</b>${chipFor(p)}</div><i class="sp-bar"><b style="width:${share>0?Math.max(share,1.5).toFixed(1):0}%"></b></i></div><span class="sp-amt">${p.accountEstimate!=null?usd(p.accountEstimate)+' est.':known?usd(p.spent):p.id==='elevenlabs'?'Usage only':p.balance!=null?'Balance only':'Not synced'}</span></summary><div class="sp-detail"><p>${esc(p.detail||'Account spending has not been synced.')}</p>${p.billingUrl?`<a class="chip" href="${esc(p.billingUrl)}" target="_blank" rel="noopener">Open billing</a>`:''}</div></details>`;}).join('')||'<div class="empty">No spend yet.</div>'}</div>`;
}
// Connections tab: logo, name, one status word, and when it was last checked.
async function loadConns(refresh){
 const r=await tryGet('/api/connections'+(refresh?'?refresh=1':''));
 const list=Array.isArray(r)?r:Array.isArray(r?.connections)?r.connections:null;
 state.conns=list;state.connsApi=Boolean(list);renderShell();
}
function paintConns(){
 const rows=connRows();
 $('#connbody').innerHTML=`<div class="conn-head"><span class="faint">${rows.filter(r=>r.verification==='verified').length} verified · ${rows.filter(r=>['configured','reachable'].includes(r.verification)).length} ready</span>${state.connsApi?`<button type="button" class="iconbtn" id="connrefresh" data-tip="Check again" aria-label="Check again">${ic('refresh-cw')}</button>`:''}</div>
 <div class="conn-list">${rows.map(r=>`<div class="conn-row">${logoImg(r.id,r.name)}<div class="conn-name" title="${esc(r.detail||'')}"><b>${esc(r.name)}</b><span><small>${r.checkedAt?`Checked ${esc(ago(r.checkedAt))}${r.latencyMs!=null&&r.on?` · ${Math.round(r.latencyMs)} ms`:''}`:''}</small></span></div><span class="schip ${r.st[1]}">${ic(r.st[2])}${r.st[0]}</span></div>`).join('')}</div>`;
 const b=$('#connrefresh');if(b)b.onclick=async()=>{b.disabled=true;b.classList.add('spin');await loadConns(true);};
}
// The right rail has three tabs. Live is the agent's activity, Spend and Connections replace the old top bar dropdowns.
const railTabs=[['live','Live','activity'],['spend','Spend','wallet'],['conn','Connections','plug'],['browser','Browser','globe']];
let railTab=pref.get('railtab','live');if(!railTabs.some(t=>t[0]===railTab))railTab='live';
function setRailTab(t){
 railTab=t;pref.set('railtab',t);
 $('#rtabs').innerHTML=railTabs.map(([k,l,i])=>`<button type="button" role="tab" class="rtab${k===t?' on':''}" data-rtab="${k}" aria-selected="${k===t}" data-tip="${l}" aria-label="${l}">${k==='browser'?'<img src="/logos/solari.png" alt="" width="18" height="18">':ic(i)}</button>`).join('');
 $('#rtabs').querySelectorAll('[data-rtab]').forEach(b=>b.onclick=()=>setRailTab(b.dataset.rtab));
 $('#livefeed').hidden=t!=='live';$('#spendbody').hidden=t!=='spend';$('#connbody').hidden=t!=='conn';$('#browserbody').hidden=t!=='browser';
 if(t==='spend'){paintSpend();renderSpend().catch(()=>{});}
 if(t==='conn'){paintConns();loadConns().catch(()=>{});}
}
// The rail is a pullout: the button docks it or tucks it away, and counts what arrived while it was hidden.
let railUnseen=0;
function setRail(open){
 pref.set('rail',open?'on':'off');document.body.classList.toggle('rail-off',!open);if(open)railUnseen=0;
 const b=$('#railbtn'),tip=open?'Hide side panel':'Show side panel';
 b.innerHTML=ic(open?'panel-right-close':'panel-right-open')+(railUnseen?`<span class="badge">${railUnseen>99?'99+':railUnseen}</span>`:'');
 b.dataset.tip=tip;b.setAttribute('aria-label',tip);b.setAttribute('aria-pressed',String(open));
}
function openRail(t){setRail(true);setRailTab(t);}
$('#railbtn').onclick=()=>setRail(document.body.classList.contains('rail-off'));
$('#intbtn').onclick=()=>openRail('conn');
$('#spendbtn').onclick=()=>openRail('spend'); // hidden: the desktop QA snapshot hook clicks it to show the Spend tab
$('#analyticsbtn').innerHTML=ic('chart-line');$('#analyticsbtn').onclick=()=>{location.hash='#/analytics';};
setRail(pref.get('rail','on')==='on');setRailTab(railTab);
import('./browser-panel.js').then(m=>m.mountBrowserPanel({root:$('#browserbody'),api,esc,toast,openRail:()=>openRail('browser')})).catch(()=>{});
setInterval(()=>{if(!document.hidden)loadConns().catch(()=>{});},60000);

const toolLabels={'claude.plan':'Claude planning','claude.score':'Claude grading','claude.draft':'Claude writing','claude.steer':'Claude steering','gmail.drafts.create':'Gmail draft','solari.browser':'Solari browser','fetch':'Web fetch','crm':'CRM','crm.create':'CRM','rules':'Rules','operator':'You','exa':'Exa','exa.search (REST)':'Exa search','exa.web_search_exa (MCP)':'Exa search'};
const host=u=>{try{return new URL(u).hostname.replace(/^www\./,'');}catch{return '';}};
const hueOf=str=>{let h=0;for(const ch of String(str||'?'))h=(h*31+ch.charCodeAt(0))>>>0;return h%360;};
// Logo sits on a light tile so every mark has the same clean background. The soft colored tile with a letter only shows when no logo loads.
const brandThumb=(l,size='')=>{const nm=l.company||l.domain||'?',h=hueOf(nm);return `<span class="thumb ${size}" style="--th:hsl(${h} 45% 86%);--tc:hsl(${h} 40% 30%)"><b>${esc(nm[0].toUpperCase())}</b>${l.id?`<img src="/api/leads/${l.id}/logo" alt="" loading="lazy" onerror="this.remove()">`:''}</span>`;};
const socialNames={instagram:'Instagram',tiktok:'TikTok',youtube:'YouTube',x:'X',facebook:'Facebook'};
const socMark=k=>brandSvg.has(k)?`<img class="si" src="${logoSrc(k)}" alt="">`:`<svg class="si" viewBox="0 0 24 24">${icons['si-'+k]}</svg>`;
const socialLinks=(l,big)=>{const items=['instagram','tiktok','x','youtube','facebook'].map(k=>[k,l.socials?.[k]]).filter(([k,u])=>u&&/^https:\/\//.test(u)).map(([k,u])=>`<a class="${big?'chip soc':'soc'}" data-social="${k}" href="${esc(u)}" target="_blank" rel="noopener" onclick="event.stopPropagation()" data-tip="${socialNames[k]}" aria-label="${socialNames[k]}">${socMark(k)}${big?socialNames[k]:''}</a>`).join('');return big||!items?items:`<span class="socs">${items}</span>`;};
const gmailBtn=(url,cls='btn sm')=>`<a class="${cls} gm" href="${esc(url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()"><img src="/logos/gmail.png" alt="">Open in Gmail</a>`;
const toolName=t=>{const raw=String(t||'').replace(/\s*\(claude-.*\)$/,'');return toolLabels[raw]||toolLabels[raw.split(' ')[0]]||(raw.startsWith('exa')?'Exa search':raw);};
// Older log lines carry fit scores and page titles with long dashes; show them without either.
const tidy=t=>String(t??'').replace(/\s*\(fit \d+\)/g,'').replace(/\s*\u2014\s*/g,', ');
const isNow=e=>e.type==='tool_call'&&state.lastStep.get(e.task_id)===e&&state.tasks.some(t=>t.id===e.task_id&&t.status==='running');
// The rail shows what the agent is doing and decided; raw results and status chatter stay in the mission console.
const railTypes=new Set(['plan','lead','decision','tool_call','tool_result','draft','done','error','steer','email_sent','sent','email_received','inbound','reply','replied','received']);
const hhmm=at=>new Date(at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',hour12:false});
// Rail lines are a short label plus the brand or address; clicking one opens the full step.
function brief(e){
 const t=tidy(e.title),tool=String(e.tool||''),m=re=>(t.match(re)||[])[1]||'';
 const notice=eventNotification(e);if(notice)return [notice.title,t];
 if(e.type==='lead')return ['New lead found',m(/^New lead: (.+?)(?:, | \()/)];
 if(e.type==='draft')return [/^Draft ready in Gmail/.test(t)?'Draft saved in Gmail':'Draft saved',m(/for (\S+@[^\s]+?)\.? Not sent/)];
 if(e.type==='done')return ['Mission finished',m(/^Finished: (\d+ draft)/)?`${m(/^Finished: (\d+) draft/)} drafts`:''];
 if(e.type==='error')return ['Something failed',''];
 if(e.type==='plan')return ['Plan ready',''];
 if(e.type==='steer')return ['Steer noted',''];
 if(e.type==='decision')return /^Pursuing/.test(t)?['Good fit',m(/^Pursuing ([^:]+)/)]:/^Skipped/.test(t)?['Skipped',m(/^Skipped ([^:]+)/)]:[t.split(':')[0].slice(0,100),''];
 if(tool.startsWith('claude.plan'))return ['Planning the search',''];
 if(tool.startsWith('exa'))return ['Searching Exa',''];
 if(tool.startsWith('solari')||tool==='fetch')return ['Visiting site',host(m(/^Visiting (\S+)/))];
 if(tool.startsWith('claude.score'))return ['Checking fit',m(/^Grading fit for ([^,]+)/)];
 if(tool.startsWith('claude.draft'))return ['Writing email',m(/^Writing email to (\S+)/)];
 if(tool.startsWith('gmail'))return ['Saving to Gmail',''];
 return [t.split(':')[0].slice(0,100),''];
}
// Trace feed: a main event first (avatar, title, subtitle), its tool calls as compact lines traced under it.
// Tool events attach to the nearest following main event of the same task (and lead, when both have one).
const isTraceEv=e=>e.type==='tool_call'||e.type==='tool_result';
const leadNames=new Map();
const noteLead=e=>{if(e.lead_id&&e.type==='lead'){const m=String(e.title||'').match(/^New lead: (.+?) \(/);if(m)leadNames.set(e.lead_id,m[1]);}};
const kidKey=k=>(k.call||k.result).id;
function avatar(e){
 const provider=logoFor(e.tool)||(e.tool==='sentwatch'?'gmail':null);
 if(['higgsfield','gmail'].includes(provider))return logoTile(provider);
 if(e.lead_id){const nm=leadNames.get(e.lead_id)||brief(e)[1]||'?';return brandThumb({id:e.lead_id,company:nm});}
 if(e.tool==='operator')return '<span class="ico">You</span>';
 return logoTile(logoFor(e.tool)||'claude');
}
function kidHTML(k,last){
 const ev=k.call||k.result,[name,subj]=brief(ev),logo=logoFor(ev.tool)||logoFor((k.result||{}).tool),open=state.openKids.has(kidKey(k));
 const bad=k.result?.data?.status==='error'||ev.type==='error',run=k.call&&!k.result&&isNow(k.call);
 return `<div class="tg-kid${open?' open':''}${bad?' bad':''}${run?' run':''}${last?' last':''}" data-kid="${kidKey(k)}"><span class="nd"></span><button type="button" class="kd-main" aria-expanded="${open}">${logo?`<img class="kd-logo" src="${logoSrc(logo)}" alt="">`:''}<span class="kd-name">${esc(name)}${subj?` <i>${esc(subj)}</i>`:''}</span><time>${esc(time(ev.at))}</time></button>${open?`<div class="kd-det">${kidDetails(k)}</div>`:''}</div>`;
}
function kidDetails(k){return [k.call,k.result].filter(Boolean).map(e=>toolLogDetails?toolLogDetails(e,{esc}):`<p>${esc(tidy(e.title))}</p>`).join('');}
function groupHTML(g,{log=false}={}){
 const e=g.latest||g.main,kids=pairTools(g.tools),[head,subj]=brief(e);
 const shown=g.orphan?brief(g.main):[head,subj];
 return `<div class="tg${kids.length?' has-kids':''}${g.orphan?' orphan':''}" data-tg="${e.id}"><div class="li tg-head k-${esc(e.type)}${g.orphan&&isNow(g.main)?' now':''}" data-ev="${e.id}" data-log="${log?1:0}"><span class="tg-av">${avatar(g.main)}</span><div class="tg-t"><div class="msg">${esc(shown[0])}${g.n>1?` <em class="xn">x${g.n}</em>`:''}</div><div class="sub">${shown[1]?`${esc(shown[1])} · `:''}${hhmm(e.at)}</div><div class="more" hidden></div></div></div>${kids.length?`<div class="tg-kids">${kids.map((k,i)=>kidHTML(k,i===kids.length-1)).join('')}</div>`:''}</div>`;
}
const feedIsMain=e=>railTypes.has(e.type);
function liveHTML(){const gs=buildGroups(state.live.slice().reverse(),feedIsMain).reverse().slice(0,40);return gs.length?gs.map(g=>groupHTML(g)).join(''):'<div class="empty">Every step the agent takes shows up here.</div>';}
let liveTimer;
function renderLive(){clearTimeout(liveTimer);const box=$('#livefeed');const top=box.scrollTop;box.innerHTML=liveHTML();box.scrollTop=top;}
const scheduleLive=()=>{clearTimeout(liveTimer);liveTimer=setTimeout(renderLive,120);};
// Main row click shows the full line; kid click opens its details in place. Same behavior in the feed and in session logs.
function toggleMore(li){
 const evs=li.closest('.tgl')?[...state.sdata.values()].flatMap(d=>d.events).concat(state.live):state.live;
 const ev=evs.find(x=>x.id===Number(li.dataset.ev));if(!ev)return;
 const more=li.querySelector('.more'),open=li.classList.toggle('open');more.hidden=!open;
 if(open)more.innerHTML=`<p>${esc(tidy(ev.title))}</p>${ev.detail?`<p class="faint">${esc(tidy(ev.detail))}</p>`:''}<div class="acts">${ev.lead_id?`<button type="button" class="btn sm" data-open="lead" data-id="${ev.lead_id}">Open brand</button>`:''}${ev.task_id&&li.dataset.log!=='1'?`<button type="button" class="btn sm" data-open="task" data-id="${ev.task_id}">Open mission</button>`:''}</div>`;
}
function toggleKid(btn){
 const row=btn.closest('.tg-kid'),id=Number(row.dataset.kid),open=!state.openKids.has(id);
 open?state.openKids.add(id):state.openKids.delete(id);
 const all=[...state.sdata.values()].flatMap(d=>d.events).concat(state.live);
 const call=all.find(x=>x.id===id);if(!call)return;
 const group=row.closest('.tg'),gid=Number(group.dataset.tg);
 const src=all.find(x=>x.id===gid);
 // Rebuild just this kid from its group so the call and its result stay paired.
 const host=group.closest('.tgl')?[...state.sdata.values()].flatMap(d=>d.events):state.live.slice().reverse();
 const gs=buildGroups(host.slice().sort((a,b)=>a.id-b.id),group.closest('.tgl')?(()=>true):feedIsMain);
 const g=gs.find(x=>(x.latest||x.main).id===gid);
 const k=g&&pairTools(g.tools).find(x=>kidKey(x)===id);
 if(k)row.outerHTML=kidHTML(k,row.classList.contains('last'));
}
function traceClick(e){
 const go=e.target.closest('.tgl [data-open]');if(go){e.stopPropagation();openGo(go);return true;}
 const kd=e.target.closest('.tgl .kd-main');if(kd){toggleKid(kd);return true;}
 const li=e.target.closest('.tgl .tg-head');if(li){toggleMore(li);return true;}
 return false;
}
const openGo=go=>{if(go.dataset.open==='lead')openLead(Number(go.dataset.id));else location.hash=`#/tasks/${go.dataset.id}`;};
const noteDraft=e=>{if(e.type==='draft'&&e.lead_id&&e.data?.gmailUrl)state.gmail.set(e.lead_id,e.data.gmailUrl);};
async function loadLive(){const {events}=await api('/api/events');state.live=events.slice().reverse();for(const e of events){if(e.task_id)state.lastStep.set(e.task_id,e);noteDraft(e);noteLead(e);}renderLive();}
$('#livefeed').addEventListener('click',e=>{
 const go=e.target.closest('[data-open]');if(go){e.stopPropagation();openGo(go);return;}
 const kd=e.target.closest('.kd-main');if(kd){toggleKid(kd);return;}
 const li=e.target.closest('.tg-head');if(li)toggleMore(li);
});


const video=r=>r.local_file?`<video src="/renders/${esc(r.local_file)}#t=0.1" controls playsinline preload="metadata"></video>`:r.result_url?`<video src="${esc(r.result_url)}#t=0.1" controls playsinline preload="metadata"></video>`:'';
function reviewCard(r){return `<div class="review" data-review="${r.id}">${video(r)}<div class="rbody">${r.plan?.visualQA?.status==='needs_revision'?`<p class="s-bad">AI review: needs revision. ${esc(r.plan.visualQA.findings[0])}</p>`:''}<div style="font-weight:600">${esc(r.title)}</div><div class="faint" style="font-size:11.5px;margin:2px 0 8px">${esc(r.group_name||'Single shot')} · ${renderLength(r)?esc(renderLength(r))+'s':'Length pending'} · ${esc(r.input.resolution)}${r.estimate_usd?` · about $${esc(r.estimate_usd)}`:''}</div><input type="text" data-note="${r.id}" placeholder="If rejecting, say what to fix"><div style="display:flex;gap:6px;margin-top:8px"><button class="btn sm go" data-decide="approved" data-id="${r.id}">Approve scene</button><button class="btn sm stop" data-decide="rejected" data-id="${r.id}">Reject</button></div></div></div>`;}
function bindReviews(after){document.querySelectorAll('[data-decide]').forEach(b=>b.onclick=async()=>{const id=b.dataset.id;const note=document.querySelector(`[data-note="${id}"]`)?.value||'';try{await api(`/api/renders/${id}/review`,{decision:b.dataset.decide,note});b.dataset.decide==='approved'?toast('Scene approved','ok'):toast('Scene rejected','bad','Use Revise to queue a fixed version.');document.querySelector(`#pop-${id}`)?.remove();after?.();}catch(err){toast(err.message,'bad');}});}
const popped=new Set();
function popReview(r){if(!reviewReady(r)||popped.has(r.id))return;popped.add(r.id);const notice=toast('Video ready','ok',clip(r.title,80),'higgsfield'),link=document.createElement('a');link.href=`#/renders/${r.id}`;link.className='linkbtn';link.textContent='Review';notice.querySelector('div').append(link);}

function startMission(form){form.addEventListener('submit',async e=>{e.preventDefault();const f=e.target,b=f.querySelector('button[type=submit]');if(!f.message.value.trim())return;b.disabled=true;try{const {task}=await api('/api/chat',{message:f.message.value});f.reset();toast('Mission started','ok',`Task ${task.id}`);location.hash=`#/tasks/${task.id}`;}catch(err){toast(err.message,'bad');}finally{b.disabled=false;}});form.message?.addEventListener('keydown',e=>{if(e.key==='Enter'&&(e.metaKey||e.ctrlKey))form.requestSubmit();});}

// Sessions: one full-width row per request. Missions with the same request (case and spacing ignored) share a row.
const isLive=t=>['running','queued','paused'].includes(t.status);
const isWhopTask=t=>/^whop order:/i.test(String(t.prompt||''));
const normPrompt=p=>String(p||'').toLowerCase().replace(/\s+/g,' ').replace(/[\s.!?]+$/,'').trim();
const hash36=str=>{let h=5381;for(const ch of String(str))h=((h*33)^ch.charCodeAt(0))>>>0;return h.toString(36);};
const skey=prompt=>'s'+hash36(normPrompt(prompt));
function sessionGroups(){
 const map=new Map();
 for(const t of state.tasks){const k=t.plan?.kind==='brand_storyboard'?`brand-task-${t.id}`:t.plan?.kind==='client_demo'?`client-task-${t.id}`:skey(t.prompt);if(!map.has(k))map.set(k,{key:k,runs:[]});map.get(k).runs.push(t);}
 const out=[...map.values()];
 for(const g of out){
  g.runs.sort((a,b)=>b.id-a.id);const newest=g.runs[0],live=g.runs.filter(isLive);
  g.title=['brand_storyboard','client_demo'].includes(newest.plan?.kind)?(newest.plan.brand||newest.prompt.replace(/^(?:Storyboard|Client demo|Streetwear demo): /,'')):newest.prompt;g.live=live;g.whop=isWhopTask(newest);
  g.status=(live.find(t=>t.status==='running')||live.find(t=>t.status==='paused')||live[0]||newest).status;
  g.drafts=g.runs.reduce((n,t)=>n+(t.drafts||0),0);g.failed=g.runs.reduce((n,t)=>n+(t.failed||0),0);g.cost=g.runs.reduce((n,t)=>n+(Number(t.cost_usd)||0),0);
 }
 return sortTaskGroups(out);
}
const groupByKey=k=>sessionGroups().find(g=>g.key===k);
function sessControls(g){
 if(!g.live.length||g.whop)return '';
 const run=g.live.find(t=>t.status==='running')||g.live[0];
 const btn=(a,i,tip)=>`<button type="button" class="iconbtn" data-gact="${a}" data-id="${run.id}" data-tip="${tip}" aria-label="${tip}">${ic(i)}</button>`;
 return (run.status==='running'?btn('pause','pause','Pause'):run.status==='paused'?btn('resume','play','Resume'):'')+btn('stop','square','Stop');
}
function sessHead(g,open,nav){
 const idea=['brand_storyboard','client_demo'].includes(g.runs[0]?.plan?.kind),demo=g.runs[0]?.plan?.clientDemo,st=demo?.stage==='revision_required'?['Needs revision','s-you']:demo?.stage==='generation_failed'?['Generation failed','s-bad']:demo?.stage==='rendering'?['Rendering','s-run']:demo?.stage==='final_human_review'?['Needs review','s-you']:ts(g.status),cnt=(cls,icon,n)=>`<span class="scnt ${n?cls:'zero'}" data-tip="${cls==='s-ok'?'Drafts ready':'Failed'}">${ic(icon)}${n}</span>`;
 return `<div class="sess-h" data-sh="${g.key}" ${nav?`data-nav="#/tasks/${g.runs[0].id}" `:''}role="${nav?'link':'button'}" tabindex="0" ${nav?'':`aria-expanded="${open}"`}>
  <span class="schev">${ic(idea||g.whop?'file-text':'chevron-right')}</span>
  <div class="stitle">${g.whop?'<img class="wlogo" src="/logos/whop.png" alt="Whop" data-tip="Whop order">':''}<b>${esc(g.title)}</b></div>
  <div class="smeta">${g.runs.length>1?`<span class="schip s-idle">${g.runs.length} runs</span>`:''}${schip(st,statusIcon[st[1]])}${idea?'':`${g.drafts?cnt('s-ok','check',g.drafts):''}${g.failed?cnt('s-bad','x',g.failed):''}<span class="scost" data-tip="What it cost">${usd(g.cost)||'$0'}</span>`}<span class="sact">${sessControls(g)}</span></div>
 </div>`;
}
function sessionCard(g,{nav=['brand_storyboard','client_demo','client_project'].includes(g.runs[0]?.plan?.kind)||g.whop}={}){
 const open=!nav&&state.openSess.has(g.key);
 return `<div class="sess${open?' open':''}" data-sess="${g.key}">${sessHead(g,open,nav)}${nav?'':`<div class="sess-b"${open?'':' hidden'}>${open?sessBody(g):''}</div>`}</div>`;
}
const sdOf=g=>g.runs.map(r=>state.sdata.get(r.id)).filter(Boolean);
function syncMission(){state.mission={events:[...state.sdata.values()].flatMap(d=>d.events).sort((a,b)=>a.id-b.id)};}
async function loadSession(g){
 await Promise.all(g.runs.map(async r=>{try{const d=await api(`/api/tasks/${r.id}`);d.events.forEach(noteDraft);state.sdata.set(r.id,d);}catch{}}));
 syncMission();
}
function leadsHTML(g){
 const leads=sdOf(g).flatMap(d=>d.leads);
 return `<div class="trow th"><span>Brand</span><span>Where</span><span>Contact</span><span>Status</span><span>Actions</span></div>${leads.map(leadRow).join('')||'<div class="empty">Each brand the agent finds gets its own row here.</div>'}`;
}
const traceHTML=events=>buildGroups(events.slice().sort((a,b)=>a.id-b.id),()=>true).map(g=>groupHTML(g,{log:true})).join('')||'<div class="empty">Nothing yet.</div>';
function consoleHTML(g){return traceHTML(sdOf(g).flatMap(d=>d.events));}
function sessBody(g){
 const logOpen=state.logOpen.has(g.key),run=(g.live[0]||g.runs[0]);
 const children=state.tasks.filter(t=>t.plan?.kind==='brand_storyboard'&&g.runs.some(r=>r.id===t.plan.parentTaskId));
 return `${children.length?`<div class="task-board-stages">${children.map(t=>`<a class="btn sm" href="#/tasks/${t.id}">${esc(t.plan.brand)} ideas</a>`).join('')}</div>`:''}<div class="sess-tools"><button type="button" class="iconbtn" data-showlog="${g.key}" data-tip="${logOpen?'Hide log':'Show log'}" aria-label="${logOpen?'Hide log':'Show log'}" aria-pressed="${logOpen}">${ic('scroll-text')}</button></div>
  <div class="trows bare" data-leads="${g.key}">${leadsHTML(g)}</div>
  <div class="schat"><div class="thread2" data-thread="${g.key}">${threadHTML2(g)}</div>
   <form class="steer2" data-steer="${g.key}" autocomplete="off"><input type="text" name="message" placeholder="Talk to this session, e.g. skip anyone outside NYC" aria-label="Message this session"><button class="iconbtn go" type="submit" data-tip="Send" aria-label="Send">${ic('arrow-up')}</button></form></div>
  <div class="console tgl" data-console="${g.key}"${logOpen?'':' hidden'}>${logOpen?consoleHTML(g):''}</div>`;
}
const bodyEl=k=>document.querySelector(`.sess[data-sess="${k}"] .sess-b`);
function paintBody(g){const el=bodyEl(g.key);if(!el)return;const typed=el.querySelector('[data-steer] input')?.value||'';el.innerHTML=sessBody(g);const i=el.querySelector('[data-steer] input');if(i)i.value=typed;const t=el.querySelector('.thread2');if(t)t.scrollTop=t.scrollHeight;}
async function toggleSess(key){
 const g=groupByKey(key),el=document.querySelector(`.sess[data-sess="${key}"]`);if(!g||!el)return;
 if(['brand_storyboard','client_demo'].includes(g.runs[0]?.plan?.kind)||g.whop){location.hash=`#/tasks/${g.runs[0].id}`;return;}
 const open=!state.openSess.has(key);
 open?state.openSess.add(key):state.openSess.delete(key);
 el.classList.toggle('open',open);el.querySelector('.sess-h').setAttribute('aria-expanded',String(open));
 const body=el.querySelector('.sess-b');body.hidden=!open;
 if(!open){body.innerHTML='';return;}
 body.innerHTML='<div class="empty">Loading.</div>';await loadSession(g);if(state.openSess.has(key))paintBody(g);
}
// Clicks are handled once on the page, so rows can be re-rendered in place without rebinding.
$('#view').addEventListener('click',async e=>{
 const act=e.target.closest('[data-gact]');
 if(act){e.stopPropagation();const id=Number(act.dataset.id),a=act.dataset.gact;act.disabled=true;try{await api(`/api/tasks/${id}/control`,{action:a});toast(`${a[0].toUpperCase()}${a.slice(1)} sent`,'info');}catch(err){toast(err.message,'bad');}act.disabled=false;return;}
 const lg=e.target.closest('[data-showlog]');
 if(lg){const k=lg.dataset.showlog,g=groupByKey(k);if(!g)return;state.logOpen.has(k)?state.logOpen.delete(k):state.logOpen.add(k);paintBody(g);const c=bodyEl(k)?.querySelector('.console');if(c)c.scrollTop=c.scrollHeight;return;}
 if(traceClick(e))return;
 const sh=e.target.closest('[data-sh]');
 if(sh){if(sh.dataset.nav){location.hash=sh.dataset.nav;return;}toggleSess(sh.dataset.sh);return;}
 const row=e.target.closest('.trows .trow[data-id]');
 if(row&&!e.target.closest('a')){openLead(Number(row.dataset.id));return;}
 const wr=e.target.closest('[data-wrun],[data-wconfirm],[data-wcancel]');
 if(wr)return whopAction(wr);
});
$('#view').addEventListener('keydown',e=>{const sh=e.target.closest?.('[data-sh]');if(sh&&e.target===sh&&(e.key==='Enter'||e.key===' ')){e.preventDefault();sh.click();}});
$('#view').addEventListener('submit',async e=>{
 const f=e.target.closest('[data-steer]');
 if(f){e.preventDefault();const g=groupByKey(f.dataset.steer),text=f.message.value.trim();if(!g||!text)return;
  const run=g.live[0]||g.runs[0],b=f.querySelector('button');b.disabled=true;
  try{const s=await api(`/api/tasks/${run.id}/steer`,{message:text});f.reset();toast(s.live?'Sent':'Saved',s.live?'ok':'info',s.live?'It applies before the next step.':'This session is not running.');await loadSession(g);paintBody(g);}
  catch(err){toast(err.message,'bad');}finally{b.disabled=false;}return;}
 const bf=e.target.closest('[data-wbrand]');
 if(bf){e.preventDefault();const domain=bf.domain.value.trim();if(!domain)return;const b=bf.querySelector('button');b.disabled=true;
  try{await api(`/api/whop/orders/${encodeURIComponent(bf.dataset.wbrand)}/brand`,{domain});toast('Brand saved','ok','Work starts on this order.');await refreshWhop();}
  catch(err){toast(err.message,'bad');b.disabled=false;}}
});

// Whop orders: each purchase becomes a task. This strip shows the order, its state and the one thing it needs from you.
const whopState={working:['Working','s-run'],needs_brand:['Needs brand','s-you'],ready:['Ready','s-ok'],review:['In review','s-you'],checks_failed:['Checks failed','s-bad'],failed:['Failed','s-bad'],historical:['Earlier order','s-idle']};
const orderPaid=o=>!o.status||/paid|succe|complet/i.test(String(o.status));
const orderAmount=o=>{const n=Number(o.amount);if(!Number.isFinite(n))return '';const cur=String(o.currency||'usd').toUpperCase();return cur==='USD'?`$${n.toFixed(2)}`:`${n.toFixed(2)} ${cur}`;};
function orderRow(o){
 const st=whopState[o.state]||[o.state||'Unknown','s-idle'],id=esc(o.payment_id);
 const who=String(o.buyer_name||'').trim().split(/\s+/)[0];
 let side='';
 if(o.state==='needs_brand')side=`<form class="wbrand" data-wbrand="${id}" autocomplete="off"><input type="text" name="domain" placeholder="Brand website" aria-label="Brand website"><button class="iconbtn go" type="submit" data-tip="Continue" aria-label="Continue">${ic('chevron-right')}</button></form>`;
 else if(['historical','failed','checks_failed'].includes(o.state)&&orderPaid(o)){
  side=state.whopConfirm===o.payment_id?`<span class="wconfirm"><span class="faint">Start work on this order?</span><button type="button" class="btn sm go" data-wrun="${id}">Start</button><button type="button" class="btn sm" data-wcancel="1">Cancel</button></span>`
   :`<button type="button" class="iconbtn" data-wconfirm="${id}" data-tip="Start work on this order" aria-label="Start work on this order">${ic('play')}</button>`;
 }
 const chip=o.state==='ready'?`<a class="schip s-ok" href="#/renders" data-tip="Shots wait in Renders">${ic('circle-check')}Ready${ic('chevron-right')}</a>`:schip(st,statusIcon[st[1]]);
 return `<div class="ord"><img class="wlogo" src="/logos/whop.png" alt="Whop"><a class="ord-t ord-open" href="#/orders/${id}" aria-label="Open ${esc(who||'client')} creative brief"><b>${esc(o.product||'Order')}</b><span>${[orderAmount(o),who].filter(Boolean).map(esc).join(' · ')}</span>${o.error&&['failed','checks_failed'].includes(o.state)?`<span class="s-bad" title="${esc(o.error)}">${esc(clip(o.error,70))}</span>`:''}</a>${chip}<div class="ord-side">${side}</div></div>`;
}
function ordersHTML(){
 const orders=paidTaskOrders(state.whop?.orders);
 return `<div class="orders" id="orders">${orders.slice(0,12).map(orderRow).join('')}</div>`;
}
function paintOrders(){const el=$('#orders');if(!el)return;const section=el.closest('[data-task-section="client"]');el.outerHTML=ordersHTML();if(section){const count=section.querySelectorAll('.ord,.sess').length;section.hidden=!count;section.querySelector('.task-section-count').textContent=count;}}
async function refreshWhop(){state.whop=await tryGet('/api/whop');state.whopConfirm=null;if(tab()==='tasks')paintOrders();}
async function whopAction(el){
 if(el.dataset.wconfirm){state.whopConfirm=el.dataset.wconfirm;paintOrders();return;}
 if(el.dataset.wcancel){state.whopConfirm=null;paintOrders();return;}
 el.disabled=true;
 try{await api(`/api/whop/orders/${encodeURIComponent(el.dataset.wrun)}/run`,{});toast('Order started','ok','A session for it shows up below.');await refreshWhop();softRefresh(route);}
 catch(err){toast(err.message,'bad');el.disabled=false;}
}

// Home stats: metric tiles, Today / Week / Month / Year, a line chart with a crosshair and tooltip, and brand logo markers.
const metricTabs={leads:'Brands found',drafts:'Drafts'};
const metricOf=()=>{const m=pref.get('metric','leads');return metricTabs[m]?m:'leads';};
const providerList=[['claude','Claude'],['exa','Exa'],['solari','Solari'],['higgsfield','Higgsfield'],['elevenlabs','ElevenLabs']];
const CH={W:600,H:120};
const money4=v=>`$${v.toFixed(4)}`;
const when=(d,o)=>new Date(d).toLocaleString('en-US',o);
const unitOf=r=>r==='today'?'hour':r==='year'?'month':'day';
function bucketTitle(m,b){
 const f=new Date(b.from),t=new Date(new Date(b.to)-1),o={month:'short',day:'numeric'};
 if(m.range==='today')return `${when(f,{month:'short',day:'numeric',hour:'numeric'})} to ${when(new Date(b.to),{hour:'numeric'})}`;
 if(m.range==='year')return `${when(f,o)} to ${when(t,o)}`;
 return when(f,{weekday:'short',...o});
}
// One short line that says what the number is and over which dates.
function explain(m,k){
 const what={drafts:'Drafts created',leads:'Brands found',spend:'Dollars spent'}[k],unit=unitOf(m.range),first=m.series[0],last=m.series[m.series.length-1];
 const span=m.range==='today'?'today':m.range==='year'?`${when(first.from,{month:'short',year:'numeric'})} to ${when(last.from,{month:'short',year:'numeric'})}`:`${when(first.from,{month:'short',day:'numeric'})} to ${when(last.from,{month:'short',day:'numeric'})}`;
 return `${what} per ${unit}${m.range==='today'?' today':`, ${span}`}${k==='spend'?', all providers':''}`;
}
function chart(m,k){
 const {W,H}=CH,isMoney=k==='spend',values=m.series.map(b=>b[k]),n=values.length,max=Math.max(...values,isMoney?0.01:1);
 const x=i=>n===1?W/2:6+i*(W-12)/(n-1),y=v=>H-4-(v/max)*(H-14);
 const line=`M${values.map((v,i)=>`${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' L')}`;
 const fmt=v=>isMoney?money4(v):v;
 const labels=m.series.map(b=>b.label);
 return `<div class="chart"><span class="ymax">${fmt(max===0.01&&isMoney?0:max)}</span><div class="plot" tabindex="0" role="group" aria-label="${esc(metricTabs[k])} chart. Use the left and right arrow keys to read each ${unitOf(m.range)}."><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><path class="grid" d="M0,${y(max).toFixed(1)} H${W} M0,${y(max/2).toFixed(1)} H${W} M0,${y(0).toFixed(1)} H${W}" vector-effect="non-scaling-stroke"/><defs><linearGradient id="cg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--green);stop-opacity:.32"/><stop offset="1" style="stop-color:var(--green);stop-opacity:0"/></linearGradient></defs><path d="${line} L${W},${H} L0,${H} Z" fill="url(#cg)"/><path class="ln" d="${line}" vector-effect="non-scaling-stroke"/><line class="xh" x1="0" x2="0" y1="0" y2="${H}" vector-effect="non-scaling-stroke" visibility="hidden"/></svg><i class="xdot" hidden></i><div class="xtip" hidden></div></div><span class="sr-only xlive" aria-live="polite"></span><div class="marks" data-n="${n}"></div><div class="axis"><span>${esc(labels[0])}</span><span>${esc(labels[Math.floor(n/2)])}</span><span>${esc(labels[n-1])}</span></div><div class="faint explain">${esc(explain(m,k))}</div></div>`;
}
function statsPanel(m){
 const k=metricOf(),tot=m.totals,ev=m.events||[];
 const keys=[['lead','Brand found'],['draft','Draft']].filter(([kind])=>ev.some(e=>e.kind===kind));
 return `<div class="stats-head"><div class="sstats">${Object.entries(metricTabs).map(([key,l])=>`<button type="button" data-metric="${key}" aria-pressed="${key===k}" class="sstat${key===k?' on':''}"><b>${tot[key]}</b>${l}</button>`).join('')}</div><div class="chips mkkey">${keys.map(([kind,l])=>`<span class="chip mk-${kind}"><i></i>${l}</span>`).join('')}</div><div class="seg">${Object.keys({today:1,week:1,month:1,year:1}).map(r=>`<button type="button" data-range="${r}" class="${r===m.range?'on':''}">${r[0].toUpperCase()}${r.slice(1)}</button>`).join('')}</div></div>
  ${chart(m,k)}`;
}
function tipHtml(m,b,k){
 const now=Date.now(),live=now>=Date.parse(b.from)&&now<Date.parse(b.to);
 return `<div class="xt-time">${esc(bucketTitle(m,b))}${live?' <span class="chip">so far</span>':''}</div>
  <div class="xt-main"><span>${metricTabs[k]}</span><b>${b[k]}</b></div>`;
}
function bindChart(box,m,k,hold){
 const plot=box.querySelector('.plot');if(!plot)return;
 const {W,H}=CH,n=m.series.length,vals=m.series.map(b=>b[k]),max=Math.max(...vals,k==='spend'?0.01:1);
 const xs=i=>n===1?W/2:6+i*(W-12)/(n-1),ys=v=>H-4-(v/max)*(H-14);
 const xh=plot.querySelector('.xh'),dot=plot.querySelector('.xdot'),tip=plot.querySelector('.xtip'),live=box.querySelector('.xlive');
 let cur=-1;
 const show=(i,speak)=>{
  cur=i;const b=m.series[i],px=xs(i)/W;
  xh.setAttribute('x1',xs(i));xh.setAttribute('x2',xs(i));xh.setAttribute('visibility','visible');
  dot.hidden=false;dot.style.left=`${px*100}%`;dot.style.top=`${ys(vals[i])/H*100}%`;
  tip.innerHTML=tipHtml(m,b,k);tip.hidden=false;tip.classList.toggle('flip',px>.55);tip.style.left=`${px*100}%`;
  if(speak)live.textContent=`${bucketTitle(m,b)}: ${metricTabs[k]} ${k==='spend'?money4(b.spend):b[k]}, spend ${money4(b.spend)}`;
 };
 const hide=()=>{cur=-1;xh.setAttribute('visibility','hidden');dot.hidden=true;tip.hidden=true;};
 const idxAt=cx=>{const r=plot.getBoundingClientRect(),vx=(cx-r.left)/r.width*W;return Math.max(0,Math.min(n-1,Math.round((vx-6)*(n-1)/(W-12))));};
 plot.addEventListener('pointerenter',()=>hold(true));
 plot.addEventListener('pointermove',e=>show(idxAt(e.clientX)));
 plot.addEventListener('pointerleave',()=>{if(document.activeElement!==plot){hide();hold(false);}});
 plot.addEventListener('focus',()=>{hold(true);show(cur<0?n-1:cur,true);});
 plot.addEventListener('blur',()=>{hide();hold(false);});
 plot.addEventListener('keydown',e=>{
  const map={ArrowLeft:cur<0?n-1:cur-1,ArrowRight:cur<0?n-1:cur+1,Home:0,End:n-1};
  if(e.key==='Escape'){hide();return;}
  if(!(e.key in map))return;
  e.preventDefault();show(Math.max(0,Math.min(n-1,map[e.key])),true);
 });
 layoutMarks(box,m);
 if(typeof ResizeObserver==='function'){const ro=new ResizeObserver(()=>layoutMarks(box,m));ro.observe(plot);statsRO=ro;}
}
// Brand markers: real lead and draft rows at their real times. Crowded spots collapse into one "+N" marker.
function layoutMarks(box,m){
 const plot=box.querySelector('.plot'),host=box.querySelector('.marks');if(!plot||!host)return;
 const width=plot.clientWidth,n=m.series.length,{W}=CH;if(!width)return;
 const xs=i=>(n===1?W/2:6+i*(W-12)/(n-1))/W*width;
 const frac=at=>{const t=Date.parse(at);let i=m.series.findIndex(b=>t<Date.parse(b.to));if(i<0)i=n-1;const b=m.series[i],f=(t-Date.parse(b.from))/(Date.parse(b.to)-Date.parse(b.from));return Math.min(n-1,i+Math.max(0,f));};
 const place=f=>{const i=Math.floor(f),j=Math.min(n-1,i+1);return xs(i)+(xs(j)-xs(i))*(f-i);};
 const cap=width<520?6:12,pad=13;
 const lane=kind=>{
  const items=(m.events||[]).filter(e=>e.kind===kind).map(e=>({e,px:Math.max(pad,Math.min(width-pad,place(frac(e.at))))})).sort((a,b)=>a.px-b.px);
  let th=28,groups=[];
  const build=()=>{groups=[];for(const it of items){const g=groups[groups.length-1];if(g&&it.px-g.px0<th){g.items.push(it);g.px1=it.px;}else groups.push({px0:it.px,px1:it.px,items:[it]});}};
  build();while(groups.length>cap&&th<width){th*=1.5;build();}
  return {kind,groups};
 };
 const lanes=[lane('lead'),lane('draft')].filter(l=>l.groups.length);
 const label=e=>`${e.company||e.domain||'Brand'}, ${e.kind==='lead'?'brand found':'draft'} ${when(e.at,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}`;
 const thumb=e=>brandThumb({id:e.leadId,company:e.company,domain:e.domain});
 const pops=[];
 host.innerHTML=lanes.map(l=>`<div class="mk-lane mk-${l.kind}">${l.groups.map(g=>{
  const first=g.items[0].e,left=((g.px0+g.px1)/2).toFixed(1);
  if(g.items.length===1)return `<button type="button" class="mk" style="left:${left}px" data-mk="${first.leadId}" data-tip="${esc(label(first))}" aria-label="${esc(label(first))}. Open brand.">${thumb(first)}</button>`;
  pops.push(g);
  return `<button type="button" class="mk cl" style="left:${left}px" data-cl="${pops.length-1}" data-tip="${g.items.length} ${l.kind==='lead'?'brands found':'drafts'}" aria-label="${g.items.length} ${l.kind==='lead'?'brands found':'drafts'}. Show list." aria-haspopup="true">${thumb(first)}<em>+${g.items.length-1}</em></button>`;
 }).join('')}</div>`).join('');
 host.hidden=!lanes.length;
 host.querySelectorAll('[data-mk]').forEach(b=>b.onclick=()=>openLead(Number(b.dataset.mk)));
 host.querySelectorAll('[data-cl]').forEach(b=>b.onclick=ev=>{
  ev.stopPropagation();host.querySelector('.mk-pop')?.remove();
  const g=pops[Number(b.dataset.cl)],shown=g.items.slice(0,8);
  const pop=document.createElement('div');pop.className='mk-pop';
  pop.innerHTML=shown.map(it=>`<button type="button" data-mk="${it.e.leadId}">${thumb(it.e)}<span><b>${esc(it.e.company||it.e.domain)}</b><i>${esc(when(it.e.at,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}))}</i></span></button>`).join('')+(g.items.length>shown.length?`<div class="faint more">+${g.items.length-shown.length} more</div>`:'');
  const lft=Math.max(0,Math.min(width-220,(g.px0+g.px1)/2-110));pop.style.left=`${lft}px`;
  host.appendChild(pop);
  pop.querySelectorAll('[data-mk]').forEach(r=>r.onclick=()=>{pop.remove();openLead(Number(r.dataset.mk));});
  const away=e2=>{if(!pop.contains(e2.target)){pop.remove();document.removeEventListener('click',away);}};
  setTimeout(()=>document.addEventListener('click',away),0);
 });
}
let statsHold=false,statsStale=false,statsRO=null;
async function loadStats(){
 const box=$('#stats');if(!box)return;
 const data=await api(`/api/metrics?range=${pref.get('range','week')}`);
 if(statsHold){statsStale=true;return;}
 statsRO?.disconnect();statsRO=null;statsStale=false;
 box.innerHTML=statsPanel(data);
 box.querySelectorAll('[data-metric]').forEach(b=>b.onclick=()=>{pref.set('metric',b.dataset.metric);statsHold=false;loadStats().catch(()=>{});});
 box.querySelectorAll('[data-range]').forEach(b=>b.onclick=()=>{pref.set('range',b.dataset.range);statsHold=false;loadStats().catch(()=>{});});
 bindChart(box,data,metricOf(),on=>{statsHold=on;if(!on&&statsStale)loadStats().catch(()=>{});});
}

// Chat box: one composer with attachments, tools, a model picker, dictation and voice, like a chat app.
const composerTools={
 mission:{label:'Find brands',icon:'search',desc:'Exa finds brands, Solari reads their sites, Claude writes Gmail drafts',ph:'Ask Mint to find brands, e.g. 8 streetwear labels in Brooklyn that sell online'},
 storyboard:{label:'Storyboard',icon:'clapperboard',desc:'Sonnet drafts a shot list and the checkers grade it',ph:'Describe the video, e.g. a gamer reacts to our tee selling out, 15 seconds'},
 shot:{label:'Plan a shot',icon:'video',desc:'Adds one shot to Renders. Nothing renders until you approve the price',ph:'Describe one shot: character, action, camera and dialogue'}
};
const modelInfo={'claude-sonnet-5-5':['Sonnet 5.5','Best for planning and writing'],'claude-haiku-5-5':['Haiku 5.5','Fastest and cheapest']};
const comp={tool:'mission',files:[],links:[],busy:false,speakTask:null};
let listening=null,heard='';
const currentModel=()=>{const m=pref.get('model',state.config?.models?.main);return modelInfo[m]?m:'claude-sonnet-5-5';};
function attachHTML(){
 return comp.files.map(f=>`<span class="cfile${f.uploading?' up':''}">${f.preview?`<img src="${esc(f.preview)}" alt="">`:`<i>${ic('file-text')}</i>`}<span>${esc(f.name)}</span><button type="button" data-unfile="${esc(f.key)}" aria-label="Remove ${esc(f.name)}" data-tip="Remove">${ic('x')}</button></span>`).join('')
  +comp.links.map((l,i)=>`<span class="cfile"><i>${ic('link')}</i><span>${esc(l.replace(/^https?:\/\//,''))}</span><button type="button" data-unlink="${i}" aria-label="Remove link" data-tip="Remove">${ic('x')}</button></span>`).join('');
}
function composerHTML(){
 const t=composerTools[comp.tool],model=currentModel();
 return `<form class="composer" id="composer" autocomplete="off">
  <div class="cfiles" id="cfiles">${attachHTML()}</div>
  <textarea name="message" rows="1" placeholder="${esc(t.ph)}" aria-label="Message"></textarea>
  <div class="clink" id="clink" hidden><input type="url" placeholder="Paste a link, e.g. https://brand.com" aria-label="Link"><button type="button" class="btn sm" id="clinkadd">Add link</button></div>
  <div class="cbar">
   <div class="cwrap"><button type="button" class="cbtn" id="cplus" data-tip="Add files and links" aria-label="Add files and links" aria-expanded="false">${ic('plus')}</button>
    <div class="cmenu" id="cplusmenu" hidden>
     <button type="button" data-cact="file">${ic('paperclip')}<span><b>Add photos and files</b><i>Images, PDFs, text or CSV, up to 5 MB each</i></span></button>
     <button type="button" data-cact="link">${ic('link')}<span><b>Add a link</b><i>A brand site or a reference page</i></span></button>
    </div></div>
   <span class="cgrow"></span>
   <div class="cwrap"><button type="button" class="cmodel" id="cmodel" data-tip="Choose the model" aria-expanded="false">${modelInfo[model][0]}${ic('chevron-down')}</button>
    <div class="cmenu right" id="cmodelmenu" hidden>${(state.config?.mainModels||Object.keys(modelInfo)).map(m=>`<button type="button" data-cmodel="${m}" class="${m===model?'on':''}"><span><b>${modelInfo[m][0]}</b><i>${modelInfo[m][1]}</i></span>${m===model?ic('check'):''}</button>`).join('')}</div></div>
   <button type="button" class="cbtn" id="cdictate" data-tip="Dictate" aria-label="Dictate">${ic('mic')}</button>
   <button type="button" class="cbtn csend" id="csend" data-tip="Start voice" aria-label="Start voice">${ic('audio-lines')}</button>
  </div>
  <input type="file" id="cfile" multiple hidden accept="image/png,image/jpeg,image/gif,image/webp,application/pdf,text/plain,text/markdown,text/csv,application/json,.md,.csv,.txt,.json">
 </form>`;
}
function syncComposer(){
 const f=$('#composer');if(!f)return;const ta=f.message,b=$('#csend'),d=$('#cdictate');
 ta.style.height='auto';ta.style.height=Math.min(ta.scrollHeight,240)+'px';
 const hasText=Boolean(ta.value.trim()),voiceOn=listening==='voice';
 b.innerHTML=comp.busy?ic('square'):voiceOn?ic('square'):hasText?ic('arrow-up'):ic('audio-lines');
 const tip=comp.busy?'Working':voiceOn?'Stop voice':hasText?'Send':'Start voice';b.dataset.tip=tip;b.setAttribute('aria-label',tip);
 b.classList.toggle('go',hasText&&!voiceOn);b.classList.toggle('live',voiceOn);b.disabled=comp.busy;
 d.classList.toggle('live',listening==='dictate');d.dataset.tip=listening==='dictate'?'Stop dictation':'Dictate';
 f.classList.toggle('listening',Boolean(listening));
}
function closeMenus(){document.querySelectorAll('.cmenu').forEach(m=>{m.hidden=true;});document.querySelectorAll('#cplus,#cmodel').forEach(b=>b.setAttribute('aria-expanded','false'));}
function bindComposer(){
 const f=$('#composer');if(!f)return;const ta=f.message;
 const menu=(btn,m)=>{btn.onclick=e=>{e.stopPropagation();const open=m.hidden;closeMenus();m.hidden=!open;btn.setAttribute('aria-expanded',String(open));};};
 menu($('#cplus'),$('#cplusmenu'));menu($('#cmodel'),$('#cmodelmenu'));
 document.querySelectorAll('[data-ctool]').forEach(b=>b.onclick=()=>{comp.tool=b.dataset.ctool;rerenderComposer();});
 f.querySelectorAll('[data-cmodel]').forEach(b=>b.onclick=()=>{pref.set('model',b.dataset.cmodel);rerenderComposer();});
 f.querySelector('[data-cact="file"]').onclick=()=>{closeMenus();$('#cfile').click();};
 f.querySelector('[data-cact="link"]').onclick=()=>{closeMenus();$('#clink').hidden=false;$('#clink input').focus();};
 $('#clinkadd').onclick=()=>{const v=$('#clink input').value.trim();if(!/^https?:\/\/\S+\.\S+/.test(v))return toast('Paste a full link starting with https://','bad');comp.links.push(v);$('#clink input').value='';$('#clink').hidden=true;$('#cfiles').innerHTML=attachHTML();bindAttach();};
 $('#clink input').onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();$('#clinkadd').click();}};
 $('#cfile').onchange=e=>{addFiles(e.target.files);e.target.value='';};
 f.addEventListener('paste',e=>{const files=[...(e.clipboardData?.files||[])];if(files.length){e.preventDefault();addFiles(files);}});
 f.addEventListener('dragover',e=>{e.preventDefault();f.classList.add('drop');});
 f.addEventListener('dragleave',()=>f.classList.remove('drop'));
 f.addEventListener('drop',e=>{e.preventDefault();f.classList.remove('drop');addFiles(e.dataTransfer.files);});
 ta.oninput=syncComposer;
 ta.onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();sendComposer();}};
 f.onsubmit=e=>{e.preventDefault();sendComposer();};
 $('#cdictate').onclick=()=>listening==='dictate'?voice.stop():startListening('dictate');
 $('#csend').onclick=()=>{if(listening==='voice')return voice.stop();if(ta.value.trim())return sendComposer();startListening('voice');};
 bindAttach();syncComposer();
}
function modesHTML(){return `<div class="cmodes" id="cmodes" role="radiogroup" aria-label="What to make">${Object.entries(composerTools).map(([k,x])=>`<button type="button" role="radio" aria-checked="${k===comp.tool}" class="cmode${k===comp.tool?' on':''}" data-ctool="${k}" aria-label="${esc(x.label)}">${ic(x.icon)}<span>${x.label}</span></button>`).join('')}</div>`;}
function suggestHTML(){return suggestions.map((x,i)=>[x,i]).filter(([x])=>x[0]===comp.tool).slice(0,3).map(([x,i])=>`<button type="button" data-suggest="${i}">${esc(x[1])}</button>`).join('');}
function bindSuggest(){document.querySelectorAll('[data-suggest]').forEach(b=>b.onclick=()=>{const text=suggestions[Number(b.dataset.suggest)][1];const ta=$('#composer textarea');ta.value=text;syncComposer();ta.focus();ta.setSelectionRange(text.length,text.length);});}
function rerenderComposer(){const ta=$('#composer textarea'),text=ta?.value||'';$('#composer').outerHTML=composerHTML();$('#composer textarea').value=text;const m=$('#cmodes');if(m)m.outerHTML=modesHTML();const sg=$('#csuggest');if(sg){sg.innerHTML=suggestHTML();bindSuggest();}bindComposer();syncComposer();$('#composer textarea').focus();}
function bindAttach(){
 document.querySelectorAll('[data-unfile]').forEach(b=>b.onclick=()=>{comp.files=comp.files.filter(x=>x.key!==b.dataset.unfile);$('#cfiles').innerHTML=attachHTML();bindAttach();});
 document.querySelectorAll('[data-unlink]').forEach(b=>b.onclick=()=>{comp.links.splice(Number(b.dataset.unlink),1);$('#cfiles').innerHTML=attachHTML();bindAttach();});
}
async function addFiles(list){
 for(const file of [...list]){
  if(comp.files.length>=5){toast('Attach up to 5 files','bad');break;}
  if(file.size>5*1024*1024){toast(`${file.name} is over 5 MB`,'bad');continue;}
  const item={key:Math.random().toString(36).slice(2),name:file.name,uploading:true,preview:file.type.startsWith('image/')?URL.createObjectURL(file):null};
  comp.files.push(item);$('#cfiles').innerHTML=attachHTML();bindAttach();
  try{
   const data=await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(String(r.result).split(',')[1]||'');r.onerror=()=>rej(Error(`Could not read ${file.name}`));r.readAsDataURL(file);});
   const {upload}=await api('/api/uploads',{name:file.name,type:file.type,data});item.id=upload.id;item.uploading=false;
  }catch(err){comp.files=comp.files.filter(x=>x!==item);toast(err.message,'bad');}
  if($('#cfiles')){$('#cfiles').innerHTML=attachHTML();bindAttach();}
 }
}
async function sendComposer(){
 const f=$('#composer');if(!f||comp.busy)return;
 let text=f.message.value.trim();
 if(text.length<3)return toast('Write a few words first','info');
 if(comp.files.some(x=>x.uploading))return toast('Files are still uploading','info');
 if(comp.links.length)text+=`\n\nReference links: ${comp.links.join(' ')}`;
 const model=currentModel(),attachments=comp.files.map(x=>x.id),spoken=comp.spoken;comp.spoken=false;
 comp.busy=true;syncComposer();
 const done=()=>{comp.files=[];comp.links=[];f.message.value='';};
 try{
  if(comp.tool==='storyboard'){toast('Drafting the storyboard','info','About 30 seconds.');await api('/api/storyboards',{product:text.slice(0,200),idea:text,model,attachments});done();toast('Storyboard drafted','ok','Run the checkers next.');if(spoken)voice.speak('Storyboard drafted. Run the checkers next.');location.hash='#/storyboards';}
  else if(comp.tool==='shot'){if(attachments.length)toast('Shots use the text only','info');await api('/api/renders',{title:text.split('\n')[0].slice(0,60),prompt:text});done();toast('Shot added','ok','Run checks on it in Renders.');location.hash='#/renders';}
  else if(!attachments.length&&thread.ok&&tab()==='home'){
   thread.messages.push({role:'user',text});thread.thinking=true;thread.startedAt=Date.now();done();paintThread();
   try{const r=await api('/api/assistant',{message:text,model});thread.messages.push({role:'assistant',text:r.reply,actions:r.actions});if(r.mode==='rehearsal'&&r.url)location.hash=r.url;if(spoken)voice.speak(r.reply);}
   catch(err){thread.messages.pop();f.message.value=text;toast(err.message,'bad');}
   finally{thread.thinking=false;paintThread();}
  }
  else{const {task}=await api('/api/chat',{message:text,model,attachments});if(spoken)comp.speakTask=task.id;done();toast('Mission started','ok',`Task ${task.id} on ${modelInfo[model][0]}`);location.hash=`#/tasks/${task.id}`;}
 }catch(err){toast(err.message,'bad');}
 finally{comp.busy=false;syncComposer();}
}
// Speech: the Mac app answers through a native bridge; in a browser, Web Speech is the fallback.
const voice={
 native:()=>Boolean(window.webkit?.messageHandlers?.mint),
 web:()=>window.SpeechRecognition||window.webkitSpeechRecognition,
 rec:null,
 listen(){
  if(voice.native())return window.webkit.messageHandlers.mint.postMessage({type:'listen'});
  const R=voice.web();if(!R)return window.mintVoice({type:'error',text:'Voice needs the Mint Labs app or Chrome.'});
  const r=new R();r.lang='en-US';r.interimResults=true;voice.rec=r;let last='';
  r.onresult=e=>{last=[...e.results].map(x=>x[0].transcript).join('');window.mintVoice({type:'partial',text:last});};
  r.onerror=e=>window.mintVoice({type:'error',text:e.error==='not-allowed'?'Allow the microphone for this page.':`Voice stopped: ${e.error}`});
  r.onend=()=>{if(voice.rec===r){voice.rec=null;window.mintVoice({type:'final',text:last});}};
  r.start();
 },
 stop(){if(voice.native())return window.webkit.messageHandlers.mint.postMessage({type:'stop'});voice.rec?.stop();},
 speak(text){if(voice.native())return window.webkit.messageHandlers.mint.postMessage({type:'speak',text});if(window.speechSynthesis){speechSynthesis.cancel();speechSynthesis.speak(new SpeechSynthesisUtterance(text));}}
};
function startListening(mode){
 if(!voice.native()&&!voice.web())return toast('Voice needs the Mint Labs app or Chrome','bad');
 listening=mode;heard=$('#composer textarea')?.value.trim()||'';syncComposer();voice.listen();
}
window.mintVoice=e=>{
 const ta=$('#composer textarea');
 if(e.type==='partial'&&listening&&ta){ta.value=(heard?heard+' ':'')+e.text;syncComposer();}
 if(e.type==='error'){listening=null;syncComposer();toast(e.text,'bad');}
 if(e.type==='final'&&listening){const mode=listening;listening=null;if(ta&&e.text)ta.value=(heard?heard+' ':'')+e.text;syncComposer();if(mode==='voice'&&ta?.value.trim()){comp.spoken=true;sendComposer();}}
};
document.addEventListener('click',e=>{if(!e.target.closest('.cwrap'))closeMenus();});

const thread={messages:[],thinking:false,ok:true};
const actionLabel=a=>({prepare_client_demo:'Prepared a client demo',start_mission:'Started a mission',steer_mission:'Steered a mission',control_mission:`Mission ${a.input?.action||'updated'}`,get_overview:'Checked the overview',get_mission:'Read a mission',find_leads:'Looked up brands',get_lead:'Read a brand'})[a.tool]||a.tool;
const claudeAv=()=>logoTile('claude');
function threadHTML2(g){
 const steers=g.runs.flatMap(r=>(state.sdata.get(r.id)?.steers||[]).map(s=>({...s,run:r.id}))).sort((a,b)=>String(a.at).localeCompare(String(b.at))||a.id-b.id);
 if(!steers.length)return '';
 return steers.map(s=>`<div class="msg-u">${esc(s.message)}</div>${s.reply?`<div class="msg-a">${claudeAv()}<div class="txt">${esc(s.reply)}</div></div>`:s.applied_at?'':`<div class="msg-a pending">${claudeAv()}<div class="txt faint">Queued. It applies before the next step.</div></div>`}`).join('');
}
// "3 steps" with stacked provider logos; opens into traced child lines.
const openSteps=new Set();
function stepsHTML(key,items){
 if(!items.length)return '';
 const logos=[...new Set(items.map(i=>i.logo))],open=openSteps.has(key);
 return `<div class="steps-wrap"><button type="button" class="steps" data-steps="${esc(key)}" aria-expanded="${open}"><span class="stack">${logos.map(l=>`<img src="${logoSrc(l)}" alt="">`).join('')}</span><span>${items.length} step${items.length===1?'':'s'}</span></button>${open?`<div class="tg-kids steps-kids">${items.map((i,n)=>`<div class="tg-kid${n===items.length-1?' last':''}"><span class="nd"></span><div class="kd-main static"><img class="kd-logo" src="${logoSrc(i.logo)}" alt=""><span class="kd-name">${esc(i.label)}</span></div></div>`).join('')}</div>`:''}</div>`;
}
function threadHTML(){
 return thread.messages.map((m,i)=>m.role==='user'?`<div class="msg-u">${esc(m.text)}</div>`:`<div class="msg-a">${claudeAv()}<div><div class="txt">${esc(m.text)}</div>${(m.actions||[]).filter(a=>a.tool==='campaign_demo').map(a=>`<p><a class="linkbtn" href="#/walkthrough/${esc(a.input.brandId)}?autoplay=1">Open campaign</a></p>`).join('')}<div data-ap-chat-message="${i}"></div></div></div>`).join('')+(thread.thinking?`<div class="msg-a">${claudeAv()}<div><div class="thinking"><i></i><i></i><i></i></div><div data-ap-chat-pending></div></div></div>`:'');
}
function paintChatActivity(){
 const host=$('#thread');if(!host)return;
 host.querySelectorAll('[data-ap-chat-message]').forEach(el=>{const m=thread.messages[Number(el.dataset.apChatMessage)];mountChatActivity(el,{actions:m.actions||[],events:state.live}).catch(()=>{});});
 const pending=host.querySelector('[data-ap-chat-pending]');if(pending)mountChatActivity(pending,{pending:true,events:state.live.filter(e=>String(e.tool).startsWith('assistant.')&&Date.parse(e.at)>=thread.startedAt)}).catch(()=>{});
}
document.addEventListener('click',e=>{const b=e.target.closest('[data-steps]');if(!b)return;const k=b.dataset.steps;openSteps.has(k)?openSteps.delete(k):openSteps.add(k);const t=$('#thread');if(t&&t.contains(b))paintThread();else{const g=b.closest('.thread2');if(g){const key=g.dataset.thread,grp=groupByKey(key);if(grp)g.innerHTML=threadHTML2(grp);}}});
function paintThread(){const t=$('#thread');if(!t)return;t.innerHTML=threadHTML();paintChatActivity();t.hidden=!thread.messages.length&&!thread.thinking;$('.home')?.classList.toggle('chatting',!t.hidden);t.lastElementChild?.scrollIntoView({block:'end'});}
async function loadThread(){try{const r=await api('/api/assistant');thread.messages=r.messages||[];thread.ok=true;}catch{thread.ok=false;}paintThread();}
async function home(){
 const live=sessionGroups().filter(g=>g.live.length);
 document.querySelectorAll('.popup').forEach(el=>el.remove());
 $('#view').innerHTML=`<div class="home"><div id="thread" class="thread" hidden></div><div class="home-center"><h2 class="greet">What should Mint work on?</h2>${composerHTML()}${modesHTML()}<div class="suggest" id="csuggest">${suggestHTML()}</div></div>
  ${live.length?`<div class="section-title">Running now <span class="count">${live.length}</span></div><div class="sessions compact">${live.map(g=>sessionCard(g,{nav:true})).join('')}</div>`:''}
 </div>`;
 bindComposer();bindSuggest();bindReviews(()=>route());paintThread();loadThread();
}
const suggestions=[['mission','Find me streetwear brands we can run AI UGC content campaigns for'],['mission','Find 8 streetwear brands in Brooklyn that sell online'],['mission','Find skincare brands in LA with fewer than 50k followers'],['mission','Find coffee roasters in NYC that ship nationwide'],['storyboard','A 15 second video of a gamer reacting to our tee selling out'],['shot','A creator unboxes the tee on a rooftop at golden hour, 5 seconds']];

async function tasks(arg,{isCurrent=()=>true}={}){
 const id=typeof arg==='number'?arg:undefined;
 const target=id?(state.tasks.find(t=>t.id===id)||(await api(`/api/tasks/${id}`)).task):null;
 if(!isCurrent())return;
 if(target&&!state.tasks.some(t=>t.id===target.id))state.tasks.push(target);
 if(target?.plan?.kind==='client_demo'){const {clientTaskReviewView}=await import('./client-task-review.js');if(isCurrent())await clientTaskReviewView({view:$('#view'),api,taskId:target.id,isCurrent});return;}
 if(target?.plan?.kind==='brand_storyboard'){const {taskStoryboardView}=await import('./task-storyboards.js');if(isCurrent())await taskStoryboardView({view:$('#view'),api,esc,toast,taskId:id,isCurrent});return;}
 if(target&&(target.plan?.kind==='client_project'||isWhopTask(target))){const {clientProjectView}=await import('./task-storyboards.js');if(isCurrent())await clientProjectView({view:$('#view'),api,esc,toast,taskId:id,isCurrent});return;}
 if(id&&state.hashOpened!==id){const t=state.tasks.find(x=>x.id===id);if(t){state.openSess.add(skey(t.prompt));state.hashOpened=id;state.scrollTo=skey(t.prompt);}}
 const [ap,whop]=await Promise.all([api('/api/autopilot').catch(()=>null),tryGet('/api/whop'),loadDraftMaps()]);
 state.whop=whop;
 const linkedOrderTasks=new Set(paidTaskOrders(whop?.orders).map(order=>order.task_id).filter(Boolean));
 const groups=sessionGroups().filter(group=>!group.whop||!group.runs.some(task=>linkedOrderTasks.has(task.id)));
 await Promise.all(groups.filter(g=>state.openSess.has(g.key)).map(loadSession));
 if(!isCurrent())return;
 const sw=(idn,on,tip,label,dis)=>`<label class="switch" data-tip="${esc(tip)}"><input type="checkbox" role="switch" aria-label="${label}" id="${idn}" ${on?'checked':''} ${dis?'disabled':''}><i aria-hidden="true"></i><span>${label}</span><span class="switch-state">${on?'On':'Off'}</span></label>`;
 const bar=[ap?sw('apswitch',ap.enabled,ap.enabled?`On: starts the next batch when one finishes, up to $${Number(ap.dailyBudgetUsd).toFixed(2)} a day`:'Off: Mint waits for you to start missions','Always on'):'',whop?sw('whopswitch',whop.enabled,whop.configured?(whop.enabled?'On: a Whop purchase starts work on its own':'Off: purchases wait for you'):'Add WHOP_API_KEY to turn this on','Watch new purchases',!whop.configured):''].join('');
 const sections=[['client','Client work'],['research','Brand research'],['missions','Missions']];
 $('#view').innerHTML=`${bar?`<div class="pagebar"><div class="automation-controls">${bar}${ap?`<span class="automation-limit">${usd(ap.dailyBudgetUsd)} daily limit</span>`:''}</div></div>`:''}
  <div data-ap-review-queue></div><div class="sessions" id="sessions">${sections.map(([key,title])=>{const rows=groups.filter(group=>taskSection(group.runs[0])===key),count=rows.length+(key==='client'?paidTaskOrders(whop?.orders).length:0);if(!count&&key!=='client')return '';return `<section class="task-section" data-task-section="${key}" ${count?'':'hidden'}><div class="pagebar"><h2>${title}</h2><span class="schip s-idle task-section-count">${count}</span></div>${key==='client'?ordersHTML():''}${rows.map(group=>sessionCard(group)).join('')}</section>`;}).join('')}${!groups.length&&!paidTaskOrders(whop?.orders).length?'<div class="idle">No tasks yet. Start one from Home.</div>':''}</div>`;
 const reviewHost=$('[data-ap-review-queue]');if(reviewHost)mountTaskReviewQueue(reviewHost);
 if(state.scrollTo){document.querySelector(`.sess[data-sess="${state.scrollTo}"]`)?.scrollIntoView({block:'start'});state.scrollTo=null;}
 for(const el of document.querySelectorAll('.console:not([hidden])'))el.scrollTop=el.scrollHeight;
 $('#apswitch')?.addEventListener('change',async e=>{const input=e.target;input.disabled=true;try{const r=await api('/api/autopilot',{enabled:e.target.checked});toast(r.enabled?'Always on':'Always on is off','ok',r.enabled?`Mint keeps finding brands, up to $${Number(r.dailyBudgetUsd).toFixed(2)} a day. Renders still wait for you.`:'Mint waits for you to start missions.');tasks(id);}catch(err){input.checked=!input.checked;toast(err.message,'bad');}finally{input.disabled=false;}});
 $('#whopswitch')?.addEventListener('change',async e=>{try{const r=await api('/api/whop',{enabled:e.target.checked});toast(r.enabled?'Watching purchases':'Not watching purchases','ok',r.enabled?'A new Whop purchase starts work on its own.':'Purchases wait for you.');await refreshWhop();}catch(err){e.target.checked=!e.target.checked;toast(err.message,'bad');}});
}
// Counter chips: drafts (check) and failed (X) only.
function counterChips(leads){
 const c={ok:0,bad:0};for(const l of leads){const k=ls(l.status)[1].slice(2);if(k in c)c[k]++;}
 return [['ok','Drafts ready'],['bad','Failed']].map(([k,l])=>`<span class="cchip c-${k}${c[k]?'':' zero'}" data-tip="${l}"><i>${svg(k)}</i><b>${c[k]}</b></span>`).join('');
}
// The contact column already says when there is no email, so only explain skips it cannot.
const skipWhy=l=>l.status==='skipped'&&l.contact_email?(l.risks[0]||'Not a fit for this mission'):l.status==='unreachable'?'The site would not load':'';
// The primary (newest, not withdrawn) draft per brand. Withdrawn drafts never count anywhere except one line in the drawer.
async function loadDraftMaps(){
 const r=await tryGet('/api/drafts'),list=(r?.drafts||[]).filter(d=>d.status!=='withdrawn');
 state.gmail.clear();state.dm.clear();state.dr.clear();
 for(const d of list){
  if(!state.dr.has(d.lead_id))state.dr.set(d.lead_id,d);
  if(d.channel==='instagram_dm'){if(!state.dm.has(d.lead_id))state.dm.set(d.lead_id,{handle:String(d.to_email||'').replace(/^@/,''),status:d.status});}
  else if(d.gmail_url&&!state.gmail.has(d.lead_id))state.gmail.set(d.lead_id,d.gmail_url);
 }
 return list;
}
const lstat=([label,cls])=>`<span class="lstat ${cls}">${ic(statusIcon[cls]||'circle-alert')}<span>${esc(label)}</span></span>`;
// One primary update: latest reached milestone, or the next required action.
function leadStatusCell(l){
 const badge=primaryLeadStatus(l,{draft:state.dr.get(l.id),dmReady:state.dm.get(l.id)?.status==='dm_ready',fallback:ls(l.status)});
 const mark=badge.provider?`<img src="${logoSrc(badge.provider)}" alt="${esc(socialNames[badge.provider]||providerName[badge.provider]||badge.provider)}">`:ic(badge.icon||statusIcon[badge.cls]||'circle-alert');
 return `<span class="schip ct-primary-status ${badge.cls}" data-primary-status>${mark}${esc(badge.label)}</span>`;
}
function leadRow(l){
 const g=state.gmail.get(l.id),dm=state.dm.get(l.id),why=skipWhy(l);
 return `<div class="trow${state.selectedLead===l.id?' sel':''}" data-id="${l.id}" data-status="${esc(l.status)}"><div class="tbrand">${brandThumb(l)}<div class="ct-brand-copy"><button type="button" class="ct-brand-open" aria-label="Open details for ${esc(l.company||l.domain)}"><b title="${esc(l.company||l.domain)}">${esc(l.company||l.domain)}</b></button><div class="sub"><em title="${esc(l.domain)}">${esc(l.domain)}</em>${socialLinks(l)}</div></div></div><div class="where">${esc(l.territory||'')}<span>${esc(l.market||'')}</span></div><div class="contact">${contactChip(l)}</div><div class="ct-status" title="${esc(why)}">${leadStatusCell(l)}</div><div class="tact">${dm&&dm.handle?`<a class="gmailicon" href="https://instagram.com/${encodeURIComponent(dm.handle)}" target="_blank" rel="noopener" data-tip="Open Instagram profile" aria-label="Open Instagram profile">${igMark()}</a>`:g?`<a class="gmailicon" href="${esc(g)}" target="_blank" rel="noopener" data-tip="Open draft in Gmail" aria-label="Open draft in Gmail"><img src="/logos/gmail.png" alt=""></a>`:`<button type="button" disabled title="No draft for this brand">${svg('mail')}</button>`}<a href="${esc(l.url||`https://${l.domain}`)}" target="_blank" rel="noopener" title="Open the website">${svg('open')}</a></div></div>`;
}
$('#drawer').addEventListener('click',async e=>{traceClick(e);const button=e.target.closest('[data-retry-ideation]');if(button){const id=state.selectedLead;button.disabled=true;try{await api(`/api/leads/${id}/ideation`,{});refreshLeadIdeation();}catch(error){toast(error.message,'bad');button.disabled=false;}}});
const clip=(t,n=96)=>{t=String(t||'');return t.length>n?t.slice(0,t.lastIndexOf(' ',n-1)>40?t.lastIndexOf(' ',n-1):n)+'...':t;};
// Lead drawer, visual first: logo tile and status, brand chips, one row of colored icon links with the send action, references, offer pages, video.
const productKind={top:'Top',bottom:'Bottom',outerwear:'Outerwear',footwear:'Footwear',headwear:'Headwear',accessory:'Accessory'};
const needText={email:'a contact email',clip:'an approved clip',pdf:'the offer PDF',gmail:'a Gmail draft',instagram:'Instagram connected (Browser tab)',handle:'an Instagram handle'};
function openPdf(id){
 const trigger=$('#pdfview')?.contains(document.activeElement)?pdfReturnFocus:document.activeElement;
 closePdf();
 pdfReturnFocus=trigger;
 const el=document.createElement('div');el.className='pdfview';el.id='pdfview';
 el.innerHTML=`<div class="pv-bar"><b>Offer PDF</b><button type="button" class="iconbtn" id="pdfclose" data-tip="Close" aria-label="Close">${ic('x')}</button></div><iframe src="/api/leads/${id}/offer.pdf" title="Offer PDF"></iframe>`;
 document.querySelector('.center').append(el);$('#pdfclose').onclick=closePdf;$('#pdfclose').focus();
}
let pdfReturnFocus;
const closePdf=()=>{const el=$('#pdfview');if(!el)return;el.remove();const trigger=pdfReturnFocus;pdfReturnFocus=null;if(trigger?.isConnected&&!trigger.closest('[hidden]'))trigger.focus({preventScroll:true});};
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('#pdfview')){closePdf();e.stopPropagation();}},true);
async function openLead(id){
 state.selectedLead=id;
 const {lead:l,drafts:all=[],renders=[],events=[],ideation}=await api(`/api/leads/${id}`);
 if(state.selectedLead!==id)return;
 const d=$('#drawer');d.hidden=false;
 const drafts=all.filter(x=>x.status!=='withdrawn'),old=all.find(x=>x.status==='withdrawn'&&x.gmail_url);
 const mail=drafts[0],isDm=mail?.channel==='instagram_dm',gmail=isDm?'':drafts.find(x=>x.gmail_url&&x.channel!=='instagram_dm')?.gmail_url;
 if(mail)state.dr.set(l.id,mail);
 const vid=renders.find(r=>r.review==='approved')||renders[0];
 const vstate=vid?(vid.review?reviewStatus[vid.review]:(renderStatus[vid.status]||[vid.status,'s-idle'])):null;
 const sc=l.socials||{},prof=l.brand_profile||{},products=Array.isArray(l.products)?l.products:null;
 const dlink=(href,tip,inner,cls='dicon')=>`<a class="${cls}" href="${esc(href)}" target="_blank" rel="noopener" data-tip="${esc(tip)}" aria-label="${esc(tip)}">${inner}</a>`;
 const soc=(k,label)=>{const u=k==='instagram'?instaUrl(l):(/^https:\/\//.test(sc[k]||'')?sc[k]:'');return u?dlink(u,label,socMark(k)):'';};
 const contact=contactChip(l)||(l.contact_email?`<span class="schip s-idle">${ic('mail')}${esc(l.contact_email)}</span>`:'<span class="schip s-bad">'+ic('x')+'No contact</span>');
 const note=l.status==='rejected'&&l.notes?`Not a fit: ${l.notes}`:(l.reasons||[])[0]||'';
 const chips=[...(prof.audience||[]),...(prof.style||[])].slice(0,8);
 const hero=prof.hero?.productIndex;
 const rd=mail?.readiness,canSend=Boolean(mail&&rd?.ready),miss=(rd?.missing||[]).map(m=>needText[m]||m);
 const sendTip=canSend?(isDm?`Send DM to ${mail.to_email}`:`Send to ${mail.to_email}`):`Not ready. Missing: ${miss.join(', ')||'checks'}`;
 const hasPdf=(mail?.attachments||[]).some(a=>a.kind==='pdf');
 d.innerHTML=`<div class="dhead">${brandThumb(l,'lg')}<div class="dtitle"><h2>${esc(l.company||l.domain)}</h2><a class="faint" href="${esc(l.url||`https://${l.domain}`)}" target="_blank" rel="noopener">${esc(l.domain)}</a></div><span class="dstat">${leadStatusCell(l)}</span><button class="iconbtn" id="close" data-tip="Close" aria-label="Close">${ic('x')}</button></div>
 <div class="dbody">
  ${chips.length?`<div class="chips dprof">${chips.map(c=>`<span class="chip">${esc(c)}</span>`).join('')}</div>`:''}
  <div class="dactions"><div class="dicons">${dlink(l.url||`https://${l.domain}`,'Website',brandThumb(l,'sm'),'dicon web')}${soc('instagram','Instagram')}${soc('tiktok','TikTok')}${soc('youtube','YouTube')}${gmail?dlink(gmail,'Open draft in Gmail','<img src="/logos/gmail.png" alt="">'):''}</div>${mail?`<span class="dsend" id="sendslot"><button type="button" class="iconbtn go" id="sendbtn" data-tip="${esc(sendTip)}" aria-label="${esc(sendTip)}" ${canSend?'':'disabled'}>${ic('send')}</button></span>`:''}</div>
  <div class="dcontact" ${l.contact_email?`title="${esc(l.contact_email)}"`:''}>${contact}</div>
  ${note?`<div class="dnote">${esc(clip(note,90))}</div>`:''}
  ${products&&products.length?`<div class="dsec"><span class="dlab">Product photos</span><div class="refs">${products.slice(0,12).map((p,i)=>`<div class="ref" data-tip="${esc(p.title||'')}"><img src="/api/leads/${id}/products/${i}/image?v=${photoTag(p.imageUrl)}" data-u="${esc(p.imageUrl||'')}" alt="${esc(p.title||'Product photo')}" onerror="if(this.dataset.f||!this.dataset.u){this.remove()}else{this.dataset.f=1;this.src=this.dataset.u}"></div>`).join('')}</div></div>`:''}
  ${hasPdf?`<div class="dsec"><span class="dlab">Offer</span><div class="offer"><button type="button" class="pg" data-offer="${id}" aria-label="Open the offer PDF, page 1"><img src="/api/leads/${id}/offer/1.png" alt="" loading="lazy"></button><button type="button" class="pg" data-offer="${id}" aria-label="Open the offer PDF, page 2"><img src="/api/leads/${id}/offer/2.png" alt="" loading="lazy"></button></div></div>`:''}
  ${vid?`<div class="vcard">${video(vid)}<div class="vmeta">${schip(vstate,statusIcon[vstate[1]])}<a class="chip" href="#/renders">Open in Renders</a></div></div>`:`<div class="dsec" id="lead-ideation">${ideationPanel(ideation,events,{esc,icon:ic})}</div>`}
  ${old?`<a class="oldmail" href="${esc(old.gmail_url)}" target="_blank" rel="noopener"><img src="/logos/gmail.png" alt="">Old email to ${esc(old.to_email)}, delete by hand</a>`:''}
 </div>`;
 $('#close').onclick=()=>{d.hidden=true;state.selectedLead=null;};
 d.querySelectorAll('[data-offer]').forEach(b=>b.onclick=()=>openPdf(Number(b.dataset.offer)));
 $('#sendbtn')?.addEventListener('click',()=>{
  const slot=$('#sendslot');
  slot.innerHTML=`<span class="sendask"><span>${isDm?'Send the DM to':'Send to'} ${esc(mail.to_email)}?</span><button type="button" class="btn sm go" id="sendyes">Send</button><button type="button" class="btn sm" id="sendno">Cancel</button></span>`;
  $('#sendno').onclick=()=>openLead(id);
  $('#sendyes').onclick=async e=>{const b=e.currentTarget;b.disabled=true;try{await api(`/api/drafts/${mail.id}/${isDm?'send-dm':'send'}`,{confirm:true});toast(isDm?'DM sent':'Email sent','ok',`To ${mail.to_email}`,isDm?null:'gmail',isDm?null:`gmail-sent-draft:${mail.id}`);}catch(err){toast(err.message,'bad');}openLead(id);softRefresh(route);};
 });
}
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#drawer').hidden){$('#drawer').hidden=true;state.selectedLead=null;}});

// Leads: filter chips with counts, a sort menu, and one list. Drafts is a filter here (the old Drafts page redirects to it).
const leadFilters=[['all','All'],['drafts','Drafts'],['awaiting_video','Needs video'],['rejected','Not a fit'],['issues','Other']];
const leadSorts=[['newest','Newest'],['name','Name'],['status','Status']];
const statusRank=['drafted','awaiting_video','contacted','replied','won','drafting','grading','visiting','found','skipped','unreachable','error','lost','rejected'];
async function leads(arg,{isCurrent=()=>true}={}){
 if(!isCurrent())return;
 const [{leads:found},dr,packet]=await Promise.all([api('/api/leads'),loadDraftMaps(),tryGet('/api/client-demo')]);
 if(!isCurrent())return;
 const simulatedBrands=packet?.mode==='demo'?(packet.brands||[]).filter(brand=>['disobedient','vylin'].includes(brand.id)):[];
 const domain=value=>{try{return new URL(value.includes('://')?value:`https://${value}`).hostname.replace(/^www\./,'').toLowerCase();}catch{return '';}};
 const all=found.map(lead=>({...lead,simulatedJourney:simulatedBrands.some(brand=>domain(brand.website)===domain(lead.domain||lead.url||''))}));
 const haveDraft=new Set(dr.map(d=>d.lead_id));
 if(typeof arg==='string'&&leadFilters.some(f=>f[0]===arg)){pref.set('lfilter',arg);history.replaceState(null,'','#/leads');}
 let filter=pref.get('lfilter','all');if(filter==='drafted')filter='drafts';if(['unreachable','skipped'].includes(filter))filter='issues';if(!leadFilters.some(f=>f[0]===filter))filter='all';
 let sort=pref.get('lsort','newest');if(!leadSorts.some(s=>s[0]===sort))sort='newest';
 const match={all:l=>l.status!=='rejected'||l.simulatedJourney,drafts:l=>haveDraft.has(l.id)&&l.status!=='rejected',awaiting_video:l=>l.status==='awaiting_video',rejected:l=>l.status==='rejected',issues:l=>['unreachable','skipped','error','lost'].includes(l.status)};
 const counts=Object.fromEntries(Object.entries(match).map(([k,f])=>[k,all.filter(f).length]));
 const cmp={newest:(a,b)=>b.id-a.id,name:(a,b)=>String(a.company||a.domain).localeCompare(String(b.company||b.domain)),status:(a,b)=>statusRank.indexOf(a.status)-statusRank.indexOf(b.status)||b.id-a.id};
 const rows=()=>all.filter(match[filter]).sort((a,b)=>Number(b.simulatedJourney)-Number(a.simulatedJourney)||(a.status==='rejected')-(b.status==='rejected')||cmp[sort](a,b));
 $('#view').innerHTML=`<div class="ct-leads-toolbar"><div class="fchips" role="group" aria-label="Filter brands">${leadFilters.map(([k,l])=>`<button type="button" class="fchip${k===filter?' on':''}" data-lf="${k}" aria-pressed="${k===filter}">${l}<span class="n">${counts[k]}</span></button>`).join('')}</div>
  <div class="lbar">
   <div class="cwrap sortwrap"><button type="button" class="ctl" id="sortbtn" aria-expanded="false" aria-haspopup="true">${ic('arrow-up-down')}<span>${leadSorts.find(s=>s[0]===sort)[1]}</span></button><div class="cmenu right" id="sortmenu" hidden>${leadSorts.map(([k,l])=>`<button type="button" data-ls="${k}" class="${k===sort?'on':''}"><span><b>${l}</b></span>${k===sort?ic('check'):''}</button>`).join('')}</div></div>
   <button class="ctl" id="requalify" type="button" data-tip="Drop brands with no Instagram, TikTok or logo, and grade the rest">Re-check brands</button></div></div>
  <div class="ct-leads-table"><div class="trows bare" id="crm"><div class="trow th"><span>Brand</span><span>Where</span><span>Contact</span><span>Status</span><span>Actions</span></div>${rows().map(leadRow).join('')||'<div class="idle">No brands match this filter.</div>'}</div></div>`;
 document.querySelectorAll('[data-lf]').forEach(b=>b.onclick=()=>{pref.set('lfilter',b.dataset.lf);leads(undefined,{isCurrent});});
 const sb=$('#sortbtn'),sm=$('#sortmenu');
 sb.onclick=e=>{e.stopPropagation();const open=sm.hidden;closeMenus();sm.hidden=!open;sb.setAttribute('aria-expanded',String(open));};
 sm.querySelectorAll('[data-ls]').forEach(b=>b.onclick=()=>{pref.set('lsort',b.dataset.ls);leads(undefined,{isCurrent});});
 $('#requalify').onclick=async e=>{const b=e.currentTarget;b.disabled=true;b.lastChild.textContent='Checking brands';try{const r=await api('/api/leads/requalify',{});toast(`Checked ${r.checked} brands`,'ok',`${r.rejected.length} not a fit${r.withdrawnDrafts?.length?`. ${r.withdrawnDrafts.length} Gmail draft${r.withdrawnDrafts.length===1?'':'s'} to delete yourself`:''}`);leads(undefined,{isCurrent});}catch(err){toast(err.message,'bad');b.disabled=false;b.lastChild.textContent='Re-check brands';}};
}
// Drafts live inside Leads now. The old route and any old link land on the Drafts filter.
async function drafts(){location.replace('#/leads/drafts');}

const renderStatus={draft:['Needs checks','s-wait'],checking:['Checking','s-run'],checks_failed:['Checks failed','s-bad'],checks_passed:['Awaiting spend approval','s-you'],submitting:['Submitting once','s-run'],submission_unknown:['Outcome uncertain: reconcile before retry','s-bad'],queued:['Queued','s-run'],in_progress:['Rendering','s-run'],completed:['Rendered','s-ok'],failed:['Failed','s-bad'],nsfw:['Blocked','s-bad'],canceled:['Canceled','s-idle']};
const reviewStatus={pending:['Awaiting your review','s-you'],approved:['Approved','s-ok'],rejected:['Rejected','s-bad']};
let renderWatcher;
const renderViewBusy=()=>[...document.querySelectorAll('#view video,#view audio')].some(v=>!v.paused&&!v.ended)||Boolean(document.querySelector('#newshot:not([hidden])'))||[...document.querySelectorAll('#view input[type="text"],#view textarea')].some(el=>el===document.activeElement||el.value);
// New gallery lives in renders-view.js. If it fails to load or mount, the previous list view below takes over.
async function renders(arg,opts={}){
 const isCurrent=opts.isCurrent||(()=>tab()==='renders');
 try{const m=await import('./renders-view.js');await m.rendersView({view:$('#view'),api,toast,arg,isCurrent});}
 catch(err){console.error('Renders gallery failed, using the list view',err);await rendersList(arg,{isCurrent});}
}
async function rendersList(arg,{isCurrent=()=>tab()==='renders'}={}){
 renderWatcher?.stop();
 const payload=await api('/api/renders');if(!isCurrent())return;
 const {renders:list,enabled}=payload;
 // One status per real state, with its own icon: queued, rendering, needs approval, done, failed.
 const renderState=r=>{
  if(r.stale||r.status==='submission_unknown')return ['Check Higgsfield','s-bad','triangle-alert'];
  if(reviewReady(r))return ['Review the scene','s-you','circle-alert'];
  if(r.status==='completed'&&r.review==='approved')return ['Approved','s-ok','circle-check'];
  if(r.status==='completed'&&r.review==='rejected')return ['Rejected','s-bad','circle-x'];
  if(r.status==='checking'||(r.status==='checks_failed'&&r.revising))return ['Working','s-run','loader'];
  return ({draft:['Needs checks','s-wait','clock'],checks_failed:['Needs work','s-bad','circle-x'],checks_passed:['Needs your approval','s-you','circle-alert'],submitting:['Submitting','s-run','loader'],queued:['Queued','s-wait','clock'],in_progress:['Rendering','s-run','loader'],completed:['Done','s-ok','circle-check'],failed:['Failed','s-bad','circle-x'],nsfw:['Blocked','s-bad','circle-x'],canceled:['Canceled','s-idle','ban']})[r.status]||[r.status,'s-idle','circle-alert'];
 };
 const rstat=([label,cls,icn])=>`<span class="rstat ${cls}">${ic(icn)}<span>${esc(label)}</span></span>`;
 const row=r=>{const stuck=r.status==='submission_unknown'||r.stale;const st=renderState(r);
  const lows=r.checks?r.checks.results.slice().sort((a,b)=>a.score-b.score):[],low=lows[0];
  const iconBtn=(attr,icn,tip)=>`<button type="button" class="iconbtn" ${attr} data-tip="${tip}" aria-label="${tip}">${ic(icn)}</button>`;
  const acts=[
  ['draft','checks_failed','checks_passed'].includes(r.status)?iconBtn(`data-check="${r.id}"`,'refresh-cw',r.checks?'Run checks again':'Run checks'):'',
  r.review==='rejected'||r.status==='checks_failed'?iconBtn(`data-revise="${r.id}"`,'wand-sparkles','Revise with checker notes'):'',
  r.status==='checks_passed'&&r.estimate_usd?`<button class="btn sm go" data-approve="${r.id}" data-est="${esc(r.estimate_usd)}" title="About $${esc(r.estimate_usd)} on Higgsfield">Approve</button>`:'',
  r.status==='queued'?`<button class="btn sm stop" data-cancel="${r.id}">Cancel</button>`:'',
  reviewReady(r)?`<button class="btn sm go" data-decide="approved" data-id="${r.id}">Approve scene</button><button class="btn sm stop" data-decide="rejected" data-id="${r.id}">Reject</button>`:''].join('');
  const next=stuck?'Find this shot in Higgsfield before anything else. If it is there, paste its request ID. If Higgsfield has no job for it, mark it never started and approve it again.':'';
  const media=video(r),prev=media?`<div class="rmedia">${media}</div>`:r.lead_id?`<div class="rtile">${brandThumb({id:r.lead_id,company:r.title},'fill')}</div>`:`<div class="rtile hf"><img src="/logos/higgsfield.png" alt=""></div>`;
  return `<div class="rcard${media?'':' no-media'}" data-ap-render-id="${r.id}" data-state="${renderGroup(r)}"><div class="rprev${media?'':' placeholder'}">${prev}</div><div class="rmain"><div class="rtitle"><b>${esc(r.title)}</b><span class="mono faint">#${r.id}</span><span class="rside2">${rstat(st)}</span></div>
   <div class="rrow">${low?`<span class="ringwrap" data-tip="Lowest checker: ${esc(low.name)}">${ring(low.score,'sm')}</span>`:''}<button type="button" class="hfbtn" data-hf="${r.id}" aria-expanded="false" data-tip="Details" aria-label="Details"><img src="/logos/higgsfield.png" alt=""></button><span class="ractions">${acts}</span></div>
   ${renderActive(r)?'<p class="hint">Rendering on Higgsfield. The player appears when the clip is ready.</p>':''}${r.plan?.visualQA?.status==='needs_revision'?`<p class="s-bad" style="font-size:12px">AI review: needs revision. ${esc(r.plan.visualQA.findings.join(' '))}</p>`:''}${r.review_note?`<div class="${r.review==='rejected'?'s-bad':'muted'}" style="font-size:11.5px">Review: ${esc(r.review_note)}</div>`:''}${r.error?`<div class="s-bad" style="font-size:11.5px">${esc(r.error)}</div>`:''}
   <div class="rdetail" data-hfbody="${r.id}" hidden><dl><dt>Model</dt><dd>${esc(renderModel(r))}</dd><dt>Length</dt><dd>${renderLength(r)?esc(renderLength(r))+'s':'Length pending'}</dd><dt>Resolution</dt><dd>${esc(r.input.resolution)}</dd><dt>Price</dt><dd>${r.estimate_usd?`about $${esc(r.estimate_usd)}`:'Shown after checks pass'}</dd><dt>Prompt</dt><dd>${esc(r.input.prompt)}</dd>${r.checks?`<dt>Checks</dt><dd>${ringsHTML(r.checks)}</dd>`:''}${r.status==='completed'&&r.result_url?`<dt>Human</dt><dd data-panel="${r.id}"></dd>`:''}</dl></div>
   ${next?`<div class="hint">${esc(next)}</div>`:''}${stuck?`<form id="reconcile-${r.id}" data-reconcile="${r.id}" style="margin-top:10px"><div class="meta">${r.approved_at?`<span>Approved ${esc(new Date(r.approved_at).toLocaleString())}</span>`:''}<span class="mono">Key ${esc(r.submission_key||'none')}</span></div><input type="text" name="requestId" placeholder="Higgsfield request ID" autocomplete="off" style="margin-top:8px"><div class="ractions"><button class="btn sm go" type="submit">It went through</button><button class="btn sm" type="button" data-never="${r.id}">It never started</button></div></form>`:''}${reviewReady(r)?`<input type="text" data-note="${r.id}" placeholder="If rejecting, say what to fix" style="margin-top:8px">`:''}</div></div>`;};
 const groups=[['all','All','layers'],['you','Needs you','circle-alert'],['work','Rendering','loader'],['fix','Needs work','wrench'],['done','Done','circle-check']],counts=Object.fromEntries(groups.map(([k])=>[k,k==='all'?list.length:list.filter(r=>renderGroup(r)===k).length]));
 const savedFilter=pref.get('rfilter','all'),filter=groups.some(([k])=>k===savedFilter)?savedFilter:'all';
 $('#view').innerHTML=`<div class="pagebar"><div class="seg">${groups.map(([k,l,i])=>`<button type="button" data-rf="${k}" class="${k===filter?'on':''}">${ic(i)}${l}${counts[k]?` <span class="n">${counts[k]}</span>`:''}</button>`).join('')}</div><button class="btn go sm" id="newshotbtn" type="button">${ic('plus')}New shot</button></div>
  <form class="card newshot" id="newshot" hidden><div class="body"><input type="text" name="title" placeholder="Shot title, e.g. Hook shot, rooftop" required aria-label="Title"><textarea name="prompt" rows="3" required placeholder="Describe one shot: character, action, camera and dialogue" aria-label="Prompt"></textarea><div class="row"><select name="duration" aria-label="Length"><option value="5">5 seconds</option><option value="8">8 seconds</option><option value="10">10 seconds</option></select><select name="resolution" aria-label="Resolution"><option>720p</option><option>480p</option><option>1080p</option></select><span class="faint" style="flex:1">${enabled?'Seedance 2.5 on Higgsfield. Checks run first, then you approve the price.':'Higgsfield is not connected.'}</span><button type="button" class="btn sm" id="newshotx">Cancel</button><button class="btn sm go" type="submit">Add shot</button></div></div></form>
  <p class="hint" data-ap-render-monitor role="status">Monitoring render status every 5 seconds.</p><div class="rcards">${list.map(row).join('')}<div class="idle" id="render-empty" role="status" hidden></div></div>`;
 const applyFilter=k=>{pref.set('rfilter',k);document.querySelectorAll('[data-rf]').forEach(b=>b.classList.toggle('on',b.dataset.rf===k));document.querySelectorAll('.rcard').forEach(c=>{c.hidden=k!=='all'&&c.dataset.state!==k;});const empty=$('#render-empty');empty.hidden=counts[k]>0;empty.textContent=({all:'No renders available yet.',you:'Nothing needs your review.',work:'No renders in progress.',fix:'No renders need work.',done:'No completed renders available.'})[k];};
 document.querySelectorAll('[data-rf]').forEach(b=>b.onclick=()=>applyFilter(b.dataset.rf));applyFilter(Number.isInteger(arg)?'all':filter);if(Number.isInteger(arg))document.querySelector(`[data-ap-render-id="${arg}"]`)?.scrollIntoView({block:'center'});
 $('#newshotbtn').onclick=()=>{$('#newshot').hidden=false;$('#newshot input').focus();};$('#newshotx').onclick=()=>{$('#newshot').hidden=true;};
 $('#newshot').onsubmit=async e=>{e.preventDefault();const f=e.target;try{await api('/api/renders',{title:f.title.value,prompt:f.prompt.value,duration:Number(f.duration.value),resolution:f.resolution.value});toast('Shot added','ok','Run checks on it next.');renders();}catch(err){toast(err.message,'bad');}};
 document.querySelectorAll('[data-check]').forEach(b=>b.onclick=async()=>{b.disabled=true;b.classList.add('spin');try{await api(`/api/renders/${b.dataset.check}/check`,{});}catch(err){toast(err.message,'bad');}renders();});
 document.querySelectorAll('[data-approve]').forEach(b=>b.onclick=async()=>{if(!confirm(`Spend about $${b.dataset.est} on Higgsfield for this shot?`))return;try{await api(`/api/renders/${b.dataset.approve}/approve`,{estimate:b.dataset.est});toast('Submitted to Higgsfield','ok','It pops up for review when done.');}catch(err){toast(err.message,'bad');}renders();});
 document.querySelectorAll('[data-cancel]').forEach(b=>b.onclick=async()=>{try{await api(`/api/renders/${b.dataset.cancel}/cancel`,{});}catch(err){toast(err.message,'bad');}renders();});
 document.querySelectorAll('[data-revise]').forEach(b=>b.onclick=async()=>{try{await api(`/api/renders/${b.dataset.revise}/revise`,{});toast('Revision queued','ok','Your notes are in the new draft. Run checks on it.');}catch(err){toast(err.message,'bad');}renders();});
 document.querySelectorAll('[data-reconcile]').forEach(f=>f.onsubmit=async e=>{e.preventDefault();const requestId=f.requestId.value.trim();if(!requestId)return toast('Paste the request ID from Higgsfield first.','bad');try{await api(`/api/renders/${f.dataset.reconcile}/reconcile`,{outcome:'submitted',requestId});toast('Render reconciled','ok','It is tracked like any other submitted shot.');}catch(err){toast(err.message,'bad');}renders();});
 document.querySelectorAll('[data-never]').forEach(b=>b.onclick=async()=>{if(!confirm('Only continue if Higgsfield has no job for this shot. Approving it again sends the same key.'))return;try{await api(`/api/renders/${b.dataset.never}/reconcile`,{outcome:'not_submitted'});toast('Marked as never started','ok','Approve it again when you are ready.');}catch(err){toast(err.message,'bad');}renders();});
 document.querySelectorAll('[data-hf]').forEach(b=>b.onclick=()=>{const body=document.querySelector(`[data-hfbody="${b.dataset.hf}"]`);body.hidden=!body.hidden;b.setAttribute('aria-expanded',String(!body.hidden));b.classList.toggle('on',!body.hidden);});
 bindReviews(()=>renders());
 const host=$('#view'),cards=host.querySelector('.rcards');
 renderWatcher=watchRecords({schedule:(fn,ms)=>window.setTimeout(fn,ms),cancel:id=>window.clearTimeout(id),initial:payload,isCurrent:()=>tab()==='renders'&&host.isConnected&&document.querySelector('#view')===host&&host.querySelector('.rcards')===cards,canUpdate:()=>!renderViewBusy(),read:async signal=>{const response=await fetch('/api/renders',{signal});if(!response.ok)throw Error('Render status unavailable');return response.json();},onChange:async()=>{const top=host.scrollTop;await renders();host.scrollTop=top;},onStatus:({ok,at})=>{const label=host.querySelector('[data-ap-render-monitor]');if(label)label.textContent=ok?'Monitoring active. Checked '+new Date(at).toLocaleTimeString()+'.':'Connection interrupted. Monitoring will retry without submitting another render.';}});
 import('/panel-check.js').then(m=>document.querySelectorAll('[data-panel]').forEach(host=>m.panelSection({render:list.find(x=>x.id===Number(host.dataset.panel)),api,esc,toast,host}))).catch(()=>{});
}
const boardStatus={draft:['Needs checks','s-wait'],checking:['Checking','s-run'],checks_failed:['Checks failed','s-bad'],checks_passed:['Ready for your approval','s-you'],approved:['Approved, in Renders','s-ok']};
const ringColor=n=>n<70?'var(--red)':n<90?'var(--yellow)':'var(--green)';
const ring=(score,cls='')=>{const n=Math.max(0,Math.min(100,Math.round(Number(score)||0)));return `<span class="ring ${cls}" style="--c:${ringColor(n)}"><svg viewBox="0 0 36 36" aria-hidden="true"><circle class="rt" cx="18" cy="18" r="15.5" pathLength="100"/><circle class="rf" cx="18" cy="18" r="15.5" pathLength="100" stroke-dasharray="${n} 100"/></svg><b>${n}</b></span>`;};
const ringsHTML=c=>`<div class="rings">${c.results.map(x=>`<div class="rg" title="${esc(clip(x.summary,200))}">${ring(x.score)}<span>${esc(x.name)}</span></div>`).join('')}</div>`;
function checkList(checks){return `<div class="sb-checks">${ringsHTML(checks)}</div>`;}
const openBoards=new Set();
function boardCard(s,hist=[]){
 const p=s.plan,st=boardStatus[s.status]||[s.status,'s-idle'],open=openBoards.has(s.id);
 return `<details class="sb" data-sb="${s.id}"${open?' open':''}><summary><b>${esc(s.title)}</b><span class="chip mono">v${s.version}</span>${schip(st,statusIcon[st[1]])}<span class="faint sb-n">${p.shots.length} shot${p.shots.length===1?'':'s'}</span></summary>
 <div class="sb-body"><div class="meta"><span>${p.durationSeconds}s</span><span class="mono">${money(s.cost_usd)}</span><span>${ago(s.created_at)}</span></div>
 <div class="sb-acts">${s.status!=='approved'?`<button class="btn sm" data-bcheck="${s.id}">Run checkers</button>`:''}${s.status==='checks_passed'?`<button class="btn sm go" data-bapprove="${s.id}">Approve storyboard</button>`:''}${s.status==='checks_failed'?`<button class="btn sm go" data-bquick="${s.id}">Fix with checker notes</button>`:''}${s.status==='approved'?`<a class="btn sm" href="#/renders">Open renders</a>`:''}</div>
 ${s.checks?checkList(s.checks):''}<div class="locks">${[['Character',p.identity],['Wardrobe',p.wardrobe],['Environment',p.environment],['Voice',p.voice]].map(([k,v])=>`<div><span>${k}</span><p>${esc(v)}</p></div>`).join('')}</div>
 <div class="shots">${p.shots.map(x=>`<div class="shot"><div class="shot-h"><b class="mono">${esc(x.id)}</b><span class="chip mono">${x.start}s to ${x.start+x.duration}s</span></div><dl><dt>Camera</dt><dd>${esc(x.camera)}</dd><dt>Action</dt><dd>${esc(x.action)}</dd><dt>Dialogue</dt><dd>${x.dialogue?`"${esc(x.dialogue)}"`:'<span class="faint">Silent</span>'}</dd><dt>Audio</dt><dd class="muted">${esc(x.audio)}</dd></dl></div>`).join('')}</div>
 ${s.status!=='approved'?`<form class="steer" data-brevise="${s.id}" style="padding:12px 0 0;border:0"><input type="text" name="note" placeholder="Optional note for the revision, e.g. make the hook land in the first 2 seconds"><button class="btn" type="submit">Fix with checker notes</button></form>`:''}
 ${hist.length?`<details class="sb-hist"${openBoards.has('h'+s.id)?' open':''} data-sb="h${s.id}"><summary>History (${hist.length})</summary>${hist.map(h=>boardCard(h)).join('')}</details>`:''}</div></details>`;
}
// Same title, newest on top; older versions fold into History under it. Every record stays.
function boardGroups(list){
 const map=new Map();
 for(const s of list){const k=String(s.title||'').trim().toLowerCase();if(!map.has(k))map.set(k,[]);map.get(k).push(s);}
 return [...map.values()].map(g=>g.sort((a,b)=>(b.version-a.version)||(b.id-a.id))).sort((a,b)=>b[0].id-a[0].id);
}
async function storyboards(arg,{isCurrent=()=>true}={}){
 if(arg!=='archive'){const {storyboardTasksView}=await import('./task-storyboards.js');if(isCurrent())await storyboardTasksView({view:$('#view'),api,esc,isCurrent});return;}
 const {storyboards:list}=await api('/api/storyboards');
 const field=(n,l,ph,area)=>`<label>${l}</label>${area?`<textarea name="${n}" rows="2" placeholder="${esc(ph)}"></textarea>`:`<input type="text" name="${n}" placeholder="${esc(ph)}">`}`;
 $('#view').innerHTML=`<div id="ap-workbench"></div><div class="pagebar"><span class="faint">${list.length} storyboard${list.length===1?'':'s'}</span><button class="btn go sm" id="newboardbtn" type="button">${ic('plus')}New storyboard</button></div><form class="card newshot" id="newboard" hidden><div class="head"><h2>Draft a storyboard</h2><button type="button" class="iconbtn" id="newboardx" style="margin-left:auto" aria-label="Close" data-tip="Close">${ic('x')}</button></div><div class="body">${field('product','Product or brand','Mint Labs graphic tee drop')}${field('audience','Audience','Gamers who grew up on PS2 era games')}${field('idea','Video idea or hook','Character reacts to the shirt selling out like a boss fight win',true)}${field('offer','Offer or call to action (optional)','Link in bio')}<label>Length</label><select name="length"><option value="15">15 seconds</option><option value="5">5 seconds</option><option value="30">30 seconds</option></select><details style="margin-top:12px"><summary class="muted">Lock the character (optional)</summary>${field('identity','Identity','Face, age, hair, build',true)}${field('wardrobe','Wardrobe','Exact outfit')}${field('environment','Environment','Location and lighting')}${field('voice','Voice','Tone and delivery')}</details><p><button class="btn go" type="submit">Draft storyboard</button></p><div class="hint">Sonnet 5.5 drafts it, seven Haiku checkers grade it, and you approve it. Approved shots go to Renders, where each shot still needs its own checks and your spend approval.</div></div></form>
 <div class="stack">${boardGroups(list).map(g=>boardCard(g[0],g.slice(1))).join('')||'<div class="idle">No storyboards yet. Press New storyboard, or ask Mint from Home.</div>'}</div>`;
 // Codex owns the apparel planner above the list (docs/MINT-LABS-UI-CONTRACT-v1.txt); it plans offline and never spends.
 // Loaded on demand: Codex commits these files separately, so a checkout without them still runs.
 import('./apparel-storyboards.js').then(m=>m.apparelView({view:$('#ap-workbench'),api,esc,toast,sbadge,svg})).catch(err=>{const w=$('#ap-workbench');if(w)w.hidden=true;console.warn('Apparel planner unavailable',err);});
 document.querySelectorAll('details[data-sb]').forEach(d=>d.addEventListener('toggle',()=>{const k=d.dataset.sb;d.open?openBoards.add(isNaN(k)?k:Number(k)):openBoards.delete(isNaN(k)?k:Number(k));}));
 $('#newboardbtn').onclick=()=>{$('#newboard').hidden=false;$('#newboard input').focus();};$('#newboardx').onclick=()=>{$('#newboard').hidden=true;};
 $('#newboard').onsubmit=async e=>{e.preventDefault();const b=e.target.querySelector('button[type=submit]');b.disabled=true;b.textContent='Drafting, about 30 seconds';try{await api('/api/storyboards',Object.fromEntries(new FormData(e.target)));toast('Storyboard drafted','ok','Run the checkers next.');storyboards();}catch(err){toast(err.message,'bad');b.disabled=false;b.textContent='Draft storyboard';}};
 document.querySelectorAll('[data-bcheck]').forEach(b=>b.onclick=async()=>{b.disabled=true;b.textContent='Checking';try{await api(`/api/storyboards/${b.dataset.bcheck}/check`,{});}catch(err){toast(err.message,'bad');}storyboards();});
 document.querySelectorAll('[data-bapprove]').forEach(b=>b.onclick=async()=>{try{const {renders:made}=await api(`/api/storyboards/${b.dataset.bapprove}/approve`,{});toast('Storyboard approved','ok',`${made.length} shots added to Renders`);}catch(err){toast(err.message,'bad');}storyboards();});
 document.querySelectorAll('[data-bquick]').forEach(b=>b.onclick=async()=>{b.disabled=true;b.textContent='Revising, about 30 seconds';try{await api(`/api/storyboards/${b.dataset.bquick}/revise`,{note:''});toast('Revised storyboard added','ok','Run the checkers on it.');}catch(err){toast(err.message,'bad');}storyboards();});
 document.querySelectorAll('[data-brevise]').forEach(f=>f.onsubmit=async e=>{e.preventDefault();const b=f.querySelector('button');b.disabled=true;b.textContent='Revising';try{await api(`/api/storyboards/${f.dataset.brevise}/revise`,{note:f.note.value});toast('Revised storyboard added','ok','Run the checkers on it.');}catch(err){toast(err.message,'bad');}storyboards();});
}

const autosize=ta=>{ta.style.height='auto';ta.style.height=ta.scrollHeight+2+'px';};
async function settings(arg,{isCurrent=()=>true}={}){
 await loadState();if(!isCurrent())return;const c=state.config,p=c.profile;
 const fields=[['senderName','Name','text'],['company','Company','text'],['senderFact','A true fact about you','area'],['offer','What you offer','area'],['cta','Call to action','area'],['rules','Writing rules','area']];
 $('#view').innerHTML=`<div class="settings">
  <div class="card"><div class="head"><h2>Connections</h2></div><div class="conns">${connRows().map(i=>`<div class="introw"><img src="/logos/${i.id}.png" alt=""><div><b>${esc(i.name)}</b><span>${esc(i.detail)}</span></div><span class="state ${i.st[1]}">${esc(i.st[0])}</span></div>`).join('')}</div></div>
  <form class="card" id="profile"><div class="head"><h2>Sender profile</h2><span class="faint" style="margin-left:auto">Every email is written from this</span></div><div class="body">${fields.map(([k,l,t])=>`<label for="pf-${k}">${l}</label>${t==='text'?`<input id="pf-${k}" type="text" name="${k}" value="${esc(p[k])}">`:`<textarea id="pf-${k}" name="${k}" rows="2">${esc(p[k])}</textarea>`}`).join('')}</div><div class="foot"><span class="faint" id="pfstate">All changes saved</span><button class="btn go" type="submit" id="pfsave" disabled>Save</button></div></form>
 </div>`;
 const f=$('#profile'),values=()=>Object.fromEntries(new FormData(f));let saved=JSON.stringify(values()),saving=false;
 const mark=()=>{const dirty=JSON.stringify(values())!==saved;f.querySelector('#pfsave').disabled=saving||!dirty;f.querySelector('#pfstate').textContent=dirty?'Unsaved changes':'All changes saved';};
 f.querySelectorAll('textarea').forEach(ta=>{autosize(ta);ta.addEventListener('input',()=>autosize(ta));});
 f.addEventListener('input',mark);
 f.onsubmit=async e=>{e.preventDefault();if(saving)return;const payload=values();if(JSON.stringify(payload)===saved)return;saving=true;mark();try{await api('/api/profile',payload);saved=JSON.stringify(payload);toast('Profile saved','ok');}catch(err){toast(err.message,'bad');}finally{saving=false;mark();}};
}

async function voices(){await voicesView({view:$('#view'),api,esc,toast,sbadge,svg});}
async function production(){const {productionView}=await import('./production-research.js');await productionView({view:$('#view'),api,esc,toast});}
async function analytics(){
 // Codex owns analytics.js. Without it (or without analyticsView), show the Activity chart: counts only.
 const m=await import('./analytics.js').catch(()=>null);
 if(m&&typeof m.analyticsView==='function')return m.analyticsView({view:$('#view'),api,esc,toast});
 $('#view').innerHTML='<div class="stats slim" id="stats"></div>';await loadStats();
}
async function orders(paymentId,{isCurrent=()=>true}={}){const {clientProjectView}=await import('./task-storyboards.js');if(isCurrent())await clientProjectView({view:$('#view'),api,esc,toast,paymentId,isCurrent});}
async function clientDemo(arg,{isCurrent=()=>true}={}){if(isCurrent())location.hash='#/tasks';}
async function walkthrough(brandId,{isCurrent=()=>true}={}){const {mountCampaignDemo}=await import('./campaign-demo.js');if(isCurrent())await mountCampaignDemo($('#view'),{brandId:brandId||'disobedient',autoPlay:new URLSearchParams(location.hash.split('?')[1]||'').get('autoplay')==='1'});}
const views={walkthrough,analytics,home,tasks,orders,leads,drafts,storyboards,renders,voices,settings,production,'client-demo':clientDemo};
let lastView,routeVersion=0;
async function route(){
 renderWatcher?.stop();
 const version=++routeVersion,isCurrent=()=>version===routeVersion;
 const [pathPart,query]=location.hash.slice(2).split('?'),[name,arg]=pathPart.split('/');
 const wantRail=new URLSearchParams(query||'').get('rail');if(['live','spend','conn','browser'].includes(wantRail))openRail(wantRail);
 if(name!==lastView){lastView=name;state.hashOpened=null;$('#view').scrollTop=0;$('#drawer').hidden=true;state.selectedLead=null;}
 // Live updates re-render the page, so carry over anything half typed and where the console was scrolled.
 const typed=[...document.querySelectorAll('#view form[id] [name]')].filter(el=>el.value&&['text','textarea'].includes(el.type)).map(el=>[el.form.id,el.name,el.value]);
 const focus=document.activeElement?.form?.id?[document.activeElement.form.id,document.activeElement.name]:null;
 const scroll=document.querySelector('.console:not([hidden])')?.scrollTop;
 try{await loadState();if(!isCurrent())return;await (views[name]||home)(arg?(/^\d+$/.test(arg)?Number(arg):arg):undefined,{isCurrent});}catch(err){if(isCurrent())$('#view').innerHTML=`<div class="card"><div class="empty">${esc(err.message)}</div></div>`;}
 if(!isCurrent())return;
 for(const [form,field,value] of typed){const el=document.querySelector(`#${form} [name="${field}"]`);if(el&&!el.value)el.value=value;}
 if(focus)document.querySelector(`#${focus[0]} [name="${focus[1]}"]`)?.focus();
 const c=document.querySelector('.console:not([hidden])');if(c&&scroll!==undefined&&scroll<c.scrollHeight-c.clientHeight-30)c.scrollTop=scroll;
 renderShell();
}
window.addEventListener('hashchange',route);
loadLive().catch(()=>{}).then(route).then(()=>api('/api/renders')).then(({renders})=>renders.filter(reviewReady).slice(0,2).forEach(popReview)).catch(()=>{});

let refreshTimer,cardTimer,statsTimer,ideationTimer;
const refreshLeadIdeation=()=>{clearTimeout(ideationTimer);ideationTimer=setTimeout(async()=>{const id=state.selectedLead,host=$('#lead-ideation');if(!id||!host)return;try{const data=await api(`/api/leads/${id}`);if(state.selectedLead===id&&host===$('#lead-ideation')){const opened=new Set([...host.querySelectorAll('details[open][data-ap-log]')].map(x=>x.dataset.apLog)),disclosures=['.ap-ideation-tools','.ap-ideation-notes'].map(selector=>[selector,host.querySelector(selector)?.open]);host.innerHTML=ideationPanel(data.ideation,data.events,{esc,icon:ic});for(const detail of host.querySelectorAll('details[data-ap-log]'))detail.open=opened.has(detail.dataset.apLog);for(const [selector,open] of disclosures)if(open!==undefined&&host.querySelector(selector))host.querySelector(selector).open=open;}}catch{}},150);};
const softRefresh=fn=>{clearTimeout(refreshTimer);refreshTimer=setTimeout(fn,400);};
// Counts on the session rows change with every lead, so patch the row heads in place instead of redrawing the page.
const refreshCards=()=>{clearTimeout(cardTimer);cardTimer=setTimeout(async()=>{try{await loadState();const groups=sessionGroups();for(const el of document.querySelectorAll('[data-sh]')){const g=groups.find(x=>x.key===el.dataset.sh);if(g)el.outerHTML=sessHead(g,state.openSess.has(g.key)&&!el.dataset.nav,Boolean(el.dataset.nav));}}catch{}},500);};
const refreshStats=()=>{clearTimeout(statsTimer);statsTimer=setTimeout(()=>loadStats().catch(()=>{}),800);};
const stream=new EventSource('/api/stream');
stream.onmessage=msg=>{
 const change=JSON.parse(msg.data);
 if((change.kind==='ideation'&&change.leadId===state.selectedLead)||(change.kind==='event'&&change.event.lead_id===state.selectedLead))refreshLeadIdeation();
 if(change.kind==='event'){
  const e=change.event;
  if(tab()==='home'&&thread.thinking&&String(e.tool).startsWith('assistant.'))setTimeout(paintChatActivity,0);
  if(tab()==='tasks'&&document.querySelector('#task-ideas-report'))import('./task-storyboards.js').then(m=>m.refreshTaskStoryboardActivity()).catch(()=>{});state.live.unshift(e);state.live.length=Math.min(state.live.length,300);noteDraft(e);
  noteLead(e);if(e.task_id)state.lastStep.set(e.task_id,e);
  if(railTypes.has(e.type)||isTraceEv(e)){scheduleLive();if(railTypes.has(e.type)&&document.body.classList.contains('rail-off')){railUnseen++;setRail(false);}}
  if(e.type==='plan'&&comp.speakTask===e.task_id){comp.speakTask=null;voice.speak(e.title);}
  if(tab()==='tasks'&&e.task_id&&state.sdata.has(e.task_id)){
   const d=state.sdata.get(e.task_id);if(!d.events.some(x=>x.id===e.id)){d.events.push(e);syncMission();}
   const g=sessionGroups().find(x=>x.runs.some(r=>r.id===e.task_id));
   if(g&&state.openSess.has(g.key)){
    if(state.logOpen.has(g.key)){const c=bodyEl(g.key)?.querySelector('.console');if(c){const stick=c.scrollTop+c.clientHeight>=c.scrollHeight-30;c.innerHTML=consoleHTML(g);if(stick)c.scrollTop=c.scrollHeight;}}
    if(e.type==='steer')loadSession(g).then(()=>{if(tab()==='tasks'&&state.openSess.has(g.key)){const t=bodyEl(g.key)?.querySelector('.thread2');if(t){t.innerHTML=threadHTML2(g);t.scrollTop=t.scrollHeight;}}});
   }
  }
  const notice=eventNotification(e);
  if(notice)toast(notice.title,notice.kind,notice.detail,notice.provider,notice.keys);
  else if(e.type==='draft')toast('Draft saved, not sent','ok',e.title.replace(/\. Not sent\.$/,''));
  if(e.type==='error')toast('Error','bad',tidy(e.title));
  if(e.type==='done')toast('Mission finished','ok',e.title.replace(/^Finished: /,''));
 }
 if(change.kind==='lead'){
  const l=change.lead;
  if(tab()==='tasks'&&state.sdata.has(l.task_id)){
   const d=state.sdata.get(l.task_id),i=d.leads.findIndex(x=>x.id===l.id);if(i<0)d.leads.unshift(l);else d.leads[i]=l;
   const g=sessionGroups().find(x=>x.runs.some(r=>r.id===l.task_id));
   const grid=g&&bodyEl(g.key)?.querySelector('[data-leads]');if(grid&&state.openSess.has(g.key))grid.innerHTML=leadsHTML(g);
  }
  if(['home','tasks'].includes(tab()))refreshCards();
  if(tab()==='analytics')refreshStats();
 }
 if(change.kind==='task'){
  const t=change.task,prev=state.tasks.find(x=>x.id===t.id);
  if(tab()==='tasks'&&document.querySelector('#client-task-review')){loadState().catch(()=>{});}
  else if(tab()==='tasks'&&document.querySelector('#task-ideas-report')){loadState().catch(()=>{});import('./task-storyboards.js').then(m=>m.refreshTaskStoryboardActivity()).catch(()=>{});}
  else if(['home','tasks'].includes(tab())){if(prev&&prev.status===t.status)refreshCards();else softRefresh(route);}else loadState().catch(()=>{});
 }
 if(change.kind==='spend'){renderSpend().catch(()=>{});}
 if(change.kind==='whop'&&change.order){const w=state.whop;if(w){const i=(w.orders||[]).findIndex(o=>o.payment_id===change.order.payment_id);if(i<0)(w.orders=w.orders||[]).unshift(change.order);else w.orders[i]=change.order;if(tab()==='tasks')paintOrders();}else if(tab()==='tasks')refreshWhop();}
 if(change.kind==='storyboard'&&tab()==='storyboards')softRefresh(route);
 if(change.kind==='assistant'&&tab()==='home'&&!thread.thinking)loadThread();
 if(change.kind==='voice'&&tab()==='voices'&&![...document.querySelectorAll('audio')].some(a=>!a.paused))softRefresh(route);
 if(change.kind==='render'){if(reviewReady(change.render))popReview(change.render);if(tab()==='renders'){if(window.mintRendersView)window.mintRendersView.patch(change.render);else if(!renderViewBusy())softRefresh(route);}else if(tab()==='home')softRefresh(route);else loadState().catch(()=>{});}
};
