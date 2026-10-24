const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const time=at=>at?new Date(at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}):'';
const ago=at=>{const s=(Date.now()-new Date(at))/1000;return s<60?`${Math.floor(s)}s ago`:s<3600?`${Math.floor(s/60)}m ago`:s<86400?`${Math.floor(s/3600)}h ago`:new Date(at).toLocaleDateString();};
const money=n=>`$${Number(n||0).toFixed(Number(n)<1?4:2)}`;
async function api(path,body){const res=await fetch(path,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await res.json().catch(()=>({}));if(!res.ok)throw Error(data.error||`HTTP ${res.status}`);return data;}
function toast(text){const t=document.createElement('div');t.className='toast';t.textContent=text;document.body.append(t);setTimeout(()=>t.remove(),3200);}

const leadStatus={found:['Queued','s-idle'],visiting:['Visiting site','s-run'],grading:['Grading fit','s-run'],drafting:['Writing draft','s-run'],drafted:['Draft ready','s-ok'],skipped:['Skipped','s-idle'],unreachable:['Site unreachable','s-bad'],error:['Error','s-bad'],contacted:['Contacted','s-ok'],replied:['Replied','s-ok'],won:['Won','s-ok'],lost:['Lost','s-bad']};
const taskStatus={queued:['Queued','s-wait'],running:['Running','s-run'],paused:['Paused','s-wait'],done:['Done','s-ok'],stopped:['Stopped','s-idle'],failed:['Failed','s-bad']};
const pill=([label,cls])=>`<span class="pill ${cls}">${esc(label)}</span>`;
const ls=s=>leadStatus[s]||[s,'s-idle'];const ts=s=>taskStatus[s]||[s,'s-idle'];

const state={config:null,tasks:[],mission:null,selectedLead:null,openEvents:new Set()};
const tab=()=>(location.hash.slice(2).split('/')[0]||'home');

async function loadState(){const d=await api('/api/state');state.config=d.config;state.tasks=d.tasks;renderTop();}
function renderTop(){
 const c=state.config;if(!c)return;
 const item=(on,label,title)=>`<span class="chip" title="${esc(title)}"><span class="dot ${on?'on':'off'}"></span>${label}</span>`;
 $('#integrations').innerHTML=item(c.brain.startsWith('claude'),'Claude',c.brain)+item(true,`Exa ${c.exa==='rest'?'API':'MCP'}`,c.exa==='rest'?'Paid Exa REST':'Free Exa MCP')+item(c.sites==='solari','Solari',c.sites==='solari'?'Solari cloud browsers':'No SOLARI_API_KEY, using plain fetch')+item(Boolean(c.gmail),'Gmail',c.gmail?`Drafts go to ${c.gmail}`:'No Gmail token, drafts stay in CRM')+item(c.higgsfield,'Higgsfield',c.higgsfield?'Connected':'No HF_CREDENTIALS')+`<span class="chip">Spend ${money(c.stats.spend)}</span>`;
 document.querySelectorAll('#tabs a').forEach(a=>a.classList.toggle('on',a.dataset.tab===tab()));
 const rt=document.querySelector('#tabs a[data-tab="renders"]');rt.innerHTML=c.stats.reviews?`Renders <span class="badge">${c.stats.reviews}</span>`:'Renders';
}
const video=r=>r.local_file?`<video src="/renders/${esc(r.local_file)}" controls playsinline preload="metadata"></video>`:r.result_url?`<video src="${esc(r.result_url)}" controls playsinline preload="metadata"></video>`:'';
function reviewCard(r){return `<div class="review" data-review="${r.id}">${video(r)}<div class="rbody"><div class="eyebrow" style="margin-bottom:6px">Scene ready for review</div><div style="font-weight:600">${esc(r.title)}</div><div class="faint" style="font-size:11.5px;margin:2px 0 8px">${esc(r.group_name||'Single shot')} · ${r.input.duration}s · ${esc(r.input.resolution)}${r.estimate_usd?` · ~$${esc(r.estimate_usd)}`:''}</div><input type="text" data-note="${r.id}" placeholder="If rejecting, say what to fix"><div style="display:flex;gap:6px;margin-top:8px"><button class="btn sm go" data-decide="approved" data-id="${r.id}">Approve scene</button><button class="btn sm stop" data-decide="rejected" data-id="${r.id}">Reject</button></div></div></div>`;}
function bindReviews(after){document.querySelectorAll('[data-decide]').forEach(b=>b.onclick=async()=>{const id=b.dataset.id;const note=document.querySelector(`[data-note="${id}"]`)?.value||'';try{await api(`/api/renders/${id}/review`,{decision:b.dataset.decide,note});toast(b.dataset.decide==='approved'?'Scene approved':'Scene rejected. Use Revise to queue a fixed version.');document.querySelector(`#pop-${id}`)?.remove();after?.();}catch(err){toast(err.message);}});}
const popped=new Set();
function popReview(r){if(popped.has(r.id))return;popped.add(r.id);const el=document.createElement('div');el.className='popup';el.id=`pop-${r.id}`;el.innerHTML=`<button class="x" title="Dismiss">×</button>${reviewCard(r)}`;document.body.append(el);el.querySelector('.x').onclick=()=>el.remove();bindReviews(()=>route());}
setInterval(()=>{$('#clock').textContent=new Date().toLocaleTimeString([], {hour12:false});},1000);

function composer(id,placeholder){return `<form class="composer" id="${id}"><textarea name="message" rows="2" placeholder="${esc(placeholder)}" required></textarea><button class="btn go" type="submit">Start mission</button></form><div class="hint">Example: find 8 independent streetwear brands in Brooklyn and Los Angeles that sell online. Drafts land in Gmail and are never sent.</div>`;}
function bindComposer(id){$(`#${id}`)?.addEventListener('submit',async e=>{e.preventDefault();const f=e.target;try{const {task}=await api('/api/chat',{message:f.message.value});f.reset();location.hash=`#/tasks/${task.id}`;}catch(err){toast(err.message);}});}

async function home(){
 const [{drafts},{renders}]=await Promise.all([api('/api/drafts'),api('/api/renders')]);
 const pending=renders.filter(r=>r.review==='pending');
 const s=state.config.stats;
 $('#view').innerHTML=`<div class="grid home">
  <div class="grid" style="align-content:start">
   ${pending.length?`<div class="card"><div class="head"><h2>Scenes awaiting your review</h2><div class="right"><span class="badge">${pending.length}</span></div></div><div class="reviews">${pending.map(reviewCard).join('')}</div></div>`:''}
   <div class="card"><div class="body"><p class="eyebrow">Mission control</p><h1>Send a mission. The agent finds, vets and drafts.</h1><p class="muted" style="margin:0 0 14px">Exa finds brands, Solari visits their sites, Claude grades the fit and writes the email, and every draft waits in your inbox for you to send.</p>${composer('c-home','Who should the agent find?')}</div></div>
   <div class="stats"><div class="card stat"><b>${s.tasks}</b><span>Missions live</span></div><div class="card stat"><b>${s.leads}</b><span>Leads in CRM</span></div><div class="card stat"><b>${s.drafts}</b><span>Gmail drafts</span></div><div class="card stat"><b>${money(s.spend)}</b><span>Agent spend</span></div></div>
   <div class="card"><div class="head"><h2>Recent missions</h2><div class="right"><a class="btn sm" href="#/tasks">All tasks</a></div></div>${missionRows(state.tasks.slice(0,8))}</div>
  </div>
  <div class="card feed"><div class="head"><h2>Draft feed</h2><div class="right"><span class="faint">${drafts.length}</span></div></div>${drafts.length?drafts.slice(0,40).map(feedItem).join(''):'<div class="empty">Drafts appear here as the agent writes them.</div>'}</div>
 </div>`;
 bindComposer('c-home');bindFeed();bindReviews(()=>route());
}
function missionRows(tasks){return tasks.length?`<table><thead><tr><th>#</th><th>Mission</th><th>Status</th><th>Leads</th><th>Drafts</th><th>Spend</th><th>Started</th></tr></thead><tbody>${tasks.map(t=>`<tr data-go="#/tasks/${t.id}"><td class="faint mono">${t.id}</td><td>${esc(t.prompt.slice(0,90))}</td><td>${pill(ts(t.status))}</td><td>${t.leads}</td><td>${t.drafts}</td><td class="mono">${money(t.cost_usd)}</td><td class="faint">${ago(t.created_at)}</td></tr>`).join('')}</tbody></table>`:'<div class="empty">No missions yet.</div>';}
const feedItem=d=>`<div class="item" data-lead="${d.lead_id}"><div class="thumb">${d.screenshot?`<img src="/shots/${esc(d.screenshot)}" alt="">`:esc((d.company||'?')[0])}</div><div style="min-width:0"><div style="font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(d.company||d.domain)}</div><div><span class="tag">${esc(d.to_email)}</span><span class="tag">${d.status==='gmail_draft'?'Gmail draft':'CRM only'}</span></div></div><div class="faint mono" style="font-size:11px">${time(d.created_at)}</div></div>`;
function bindFeed(){document.querySelectorAll('[data-lead]').forEach(el=>el.addEventListener('click',()=>openLead(Number(el.dataset.lead))));document.querySelectorAll('[data-go]').forEach(el=>el.addEventListener('click',()=>{location.hash=el.dataset.go;}));}

async function tasks(id){
 if(!id&&state.tasks[0])id=state.tasks[0].id;
 const m=id?await api(`/api/tasks/${id}`):null;state.mission=m;
 $('#view').innerHTML=`<div class="grid split">
  <div class="card" style="align-self:start"><div class="body">${composer('c-tasks','New mission')}</div><div class="missions">${state.tasks.map(t=>`<a href="#/tasks/${t.id}" class="${t.id===id?'on':''}"><div class="p">${esc(t.prompt)}</div><div class="meta">${pill(ts(t.status))}<span>${t.leads} leads</span><span>${t.drafts} drafts</span><span>${ago(t.created_at)}</span></div></a>`).join('')||'<div class="empty">No missions yet.</div>'}</div></div>
  <div class="grid" style="align-content:start">${m?missionView(m):'<div class="card"><div class="empty">Start a mission to see tasks here.</div></div>'}</div>
 </div>`;
 bindComposer('c-tasks');if(m)bindMission(m);
}
function planLine(p){return p?`<span>Markets: ${esc(p.markets.join(', '))}</span><span>Territories: ${esc(p.territories.join(', '))}</span><span>Max drafts: ${p.maxDrafts}</span>`:'<span>Planning</span>';}
function missionView(m){
 const t=m.task,live=m.running;
 return `<div class="card"><div class="head"><div style="min-width:0"><div class="meta" style="margin-bottom:4px">${pill(ts(t.status))}<span class="mono">Task ${t.id}</span><span class="mono">${money(t.cost_usd)}</span>${planLine(t.plan)}</div><h2 style="font-weight:500">${esc(t.prompt)}</h2></div><div class="right">
  <button class="btn sm warn" data-act="pause" ${!live||t.status==='paused'?'disabled':''}>Pause</button><button class="btn sm" data-act="resume" ${t.status!=='paused'?'disabled':''}>Resume</button><button class="btn sm stop" data-act="stop" ${!live?'disabled':''}>Stop</button></div></div>
  ${t.plan?.qualify?`<div class="body" style="padding:10px 14px;border-bottom:1px solid var(--line)"><span class="faint">Good fit:</span> ${esc(t.plan.qualify)}</div>`:''}
  <div class="scroll" style="max-height:340px"><table id="leadtable"><thead><tr><th>#</th><th>Brand</th><th>Territory</th><th>Contact</th><th>Fit</th><th>Status</th></tr></thead><tbody>${m.leads.map(leadRow).join('')||'<tr><td colspan="6" class="empty">Leads show up here as the agent finds them.</td></tr>'}</tbody></table></div>
  <form class="steer" id="steer"><input type="text" name="message" placeholder="Steer this mission: skip anyone outside NYC, focus on women's activewear, max 3, stop" autocomplete="off"><button class="btn" type="submit">Steer</button></form>
  <div class="console" id="console">${m.events.map(consoleRow).join('')}</div>
 </div>`;
}
function leadRow(l){return `<tr data-id="${l.id}" class="${state.selectedLead===l.id?'sel':''}"><td class="faint mono">${l.id}</td><td><div style="font-weight:500">${esc(l.company||l.domain)}</div><div class="faint" style="font-size:11px">${esc(l.domain)}</div></td><td class="muted">${esc(l.territory||'')}</td><td class="mono" style="font-size:11.5px">${esc(l.contact_email||'')}</td><td class="mono">${l.fit_score??''}</td><td class="status ${ls(l.status)[1]}">${esc(ls(l.status)[0])}</td></tr>`;}
function consoleRow(e){const open=state.openEvents.has(e.id);const extra=e.detail||e.data;return `<div class="row k-${esc(e.type)}" data-ev="${e.id}"><span class="t">${time(e.at)}</span><span class="tool" title="${esc(e.tool||e.type)}">${esc(e.tool||e.type)}</span><span class="msg">${esc(e.title)}${extra?' <span class="faint">[+]</span>':''}</span>${open&&extra?`<pre>${esc([e.detail,e.data?JSON.stringify(e.data,null,1):''].filter(Boolean).join('\n\n'))}</pre>`:''}</div>`;}
function bindMission(m){
 const id=m.task.id;
 document.querySelectorAll('[data-act]').forEach(b=>b.addEventListener('click',async()=>{try{await api(`/api/tasks/${id}/control`,{action:b.dataset.act});}catch(err){toast(err.message);}}));
 $('#steer').addEventListener('submit',async e=>{e.preventDefault();const f=e.target;try{const s=await api(`/api/tasks/${id}/steer`,{message:f.message.value});f.reset();toast(s.live?'Steer queued. It applies before the next step.':'Saved. This mission is not running.');}catch(err){toast(err.message);}});
 bindLeadTable();bindConsole();const c=$('#console');c.scrollTop=c.scrollHeight;
}
function bindLeadTable(){document.querySelectorAll('#leadtable tbody tr[data-id], #crm tbody tr[data-id]').forEach(r=>r.addEventListener('click',()=>openLead(Number(r.dataset.id))));}
function bindConsole(){$('#console')?.addEventListener('click',e=>{const row=e.target.closest('[data-ev]');if(!row)return;const id=Number(row.dataset.ev);state.openEvents.has(id)?state.openEvents.delete(id):state.openEvents.add(id);const ev=state.mission.events.find(x=>x.id===id);if(ev)row.outerHTML=consoleRow(ev);});}

async function openLead(id){
 state.selectedLead=id;
 const {lead:l,events,drafts}=await api(`/api/leads/${id}`);
 const d=$('#drawer');d.hidden=false;
 d.innerHTML=`<div class="head"><div class="thumb">${esc((l.company||'?')[0])}</div><div style="min-width:0"><h2>${esc(l.company||l.domain)}</h2><a class="faint" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.domain)}</a></div><div style="margin-left:auto;display:flex;gap:6px;align-items:center"><span class="status ${ls(l.status)[1]}">${esc(ls(l.status)[0])}</span><button class="btn sm" id="close">Close</button></div></div>
 <section><h3>Why the agent picked this brand</h3><div class="meta" style="margin-bottom:8px"><span>Fit <b class="mono" style="color:var(--text)">${l.fit_score??'n/a'}</b></span><span>${esc(l.market||'')}</span><span>${esc(l.territory||'')}</span><span>Task ${l.task_id}</span></div>${l.reasons.length?`<ul>${l.reasons.map(r=>`<li>${esc(r)}</li>`).join('')}</ul>`:'<span class="faint">Not graded yet.</span>'}${l.risks.length?`<h3 style="margin-top:12px">Risks</h3><ul>${l.risks.map(r=>`<li class="muted">${esc(r)}</li>`).join('')}</ul>`:''}</section>
 <section><h3>Contact</h3>${l.contact_email?`<div class="mono">${esc(l.contact_email)}</div><div class="hint">Found on <a href="${esc(l.contact_source)}" target="_blank" rel="noopener" style="color:var(--green)">${esc(l.contact_source)}</a></div>${l.contact_excerpt?`<div class="quote" style="margin-top:8px">${esc(l.contact_excerpt)}</div>`:''}`:'<span class="faint">No public email found.</span>'}${l.emails.length>1?`<div class="hint">Other addresses: ${l.emails.slice(0,6).map(e=>esc(e.email)).join(', ')}</div>`:''}</section>
 ${drafts.map(x=>`<section><h3>Draft ${x.status==='gmail_draft'?'in Gmail, not sent':'in CRM, not sent'}</h3><div class="mail"><b>${esc(x.subject)}</b>\n\n${esc(x.body)}</div>${x.gmail_url?`<p><a class="btn go sm" href="${esc(x.gmail_url)}" target="_blank" rel="noopener">Open in Gmail</a></p>`:''}</section>`).join('')}
 ${l.screenshot?`<section><h3>Captured by Solari</h3><img class="shot" src="/shots/${esc(l.screenshot)}" alt="Homepage screenshot"></section>`:''}
 ${l.evidence?`<section><h3>Exa evidence</h3><div class="muted" style="font-size:12px">${esc(l.evidence)}</div></section>`:''}
 <section><h3>Pipeline</h3><select id="leadstatus">${['found','drafted','contacted','replied','won','lost','skipped'].map(s=>`<option value="${s}" ${s===l.status?'selected':''}>${esc(ls(s)[0])}</option>`).join('')}</select><label>Notes</label><textarea id="leadnotes" rows="3">${esc(l.notes||'')}</textarea><p><button class="btn sm" id="savelead">Save</button></p></section>
 <section><h3>Timeline</h3><div class="console" style="height:auto;max-height:320px;border:0;padding:0">${events.map(consoleRow).join('')}</div></section>`;
 $('#close').onclick=()=>{d.hidden=true;state.selectedLead=null;};
 $('#savelead').onclick=async()=>{try{await api(`/api/leads/${id}`,{status:$('#leadstatus').value,notes:$('#leadnotes').value});toast('Saved');}catch(err){toast(err.message);}};
}

async function leads(){
 const {leads}=await api('/api/leads');
 $('#view').innerHTML=`<div class="card"><div class="head"><h2>Leads</h2><div class="right"><select id="filter" style="width:auto;padding:5px 9px"><option value="">All statuses</option>${Object.keys(leadStatus).map(s=>`<option value="${s}">${esc(ls(s)[0])}</option>`).join('')}</select><span class="faint">${leads.length}</span></div></div><div class="scroll"><table id="crm"><thead><tr><th>#</th><th>Brand</th><th>Market</th><th>Territory</th><th>Contact</th><th>Fit</th><th>Status</th><th>Updated</th></tr></thead><tbody>${leads.map(l=>`<tr data-id="${l.id}" data-status="${esc(l.status)}"><td class="faint mono">${l.id}</td><td><div style="font-weight:500">${esc(l.company||l.domain)}</div><div class="faint" style="font-size:11px">${esc(l.domain)}</div></td><td class="muted">${esc(l.market||'')}</td><td class="muted">${esc(l.territory||'')}</td><td class="mono" style="font-size:11.5px">${esc(l.contact_email||'')}</td><td class="mono">${l.fit_score??''}</td><td class="status ${ls(l.status)[1]}">${esc(ls(l.status)[0])}</td><td class="faint">${ago(l.updated_at)}</td></tr>`).join('')||'<tr><td colspan="8" class="empty">No leads yet.</td></tr>'}</tbody></table></div></div>`;
 $('#filter').onchange=e=>document.querySelectorAll('#crm tbody tr[data-status]').forEach(r=>{r.hidden=Boolean(e.target.value)&&r.dataset.status!==e.target.value;});
 bindLeadTable();
}

async function drafts(){
 const {drafts}=await api('/api/drafts');
 $('#view').innerHTML=`<div class="card"><div class="head"><h2>Drafts</h2><div class="right"><span class="faint">Nothing here is ever sent automatically. Open each one in Gmail and send it yourself.</span></div></div>${drafts.map(d=>`<div class="feed"><div class="item" data-lead="${d.lead_id}"><div class="thumb">${esc((d.company||'?')[0])}</div><div style="min-width:0"><div><b>${esc(d.subject)}</b> <span class="faint">to ${esc(d.to_email)}</span></div><div class="muted" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(d.body.replace(/\s+/g,' ').slice(0,180))}</div></div><div>${d.gmail_url?`<a class="btn sm go" href="${esc(d.gmail_url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">Gmail</a>`:'<span class="tag">CRM only</span>'}</div></div></div>`).join('')||'<div class="empty">No drafts yet.</div>'}</div>`;
 bindFeed();
}

