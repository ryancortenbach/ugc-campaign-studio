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
// Cyber style toasts: big status icon, bold title, detail line, stacked bottom right.
function toast(title,kind='info',sub=''){
 let box=$('#toasts');if(!box){box=document.createElement('div');box.id='toasts';document.body.append(box);}
 const t=document.createElement('div');t.className=`toast t-${kind}`;
 t.innerHTML=`<i>${svg(kind==='ok'?'ok':kind==='bad'?'bad':'info')}</i><div style="min-width:0"><b>${esc(title)}</b>${sub?`<span>${esc(sub)}</span>`:''}</div><button class="x" title="Dismiss">×</button>`;
 t.querySelector('.x').onclick=()=>t.remove();box.prepend(t);while(box.children.length>4)box.lastChild.remove();setTimeout(()=>t.remove(),kind==='bad'?9000:5000);
}

// Status palette from Cyber 4.5: orange working, yellow needs you, green done, red failed, white waiting.
const leadStatus={found:['Queued','s-wait'],visiting:['Visiting site','s-run'],grading:['Checking fit','s-run'],drafting:['Writing email','s-run'],drafted:['Draft ready','s-ok'],skipped:['Skipped','s-idle'],unreachable:['Site unreachable','s-bad'],error:['Error','s-bad'],contacted:['Contacted','s-ok'],replied:['Replied','s-ok'],won:['Won','s-ok'],lost:['Lost','s-bad']};
const taskStatus={queued:['Queued','s-wait'],running:['Running','s-run'],paused:['Paused','s-wait'],done:['Done','s-ok'],stopped:['Stopped','s-idle'],failed:['Failed','s-bad']};
const pill=([label,cls])=>`<span class="pill ${cls}">${esc(label)}</span>`;
const sbadge=([label,cls])=>`<span class="sbadge ${cls}"><i>${svg(cls.slice(2))}</i><b>${esc(label)}</b></span>`;
const ls=s=>leadStatus[s]||[s,'s-idle'];const ts=s=>taskStatus[s]||[s,'s-idle'];
const titles={home:'Home',tasks:'Tasks',leads:'Leads',drafts:'Drafts',storyboards:'Storyboards',renders:'Renders',settings:'Settings'};
const logoFor=tool=>{const t=String(tool||'').toLowerCase();return t.startsWith('claude')?'claude':t.includes('exa')?'exa':t.startsWith('solari')?'solari':t.startsWith('gmail')?'gmail':t.includes('higgsfield')?'higgsfield':t.includes('whop')?'whop':null;};
const icon=tool=>{const l=logoFor(tool);return l?`<span class="ico"><img src="/logos/${l}.png" alt="${l}"></span>`:tool==='operator'?'<span class="ico">You</span>':'<span class="ico" title="Mint Labs agent"><img src="/logo.png" alt="Mint Labs"></span>';};

const state={config:null,tasks:[],mission:null,selectedLead:null,openEvents:new Set(),live:[],lastStep:new Map(),gmail:new Map()};
const pref={get(k,d){try{return localStorage.getItem(k)||d;}catch{return d;}},set(k,v){try{localStorage.setItem(k,v);}catch{}}};
const tab=()=>(location.hash.slice(2).split('/')[0]||'home');

