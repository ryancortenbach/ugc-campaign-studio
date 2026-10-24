import {safeLogValue} from './tool-logs.js';
import {playerHTML,bindPlayers} from './mint-player.js';
import {activityHTML} from './chat-activity.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safe=url=>typeof url==='string'&&/^\/(?!\/)/.test(url)&&!/[<>"'\r\n]/.test(url)?url:'';
const logo=provider=>({'Whop MCP':'whop',Terac:'terac',Exa:'exa',Higgsfield:'higgsfield',ImageGen:'claude',Email:'gmail',Solari:'solari',ElevenLabs:'elevenlabs'})[provider];
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

function video(url,label,poster){return playerHTML(url,{label,poster});}
function content(step,data){
 const out=step.output,poster=data.steps.find(s=>s.view==='character')?.output.garmentAnchorUrl;
 if(step.view==='brands')return `<div class="ap-demo-brands-found">${data.brands.map(b=>`<article><b>${esc(b.name)}</b><p>${b.sampleReady?'Sample ready':'Research complete; sample pending'}</p></article>`).join('')}</div>`;
 if(step.view==='document')return `<a class="campaign-document" href="${esc(safe(out.url))}" target="_blank" rel="noopener"><b>Disobedient · Research and ICP</b><span>Audience, positioning and creative direction</span><small>Open document ↗</small></a>`;
 if(step.view==='product')return `<img class="ap-demo-product" src="${esc(safe(out.imageUrl))}" alt="${esc(out.title||'Hoodie reference')}"><p class="hint">Official product reference.</p>`;
 if(step.view==='character')return `<div class="ap-demo-references">${[{url:out.conceptUrl,label:'PS2 character concept'},{url:out.garmentAnchorUrl,label:'Selected PS2 character and garment'}].filter(item=>safe(item.url)).map(item=>`<figure><img src="${esc(item.url)}" alt="${esc(item.label)}"><figcaption>${esc(item.label)}</figcaption></figure>`).join('')}</div>`;
 if(step.view==='sample')return `${video(out.videoUrl,'Generated outreach sample',poster)}<p class="hint">${esc(out.durationSeconds||'')} second PS2 character sample.</p>`;
 if(step.view==='email')return `<article class="ap-demo-email"><small>Outreach</small><p>To: ${esc(step.input.recipient)}</p><b>${esc(step.input.subject)}</b><p>${esc(step.input.copy)}</p>${step.input.attachments.map(a=>`<a class="btn sm" href="${esc(safe(a.url))}" target="_blank" rel="noopener">${esc(a.title)}</a>`).join('')}</article>`;
 if(step.view==='reply')return `<article class="ap-demo-email"><small>Reply from ${esc(data.brandName)}</small><p>${esc(out.text)}</p></article>`;
 if(step.view==='checkout')return `<div class="ap-demo-payment"><small>Whop checkout</small><h3>$500.00</h3><p>PS2 character campaign ad</p><div class="ap-demo-checkout">${esc(out.displayLink)}</div></div>`;
 if(step.view==='paid')return `<div class="ap-demo-payment"><small>Payment notification</small><h3>$${Number(out.amountUsd||500).toLocaleString('en-US',{minimumFractionDigits:2})} received</h3><p>${esc(out.buyer)} checked out.</p></div>`;
 if(step.view==='rendering')return `<div class="ap-demo-progress" role="status"><span></span><b>Preparing the finished ad</b><p>Rendering and assembling your campaign.</p></div>`;
 if(step.view==='final')return `${video(out.videoUrl,'Completed PS2 character ad',poster)}<p>${out.videoUrl?`PS2 character ad: ${esc(out.durationSeconds)} seconds.`:'The finished clip is still pending.'}</p>`;
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
function presentationInput(step){
 if(step.view==='reply')return {brand:step.input.thread?.replace(/^Demo /,'').replace(/ outreach$/,'')};
 if(step.view==='paid')return {amountUsd:step.output.amountUsd};
 if(step.view==='rendering')return {brand:step.input.brand};
 if(step.view==='review-approved')return {review:'Sample review'};
 return step.input;
}
export function campaignNotification(step,data){
 const notices={
  'review-approved':{title:'Sample approved',detail:'Terac review complete',provider:'terac'},
  email:{title:'Sent',detail:`Sample sent to ${data.brandName}`,provider:'gmail'},
  reply:{title:'Received',detail:`${data.brandName}: “I like this. Let’s do it.”`,provider:'gmail'},
  checkout:{title:'Checkout link sent',detail:`${data.brandName} · $500 campaign`,provider:'whop'},
  paid:{title:'Checkout successful',detail:`${step.output.buyer} checked out for $${Number(step.output.amountUsd||500).toLocaleString('en-US',{maximumFractionDigits:2})}`,provider:'whop'},
  final:{title:'Video ready',detail:`${data.brandName} · 30-second PS2 character ad`,provider:'higgsfield'}
 };
 return notices[step.view]||null;
}
function focusCampaign(data){
 if(data.brandId!=='disobedient')return data;
 return {...data,brands:data.brands.filter(b=>b.id==='disobedient'),steps:data.steps.map(step=>step.id==='research'?{...step,title:'Find Disobedient',output:{...step.output,brands:step.output.brands.filter(b=>b.name===data.brandName)}}:step)};
}
const toolName=step=>({'Whop MCP':'whop.checkout',Terac:'terac.review',Exa:'exa.web_search',Higgsfield:'higgsfield.genjutsu-light',ImageGen:'imagegen.storyboard',Email:step.view==='reply'?'gmail.receive':'gmail.send',Web:'web.product_reference',Mint:'mint.task',Claude:'claude.icp',Solari:'solari.browser',ElevenLabs:'elevenlabs.voice'})[step.provider];
const narrative={brands:'Disobedient is a fit. I’m collecting the hoodie and building a PS2 character direction.',character:'I’ll keep the same London character and wardrobe throughout the ad.',sample:'Here’s the six-second sample, with captions matching the dialogue.',review:'The sample is waiting for review.',email:'The sample and outreach copy are ready.',reply:'They like the direction. Next is the $500 checkout.',paid:'Checkout received. I’m preparing the complete character ad.',final:'The complete ad is ready, including the hoodie and the brand website at the end.'};

// Append progress inside the existing chat. Never replace a playing media node.
export async function mountCampaignDemo(host,{brandId='disobedient',autoPlay=false,persistent=false,fetch=globalThis.fetch,schedule,cancel,onNotify=()=>{},onUpdate=()=>{}}={}){
 mounts.get(host)?.dispose();let controller,removed=false,lastIndex=-1,paused=false,sampleTimer;
 const token=Symbol('campaign-chat');host._campaignToken=token;
 const owned=()=>host.isConnected&&host._campaignToken===token;
 const view=host.ownerDocument.defaultView;
 const dispose=()=>{removed=true;controller?.dispose();view.clearTimeout(sampleTimer);host.querySelectorAll('video').forEach(p=>p.pause());observer?.disconnect();view.removeEventListener('hashchange',dispose);};
 const Observer=view.MutationObserver,observer=new Observer(()=>{if(!owned())dispose();});
 observer.observe(host.ownerDocument,{childList:true,subtree:true});if(!persistent)view.addEventListener('hashchange',dispose);
 mounts.set(host,{dispose});host.innerHTML='<p class="hint" role="status">Preparing Disobedient.</p>';
 let data;
 try{
  const response=await fetch(`/api/campaign-demo/${encodeURIComponent(brandId)}`);if(!response.ok)throw Error('Campaign unavailable');data=focusCampaign(await response.json());
  if(persistent){
   const extras=await Promise.all([fetch('/api/client-demo').then(r=>r.ok?r.json():null).catch(()=>null),fetch('/provider-status/terac-v1.json').then(r=>r.ok?r.json():null).catch(()=>null),fetch('/provider-status/solari-research-v1.json').then(r=>r.ok?r.json():null).catch(()=>null),fetch('/provider-status/terac-project-v1.json').then(r=>r.ok?r.json():null).catch(()=>null)]);
   const packet=extras[0]?.brands?.find(b=>b.id===brandId);data.packet=packet;
   const index=data.steps.findIndex(s=>s.view==='character');
   if(packet?.reportUrl)data.steps.splice(index,0,{id:'icp',title:'Write the audience and ICP document',provider:'Claude',view:'document',input:{brand:data.brandName},output:{url:packet.reportUrl,audience:'Adult streetwear fans; PS2 nostalgia and hoodie styling',evidence:packet.icp?.evidence||[]}});
   data.steps.splice(Math.max(0,data.steps.findIndex(s=>s.view==='document')),0,{id:'solari-research',title:'Read the brand website with Solari',provider:'Solari',mode:'replay',view:'research',input:{website:packet?.website||'https://disobedientnyc.com'},output:{source:'Brand website',purpose:'Product, positioning and ICP evidence',...extras[2]}});
   data.steps.splice(data.steps.findIndex(s=>s.view==='sample'),0,{id:'voice',title:'Load the UK character voice',provider:'ElevenLabs',mode:'recorded',view:'voice',input:{voiceId:'EsBKDmM9f0GZP1raVDSa'},output:{voice:'UK Guy · Studio r1',source:'Verified existing ElevenLabs voice',newGeneration:false}});
   const paidIndex=data.steps.findIndex(s=>s.view==='paid');data.steps.splice(paidIndex+1,0,{id:'paid-don',title:'Receive the second campaign checkout',provider:'Whop MCP',mode:'simulated',view:'paid',delayMs:1800,input:{amountUsd:541.25},output:{buyer:'Don',amountUsd:541.25,status:'paid',realPaymentReceived:false}});
   const receipt=extras[1];if(receipt?.realToolCall&&Date.now()-Date.parse(receipt.checkedAt)<86400000)data.steps.splice(data.steps.findIndex(s=>s.view==='review'),0,{id:'terac-sync',title:'Prepare the Terac review project',provider:'Terac',view:'sync',input:{tool:'terac_get_context'},output:{balanceUsd:receipt.balanceUsd,checkedAt:receipt.checkedAt,readOnly:true,project:extras[3]?.name,dashboardUrl:extras[3]?.dashboardUrl,review:extras[3]?.review}});
  }
 }
 catch(error){if(owned())host.innerHTML=`<p class="s-bad" role="alert">${esc(error.message)}</p>`;return;}
 if(removed||!owned())return;
 host.innerHTML='<div class="campaign-chat" aria-label="Campaign progress"><details class="campaign-previous" hidden><summary>Earlier tool calls</summary><div></div></details><div class="campaign-calls"></div><p class="campaign-state hint" role="status"></p></div>';
 const calls=host.querySelector('.campaign-calls'),status=host.querySelector('.campaign-state');
 const paint=state=>{
  if(!owned()){dispose();return;}
  status.textContent=state.error||(paused?'Paused. Say “continue” when you’re ready.':'');
  if(state.index===lastIndex)return;
  const previous=calls.lastElementChild;
  if(previous){previous.querySelector('[data-call-state]').textContent='Done';previous.querySelector('[data-call-state]').classList.remove('ap-chat-working');previous.classList.remove('campaign-current');previous.querySelector('video')?.pause();const result=previous.querySelector('.campaign-result');if(result)result.open=false;}
  lastIndex=state.index;if(state.index<0)return;
  const step=data.steps[state.index],working=!['sample','final','paid','reply','review-approved','email','checkout'].includes(step.view);
  const row=host.ownerDocument.createElement('section');row.className='campaign-turn campaign-current';row.dataset.campaignStep=step.id;
  row.innerHTML=activityHTML([{id:step.id,tool:toolName(step),label:step.title,status:working?'running':'success',input:presentationInput(step),output:presentationResult(step)}],{title:step.provider});
  // Keep the familiar Offload tool row, without a second surrounding panel.
  const group=row.querySelector('.ap-chat-activity'),tool=group.querySelector('.ap-chat-tool');group.replaceWith(tool);
  const mark=logo(step.provider);if(mark){const icon=tool.querySelector('summary>img,summary>.ap-chat-symbol');if(icon)icon.outerHTML=`<img src="/logos/${mark}.png" alt="${esc(step.provider)}">`;}
  const badge=tool.querySelector('.ap-chat-tool-status');badge.dataset.callState='';badge.textContent=step.view==='review'?'Waiting':working?'Working':'Done';
  if(narrative[step.view])row.insertAdjacentHTML('beforeend',`<p class="campaign-narrative">${esc(narrative[step.view])}</p>`);
  if(['document','product','character','sample','email','reply','checkout','paid','final'].includes(step.view))row.insertAdjacentHTML('beforeend',`<details class="campaign-result" open><summary>${esc(({document:'Research and ICP',product:'Hoodie reference',character:'PS2 storyboard and character',sample:'Six-second sample',email:'Outreach email',reply:'Brand reply',checkout:'Checkout link',paid:'Payment received',final:'Complete character ad'})[step.view])}</summary>${content(step,data)}</details>`);
  calls.append(row);
  const earlier=host.querySelector('.campaign-previous');while(calls.children.length>3)earlier.querySelector('div').append(calls.firstElementChild);earlier.hidden=!earlier.querySelector('div').children.length;
  const notice=campaignNotification(step,data);if(notice)onNotify(notice);
  bindPlayers(row);const player=row.querySelector('video');
  if(player&&step.view==='sample'){
   const advance=()=>{view.clearTimeout(sampleTimer);if(owned()&&!paused&&data.steps[controller.state.index]?.view==='sample')controller.play();};
   player.addEventListener('ended',advance,{once:true});
   // Tasks can stay live when the conversation is parked outside the visible page.
   if(persistent)sampleTimer=view.setTimeout(()=>{if(!host.closest('#view'))advance();},(step.output.durationSeconds||6)*1000+300);
  }
  if(player&&autoPlay&&(!persistent||host.closest('#view')))Promise.resolve(player.play()).catch(()=>{if(!owned())return;player.muted=true;Promise.resolve(player.play()).catch(()=>{status.textContent='Press play on the video to continue.';});});
  player?.addEventListener('error',()=>{status.textContent='The video could not be loaded. Reload the conversation to retry.';});
  onUpdate(step,{data,index:state.index,completed:state.completed});
 };
 controller=createCampaignReplay({steps:data.steps,onChange:paint,schedule:schedule||((fn,ms)=>view.setTimeout(fn,ms)),cancel:cancel||(id=>view.clearTimeout(id))});
 const respond=message=>{
  const text=String(message).trim(),step=data.steps[controller.state.index];
  if(/\b(pause|stop|hold on)\b/i.test(text)){paused=true;controller.pause();host.querySelectorAll('video').forEach(p=>p.pause());return 'Paused here. Say “continue” to pick up from this point.';}
  if(/^(continue|resume|go on|keep going)[.!]?$/i.test(text)){paused=false;status.textContent='';const player=calls.lastElementChild?.querySelector('video');if(step?.view==='sample'&&player&&!player.ended)Promise.resolve(player.play()).catch(()=>{});else if(!controller.state.completed)controller.play();return controller.state.completed?'The finished ad is ready above.':'Continuing from here.';}
  if(/caption|subtitle/i.test(text))return 'The captions follow the character’s spoken dialogue. The same captions carry through the sample and complete ad.';
  if(/hoodie|product|reference/i.test(text))return 'The Disobedient hoodie reference and PS2 wardrobe direction are in this conversation. The finished ad closes on the product and disobedientnyc.com.';
  return controller.state.completed?'The Disobedient ad is ready above: 30 seconds, with the product and website at the end.':`I’m working on ${data.brandName}. Current step: ${step?.title||'preparing the task'}. You can ask about the hoodie or captions, or say “pause” and “continue”.`;
 };
 if(autoPlay)controller.play();else{status.innerHTML='<button type="button" class="linkbtn" data-campaign-continue>Continue campaign</button>';status.querySelector('button').onclick=()=>{autoPlay=true;controller.play();};}
 return {data,controller,dispose,respond,resumeMedia(){const player=calls.lastElementChild?.querySelector('video');if(player&&!paused&&!player.ended)Promise.resolve(player.play()).catch(()=>{});}};
}