const renderStatus={draft:['Needs checks','s-idle'],checking:['Checking','s-run'],checks_failed:['Checks failed','s-bad'],checks_passed:['Awaiting spend approval','s-wait'],queued:['Queued','s-run'],in_progress:['Rendering','s-run'],completed:['Rendered','s-ok'],failed:['Failed','s-bad'],nsfw:['Blocked','s-bad'],canceled:['Canceled','s-idle']};
const reviewStatus={pending:['Awaiting your review','s-wait'],approved:['Approved','s-ok'],rejected:['Rejected','s-bad']};
async function renders(){
 const {renders,enabled}=await api('/api/renders');
 const row=r=>{const st=r.review?reviewStatus[r.review]:(renderStatus[r.status]||[r.status,'s-idle']);const low=r.checks?Math.min(...r.checks.results.map(x=>x.score)):null;return `<tr><td class="faint mono">${r.id}</td><td style="width:200px">${video(r)||`<div class="faint" style="font-size:11px">${esc(r.group_name||'')}</div>`}</td><td><div style="font-weight:500">${esc(r.title)}</div><div class="faint" style="font-size:11px">${esc(r.input.prompt.slice(0,140))}</div>${r.review_note?`<div class="${r.review==='rejected'?'s-bad':'muted'}" style="font-size:11px">Review: ${esc(r.review_note)}</div>`:''}${r.error?`<div class="s-bad" style="font-size:11px">${esc(r.error)}</div>`:''}</td><td class="status ${st[1]}">${esc(st[0])}</td><td>${r.checks?`<details><summary class="mono">${r.checks.passed?'pass':'fail'} (low ${low})</summary>${r.checks.results.map(x=>`<div style="margin:6px 0"><b>${esc(x.name)}</b> <span class="mono">${x.score}</span><div class="muted" style="font-size:11.5px">${esc(x.summary)}</div>${x.issues.map(i=>`<div style="font-size:11.5px" class="${i.severity==='minor'?'faint':'s-bad'}">${esc(i.severity)}: ${esc(i.evidence)} → ${esc(i.fix)}</div>`).join('')}</div>`).join('')}</details>`:'<span class="faint">none</span>'}</td><td class="mono">${r.estimate_usd?`$${esc(r.estimate_usd)}`:''}</td><td style="white-space:nowrap">${['draft','checks_failed','checks_passed'].includes(r.status)?`<button class="btn sm" data-check="${r.id}">Run checks</button>`:''}${r.status==='checks_passed'&&r.estimate_usd?` <button class="btn sm go" data-approve="${r.id}" data-est="${esc(r.estimate_usd)}">Approve $${esc(r.estimate_usd)}</button>`:''}${r.status==='queued'?` <button class="btn sm stop" data-cancel="${r.id}">Cancel</button>`:''}${r.review==='pending'?` <button class="btn sm go" data-decide="approved" data-id="${r.id}">Approve scene</button> <button class="btn sm stop" data-decide="rejected" data-id="${r.id}">Reject</button><input type="text" data-note="${r.id}" placeholder="What to fix" style="margin-top:6px">`:''}${r.review==='rejected'||r.status==='checks_failed'?` <button class="btn sm" data-revise="${r.id}">Revise</button>`:''}</td></tr>`;};
 $('#view').innerHTML=`<div class="grid split"><div class="grid" style="align-content:start"><div class="card"><div class="head"><h2>New shot</h2></div><form class="body" id="newshot"><label>Title</label><input type="text" name="title" placeholder="Hook shot, penthouse" required><label>Prompt</label><textarea name="prompt" rows="6" required placeholder="Describe the character, action, camera and dialogue for one shot"></textarea><label>Reference image URL (optional, public)</label><input type="url" name="imageUrl" placeholder="https://"><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><div><label>Seconds</label><input type="number" name="duration" value="5" min="4" max="30"></div><div><label>Resolution</label><select name="resolution"><option>720p</option><option>480p</option><option>1080p</option></select></div></div><p><button class="btn go" type="submit">Add shot</button></p></form></div>
 <div class="card"><div class="head"><h2>Load storyboard scenes</h2></div><form class="body" id="importsb"><textarea name="packet" rows="5" placeholder="Paste a production packet or storyboard JSON exported from the studio" required></textarea><p><button class="btn" type="submit">Add one render per shot</button></p><div class="hint">Seedance 2.5 on Higgsfield ${enabled?'(connected)':'(not connected: add HF_CREDENTIALS)'}. Every shot runs the seven Haiku checkers, then shows a price. A render starts only when you press Approve on that shot, and finished scenes pop up here for your review.</div></form></div></div>
 <div class="card"><div class="head"><h2>Render queue</h2></div><div class="scroll"><table class="checks"><thead><tr><th>#</th><th>Preview</th><th>Shot</th><th>Status</th><th>Checks</th><th>Price</th><th></th></tr></thead><tbody>${renders.map(row).join('')||'<tr><td colspan="7" class="empty">No shots yet.</td></tr>'}</tbody></table></div></div></div>`;
 $('#newshot').onsubmit=async e=>{e.preventDefault();const f=e.target;try{await api('/api/renders',{title:f.title.value,prompt:f.prompt.value,imageUrl:f.imageUrl.value||null,duration:Number(f.duration.value),resolution:f.resolution.value});f.reset();renders();}catch(err){toast(err.message);}};
 $('#importsb').onsubmit=async e=>{e.preventDefault();let packet;try{packet=JSON.parse(e.target.packet.value);}catch{return toast('That is not valid JSON.');}try{const {renders:made}=await api('/api/renders/import',{packet});toast(`Added ${made.length} scene(s). Run checks on each.`);renders();}catch(err){toast(err.message);}};
 document.querySelectorAll('[data-check]').forEach(b=>b.onclick=async()=>{b.disabled=true;b.textContent='Checking';try{await api(`/api/renders/${b.dataset.check}/check`,{});}catch(err){toast(err.message);}renders();});
 document.querySelectorAll('[data-approve]').forEach(b=>b.onclick=async()=>{if(!confirm(`Spend about $${b.dataset.est} on Higgsfield for this shot?`))return;try{await api(`/api/renders/${b.dataset.approve}/approve`,{estimate:b.dataset.est});toast('Submitted to Higgsfield. It pops up for review when done.');}catch(err){toast(err.message);}renders();});
 document.querySelectorAll('[data-cancel]').forEach(b=>b.onclick=async()=>{try{await api(`/api/renders/${b.dataset.cancel}/cancel`,{});}catch(err){toast(err.message);}renders();});
 document.querySelectorAll('[data-revise]').forEach(b=>b.onclick=async()=>{try{await api(`/api/renders/${b.dataset.revise}/revise`,{});toast('Queued a revised draft with your notes. Run checks on it.');}catch(err){toast(err.message);}renders();});
 bindReviews(()=>renders());
}
const boardStatus={draft:['Needs checks','s-idle'],checking:['Checking','s-run'],checks_failed:['Checks failed','s-bad'],checks_passed:['Ready for your approval','s-wait'],approved:['Approved, in Renders','s-ok']};
function checkList(checks){const low=Math.min(...checks.results.map(x=>x.score));return `<details ${checks.passed?'':'open'}><summary class="mono">${checks.passed?'pass':'fail'} · lowest ${low} · $${checks.cost.toFixed(4)}</summary>${checks.results.map(x=>`<div style="margin:8px 0"><b>${esc(x.name)}</b> <span class="mono ${x.score>=85?'s-ok':'s-bad'}">${x.score}</span><div class="muted" style="font-size:11.5px">${esc(x.summary)}</div>${x.issues.map(i=>`<div style="font-size:11.5px" class="${i.severity==='minor'?'faint':'s-bad'}">${esc(i.severity)}: ${esc(i.evidence)} → ${esc(i.fix)}</div>`).join('')}</div>`).join('')}</details>`;}
function boardCard(s){
 const p=s.plan,st=boardStatus[s.status]||[s.status,'s-idle'];
 return `<div class="card"><div class="head"><div style="min-width:0"><div class="meta" style="margin-bottom:4px">${pill(st)}<span class="mono">v${s.version}</span><span>${p.durationSeconds}s · ${p.shots.length} shots</span><span class="mono">${money(s.cost_usd)}</span><span>${ago(s.created_at)}</span></div><h2>${esc(s.title)}</h2></div><div class="right">${s.status!=='approved'?`<button class="btn sm" data-bcheck="${s.id}">Run checkers</button>`:''}${s.status==='checks_passed'?`<button class="btn sm go" data-bapprove="${s.id}">Approve storyboard</button>`:''}${s.status==='approved'?`<a class="btn sm" href="#/renders">Open renders</a>`:''}</div></div>
 <div class="body"><div class="meta" style="margin-bottom:10px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px 16px"><span><b class="muted">Character</b> ${esc(p.identity)}</span><span><b class="muted">Wardrobe</b> ${esc(p.wardrobe)}</span><span><b class="muted">Environment</b> ${esc(p.environment)}</span><span><b class="muted">Voice</b> ${esc(p.voice)}</span></div>
 <table class="checks"><thead><tr><th>Shot</th><th>Sec</th><th>Camera</th><th>Action</th><th>Dialogue</th><th>Audio</th></tr></thead><tbody>${p.shots.map(x=>`<tr><td class="mono">${esc(x.id)}</td><td class="mono">${x.start}-${x.start+x.duration}</td><td>${esc(x.camera)}</td><td>${esc(x.action)}</td><td>${x.dialogue?`"${esc(x.dialogue)}"`:'<span class="faint">silent</span>'}</td><td class="muted">${esc(x.audio)}</td></tr>`).join('')}</tbody></table>
 ${s.checks?`<div style="margin-top:12px">${checkList(s.checks)}</div>`:''}
 ${s.status!=='approved'?`<form class="steer" data-brevise="${s.id}" style="padding:12px 0 0;border:0"><input type="text" name="note" placeholder="Optional note for the revision, e.g. make the hook land in the first 2 seconds"><button class="btn" type="submit">Fix with checker notes</button></form>`:''}</div></div>`;
}
async function storyboards(){
 const {storyboards:list}=await api('/api/storyboards');
 const field=(n,l,ph,area)=>`<label>${l}</label>${area?`<textarea name="${n}" rows="2" placeholder="${esc(ph)}"></textarea>`:`<input type="text" name="${n}" placeholder="${esc(ph)}">`}`;
 $('#view').innerHTML=`<div class="grid split"><div class="card" style="align-self:start"><div class="head"><h2>Draft a storyboard</h2></div><form class="body" id="newboard">${field('product','Product or brand','Mint Labs graphic tee drop')}${field('audience','Audience','Gamers who grew up on PS2 era games')}${field('idea','Video idea or hook','Character reacts to the shirt selling out like a boss fight win',true)}${field('offer','Offer or call to action (optional)','Link in bio')}<label>Length</label><select name="length"><option value="15">15 seconds</option><option value="5">5 seconds</option><option value="30">30 seconds</option></select><details style="margin-top:12px"><summary class="muted">Lock the character (optional)</summary>${field('identity','Identity','Face, age, hair, build',true)}${field('wardrobe','Wardrobe','Exact outfit')}${field('environment','Environment','Location and lighting')}${field('voice','Voice','Tone and delivery')}</details><p><button class="btn go" type="submit">Draft storyboard</button></p><div class="hint">Sonnet 5.5 drafts it, seven Haiku checkers grade it, and you approve it. Approved shots go to Renders, where each shot still needs its own checks and your spend approval.</div></form></div>
 <div class="grid" style="align-content:start">${list.map(boardCard).join('')||'<div class="card"><div class="empty">No storyboards yet.</div></div>'}</div></div>`;
 $('#newboard').onsubmit=async e=>{e.preventDefault();const b=e.target.querySelector('button[type=submit]');b.disabled=true;b.textContent='Drafting, about 30 seconds';try{await api('/api/storyboards',Object.fromEntries(new FormData(e.target)));toast('Storyboard drafted. Run the checkers next.');storyboards();}catch(err){toast(err.message);b.disabled=false;b.textContent='Draft storyboard';}};
 document.querySelectorAll('[data-bcheck]').forEach(b=>b.onclick=async()=>{b.disabled=true;b.textContent='Checking';try{await api(`/api/storyboards/${b.dataset.bcheck}/check`,{});}catch(err){toast(err.message);}storyboards();});
 document.querySelectorAll('[data-bapprove]').forEach(b=>b.onclick=async()=>{try{const {renders:made}=await api(`/api/storyboards/${b.dataset.bapprove}/approve`,{});toast(`Approved. ${made.length} shots added to Renders.`);}catch(err){toast(err.message);}storyboards();});
 document.querySelectorAll('[data-brevise]').forEach(f=>f.onsubmit=async e=>{e.preventDefault();const b=f.querySelector('button');b.disabled=true;b.textContent='Revising';try{await api(`/api/storyboards/${f.dataset.brevise}/revise`,{note:f.note.value});toast('Revised version added. Run the checkers on it.');}catch(err){toast(err.message);}storyboards();});
}