async function loadState(){const d=await api('/api/state');state.config=d.config;state.tasks=d.tasks;renderShell();}
function renderShell(){
 const c=state.config;if(!c)return;
 $('#pagetitle').textContent=titles[tab()]||'Home';
 document.querySelectorAll('#tabs a').forEach(a=>a.classList.toggle('on',a.dataset.tab===tab()));
 const rt=document.querySelector('#tabs a[data-tab="renders"]');rt.querySelector('.badge')?.remove();if(c.stats.reviews)rt.insertAdjacentHTML('beforeend',`<span class="badge">${c.stats.reviews}</span>`);
 const on=c.integrations.filter(i=>i.on).length,all=c.integrations.length;
 $('#intdot').className=`dot ${on===all?'on':'part'}`;
 $('#intlabel').textContent=on===all?'Active':`${on} of ${all} active`;
 $('#intpanel').innerHTML=c.integrations.map(i=>`<${i.on?'div':'a href="#/settings"'} class="introw"><img src="/logos/${i.id}.png" alt=""><div><b>${esc(i.name)}</b><span>${esc(i.detail)}</span></div><span class="state ${i.on?'s-ok':'s-you'}">${i.on?'Connected':'Needs key'}</span></${i.on?'div':'a'}>`).join('');
 $('#spend').textContent=`$${Number(c.stats.spend||0).toFixed(2)}`;
}
const providerName={claude:'Claude',exa:'Exa',solari:'Solari',higgsfield:'Higgsfield',whop:'Whop',gmail:'Gmail'};
async function renderSpend(){
 const s=await api('/api/spend');
 $('#spend').textContent=`$${s.total.toFixed(2)}`;
 $('#spendpanel').innerHTML=`<div class="introw" style="cursor:default"><img src="/logo.png" alt=""><div><b>All time</b><span>Today $${s.today.toFixed(4)}</span></div><b class="mono">$${s.total.toFixed(4)}</b></div>${s.providers.map(p=>`<div class="introw"><img src="/logos/${esc(p.provider)}.png" alt=""><div><b>${esc(providerName[p.provider]||p.provider)}</b><span>Today $${p.today.toFixed(4)} · ${p.count} charge${p.count===1?'':'s'}</span></div><b class="mono">$${p.total.toFixed(4)}</b></div>`).join('')||'<div class="empty">No spend yet.</div>'}<div class="hint" style="padding:4px 10px 8px">Higgsfield shows the price you approved for each render. Solari is billed by browser time.</div>`;
}
function togglePanel(btn,panel){btn.addEventListener('click',e=>{e.stopPropagation();const open=panel.hidden;document.querySelectorAll('.intpanel').forEach(p=>{p.hidden=true;});document.querySelectorAll('.intbtn').forEach(b=>b.setAttribute('aria-expanded','false'));panel.hidden=!open;btn.setAttribute('aria-expanded',String(open));if(open&&panel.id==='spendpanel')renderSpend().catch(()=>{});});}
togglePanel($('#intbtn'),$('#intpanel'));togglePanel($('#spendbtn'),$('#spendpanel'));
document.addEventListener('click',e=>{if(!e.target.closest('.integr')){document.querySelectorAll('.intpanel').forEach(p=>{p.hidden=true;});document.querySelectorAll('.intbtn').forEach(b=>b.setAttribute('aria-expanded','false'));}});

const toolLabels={'claude.plan':'Claude planning','claude.score':'Claude grading','claude.draft':'Claude writing','claude.steer':'Claude steering','gmail.drafts.create':'Gmail draft','solari.browser':'Solari browser','fetch':'Web fetch','crm':'CRM','crm.create':'CRM','rules':'Rules','operator':'You','exa':'Exa','exa.search (REST)':'Exa search','exa.web_search_exa (MCP)':'Exa search'};
const toolName=t=>{const raw=String(t||'').replace(/\s*\(claude-.*\)$/,'');return toolLabels[raw]||toolLabels[raw.split(' ')[0]]||(raw.startsWith('exa')?'Exa search':raw);};
// Older log lines carry fit scores and page titles with long dashes; show them without either.
const tidy=t=>String(t??'').replace(/\s*\(fit \d+\)/g,'').replace(/\s*\u2014\s*/g,', ');
const isNow=e=>e.type==='tool_call'&&state.lastStep.get(e.task_id)===e&&state.tasks.some(t=>t.id===e.task_id&&t.status==='running');
function liveItem(e,fresh){return `<div class="li k-${esc(e.type)}${fresh?' fresh':''}${isNow(e)?' now':''}" data-task="${e.task_id||''}" data-lead="${e.lead_id||''}">${icon(e.tool)}<div style="min-width:0"><div class="msg">${esc(tidy(e.title))}</div><div class="chips">${e.task_id?`<span class="chip">Task ${e.task_id}</span>`:''}<span class="chip">${esc(toolName(e.tool)||(e.type==='done'?'Finished':e.type))}</span></div></div><span class="t mono">${time(e.at)}</span></div>`;}
function renderLive(){$('#livefeed').innerHTML=state.live.length?state.live.map(e=>liveItem(e)).join(''):'<div class="empty">Every step the agent takes shows up here.</div>';$('#livecount').textContent=state.live.length?`${state.live.length} events`:'';}
const noteDraft=e=>{if(e.type==='draft'&&e.lead_id&&e.data?.gmailUrl)state.gmail.set(e.lead_id,e.data.gmailUrl);};
async function loadLive(){const {events}=await api('/api/events');state.live=events.slice().reverse();for(const e of events){if(e.task_id)state.lastStep.set(e.task_id,e);noteDraft(e);}renderLive();}
$('#livefeed').addEventListener('click',e=>{const li=e.target.closest('.li');if(!li)return;if(li.dataset.task)location.hash=`#/tasks/${li.dataset.task}`;if(li.dataset.lead)openLead(Number(li.dataset.lead));});

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
   <div class="gstep">${step?`${icon(step.tool)}<span>${esc(tidy(step.title))}</span>`:`<span>${live?'Waiting to start':esc(t.summary||'Finished')}</span>`}</div>
   <div class="gbot"><span class="gcount"><i class="dot ${t.status==='running'?'run pulse':'white'}"></i>${t.leads} brand${t.leads===1?'':'s'}</span><span class="gact">${t.status==='running'?`<button data-gact="pause" data-id="${t.id}" title="Pause">${svg('pause')}</button>`:t.status==='paused'?`<button data-gact="resume" data-id="${t.id}" title="Resume">${svg('play')}</button>`:''}${live?`<button data-gact="stop" data-id="${t.id}" title="Stop">${svg('stop')}</button>`:''}<button data-gact="clone" data-id="${t.id}" title="Clone: run the same request as a new mission" aria-label="Clone mission">${svg('clone')}</button></span></div></div>
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

