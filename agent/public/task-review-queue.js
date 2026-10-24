import {reviewReady,watchRecords} from './render-monitor.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const needsTaskReview=r=>reviewReady(r)||(r.status==='completed'&&r.plan?.visualQA?.status==='needs_revision');
export function taskReviewHTML(renders){
 const pending=renders.filter(needsTaskReview);
 if(!pending.length)return '';
 return `<section class="card"><div class="head"><h2>Video review</h2><span class="badge">${pending.length}</span></div><div class="body">${pending.map(r=>`<div class="ap-chat-review-row"><div><b>${esc(r.title)}</b><p class="hint">${r.plan?.visualQA?.status==='needs_revision'?'Needs revision: inconsistent garment artwork.':'Generated clip ready for review.'}</p></div><div class="ap-cd-actions">${Number.isInteger(r.plan?.taskId)?`<a class="btn sm" href="#/tasks/${r.plan.taskId}">Review</a>`:''}<a class="btn sm" href="#/renders/${esc(r.id)}">View clip</a></div></div>`).join('')}</div></section>`;
}
export async function mountTaskReviewQueue(host,{read=async signal=>{const r=await fetch('/api/renders',{signal});if(!r.ok)throw Error('Review queue unavailable');return r.json();}}={}){
 const current=()=>host.isConnected&&host.ownerDocument.querySelector('[data-ap-review-queue]')===host;
 try{
  const data=await read();if(!current())return;
  host.innerHTML=taskReviewHTML(data.renders);
  const view=host.ownerDocument.defaultView;
  watchRecords({initial:data,isCurrent:current,schedule:(fn,ms)=>view.setTimeout(fn,ms),cancel:id=>view.clearTimeout(id),read,onChange:d=>{host.innerHTML=taskReviewHTML(d.renders);}});
 }catch{if(current())host.innerHTML='<p class="hint">The review queue is unavailable. Open Renders to check clips.</p>';}
}