async function settings(){
 await loadState();const c=state.config,p=c.profile;
 const row=(k,v)=>`<tr><td class="faint">${k}</td><td>${esc(v)}</td></tr>`;
 $('#view').innerHTML=`<div class="grid split"><div class="card" style="align-self:start"><div class="head"><h2>Integrations</h2></div><table><tbody>${row('Brain',c.brain)}${row('Planner and writer',c.models.main)}${row('Grader and checkers',c.models.grader)}${row('Exa',c.exa==='rest'?'Paid REST API':'Free MCP')}${row('Site visits',c.sites==='solari'?'Solari cloud browser':'Plain fetch (add SOLARI_API_KEY)')}${row('Gmail drafts',c.gmail||'Off')}${row('Higgsfield',c.higgsfield?'Connected':'Off (add HF_CREDENTIALS)')}${row('Sending email','Never. Drafts only.')}</tbody></table></div>
 <div class="card"><div class="head"><h2>Sender profile</h2><div class="right"><span class="faint">Used for every draft</span></div></div><form class="body" id="profile">${[['senderName','Name'],['company','Company'],['senderFact','True fact about you'],['offer','Offer'],['cta','Call to action'],['rules','Writing rules']].map(([k,l])=>`<label>${l}</label>${k==='senderName'||k==='company'?`<input type="text" name="${k}" value="${esc(p[k])}">`:`<textarea name="${k}" rows="3">${esc(p[k])}</textarea>`}`).join('')}<p><button class="btn go" type="submit">Save profile</button></p></form></div></div>`;
 $('#profile').onsubmit=async e=>{e.preventDefault();try{await api('/api/profile',Object.fromEntries(new FormData(e.target)));toast('Profile saved');}catch(err){toast(err.message);}};
}