async function home(){
 const {renders}=await api('/api/renders');
 const pending=renders.filter(r=>r.review==='pending');
 const live=state.tasks.filter(isLive),recent=state.tasks.filter(t=>!isLive(t)).slice(0,6);
 $('#view').innerHTML=`<div class="hero"><p class="eyebrow">Mission control</p><h2>What should the agent work on?</h2><p class="muted" style="margin:0">Exa finds brands, Solari visits their sites, Claude checks the fit and writes the email, and every draft waits in Gmail for you to send.</p>
  <form class="chat" id="chat"><textarea name="message" placeholder="Find 8 independent streetwear brands in Brooklyn and Los Angeles that sell online" required></textarea><div class="row"><span class="faint" style="font-size:11.5px">Cmd + Enter to start. Nothing is ever sent without you.</span><button class="btn go" type="submit">Start mission</button></div></form>
  ${pending.length?`<div class="section-title">Scenes awaiting your review <span class="badge">${pending.length}</span></div><div class="reviews">${pending.map(reviewCard).join('')}</div>`:''}
  <div class="section-title">Running now <span class="count">${live.length}</span></div>${live.length?`<div class="groups wrap">${live.map(t=>groupCard(t)).join('')}</div>`:'<div class="idle">Nothing running. Start a mission above and it shows up here as a live card.</div>'}
  <div class="section-title">Activity</div><div class="stats" id="stats"></div>
  ${recent.length?`<div class="section-title">Recent missions <a class="more" href="#/tasks">All tasks</a></div><div class="groups wrap">${recent.map(t=>groupCard(t)).join('')}</div>`:''}
 </div>`;
 startMission($('#chat'));bindGo();bindGroups();bindReviews(()=>route());loadStats().catch(()=>{});
}
function bindGo(){document.querySelectorAll('[data-go]').forEach(el=>{el.onclick=()=>{location.hash=el.dataset.go;};});document.querySelectorAll('[data-lead]:not(.li)').forEach(el=>{el.onclick=()=>openLead(Number(el.dataset.lead));});}

