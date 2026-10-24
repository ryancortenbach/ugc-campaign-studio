import {icons} from './icons.js';
import {voicesView} from './voices.js';
const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const time=at=>at?new Date(at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}):'';
const ago=at=>{const s=Math.max(0,(Date.now()-new Date(at))/1000);return s<60?`${Math.floor(s)}s ago`:s<3600?`${Math.floor(s/60)}m ago`:s<86400?`${Math.floor(s/3600)}h ago`:new Date(at).toLocaleDateString();};
const money=n=>`$${Number(n||0).toFixed(Number(n)<1?4:2)}`;
async function api(path,body){const res=await fetch(path,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await res.json().catch(()=>({}));if(!res.ok)throw Error(data.error||`HTTP ${res.status}`);return data;}
const glyph={ok:'<path d="M5 12.5l4.5 4.5L19 7.5"/>',bad:'<path d="M7 7l10 10M17 7L7 17"/>',run:'<path d="M12 4a8 8 0 1 0 8 8"/>',wait:'<circle cx="12" cy="12" r="8"/><path d="M12 8v4.5l3 1.8"/>',you:'<path d="M12 6v8M12 17.5v.5"/>',idle:'<circle cx="12" cy="12" r="8"/><path d="M6.5 17.5l11-11"/>',info:'<path d="M12 11v6M12 7.5v.5"/>',
 play:'<path d="M8 5.5v13l10.5-6.5z" style="fill:currentColor"/>',pause:'<path d="M8.5 6v12M15.5 6v12"/>',stop:'<rect x="6.5" y="6.5" width="11" height="11" rx="1.5" style="fill:currentColor"/>',clone:'<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6A1.5 1.5 0 0 0 14 4.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5"/>',
 open:'<path d="M14 4.5h5.5V10M19.5 4.5L11 13M17 13.5v5a1 1 0 0 1-1 1H5.5a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h5"/>',mail:'<rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="M4 7l8 6 8-6"/>',eye:'<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>'};
const svg=k=>`<svg viewBox="0 0 24 24">${glyph[k]}</svg>`;
const ic=n=>`<svg class="lu" viewBox="0 0 24 24" aria-hidden="true">${icons[n]}</svg>`;
// Cyber style toasts: big status icon, bold title, detail line, stacked bottom right.
function toast(title,kind='info',sub=''){
 let box=$('#toasts');if(!box){box=document.createElement('div');box.id='toasts';document.body.append(box);}
 const t=document.createElement('div');t.className=`toast t-${kind}`;
 t.innerHTML=`<i>${svg(kind==='ok'?'ok':kind==='bad'?'bad':'info')}</i><div style="min-width:0"><b>${esc(title)}</b>${sub?`<span>${esc(sub)}</span>`:''}</div><button class="x" title="Dismiss">×</button>`;
 t.querySelector('.x').onclick=()=>t.remove();box.prepend(t);while(box.children.length>4)box.lastChild.remove();setTimeout(()=>t.remove(),kind==='bad'?9000:5000);
}

// Status palette from Cyber 4.5: orange working, yellow needs you, green done, red failed, white waiting.
const leadStatus={found:['Queued','s-wait'],visiting:['Visiting site','s-run'],grading:['Checking fit','s-run'],drafting:['Writing email','s-run'],awaiting_video:['Waiting for video','s-you'],drafted:['Draft ready','s-ok'],rejected:['Not a fit','s-idle'],skipped:['Skipped','s-idle'],unreachable:['Site unreachable','s-bad'],error:['Error','s-bad'],contacted:['Contacted','s-ok'],replied:['Replied','s-ok'],won:['Won','s-ok'],lost:['Lost','s-bad']};
const taskStatus={queued:['Queued','s-wait'],running:['Running','s-run'],paused:['Paused','s-wait'],done:['Done','s-ok'],stopped:['Stopped','s-idle'],failed:['Failed','s-bad']};
const pill=([label,cls])=>`<span class="pill ${cls}">${esc(label)}</span>`;
const sbadge=([label,cls])=>`<span class="sbadge ${cls}"><i>${svg(cls.slice(2))}</i><b>${esc(label)}</b></span>`;
const ls=s=>leadStatus[s]||[s,'s-idle'];const ts=s=>taskStatus[s]||[s,'s-idle'];
const titles={home:'Home',tasks:'Tasks',leads:'Leads',drafts:'Drafts',storyboards:'Storyboards',renders:'Renders',voices:'Voices',settings:'Settings'};
const logoFor=tool=>{const t=String(tool||'').toLowerCase();return t.startsWith('claude')?'claude':t.includes('exa')?'exa':t.startsWith('solari')?'solari':t.startsWith('gmail')?'gmail':t.includes('higgsfield')?'higgsfield':t.includes('elevenlabs')?'elevenlabs':t.includes('whop')?'whop':null;};
const icon=tool=>{const l=logoFor(tool);return l?`<span class="ico"><img src="/logos/${l}.png" alt="${l}"></span>`:tool==='operator'?'<span class="ico">You</span>':'<span class="ico" title="Mint Labs agent"><img src="/logo.png" alt="Mint Labs"></span>';};

const state={config:null,tasks:[],mission:null,selectedLead:null,openEvents:new Set(),live:[],lastStep:new Map(),gmail:new Map()};
const pref={get(k,d){try{return localStorage.getItem(k)||d;}catch{return d;}},set(k,v){try{localStorage.setItem(k,v);}catch{}}};
const tab=()=>(location.hash.slice(2).split('/')[0]||'home');

async function loadState(){const d=await api('/api/state');state.config=d.config;state.tasks=d.tasks;renderShell();}
function renderShell(){
 const c=state.config;if(!c)return;
 $('#pagetitle').textContent=titles[tab()]||'Home';
 document.querySelectorAll('#tabs a,#tabs-foot a').forEach(a=>a.classList.toggle('on',a.dataset.tab===tab()));
 const rt=document.querySelector('#tabs a[data-tab="renders"]');rt.querySelector('.badge')?.remove();if(c.stats.reviews)rt.insertAdjacentHTML('beforeend',`<span class="badge">${c.stats.reviews}</span>`);
 const on=c.integrations.filter(i=>i.on).length,all=c.integrations.length;
 $('#intdot').className=`dot ${on===all?'on':'part'}`;
 $('#intlabel').textContent=on===all?'Active':`${on} of ${all} active`;
 $('#intpanel').innerHTML=c.integrations.map(i=>`<${i.on?'div':'a href="#/settings"'} class="introw"><img src="/logos/${i.id}.png" alt=""><div><b>${esc(i.name)}</b><span>${esc(i.detail)}</span></div><span class="state ${i.on?'s-ok':'s-you'}">${i.on?'Connected':'Needs key'}</span></${i.on?'div':'a'}>`).join('');
 $('#spend').textContent=`$${Number(c.stats.spend||0).toFixed(2)}`;
}
const providerName={claude:'Claude',exa:'Exa',solari:'Solari',higgsfield:'Higgsfield',whop:'Whop',gmail:'Gmail',elevenlabs:'ElevenLabs'};
async function renderSpend(){
 const s=await api('/api/spend');
 $('#spend').textContent=`$${s.total.toFixed(2)}`;
 $('#spendpanel').innerHTML=`<div class="introw" style="cursor:default"><img src="/logo.png" alt=""><div><b>All time</b><span>Today $${s.today.toFixed(4)}</span></div><b class="mono">$${s.total.toFixed(4)}</b></div>${s.providers.map(p=>`<div class="introw"><img src="/logos/${esc(p.provider)}.png" alt=""><div><b>${esc(providerName[p.provider]||p.provider)}</b><span>Today $${p.today.toFixed(4)} · ${p.count} charge${p.count===1?'':'s'}</span></div><b class="mono">$${p.total.toFixed(4)}</b></div>`).join('')||'<div class="empty">No spend yet.</div>'}<div class="hint" style="padding:4px 10px 8px">Higgsfield shows the price you approved for each render. Solari is billed by browser time.</div>`;
}
function togglePanel(btn,panel){btn.addEventListener('click',e=>{e.stopPropagation();const open=panel.hidden;document.querySelectorAll('.intpanel').forEach(p=>{p.hidden=true;});document.querySelectorAll('.intbtn').forEach(b=>b.setAttribute('aria-expanded','false'));panel.hidden=!open;btn.setAttribute('aria-expanded',String(open));if(open&&panel.id==='spendpanel')renderSpend().catch(()=>{});});}
togglePanel($('#intbtn'),$('#intpanel'));togglePanel($('#spendbtn'),$('#spendpanel'));
// The live feed is a pullout: the button docks it or tucks it away, and counts what arrived while it was hidden.
let railUnseen=0;
function setRail(open){
 pref.set('rail',open?'on':'off');document.body.classList.toggle('rail-off',!open);if(open)railUnseen=0;
 const b=$('#railbtn'),tip=open?'Hide live feed':'Show live feed';
 b.innerHTML=ic(open?'panel-right-close':'panel-right-open')+(railUnseen?`<span class="badge">${railUnseen>99?'99+':railUnseen}</span>`:'');
 b.dataset.tip=tip;b.setAttribute('aria-label',tip);b.setAttribute('aria-pressed',String(open));
}
$('#railbtn').onclick=()=>setRail(document.body.classList.contains('rail-off'));
setRail(pref.get('rail','on')==='on');
document.addEventListener('click',e=>{if(!e.target.closest('.integr')){document.querySelectorAll('.intpanel').forEach(p=>{p.hidden=true;});document.querySelectorAll('.intbtn').forEach(b=>b.setAttribute('aria-expanded','false'));}});

const toolLabels={'claude.plan':'Claude planning','claude.score':'Claude grading','claude.draft':'Claude writing','claude.steer':'Claude steering','gmail.drafts.create':'Gmail draft','solari.browser':'Solari browser','fetch':'Web fetch','crm':'CRM','crm.create':'CRM','rules':'Rules','operator':'You','exa':'Exa','exa.search (REST)':'Exa search','exa.web_search_exa (MCP)':'Exa search'};
const host=u=>{try{return new URL(u).hostname.replace(/^www\./,'');}catch{return '';}};
const brandThumb=(l,size='')=>`<span class="thumb ${size}"><b>${esc((l.company||l.domain||'?')[0])}</b>${l.id?`<img src="/api/leads/${l.id}/logo" alt="" loading="lazy" onerror="this.remove()">`:''}</span>`;
const socialNames={instagram:'Instagram',tiktok:'TikTok',youtube:'YouTube',x:'X',facebook:'Facebook'};
const socialLinks=(l,big)=>Object.entries(l.socials||{}).filter(([k,u])=>socialNames[k]&&/^https:\/\//.test(u)).map(([k,u])=>`<a class="${big?'chip soc':'soc'}" href="${esc(u)}" target="_blank" rel="noopener" onclick="event.stopPropagation()" data-tip="${socialNames[k]}" aria-label="${socialNames[k]}"><svg class="si" viewBox="0 0 24 24">${icons['si-'+k]}</svg>${big?socialNames[k]:''}</a>`).join('');
const gmailBtn=(url,cls='btn sm')=>`<a class="${cls} gm" href="${esc(url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()"><img src="/logos/gmail.png" alt="">Open in Gmail</a>`;
const toolName=t=>{const raw=String(t||'').replace(/\s*\(claude-.*\)$/,'');return toolLabels[raw]||toolLabels[raw.split(' ')[0]]||(raw.startsWith('exa')?'Exa search':raw);};
// Older log lines carry fit scores and page titles with long dashes; show them without either.
const tidy=t=>String(t??'').replace(/\s*\(fit \d+\)/g,'').replace(/\s*\u2014\s*/g,', ');
const isNow=e=>e.type==='tool_call'&&state.lastStep.get(e.task_id)===e&&state.tasks.some(t=>t.id===e.task_id&&t.status==='running');
// The rail shows what the agent is doing and decided; raw results and status chatter stay in the mission console.
const railTypes=new Set(['plan','lead','decision','tool_call','draft','done','error','steer']);
const hhmm=at=>new Date(at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',hour12:false});
// Rail lines are a short label plus the brand or address; clicking one opens the full step.
function brief(e){
 const t=tidy(e.title),tool=String(e.tool||''),m=re=>(t.match(re)||[])[1]||'';
 if(e.type==='lead')return ['New lead found',m(/^New lead: (.+?)(?:, | \()/)];
 if(e.type==='draft')return [/^Draft ready in Gmail/.test(t)?'Draft ready in Gmail':'Draft saved',m(/for (\S+@[^\s]+?)\.? Not sent/)];
 if(e.type==='done')return ['Mission finished',m(/^Finished: (\d+ draft)/)?`${m(/^Finished: (\d+) draft/)} drafts`:''];
 if(e.type==='error')return ['Something failed',''];
 if(e.type==='plan')return ['Plan ready',''];
 if(e.type==='steer')return ['Steer noted',''];
 if(e.type==='decision')return /^Pursuing/.test(t)?['Good fit',m(/^Pursuing ([^:]+)/)]:/^Skipped/.test(t)?['Skipped',m(/^Skipped ([^:]+)/)]:[t.split(':')[0].slice(0,40),''];
 if(tool.startsWith('claude.plan'))return ['Planning the search',''];
 if(tool.startsWith('exa'))return ['Searching Exa',''];
 if(tool.startsWith('solari')||tool==='fetch')return ['Visiting site',host(m(/^Visiting (\S+)/))];
 if(tool.startsWith('claude.score'))return ['Checking fit',m(/^Grading fit for ([^,]+)/)];
 if(tool.startsWith('claude.draft'))return ['Writing email',m(/^Writing email to (\S+)/)];
 if(tool.startsWith('gmail'))return ['Saving to Gmail',''];
 return [t.split(':')[0].slice(0,40),''];
}
function liveItem(e,fresh){const [head,subj]=brief(e);return `<div class="li k-${esc(e.type)}${fresh?' fresh':''}${isNow(e)?' now':''}" data-ev="${e.id}">${icon(e.tool)}<div style="min-width:0"><div class="msg">${esc(head)}</div><div class="sub">${subj?`${esc(subj)} · `:''}${hhmm(e.at)}</div><div class="more" hidden></div></div></div>`;}
function renderLive(){const shown=state.live.filter(e=>railTypes.has(e.type));$('#livefeed').innerHTML=shown.length?shown.map(e=>liveItem(e)).join(''):'<div class="empty">Every step the agent takes shows up here.</div>';}
const noteDraft=e=>{if(e.type==='draft'&&e.lead_id&&e.data?.gmailUrl)state.gmail.set(e.lead_id,e.data.gmailUrl);};
async function loadLive(){const {events}=await api('/api/events');state.live=events.slice().reverse();for(const e of events){if(e.task_id)state.lastStep.set(e.task_id,e);noteDraft(e);}renderLive();}
$('#livefeed').addEventListener('click',e=>{
 const go=e.target.closest('[data-open]');if(go){e.stopPropagation();if(go.dataset.open==='lead')openLead(Number(go.dataset.id));else location.hash=`#/tasks/${go.dataset.id}`;return;}
 const li=e.target.closest('.li');if(!li)return;const ev=state.live.find(x=>x.id===Number(li.dataset.ev));if(!ev)return;
 const more=li.querySelector('.more'),open=li.classList.toggle('open');more.hidden=!open;
 if(open)more.innerHTML=`<p>${esc(tidy(ev.title))}</p>${ev.detail?`<p class="faint">${esc(tidy(ev.detail))}</p>`:''}<div class="acts">${ev.lead_id?`<button type="button" class="btn sm" data-open="lead" data-id="${ev.lead_id}">Open brand</button>`:''}${ev.task_id?`<button type="button" class="btn sm" data-open="task" data-id="${ev.task_id}">Open mission</button>`:''}</div>`;
});

const video=r=>r.local_file?`<video src="/renders/${esc(r.local_file)}" controls playsinline preload="metadata"></video>`:r.result_url?`<video src="${esc(r.result_url)}" controls playsinline preload="metadata"></video>`:'';
function reviewCard(r){return `<div class="review" data-review="${r.id}">${video(r)}<div class="rbody"><div class="eyebrow" style="margin-bottom:6px">Scene ready for review</div><div style="font-weight:600">${esc(r.title)}</div><div class="faint" style="font-size:11.5px;margin:2px 0 8px">${esc(r.group_name||'Single shot')} · ${r.input.duration}s · ${esc(r.input.resolution)}${r.estimate_usd?` · about $${esc(r.estimate_usd)}`:''}</div><input type="text" data-note="${r.id}" placeholder="If rejecting, say what to fix"><div style="display:flex;gap:6px;margin-top:8px"><button class="btn sm go" data-decide="approved" data-id="${r.id}">Approve scene</button><button class="btn sm stop" data-decide="rejected" data-id="${r.id}">Reject</button></div></div></div>`;}
function bindReviews(after){document.querySelectorAll('[data-decide]').forEach(b=>b.onclick=async()=>{const id=b.dataset.id;const note=document.querySelector(`[data-note="${id}"]`)?.value||'';try{await api(`/api/renders/${id}/review`,{decision:b.dataset.decide,note});b.dataset.decide==='approved'?toast('Scene approved','ok'):toast('Scene rejected','bad','Use Revise to queue a fixed version.');document.querySelector(`#pop-${id}`)?.remove();after?.();}catch(err){toast(err.message,'bad');}});}
const popped=new Set();
function popReview(r){if(popped.has(r.id))return;popped.add(r.id);const el=document.createElement('div');el.className='popup';el.id=`pop-${r.id}`;el.innerHTML=`<button class="x" title="Dismiss">×</button>${reviewCard(r)}`;document.body.append(el);el.querySelector('.x').onclick=()=>el.remove();bindReviews(()=>route());}

function startMission(form){form.addEventListener('submit',async e=>{e.preventDefault();const f=e.target,b=f.querySelector('button[type=submit]');if(!f.message.value.trim())return;b.disabled=true;try{const {task}=await api('/api/chat',{message:f.message.value});f.reset();toast('Mission started','ok',`Task ${task.id}`);location.hash=`#/tasks/${task.id}`;}catch(err){toast(err.message,'bad');}finally{b.disabled=false;}});form.message?.addEventListener('keydown',e=>{if(e.key==='Enter'&&(e.metaKey||e.ctrlKey))form.requestSubmit();});}

// Mission as a Cyber 5.0 task group card: gradient face with live step, count and controls, tallies underneath.
const isLive=t=>['running','queued','paused'].includes(t.status);
function groupCard(t,sel){
 const step=state.lastStep.get(t.id),live=isLive(t);
 return `<div class="gcard${sel?' on':''}${live?'':' done'}${t.status==='running'?' live-on':''}" data-go="#/tasks/${t.id}" data-gcard="${t.id}">
  <div class="gface"><div class="gtop"><div class="gname">${esc(t.prompt)}</div>${pill(ts(t.status))}</div>
   <div class="gstep"><span>${step?esc(brief(step)[0]+(brief(step)[1]?`: ${brief(step)[1]}`:'')):live?'Waiting to start':esc(t.summary||'Finished')}</span></div>
   <div class="gbot"><span></span><span class="gact">${t.status==='running'?`<button data-gact="pause" data-id="${t.id}" title="Pause">${svg('pause')}</button>`:t.status==='paused'?`<button data-gact="resume" data-id="${t.id}" title="Resume">${svg('play')}</button>`:''}${live?`<button data-gact="stop" data-id="${t.id}" title="Stop">${svg('stop')}</button>`:''}</span></div></div>
  <div class="gstats"><span class="${t.drafts?'s-ok':'zero'}" title="Drafts ready">${svg('ok')}${t.drafts}</span><span class="${t.working?'s-run':'zero'}" title="Working now">${svg('run')}${t.working||0}</span><span class="${t.failed?'s-bad':'zero'}" title="Failed">${svg('bad')}${t.failed||0}</span><span class="faint" style="margin-left:auto" title="What this mission cost">Cost <b class="mono">${money(t.cost_usd)}</b></span></div>
 </div>`;
}
function bindGroups(){document.querySelectorAll('[data-gact]').forEach(b=>b.onclick=async e=>{e.stopPropagation();const id=Number(b.dataset.id),a=b.dataset.gact;b.disabled=true;try{if(a==='clone'){const t=state.tasks.find(x=>x.id===id);const {task}=await api('/api/chat',{message:t.prompt});toast('Mission started','ok',`Task ${task.id}, same request as task ${id}`);location.hash=`#/tasks/${task.id}`;}else{await api(`/api/tasks/${id}/control`,{action:a});toast(`${a[0].toUpperCase()}${a.slice(1)} sent`,'info',`Task ${id}`);}}catch(err){toast(err.message,'bad');b.disabled=false;}});}

// Home stats from Cyber 5.0: metric tabs, Today / Week / Month / Year, big number over a line chart.
const metricTabs={drafts:'Drafts',leads:'Brands found',spend:'Spend'};
const rangeLabel={today:'today',week:'in the last 7 days',month:'in the last 30 days',year:'in the last 12 months'};
function chart(values,labels,isMoney){
 const W=600,H=120,n=values.length,max=Math.max(...values,isMoney?0.01:1);
 const x=i=>n===1?W/2:6+i*(W-12)/(n-1),y=v=>H-4-(v/max)*(H-14);
 const line=`M${values.map((v,i)=>`${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' L')}`;
 const fmt=v=>isMoney?`$${v.toFixed(4)}`:v;
 return `<div class="chart"><span class="ymax">${fmt(max===0.01&&isMoney?0:max)}</span><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><path class="grid" d="M0,${y(max).toFixed(1)} H${W} M0,${y(max/2).toFixed(1)} H${W} M0,${y(0).toFixed(1)} H${W}" vector-effect="non-scaling-stroke"/><defs><linearGradient id="cg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--green);stop-opacity:.32"/><stop offset="1" style="stop-color:var(--green);stop-opacity:0"/></linearGradient></defs><path d="${line} L${W},${H} L0,${H} Z" fill="url(#cg)"/><path class="ln" d="${line}" vector-effect="non-scaling-stroke"/>${values.map((v,i)=>`<rect x="${Math.max(0,x(i)-W/n/2).toFixed(1)}" y="0" width="${(W/n).toFixed(1)}" height="${H}" fill="transparent"><title>${esc(labels[i])}: ${fmt(v)}</title></rect>`).join('')}</svg><div class="axis"><span>${esc(labels[0])}</span><span>${esc(labels[Math.floor(n/2)])}</span><span>${esc(labels[n-1])}</span></div></div>`;
}
function statsPanel(m){
 const k=pref.get('metric','drafts'),tot=m.totals;
 return `<div class="stats-head"><span class="faint">${tot.missions} mission${tot.missions===1?'':'s'} ${rangeLabel[m.range]}</span><div class="seg">${Object.keys(rangeLabel).map(r=>`<button type="button" data-range="${r}" class="${r===m.range?'on':''}">${r[0].toUpperCase()}${r.slice(1)}</button>`).join('')}</div></div>
  <div class="tiles">${Object.entries(metricTabs).map(([key,l])=>`<button type="button" data-metric="${key}" class="tile${key===k?' on':''}"><span>${l}</span><b>${key==='spend'?`$${tot.spend.toFixed(2)}`:tot[key]}</b></button>`).join('')}</div>
  <div class="faint" style="font-size:11.5px;margin:0 0 6px">${metricTabs[k]} per ${m.range==='today'?'hour':m.range==='year'?'month':'day'}</div>
  ${chart(m.series.map(b=>b[k]),m.series.map(b=>b.label),k==='spend')}`;
}
async function loadStats(){
 const box=$('#stats');if(!box)return;
 box.innerHTML=statsPanel(await api(`/api/metrics?range=${pref.get('range','week')}`));
 box.querySelectorAll('[data-metric]').forEach(b=>b.onclick=()=>{pref.set('metric',b.dataset.metric);loadStats().catch(()=>{});});
 box.querySelectorAll('[data-range]').forEach(b=>b.onclick=()=>{pref.set('range',b.dataset.range);loadStats().catch(()=>{});});
}

// Chat box: one composer with attachments, tools, a model picker, dictation and voice, like a chat app.
const composerTools={
 mission:{label:'Find brands',icon:'search',desc:'Exa finds brands, Solari reads their sites, Claude writes Gmail drafts',ph:'Ask Mint to find brands, e.g. 8 streetwear labels in Brooklyn that sell online'},
 storyboard:{label:'Storyboard',icon:'clapperboard',desc:'Sonnet drafts a shot list and the checkers grade it',ph:'Describe the video, e.g. a gamer reacts to our tee selling out, 15 seconds'},
 shot:{label:'Plan a shot',icon:'video',desc:'Adds one shot to Renders. Nothing renders until you approve the price',ph:'Describe one shot: character, action, camera and dialogue'},
 whop:{label:'Whop autopilot',icon:'shopping-bag',desc:'Starts work when someone buys on Whop',needs:'whop'}
};
const modelInfo={'claude-sonnet-5-5':['Sonnet 5.5','Best for planning and writing'],'claude-haiku-5-5':['Haiku 5.5','Fastest and cheapest']};
const comp={tool:'mission',files:[],links:[],busy:false,speakTask:null};
let listening=null,heard='';
const currentModel=()=>{const m=pref.get('model',state.config?.models?.main);return modelInfo[m]?m:'claude-sonnet-5-5';};
const toolOff=x=>x.needs&&!state.config?.integrations?.find(i=>i.id===x.needs)?.on;
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
   <div class="cwrap"><button type="button" class="cbtn" id="cplus" data-tip="Add files and tools" aria-label="Add files and tools" aria-expanded="false">${ic('plus')}</button>
    <div class="cmenu" id="cplusmenu" hidden>
     <button type="button" data-cact="file">${ic('paperclip')}<span><b>Add photos and files</b><i>Images, PDFs, text or CSV, up to 5 MB each</i></span></button>
     <button type="button" data-cact="link">${ic('link')}<span><b>Add a link</b><i>A brand site or a reference page</i></span></button>
     <div class="csep">Tools</div>
     ${Object.entries(composerTools).map(([k,x])=>`<button type="button" data-ctool="${k}" ${toolOff(x)?'disabled':''} class="${k===comp.tool?'on':''}">${ic(x.icon)}<span><b>${x.label}</b><i>${toolOff(x)?'Add WHOP_API_KEY to turn this on':x.desc}</i></span>${k===comp.tool?ic('check'):''}</button>`).join('')}
    </div></div>
   ${comp.tool!=='mission'?`<span class="ctool">${ic(t.icon)}${t.label}<button type="button" id="ctoolx" aria-label="Back to Find brands" data-tip="Back to Find brands">${ic('x')}</button></span>`:''}
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
 f.querySelectorAll('[data-ctool]').forEach(b=>b.onclick=()=>{comp.tool=b.dataset.ctool;rerenderComposer();});
 $('#ctoolx')?.addEventListener('click',()=>{comp.tool='mission';rerenderComposer();});
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
function rerenderComposer(){const ta=$('#composer textarea'),text=ta?.value||'';$('#composer').outerHTML=composerHTML();$('#composer textarea').value=text;bindComposer();$('#composer textarea').focus();}
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
   thread.messages.push({role:'user',text});thread.thinking=true;done();paintThread();
   try{const r=await api('/api/assistant',{message:text,model});thread.messages.push({role:'assistant',text:r.reply,actions:r.actions});if(spoken)voice.speak(r.reply);}
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
const actionLabel=a=>({start_mission:'Started a mission',steer_mission:'Steered a mission',control_mission:`Mission ${a.input?.action||'updated'}`,get_overview:'Checked the overview',get_mission:'Read a mission',find_leads:'Looked up brands',get_lead:'Read a brand'})[a.tool]||a.tool;
function threadHTML(){
 return thread.messages.map(m=>m.role==='user'?`<div class="msg-u">${esc(m.text)}</div>`:`<div class="msg-a"><img src="/logo.png" alt=""><div><div class="txt">${esc(m.text)}</div>${(m.actions||[]).filter(a=>!a.tool.startsWith('get_')&&a.tool!=='find_leads').map(a=>`<span class="chip">${esc(actionLabel(a))}</span>`).join('')}</div></div>`).join('')+(thread.thinking?'<div class="msg-a"><img src="/logo.png" alt=""><div class="thinking"><i></i><i></i><i></i></div></div>':'');
}
function paintThread(){const t=$('#thread');if(!t)return;t.innerHTML=threadHTML();t.hidden=!thread.messages.length&&!thread.thinking;$('.home')?.classList.toggle('chatting',!t.hidden);t.lastElementChild?.scrollIntoView({block:'end'});}
async function loadThread(){try{const r=await api('/api/assistant');thread.messages=r.messages||[];thread.ok=true;}catch{thread.ok=false;}paintThread();}
async function home(){
 const {renders}=await api('/api/renders');
 const pending=renders.filter(r=>r.review==='pending'),live=state.tasks.filter(isLive);
 $('#view').innerHTML=`<div class="home${live.length||pending.length?'':' empty'}"><div id="thread" class="thread" hidden></div><div class="home-center"><h2 class="greet">What should Mint work on?</h2>${composerHTML()}<div class="suggest">${suggestions.map((x,i)=>`<button type="button" data-suggest="${i}">${ic(composerTools[x[0]]?.icon||'search')}${esc(x[1])}</button>`).join('')}</div></div>
  ${pending.length?`<div class="section-title">Scenes awaiting your review <span class="badge">${pending.length}</span></div><div class="reviews">${pending.map(reviewCard).join('')}</div>`:''}
  ${live.length?`<div class="section-title">Running now <span class="count">${live.length}</span></div><div class="groups wrap">${live.map(t=>groupCard(t)).join('')}</div>`:''}
 </div>`;
 bindComposer();bindGo();bindGroups();bindReviews(()=>route());paintThread();loadThread();
 document.querySelectorAll('[data-suggest]').forEach(b=>b.onclick=()=>{const [tool,text]=suggestions[Number(b.dataset.suggest)];comp.tool=tool;rerenderComposer();const ta=$('#composer textarea');ta.value=text;syncComposer();ta.focus();ta.setSelectionRange(text.length,text.length);});
}
const suggestions=[['mission','Find 8 streetwear brands in Brooklyn that sell online'],['mission','Find skincare brands in LA with fewer than 50k followers'],['storyboard','A 15 second video of a gamer reacting to our tee selling out'],['mission','Find coffee roasters in NYC that ship nationwide']];
function bindGo(){document.querySelectorAll('[data-go]').forEach(el=>{el.onclick=()=>{location.hash=el.classList.contains('gcard')&&el.classList.contains('on')?'#/tasks':el.dataset.go;};});document.querySelectorAll('[data-lead]:not(.li)').forEach(el=>{el.onclick=()=>openLead(Number(el.dataset.lead));});}

async function tasks(id){
 const m=id?await api(`/api/tasks/${id}`):null;state.mission=m;
 if(m)m.events.forEach(noteDraft);
 const ap=await api('/api/autopilot').catch(()=>null);
 $('#view').innerHTML=`<div class="groups-head"><h2>Task groups <span class="count">${state.tasks.length}</span></h2>${ap?`<label class="switch" data-tip="${ap.enabled?`On: starts the next batch when one finishes, up to $${Number(ap.dailyBudgetUsd).toFixed(2)} a day`:'Off: Mint waits for you to start missions'}"><input type="checkbox" id="apswitch" ${ap.enabled?'checked':''}><i></i><span>Always on</span></label>`:''}<form class="newmission" id="newmission"><input type="text" name="message" placeholder="New mission, e.g. find 8 streetwear brands in Brooklyn" required autocomplete="off"><button class="btn go" type="submit">Start</button></form></div>
  ${state.tasks.length?`<div class="groups">${state.tasks.map(t=>groupCard(t,t.id===id)).join('')}</div>`:'<div class="idle">No missions yet. Start one above.</div>'}
  ${m?missionView(m):''}
  <div class="section-title">Activity</div><div class="stats" id="stats"></div>`;
 startMission($('#newmission'));bindGo();bindGroups();if(m)bindMission(m);loadStats().catch(()=>{});
 $('.groups')?.addEventListener('click',e=>{if(!e.target.closest('.gcard')&&m)location.hash='#/tasks';});
 $('#apswitch')?.addEventListener('change',async e=>{try{const r=await api('/api/autopilot',{enabled:e.target.checked});toast(r.enabled?'Always on':'Always on is off','ok',r.enabled?`Mint keeps finding brands, up to $${Number(r.dailyBudgetUsd).toFixed(2)} a day. Renders still wait for you.`:'Mint waits for you to start missions.');tasks(id);}catch(err){e.target.checked=!e.target.checked;toast(err.message,'bad');}});
}
function planLine(p){return p?`<span>Category: ${esc(p.markets.join(', '))}</span><span>Location: ${esc(p.territories.join(', '))}</span><span>Up to ${p.maxDrafts} drafts</span>`:'<span>Planning</span>';}
// Cyber 5.0 counter chips: colored icon block plus a count.
function counterChips(leads){
 const c={ok:0,run:0,wait:0,bad:0};for(const l of leads){const k=ls(l.status)[1].slice(2);if(k in c)c[k]++;}
 return [['ok','Drafts ready'],['run','Working now'],['wait','Queued'],['bad','Failed']].map(([k,l])=>`<span class="cchip c-${k}${c[k]?'':' zero'}" data-tip="${l}"><i>${svg(k)}</i><b>${c[k]}</b></span>`).join('');
}
function missionView(m){
 const t=m.task,live=m.running;
 return `<div class="card mission"><div class="head"><div style="min-width:0;flex:1 1 360px"><div class="meta" style="margin-bottom:5px">${pill(ts(t.status))}<span class="mono">Task ${t.id}</span><span class="mono">${money(t.cost_usd)}</span>${planLine(t.plan)}</div><h2 style="font-weight:500">${esc(t.prompt)}</h2>${t.plan?.qualify?`<div class="faint" style="margin-top:4px">Good fit: ${esc(t.plan.qualify)}</div>`:''}</div><div class="right"><div class="cchips" id="cchips">${counterChips(m.leads)}</div>
  ${live?`${t.status==='paused'?'<button class="btn sm" data-act="resume">Resume</button>':'<button class="btn sm warn" data-act="pause">Pause</button>'}<button class="btn sm stop" data-act="stop">Stop</button>`:''}</div></div>
  <div class="trows" id="leadgrid"><div class="trow th"><span>Brand</span><span>Where</span><span>Contact</span><span>Status</span><span>Actions</span></div>${m.leads.map(leadRow).join('')||'<div class="empty">Each brand the agent finds gets its own row here.</div>'}</div>
  <form class="steer" id="steer"><input type="text" name="message" placeholder="Steer this mission: skip anyone outside NYC, focus on women's activewear, max 3, stop" autocomplete="off"><button class="btn" type="submit">Steer</button></form>
  <div class="console" id="console">${m.events.map(consoleRow).join('')}</div>
 </div>`;
}
// The contact column already says when there is no email, so only explain skips it cannot.
const skipWhy=l=>l.status==='skipped'&&l.contact_email?(l.risks[0]||'Not a fit for this mission'):l.status==='unreachable'?'The site would not load':'';
function leadRow(l){const g=state.gmail.get(l.id),why=skipWhy(l);return `<div class="trow${state.selectedLead===l.id?' sel':''}" data-id="${l.id}" data-status="${esc(l.status)}"><div class="tbrand">${brandThumb(l)}<div style="min-width:0"><b>${esc(l.company||l.domain)}</b><span>${esc(l.domain)}${socialLinks(l)}</span></div></div><div class="where">${esc(l.territory||'')}<span>${esc(l.market||'')}</span></div><div class="mono mail">${esc(l.contact_email||(l.status==='found'?'Not checked yet':'No public email'))}</div><div style="min-width:0" title="${esc(why)}">${sbadge(ls(l.status))}${why?`<div class="why">${esc(why)}</div>`:''}</div><div class="tact"><button type="button" title="Details">${svg('eye')}</button>${g?`<a class="gmailicon" href="${esc(g)}" target="_blank" rel="noopener" data-tip="Open in Gmail" aria-label="Open in Gmail"><img src="/logos/gmail.png" alt=""></a>`:`<button type="button" disabled title="No draft for this brand">${svg('mail')}</button>`}<a href="${esc(l.url||`https://${l.domain}`)}" target="_blank" rel="noopener" title="Open the website">${svg('open')}</a></div></div>`;}
function consoleRow(e){const open=state.openEvents.has(e.id);const extra=e.detail||e.data;return `<div class="row k-${esc(e.type)}" data-ev="${e.id}"><span class="t">${time(e.at)}</span><span class="tool" title="${esc(e.tool||e.type)}">${esc(e.tool||e.type)}</span><span class="msg">${esc(tidy(e.title))}${extra?' <span class="faint">[+]</span>':''}</span>${open&&extra?`<pre>${esc([e.detail,e.data?JSON.stringify(e.data,null,1):''].filter(Boolean).join('\n\n'))}</pre>`:''}</div>`;}
function bindMission(m){
 const id=m.task.id;
 document.querySelectorAll('[data-act]').forEach(b=>b.addEventListener('click',async()=>{try{await api(`/api/tasks/${id}/control`,{action:b.dataset.act});}catch(err){toast(err.message,'bad');}}));
 $('#steer').addEventListener('submit',async e=>{e.preventDefault();const f=e.target;if(!f.message.value.trim())return;try{const s=await api(`/api/tasks/${id}/steer`,{message:f.message.value});f.reset();toast(s.live?'Steer queued':'Steer saved','ok',s.live?'It applies before the next step.':'This mission is not running.');}catch(err){toast(err.message,'bad');}});
 bindLeadCards();bindConsole();const c=$('#console');c.scrollTop=c.scrollHeight;
}
function bindLeadCards(){document.querySelectorAll('.trows .trow[data-id]').forEach(r=>{r.onclick=e=>{if(!e.target.closest('a'))openLead(Number(r.dataset.id));};});}
function bindConsole(){$('#console')?.addEventListener('click',e=>{const row=e.target.closest('[data-ev]');if(!row)return;const id=Number(row.dataset.ev);state.openEvents.has(id)?state.openEvents.delete(id):state.openEvents.add(id);const ev=state.mission.events.find(x=>x.id===id);if(ev)row.outerHTML=consoleRow(ev);});}

const clip=(t,n=96)=>{t=String(t||'');return t.length>n?t.slice(0,t.lastIndexOf(' ',n-1)>40?t.lastIndexOf(' ',n-1):n)+'...':t;};
async function openLead(id){
 state.selectedLead=id;
 const {lead:l,events,drafts,renders=[]}=await api(`/api/leads/${id}`);
 const d=$('#drawer');d.hidden=false;
 const mail=drafts[0],gmail=drafts.find(x=>x.gmail_url)?.gmail_url,vid=renders.find(r=>r.review==='approved')||renders[0];
 const vstate=vid?(vid.review?reviewStatus[vid.review]:(renderStatus[vid.status]||[vid.status,'s-idle'])):null;
 d.innerHTML=`<div class="head">${brandThumb(l,'lg')}<div style="min-width:0;flex:1"><h2>${esc(l.company||l.domain)}</h2><a class="faint" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.domain)}</a></div>${gmail?gmailBtn(gmail):''}<button class="iconbtn" id="close" data-tip="Close" aria-label="Close">${ic('x')}</button></div>
 <section><div class="chips">${pill(ls(l.status))}${[l.market,l.territory,`Task ${l.task_id}`].filter(Boolean).map(c=>`<span class="chip">${esc(c)}</span>`).join('')}</div>
  ${l.status==='rejected'&&l.notes?`<div class="hint">Not a fit: ${esc(l.notes)}</div>`:''}${l.reasons.length?`<ul class="why">${l.reasons.slice(0,3).map(r=>`<li>${esc(clip(r))}</li>`).join('')}</ul>`:''}</section>
 <section><h3>Links</h3><div class="chips"><a class="chip" href="${esc(l.url||`https://${l.domain}`)}" target="_blank" rel="noopener">${ic('link')}Website</a>${socialLinks(l,true)||'<span class="faint">No social profiles found</span>'}</div></section>
 <section><h3>Contact</h3><div class="chips"><span class="chip mono">${esc(l.contact_email||'No public email')}</span>${l.contact_source?`<a class="chip" href="${esc(l.contact_source)}" target="_blank" rel="noopener">Found on ${esc(host(l.contact_source))}</a>`:''}</div></section>
 <section><h3>UGC video</h3>${vid?`${video(vid)}<div class="chips" style="margin-top:8px">${sbadge(vstate)}${vid.estimate_usd&&vid.status==='checks_passed'?`<span class="chip">about $${esc(vid.estimate_usd)}</span>`:''}<a class="chip" href="#/renders">Open in Renders</a></div>`:`<div class="hint" style="margin:0 0 8px">No video yet. Outreach is ready only once a video made for this brand is attached.</div><button class="btn sm go" id="makevideo">Make a video concept</button>`}</section>
 ${mail?`<section><h3>Email</h3><div class="mailcard"><b>${esc(mail.subject)}</b><span class="faint">To ${esc(mail.to_email)}</span><div id="mailbody" hidden>${esc(mail.body)}</div><button type="button" class="linkbtn" id="showmail">View email</button></div></section>`:''}
 ${l.screenshot?`<section><h3>Homepage</h3><img class="shot" src="/shots/${esc(l.screenshot)}" alt="Homepage captured by Solari"></section>`:''}
 <section><details><summary>Activity, ${events.length} steps</summary><div class="console" style="height:auto;max-height:320px;border:0;padding:6px 0 0">${events.map(consoleRow).join('')}</div></details></section>`;
 $('#close').onclick=()=>{d.hidden=true;state.selectedLead=null;};
 $('#showmail')?.addEventListener('click',e=>{const b=$('#mailbody');b.hidden=!b.hidden;e.target.textContent=b.hidden?'View email':'Hide email';});
 $('#makevideo')?.addEventListener('click',async e=>{e.target.disabled=true;e.target.textContent='Writing the concept';try{await api(`/api/leads/${id}/video`,{});toast('Video concept started','ok','It shows up in Renders with a price for you to approve.');openLead(id);}catch(err){toast(err.message,'bad');e.target.disabled=false;e.target.textContent='Make a video concept';}});
}
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#drawer').hidden){$('#drawer').hidden=true;state.selectedLead=null;}});

async function leads(){
 const [{leads},{drafts}]=await Promise.all([api('/api/leads'),api('/api/drafts')]);
 for(const d of drafts)if(d.gmail_url)state.gmail.set(d.lead_id,d.gmail_url);
 const shown=leads.filter(l=>l.status!=='rejected'),hidden=leads.length-shown.length;
 $('#view').innerHTML=`<div class="pagebar"><div class="cchips">${counterChips(shown)}</div><button class="btn sm" id="requalify" type="button" data-tip="Drop brands with no Instagram, TikTok or logo, and grade the rest">${ic('check')}Re-check brands</button><select id="filter" aria-label="Filter by status"><option value="">All brands</option>${hidden?`<option value="rejected">Not a fit (${hidden})</option>`:''}${[...new Set(shown.map(l=>l.status))].map(s=>`<option value="${s}">${esc(ls(s)[0])}</option>`).join('')}</select></div>
  <div class="trows bare" id="crm"><div class="trow th"><span>Brand</span><span>Where</span><span>Contact</span><span>Status</span><span>Actions</span></div>${leads.map(leadRow).join('')||'<div class="idle">No brands yet. Start a mission from Home.</div>'}</div>`;
 const applyLeadFilter=v=>document.querySelectorAll('#crm .trow[data-status]').forEach(r=>{r.hidden=v?r.dataset.status!==v:r.dataset.status==='rejected';});
 $('#filter').onchange=e=>applyLeadFilter(e.target.value);applyLeadFilter('');
 $('#requalify').onclick=async e=>{const b=e.currentTarget;b.disabled=true;b.lastChild.textContent='Checking brands';try{const r=await api('/api/leads/requalify',{});toast(`Checked ${r.checked} brands`,'ok',`${r.rejected.length} not a fit${r.withdrawnDrafts?.length?`. ${r.withdrawnDrafts.length} Gmail draft${r.withdrawnDrafts.length===1?'':'s'} to delete yourself`:''}`);leads();}catch(err){toast(err.message,'bad');b.disabled=false;b.lastChild.textContent='Re-check brands';}};
 bindLeadCards();
}

async function drafts(){
 const [{drafts:all},{leads:ll}]=await Promise.all([api('/api/drafts'),api('/api/leads')]);
 const out=new Set(ll.filter(l=>l.status==='rejected').map(l=>l.id)),drafts=all.filter(d=>!out.has(d.lead_id));
 const st=d=>d.status==='sent'?['Sent','s-ok']:d.status==='waiting_video'?['Waiting for video','s-you']:d.gmail_url?['In Gmail, not sent','s-you']:['Saved in CRM only','s-wait'];
 $('#view').innerHTML=`<div class="dcards">${drafts.map(d=>`<div class="dcard" data-lead="${d.lead_id}">${brandThumb({id:d.lead_id,company:d.company,domain:d.domain},'md')}<div style="min-width:0"><b class="subj">${esc(d.company||d.domain||d.to_email)}</b><div class="to">${esc(d.to_email)} · ${ago(d.created_at)}</div></div><div class="dside">${sbadge(st(d))}<button type="button" class="btn sm" data-view="${d.lead_id}">View email</button>${d.gmail_url&&d.status!=='sent'?gmailBtn(d.gmail_url):''}</div></div>`).join('')||'<div class="idle">No drafts yet. Each mission saves its emails here and in Gmail.</div>'}</div>`;
 bindGo();
 document.querySelectorAll('[data-view]').forEach(b=>b.onclick=async e=>{e.stopPropagation();await openLead(Number(b.dataset.view));const m=$('#mailbody');if(m){m.hidden=false;$('#showmail').textContent='Hide email';m.scrollIntoView({block:'center'});}});
}

const renderStatus={draft:['Needs checks','s-wait'],checking:['Checking','s-run'],checks_failed:['Checks failed','s-bad'],checks_passed:['Awaiting spend approval','s-you'],submitting:['Submitting once','s-run'],submission_unknown:['Outcome uncertain: reconcile before retry','s-bad'],queued:['Queued','s-run'],in_progress:['Rendering','s-run'],completed:['Rendered','s-ok'],failed:['Failed','s-bad'],nsfw:['Blocked','s-bad'],canceled:['Canceled','s-idle']};
const reviewStatus={pending:['Awaiting your review','s-you'],approved:['Approved','s-ok'],rejected:['Rejected','s-bad']};
const renderGroup=r=>r.stale||r.status==='submission_unknown'?'fix':r.review==='pending'||r.status==='checks_passed'?'you':['queued','in_progress','submitting','checking'].includes(r.status)?'work':['checks_failed','failed','nsfw','submission_unknown','draft'].includes(r.status)||r.review==='rejected'?'fix':'done';
async function renders(){
 const {renders:list,enabled}=await api('/api/renders');
 const checksBox=c=>{const low=Math.min(...c.results.map(x=>x.score)),bad=c.results.filter(x=>x.score<85).length;return `<details class="cbox"><summary>${c.passed?`All ${c.results.length} checkers passed`:`${bad} of ${c.results.length} checkers below 85`} <span class="mono faint">lowest ${low}</span></summary>${c.results.map(x=>`<div style="margin:8px 0"><b>${esc(x.name)}</b> <span class="mono ${x.score>=85?'s-ok':'s-bad'}">${x.score}</span><div class="muted" style="font-size:11.5px">${esc(x.summary)}</div>${x.issues.map(i=>`<div style="font-size:11.5px" class="${i.severity==='minor'?'faint':'s-bad'}">${esc(i.severity)}: ${esc(i.evidence)}. Fix: ${esc(i.fix)}</div>`).join('')}</div>`).join('')}</details>`;};
 const row=r=>{const stuck=r.status==='submission_unknown'||r.stale;const st=r.review?reviewStatus[r.review]:r.stale?['Interrupted: reconcile before retry','s-bad']:(renderStatus[r.status]||[r.status,'s-idle']);const acts=[
  ['draft','checks_failed','checks_passed'].includes(r.status)?`<button class="btn sm" data-check="${r.id}">${r.checks?'Rerun checks':'Run checks'}</button>`:'',
  r.status==='checks_passed'&&r.estimate_usd?`<button class="btn sm go" data-approve="${r.id}" data-est="${esc(r.estimate_usd)}">Approve $${esc(r.estimate_usd)}</button>`:'',
  r.status==='queued'?`<button class="btn sm stop" data-cancel="${r.id}">Cancel</button>`:'',
  r.review==='pending'?`<button class="btn sm go" data-decide="approved" data-id="${r.id}">Approve scene</button><button class="btn sm stop" data-decide="rejected" data-id="${r.id}">Reject</button>`:'',
  r.review==='rejected'||r.status==='checks_failed'?`<button class="btn sm go" data-revise="${r.id}">Revise</button>`:''].join('');
  const next=stuck?'Find this shot in Higgsfield before anything else. If it is there, paste its request ID. If Higgsfield has no job for it, mark it never started and approve it again.':r.status==='checks_failed'?'Revise applies the checker notes, then run checks again.':r.status==='draft'?'Run the checkers first. A price shows once they pass.':r.status==='checks_passed'?'Nothing renders until you approve this price.':'';
  return `<div class="rcard" data-state="${renderGroup(r)}"><div class="rprev">${video(r)||(r.lead_id?brandThumb({id:r.lead_id,company:r.title},'xl'):`<div class="ph">${ic('film')}</div>`)}</div><div class="rmain"><div class="rtitle"><b>${esc(r.title)}</b><span class="mono faint">#${r.id}</span><span style="margin-left:auto">${sbadge(st)}</span></div><div class="meta"><span>${esc(r.group_name||'Single shot')}</span><span>${r.input.duration}s</span><span>${esc(r.input.resolution)}</span>${r.estimate_usd?`<span class="mono">about $${esc(r.estimate_usd)}</span>`:''}</div><p class="rprompt">${esc(r.input.prompt)}</p>${r.review_note?`<div class="${r.review==='rejected'?'s-bad':'muted'}" style="font-size:11.5px">Review: ${esc(r.review_note)}</div>`:''}${r.error?`<div class="s-bad" style="font-size:11.5px">${esc(r.error)}</div>`:''}${r.checks?checksBox(r.checks):''}${next?`<div class="hint">${esc(next)}</div>`:''}<div class="ractions">${acts}</div>${stuck?`<form id="reconcile-${r.id}" data-reconcile="${r.id}" style="margin-top:10px"><div class="meta">${r.approved_at?`<span>Approved ${esc(new Date(r.approved_at).toLocaleString())}</span>`:''}<span class="mono">Key ${esc(r.submission_key||'none')}</span></div><input type="text" name="requestId" placeholder="Higgsfield request ID" autocomplete="off" style="margin-top:8px"><div class="ractions"><button class="btn sm go" type="submit">It went through</button><button class="btn sm" type="button" data-never="${r.id}">It never started</button></div></form>`:''}${r.review==='pending'?`<input type="text" data-note="${r.id}" placeholder="If rejecting, say what to fix" style="margin-top:8px">`:''}</div></div>`;};
 const groups=[['all','All'],['you','Needs you'],['work','Rendering'],['fix','Needs work'],['done','Done']],counts=Object.fromEntries(groups.map(([k])=>[k,k==='all'?list.length:list.filter(r=>renderGroup(r)===k).length]));
 const filter=pref.get('rfilter','all');
 $('#view').innerHTML=`<div class="pagebar"><div class="seg">${groups.map(([k,l])=>`<button type="button" data-rf="${k}" class="${k===filter?'on':''}">${l}${counts[k]?` <span class="n">${counts[k]}</span>`:''}</button>`).join('')}</div><button class="btn go sm" id="newshotbtn" type="button">${ic('plus')}New shot</button></div>
  <form class="card newshot" id="newshot" hidden><div class="body"><input type="text" name="title" placeholder="Shot title, e.g. Hook shot, rooftop" required aria-label="Title"><textarea name="prompt" rows="3" required placeholder="Describe one shot: character, action, camera and dialogue" aria-label="Prompt"></textarea><div class="row"><select name="duration" aria-label="Length"><option value="5">5 seconds</option><option value="8">8 seconds</option><option value="10">10 seconds</option></select><select name="resolution" aria-label="Resolution"><option>720p</option><option>480p</option><option>1080p</option></select><span class="faint" style="flex:1">${enabled?'Seedance 2.5 on Higgsfield. Checks run first, then you approve the price.':'Higgsfield is not connected.'}</span><button type="button" class="btn sm" id="newshotx">Cancel</button><button class="btn sm go" type="submit">Add shot</button></div></div></form>
  <div class="rcards">${list.map(row).join('')||'<div class="idle">No shots yet. Approve a storyboard, plan a shot from Home, or press New shot.</div>'}</div>`;
 const applyFilter=k=>{pref.set('rfilter',k);document.querySelectorAll('[data-rf]').forEach(b=>b.classList.toggle('on',b.dataset.rf===k));document.querySelectorAll('.rcard').forEach(c=>{c.hidden=k!=='all'&&c.dataset.state!==k;});};
 document.querySelectorAll('[data-rf]').forEach(b=>b.onclick=()=>applyFilter(b.dataset.rf));applyFilter(filter);
 $('#newshotbtn').onclick=()=>{$('#newshot').hidden=false;$('#newshot input').focus();};$('#newshotx').onclick=()=>{$('#newshot').hidden=true;};
 $('#newshot').onsubmit=async e=>{e.preventDefault();const f=e.target;try{await api('/api/renders',{title:f.title.value,prompt:f.prompt.value,duration:Number(f.duration.value),resolution:f.resolution.value});toast('Shot added','ok','Run checks on it next.');renders();}catch(err){toast(err.message,'bad');}};
 document.querySelectorAll('[data-check]').forEach(b=>b.onclick=async()=>{b.disabled=true;b.textContent='Checking';try{await api(`/api/renders/${b.dataset.check}/check`,{});}catch(err){toast(err.message,'bad');}renders();});
 document.querySelectorAll('[data-approve]').forEach(b=>b.onclick=async()=>{if(!confirm(`Spend about $${b.dataset.est} on Higgsfield for this shot?`))return;try{await api(`/api/renders/${b.dataset.approve}/approve`,{estimate:b.dataset.est});toast('Submitted to Higgsfield','ok','It pops up for review when done.');}catch(err){toast(err.message,'bad');}renders();});
 document.querySelectorAll('[data-cancel]').forEach(b=>b.onclick=async()=>{try{await api(`/api/renders/${b.dataset.cancel}/cancel`,{});}catch(err){toast(err.message,'bad');}renders();});
 document.querySelectorAll('[data-revise]').forEach(b=>b.onclick=async()=>{try{await api(`/api/renders/${b.dataset.revise}/revise`,{});toast('Revision queued','ok','Your notes are in the new draft. Run checks on it.');}catch(err){toast(err.message,'bad');}renders();});
 document.querySelectorAll('[data-reconcile]').forEach(f=>f.onsubmit=async e=>{e.preventDefault();const requestId=f.requestId.value.trim();if(!requestId)return toast('Paste the request ID from Higgsfield first.','bad');try{await api(`/api/renders/${f.dataset.reconcile}/reconcile`,{outcome:'submitted',requestId});toast('Render reconciled','ok','It is tracked like any other submitted shot.');}catch(err){toast(err.message,'bad');}renders();});
 document.querySelectorAll('[data-never]').forEach(b=>b.onclick=async()=>{if(!confirm('Only continue if Higgsfield has no job for this shot. Approving it again sends the same key.'))return;try{await api(`/api/renders/${b.dataset.never}/reconcile`,{outcome:'not_submitted'});toast('Marked as never started','ok','Approve it again when you are ready.');}catch(err){toast(err.message,'bad');}renders();});
 bindReviews(()=>renders());
}
const boardStatus={draft:['Needs checks','s-wait'],checking:['Checking','s-run'],checks_failed:['Checks failed','s-bad'],checks_passed:['Ready for your approval','s-you'],approved:['Approved, in Renders','s-ok']};
function checkList(checks){const low=Math.min(...checks.results.map(x=>x.score)),bad=checks.results.filter(x=>x.score<85).length;return `<details class="cbox"><summary>${checks.passed?`All ${checks.results.length} checkers passed`:`${bad} of ${checks.results.length} checkers below 85. Fix with checker notes below, then rerun.`} <span class="mono faint">lowest ${low} · $${checks.cost.toFixed(4)}</span></summary>${checks.results.map(x=>`<div style="margin:8px 0"><b>${esc(x.name)}</b> <span class="mono ${x.score>=85?'s-ok':'s-bad'}">${x.score}</span><div class="muted" style="font-size:11.5px">${esc(x.summary)}</div>${x.issues.map(i=>`<div style="font-size:11.5px" class="${i.severity==='minor'?'faint':'s-bad'}">${esc(i.severity)}: ${esc(i.evidence)} → ${esc(i.fix)}</div>`).join('')}</div>`).join('')}</details>`;}
function boardCard(s){
 const p=s.plan,st=boardStatus[s.status]||[s.status,'s-idle'];
 return `<div class="card"><div class="head" style="flex-wrap:wrap"><div style="min-width:0;flex:1 1 300px"><div class="meta" style="margin-bottom:6px">${sbadge(st)}<span class="mono">v${s.version}</span><span>${p.durationSeconds}s · ${p.shots.length} shots</span><span class="mono">${money(s.cost_usd)}</span><span>${ago(s.created_at)}</span></div><h2>${esc(s.title)}</h2></div><div class="right">${s.status!=='approved'?`<button class="btn sm" data-bcheck="${s.id}">Run checkers</button>`:''}${s.status==='checks_passed'?`<button class="btn sm go" data-bapprove="${s.id}">Approve storyboard</button>`:''}${s.status==='checks_failed'?`<button class="btn sm go" data-bquick="${s.id}">Fix with checker notes</button>`:''}${s.status==='approved'?`<a class="btn sm" href="#/renders">Open renders</a>`:''}</div></div>
 <div class="body">${s.checks?checkList(s.checks):''}<div class="locks">${[['Character',p.identity],['Wardrobe',p.wardrobe],['Environment',p.environment],['Voice',p.voice]].map(([k,v])=>`<div><span>${k}</span><p>${esc(v)}</p></div>`).join('')}</div>
 <div class="shots">${p.shots.map(x=>`<div class="shot"><div class="shot-h"><b class="mono">${esc(x.id)}</b><span class="chip mono">${x.start}s to ${x.start+x.duration}s</span></div><dl><dt>Camera</dt><dd>${esc(x.camera)}</dd><dt>Action</dt><dd>${esc(x.action)}</dd><dt>Dialogue</dt><dd>${x.dialogue?`"${esc(x.dialogue)}"`:'<span class="faint">Silent</span>'}</dd><dt>Audio</dt><dd class="muted">${esc(x.audio)}</dd></dl></div>`).join('')}</div>
  ${s.status!=='approved'?`<form class="steer" data-brevise="${s.id}" style="padding:12px 0 0;border:0"><input type="text" name="note" placeholder="Optional note for the revision, e.g. make the hook land in the first 2 seconds"><button class="btn" type="submit">Fix with checker notes</button></form>`:''}</div></div>`;
}
async function storyboards(){
 const {storyboards:list}=await api('/api/storyboards');
 const field=(n,l,ph,area)=>`<label>${l}</label>${area?`<textarea name="${n}" rows="2" placeholder="${esc(ph)}"></textarea>`:`<input type="text" name="${n}" placeholder="${esc(ph)}">`}`;
 $('#view').innerHTML=`<div class="pagebar"><span class="faint">${list.length} storyboard${list.length===1?'':'s'}</span><button class="btn go sm" id="newboardbtn" type="button">${ic('plus')}New storyboard</button></div><form class="card newshot" id="newboard" hidden><div class="head"><h2>Draft a storyboard</h2><button type="button" class="iconbtn" id="newboardx" style="margin-left:auto" aria-label="Close" data-tip="Close">${ic('x')}</button></div><div class="body">${field('product','Product or brand','Mint Labs graphic tee drop')}${field('audience','Audience','Gamers who grew up on PS2 era games')}${field('idea','Video idea or hook','Character reacts to the shirt selling out like a boss fight win',true)}${field('offer','Offer or call to action (optional)','Link in bio')}<label>Length</label><select name="length"><option value="15">15 seconds</option><option value="5">5 seconds</option><option value="30">30 seconds</option></select><details style="margin-top:12px"><summary class="muted">Lock the character (optional)</summary>${field('identity','Identity','Face, age, hair, build',true)}${field('wardrobe','Wardrobe','Exact outfit')}${field('environment','Environment','Location and lighting')}${field('voice','Voice','Tone and delivery')}</details><p><button class="btn go" type="submit">Draft storyboard</button></p><div class="hint">Sonnet 5.5 drafts it, seven Haiku checkers grade it, and you approve it. Approved shots go to Renders, where each shot still needs its own checks and your spend approval.</div></div></form>
 <div class="stack">${list.map(boardCard).join('')||'<div class="idle">No storyboards yet. Press New storyboard, or ask Mint from Home.</div>'}</div>`;
 $('#newboardbtn').onclick=()=>{$('#newboard').hidden=false;$('#newboard input').focus();};$('#newboardx').onclick=()=>{$('#newboard').hidden=true;};
 $('#newboard').onsubmit=async e=>{e.preventDefault();const b=e.target.querySelector('button[type=submit]');b.disabled=true;b.textContent='Drafting, about 30 seconds';try{await api('/api/storyboards',Object.fromEntries(new FormData(e.target)));toast('Storyboard drafted','ok','Run the checkers next.');storyboards();}catch(err){toast(err.message,'bad');b.disabled=false;b.textContent='Draft storyboard';}};
 document.querySelectorAll('[data-bcheck]').forEach(b=>b.onclick=async()=>{b.disabled=true;b.textContent='Checking';try{await api(`/api/storyboards/${b.dataset.bcheck}/check`,{});}catch(err){toast(err.message,'bad');}storyboards();});
 document.querySelectorAll('[data-bapprove]').forEach(b=>b.onclick=async()=>{try{const {renders:made}=await api(`/api/storyboards/${b.dataset.bapprove}/approve`,{});toast('Storyboard approved','ok',`${made.length} shots added to Renders`);}catch(err){toast(err.message,'bad');}storyboards();});
 document.querySelectorAll('[data-bquick]').forEach(b=>b.onclick=async()=>{b.disabled=true;b.textContent='Revising, about 30 seconds';try{await api(`/api/storyboards/${b.dataset.bquick}/revise`,{note:''});toast('Revised storyboard added','ok','Run the checkers on it.');}catch(err){toast(err.message,'bad');}storyboards();});
 document.querySelectorAll('[data-brevise]').forEach(f=>f.onsubmit=async e=>{e.preventDefault();const b=f.querySelector('button');b.disabled=true;b.textContent='Revising';try{await api(`/api/storyboards/${f.dataset.brevise}/revise`,{note:f.note.value});toast('Revised storyboard added','ok','Run the checkers on it.');}catch(err){toast(err.message,'bad');}storyboards();});
}

const autosize=ta=>{ta.style.height='auto';ta.style.height=ta.scrollHeight+2+'px';};
async function settings(){
 await loadState();const c=state.config,p=c.profile;
 const fields=[['senderName','Name','text'],['company','Company','text'],['senderFact','A true fact about you','area'],['offer','What you offer','area'],['cta','Call to action','area'],['rules','Writing rules','area']];
 $('#view').innerHTML=`<div class="settings">
  <div class="card"><div class="head"><h2>Connections</h2></div><div class="conns">${c.integrations.map(i=>`<div class="introw"><img src="/logos/${i.id}.png" alt=""><div><b>${esc(i.name)}</b><span>${esc(i.detail)}</span></div>${i.on?'<span class="state s-ok">Connected</span>':i.id==='whop'?'<a class="btn sm" href="https://whop.com/dashboard/biz_Fj9QjiVTYUDda8/developer" target="_blank" rel="noopener">Get key</a>':'<span class="state s-you">Needs key</span>'}</div>`).join('')}</div></div>
  <form class="card" id="profile"><div class="head"><h2>Sender profile</h2><span class="faint" style="margin-left:auto">Every email is written from this</span></div><div class="body">${fields.map(([k,l,t])=>`<label for="pf-${k}">${l}</label>${t==='text'?`<input id="pf-${k}" type="text" name="${k}" value="${esc(p[k])}">`:`<textarea id="pf-${k}" name="${k}" rows="2">${esc(p[k])}</textarea>`}`).join('')}</div><div class="foot"><span class="faint" id="pfstate">All changes saved</span><button class="btn go" type="submit" id="pfsave" disabled>Save</button></div></form>
 </div>`;
 const f=$('#profile'),mark=dirty=>{$('#pfsave').disabled=!dirty;$('#pfstate').textContent=dirty?'Unsaved changes':'All changes saved';};
 f.querySelectorAll('textarea').forEach(ta=>{autosize(ta);ta.addEventListener('input',()=>autosize(ta));});
 f.addEventListener('input',()=>mark(true));
 f.onsubmit=async e=>{e.preventDefault();try{await api('/api/profile',Object.fromEntries(new FormData(f)));mark(false);toast('Profile saved','ok');}catch(err){toast(err.message,'bad');}};
}

async function voices(){await voicesView({view:$('#view'),api,esc,toast,sbadge,svg});}
const views={home,tasks,leads,drafts,storyboards,renders,voices,settings};
let lastView;
async function route(){
 const [name,arg]=location.hash.slice(2).split('/');
 if(name!==lastView){lastView=name;$('#view').scrollTop=0;$('#drawer').hidden=true;state.selectedLead=null;}
 // Live updates re-render the page, so carry over anything half typed and where the console was scrolled.
 const typed=[...document.querySelectorAll('#view form[id] [name]')].filter(el=>el.value&&['text','textarea'].includes(el.type)).map(el=>[el.form.id,el.name,el.value]);
 const focus=document.activeElement?.form?.id?[document.activeElement.form.id,document.activeElement.name]:null;
 const scroll=$('#console')?.scrollTop;
 try{await loadState();await (views[name]||home)(arg?Number(arg):undefined);}catch(err){$('#view').innerHTML=`<div class="card"><div class="empty">${esc(err.message)}</div></div>`;}
 for(const [form,field,value] of typed){const el=document.querySelector(`#${form} [name="${field}"]`);if(el&&!el.value)el.value=value;}
 if(focus)document.querySelector(`#${focus[0]} [name="${focus[1]}"]`)?.focus();
 const c=$('#console');if(c&&scroll!==undefined&&scroll<c.scrollHeight-c.clientHeight-30)c.scrollTop=scroll;
 renderShell();
}
window.addEventListener('hashchange',route);
loadLive().catch(()=>{}).then(route).then(()=>api('/api/renders')).then(({renders})=>renders.filter(r=>r.review==='pending').slice(0,2).forEach(popReview)).catch(()=>{});

let refreshTimer,cardTimer,statsTimer;
const softRefresh=fn=>{clearTimeout(refreshTimer);refreshTimer=setTimeout(fn,400);};
// Counts on the group cards change with every lead, so patch the cards in place instead of redrawing the page.
const refreshCards=()=>{clearTimeout(cardTimer);cardTimer=setTimeout(async()=>{try{await loadState();for(const t of state.tasks){const el=document.querySelector(`[data-gcard="${t.id}"]`);if(el)el.outerHTML=groupCard(t,el.classList.contains('on'));}bindGo();bindGroups();}catch{}},500);};
const refreshStats=()=>{clearTimeout(statsTimer);statsTimer=setTimeout(()=>loadStats().catch(()=>{}),800);};
const stream=new EventSource('/api/stream');
stream.onmessage=msg=>{
 const change=JSON.parse(msg.data);
 if(change.kind==='event'){
  const e=change.event;state.live.unshift(e);state.live.length=Math.min(state.live.length,300);noteDraft(e);
  $('#livefeed .empty')?.remove();if(e.task_id){state.lastStep.set(e.task_id,e);document.querySelectorAll(`#livefeed .li.now[data-task="${e.task_id}"]`).forEach(x=>x.classList.remove('now'));}if(railTypes.has(e.type)){$('#livefeed').insertAdjacentHTML('afterbegin',liveItem(e,true));if(document.body.classList.contains('rail-off')){railUnseen++;setRail(false);}}
  if(e.type==='plan'&&comp.speakTask===e.task_id){comp.speakTask=null;voice.speak(e.title);}
  if(e.task_id){state.lastStep.set(e.task_id,e);const step=document.querySelector(`[data-gcard="${e.task_id}"] .gstep`);if(step){const [h,b]=brief(e);step.innerHTML=`<span>${esc(h+(b?`: ${b}`:''))}</span>`;}}
  if(state.mission&&e.task_id===state.mission.task.id&&tab()==='tasks'){state.mission.events.push(e);const c=$('#console');if(c){const stick=c.scrollTop+c.clientHeight>=c.scrollHeight-30;c.insertAdjacentHTML('beforeend',consoleRow(e));if(stick)c.scrollTop=c.scrollHeight;}}
  if(e.type==='draft')toast('Draft ready, not sent','ok',e.title.replace(/\. Not sent\.$/,''));
  if(e.type==='error')toast('Error','bad',tidy(e.title));
  if(e.type==='done')toast('Mission finished','ok',e.title.replace(/^Finished: /,''));
 }
 if(change.kind==='lead'){
  const l=change.lead,m=state.mission;
  if(tab()==='tasks'&&m&&l.task_id===m.task.id){
   const i=m.leads.findIndex(x=>x.id===l.id);if(i<0)m.leads.unshift(l);else m.leads[i]=l;
   const grid=$('#leadgrid');if(grid){const row=grid.querySelector(`.trow[data-id="${l.id}"]`);const html=leadRow(l);if(row)row.outerHTML=html;else{grid.querySelector('.empty')?.remove();grid.querySelector('.th').insertAdjacentHTML('afterend',html);}bindLeadCards();}
   const chips=$('#cchips');if(chips)chips.innerHTML=counterChips(m.leads);
  }
  if(['home','tasks'].includes(tab()))refreshCards();
  if(tab()==='tasks')refreshStats();
 }
 if(change.kind==='task'){
  const t=change.task,prev=state.tasks.find(x=>x.id===t.id);
  if(['home','tasks'].includes(tab())){if(prev&&prev.status===t.status)refreshCards();else softRefresh(route);}else loadState().catch(()=>{});
 }
 if(change.kind==='spend'){renderSpend().catch(()=>{});if(tab()==='tasks')refreshStats();}
 if(change.kind==='storyboard'&&tab()==='storyboards')softRefresh(route);
 if(change.kind==='assistant'&&tab()==='home'&&!thread.thinking)loadThread();
 if(change.kind==='voice'&&tab()==='voices'&&![...document.querySelectorAll('audio')].some(a=>!a.paused))softRefresh(route);
 if(change.kind==='render'){if(change.render.review==='pending')popReview(change.render);if(['renders','home'].includes(tab()))softRefresh(route);else loadState().catch(()=>{});}
};