const views={home,tasks,leads,drafts,storyboards,renders,settings};
async function route(){
 const [name,arg]=location.hash.slice(2).split('/');
 try{await loadState();await (views[name]||home)(arg?Number(arg):undefined);}catch(err){$('#view').innerHTML=`<div class="card"><div class="empty">${esc(err.message)}</div></div>`;}
 renderTop();
}
window.addEventListener('hashchange',route);
route().then(()=>api('/api/renders')).then(({renders})=>renders.filter(r=>r.review==='pending').slice(0,2).forEach(popReview)).catch(()=>{});

let refreshTimer;
const softRefresh=fn=>{clearTimeout(refreshTimer);refreshTimer=setTimeout(fn,400);};
const stream=new EventSource('/api/stream');
stream.onmessage=msg=>{
 const change=JSON.parse(msg.data);
 if(change.kind==='event'&&state.mission&&change.event.task_id===state.mission.task.id&&tab()==='tasks'){
  state.mission.events.push(change.event);const c=$('#console');if(c){const stick=c.scrollTop+c.clientHeight>=c.scrollHeight-30;c.insertAdjacentHTML('beforeend',consoleRow(change.event));if(stick)c.scrollTop=c.scrollHeight;}
 }
 if(change.kind==='lead'&&tab()==='tasks'&&state.mission&&change.lead.task_id===state.mission.task.id){
  const table=$('#leadtable tbody');if(table){const row=table.querySelector(`tr[data-id="${change.lead.id}"]`);const html=leadRow(change.lead);if(row)row.outerHTML=html;else{table.querySelector('.empty')?.closest('tr')?.remove();table.insertAdjacentHTML('beforeend',html);}bindLeadTable();}
 }
 if(change.kind==='task'){const i=state.tasks.findIndex(t=>t.id===change.task.id);if(i<0)softRefresh(route);else if(tab()==='tasks'&&state.mission?.task.id===change.task.id)softRefresh(route);}
 if(change.kind==='event'&&change.event.type==='draft'&&tab()==='home')softRefresh(route);
 if(change.kind==='storyboard'&&tab()==='storyboards')softRefresh(route);
 if(change.kind==='render'){if(change.render.review==='pending')popReview(change.render);if(['renders','home'].includes(tab()))softRefresh(route);else loadState().catch(()=>{});}
};