async function tasks(id){
 if(!id&&state.tasks[0])id=state.tasks[0].id;
 const m=id?await api(`/api/tasks/${id}`):null;state.mission=m;
 if(m)m.events.forEach(noteDraft);
 $('#view').innerHTML=`<div class="groups-head"><h2>Task groups <span class="count">${state.tasks.length}</span></h2><form class="newmission" id="newmission"><input type="text" name="message" placeholder="New mission, e.g. find 8 streetwear brands in Brooklyn" required autocomplete="off"><button class="btn go" type="submit">Start</button></form></div>
  ${state.tasks.length?`<div class="groups">${state.tasks.map(t=>groupCard(t,t.id===id)).join('')}</div>`:'<div class="idle">No missions yet. Start one above.</div>'}
  ${m?missionView(m):''}`;
 startMission($('#newmission'));bindGo();bindGroups();if(m)bindMission(m);
}
function planLine(p){return p?`<span>Category: ${esc(p.markets.join(', '))}</span><span>Location: ${esc(p.territories.join(', '))}</span><span>Up to ${p.maxDrafts} drafts</span>`:'<span>Planning</span>';}
// Cyber 5.0 counter chips: colored icon block plus a count.
function counterChips(leads){
 const c={ok:0,run:0,wait:0,bad:0};for(const l of leads){const k=ls(l.status)[1].slice(2);if(k in c)c[k]++;}
 return [['ok','Drafts ready'],['run','Working now'],['wait','Queued'],['bad','Failed']].map(([k,l])=>`<span class="cchip c-${k}" title="${l}"><i>${svg(k)}</i><b>${c[k]}</b></span>`).join('');
}
function missionView(m){
 const t=m.task,live=m.running;
 return `<div class="card mission"><div class="head"><div style="min-width:0;flex:1 1 360px"><div class="meta" style="margin-bottom:5px">${pill(ts(t.status))}<span class="mono">Task ${t.id}</span><span class="mono">${money(t.cost_usd)}</span>${planLine(t.plan)}</div><h2 style="font-weight:500">${esc(t.prompt)}</h2>${t.plan?.qualify?`<div class="faint" style="margin-top:4px">Good fit: ${esc(t.plan.qualify)}</div>`:''}</div><div class="right"><div class="cchips" id="cchips">${counterChips(m.leads)}</div>
  ${live?`${t.status==='paused'?'<button class="btn sm" data-act="resume">Resume</button>':'<button class="btn sm warn" data-act="pause">Pause</button>'}<button class="btn sm stop" data-act="stop">Stop</button>`:`<button class="btn sm" data-gact="clone" data-id="${t.id}">Run again</button>`}</div></div>
  <div class="trows" id="leadgrid"><div class="trow th"><span>Brand</span><span>Where</span><span>Contact</span><span>Status</span><span>Actions</span></div>${m.leads.map(leadRow).join('')||'<div class="empty">Each brand the agent finds gets its own row here.</div>'}</div>
  <form class="steer" id="steer"><input type="text" name="message" placeholder="Steer this mission: skip anyone outside NYC, focus on women's activewear, max 3, stop" autocomplete="off"><button class="btn" type="submit">Steer</button></form>
  <div class="console" id="console">${m.events.map(consoleRow).join('')}</div>
 </div>`;
}
// The contact column already says when there is no email, so only explain skips it cannot.
const skipWhy=l=>l.status==='skipped'&&l.contact_email?(l.risks[0]||'Not a fit for this mission'):l.status==='unreachable'?'The site would not load':'';
function leadRow(l){const g=state.gmail.get(l.id),why=skipWhy(l);return `<div class="trow${state.selectedLead===l.id?' sel':''}" data-id="${l.id}" data-status="${esc(l.status)}"><div class="tbrand"><div class="thumb">${l.screenshot?`<img src="/shots/${esc(l.screenshot)}" alt="">`:esc((l.company||l.domain||'?')[0])}</div><div style="min-width:0"><b>${esc(l.company||l.domain)}</b><span>${esc(l.domain)}</span></div></div><div class="where">${esc(l.territory||'')}<span>${esc(l.market||'')}</span></div><div class="mono mail">${esc(l.contact_email||(l.status==='found'?'Not checked yet':'No public email'))}</div><div style="min-width:0" title="${esc(why)}">${sbadge(ls(l.status))}${why?`<div class="why">${esc(why)}</div>`:''}</div><div class="tact"><button type="button" title="Details">${svg('eye')}</button>${g?`<a class="go" href="${esc(g)}" target="_blank" rel="noopener" title="Open the draft in Gmail">${svg('mail')}</a>`:`<button type="button" disabled title="No draft for this brand">${svg('mail')}</button>`}<a href="${esc(l.url||`https://${l.domain}`)}" target="_blank" rel="noopener" title="Open the website">${svg('open')}</a></div></div>`;}
function consoleRow(e){const open=state.openEvents.has(e.id);const extra=e.detail||e.data;return `<div class="row k-${esc(e.type)}" data-ev="${e.id}"><span class="t">${time(e.at)}</span><span class="tool" title="${esc(e.tool||e.type)}">${esc(e.tool||e.type)}</span><span class="msg">${esc(tidy(e.title))}${extra?' <span class="faint">[+]</span>':''}</span>${open&&extra?`<pre>${esc([e.detail,e.data?JSON.stringify(e.data,null,1):''].filter(Boolean).join('\n\n'))}</pre>`:''}</div>`;}
function bindMission(m){
 const id=m.task.id;
 document.querySelectorAll('[data-act]').forEach(b=>b.addEventListener('click',async()=>{try{await api(`/api/tasks/${id}/control`,{action:b.dataset.act});}catch(err){toast(err.message,'bad');}}));
 $('#steer').addEventListener('submit',async e=>{e.preventDefault();const f=e.target;if(!f.message.value.trim())return;try{const s=await api(`/api/tasks/${id}/steer`,{message:f.message.value});f.reset();toast(s.live?'Steer queued':'Steer saved','ok',s.live?'It applies before the next step.':'This mission is not running.');}catch(err){toast(err.message,'bad');}});
 bindLeadCards();bindConsole();const c=$('#console');c.scrollTop=c.scrollHeight;
}
function bindLeadCards(){document.querySelectorAll('.trows .trow[data-id]').forEach(r=>{r.onclick=e=>{if(!e.target.closest('a'))openLead(Number(r.dataset.id));};});}
function bindConsole(){$('#console')?.addEventListener('click',e=>{const row=e.target.closest('[data-ev]');if(!row)return;const id=Number(row.dataset.ev);state.openEvents.has(id)?state.openEvents.delete(id):state.openEvents.add(id);const ev=state.mission.events.find(x=>x.id===id);if(ev)row.outerHTML=consoleRow(ev);});}

async function openLead(id){
 state.selectedLead=id;
 const {lead:l,events,drafts}=await api(`/api/leads/${id}`);
 const d=$('#drawer');d.hidden=false;
 d.innerHTML=`<div class="head"><div class="thumb">${esc((l.company||'?')[0])}</div><div style="min-width:0"><h2>${esc(l.company||l.domain)}</h2><a class="faint" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.domain)}</a></div><div style="margin-left:auto;display:flex;gap:8px;align-items:center">${pill(ls(l.status))}${drafts.find(x=>x.gmail_url)?`<a class="btn sm go" href="${esc(drafts.find(x=>x.gmail_url).gmail_url)}" target="_blank" rel="noopener">${svg('open')}Open in Gmail</a>`:''}<button class="btn sm" id="close">Close</button></div></div>
 <section><h3>Why the agent picked this brand</h3><div class="meta" style="margin-bottom:8px"><span>${esc(l.market||'')}</span><span>${esc(l.territory||'')}</span><span>Task ${l.task_id}</span></div>${l.reasons.length?`<ul>${l.reasons.map(r=>`<li>${esc(r)}</li>`).join('')}</ul>`:'<span class="faint">Not checked yet.</span>'}${l.risks.length?`<h3 style="margin-top:12px">Risks</h3><ul>${l.risks.map(r=>`<li class="muted">${esc(r)}</li>`).join('')}</ul>`:''}</section>
 <section><h3>Contact</h3>${l.contact_email?`<div class="mono">${esc(l.contact_email)}</div><div class="hint">Found on <a href="${esc(l.contact_source)}" target="_blank" rel="noopener" style="color:var(--green)">${esc(l.contact_source)}</a></div>${l.contact_excerpt&&l.contact_excerpt!=='(mailto link)'?`<div class="quote" style="margin-top:8px">${esc(l.contact_excerpt)}</div>`:'<div class="hint">Listed as an email link on that page.</div>'}`:'<span class="faint">No public email found.</span>'}${l.emails.length>1?`<div class="hint">Other addresses: ${l.emails.slice(0,6).map(e=>esc(e.email)).join(', ')}</div>`:''}</section>
 ${drafts.map(x=>`<section><h3>${x.status==='sent'?'Email you marked as sent':x.status==='gmail_draft'?'Draft in Gmail, not sent':'Draft in CRM, not sent'}</h3><div class="mailbox"><b>${esc(x.subject)}</b>\n\n${esc(x.body)}</div>${x.gmail_url?`<p><a class="btn go sm" href="${esc(x.gmail_url)}" target="_blank" rel="noopener">Open in Gmail</a></p>`:''}</section>`).join('')}
 ${l.screenshot?`<section><h3>Captured by Solari</h3><img class="shot" src="/shots/${esc(l.screenshot)}" alt="Homepage screenshot"></section>`:''}
 ${l.evidence?`<section><h3>Exa evidence</h3><div class="muted" style="font-size:12px">${esc(l.evidence)}</div></section>`:''}
 <section><h3>Pipeline</h3><select id="leadstatus">${['found','drafted','contacted','replied','won','lost','skipped'].map(s=>`<option value="${s}" ${s===l.status?'selected':''}>${esc(ls(s)[0])}</option>`).join('')}</select><label>Notes</label><textarea id="leadnotes" rows="3">${esc(l.notes||'')}</textarea><p><button class="btn sm" id="savelead">Save</button></p></section>
 <section><h3>Timeline</h3><div class="console" style="height:auto;max-height:320px;border:0;padding:0">${events.map(consoleRow).join('')}</div></section>`;
 $('#close').onclick=()=>{d.hidden=true;state.selectedLead=null;};
 $('#savelead').onclick=async()=>{try{await api(`/api/leads/${id}`,{status:$('#leadstatus').value,notes:$('#leadnotes').value});toast('Saved','ok');}catch(err){toast(err.message,'bad');}};
}
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#drawer').hidden){$('#drawer').hidden=true;state.selectedLead=null;}});

async function leads(){
 const [{leads},{drafts}]=await Promise.all([api('/api/leads'),api('/api/drafts')]);
 for(const d of drafts)if(d.gmail_url)state.gmail.set(d.lead_id,d.gmail_url);
 $('#view').innerHTML=`<div class="card"><div class="head"><h2>All brands <span class="faint" style="font-weight:500">${leads.length}</span></h2><div class="right"><div class="cchips">${counterChips(leads)}</div><select id="filter" style="width:auto;padding:5px 9px"><option value="">All statuses</option>${[...new Set(leads.map(l=>l.status))].map(s=>`<option value="${s}">${esc(ls(s)[0])}</option>`).join('')}</select></div></div>
  <div class="trows" id="crm"><div class="trow th"><span>Brand</span><span>Where</span><span>Contact</span><span>Status</span><span>Actions</span></div>${leads.map(leadRow).join('')||'<div class="empty">No brands yet. Start a mission from Home.</div>'}</div></div>`;
 $('#filter').onchange=e=>document.querySelectorAll('#crm .trow[data-status]').forEach(r=>{r.hidden=Boolean(e.target.value)&&r.dataset.status!==e.target.value;});
 bindLeadCards();
}

async function drafts(){
 const {drafts}=await api('/api/drafts');
 $('#view').innerHTML=`<div class="banner"><i>${svg('mail')}</i><div><b>Nothing here is ever sent for you.</b><span>Each email waits as a draft${state.config?.gmail?` in ${esc(state.config.gmail)}`:''}. Open it in Gmail, read it, and send it yourself.</span></div></div>
  <div class="dcards">${drafts.map(d=>`<div class="dcard" data-lead="${d.lead_id}"><div class="thumb">${d.screenshot?`<img src="/shots/${esc(d.screenshot)}" alt="">`:esc((d.company||'?')[0])}</div><div style="min-width:0"><b class="subj">${esc(d.subject)}</b><div class="to">To <span class="mono">${esc(d.to_email)}</span>${d.company?` · ${esc(d.company)}`:''} · ${ago(d.created_at)}</div><p>${esc(d.body.replace(/\s+/g,' '))}</p></div><div class="dside">${sbadge(d.status==='sent'?['Sent by you','s-ok']:d.gmail_url?['In Gmail, not sent','s-you']:['Saved in CRM only','s-wait'])}<div style="display:flex;gap:6px">${d.gmail_url&&d.status!=='sent'?`<a class="btn sm" href="${esc(d.gmail_url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">${svg('open')}Open in Gmail</a><button class="btn sm" data-sent="${d.id}">I sent it</button>`:''}</div></div></div>`).join('')||'<div class="idle">No drafts yet. Each mission saves its emails here and in Gmail.</div>'}</div>`;
 bindGo();
 document.querySelectorAll('[data-sent]').forEach(b=>b.onclick=async e=>{e.stopPropagation();try{await api(`/api/drafts/${b.dataset.sent}/sent`,{});toast('Marked as sent','ok','The brand moves to Contacted.');drafts();}catch(err){toast(err.message,'bad');}});
}

const renderStatus={draft:['Needs checks','s-wait'],checking:['Checking','s-run'],checks_failed:['Checks failed','s-bad'],checks_passed:['Awaiting spend approval','s-you'],submitting:['Submitting once','s-run'],submission_unknown:['Outcome uncertain: reconcile before retry','s-bad'],queued:['Queued','s-run'],in_progress:['Rendering','s-run'],completed:['Rendered','s-ok'],failed:['Failed','s-bad'],nsfw:['Blocked','s-bad'],canceled:['Canceled','s-idle']};
const reviewStatus={pending:['Awaiting your review','s-you'],approved:['Approved','s-ok'],rejected:['Rejected','s-bad']};
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
  return `<div class="rcard"><div class="rprev">${video(r)||'<div class="ph">Not rendered yet</div>'}</div><div class="rmain"><div class="rtitle"><b>${esc(r.title)}</b><span class="mono faint">#${r.id}</span><span style="margin-left:auto">${sbadge(st)}</span></div><div class="meta"><span>${esc(r.group_name||'Single shot')}</span><span>${r.input.duration}s</span><span>${esc(r.input.resolution)}</span>${r.estimate_usd?`<span class="mono">about $${esc(r.estimate_usd)}</span>`:''}</div><p class="rprompt">${esc(r.input.prompt)}</p>${r.review_note?`<div class="${r.review==='rejected'?'s-bad':'muted'}" style="font-size:11.5px">Review: ${esc(r.review_note)}</div>`:''}${r.error?`<div class="s-bad" style="font-size:11.5px">${esc(r.error)}</div>`:''}${r.checks?checksBox(r.checks):''}${next?`<div class="hint">${esc(next)}</div>`:''}<div class="ractions">${acts}</div>${stuck?`<form id="reconcile-${r.id}" data-reconcile="${r.id}" style="margin-top:10px"><div class="meta">${r.approved_at?`<span>Approved ${esc(new Date(r.approved_at).toLocaleString())}</span>`:''}<span class="mono">Key ${esc(r.submission_key||'none')}</span></div><input type="text" name="requestId" placeholder="Higgsfield request ID" autocomplete="off" style="margin-top:8px"><div class="ractions"><button class="btn sm go" type="submit">It went through</button><button class="btn sm" type="button" data-never="${r.id}">It never started</button></div></form>`:''}${r.review==='pending'?`<input type="text" data-note="${r.id}" placeholder="If rejecting, say what to fix" style="margin-top:8px">`:''}</div></div>`;};
 $('#view').innerHTML=`<div class="grid split"><div class="grid" style="align-content:start"><div class="card"><div class="head"><h2>New shot</h2></div><form class="body" id="newshot"><label>Title</label><input type="text" name="title" placeholder="Hook shot, penthouse" required><label>Prompt</label><textarea name="prompt" rows="6" required placeholder="Describe the character, action, camera and dialogue for one shot"></textarea><label>Reference image URL (optional)</label><input type="url" name="imageUrl" placeholder="https://"><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><div><label>Seconds</label><input type="number" name="duration" value="5" min="4" max="30"></div><div><label>Resolution</label><select name="resolution"><option>720p</option><option>480p</option><option>1080p</option></select></div></div><p><button class="btn go" type="submit">Add shot</button></p></form></div>
 <div class="card"><div class="head"><h2>Load storyboard scenes</h2></div><form class="body" id="importsb"><textarea name="packet" rows="5" placeholder="Paste a production packet or storyboard JSON exported from the studio" required></textarea><p><button class="btn" type="submit">Add one render per shot</button></p><div class="hint">Seedance 2.5 on Higgsfield ${enabled?'(connected)':'(not connected: add HF_CREDENTIALS)'}. Every shot runs the seven Haiku checkers, then shows a price. A render starts only when you press Approve on that shot, and finished scenes pop up here for your review.</div></form></div></div>
 <div class="grid" style="align-content:start"><div class="section-title" style="margin:0">Render queue <span class="count">${list.length}</span></div><div class="rcards">${list.map(row).join('')||'<div class="idle">No shots yet. Add one on the left or approve a storyboard.</div>'}</div></div></div>`;
 $('#newshot').onsubmit=async e=>{e.preventDefault();const f=e.target;try{await api('/api/renders',{title:f.title.value,prompt:f.prompt.value,imageUrl:f.imageUrl.value||null,duration:Number(f.duration.value),resolution:f.resolution.value});f.reset();renders();}catch(err){toast(err.message,'bad');}};
 $('#importsb').onsubmit=async e=>{e.preventDefault();let packet;try{packet=JSON.parse(e.target.packet.value);}catch{return toast('That is not valid JSON.','bad');}try{const {renders:made}=await api('/api/renders/import',{packet});toast(`Added ${made.length} scene${made.length===1?'':'s'}`,'ok','Run checks on each.');renders();}catch(err){toast(err.message,'bad');}};
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
 $('#view').innerHTML=`<div class="grid split"><div class="card" style="align-self:start"><div class="head"><h2>Draft a storyboard</h2></div><form class="body" id="newboard">${field('product','Product or brand','Mint Labs graphic tee drop')}${field('audience','Audience','Gamers who grew up on PS2 era games')}${field('idea','Video idea or hook','Character reacts to the shirt selling out like a boss fight win',true)}${field('offer','Offer or call to action (optional)','Link in bio')}<label>Length</label><select name="length"><option value="15">15 seconds</option><option value="5">5 seconds</option><option value="30">30 seconds</option></select><details style="margin-top:12px"><summary class="muted">Lock the character (optional)</summary>${field('identity','Identity','Face, age, hair, build',true)}${field('wardrobe','Wardrobe','Exact outfit')}${field('environment','Environment','Location and lighting')}${field('voice','Voice','Tone and delivery')}</details><p><button class="btn go" type="submit">Draft storyboard</button></p><div class="hint">Sonnet 5.5 drafts it, seven Haiku checkers grade it, and you approve it. Approved shots go to Renders, where each shot still needs its own checks and your spend approval.</div></form></div>
 <div class="grid" style="align-content:start">${list.map(boardCard).join('')||'<div class="card"><div class="empty">No storyboards yet.</div></div>'}</div></div>`;
 $('#newboard').onsubmit=async e=>{e.preventDefault();const b=e.target.querySelector('button[type=submit]');b.disabled=true;b.textContent='Drafting, about 30 seconds';try{await api('/api/storyboards',Object.fromEntries(new FormData(e.target)));toast('Storyboard drafted','ok','Run the checkers next.');storyboards();}catch(err){toast(err.message,'bad');b.disabled=false;b.textContent='Draft storyboard';}};
 document.querySelectorAll('[data-bcheck]').forEach(b=>b.onclick=async()=>{b.disabled=true;b.textContent='Checking';try{await api(`/api/storyboards/${b.dataset.bcheck}/check`,{});}catch(err){toast(err.message,'bad');}storyboards();});
 document.querySelectorAll('[data-bapprove]').forEach(b=>b.onclick=async()=>{try{const {renders:made}=await api(`/api/storyboards/${b.dataset.bapprove}/approve`,{});toast('Storyboard approved','ok',`${made.length} shots added to Renders`);}catch(err){toast(err.message,'bad');}storyboards();});
 document.querySelectorAll('[data-bquick]').forEach(b=>b.onclick=async()=>{b.disabled=true;b.textContent='Revising, about 30 seconds';try{await api(`/api/storyboards/${b.dataset.bquick}/revise`,{note:''});toast('Revised storyboard added','ok','Run the checkers on it.');}catch(err){toast(err.message,'bad');}storyboards();});
 document.querySelectorAll('[data-brevise]').forEach(f=>f.onsubmit=async e=>{e.preventDefault();const b=f.querySelector('button');b.disabled=true;b.textContent='Revising';try{await api(`/api/storyboards/${f.dataset.brevise}/revise`,{note:f.note.value});toast('Revised storyboard added','ok','Run the checkers on it.');}catch(err){toast(err.message,'bad');}storyboards();});
}

