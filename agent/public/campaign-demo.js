import {safeLogValue} from './tool-logs.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safe=url=>typeof url==='string'&&/^\/(?!\/)/.test(url)&&!/[<>"'\r\n]/.test(url)?url:'';
const logo=provider=>({'Whop MCP':'whop',Terac:'terac',Exa:'exa',Higgsfield:'higgsfield',ImageGen:'claude',Email:'gmail'})[provider];
const mounts=new WeakMap();

export function createCampaignReplay({steps,onChange,schedule=setTimeout,cancel=clearTimeout,delay=1600}){
 const state={index:-1,playing:false,notice:'',error:'',completed:false},timers=new Set();let disposed=false;
 const clear=()=>{for(const timer of timers)cancel(timer);timers.clear();};
 const emit=()=>{if(!disposed)onChange({...state});};
 const next=()=>{
  if(disposed)return;
  clear();
  const current=steps[state.index];
  if(current?.view==='sample'&&!current.output.videoUrl){state.playing=false;state.error='This brand has no saved sample yet. Choose Disobedient to continue.';emit();return;}
  if(current?.view==='rendering'&&!current.output.videoUrl){state.playing=false;state.error='The finished ad is still being prepared. Please check back shortly.';emit();return;}
  if(state.index>=steps.length-1){state.playing=false;state.completed=true;emit();return;}
  state.index++;state.error='';state.notice=steps[state.index].notification||'';
  if(['sample','final'].includes(steps[state.index].view))state.playing=false;
  if(state.index===steps.length-1)state.completed=true;
  emit();
  if(state.playing){const timer=schedule(()=>{timers.delete(timer);next();},steps[state.index].delayMs||delay);timers.add(timer);}
 };
 return {state,next,play(){if(disposed)return;state.playing=true;next();},pause(){clear();state.playing=false;emit();},reset(){clear();Object.assign(state,{index:-1,playing:false,notice:'',error:'',completed:false});emit();},dispose(){disposed=true;clear();}};
}

