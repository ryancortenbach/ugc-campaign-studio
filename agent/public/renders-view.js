// Renders: a media-first gallery. One 9:16 tile per lead (latest version), a detail panel on the right,
// patched in place from the render stream. Mounted from app.js with rendersView({view,api,esc,toast,arg,isCurrent}).
// Nothing here spends money on its own: Approve opens an in-panel confirm that shows the price first.
import {icons} from './icons.js';
import {renderActive,reviewReady,renderLength,renderModel} from './render-monitor.js';

const ESC={'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>ESC[c]);
const ic=(n,cls='')=>`<svg class="lu${cls?' '+cls:''}" viewBox="0 0 24 24" aria-hidden="true">${icons[n]||''}</svg>`;
const money=v=>{const n=Number(v);return Number.isFinite(n)&&n>0?`$${n.toFixed(2)}`:'';};
const clip=(t,n=140)=>{t=String(t||'').replace(/\s+/g,' ').trim();return t.length>n?t.slice(0,n-1).trimEnd()+'...':t;};
const fileUrl=f=>`/renders/${String(f).split('/').map(encodeURIComponent).join('/')}`;
const PAUSED_TIP='Paid work is paused for this review. Nothing can be approved or checked until spending is turned back on.';

// ---------- pure model (exported for tests) ----------

export const normTitle=t=>String(t||'').replace(/\s*\(v\d+\)\s*$/i,'').replace(/\s+v\d+\s*$/i,'').trim().toLowerCase();
export const brandFromTitle=t=>String(t||'').replace(/\s*\(v\d+\)\s*$/i,'').replace(/\s+v\d+\s*$/i,'').replace(/\s+video$/i,'').trim()||'Shot';

// One group per lead. Renders without a lead group by title, and a render superseded by another joins that one's group.
export function groupRenders(list,names={}){
 const byId=new Map(list.map(r=>[r.id,r]));
 const key=new Map(list.map(r=>[r.id,r.lead_id?`lead:${r.lead_id}`:`title:${normTitle(r.title)}`]));
 for(let pass=0;pass<4;pass++)for(const r of list){const to=r.plan?.supersededByRenderId;if(to&&byId.has(to)&&to!==r.id)key.set(r.id,key.get(to));}
 const groups=new Map();
 for(const r of list){const k=key.get(r.id);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(r);}
 return [...groups].map(([k,rs])=>{
  const versions=rs.slice().sort((a,b)=>a.id-b.id),latest=versions[versions.length-1];
  const name=(latest.lead_id&&names[latest.lead_id])||brandFromTitle(latest.title);
  return {key:k,latest,versions,count:versions.length,name,state:stateOf(latest)};
 }).sort((a,b)=>a.state.rank-b.state.rank||b.latest.id-a.latest.id);
}

// One status vocabulary for the whole view. tab: where the tile shows up besides All.
export function stateOf(r){
 const you=(label,cls,icon,rank=0)=>({label,cls,icon,tab:'you',rank});
 if(r.stale||r.status==='submission_unknown')return you('Check Higgsfield','s-bad','triangle-alert');
 if(reviewReady(r))return you('Needs review','s-you','circle-alert');
 if(renderActive(r))return {label:r.status==='checking'||r.revising?'Checking':'Rendering',cls:'s-run',icon:'loader',tab:'work',rank:2};
 if(r.status==='completed')return r.review==='rejected'?you('Needs work','s-bad','circle-x',1):{label:'Done',cls:'s-ok',icon:'circle-check',tab:'done',rank:3};
 if(r.status==='checks_passed')return you('Needs approval','s-you','circle-alert');
 if(r.status==='checks_failed')return you('Needs work','s-bad','circle-x',1);
 if(r.status==='draft')return you('Needs checks','s-wait','clock',1);
 if(r.status==='failed')return you('Failed','s-bad','circle-x',1);
 if(r.status==='nsfw')return {label:'Blocked',cls:'s-bad',icon:'circle-x',tab:'other',rank:4};
 if(r.status==='canceled')return {label:'Canceled',cls:'s-idle',icon:'ban',tab:'other',rank:4};
 return {label:String(r.status||'Unknown'),cls:'s-idle',icon:'circle-alert',tab:'other',rank:4};
}

export function primaryOf(r){
 if(r.stale||r.status==='submission_unknown')return {label:'Reconcile',kind:'reconcile'};
 if(reviewReady(r))return {label:'Review',kind:'review'};
 if(r.status==='checks_passed')return {label:'Approve',kind:'approve'};
 if(r.status==='draft')return {label:'Run checks',kind:'check'};
 if(r.status==='checks_failed')return {label:'Revise',kind:'revise'};
 return {label:'Open',kind:'open'};
}

export const tabCounts=tiles=>({you:tiles.filter(t=>t.state.tab==='you').length,work:tiles.filter(t=>t.state.tab==='work').length,done:tiles.filter(t=>t.state.tab==='done').length,all:tiles.length});
export const defaultTab=tiles=>tabCounts(tiles).you>0?'you':'all';
export const tilesFor=(tiles,tab)=>tab==='all'?tiles:tiles.filter(t=>t.state.tab===tab);

// Media fallback order: finished video, then the still, then the hero product photo. Callers fall back to the brand logo.
export function mediaCandidates(r){
 const p=r.plan||{},out=[];
 const still=p.still?.local_file?fileUrl(p.still.local_file):(p.still?.result_url||'');
 // The cached copy is versioned by the hero's source URL: research re-scrapes reorder products, and the web view would otherwise show the old photo.
 const heroTag=[...String(p.hero?.imageUrl||'')].reduce((h,c)=>(h*31+c.charCodeAt(0))|0,0).toString(36);
 const heroLocal=r.lead_id&&p.hero&&Number.isInteger(Number(p.hero.index))&&p.hero.index!==null?`/api/leads/${r.lead_id}/products/${p.hero.index}/image?v=${heroTag}`:'';
 const poster=still||p.hero?.imageUrl||heroLocal||'';
 const video=r.status==='completed'?(r.local_file?fileUrl(r.local_file):(r.result_url||'')):'';
 if(video)out.push({kind:'video',src:video,poster});
 if(still)out.push({kind:'still',src:still});
 // The exact photo the render was built from comes first; the cached copy (found by position) is only a fallback, since positions shift on re-scrape.
 if(p.hero?.imageUrl)out.push({kind:'hero',src:p.hero.imageUrl});
 if(heroLocal)out.push({kind:'hero',src:heroLocal});
 return out;
}

export const lowestCheck=r=>{const res=r.checks?.results;return res?.length?res.reduce((a,b)=>b.score<a.score?b:a):null;};
export const dialogueOf=text=>{const m=String(text||'').match(/^\s*Dialogue[^:\n]*:\s*(.+)$/im);return m?m[1].trim():'';};
export function promptsOf(r){
 const p=r.plan||{},motion=p.video?.input?.prompt||(p.still?'':r.input?.prompt)||'';
 const still=p.still?.input?.prompt||(p.hero&&!p.video?r.input?.prompt:'')||'';
 return {Still:still,Motion:motion,Dialogue:dialogueOf(motion)||dialogueOf(r.input?.prompt)};
}

const ringColor=n=>n<70?'var(--red)':n<90?'var(--yellow)':'var(--green)';
const ring=(score,cls='')=>{const n=Math.max(0,Math.min(100,Math.round(Number(score)||0)));return `<span class="ring ${cls}" style="--c:${ringColor(n)}"><svg viewBox="0 0 36 36" aria-hidden="true"><circle class="rt" cx="18" cy="18" r="15.5" pathLength="100"/><circle class="rf" cx="18" cy="18" r="15.5" pathLength="100" stroke-dasharray="${n} 100"/></svg><b>${n}</b></span>`;};

// ---------- markup ----------

const logoBadge=(r,name)=>r.lead_id?`<span class="rv-badge"><b>${esc((name||'?')[0].toUpperCase())}</b><img src="/api/leads/${r.lead_id}/logo" alt="" loading="lazy" data-logo></span>`:'';
const fallbackHTML=(r,name)=>r.lead_id
 ?`<div class="rv-fallback"><span class="rv-biglogo"><b>${esc((name||'?')[0].toUpperCase())}</b><img src="/api/leads/${r.lead_id}/logo" alt="" data-logo></span></div>`
 :`<div class="rv-fallback"><span class="rv-biglogo text"><b>${esc((name||'?')[0].toUpperCase())}</b></span></div>`;
function mediaHTML(r,name,mi=0){
 const c=mediaCandidates(r)[mi];
 if(!c)return fallbackHTML(r,name)+(conceptOK(r)?'<span class="rv-concept">Concept</span>':'');
 if(c.kind==='video')return `<video src="${esc(c.src)}${c.poster?'':'#t=0.1'}" ${c.poster?`poster="${esc(c.poster)}"`:''} muted loop playsinline preload="metadata"></video>`;
 return `<img${c.kind==='hero'?' class="hero"':''} src="${esc(c.src)}" alt="" loading="lazy" draggable="false">${c.kind==='hero'&&conceptOK(r)?'<span class="rv-concept">Concept</span>':''}`;
}
const conceptOK=r=>!['completed','failed','canceled','nsfw'].includes(r.status);
const pillHTML=st=>`<span class="rv-pill ${st.cls}">${ic(st.icon)}<span>${esc(st.label)}</span></span>`;

function cardInner(t,{paused},mi=0){
 const r=t.latest,st=t.state,low=lowestCheck(r),pri=primaryOf(r),price=money(r.estimate_usd);
 const blocked=paused&&['approve','check','review','reconcile'].includes(pri.kind);
 const hover=blocked?`<div class="rv-hover"><span class="rv-chip s-wait" title="${esc(PAUSED_TIP)}">${ic('pause')}Spending paused</span></div>`
  :`<div class="rv-hover">${price?`<span class="rv-price">${price}</span>`:'<span></span>'}<span class="rv-go">${esc(pri.label)}</span></div>`;
 return `<div class="rv-tile${renderActive(r)?' active':''}"><div class="rv-media">${mediaHTML(r,t.name,mi)}</div><i class="rv-shade"></i>${logoBadge(r,t.name)}${low?`<span class="rv-ring" title="Lowest check: ${esc(low.name)}">${ring(low.score,'sm')}</span>`:''}${hover}${pillHTML(st)}${renderActive(r)?'<i class="rv-shimmer"></i>':''}</div><div class="rv-cap"><b>${esc(t.name)}</b>${t.count>1?`<span class="rv-ver">v${t.count}</span>`:''}</div>`;
}
const cardSig=(t,paused)=>{const r=t.latest,p=r.plan||{};return JSON.stringify([r.id,r.status,r.review,r.revising,r.stale,r.local_file,r.result_url,r.estimate_usd,p.still?.local_file,p.hero?.index,lowestCheck(r)?.score,t.count,t.name,paused]);};

// ---------- view ----------

let current=null;
const ui0=()=>({confirm:null,note:'',requestId:'',open:new Set(),newOpen:false});

export async function rendersView({view,api,toast=()=>{},arg,isCurrent=()=>true,poll=true}){
 const win=view.ownerDocument.defaultView||window,doc=view.ownerDocument;
 // Fetch first and only then replace the page, so the previous view stays up until there is something to show.
 const pre=await Promise.all([api('/api/state').catch(()=>null),api('/api/leads').catch(()=>null),api('/api/renders')]);
 if(!isCurrent())return;
 const reuse=current&&current.root.isConnected&&current.view===view;
 const memo=reuse?current.memo:{tab:null,key:null,rid:null};
 current?.stop();
 const S={list:[],names:{},paused:false,tiles:[],byId:new Map(),busy:new Set(),ui:ui0(),offline:false,stopped:false,lastRaw:'',readVersion:0,mi:new Map(),timer:null,ticks:0};
 if(reuse)S.ui=current.ui;
 const TABS=[['you','Needs you','circle-alert'],['work','Rendering','loader'],['done','Done','circle-check'],['all','All','layers']];

 view.innerHTML=`<div class="rv" data-rv><div class="rv-main"><div class="rv-bar"><div class="seg rv-tabs" role="tablist"></div><span class="rv-spacer"></span><span class="rv-chip s-wait rv-paused" hidden data-tip="${esc(PAUSED_TIP)}">${ic('pause')}Spending paused</span><span class="rv-chip s-bad rv-offline" hidden>${ic('triangle-alert')}Offline, retrying</span><button type="button" class="btn go sm" data-a="newshot">${ic('plus')}New shot</button></div><form class="rv-new" hidden><input type="text" name="title" placeholder="Shot title, e.g. Hook shot, rooftop" required aria-label="Title"><textarea name="prompt" rows="3" required placeholder="Describe one shot: character, action, camera and dialogue" aria-label="Prompt"></textarea><div class="rv-newrow"><select name="duration" aria-label="Length"><option value="5">5 seconds</option><option value="8">8 seconds</option><option value="10">10 seconds</option></select><select name="resolution" aria-label="Resolution"><option>720p</option><option>480p</option><option>1080p</option></select><span class="rv-spacer"></span><button type="button" class="btn sm" data-a="newshot-x">Cancel</button><button class="btn sm go" type="submit">Add shot</button></div></form><div class="rv-grid" role="list"></div><div class="rv-empty" id="render-empty" role="status" hidden></div></div><aside class="rvp" hidden aria-label="Render details"><div class="rvp-head"></div><div class="rvp-media"></div><div class="rvp-body"></div></aside></div>`;
 const root=view.firstElementChild,grid=root.querySelector('.rv-grid'),empty=root.querySelector('.rv-empty'),panel=root.querySelector('.rvp'),head=panel.querySelector('.rvp-head'),pmedia=panel.querySelector('.rvp-media'),pbody=panel.querySelector('.rvp-body'),tabsEl=root.querySelector('.rv-tabs'),form=root.querySelector('.rv-new');

 const tileOf=key=>S.tiles.find(t=>t.key===key);
 const selOf=t=>t&&(t.versions.find(r=>r.id===memo.rid)||t.latest);

 // ----- tabs and grid -----
 function patchTabs(){
  const counts=tabCounts(S.tiles);
  tabsEl.innerHTML=TABS.map(([k,l,i])=>`<button type="button" role="tab" data-a="tab" data-tab="${k}" aria-selected="${k===memo.tab}" class="${k===memo.tab?'on':''}">${ic(i)}${l}${counts[k]?` <span class="n">${counts[k]}</span>`:''}</button>`).join('');
  root.querySelector('.rv-paused').hidden=!S.paused;root.querySelector('.rv-offline').hidden=!S.offline;
 }
 function patchGrid(){
  const want=tilesFor(S.tiles,memo.tab),have=new Map([...grid.children].map(n=>[n.dataset.key,n]));
  want.forEach((t,i)=>{
   let n=have.get(t.key);
   if(!n){n=doc.createElement('div');n.className='rv-card';n.setAttribute('role','listitem');n.dataset.key=t.key;}
   const sig=cardSig(t,S.paused);
   if(n.dataset.sig!==sig){S.mi.delete(t.key);n.innerHTML=cardInner(t,S,0);n.dataset.sig=sig;n.dataset.mi='0';}
   n.setAttribute('aria-label',`${t.name}, ${t.state.label}`);n.tabIndex=0;n.dataset.rid=t.latest.id;
   n.classList.toggle('on',t.key===memo.key);
   if(grid.children[i]!==n)grid.insertBefore(n,grid.children[i]||null);
   have.delete(t.key);
  });
  for(const n of have.values())n.remove();
  empty.hidden=want.length>0;
  empty.textContent=S.list.length===0?'No renders yet. Add a shot to get started.':({you:'Nothing needs you right now.',work:'Nothing is rendering.',done:'No finished renders yet.',all:'No renders yet.'})[memo.tab];
 }

 // ----- panel -----
 const priceOf=r=>money(r.estimate_usd);
 const busy=(k,id)=>S.busy.has(k+id);
 const tipwrap=(tip,inner)=>`<span class="rvp-tipwrap" data-tip="${esc(tip)}">${inner}</span>`;
 const iconBtn=(a,icon,tip,id,extra='')=>`<button type="button" class="iconbtn rvp-ib${busy(a,id)?' spin':''}" data-a="${a}" data-tip="${esc(tip)}" aria-label="${esc(tip)}" ${busy(a,id)?'disabled':''} ${extra}>${ic(icon)}</button>`;

 function actionsHTML(r){
  const id=r.id,p=S.paused,price=priceOf(r);
  if(S.ui.confirm==='approve')return `<div class="rvp-confirm"><span>Render for ${esc(price)}?</span><button type="button" class="rvp-btn go" data-a="approve-go" ${busy('approve',id)?'disabled':''}>${ic('check')}Start</button><button type="button" class="rvp-btn" data-a="approve-no">Cancel</button></div>`;
  if(S.ui.confirm==='reject')return `<div class="rvp-confirm col"><textarea rows="2" data-note placeholder="What should be fixed?" aria-label="What should be fixed?">${esc(S.ui.note)}</textarea><div class="rvp-row"><button type="button" class="rvp-btn bad" data-a="rev-send" ${busy('review',id)?'disabled':''}>Reject</button><button type="button" class="rvp-btn" data-a="rev-x">Cancel</button></div></div>`;
  const out=[];
  if(r.status==='checks_passed'&&price)out.push(p?tipwrap(PAUSED_TIP,`<button type="button" class="rvp-btn go" disabled>${ic('check')}Approve ${esc(price)}</button>`):`<button type="button" class="rvp-btn go" data-a="approve" data-tip="Approve and pay ${esc(price)} on Higgsfield" aria-label="Approve ${esc(price)}">${ic('check')}Approve ${esc(price)}</button>`);
  if(reviewReady(r))out.push(p?tipwrap(PAUSED_TIP,`<button type="button" class="rvp-btn go" disabled>${ic('check')}Approve</button>`)+tipwrap(PAUSED_TIP,`<button type="button" class="rvp-btn" disabled>${ic('x')}Reject</button>`)
   :`<button type="button" class="rvp-btn go" data-a="rev-ok" ${busy('review',id)?'disabled':''} data-tip="Keep this video">${ic('check')}Approve</button><button type="button" class="rvp-btn bad" data-a="rev-no" data-tip="Reject and say what to fix">${ic('x')}Reject</button>`);
  if(['draft','checks_failed','checks_passed'].includes(r.status))out.push(p?tipwrap(PAUSED_TIP,`<button type="button" class="iconbtn rvp-ib" disabled>${ic('refresh-cw')}</button>`):iconBtn('check','refresh-cw',r.checks?'Run checks again':'Run checks',id));
  if(r.review==='rejected'||r.status==='checks_failed')out.push(iconBtn('revise','wand-sparkles',r.review==='rejected'?'Revise with your review notes':'Revise with checker notes',id));
  if(r.status==='queued')out.push(iconBtn('cancel','x','Cancel this render',id));
  if(p&&['checks_passed','draft','checks_failed'].includes(r.status))out.push(`<span class="rv-chip s-wait" data-tip="${esc(PAUSED_TIP)}">${ic('pause')}Spending paused</span>`);
  return out.length?`<div class="rvp-acts">${out.join('')}</div>`:'';
 }

 function stuckHTML(r){
  if(!(r.stale||r.status==='submission_unknown'))return '';
  const id=r.id,p=S.paused;
  const never=S.ui.confirm==='never'?`<div class="rvp-confirm"><span>Higgsfield has no job for this shot?</span><button type="button" class="rvp-btn go" data-a="never-go" ${busy('never',id)?'disabled':''}>Yes, mark it</button><button type="button" class="rvp-btn" data-a="never-no">Cancel</button></div>`:`<button type="button" class="rvp-btn" data-a="never" ${p?'disabled':''}>It never started</button>`;
  return `<section class="rvp-sec"><h4>Outcome unknown</h4><p class="rvp-note">Find this shot in Higgsfield before anything else. If it is there, paste its request ID. If Higgsfield has no job for it, mark it never started and approve it again.</p><form class="rvp-recon" data-a="recon"><input type="text" name="requestId" value="${esc(S.ui.requestId)}" placeholder="Higgsfield request ID" autocomplete="off" aria-label="Higgsfield request ID"><button class="rvp-btn go" type="submit" ${p||busy('recon',id)?'disabled':''}>It went through</button></form><div class="rvp-row">${never}</div>${r.submission_key?`<p class="rvp-fine mono">Key ${esc(r.submission_key)}</p>`:''}</section>`;
 }

 function bodyHTML(t,r){
  const p=r.plan||{},h=p.hero,out=[];
  out.push(`<div class="rvp-actions">${actionsHTML(r)}</div>`);
  if(t.versions.length>1)out.push(`<section class="rvp-sec"><h4>Versions</h4><div class="rvp-vers">${t.versions.slice().reverse().map(v=>{const n=t.versions.indexOf(v)+1,c=mediaCandidates(v).find(x=>x.kind!=='video'),vs=stateOf(v);return `<button type="button" class="rvp-v${v.id===r.id?' on':''}" data-a="ver" data-rid="${v.id}" title="v${n}: ${esc(vs.label)}"><span class="rvp-vt">${c?`<img src="${esc(c.src)}" alt="" loading="lazy" data-hide>`:''}<b>${n}</b><i class="dot ${vs.cls}"></i></span><span>v${n}</span></button>`;}).join('')}</div></section>`);
  out.push(stuckHTML(r));
  const notes=[];
  if(r.review_note)notes.push(['Your note',r.review_note]);
  if(p.visualQA?.status==='needs_revision'&&p.visualQA.findings?.length)notes.push(['AI review',p.visualQA.findings.join(' ')]);
  if(r.error)notes.push(['Details',r.error]);
  if(notes.length)out.push(`<section class="rvp-sec">${notes.map(([k,v])=>`<div class="rvp-notebox"><span>${esc(k)}</span><p>${esc(v)}</p></div>`).join('')}</section>`);
  if(h)out.push(`<section class="rvp-sec"><h4>Product</h4><div class="rvp-hero">${(r.lead_id&&h.index!==undefined)||h.imageUrl?`<img src="${esc(r.lead_id&&h.index!==undefined&&h.index!==null?`/api/leads/${r.lead_id}/products/${h.index}/image?v=${[...String(h.imageUrl||'')].reduce((x,c)=>(x*31+c.charCodeAt(0))|0,0).toString(36)}`:h.imageUrl)}" alt="" data-hide>`:'<span class="ph"></span>'}<div><b>${esc(h.title||'Hero product')}</b><div class="rvp-chips">${h.kind?`<span class="rv-kind">${esc(h.kind)}</span>`:''}${h.price?`<span class="rvp-fine">$${esc(h.price)}</span>`:''}</div></div></div></section>`);
  if(r.checks?.results?.length)out.push(`<section class="rvp-sec"><h4>Checks</h4><div class="rvp-rings">${r.checks.results.map(x=>`<div class="rvp-rg" title="${esc(clip(x.summary,160))}">${ring(x.score)}<span>${esc(x.name)}</span></div>`).join('')}</div></section>`);
  const pr=promptsOf(r),fields=Object.entries(pr).filter(([,v])=>v);
  if(fields.length)out.push(`<section class="rvp-sec"><h4>Prompts</h4>${fields.map(([k,v])=>`<details class="rvp-pr" data-pk="${r.id}:${k}"${S.ui.open.has(`${r.id}:${k}`)?' open':''}><summary>${ic('chevron-down')}${k}</summary><p>${esc(v)}</p></details>`).join('')}</section>`);
  out.push(`<section class="rvp-sec"><dl class="rvp-meta"><dt>Model</dt><dd>${esc(renderModel(r))}</dd><dt>Length</dt><dd>${renderLength(r)?esc(renderLength(r))+'s':'Pending'}</dd><dt>Resolution</dt><dd>${esc(r.input?.resolution||'')}</dd><dt>Price</dt><dd>${priceOf(r)||'Shown after checks pass'}</dd>${r.group_name?`<dt>Group</dt><dd>${esc(r.group_name)}</dd>`:''}<dt>Created</dt><dd>${esc(r.created_at?new Date(r.created_at).toLocaleString():'')}</dd></dl></section>`);
  if(r.status==='completed'&&r.result_url)out.push(`<section class="rvp-sec"><h4>Human check</h4><div data-panel-host></div></section>`);
  return out.join('');
 }
 const panelSig=(t,r)=>JSON.stringify([r,t.versions.map(v=>[v.id,v.status,v.review]),S.paused,S.ui.confirm,[...S.ui.open],[...S.busy]]);
 const mediaKey=(r)=>JSON.stringify([r.id,mediaCandidates(r).map(c=>c.src),r.lead_id,r.status==='completed']);

 function panelMediaHTML(r,name,mi){
  const c=mediaCandidates(r)[mi];
  if(!c)return `<div class="rvp-frame">${fallbackHTML(r,name)}</div>`;
  if(c.kind==='video')return `<div class="rvp-frame"><video src="${esc(c.src)}${c.poster?'':'#t=0.1'}" ${c.poster?`poster="${esc(c.poster)}"`:''} controls playsinline preload="metadata"></video></div>`;
  return `<div class="rvp-frame"><img${c.kind==='hero'?' class="hero"':''} src="${esc(c.src)}" alt="">${c.kind==='hero'&&conceptOK(r)?'<span class="rv-concept">Concept</span>':''}</div>`;
 }

 function patchPanel(force=false){
  const t=tileOf(memo.key);
  if(!memo.key||!t){panel.hidden=true;root.classList.remove('has-panel');return;}
  const r=selOf(t);memo.rid=r.id;
  panel.hidden=false;root.classList.add('has-panel');
  const st=stateOf(r);
  const hsig=JSON.stringify([t.name,r.id,st.label,t.count]);
  if(force||head.dataset.sig!==hsig){head.dataset.sig=hsig;head.innerHTML=`<span class="rvp-brand">${r.lead_id?`<span class="rv-badge sm"><b>${esc(t.name[0].toUpperCase())}</b><img src="/api/leads/${r.lead_id}/logo" alt="" data-logo></span>`:''}<span class="rvp-title"><b>${esc(t.name)}</b><span class="rvp-sub">#${r.id}${t.count>1?` &middot; v${t.versions.indexOf(r)+1} of ${t.count}`:''}</span></span></span>${pillHTML(st)}<button type="button" class="iconbtn rvp-x" data-a="close" aria-label="Close" data-tip="Close (Esc)">${ic('x')}</button>`;}
  const mk=mediaKey(r);
  if(force||pmedia.dataset.mk!==mk){pmedia.dataset.mk=mk;pmedia.dataset.mi='0';pmedia.innerHTML=panelMediaHTML(r,t.name,0);}
  const sig=panelSig(t,r),typing=pbody.contains(doc.activeElement)&&/^(INPUT|TEXTAREA)$/.test(doc.activeElement.tagName);
  if(!force&&pbody.dataset.sig===sig)return;
  if(typing&&!force)return;
  pbody.dataset.sig=sig;pbody.innerHTML=bodyHTML(t,r);
  const host=pbody.querySelector('[data-panel-host]');
  if(host)import('./panel-check.js').then(m=>m.panelSection({render:r,api,esc,toast,host})).catch(()=>{});
 }
 function openPanel(key,rid){
  const t=tileOf(key);if(!t)return;
  if(memo.key!==key||(rid&&rid!==memo.rid)){S.ui.confirm=null;S.ui.note='';S.ui.requestId='';}
  memo.key=key;memo.rid=rid||t.latest.id;
  grid.querySelectorAll('.rv-card.on').forEach(n=>n.classList.remove('on'));
  [...grid.children].find(n=>n.dataset.key===key)?.classList.add('on');
  patchPanel(true);
 }
 function closePanel(){
  memo.key=null;memo.rid=null;S.ui.confirm=null;
  grid.querySelectorAll('.rv-card.on').forEach(n=>n.classList.remove('on'));
  patchPanel();
 }

 function apply(list){
  S.list=list.slice().sort((a,b)=>a.id-b.id);S.byId=new Map(S.list.map(r=>[r.id,r]));
  S.tiles=groupRenders(S.list,S.names);
  if(!memo.tab)memo.tab=defaultTab(S.tiles);
  patchTabs();patchGrid();patchPanel();
 }
 async function refresh(){
  const version=++S.readVersion;let d;
  try{d=await api('/api/renders');}catch(error){if(version!==S.readVersion||!alive())return;throw error;}
  if(version!==S.readVersion||!alive())return;
  S.offline=false;
  const raw=JSON.stringify(d.renders);
  if(raw!==S.lastRaw){S.lastRaw=raw;apply(d.renders);}else patchTabs();
 }
 const loadMeta=async()=>{
  try{const d=await api('/api/state');const next=Boolean(d.config?.spendingPaused);if(next!==S.paused){S.paused=next;S.lastRaw='';}}catch{}
 };
 const loadNames=async()=>{
  try{const d=await api('/api/leads');const ls=Array.isArray(d)?d:d.leads||[];S.names=Object.fromEntries(ls.map(l=>[l.id,l.company||l.domain]).filter(([,n])=>n));}catch{}
 };

 // ----- actions -----
 async function run(name,id,fn,{ok,sub}={}){
  const k=name+id;if(S.busy.has(k))return null;
  S.busy.add(k);patchPanel(true);
  try{const out=await fn();if(ok)toast(ok,'ok',sub||'');return out||true;}
  catch(err){if(/paused/i.test(err.message||'')){S.paused=true;S.lastRaw='';}toast(err.message||'Something went wrong','bad');return null;}
  finally{S.busy.delete(k);try{await refresh();}catch{}if(S.paused)patchGrid();patchTabs();patchPanel(true);}
 }
 const cur=()=>{const t=tileOf(memo.key);return t?selOf(t):null;};
 const actions={
  async check(r){await run('check',r.id,()=>api(`/api/renders/${r.id}/check`,{}),{ok:'Checks finished'});},
  async revise(r){const out=await run('revise',r.id,()=>api(`/api/renders/${r.id}/revise`,{}),{ok:'Revision queued',sub:'Your notes are in the new draft. Run checks on it.'});if(out&&out.render){await refresh().catch(()=>{});const t=S.tiles.find(x=>x.versions.some(v=>v.id===out.render.id));if(t)openPanel(t.key,out.render.id);}},
  async cancel(r){await run('cancel',r.id,()=>api(`/api/renders/${r.id}/cancel`,{}),{ok:'Render canceled'});},
  async 'approve-go'(r){const est=r.estimate_usd;S.ui.confirm=null;const out=await run('approve',r.id,()=>api(`/api/renders/${r.id}/approve`,{estimate:est}),{ok:'Submitted to Higgsfield',sub:'It pops up for review when done.'});return out;},
  async 'rev-ok'(r){await run('review',r.id,()=>api(`/api/renders/${r.id}/review`,{decision:'approved',note:''}),{ok:'Scene approved'});},
  async 'rev-send'(r){const note=S.ui.note.trim();if(!note){toast('Say what to fix so the next render can be better.','bad');return;}const out=await run('review',r.id,()=>api(`/api/renders/${r.id}/review`,{decision:'rejected',note}),{ok:'Scene rejected',sub:'Use Revise to queue a fixed version.'});if(out){S.ui.confirm=null;S.ui.note='';patchPanel(true);}},
  async 'never-go'(r){S.ui.confirm=null;await run('never',r.id,()=>api(`/api/renders/${r.id}/reconcile`,{outcome:'not_submitted'}),{ok:'Marked as never started',sub:'Approve it again when you are ready.'});},
 };

 root.addEventListener('click',e=>{
  const b=e.target.closest('[data-a]');
  if(!b){const card=e.target.closest('.rv-card');if(card)openPanel(card.dataset.key);return;}
  const a=b.dataset.a;
  if(a==='tab'){memo.tab=b.dataset.tab;patchTabs();patchGrid();return;}
  if(a==='close'){closePanel();return;}
  if(a==='newshot'){S.ui.newOpen=true;form.hidden=false;form.title.focus();return;}
  if(a==='newshot-x'){S.ui.newOpen=false;form.hidden=true;return;}
  if(a==='recon')return;
  const r=cur();if(!r)return;
  if(a==='ver'){memo.rid=Number(b.dataset.rid);S.ui.confirm=null;patchPanel(true);return;}
  if(a==='approve'){if(!S.paused){S.ui.confirm='approve';patchPanel(true);}return;}
  if(a==='approve-no'||a==='rev-x'||a==='never-no'){S.ui.confirm=null;patchPanel(true);return;}
  if(a==='rev-no'){S.ui.confirm='reject';patchPanel(true);pbody.querySelector('[data-note]')?.focus();return;}
  if(a==='never'){S.ui.confirm='never';patchPanel(true);return;}
  if(actions[a])actions[a](r);
 });
 root.addEventListener('submit',async e=>{
  e.preventDefault();
  if(e.target===form){
   const f=form;
   try{const out=await api('/api/renders',{title:f.title.value,prompt:f.prompt.value,duration:Number(f.duration.value),resolution:f.resolution.value});toast('Shot added','ok','Run checks on it next.');f.reset();f.hidden=true;S.ui.newOpen=false;await refresh();memo.tab='you';patchTabs();patchGrid();}
   catch(err){toast(err.message,'bad');}
   return;
  }
  const rf=e.target.closest('[data-a="recon"]');if(!rf)return;
  const r=cur(),requestId=rf.requestId.value.trim();
  if(!r)return;if(!requestId){toast('Paste the request ID from Higgsfield first.','bad');return;}
  await run('recon',r.id,()=>api(`/api/renders/${r.id}/reconcile`,{outcome:'submitted',requestId}),{ok:'Render reconciled',sub:'It is tracked like any other submitted shot.'});
 });
 root.addEventListener('input',e=>{
  if(e.target.matches('[data-note]'))S.ui.note=e.target.value;
  if(e.target.name==='requestId')S.ui.requestId=e.target.value;
 });
 panel.addEventListener('toggle',e=>{const d=e.target;if(d.dataset?.pk){d.open?S.ui.open.add(d.dataset.pk):S.ui.open.delete(d.dataset.pk);}},true);
 root.addEventListener('keydown',e=>{const card=e.target.closest?.('.rv-card');if(card&&e.target===card&&(e.key==='Enter'||e.key===' ')){e.preventDefault();openPanel(card.dataset.key);}});

 // Media errors: try the next fallback (video, still, hero photo, logo). Logos and thumbnails just drop out.
 root.addEventListener('error',e=>{
  const el=e.target;if(!el||!el.tagName)return;
  if(el.hasAttribute('data-logo')||el.hasAttribute('data-hide')){el.remove();return;}
  const card=el.closest('.rv-card'),pm=el.closest('.rvp-media');
  if(card){const t=tileOf(card.dataset.key);if(!t)return;const mi=Number(card.dataset.mi||0)+1;card.dataset.mi=String(mi);card.querySelector('.rv-media').innerHTML=mediaHTML(t.latest,t.name,mi);}
  else if(pm){const r=cur(),t=tileOf(memo.key);if(!r||!t)return;const mi=Number(pm.dataset.mi||0)+1;pm.dataset.mi=String(mi);pm.innerHTML=panelMediaHTML(r,t.name,mi);}
 },true);
 // Hover plays the clip, muted and looping, and rewinds on leave.
 const vid=(e,on)=>{const card=e.target.closest?.('.rv-card');if(!card||card.contains(e.relatedTarget))return;const v=card.querySelector('video');if(!v)return;try{if(on){const p=v.play&&v.play();p&&p.catch&&p.catch(()=>{});}else{v.pause&&v.pause();v.currentTime=0;}}catch{}};
 grid.addEventListener('mouseover',e=>vid(e,true));grid.addEventListener('mouseout',e=>vid(e,false));
 grid.addEventListener('focusin',e=>vid(e,true));grid.addEventListener('focusout',e=>vid(e,false));
 const onKey=e=>{if(e.key!=='Escape'||!root.isConnected)return;if(S.ui.confirm){S.ui.confirm=null;patchPanel(true);}else if(memo.key)closePanel();};
 doc.addEventListener('keydown',onKey);

 // ----- lifecycle -----
 const alive=()=>!S.stopped&&root.isConnected&&isCurrent();
 const stop=()=>{S.stopped=true;clearTimeout(S.timer);doc.removeEventListener('keydown',onKey);if(win.mintRendersView&&win.mintRendersView.root===root)delete win.mintRendersView;};
 current={view,root,memo,ui:S.ui,stop};
 // The app's render stream calls this with each changed render so tiles patch in place.
 win.mintRendersView={root,patch(render){if(!alive()||!render||!Number.isInteger(render.id))return;S.readVersion++;const i=S.list.findIndex(x=>x.id===render.id);const next=i<0?[...S.list,render]:S.list.map(x=>x.id===render.id?{...x,...render}:x);S.lastRaw='';apply(next);}};

 S.paused=Boolean(pre[0]?.config?.spendingPaused);
 {const ls=Array.isArray(pre[1])?pre[1]:pre[1]?.leads||[];S.names=Object.fromEntries(ls.map(l=>[l.id,l.company||l.domain]).filter(([,n])=>n));}
 S.lastRaw=JSON.stringify(pre[2].renders);apply(pre[2].renders);
 // The router hands the id over as a string (#/renders/21), so coerce before matching.
 const deep=Number(arg);
 if(Number.isInteger(deep)&&deep>0){const t=S.tiles.find(x=>x.versions.some(v=>v.id===deep));if(t)openPanel(t.key,deep);}
 else if(memo.key)patchPanel(true);
 if(poll){
  const tick=async()=>{
   if(!alive()){stop();return;}
   try{S.ticks++;if(S.ticks%4===0)await loadMeta();await refresh();}catch{S.offline=true;patchTabs();}
   if(alive())S.timer=setTimeout(tick,5000);else stop();
  };
  S.timer=setTimeout(tick,5000);
 }
 return {stop,state:S};
}
