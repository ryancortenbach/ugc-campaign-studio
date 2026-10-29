// Voices page: design a voice from a description, listen, run the measured checks, then save it to ElevenLabs.
// Designing and transcribing spend ElevenLabs credits, so each one runs only from a button click here.
const status={needs_checks:['Needs checks','s-wait'],checking:['Checking','s-run'],checks_failed:['Checks failed','s-bad'],checks_passed:['Passed','s-ok'],saved:['Saved','s-ok']};
const when=iso=>new Date(iso).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
const num=n=>Number(n||0).toLocaleString('en-US');
const mounts=new WeakMap();

export async function voicesView({view,api,esc,toast,sbadge,svg,isCurrent=()=>true,readDraft=()=>null}){
 if(!isCurrent())return;
 const mount={};mounts.set(view,mount);
 const alive=()=>isCurrent()&&mounts.get(view)===mount;
 const data=await api('/api/voices');
 if(!alive())return;
 const {voices,enabled,subscription:sub,error}=data;
 const boards=await api('/api/storyboards').then(r=>r.storyboards.filter(s=>s.plan?.voice)).catch(()=>[]);
 if(!alive())return;
 const again=(readDraft=()=>null)=>{if(alive())return voicesView({view,api,esc,toast,sbadge,svg,isCurrent,readDraft});};

 const plan=sub?`<div class="vplan"><b>${esc(String(sub.tier).replace(/^./,c=>c.toUpperCase()))} plan</b><span>${num(sub.left)} of ${num(sub.limit)} characters left${sub.resetAt?`, resets ${esc(new Date(sub.resetAt).toLocaleDateString('en-US',{month:'short',day:'numeric'}))}`:''}</span><span>${num(sub.voiceSlotsUsed)} of ${num(sub.voiceLimit)} voice slots used</span></div>`
  :`<div class="hint">${enabled?esc(error?`Could not reach ElevenLabs: ${error}`:'Plan details unavailable.'):'Add ELEVENLABS_API_KEY or put the key in ~/.elevenlabs/key to design voices.'}</div>`;

 const checkBox=v=>{
  const c=v.checks;if(!c)return '';
  const m=c.measured||{},pace=m.statedPace?` (spec says ${esc(m.statedPace.text)})`:'';
  const low=Math.min(...c.results.map(x=>x.score)),bad=c.results.filter(x=>x.score<85).length;
  return `<details class="cbox"><summary>${c.passed?`All ${c.results.length} checks passed`:`${bad} of ${c.results.length} checks below 85`} <span class="mono faint">lowest ${low}</span></summary>
   <div class="vmeasure"><span class="chip mono">word accuracy ${esc(m.wordAccuracy)}%</span><span class="chip mono">${m.wps==null?'pace unknown':`${esc(m.wps)} words per second`}</span>${m.pauses?`<span class="chip mono">${esc(m.pauses)} long pause${m.pauses===1?'':'s'}</span>`:''}</div>
   ${m.wps!=null&&m.statedPace?`<div class="hint">Measured pace against the spec${pace}.</div>`:''}
   <div class="vheard"><span class="faint">Heard</span> ${c.transcript?.text?esc(c.transcript.text):'<span class="s-bad">nothing</span>'}</div>
   ${c.results.map(x=>`<div style="margin:8px 0"><b>${esc(x.name)}</b> <span class="mono ${x.score>=85?'s-ok':'s-bad'}">${x.score}</span><div class="muted" style="font-size:11.5px">${esc(x.summary)}</div>${x.issues.map(i=>`<div style="font-size:11.5px" class="${i.severity==='minor'?'faint':'s-bad'}">${esc(i.severity)}: ${esc(i.evidence)}. Fix: ${esc(i.fix)}</div>`).join('')}</div>`).join('')}
   <div class="hint">Claude cannot hear audio. These checks use the transcript, word timings and the written spec. Listen before you save.</div></details>`;
 };

 const card=v=>{
  const st=status[v.status]||[v.status,'s-idle'];
  const canCheck=enabled&&v.sample_file&&v.status!=='checking';
  const save=v.status==='saved'?`<span class="mono faint" title="ElevenLabs voice id">${esc(v.voice_id)}</span>`
   :v.status==='checks_passed'?`<button class="btn sm go" data-vsave="${v.id}">Save to my ElevenLabs voices</button>`
   :v.status==='checks_failed'?`<button class="btn sm warn" data-vsave="${v.id}" data-force="1">Save anyway</button>`
   :`<button class="btn sm" disabled title="Run the checks first">Save to my ElevenLabs voices</button>`;
  return `<div class="card vcard"><div class="head"><b>${esc(v.name)}</b><div class="right">${sbadge(st)}</div></div><div class="body">
   ${v.sample_file?`<audio controls preload="none" src="/voices/${encodeURIComponent(v.sample_file)}"></audio>`:'<div class="hint">No sample audio.</div>'}
   <div class="vline">${esc(v.line)}</div><div class="vspec muted">${esc(v.description)}</div>
   <div class="meta"><span>${esc(when(v.created_at))}</span>${v.characters?`<span class="mono">${num(v.characters)} characters used to design this set</span>`:''}${v.storyboard_id?`<span>Storyboard ${esc(v.storyboard_id)}</span>`:''}</div>
   ${checkBox(v)}
   <div class="vacts"><button class="btn sm" data-vcheck="${v.id}" ${canCheck?'':'disabled'}>${v.checks?'Rerun checks':'Run checks'}</button>${save}</div>
   ${v.checks?'':`<div class="hint">Run checks sends this sample to ElevenLabs speech to text once, then Claude grades the result. The transcript is reused on reruns.</div>`}
  </div></div>`;
 };

 // Newest design first. The three previews from one design sit together in option order.
 const groups=[];
 for(const v of voices){const key=[v.description,v.line,v.storyboard_id,v.created_at.slice(0,16)].join('|'),last=groups[groups.length-1];if(last&&last.key===key)last.items.unshift(v);else groups.push({key,items:[v]});}

 const draft=readDraft();
 view.innerHTML=`<div class="pagebar"><span class="faint">${voices.length} voice${voices.length===1?'':'s'}</span><button class="btn go sm" id="newvoicebtn" type="button">Design a voice</button></div><div class="card newshot" id="newvoicecard" hidden><div class="head"><h2>Design a voice</h2></div><form class="body" id="newvoice">
  ${plan}
  ${boards.length?`<label>Start from a storyboard voice (optional)</label><select name="storyboardId"><option value="">None</option>${boards.map(s=>`<option value="${esc(s.id)}">${esc(s.title)} v${esc(s.version)}</option>`).join('')}</select>`:''}
  <label>Describe the voice</label><textarea name="description" rows="4" placeholder="Warm woman in her twenties, American accent, relaxed and upbeat, about 150 words per minute"></textarea>
  <label>Sample line to speak <span class="faint" id="linecount">0 of 100 to 1000</span></label><textarea name="line" rows="4" placeholder="Write the exact words this character says, at least 100 characters. Use real names and brand terms so the check can hear them."></textarea>
  <p><button class="btn go" type="submit" ${enabled?'':'disabled'}>Design voices</button></p>
  <div class="vwarn">${svg('info')}<span>This uses ElevenLabs credits, one credit per character of the sample line, charged once for the three previews. Nothing runs until you click.</span></div>
 </form></div>
 <div class="stack">${groups.map(g=>g.items.map(card).join('')).join('')||'<div class="idle">No voices yet. Press Design a voice to make three previews.</div>'}</div>`;
 view.querySelector('#newvoicebtn').onclick=()=>{view.querySelector('#newvoicecard').hidden=false;view.querySelector('#newvoice textarea[name=description]').focus();};

 const form=view.querySelector('#newvoice');
 const values=()=>({description:form.description.value,line:form.line.value,storyboardId:form.storyboardId?.value||null});
 if(draft){form.description.value=draft.description;form.line.value=draft.line;if(form.storyboardId)form.storyboardId.value=draft.storyboardId||'';view.querySelector('#newvoicecard').hidden=!draft.open;}
 const count=()=>{const n=form.line.value.trim().length;view.querySelector('#linecount').textContent=`${n} of 100 to 1000`;};
 form.line.addEventListener('input',count);count();
 let filledVoice=draft?.filledVoice||'';
 form.storyboardId?.addEventListener('change',()=>{const s=boards.find(x=>String(x.id)===form.storyboardId.value);if(s&&(!form.description.value.trim()||form.description.value===filledVoice)){form.description.value=s.plan.voice;filledVoice=form.description.value;}});
 form.onsubmit=async e=>{
  e.preventDefault();
  const submitted=values(),body={...submitted,description:submitted.description.trim(),line:submitted.line.trim()};
  if(body.description.length<20||body.description.length>1000){toast('Describe the voice in 20 to 1000 characters: age, gender, accent, tone and pace.','bad');form.description.focus();return;}
  if(body.line.length<100||body.line.length>1000){toast('Write a sample line of 100 to 1000 characters. ElevenLabs needs at least 100 to design a voice.','bad');form.line.focus();return;}
  if(!window.confirm(`Design voices uses about ${body.line.length} ElevenLabs characters. Continue?`))return;
  const b=form.querySelector('button[type=submit]');b.disabled=true;b.textContent='Designing, about 20 seconds';
  try{const r=await api('/api/voices/design',body);toast('Voices designed','ok',`${r.voices.length} previews. Listen, then run checks.`);}
  catch(err){toast(err.message,'bad');b.disabled=false;b.textContent='Design voices';return;}
  if(alive()&&JSON.stringify(values())===JSON.stringify(submitted)){form.reset();view.querySelector('#newvoicecard').hidden=true;filledVoice='';}
  again(()=>({...values(),open:!form.closest('#newvoicecard').hidden,filledVoice}));
 };
 view.querySelectorAll('[data-vcheck]').forEach(b=>b.onclick=async()=>{b.disabled=true;b.textContent='Checking';try{const r=await api(`/api/voices/${b.dataset.vcheck}/check`,{});toast(r.voice.status==='checks_passed'||r.voice.checks?.passed?'Checks passed':'Checks found problems','ok');}catch(err){toast(err.message,'bad');}again();});
 view.querySelectorAll('[data-vsave]').forEach(b=>b.onclick=async()=>{
  if(b.dataset.force&&!window.confirm('The checks did not pass. Save this voice anyway?'))return;
  b.disabled=true;b.textContent='Saving';
  try{const r=await api(`/api/voices/${b.dataset.vsave}/save`,b.dataset.force?{force:true}:{});toast('Voice saved','ok',`${r.voice.name} is in your ElevenLabs voices.`);}catch(err){toast(err.message,'bad');}
  again();
 });
}