function video(url,label){return safe(url)?`<video controls playsinline preload="metadata" src="${esc(safe(url))}" aria-label="${esc(label)}"></video>`:'<p class="hint" role="status">This video is not available yet. No substitute is shown.</p>';}
function content(step,data){
 const out=step.output;
 if(step.view==='brands')return `<div class="ap-demo-brands-found">${data.brands.map(b=>`<article><b>${esc(b.name)}</b><p>${b.sampleReady?'Sample ready':'Research complete; sample pending'}</p></article>`).join('')}</div>`;
 if(step.view==='product')return `<img class="ap-demo-product" src="${esc(safe(out.imageUrl))}" alt="${esc(out.title||'Hoodie reference')}"><p class="hint">Official product reference.</p>`;
 if(step.view==='character')return `<div class="ap-demo-references">${[{url:out.conceptUrl,label:'PS2 character concept'},{url:out.garmentAnchorUrl,label:'Selected PS2 character and garment'}].filter(item=>safe(item.url)).map(item=>`<figure><img src="${esc(item.url)}" alt="${esc(item.label)}"><figcaption>${esc(item.label)}</figcaption></figure>`).join('')}</div>`;
 if(step.view==='sample')return `${video(out.videoUrl,'Generated outreach sample')}<p class="hint">${esc(out.durationSeconds||'')} second PS2 character sample.</p>`;
 if(step.view==='email')return `<article class="ap-demo-email"><small>Outreach</small><p>To: ${esc(step.input.recipient)}</p><b>${esc(step.input.subject)}</b><p>${esc(step.input.copy)}</p>${step.input.attachments.map(a=>`<a class="btn sm" href="${esc(safe(a.url))}" target="_blank" rel="noopener">${esc(a.title)}</a>`).join('')}</article>`;
 if(step.view==='reply')return `<article class="ap-demo-email"><small>Reply from ${esc(data.brandName)}</small><p>${esc(out.text)}</p></article>`;
 if(step.view==='checkout')return `<div class="ap-demo-payment"><small>Whop checkout</small><h3>$500.00</h3><p>PS2 character campaign ad</p><div class="ap-demo-checkout">${esc(out.displayLink)}</div></div>`;
 if(step.view==='paid')return `<div class="ap-demo-payment"><small>Payment notification</small><h3>$500.00 received</h3><p>${esc(out.buyer)} checked out.</p></div>`;
 if(step.view==='rendering')return `<div class="ap-demo-progress" role="status"><span></span><b>Preparing the finished ad</b><p>Rendering and assembling your campaign.</p></div>`;
 if(step.view==='final')return `${video(out.videoUrl,'Completed PS2 character ad')}<p>${out.videoUrl?`PS2 character ad: ${esc(out.durationSeconds)} seconds.`:'The finished clip is still pending.'}</p>`;
 if(step.view==='review')return `<div class="ap-demo-progress" role="status"><span></span><small>Terac</small><h3>Waiting for review...</h3><p>Waiting for someone to approve the sample.</p></div>`;
 if(step.view==='review-approved')return `<div class="ap-demo-payment"><small>Review notification</small><h3>Sample approved</h3><p>${esc(out.decision)}</p></div>`;
 return `<p>Task <b>#${esc(out.taskId)}</b> is ready for ${esc(out.brand)}.</p><a class="btn sm" href="#/tasks/${esc(out.taskId)}">Open task</a>`;
}
// Presentation fields are separate from the unchanged execution metadata in the API.
function presentationResult(step){
 const out=step.output;
 if(step.view==='review')return {status:out.status};
 if(step.view==='review-approved')return {decision:out.decision};
 if(step.view==='email')return {status:'Sent',attachments:step.input.attachments};
 if(step.view==='reply')return {text:out.text};
 if(step.view==='checkout')return {checkout:out.displayLink,amountUsd:step.input.amountUsd};
 if(step.view==='paid')return {buyer:out.buyer,amountUsd:out.amountUsd,status:out.status};
 return Object.fromEntries(Object.entries(out).filter(([key])=>!['note','historicalImageGenConceptUrl'].includes(key)));
}
function historyHTML(steps,index){return steps.slice(0,index+1).map((step,i)=>`<details class="ap-demo-call" data-ap-demo-call="${i}"><summary>${logo(step.provider)?`<img src="/logos/${logo(step.provider)}.png" alt="">`:''}<b>${esc(step.provider)}</b><span>${esc(step.title)}</span></summary><div><b>Input</b><pre>${esc(JSON.stringify(safeLogValue(step.input),null,2))}</pre><b>Result</b><pre>${esc(JSON.stringify(safeLogValue(presentationResult(step)),null,2))}</pre>${step.records?.length?`<details><summary>Source records (${step.records.length})</summary><pre>${esc(JSON.stringify(safeLogValue(step.records),null,2))}</pre></details>`:''}</div></details>`).join('');}

