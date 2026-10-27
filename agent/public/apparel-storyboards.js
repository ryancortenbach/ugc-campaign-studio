import {categories,suggestBoards,reviewLocalPlan,basePrompt,swapPrompt,imageShotRequest,planningSystemPrompt} from './apparel-planner.js';
import {mergeStoryboardResearch} from './storyboard-merge.js';

function createController(){
const pendingUploads=new Set();
const stillSelections=new WeakMap();
let esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const baseKey='mintlabs.apparel-storyboards.v1';
let key=baseKey,loadedKey=null,workspaceContext=null;
const roles=[['character','Character','Face, hair and body identity'],['apparel','Apparel','Front and side product images'],['setting','Setting','World, layout and lighting'],['pose','Pose / angle','Composition reference only']];
let research,state,root,storageError='',referenceRole='character',pickerOpen=false,activeShot=0,uploading=false;
const save=()=>{
 for(const p of state.plans||[]){p.localReview=reviewLocalPlan(p);p.basePrompt=basePrompt(p);p.swapPrompt=swapPrompt(p);}
 const payload=structuredClone(state),context=workspaceContext,host=root;
 let cached=true;
 try{localStorage.setItem(key,JSON.stringify(context?{lab:payload,baseRevision:context.revision,dirty:true}:payload));if(!context)storageError='';}catch{cached=false;storageError=context?'Could not cache this draft locally. Server saving will still be attempted.':'Could not save this draft locally. Keep this page open and retry.';}
 if(!context)return Promise.resolve(cached);
 context.pendingSaves=(context.pendingSaves||0)+1;
 context.recoveredDirty=false;
 context.queue=context.queue.then(async()=>{
  if(context.conflict)throw Error('Reload this task before saving more changes. Your local draft is retained.');
  const response=await fetch(`/api/tasks/${context.taskId}/storyboard`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:context.revision,lab:payload})});
  const data=await response.json();if(!response.ok){
   if(response.status===409){
    context.conflict=true;context.serverVerified=false;
    const latestResponse=await fetch(`/api/tasks/${context.taskId}/storyboard`);
    if(latestResponse.ok){const latest=await latestResponse.json();context.serverLab=structuredClone(latest.workspace.lab);context.revision=latest.workspace.revision;context.serverVerified=true;}
    storageError='A newer server version exists. Your local changes are retained. Choose which draft to keep.';render();
   }
   throw Error(data.error||'Could not save this task storyboard.');
  }
  context.revision=data.workspace.revision;context.lastError=null;
  context.serverLab=structuredClone(payload);
  try{const cached=JSON.parse(localStorage.getItem(key)||'null');if(cached?.dirty&&JSON.stringify(cached.lab)===JSON.stringify(payload))localStorage.removeItem(key);}catch{}
  if(root===host){say(`Saved to this brand task, revision ${context.revision}. No paid request.`);context.onSaved?.(data.workspace);}
 }).catch(error=>{if(root===host)say(error.message,true);context.lastError=error;}).finally(()=>{context.pendingSaves--;if(!context.pendingSaves&&context.pendingRemote)refreshRemote(context.pendingRemote);});
 return context.queue;
};
const say=(message,error=false)=>{const n=root?.querySelector('[data-ap-message]');if(n){n.textContent=message;n.classList.toggle('ap-error',error);}};
const current=()=>state.plans[state.selected]||state.plans[0];
function refreshRemote(next){
 const context=workspaceContext;if(!context||next.revision<=context.revision)return false;
 if(context.pendingSaves||pendingUploads.size||context.conflict||context.recoveredDirty){context.pendingRemote=next;return false;}
 const previousRefs=JSON.stringify(state.refs);state=mergeStoryboardResearch(context.serverLab,state,next.lab);context.revision=next.revision;context.serverLab=structuredClone(next.lab);context.pendingRemote=null;
 if(previousRefs!==JSON.stringify(state.refs))for(const plan of state.plans)delete plan.imageRequests;
 for(const p of state.plans||[]){p.localReview=reviewLocalPlan(p);p.basePrompt=basePrompt(p);p.swapPrompt=swapPrompt(p);}
 const focused=root.contains(document.activeElement)&&document.activeElement.matches('textarea,input,select');
 if(focused){const repaint=()=>queueMicrotask(()=>{if(!root.contains(document.activeElement)||!document.activeElement.matches('textarea,input,select')){root.removeEventListener('focusout',repaint);if(root.isConnected)render();}});root.addEventListener('focusout',repaint);}else render();
 context.onSaved?.(next);return true;
}
function snapshot(){const p=current();if(p)state.history.unshift({at:new Date().toISOString(),plan:structuredClone(p),refs:structuredClone(state.refs)});state.history=state.history.slice(0,12);}
function sketch(shot){
 const close=shot.sketch?.angle===2,three=shot.sketch?.angle===1;
 return `<svg viewBox="0 0 300 190" role="img" aria-label="Camera composition sketch, not an ImageGen render"><g fill="none" stroke="var(--line2)" stroke-width="1"><path d="M0 143h300M34 16v127M266 16v127M34 70h232"/><path d="M34 16h232v127H34z"/></g><g transform="translate(${three?164:150} ${close?35:28}) scale(${close?1.25:.95} 1)"><ellipse cy="22" rx="19" ry="24" fill="var(--muted)"/><path d="M-18 46-43 58-51 113-31 119-22 77-22 141h44V77l9 42 20-6-8-55-25-12Z" fill="var(--panel)" stroke="var(--muted)" stroke-width="1.3"/><path d="M-19 47q19 17 38 0M0 60v78" fill="none" stroke="var(--muted)"/><path d="M-22 140-27 162M22 140l5 22" stroke="var(--muted)" stroke-width="15"/></g><g fill="var(--green)" font-size="9" font-family="var(--mono)"><text x="10" y="17">${['FRONT / WIDE','3/4 / MEDIUM','FRONT / PAYOFF'][shot.sketch?.angle||0]}</text></g><path d="M12 35V25h10M278 25h10v10M12 157v10h10M278 167h10v-10" fill="none" stroke="var(--green)" opacity=".6"/></svg>`;
}
function refTray(){
 const selected=state.refs.filter(r=>r.role===referenceRole);
 return `<details class="ap-assets" ${pickerOpen?'open':''} data-ap-assets><summary><span class="ap-assets-stack">${state.refs.slice(0,3).map(r=>`<img src="${esc(r.url)}" alt="">`).join('')}</span><span>References</span><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6 8 4 4 4-4"/></svg></summary><div class="ap-assets-menu"><div class="ap-assets-tabs" role="tablist" aria-label="Reference type">${roles.map(([role,label])=>`<button type="button" role="tab" data-ap-role="${role}" aria-selected="${role===referenceRole}">${label}</button>`).join('')}</div><div class="ap-assets-content" data-ap-drop="${referenceRole}" role="tabpanel" aria-label="${esc(roles.find(r=>r[0]===referenceRole)[1])} references">${selected.length?`<div class="ap-assets-selected">${selected.map(r=>`<div class="ap-asset"><img src="${esc(r.url)}" alt="${esc(r.name)}"><button type="button" data-ap-remove="${esc(r.id)}" aria-label="Remove ${esc(r.name)}">×</button></div>`).join('')}</div>`:''}<button type="button" class="btn sm" data-ap-upload="${referenceRole}">Upload image</button><input type="file" data-ap-file="${referenceRole}" accept="image/png,image/jpeg,image/webp" multiple>${referenceRole==='character'?`<div class="ap-character-library">${research.characters.map(c=>`<button type="button" data-ap-character="${esc(c.id)}" aria-label="Use ${esc(c.name)}" aria-pressed="${selected.some(r=>r.id===c.id)}"><img src="${esc(c.url)}" alt="${esc(c.name)}"><span>${esc(c.name)}</span></button>`).join('')}</div>`:''}</div></div></details>`;
}
function invalidateImageRequests(){state.plans.forEach(p=>{delete p.imageRequests;});}
function shotCard(p,s,i){
 const still=p.stills?.[s.id],source=research.sourceVisuals?.[i],visual=still||source,staged=Boolean(p.imageRequests?.[s.id]);
 return `<article class="ap-shot" role="group" aria-roledescription="slide" aria-label="Shot ${i+1} of ${p.shots.length}"><div class="ap-shot-visual">${visual?`<img src="${esc(visual.url)}" alt="${esc(still?'Imported storyboard still':source.label)}">`:sketch(s)}</div><div class="ap-shot-body"><p class="ap-line">“${esc(s.dialogue)}”</p><div class="ap-shot-actions"><button type="button" class="btn sm" data-ap-image="${i}" aria-pressed="${staged}" title="Stage or remove a request. No generation is submitted.">${staged?'Draft staged':'ImageGen draft'}</button><button type="button" class="ap-text-button" data-ap-still="${i}">+ Still</button><details class="ap-edit-shot"><summary>Edit</summary><div>${['camera','action','dialogue'].map(field=>`<label>${field[0].toUpperCase()+field.slice(1)}<textarea data-ap-shot="${i}" data-ap-field="${field}" rows="3">${esc(s[field])}</textarea></label>`).join('')}</div></details><input type="file" data-ap-still-file="${i}" accept="image/png,image/jpeg,image/webp"></div></div></article>`;
}
function render(){
 if(!root)return;const p=current();p.localReview=reviewLocalPlan(p);p.basePrompt=basePrompt(p);p.swapPrompt=swapPrompt(p);
 root.innerHTML=`<div class="ap-heading"><h2>Storyboard lab</h2><div class="ap-chip-row"><button type="button" class="btn sm" data-ap-save>Save version</button><select class="ap-history" data-ap-history aria-label="Saved storyboard versions"><option value="">Versions (${state.history.length})</option>${state.history.map((h,i)=>`<option value="${i}">${esc(h.plan.title)} · ${new Date(h.at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</option>`).join('')}</select></div></div><div class="ap-reference-bar">${refTray()}</div><div class="ap-carousel" tabindex="0" role="region" aria-roledescription="carousel" aria-label="Storyboard shots. Swipe or use left and right arrow keys."><div class="ap-shots">${p.shots.map((s,i)=>shotCard(p,s,i)).join('')}</div></div><div class="ap-carousel-nav"><div class="ap-dots">${p.shots.map((_,i)=>`<button type="button" data-ap-goto="${i}" aria-label="Go to shot ${i+1}" aria-current="${i===activeShot}"></button>`).join('')}</div></div><div class="ap-message" data-ap-message>${esc(storageError)}</div>${workspaceContext?.conflict&&workspaceContext.serverVerified?'<div class="ap-chip-row"><button class="btn sm" type="button" data-ap-use-server>Use saved version</button><button class="btn sm" type="button" data-ap-use-local>Keep recovered draft</button></div>':''}`;
 bind();
 const track=root.querySelector('.ap-carousel'),slides=[...root.querySelectorAll('.ap-shot')],dots=[...root.querySelectorAll('[data-ap-goto]')];let at=Math.min(activeShot,slides.length-1);
 const go=i=>{at=(i+slides.length)%slides.length;track.scrollTo({left:slides[at].offsetLeft-slides[0].offsetLeft,behavior:'smooth'});};
 track.scrollLeft=slides[at].offsetLeft-slides[0].offsetLeft;
 dots.forEach((b,i)=>b.onclick=()=>go(i));
 track.onkeydown=e=>{if(e.target!==track)return;if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();go(at+(e.key==='ArrowRight'?1:-1));}};
 track.onscroll=()=>{at=slides.reduce((best,slide,i)=>Math.abs(slide.offsetLeft-slides[0].offsetLeft-track.scrollLeft)<Math.abs(slides[best].offsetLeft-slides[0].offsetLeft-track.scrollLeft)?i:best,0);activeShot=at;dots.forEach((b,i)=>b.setAttribute('aria-current',String(i===at)));};
}
function showOutput(title,value,note){const panel=root.querySelector('[data-ap-output]');panel.hidden=false;panel.innerHTML=`<div class="ap-heading"><h2>${esc(title)}</h2><button type="button" class="btn sm" data-ap-close>Close</button></div><p class="hint">${esc(note)}</p><textarea readonly aria-label="${esc(title)}" rows="12">${esc(value)}</textarea>`;panel.querySelector('[data-ap-close]').onclick=()=>panel.hidden=true;panel.querySelector('textarea').onclick=e=>e.currentTarget.select();panel.scrollIntoView({block:'nearest',behavior:'smooth'});}
async function uploadFile(file){
 if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw Error('Choose a PNG, JPG or WebP image.');
 if(file.size>5*1024*1024)throw Error('Each reference can be up to 5 MB.');
 const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=reject;reader.readAsDataURL(file);});
 const r=await fetch('/api/uploads',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:file.name,type:file.type,data})});const d=await r.json();if(!r.ok)throw Error(d.error||'Could not save this reference.');return {id:d.upload.id,name:d.upload.name,url:'/uploads/'+encodeURIComponent(d.upload.file),origin:'local_upload'};
}
function upload(file){const pending=uploadFile(file);pendingUploads.add(pending);pending.then(()=>pendingUploads.delete(pending),()=>pendingUploads.delete(pending));return pending;}
async function addFiles(role,files){
 if(uploading||!files.length)return;
 if(state.refs.length+files.length>16){say('Use up to 16 reference images.',true);return;}
 uploading=true;snapshot();render();let message='Reference saved.',failed=false;
 try{for(const file of files){if(state.refs.length>=16)throw Error('Use up to 16 reference images.');const asset=await upload(file);state.refs.push({...asset,role});invalidateImageRequests();save();}}
 catch(e){message=e.message;failed=true;}
 finally{uploading=false;render();say(message,failed);}
}

