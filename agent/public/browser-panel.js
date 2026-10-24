// Browser tab of the right rail: every Solari cloud browser Mint has open (brand site visits, the Instagram login, DMs), shown live.
// Self-contained. app.js loads this with a dynamic import and gives it the rail pane, its api() helper, esc() and toast().
// Frames come from /api/browser/:id/live.mjpg (an <img>); if the webview does not draw it, the card polls /api/browser/:id/frame.jpg.
// "You control" relays clicks, scrolling and keystrokes to /api/browser/:id/input. Typed text is sent and forgotten: it is never
// logged, stored or shown anywhere in this file.

const IG_MARK='<span class="bp-igmark" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="5" y="5" width="14" height="14" rx="4" fill="none" stroke="#fff" stroke-width="1.8"/><circle cx="12" cy="12" r="3.2" fill="none" stroke="#fff" stroke-width="1.8"/><circle cx="16.4" cy="7.6" r="1" fill="#fff"/></svg></span>';
const SPECIAL=new Set(['Enter','Backspace','Tab','Escape','Delete','ArrowLeft','ArrowUp','ArrowRight','ArrowDown','Home','End','PageUp','PageDown']);

// Where a pointer event landed in the frame's own pixels, allowing for the letterboxing of object-fit: contain.
export function framePoint(img,ev){
 const r=img.getBoundingClientRect(),nw=img.naturalWidth,nh=img.naturalHeight;
 if(!nw||!nh||!r.width||!r.height)return null;
 const s=Math.min(r.width/nw,r.height/nh),w=nw*s,h=nh*s,ox=r.left+(r.width-w)/2,oy=r.top+(r.height-h)/2;
 const x=(ev.clientX-ox)/s,y=(ev.clientY-oy)/s;
 if(x<0||y<0||x>nw||y>nh)return null;
 return {x:Math.round(x),y:Math.round(y)};
}

