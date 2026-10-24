// "Human check" for a finished render: recruits real people on Terac to rate the clip, then shows the Human panel score ring.
// Mounted from app.js with panelSection({render,api,esc,toast,host}). Nothing is spent until Ryan presses Start on the confirm row.
const hosts=new Map(); // renderId -> {host,deps}
let stream=null,cssDone=false;
const ringColor=n=>n<70?'var(--red)':n<90?'var(--yellow)':'var(--green)';
const ring=score=>{const n=Math.max(0,Math.min(100,Math.round(Number(score)||0)));return `<span class="ring sm" style="--c:${ringColor(n)}"><svg viewBox="0 0 36 36" aria-hidden="true"><circle class="rt" cx="18" cy="18" r="15.5" pathLength="100"/><circle class="rf" cx="18" cy="18" r="15.5" pathLength="100" stroke-dasharray="${n} 100"/></svg><b>${n}</b></span>`;};
const usd=v=>v==null?null:`$${Number(v).toFixed(2)}`;
const MIN=3,MAX=20;

function css(){
 if(cssDone)return;cssDone=true;
 const l=document.createElement('link');l.rel='stylesheet';l.href='/panel-check.css';document.head.appendChild(l);
}
function listen(){
 if(stream||typeof EventSource==='undefined')return;
 try{
  stream=new EventSource('/api/stream');
  stream.onmessage=m=>{
   let c;try{c=JSON.parse(m.data);}catch{return;}
   if(c.kind!=='panel'||!c.panel)return;
   const slot=hosts.get(c.panel.render_id);
   if(slot&&slot.host.isConnected&&!slot.busy)paint(slot,c.panel);
  };
 }catch{}
}

export function panelSection({render,api,esc,toast,host}){
 css();listen();
 if(!host||!render)return null;
 const slot={host,deps:{render,api,esc,toast},panel:null,confirming:false,busy:null,timer:null};
 hosts.set(render.id,slot);
 paint(slot,null);
 api(`/api/panels?renderId=${render.id}`).then(r=>{slot.ready=r.ready;slot.panel=(r.panels||[]).find(p=>p.status!=='failed')||null;paint(slot,slot.panel);}).catch(()=>paint(slot,null,'The human check is not available right now.'));
 return host;
}

function paint(slot,panel,problem){
 const {render,api,esc,toast}=slot.deps,host=slot.host;
 if(panel!==undefined&&panel!==null)slot.panel=panel;
 const p=slot.panel,ready=slot.ready||{};
 const logo='<img class="pc-logo" src="/logos/terac.png" alt="">';
 let html='';
 if(slot.busy){
  html=`<div class="pc-row">${logo}<span class="pc-price">${esc(slot.busy)}</span></div>`;
 }else if(!p){
  const off=ready.terac===false?'Add TERAC_API_KEY to use this.':ready.database===false?'The panel database is not set up yet.':'';
  html=`<div class="pc-row"><button type="button" class="btn sm" data-pc="create" ${off?'disabled':''} data-tip="Real people rate this clip">${logo}Human check</button>${off?`<span class="pc-price">${esc(off)}</span>`:'<span class="pc-price">Draft is free. You approve the cost before anything is spent.</span>'}</div>${problem?`<div class="pc-err">${esc(problem)}</div>`:''}`;
 }else{
  const a=p.audience||{};
  const chips=[a.city&&a.state?`${a.city}, ${a.state}`:a.city||a.state||'United States',a.age?`Age ${a.age}`:null,a.income||null].filter(Boolean).map(c=>`<span class="pc-chip">${esc(c)}</span>`).join('');
  const per=usd(p.price_per_participant),total=usd(p.total_usd);
  const link=p.links?.submissions||p.links?.study||p.links?.draft_editor;
  if(p.status==='draft'){
   html=`<div class="pc-row"><span class="pc-price">People</span><span class="pc-step"><button type="button" data-pc="less" aria-label="Fewer people" ${p.participants<=MIN?'disabled':''}>-</button><b>${p.participants}</b><button type="button" data-pc="more" aria-label="More people" ${p.participants>=MAX?'disabled':''}>+</button></span><span class="pc-price">${per?`<b>${per}</b> each, <b>${total||'?'}</b> total`:'Price is being worked out'}</span></div>
    <div class="pc-chips">${chips}</div>
    ${slot.confirming
     ?`<div class="pc-confirm"><span>Spend <b>${total}</b> on ${p.participants} people now?</span><button type="button" class="btn sm go" data-pc="start">Start</button><button type="button" class="btn sm" data-pc="cancel">Cancel</button></div>`
     :`<div class="pc-row"><button type="button" class="btn sm go" data-pc="launch" ${total?'':'disabled'}>Launch ${total||''}</button>${link?`<a href="${esc(link)}" target="_blank" rel="noopener">Review draft on Terac</a>`:''}</div>`}
    ${problem||p.error?`<div class="pc-err">${esc(problem||p.error)}</div>`:''}`;
  }else{
   const done=p.responses||0;
   html=`<div class="pc-live">${p.score!=null?ring(p.score):''}<div><div><b>${done} of ${p.participants}</b> rated${p.status==='complete'?', complete':''}</div><div class="pc-price">${p.score!=null?'Human panel score, average rating out of 10 times 10':'Waiting for people to rate it'}</div></div></div>
    <div class="pc-chips">${chips}</div>
    <div class="pc-row">${p.status==='launched'?'<button type="button" class="btn sm" data-pc="sync">Check now</button>':''}${link?`<a href="${esc(link)}" target="_blank" rel="noopener">Open on Terac</a>`:''}</div>${problem||p.error?`<div class="pc-err">${esc(problem||p.error)}</div>`:''}`;
  }
 }
 host.innerHTML=`<div class="pc">${html}</div>`;
 const on=(k,fn)=>host.querySelector(`[data-pc="${k}"]`)?.addEventListener('click',fn);
 const run=async(label,fn)=>{slot.busy=label;paint(slot);try{const r=await fn();if(r?.panel)slot.panel=r.panel;slot.busy=null;paint(slot);}catch(e){slot.busy=null;paint(slot,undefined,e.message);toast(e.message,'bad');}};
 on('create',()=>run('Setting up the panel on Terac. This takes a few minutes.',async()=>{const r=await api(`/api/renders/${render.id}/panel`,{participants:5});toast('Panel drafted','ok','Nothing is spent until you press Launch.');return r;}));
 const step=d=>{const n=Math.max(MIN,Math.min(MAX,p.participants+d));if(n===p.participants)return;slot.confirming=false;run('Updating the price...',()=>api(`/api/panels/${p.id}/participants`,{participants:n}));};
 on('less',()=>step(-1));on('more',()=>step(1));
 on('launch',()=>{slot.confirming=true;paint(slot);});
 on('cancel',()=>{slot.confirming=false;paint(slot);});
 on('start',()=>{slot.confirming=false;run('Launching...',async()=>{const r=await api(`/api/panels/${p.id}/launch`,{confirm:true});toast('Panel launched','ok','People are being recruited.');return r;});});
 on('sync',()=>run('Checking...',()=>api(`/api/panels/${p.id}/sync`,{})));
}
