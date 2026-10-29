import {icons} from './icons.js';
const ic=n=>`<svg class="lu" viewBox="0 0 24 24" aria-hidden="true">${icons[n]}</svg>`;
const mb=n=>`${(Number(n||0)/1048576).toFixed(1)} MB`;
const when=t=>t?new Date(t).toLocaleString([],{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'';
const day=t=>t?new Date(t).toLocaleDateString([],{month:'long',day:'numeric',year:'numeric'}):'';

function deliveryHTML(d,esc){
 const v=d.delivery,email=v.email?`Subject: ${v.email.subject}\n\n${v.email.body}`:'';
 const draft=v.draftUrl?`<p>${ic('mail-check')}Draft saved in Gmail for ${esc(d.order.buyerEmail)}. <a href="${esc(v.draftUrl)}" target="_blank" rel="noopener">Open the draft</a> and send it.</p>`
  :`<p class="faint">Gmail is not connected, so copy this email to ${esc(d.order.buyerEmail||'the buyer')}:</p><textarea class="od-email" readonly rows="9">${esc(email)}</textarea><div class="od-actions"><button class="btn sm" type="button" data-copy="email">${ic('file-text')}Copy email</button></div>`;
 return `<div class="od-delivery">${v.stale?'<p class="od-warn">This link is for an earlier version. Upload again to deliver the new one.</p>':''}<p>Download link ready until ${esc(day(v.expiresAt))}.</p><div class="od-link"><input type="text" readonly value="${esc(v.link)}" aria-label="Download link"><button class="btn sm" type="button" data-copy="link">${ic('link')}Copy link</button></div>${draft}</div>`;
}

// The last step of a Whop order: join the finished shots into one video, then upload it to Supabase and draft the buyer's
// email. Nothing is sent from here; the operator sends the draft.
export async function paintDelivery({el,api,esc,toast,paymentId,isCurrent=()=>true}){
 const base=`/api/whop/orders/${encodeURIComponent(paymentId)}`;
 let d;
 try{d=await api(`${base}/delivery`);}catch(error){if(isCurrent())el.innerHTML=`<div class="od-head"><h3>Finished video</h3></div><p class="faint">${esc(error.message)}</p>`;return;}
 if(!isCurrent())return;
 const total=d.shots.length,done=d.shots.filter(s=>s.renderId).length,f=d.final,v=d.delivery;
 let body;
 if(!total)body='<p class="faint">The shots show up here once the storyboard is approved and sent to Renders.</p>';
 else if(!d.ready)body=`<p>${done} of ${total} shots are finished. The final video can be made once every shot has rendered.</p><p class="faint">Waiting on ${d.shots.filter(s=>!s.renderId).map(s=>esc(s.title)).join(', ')}. <a href="#/renders">Open Renders</a></p>`;
 else if(!f)body=`<p>All ${total} shots are finished.</p>${d.setup.ffmpeg?'':'<p class="od-warn">ffmpeg is missing on this Mac. Run npm install in agent/ or brew install ffmpeg.</p>'}<div class="od-actions"><button class="btn sm go" type="button" data-del="final" ${d.setup.ffmpeg?'':'disabled'}>${ic('film')}Make final video</button></div>`;
 else body=`<div class="od-body"><video class="od-video" controls preload="metadata" playsinline src="${esc(f.url)}"></video><div class="od-info">
  <p>Made ${esc(when(f.at))} from ${total} shots, ${mb(f.bytes)}, ${f.captions?'with captions':'without captions'}.</p>
  ${f.stale?'<p class="od-warn">A shot changed after this video was made.</p>':''}
  ${d.setup.ffmpeg?'':'<p class="od-warn">ffmpeg is missing on this Mac. Run npm install in agent/ or brew install ffmpeg.</p>'}
  <div class="od-actions"><button class="btn sm${f.stale?' go':''}" type="button" data-del="final" ${d.setup.ffmpeg?'':'disabled'}>${ic('refresh-cw')}${f.stale?'Remake final video':'Make it again'}</button>${!v||v.stale?`<button class="btn sm go" type="button" data-del="deliver" ${d.setup.storage&&!f.stale?'':'disabled'}>${ic('send')}Upload and draft email</button>`:''}</div>
  ${d.setup.storage?'':'<p class="faint">To upload, add SUPABASE_SECRET_KEY to .env.local and restart the app.</p>'}
  ${v?deliveryHTML(d,esc):''}</div></div>`;
 el.innerHTML=`<div class="od-head"><h3>Finished video</h3><span class="faint">Nothing is sent automatically</span></div>${body}`;
 el.querySelectorAll('[data-del]').forEach(b=>b.onclick=async()=>{
  const step=b.dataset.del;b.disabled=true;b.innerHTML=`${ic('loader')}${step==='final'?'Making the video':'Uploading'}`;
  try{await api(`${base}/${step}`,{});toast(step==='final'?'Final video made':'Delivery ready','ok',step==='final'?'Watch it before you deliver.':'Nothing was sent. Send it from Gmail.');}
  catch(error){toast(error.message,'bad');}
  if(isCurrent())await paintDelivery({el,api,esc,toast,paymentId,isCurrent});
 });
 el.querySelectorAll('[data-copy]').forEach(b=>b.onclick=async()=>{
  const focused=el.ownerDocument.activeElement;
  const link=b.dataset.copy==='link',text=link?v.link:`Subject: ${v.email?.subject||''}\n\n${v.email?.body||''}`;
  try{await navigator.clipboard.writeText(text);toast('Copied','ok');}
  catch{
   if(!isCurrent()||!el.isConnected||!b.isConnected||el.ownerDocument.activeElement!==focused)return;
   const field=el.querySelector(link?'.od-link input':'.od-email');if(!field)return;
   field.focus({preventScroll:true});field.select();toast('Press Command-C to copy','info');
  }
 });
}