export function mountBrowserPanel({root,api,esc,toast,openRail=()=>{}}){
 if(!document.querySelector('link[data-bp-css]')){const l=document.createElement('link');l.rel='stylesheet';l.href='browser-panel.css';l.dataset.bpCss='1';document.head.append(l);}
 root.classList.add('bp');
 const state={sessions:new Map(),ig:{connected:false,savedAt:null},big:null};
 let mjpegWorks; // undefined until proven, then true or false for the whole page
 const streams=new WeakMap();

 // ---- frames ----
 function stopStream(img){const s=streams.get(img);if(!s)return;s.stop=true;clearTimeout(s.timer);clearTimeout(s.check);streams.delete(img);if(s.url){URL.revokeObjectURL(s.url);s.url=null;}img.removeAttribute('src');}
 function poll(img,id,s){
  const tick=async()=>{
   if(s.stop)return;
   try{
    const res=await fetch(`/api/browser/${id}/frame.jpg?t=${Date.now()}`,{cache:'no-store'});
    if(res.ok){const url=URL.createObjectURL(await res.blob());if(s.stop){URL.revokeObjectURL(url);return;}const old=s.url;s.url=url;img.src=url;if(old)setTimeout(()=>URL.revokeObjectURL(old),500);}
   }catch{}
   if(!s.stop)s.timer=setTimeout(tick,250);
  };
  tick();
 }
 function startStream(img,id){
  stopStream(img);
  const s={stop:false,timer:null,check:null,url:null};streams.set(img,s);
  const fallback=()=>{if(s.stop||s.polling)return;s.polling=true;mjpegWorks=false;clearTimeout(s.check);img.removeAttribute('src');poll(img,id,s);};
  if(mjpegWorks===false)return fallback();
  img.onerror=fallback;
  img.src=`/api/browser/${id}/live.mjpg?t=${Date.now()}`;
  s.check=setTimeout(()=>{if(s.stop)return;if(img.naturalWidth>0)mjpegWorks=true;else fallback();},3500);
 }
 const paused=()=>root.hidden;

 // ---- input ----
 const queues=new Map();
 let lastToast=0;
 const send=(id,body)=>{
  const next=(queues.get(id)||Promise.resolve()).then(()=>api(`/api/browser/${id}/input`,body)).catch(err=>{if(Date.now()-lastToast>3000){lastToast=Date.now();toast(err.message,'bad');}});
  queues.set(id,next);return next;
 };
 const typer=new Map();
 const flush=id=>{const t=typer.get(id);if(!t)return;clearTimeout(t.timer);typer.delete(id);if(t.text)send(id,{type:'type',text:t.text});};
 const typeText=(id,text)=>{const t=typer.get(id)||{text:'',timer:null};t.text+=text;clearTimeout(t.timer);t.timer=setTimeout(()=>flush(id),25);typer.set(id,t);};
 async function setControl(id,on){
  try{const {session}=await api(`/api/browser/${id}/control`,{on});const cur=state.sessions.get(id);if(cur)Object.assign(cur,session);}catch(err){toast(err.message,'bad');}
  paint();
 }

 // Wires clicks, scrolling and keys of one stage (a card or the enlarged view). `get` returns the session while it is alive.
 function wireStage(stage,id){
  const img=stage.querySelector('img'),sink=stage.querySelector('textarea');
  const on=()=>Boolean(state.sessions.get(id)?.control);
  stage.addEventListener('click',ev=>{
   if(!on()){if(stage.dataset.big!=='1')openBig(id);return;}
   const p=framePoint(img,ev);sink.focus({preventScroll:true});
   if(p){flush(id);send(id,{type:'click',...p});}
  });
  let wheel=null;
  stage.addEventListener('wheel',ev=>{
   if(!on())return;
   ev.preventDefault();
   const p=framePoint(img,ev)||{x:Math.round((img.naturalWidth||2)/2),y:Math.round((img.naturalHeight||2)/2)};
   if(!wheel){wheel={dx:0,dy:0,p};setTimeout(()=>{const w=wheel;wheel=null;flush(id);send(id,{type:'scroll',x:w.p.x,y:w.p.y,dx:w.dx,dy:w.dy});},50);}
   wheel.dx+=ev.deltaX;wheel.dy+=ev.deltaY;
  },{passive:false});
  sink.addEventListener('input',()=>{const t=sink.value;sink.value='';if(t&&on())typeText(id,t);});
  sink.addEventListener('keydown',ev=>{
   if(!on())return;
   ev.stopPropagation();
   if(SPECIAL.has(ev.key)){ev.preventDefault();flush(id);send(id,{type:'key',key:ev.key});}
  });
  sink.addEventListener('keyup',ev=>{if(on())ev.stopPropagation();});
 }

 // ---- cards ----
 const logoFor=s=>s.leadId?`<span class="bp-logo"><img src="/api/leads/${s.leadId}/logo" alt="" onerror="this.remove()"><b>${esc((s.purpose||'?')[0])}</b></span>`:(/instagram|DM to/i.test(s.purpose)?`<span class="bp-logo ig">${IG_MARK}</span>`:'<span class="bp-logo"><img src="/logos/solari.png" alt=""></span>');
 const shortUrl=u=>{try{const x=new URL(u);return x.hostname.replace(/^www\./,'')+(x.pathname==='/'?'':x.pathname);}catch{return u||'Opening...';}};
 const isLogin=s=>s.purpose==='Instagram login';

 function cardHtml(s){
  return `<header class="bp-head">${logoFor(s)}<div class="bp-meta"><b class="bp-purpose"></b><span class="bp-url mono"></span></div><span class="bp-dot" data-tip="Live"></span></header>
  <div class="bp-stage"><img class="bp-img" alt="Live view of the browser" draggable="false"><textarea class="bp-sink" tabindex="-1" aria-label="Keyboard input for the browser" autocomplete="off" autocapitalize="off" spellcheck="false"></textarea><span class="bp-wait">Waiting for the first frame</span></div>
  <footer class="bp-foot"><button type="button" class="btn sm bp-ctl" aria-pressed="false">You control</button><button type="button" class="btn sm bp-big">Enlarge</button>${isLogin(s)?'<button type="button" class="btn sm go bp-save">Save login</button>':''}<button type="button" class="btn sm stop bp-close">Close</button></footer>`;
 }
 function fill(el,s){
  el.querySelector('.bp-purpose').textContent=s.purpose;
  el.querySelector('.bp-url').textContent=shortUrl(s.url);
  el.querySelector('.bp-url').title=s.title||s.url||'';
  const c=el.querySelector('.bp-ctl');c.classList.toggle('on',Boolean(s.control));c.setAttribute('aria-pressed',String(Boolean(s.control)));
  el.classList.toggle('ctl',Boolean(s.control));
  const w=el.querySelector('.bp-wait');if(w)w.hidden=Boolean(s.hasFrame);
 }
 function makeCard(s){
  const el=document.createElement('section');el.className='bp-card';el.dataset.bid=s.id;el.innerHTML=cardHtml(s);
  const stage=el.querySelector('.bp-stage');wireStage(stage,s.id);
  el.querySelector('.bp-ctl').onclick=()=>setControl(s.id,!state.sessions.get(s.id)?.control);
  el.querySelector('.bp-big').onclick=()=>openBig(s.id);
  el.querySelector('.bp-close').onclick=async e=>{e.currentTarget.disabled=true;try{await api(`/api/browser/${s.id}/close`,{});}catch(err){toast(err.message,'bad');}await sync();};
  const save=el.querySelector('.bp-save');if(save)save.onclick=()=>saveLogin(save);
  return el;
 }
 const emptyHtml=()=>`<div class="bp-empty"><img class="bp-solari" src="/logos/solari.png" alt="Solari"><b>No browser is open</b><span>Sites Mint visits and Instagram messages show up here while they run.</span>${igBlock()}</div>`;
 const igBlock=()=>state.ig.connected
  ?`<div class="bp-igstate ok">${IG_MARK}<span>Instagram connected${state.ig.savedAt?`, saved ${esc(new Date(state.ig.savedAt).toLocaleDateString())}`:''}</span></div>`
  :`<button type="button" class="btn go bp-ig" data-act="connect">${IG_MARK}Connect Instagram</button><button type="button" class="btn sm bp-savebtn" data-act="save" disabled>Save login</button>`;

 function paint(){
  document.body.classList.toggle('bp-live',state.sessions.size>0);
  let list=root.querySelector('.bp-list');
  if(!list){root.innerHTML='<div class="bp-list"></div>';list=root.querySelector('.bp-list');}
  const ids=[...state.sessions.keys()];
  for(const el of [...list.children])if(el.classList.contains('bp-card')&&!state.sessions.has(el.dataset.bid)){stopStream(el.querySelector('img'));el.remove();}
  list.querySelector('.bp-empty')?.remove();list.querySelector('.bp-bar')?.remove();
  if(!ids.length){list.insertAdjacentHTML('beforeend',emptyHtml());wireActions(list);if(state.big)closeBig();return;}
  if(!state.ig.connected&&![...state.sessions.values()].some(isLogin)){list.insertAdjacentHTML('afterbegin',`<div class="bp-bar"><button type="button" class="btn sm bp-ig" data-act="connect">${IG_MARK}Connect Instagram</button></div>`);wireActions(list);}
  for(const id of ids){
   const s=state.sessions.get(id);
   let el=list.querySelector(`[data-bid="${CSS.escape(id)}"]`);
   if(!el){el=makeCard(s);list.append(el);}
   fill(el,s);
   const img=el.querySelector('img.bp-img');
   if(paused()){if(streams.has(img))stopStream(img);}else if(!streams.has(img))startStream(img,id);
  }
  if(state.big){const s=state.sessions.get(state.big);if(!s)closeBig();else fillBig(s);}
 }
 function wireActions(scope){
  scope.querySelectorAll('[data-act="connect"]').forEach(b=>b.onclick=()=>connect(b));
 }

 // ---- enlarged view (in the main area, no scrim) ----
 let bigEl=null;
 function openBig(id){
  const s=state.sessions.get(id);if(!s)return;
  closeBig();
  bigEl=document.createElement('div');bigEl.className='bpview';bigEl.dataset.bid=id;
  bigEl.innerHTML=`<div class="bp-bigbar">${logoFor(s)}<div class="bp-meta"><b class="bp-purpose"></b><span class="bp-url mono"></span></div><button type="button" class="btn sm bp-ctl" aria-pressed="false">You control</button>${isLogin(s)?'<button type="button" class="btn sm go bp-save">Save login</button>':''}<button type="button" class="btn sm bp-bigx">Close view</button></div><div class="bp-stage" data-big="1"><img class="bp-img" alt="Live view of the browser" draggable="false"><textarea class="bp-sink" tabindex="-1" aria-label="Keyboard input for the browser" autocomplete="off" autocapitalize="off" spellcheck="false"></textarea></div>`;
  (document.querySelector('.center')||document.body).append(bigEl);
  state.big=id;
  wireStage(bigEl.querySelector('.bp-stage'),id);
  bigEl.querySelector('.bp-ctl').onclick=()=>setControl(id,!state.sessions.get(id)?.control);
  bigEl.querySelector('.bp-bigx').onclick=closeBig;
  const sv=bigEl.querySelector('.bp-save');if(sv)sv.onclick=()=>saveLogin(sv);
  startStream(bigEl.querySelector('img'),id);
  fillBig(s);
 }
 function fillBig(s){
  if(!bigEl)return;
  bigEl.querySelector('.bp-purpose').textContent=s.purpose;bigEl.querySelector('.bp-url').textContent=s.url||'Opening...';
  const c=bigEl.querySelector('.bp-ctl');c.classList.toggle('on',Boolean(s.control));c.setAttribute('aria-pressed',String(Boolean(s.control)));
 }
 function closeBig(){if(!bigEl)return;stopStream(bigEl.querySelector('img'));bigEl.remove();bigEl=null;state.big=null;}
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&bigEl&&!state.sessions.get(state.big)?.control){closeBig();e.stopPropagation();}},true);

 // ---- instagram ----
 async function connect(btn){
  btn.disabled=true;
  try{
   const out=await api('/api/instagram/connect',{});
   toast('Instagram login opened','ok','Log in here, then press Save login.');
   await sync();openRail();
   if(out.sessionId&&state.sessions.has(out.sessionId))openBig(out.sessionId);
  }catch(err){toast(err.message,'bad');btn.disabled=false;}
 }
 async function saveLogin(btn){
  btn.disabled=true;
  try{const st=await api('/api/instagram/save',{});state.ig=st;toast('Instagram connected','ok','The login is saved. DMs can send from the lead drawer.');closeBig();}
  catch(err){toast(err.message,'bad');}
  btn.disabled=false;await sync();
 }

 // ---- data ----
 async function sync(){
  try{
   const [list,ig]=await Promise.all([api('/api/browser/sessions'),api('/api/instagram/status').catch(()=>state.ig)]);
   state.ig=ig;
   const next=new Map(list.map(s=>[s.id,s]));
   for(const id of [...state.sessions.keys()])if(!next.has(id))state.sessions.delete(id);
   for(const [id,s] of next)state.sessions.set(id,s);
  }catch{}
  paint();
 }
 const stream=new EventSource('/api/stream');
 stream.onmessage=msg=>{
  let c;try{c=JSON.parse(msg.data);}catch{return;}
  if(c.kind!=='browser')return;
  if(c.op==='end'){state.sessions.delete(c.id);if(state.big===c.id)closeBig();paint();if(!state.sessions.size)sync();return;}
  if(c.session){state.sessions.set(c.session.id,c.session);paint();}
 };
 stream.onopen=()=>sync();
 new MutationObserver(()=>paint()).observe(root,{attributes:true,attributeFilter:['hidden']});
 setInterval(()=>{if(!document.hidden)sync();},20000);
 paint();sync();
 return {sync,openBig};
}