async function settings(){
 await loadState();const c=state.config,p=c.profile;
 $('#view').innerHTML=`<div class="grid split"><div class="card" style="align-self:start"><div class="head"><h2>Connections</h2></div><div style="padding:6px">${c.integrations.map(i=>`<div class="introw"><img src="/logos/${i.id}.png" alt=""><div><b>${esc(i.name)}</b><span>${esc(i.detail)}</span></div><span class="dot ${i.on?'on':'part'}" title="${i.on?'Connected':'Needs setup'}"></span></div>`).join('')}</div><div class="hint" style="padding:0 16px 14px">Email is never sent by the agent. Drafts only.</div></div>
 <div class="card"><div class="head"><h2>Sender profile</h2><div class="right"><span class="faint">Used for every draft</span></div></div><form class="body" id="profile">${[['senderName','Name'],['company','Company'],['senderFact','True fact about you'],['offer','Offer'],['cta','Call to action'],['rules','Writing rules']].map(([k,l])=>`<label>${l}</label>${k==='senderName'||k==='company'?`<input type="text" name="${k}" value="${esc(p[k])}">`:`<textarea name="${k}" rows="3">${esc(p[k])}</textarea>`}`).join('')}<p><button class="btn go" type="submit">Save profile</button></p></form></div></div>`;
 $('#profile').onsubmit=async e=>{e.preventDefault();try{await api('/api/profile',Object.fromEntries(new FormData(e.target)));toast('Profile saved','ok');}catch(err){toast(err.message,'bad');}};
}

