import {getProductionPlan,getProductionVersions,renderProduction} from './production.js';
import {fields,emptyBrief,normalizeBrief,nextField,guidedTurn,productionPacket} from './brief.js';
const $=s=>document.querySelector(s);const storeKey='ugc-studio-v1';
let state={brief:emptyBrief(),messages:[],campaigns:[],id:null};
try{const saved=JSON.parse(localStorage.getItem(storeKey));if(saved){state={...state,...saved,brief:normalizeBrief(saved.brief)};}}catch{}
function currentPacket(){const packet=productionPacket(state.brief);packet.production.storyboard=getProductionPlan(state.brief);packet.production.storyboardVersions=getProductionVersions(state.brief);return packet;}
function persist(){try{localStorage.setItem(storeKey,JSON.stringify(state));}catch{$('#saved-status').textContent='Browser storage unavailable. Export JSON to keep your work.';}}
function msg(role,text){state.messages.push({role,text});}
function render(){
 const area=$('#messages');area.replaceChildren();for(const m of state.messages){const node=document.createElement('div');node.className='message '+m.role;node.textContent=m.text;area.append(node);}area.scrollTop=area.scrollHeight;
 const container=$('#brief-fields');container.replaceChildren();for(const [key]of fields){const row=document.createElement('div');row.className='field';const label=document.createElement('div');label.className='label';label.textContent=key;const edit=document.createElement('button');edit.type='button';edit.className='edit';edit.textContent='Edit';edit.addEventListener('click',()=>{const answer=prompt('Update '+key,state.brief[key]);if(answer!==null){state.brief[key]=answer.slice(0,6000);persist();render();}});label.append(edit);const value=document.createElement('div');value.className='value'+(state.brief[key]?'':' empty');value.textContent=state.brief[key]||'Waiting for your direction';row.append(label,value);container.append(row);}
 const filled=fields.filter(([k])=>state.brief[k].trim()).length;$('#percent').textContent=Math.round(filled/8*100)+'%';$('progress').value=filled;$('#status').textContent=filled===8?'Ready for review':'Draft';$('#count').textContent=state.campaigns.length;
 renderProduction(state.brief);const packet=currentPacket();$('#packet').textContent=JSON.stringify(packet,null,2);$('#avatar-content').textContent='CREATOR IDENTITY\n\n'+(state.brief.avatar||'Describe the creator in your conversation.')+'\n\nVOICE AND DELIVERY\n\n'+(state.brief.voice||'Your voice direction will appear here.')+'\n\nCONSISTENCY RULES\n\n'+packet.avatarBible.consistency.join('\n')+'\n\nAPPROVAL\n\nReference image and voice approval pending.';
 $('#campaign-list').replaceChildren();if(!state.campaigns.length){const p=document.createElement('p');p.className='muted';p.textContent='Your saved campaigns will appear here. Start with a conversation.';$('#campaign-list').append(p);}for(const c of state.campaigns){const card=document.createElement('article');card.className='panel card';const title=document.createElement('strong');title.textContent=c.brief.brand||'Untitled campaign';const desc=document.createElement('p');desc.textContent=c.brief.objective||'Draft campaign';const open=document.createElement('button');open.className='outline';open.textContent='Open campaign';open.onclick=()=>{state.brief=normalizeBrief(c.brief);state.messages=c.messages||[];state.id=c.id;persist();render();view('create');};card.append(title,desc,open);$('#campaign-list').append(card);}
}
function view(id){document.querySelectorAll('.view').forEach(el=>el.hidden=el.id!==id);document.querySelectorAll('nav button').forEach(el=>el.classList.toggle('active',el.dataset.view===id));}
function start(){state.brief=emptyBrief();state.messages=[];state.id=null;msg('assistant','Let’s build a creator campaign with a clear identity. I’ll turn your answers into a brand brief, avatar bible, and production handoff.\n\n'+fields[0][1]);persist();render();view('create');}
if(!state.messages.length)start();else render();
$('nav').onclick=e=>{const b=e.target.closest('button');if(b)view(b.dataset.view);};
$('#new').onclick=()=>{if(!state.messages.some(m=>m.role==='user')||confirm('Start a new draft? Export or save this campaign first if you want to keep it.'))start();};
$('.suggestions').onclick=e=>{if(e.target.dataset.suggestion){$('#message').value=e.target.dataset.suggestion;$('#message').focus();}};
$('#mode').onchange=()=>{$('#mode-note').textContent=$('#mode').value==='ai'?'AI requires server configuration.':'Structured intake. No model connected.';};
$('#chat-form').onsubmit=async e=>{e.preventDefault();const message=$('#message').value.trim();if(!message)return;$('#error').textContent='';$('#send').disabled=true;let result;
 try{if($('#mode').value==='guided'){result=guidedTurn({message,brief:state.brief});}else{const res=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+$('#access-token').value},body:JSON.stringify({message,brief:state.brief,mode:'ai'})});result=await res.json();if(!res.ok)throw Error(result.error||'Unable to complete the request.');}
 msg('user',message);state.brief=normalizeBrief(result.brief);msg('assistant',result.reply);$('#message').value='';persist();render();}catch(err){$('#error').textContent=err.message;}finally{$('#send').disabled=false;}
};
$('#save').onclick=()=>{const id=state.id||crypto.randomUUID();state.id=id;const copy={id,brief:{...state.brief},messages:[...state.messages],updatedAt:new Date().toISOString()};state.campaigns=state.campaigns.filter(c=>c.id!==id);state.campaigns.unshift(copy);persist();render();$('#saved-status').textContent='Campaign saved on this browser.';};
$('#export').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(currentPacket(),null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='campaign-production-packet.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};

if(location.hash&&document.getElementById(location.hash.slice(1))?.classList.contains("view"))view(location.hash.slice(1));

window.addEventListener('ugc-production-change',()=>{$('#packet').textContent=JSON.stringify(currentPacket(),null,2);});
