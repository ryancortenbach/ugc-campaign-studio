import {conceptPacket} from './concept-library.js';
import {makePlan} from './planner.js';
import {parseProductionPacket} from './import-packet.js';
import {getProductionPlan,getProductionVersions,renderProduction,installProductionPlan} from './production.js';
import {fields,emptyBrief,normalizeBrief,nextField,guidedTurn,productionPacket} from './brief.js';
const $=s=>document.querySelector(s);const storeKey='ugc-studio-v1';
let state={brief:emptyBrief(),messages:[],campaigns:[],id:null,planId:''};
try{const saved=JSON.parse(localStorage.getItem(storeKey));if(saved){state={...state,...saved,brief:normalizeBrief(saved.brief)};}}catch{}
function currentPacket(){const packet=productionPacket(state.brief);packet.production.storyboard=getProductionPlan(state.brief,state.planId);packet.production.storyboardVersions=getProductionVersions(state.brief,state.planId);return packet;}
function persist(){try{localStorage.setItem(storeKey,JSON.stringify(state));return true;}catch{$('#saved-status').textContent='Browser storage unavailable. Export JSON to keep your work.';return false;}}
function msg(role,text){state.messages.push({role,text});}
function render(){
 const area=$('#messages');area.replaceChildren();for(const m of state.messages){const node=document.createElement('div');node.className='message '+m.role;node.textContent=m.text;area.append(node);}area.scrollTop=area.scrollHeight;
 const container=$('#brief-fields');container.replaceChildren();for(const [key]of fields){const row=document.createElement('div');row.className='field';const label=document.createElement('div');label.className='label';label.textContent=key;const edit=document.createElement('button');edit.type='button';edit.className='edit';edit.textContent='Edit';edit.addEventListener('click',()=>{const answer=prompt('Update '+key,state.brief[key]);if(answer!==null){state.brief[key]=answer.slice(0,6000);persist();render();}});label.append(edit);const value=document.createElement('div');value.className='value'+(state.brief[key]?'':' empty');value.textContent=state.brief[key]||'Waiting for your direction';row.append(label,value);container.append(row);}
 const filled=fields.filter(([k])=>state.brief[k].trim()).length;$('#percent').textContent=Math.round(filled/8*100)+'%';$('progress').value=filled;$('#status').textContent=filled===8?'Ready for review':'Draft';$('#count').textContent=state.campaigns.length;
 renderProduction(state.brief,state.planId);const packet=currentPacket();window.dispatchEvent(new Event('ugc-campaign-change'));$('#packet').textContent=JSON.stringify(packet,null,2);$('#avatar-content').textContent='CREATOR IDENTITY\n\n'+(state.brief.avatar||'Describe the creator in your conversation.')+'\n\nVOICE AND DELIVERY\n\n'+(state.brief.voice||'Your voice direction will appear here.')+'\n\nCONSISTENCY RULES\n\n'+packet.avatarBible.consistency.join('\n')+'\n\nAPPROVAL\n\nReference image and voice approval pending.';
 $('#campaign-list').replaceChildren();if(!state.campaigns.length){const p=document.createElement('p');p.className='muted';p.textContent='Your saved campaigns will appear here. Start with a conversation.';$('#campaign-list').append(p);}for(const c of state.campaigns){const card=document.createElement('article');card.className='panel card';const title=document.createElement('strong');title.textContent=c.brief.brand||'Untitled campaign';const desc=document.createElement('p');desc.textContent=c.brief.objective||'Draft campaign';const creative=document.createElement('p');creative.className='muted';creative.textContent=(c.brief.creative||'Creative direction not supplied.').slice(0,240);const open=document.createElement('button');open.className='outline';open.textContent='Open campaign';open.setAttribute('aria-label','Open campaign: '+(c.brief.creative||c.brief.brand||'Untitled').slice(0,90));open.onclick=()=>{state.brief=normalizeBrief(c.brief);state.messages=c.messages||[];state.id=c.id;state.planId=c.planId||'';persist();render();view('create');};card.append(title,desc,creative,open);$('#campaign-list').append(card);}
}
function view(id){document.querySelectorAll('.view').forEach(el=>el.hidden=el.id!==id);document.querySelectorAll('nav button').forEach(el=>el.classList.toggle('active',el.dataset.view===id));}
function start(){state.brief=emptyBrief();state.messages=[];state.id=null;state.planId=crypto.randomUUID();msg('assistant','Let’s build a creator campaign with a clear identity. I’ll turn your answers into a brand brief, avatar bible, and production handoff.\n\n'+fields[0][1]);persist();render();view('create');}
if(!state.messages.length)start();else render();
$('nav').onclick=e=>{const b=e.target.closest('button');if(b)view(b.dataset.view);};
$('#new').onclick=()=>{if(!state.messages.some(m=>m.role==='user')||confirm('Start a new draft? Export or save this campaign first if you want to keep it.'))start();};
$('.suggestions').onclick=e=>{if(e.target.dataset.suggestion){$('#message').value=e.target.dataset.suggestion;$('#message').focus();}};
$('#mode').onchange=()=>{$('#mode-note').textContent=$('#mode').value==='ai'?'AI requires server configuration.':'Structured intake. No model connected.';};
$('#chat-form').onsubmit=async e=>{e.preventDefault();const message=$('#message').value.trim();if(!message)return;$('#error').textContent='';$('#send').disabled=true;let result;
 try{if($('#mode').value==='guided'){result=guidedTurn({message,brief:state.brief});}else{const res=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+$('#access-token').value},body:JSON.stringify({message,brief:state.brief,mode:'ai'})});result=await res.json();if(!res.ok)throw Error(result.error||'Unable to complete the request.');}
 msg('user',message);state.brief=normalizeBrief(result.brief);msg('assistant',result.reply);$('#message').value='';persist();render();}catch(err){$('#error').textContent=err.message;}finally{$('#send').disabled=false;}
};
$('#save').onclick=()=>{const id=state.id||crypto.randomUUID();state.id=id;const copy={id,brief:{...state.brief},messages:[...state.messages],planId:state.planId,updatedAt:new Date().toISOString()};state.campaigns=state.campaigns.filter(c=>c.id!==id);state.campaigns.unshift(copy);persist();render();$('#saved-status').textContent='Campaign saved on this browser.';};
$('#export').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(currentPacket(),null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='campaign-production-packet.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};

if(location.hash&&document.getElementById(location.hash.slice(1))?.classList.contains("view"))view(location.hash.slice(1));

window.addEventListener('ugc-production-change',()=>{$('#packet').textContent=JSON.stringify(currentPacket(),null,2);});

function importSource(source){
 try{
  const imported=parseProductionPacket(source),newId=crypto.randomUUID();
  installProductionPlan(imported.brief,imported.storyboard,imported.versions,newId);
  // Preserve the active campaign before opening the imported copy.
  if(fields.some(([key])=>state.brief[key]?.trim())){
   const oldId=state.id||crypto.randomUUID();const prior={id:oldId,brief:{...state.brief},messages:[...state.messages],planId:state.planId,updatedAt:new Date().toISOString()};
   state.campaigns=[prior,...state.campaigns.filter(c=>c.id!==oldId)];
  }
  state.id=newId;state.planId=newId;state.brief=imported.brief;state.messages=[{role:'assistant',text:'Imported a local production packet. Review the brief and storyboard. All approvals remain pending.'}];
  state.campaigns.unshift({id:newId,planId:newId,brief:{...state.brief},messages:[...state.messages],updatedAt:new Date().toISOString()});
  const saved=persist();render();view('production');$('#import-status').textContent='Imported '+imported.versions.length+' storyboard versions. Approval flags reset. '+(saved?'Existing campaigns preserved.':'Browser storage unavailable. Export before leaving.');return true;
 }catch(error){$('#import-status').textContent='Import stopped: '+error.message;return false;}
}
$('#import-packet').onclick=()=>$('#import-file').click();
$('#import-file').onchange=async()=>{const file=$('#import-file').files?.[0];if(!file)return;try{if(file.size>2*1024*1024)throw Error('Choose a JSON packet no larger than 2 MB.');importSource(await file.text());}catch(error){$('#import-status').textContent='Import stopped: '+error.message;}finally{$('#import-file').value='';}};
$('#import-pasted').onclick=()=>importSource($('#import-json').value);

window.addEventListener('ugc-prospect-campaign',event=>{
 const brief=normalizeBrief(event.detail?.brief),newId=crypto.randomUUID();
 try{installProductionPlan(brief,makePlan(brief,5),[],newId);
  if(fields.some(([key])=>state.brief[key]?.trim())){const oldId=state.id||crypto.randomUUID();state.campaigns=[{id:oldId,brief:{...state.brief},messages:[...state.messages],planId:state.planId,updatedAt:new Date().toISOString()},...state.campaigns.filter(c=>c.id!==oldId)];}
  state.id=newId;state.planId=newId;state.brief=brief;state.messages=[{role:'assistant',text:'Created a five-second campaign draft from public prospect research. Add the actual product, audience, avatar, voice, references and approved script before rendering.'}];state.campaigns.unshift({id:newId,planId:newId,brief:{...brief},messages:[...state.messages],updatedAt:new Date().toISOString()});persist();render();view('production');$('#plan-status').textContent='Five-second draft created. No video generated, no message sent, approvals pending.';
 }catch(error){$('#outreach-save-status').textContent=error.message;}
});

window.addEventListener('ugc-concept-draft',event=>{
 try{const packet=conceptPacket(state.brief,getProductionPlan(state.brief,state.planId),event.detail?.id);if(!importSource(JSON.stringify(packet))){$('#concept-status').textContent=$('#import-status').textContent;return;}$('#plan-status').textContent='Original concept draft opened. Reference assets, script, claims and spend approval are pending. '+$('#import-status').textContent;}catch(error){$('#concept-status').textContent=error.message;}
});

window.addEventListener('ugc-alert-open',()=>view('operations'));