const views={home,tasks,leads,drafts,storyboards,renders,settings};
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
  $('#livefeed .empty')?.remove();if(e.task_id){state.lastStep.set(e.task_id,e);document.querySelectorAll(`#livefeed .li.now[data-task="${e.task_id}"]`).forEach(x=>x.classList.remove('now'));}$('#livefeed').insertAdjacentHTML('afterbegin',liveItem(e,true));$('#livecount').textContent=`${state.live.length} events`;
  if(e.task_id){state.lastStep.set(e.task_id,e);const step=document.querySelector(`[data-gcard="${e.task_id}"] .gstep`);if(step)step.innerHTML=`${icon(e.tool)}<span>${esc(tidy(e.title))}</span>`;}
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
  if(tab()==='home')refreshStats();
 }
 if(change.kind==='task'){
  const t=change.task,prev=state.tasks.find(x=>x.id===t.id);
  if(['home','tasks'].includes(tab())){if(prev&&prev.status===t.status)refreshCards();else softRefresh(route);}else loadState().catch(()=>{});
 }
 if(change.kind==='spend'){renderSpend().catch(()=>{});if(tab()==='home')refreshStats();}
 if(change.kind==='storyboard'&&tab()==='storyboards')softRefresh(route);
 if(change.kind==='render'){if(change.render.review==='pending')popReview(change.render);if(['renders','home'].includes(tab()))softRefresh(route);else loadState().catch(()=>{});}
};