export async function mountCampaignDemo(host,{brandId='disobedient',autoPlay=false,fetch=globalThis.fetch,schedule,cancel}={}){
 mounts.get(host)?.dispose();let controller,removed=false,autoFlow=autoPlay;
 const token=Symbol('campaign-demo');host._campaignToken=token;
 const owned=()=>host.isConnected&&host._campaignToken===token;
 const view=host.ownerDocument.defaultView;
 const dispose=()=>{removed=true;controller?.dispose();observer?.disconnect();view.removeEventListener('hashchange',dispose);};
 const Observer=view.MutationObserver,observer=new Observer(()=>{if(!owned())dispose();});
 observer.observe(host.ownerDocument,{childList:true,subtree:true});view.addEventListener('hashchange',dispose);
 mounts.set(host,{dispose});host.innerHTML='<p class="hint" role="status">Loading campaign.</p>';
 let data;
 try{const response=await fetch(`/api/campaign-demo/${encodeURIComponent(brandId)}`);if(!response.ok)throw Error('Campaign unavailable');data=await response.json();}
 catch(error){if(owned())host.innerHTML=`<p class="s-bad" role="alert">${esc(error.message)}</p>`;return;}
 if(removed||!owned())return;
 const render=state=>{
  if(!owned()){dispose();return;}
  const opened=new Set([...host.querySelectorAll('[data-ap-demo-call][open]')].map(el=>el.dataset.apDemoCall));
  const step=data.steps[state.index];
  host.innerHTML=`<div class="ap-demo-root"><div class="ap-demo-header"><div><span class="chip">PS2 cutscene</span><h2>Prompt to paid campaign</h2><p class="hint">Research, create, review and deliver your campaign.</p></div><a class="btn sm" href="#/home">Back to chat</a></div><div class="seg ap-demo-switch">${data.brands.map(b=>`<button type="button" data-ap-demo-brand="${b.id}" class="${b.id===data.brandId?'on':''}">${esc(b.name)}${b.sampleReady?'':' (sample pending)'}</button>`).join('')}</div><div class="ap-demo-controls"><button type="button" class="btn go sm" data-ap-demo-play ${state.completed?'disabled':''}>${state.playing||(autoFlow&&step?.view==='sample')?'Pause':'Play'}</button><button type="button" class="btn sm" data-ap-demo-next ${state.completed?'disabled':''}>${state.index<0?'Start':'Next step'}</button><button type="button" class="btn sm" data-ap-demo-reset>Reset</button><span class="hint">${Math.max(0,state.index+1)} / ${data.steps.length}</span></div>${state.notice?`<div class="ap-demo-notification" role="status">${esc(state.notice)}</div>`:''}${state.error?`<p class="s-bad" role="alert">${esc(state.error)}</p>`:''}<div class="ap-demo-grid"><ol class="ap-demo-stages">${data.steps.map((s,i)=>`<li class="${i===state.index?'current':i<state.index?'done':''}"><span>${i+1}</span><div>${esc(s.title)}<small>${esc(s.provider)}</small></div></li>`).join('')}</ol><section class="card ap-demo-stage"><div class="head"><h2>${esc(step?.title||'Start with a prompt')}</h2></div><div class="body">${step?content(step,data):'<p>Find me streetwear brands we can run AI UGC content campaigns for.</p><p class="hint">Press Play or Start to begin.</p>'}</div></section></div><section class="card"><div class="head"><h2>Tool call history</h2><span class="hint">${Math.max(0,state.index+1)} steps</span></div><div class="body ap-demo-history">${historyHTML(data.steps,state.index)||'<p class="hint">Tool steps appear as the campaign progresses.</p>'}</div></section></div>`;
  host.querySelector('[data-ap-demo-play]').onclick=()=>{if(state.playing||(autoFlow&&step?.view==='sample')){autoFlow=false;host.querySelector('video')?.pause();controller.pause();}else{autoFlow=true;if(step?.view==='sample')render(controller.state);else controller.play();}};
  host.querySelector('[data-ap-demo-next]').onclick=()=>controller.next();host.querySelector('[data-ap-demo-reset]').onclick=()=>{autoFlow=false;controller.reset();};
  host.querySelectorAll('[data-ap-demo-brand]').forEach(b=>b.onclick=()=>{view.location.hash=`#/walkthrough/${b.dataset.apDemoBrand}`;});
  host.querySelectorAll('[data-ap-demo-call]').forEach(el=>{el.open=opened.has(el.dataset.apDemoCall);});
  host.querySelectorAll('img').forEach(img=>img.addEventListener('error',()=>{img.hidden=true;}));
  const player=host.querySelector('video');
  if(player&&autoFlow){
   if(step.view==='sample')player.addEventListener('ended',()=>{if(owned()&&autoFlow)controller.play();},{once:true});
   Promise.resolve(player.play()).catch(()=>{if(!owned())return;player.muted=true;Promise.resolve(player.play()).catch(()=>{});});
  }
  host.querySelector('video')?.addEventListener('error',event=>{event.target.insertAdjacentHTML('afterend','<p class="s-bad" role="alert">The saved video could not be loaded.</p>');});
 };
 controller=createCampaignReplay({steps:data.steps,onChange:render,schedule:schedule||((fn,ms)=>view.setTimeout(fn,ms)),cancel:cancel||(id=>view.clearTimeout(id))});
 render(controller.state);if(autoPlay)controller.play();return {data,controller,dispose};
}