function bind(){
 const serverButton=root.querySelector('[data-ap-use-server]');if(serverButton)serverButton.onclick=()=>{const local=structuredClone(state);state=structuredClone(workspaceContext.serverLab);state.history.unshift({at:new Date().toISOString(),plan:local.plans[local.selected],refs:local.refs});state.history=state.history.slice(0,12);workspaceContext.conflict=false;storageError='';save();render();};
 const localButton=root.querySelector('[data-ap-use-local]');if(localButton)localButton.onclick=()=>{const server=workspaceContext.serverLab;state.history.unshift({at:new Date().toISOString(),plan:server.plans[server.selected],refs:server.refs});state.history=state.history.slice(0,12);workspaceContext.conflict=false;storageError='';save();render();};
 if(uploading){root.querySelectorAll('[data-ap-upload],[data-ap-file],[data-ap-remove],[data-ap-character],[data-ap-history],[data-ap-save]').forEach(n=>{n.disabled=true;});const b=root.querySelector('[data-ap-upload]');if(b)b.textContent='Saving...';}
 const form=root.querySelector('[data-ap-form]');if(form)form.onsubmit=e=>{e.preventDefault();snapshot();const f=new FormData(e.currentTarget);state.options={...state.options,category:f.get('category'),tone:f.get('tone'),audience:f.get('audience'),variant:(state.options.variant||0)+1};const c=state.refs.find(r=>r.role==='character');if(c?.identity)state.options.identity=c.identity;state.plans=suggestBoards(state.options,research);state.selected=0;save();render();say('Three local proposals ready. Previous direction retained in Saved versions.');};
 root.querySelectorAll('[data-ap-select]').forEach(b=>b.onclick=()=>{state.selected=Number(b.dataset.apSelect);save();render();});
 root.querySelectorAll('[data-ap-upload]').forEach(b=>b.onclick=()=>root.querySelector(`[data-ap-file="${b.dataset.apUpload}"]`).click());
 root.querySelectorAll('[data-ap-file]').forEach(input=>input.onchange=()=>addFiles(input.dataset.apFile,[...input.files]));
 root.querySelectorAll('[data-ap-drop]').forEach(drop=>{drop.ondragover=e=>e.preventDefault();drop.ondrop=e=>{e.preventDefault();addFiles(drop.dataset.apDrop,[...e.dataTransfer.files]);};});
 root.querySelectorAll('[data-ap-remove]').forEach(b=>b.onclick=()=>{if(uploading)return;state.refs=state.refs.filter(r=>String(r.id)!==b.dataset.apRemove);invalidateImageRequests();save();render();});
 const picker=root.querySelector('[data-ap-assets]');picker.ontoggle=()=>{pickerOpen=picker.open;};picker.onkeydown=e=>{if(e.key==='Escape'){picker.open=false;pickerOpen=false;picker.querySelector('summary').focus();}};
 root.querySelectorAll('[data-ap-role]').forEach(b=>b.onclick=()=>{referenceRole=b.dataset.apRole;pickerOpen=true;render();root.querySelector(`[data-ap-role="${referenceRole}"]`)?.focus();});
 root.querySelectorAll('[data-ap-character]').forEach(b=>b.onclick=()=>{if(uploading)return;const c=research.characters.find(c=>c.id===b.dataset.apCharacter);if(!c)return;snapshot();state.refs=[...state.refs.filter(r=>r.role!=='character'),{...c,role:'character',origin:'existing_character'}];state.options.identity=c.identity;state.plans.forEach(p=>p.identity=c.identity);invalidateImageRequests();save();render();});
 root.querySelectorAll('[data-ap-shot]').forEach(input=>input.oninput=()=>{current().shots[Number(input.dataset.apShot)][input.dataset.apField]=input.value.replaceAll('\u2014',',');delete current().imageRequests?.[current().shots[Number(input.dataset.apShot)].id];const button=root.querySelector(`[data-ap-image="${input.dataset.apShot}"]`);if(button){button.textContent='ImageGen draft';button.setAttribute('aria-pressed','false');}if(input.dataset.apField==='dialogue')input.closest('.ap-shot-body').querySelector('.ap-line').textContent='“'+input.value+'”';save();});
 root.querySelectorAll('[data-ap-image]').forEach(b=>b.onclick=()=>{try{const p=current(),s=p.shots[Number(b.dataset.apImage)];p.imageRequests??={};if(p.imageRequests[s.id]){delete p.imageRequests[s.id];b.textContent='ImageGen draft';b.setAttribute('aria-pressed','false');}else{p.imageRequests[s.id]=imageShotRequest(p,s,state.refs);b.textContent='Draft staged';b.setAttribute('aria-pressed','true');}save();}catch(e){say(e.message,true);}});
 root.querySelectorAll('[data-ap-still]').forEach(b=>b.onclick=()=>root.querySelector(`[data-ap-still-file="${b.dataset.apStill}"]`).click());
 root.querySelectorAll('[data-ap-still-file]').forEach(input=>input.onchange=async()=>{
  const file=input.files[0];if(!file)return;
  const p=current(),s=p.shots[Number(input.dataset.apStillFile)],selection={};stillSelections.set(s,selection);
  const selected=()=>stillSelections.get(s)===selection&&state.plans.includes(p)&&p.shots.includes(s);
  try{snapshot();const asset=await upload(file);if(!selected())return;p.stills??={};p.stills[s.id]=asset;save();render();say('Finished still imported and linked to this shot.');}
  catch(e){if(selected())say(e.message,true);}
 });
 root.querySelector('[data-ap-save]').onclick=async()=>{snapshot();const pending=save();render();say('Saving storyboard version...');const saved=await pending;if(!workspaceContext)say(saved?'Storyboard version saved locally.':storageError,!saved);};
 root.querySelector('[data-ap-history]').onchange=e=>{if(uploading||e.target.value==='')return;const old=structuredClone(state.history[Number(e.target.value)]);snapshot();state.plans[state.selected]=old.plan;state.refs=old.refs;save();render();say('Restored the selected version. Previous work retained.');};
 const system=root.querySelector('[data-ap-system]');if(system)system.onclick=()=>showOutput('Storyboard agent prompt',planningSystemPrompt(research),'Research-grounded instructions for a future model-assisted planner. Viewing this prompt makes no paid call.');
 const packet=root.querySelector('[data-ap-packet]');if(packet)packet.onclick=()=>{const p=current();p.localReview=reviewLocalPlan(p);p.basePrompt=basePrompt(p);p.swapPrompt=swapPrompt(p);showOutput('Planning packet',JSON.stringify({storyboard:p,references:state.refs,imageRequests:p.shots.map(s=>{try{return imageShotRequest(p,s,state.refs);}catch(e){return {shot:s.id,status:'missing_reference',error:e.message};}}),researchRuleIds:p.sourceRuleIds,spendApproved:false,submitted:false},null,2),'Includes the base-film prompt, reference roles, per-shot ImageGen requests and apparel-swap prompt. Select and copy to keep a portable packet.');};
}
async function mount(helpers){
 root=helpers.view;if(helpers.esc)esc=helpers.esc;root.classList.remove('card');root.classList.add('ap-workbench');
 const nextKey=helpers.workspace?`${baseKey}.task.${helpers.workspace.task.id}`:baseKey;
 const response=research?null:await fetch('/apparel-storyboard-research-v1.json');
 if(response){if(!response.ok)throw Error('Storyboard research is unavailable.');research=await response.json();}
 if(!helpers.workspace&&loadedKey===nextKey&&state){render();return;}
 key=nextKey;loadedKey=nextKey;storageError='';workspaceContext=null;state=null;
 if(helpers.workspace){
  state=structuredClone(helpers.workspace.lab);
  workspaceContext={taskId:helpers.workspace.task.id,revision:helpers.workspace.revision,queue:Promise.resolve(),conflict:false,lastError:null,serverVerified:true,serverLab:structuredClone(helpers.workspace.lab),recoveredDirty:false,onSaved:helpers.onSaved};
  try{
   const cached=JSON.parse(localStorage.getItem(key)||'null');
   if(cached?.dirty===false)localStorage.removeItem(key);
   if(!helpers.ignoreCache&&cached?.dirty&&cached.lab?.plans?.length){
    state=cached.lab;workspaceContext.recoveredDirty=true;workspaceContext.serverLab=structuredClone(helpers.workspace.lab);
    workspaceContext.conflict=cached.baseRevision!==helpers.workspace.revision;
    storageError=workspaceContext.conflict?'Recovered local changes conflict with a newer saved version. Choose which draft to keep.':'Recovered unsaved local changes for this brand. Save a version to retry.';
   }
  }catch{}

 }else{
  try{state=JSON.parse(localStorage.getItem(key)||'null');}catch{}
  if(!state||!Array.isArray(state.plans)||!Array.isArray(state.refs)||!Array.isArray(state.history)){
   const hero=research.characters[0];state={options:{category:'Hoodie',tone:'Dry confidence',audience:'PS2 nostalgia, gaming and streetwear',variant:0,identity:hero.identity},selected:0,refs:[{...hero,role:'character',origin:'existing_character'}],history:[]};state.plans=suggestBoards(state.options,research);save();
  }
 }
 render();
 return {refresh:refreshRemote,flush:async()=>{
  while(pendingUploads.size){const results=await Promise.allSettled([...pendingUploads]);const failure=results.find(r=>r.status==='rejected');if(failure)throw failure.reason;}
  if(workspaceContext?.conflict)throw Error('Resolve the recovered or conflicting draft before opening another revision.');
  if(workspaceContext?.recoveredDirty)save();
  await workspaceContext?.queue;if(workspaceContext?.lastError)throw workspaceContext.lastError;
 }};
}

return {mount};
}
export async function apparelView(helpers){return createController().mount(helpers);}
