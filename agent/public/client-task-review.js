import {toolLogRow} from './tool-logs.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const list=value=>Array.isArray(value)?value:[];
const short=(value,max=220)=>{const text=String(value||'');return text.length>max?text.slice(0,max).replace(/\s+\S*$/,'')+'...':text;};
const safeUrl=value=>{if(typeof value!=='string'||!value.trim())return '';try{return ['http:','https:'].includes(new URL(value,'http://localhost').protocol)?value:'';}catch{return '';}};
const link=(url,label)=>safeUrl(url)?`<a class="linkbtn" href="${esc(url)}" target="_blank" rel="noopener">${esc(label)}</a>`:'';
const image=(url,label,cls='')=>safeUrl(url)?`<figure class="ct-image ${cls}"><img src="${esc(url)}" alt="${esc(label)}" loading="lazy"><figcaption>${esc(label)}</figcaption><p class="faint" hidden>Image unavailable</p></figure>`:'';
let active=null;
export async function clientTaskReviewView({view,api,taskId,isCurrent=()=>true}){
 const context={view,taskId};active=context;
 const current=()=>active===context&&isCurrent()&&view.isConnected;
 let data=await api(`/api/tasks/${taskId}/client-review`);if(!current())return;
 let busy=false,error='',editing=null;const notes={};
 const feedbackNote=section=>notes[section]??data.reviews.find(review=>review.section===section&&review.mode==='local')?.note??'';
 const render=()=>{
  if(!current())return;
  const historyOpen=view.querySelector('.ct-history')?.open,evidenceOpen=view.querySelector('.ct-evidence')?.open;
  const openLogs=new Set([...view.querySelectorAll('[data-ap-log][open]')].map(detail=>detail.dataset.apLog));
  const payloadKey=detail=>JSON.stringify([detail.closest('[data-ap-log]').dataset.apLog,detail.querySelector('summary')?.textContent]);
  const openPayloads=new Set([...view.querySelectorAll('[data-ap-log] .ap-log-payload[open]')].map(payloadKey));
  const {brand,versions,reviews,events=[]}=data;
  const needsRevision=brand.sampleVideo?.status==='needs_revision'||brand.sampleVideo?.visualQA?.status==='needs_revision';
  const approval=section=>reviews.find(review=>review.section===section&&review.mode==='local');
  const controls=section=>{
   const review=approval(section),approved=review?.decision==='approved';
   return `<div class="ct-actions">${review?`<span class="schip ${approved?'s-ok':'s-you'}">${approved?'Approved':'Changes requested'}</span>`:''}<button class="btn sm${approved?'':' go'}" data-ct-approve="${section}" ${busy||!versions[section]||approved?'disabled':''}>${approved?'Approved':'Approve'}</button><button class="btn sm" data-ct-edit="${section}" ${busy||!versions[section]?'disabled':''}>Changes</button></div>`;
  };
  const noteForm=section=>editing===section&&versions[section]?`<form data-ct-note="${section}" class="ct-note"><label for="ct-note-${section}">What should change?</label><textarea id="ct-note-${section}" maxlength="1000" required ${busy?'disabled':''}>${esc(feedbackNote(section))}</textarea><button class="btn sm" ${busy?'disabled':''}>Save feedback</button></form>`:'';
  const products=list(brand.assets).filter(asset=>asset.kind==='product');
  const productLabel=asset=>/front/i.test(asset.title)?'Front':/back|rear/i.test(asset.title)?'Back':/model|body|fit/i.test(asset.title)?'On-body':asset.title||'Product';
  const logo=list(brand.assets).find(asset=>asset.kind==='logo');
  const complete=['research','images',...(versions.video?['video']:[])].every(section=>approval(section)?.decision==='approved');
  view.innerHTML=`<div id="client-task-review" class="ct-review"><div class="ct-heading"><div><a class="faint" href="#/tasks">Tasks</a><h2>${safeUrl(logo?.imageUrl)?`<img src="${esc(logo.imageUrl)}" alt="">`:''}${esc(brand.name)}</h2></div><span class="schip ${needsRevision?'s-bad':complete?'s-ok':'s-you'}">${needsRevision?'Needs revision':complete?'Reviewed':'Needs review'}</span>${link(brand.offerPdfUrl,'PDF')}</div>
   ${error?`<div class="ct-error" role="alert">${esc(error)} <button class="btn sm" data-ct-refresh>Refresh</button></div>`:''}
   <section class="card ct-section" data-ct-section="research"><div class="head"><h2>Research</h2>${controls('research')}</div><div class="body"><p class="ct-label">Proposed audience</p><p class="ct-summary">${esc(short(brand.icp?.summary||'Audience research is pending.'))}</p>${brand.script?.hook?`<p class="ct-label">Creative angle</p><p>${esc(short(brand.script.hook,160))}</p>`:''}<details class="ct-evidence"><summary>Evidence and research</summary><p>${esc(brand.icp?.summary||'')}</p>${list(brand.icp?.evidence).map(item=>`<p>${esc(typeof item==='string'?item:item.claim||item.summary)}</p>`).join('')}<div class="ct-links">${list(brand.sources).slice(0,6).map(source=>link(source.url,source.title||'Source')).join('')}</div>${list(brand.gaps).slice(0,3).map(gap=>`<p class="faint">${esc(gap)}</p>`).join('')}${link(brand.reportUrl,'Full research')}</details>${noteForm('research')}</div></section>
   <section class="card ct-section" data-ct-section="images"><div class="head"><h2>Creative images</h2>${controls('images')}</div><div class="body"><div class="ct-creative">${image(brand.persona?.imageUrl,'Character','ct-character')}${image(brand.storyboardImageUrl,brand.storyboardImageKind==='generated_video_frame'?'Corrected PS2 garment reference':'ImageGen concept','ct-board')}${!versions.images?'<p class="faint">Creative images are not ready yet.</p>':''}</div>${brand.storyboardCaption?`<p class="faint ct-concept-note">${esc(brand.storyboardCaption)}</p>`:''}${products.length?`<div class="ct-wardrobe"><span class="ct-label">Wardrobe references</span><div class="ct-products">${products.map(asset=>image(asset.imageUrl,productLabel(asset))).join('')}</div></div>`:''}${noteForm('images')}</div></section>
   ${versions.video?`<section class="card ct-section" data-ct-section="video"><div class="head"><h2>Video</h2>${controls('video')}</div><div class="body">${needsRevision?`<p class="s-bad">${esc(short(brand.sampleVideo.visualQA?.findings?.[0]||'The generated video needs a revision.',180))}</p>`:''}${Number.isInteger(data.videoRenderId)?`<a class="linkbtn" href="#/renders/${data.videoRenderId}">Review video</a>`:link(brand.sampleVideo.url,'Review video')}${noteForm('video')}</div></section>`:''}
   ${safeUrl(brand.demoFinalVideo?.url)?`<section class="card ct-section"><div class="head"><h2>Complete character ad</h2><span class="schip s-you">Human review pending</span></div><div class="body"><p>30 seconds, including the hoodie and website CTA.</p>${Number.isInteger(brand.demoFinalVideo.renderId)?`<a class="linkbtn" href="#/renders/${brand.demoFinalVideo.renderId}">Watch the complete ad</a>`:link(brand.demoFinalVideo.url,'Watch the complete ad')}</div></section>`:''}
   <details class="ct-history"><summary>Review history</summary><div class="ct-terac"><img src="/logos/terac.png" alt="Terac"><div><b>Human review</b><span class="faint">Simulation</span></div><button class="btn sm" data-ct-terac="research" ${busy?'disabled':''}>Simulate ICP review</button><button class="btn sm" data-ct-terac="video" ${busy||!versions.video?'disabled':''} ${!versions.video?'title="Available when a generated video is ready"':''}>Simulate video review</button></div><p class="faint">Local simulation. No panel is launched and no real human approval is recorded.</p><div class="ct-log">${events.filter(event=>event.type==='tool_call').slice(-8).reverse().map(event=>toolLogRow(event,{events})).join('')||'<p class="faint">No reviews yet.</p>'}</div></details></div>`;
  view.querySelectorAll('.ct-image img').forEach(img=>img.addEventListener('error',()=>{img.hidden=true;img.closest('figure').querySelector('p').hidden=false;}));
  view.querySelectorAll('[data-ct-edit]').forEach(button=>button.onclick=()=>{editing=button.dataset.ctEdit;render();view.querySelector('textarea')?.focus();});
  view.querySelectorAll('[data-ct-note] textarea').forEach(input=>input.oninput=()=>{notes[input.closest('form').dataset.ctNote]=input.value;});
  view.querySelectorAll('[data-ct-approve]').forEach(button=>button.onclick=()=>save(button.dataset.ctApprove,'approved'));
  view.querySelectorAll('[data-ct-terac]').forEach(button=>button.onclick=()=>save(button.dataset.ctTerac,button.dataset.ctTerac==='video'&&needsRevision?'changes_requested':'approved','simulated'));
  view.querySelectorAll('[data-ct-note]').forEach(form=>form.onsubmit=event=>{event.preventDefault();return save(form.dataset.ctNote,'changes_requested');});
  if(historyOpen!==undefined)view.querySelector('.ct-history').open=historyOpen;
  if(evidenceOpen!==undefined)view.querySelector('.ct-evidence').open=evidenceOpen;
  for(const detail of view.querySelectorAll('[data-ap-log]'))detail.open=openLogs.has(detail.dataset.apLog);
  for(const detail of view.querySelectorAll('[data-ap-log] .ap-log-payload'))detail.open=openPayloads.has(payloadKey(detail));
  view.querySelector('[data-ct-refresh]')?.addEventListener('click',async()=>{if(busy)return;busy=true;error='';render();try{const fresh=await api(`/api/tasks/${taskId}/client-review`);if(current())data=fresh;}catch(caught){if(current())error=caught.message;}finally{busy=false;render();}});
 };
 const save=async(section,decision,mode='local')=>{
  if(busy||!data.versions[section])return;
  busy=true;error='';render();
  const note=mode==='local'?(decision==='changes_requested'?feedbackNote(section):notes[section]||''):decision==='changes_requested'?data.brand.sampleVideo?.visualQA?.findings?.[0]||'The generated video needs a revision.':'';
  try{const fresh=await api(`/api/tasks/${taskId}/client-review`,{section,version:data.versions[section],decision,note,mode});if(current()){data=fresh;editing=null;}}
  catch(caught){if(current())error=caught.message;}
  finally{busy=false;render();}
 };
 render();
}
