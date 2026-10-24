import {icons} from './icons.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const extra={'volume-2':'<path d="m11 5-6 4H2v6h3l6 4z"/><path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>','volume-x':'<path d="m11 5-6 4H2v6h3l6 4z"/><path d="m16 9 5 6m0-6-5 6"/>'};
const icon=name=>`<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name]||extra[name]||''}</svg>`;
const clock=n=>`${Math.floor((n||0)/60)}:${String(Math.floor((n||0)%60)).padStart(2,'0')}`;
export function playerHTML(url,{label='Campaign video',poster=''}={}){
 if(!/^(?:\/(?!\/)|https:\/\/)/.test(url||'')||/[<>"'\r\n]/.test(url))return '<p class="hint">Video unavailable.</p>';
 return `<div class="mint-player" data-mint-player><video playsinline preload="metadata" src="${esc(url)}" ${poster?`poster="${esc(poster)}"`:''} aria-label="${esc(label)}"></video><button type="button" class="mint-player-big" data-mp-play aria-label="Play video">${icon('play')}</button><div class="mint-player-bar"><button type="button" data-mp-play aria-label="Play video">${icon('play')}</button><time data-mp-time>0:00</time><input type="range" min="0" max="100" step=".1" value="0" aria-label="Video position" data-mp-seek><time data-mp-duration>0:00</time><button type="button" data-mp-mute aria-label="Mute video">${icon('volume-2')}</button></div></div>`;
}
export function bindPlayers(root){
 root.querySelectorAll('[data-mint-player]').forEach(box=>{
  if(box.dataset.mpBound)return;box.dataset.mpBound='true';
  const video=box.querySelector('video'),seek=box.querySelector('[data-mp-seek]');
  const update=()=>{box.classList.toggle('is-playing',!video.paused&&!video.ended);for(const b of box.querySelectorAll('[data-mp-play]')){b.innerHTML=icon(video.paused?'play':'pause');b.setAttribute('aria-label',video.paused?'Play video':'Pause video');}box.querySelector('[data-mp-time]').textContent=clock(video.currentTime);box.querySelector('[data-mp-duration]').textContent=clock(video.duration);seek.value=video.duration?video.currentTime/video.duration*100:0;};
  const toggle=()=>{if(video.paused)video.play().catch(()=>{});else video.pause();};
  box.querySelectorAll('[data-mp-play]').forEach(b=>b.onclick=toggle);video.onclick=toggle;
  seek.oninput=()=>{if(Number.isFinite(video.duration))video.currentTime=Number(seek.value)/100*video.duration;update();};
  box.querySelector('[data-mp-mute]').onclick=e=>{video.muted=!video.muted;e.currentTarget.innerHTML=icon(video.muted?'volume-x':'volume-2');e.currentTarget.setAttribute('aria-label',video.muted?'Unmute video':'Mute video');};
  for(const e of ['play','pause','timeupdate','loadedmetadata','ended'])video.addEventListener(e,update);update();
 });
}
export function openPlayer(url,{title='Disobedient hoodie',document=globalThis.document}={}){
 document.querySelector('.mint-media-dialog')?.close();
 const dialog=document.createElement('dialog');dialog.className='mint-media-dialog';dialog.innerHTML=`<div class="mint-media-head"><b>${esc(title)}</b><button type="button" aria-label="Close video">${icon('x')}</button></div>${playerHTML(url,{label:title})}`;document.body.append(dialog);bindPlayers(dialog);
 dialog.querySelector('.mint-media-head button').onclick=()=>dialog.close();dialog.addEventListener('close',()=>{dialog.querySelector('video')?.pause();dialog.remove();},{once:true});dialog.onclick=e=>{if(e.target===dialog)dialog.close();};dialog.showModal();dialog.querySelector('video').play().catch(()=>{});
}
