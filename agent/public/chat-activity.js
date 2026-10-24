// Native DOM port of Offload's AgentActivity and ToolChips interaction.
// Source and adaptation notes: docs/OFFLOAD-CHAT-ACTIVITY-v1.md.
import {pairTools} from './live-feed-model.js';
import {safeLogValue} from './tool-logs.js';
import {watchRecords} from './render-monitor.js';

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const json=v=>esc(JSON.stringify(safeLogValue(v),null,2));
const labels={prepare_client_demo:'Load the saved client demo',start_mission:'Create outreach task',get_overview:'Check workspace',get_mission:'Read task',find_leads:'Find brands',get_lead:'Read brand','production.research_plan':'Plan brand research','production.research_search_free':'Search Exa','production.research_add_evidence':'Save source evidence','production.research_synthesize':'Build research profile','streetwear_demo.assemble':'Assemble brief and references','higgsfield.genjutsu-light':'Render hoodie sample','media.finish':'Restore audio and add website CTA','media.visual_review':'Review garment continuity','imagegen.storyboard':'Prepare consistent wardrobe frames'};
const service=tool=>/research_search|exa/.test(tool)?'exa':/higgsfield|genjutsu/.test(tool)?'higgsfield':/gmail/.test(tool)?'gmail':/solari/.test(tool)?'solari':/imagegen/i.test(tool)?null:'claude';
const stateLabel={success:'Done',complete:'Done',completed:'Done',error:'Failed',failed:'Failed',running:'Running',in_progress:'Rendering',queued:'Queued',blocked:'Blocked',canceled:'Canceled',pending:'Pending',recorded:'Recorded',needs_revision:'Needs revision'};
const statusOf=(value,fallback='recorded')=>Object.hasOwn(stateLabel,value)?value:fallback;
const safeLink=value=>{
 if(typeof value!=='string')return '';
 const clean=safeLogValue(value);if(clean!==value)return '';
 if(/^\/(?!\/)/.test(value))return value;
 try{return ['http:','https:'].includes(new URL(value).protocol)?value:'';}catch{return '';}
};

export function activityItems(events=[]){
 return pairTools(events.filter(e=>['tool_call','tool_result'].includes(e.type))).map(({call,result})=>{
  const e=call||result,d=result?.data||{},tool=String(e.tool||'').replace(/^assistant\./,'');
  const status=statusOf(d.status,result?'recorded':call?.data?.status==='running'?'running':'recorded');
  return {id:`${e.task_id??'chat'}:${call?.id??'result'}:${result?.id??''}`,callId:call?.data?.callId,tool,label:labels[tool]||tool.replaceAll('_',' '),status,input:call?.data?.input,output:d.output,error:d.error,durationMs:d.durationMs,costUsd:d.costUsd,estimatedUsd:call?.data?.estimatedUsd,at:e.at};
 });
}

function actionItems(actions,events){
 const actual=activityItems(events);
 return actions.map((action,index)=>{
  const found=action.callId&&actual.find(item=>item.callId===action.callId);
  return found||{id:`action:${index}`,tool:action.tool,label:labels[action.tool]||action.tool,status:statusOf(action.status,/^error:/i.test(action.result_summary||'')?'error':'recorded'),input:action.input,output:action.output??action.result_summary,error:action.error,durationMs:action.durationMs};
 });
}

function itemHTML(item){
 const logo=service(item.tool),state=stateLabel[item.status],working=['running','in_progress','queued'].includes(item.status),failed=['error','failed','blocked','needs_revision'].includes(item.status);
 return `<details class="ap-chat-tool" data-ap-chat-tool="${esc(item.id)}"><summary>${logo?`<img src="/logos/${logo}.png" alt="">`:'<span class="ap-chat-symbol" aria-hidden="true">↗</span>'}<span class="ap-chat-tool-name">${esc(item.label)}</span><span class="ap-chat-tool-status ${working?'ap-chat-working':failed?'ap-chat-failed':''}">${esc(state)}</span>${Number.isFinite(item.durationMs)?`<span class="ap-chat-metric">${(item.durationMs/1000).toFixed(1)}s</span>`:''}<span class="ap-chat-chevron" aria-hidden="true">›</span></summary><div class="ap-chat-tool-detail"><small>${esc(item.tool)}</small>${item.at?`<time>${esc(item.at)}</time>`:''}${item.input!==undefined?`<b>Input</b><pre>${json(item.input)}</pre>`:''}${item.output!==undefined?`<b>Result</b><pre>${json(item.output)}</pre>`:''}${item.error?`<b>Error</b><pre>${json(item.error)}</pre>`:''}${Number.isFinite(item.costUsd)?`<p>Recorded cost: $${item.costUsd.toFixed(4)}</p>`:''}${Number.isFinite(item.estimatedUsd)?`<p>Estimate: $${item.estimatedUsd.toFixed(2)}. Itemized charge not returned.</p>`:''}</div></details>`;
}

export function activityHTML(items,{title,open=true}={}){
 if(!items.length)return '';
 const working=items.some(item=>['running','queued','in_progress'].includes(item.status));
 return `<details class="ap-chat-activity" data-ap-chat-group ${open?'open':''}><summary>${esc(title||(working?'Working':'Activity'))}<span>${items.length} tool call${items.length===1?'':'s'}</span></summary><div class="ap-chat-tools">${items.map(itemHTML).join('')}</div></details>`;
}

export function taskArtifacts(task){
 const packet=task?.plan?.clientDemo?.packet;
 if(!packet)return '';
 const artifacts=[{url:packet.offerPdfUrl,label:'Two-page brief',kind:'pdf'},{url:packet.reportUrl===packet.offerPdfUrl?null:packet.reportUrl,label:'Research document',kind:'doc'},{url:packet.persona?.imageUrl,label:'Character concept',kind:'image'},{url:packet.sampleVideo?.url,label:'Generated hoodie sample',kind:'video'}].filter(file=>safeLink(file.url));
 return `<div class="ap-chat-artifacts">${artifacts.map(file=>`<a class="ap-chat-artifact" href="${esc(safeLink(file.url))}" target="_blank" rel="noopener noreferrer">${file.kind==='image'?`<img src="${esc(safeLink(file.url))}" alt="${esc(file.label)}" loading="lazy">`:''}<span>${esc(file.label)}</span>${file.kind==='video'?`<small>${packet.sampleVideo?.visualQA?.status==='needs_revision'?'AI review: needs revision. ':''}Human review pending</small>`:''}</a>`).join('')}</div>${packet.sampleVideo?'<a class="linkbtn" href="#/renders">Review the generated clip</a>':''}`;
}

export async function mountChatActivity(host,{actions=[],events=[],pending=false,read=async(url,signal)=>{const r=await fetch(url,{signal});if(!r.ok)throw Error('Activity unavailable');return r.json();}}={}){
 const token=Symbol('activity');host._apActivity=token;
 host._apActivityWatcher?.stop();
 const owned=()=>host.isConnected&&host._apActivity===token;
 const ids=[...new Set(actions.filter(a=>a.tool==='prepare_client_demo'||a.tool==='start_mission').map(a=>a.input?.taskId??a.output?.id).filter(Number.isInteger))];
 const paint=data=>{
  if(!owned())return;
  const open=new Set([...host.querySelectorAll('details[open][data-ap-chat-tool]')].map(el=>el.dataset.apChatTool));
  const groups=[...host.querySelectorAll('[data-ap-chat-group]')].map(el=>el.open);
  host.innerHTML=activityHTML(pending?activityItems(events):actionItems(actions,events))+data.map(({task,events:taskEvents})=>`<section class="ap-chat-task"><a class="linkbtn" href="#/tasks/${esc(task.id)}">${esc(task.plan?.brand||task.prompt||'Task')}</a>${activityHTML(activityItems(taskEvents),{title:'Saved task history',open:false})}${taskArtifacts(task)}</section>`).join('');
  host.querySelectorAll('[data-ap-chat-group]').forEach((el,index)=>{if(index<groups.length)el.open=groups[index];});
  host.querySelectorAll('[data-ap-chat-tool]').forEach(el=>{el.open=open.has(el.dataset.apChatTool);});
 };
 paint([]);
 if(!ids.length)return;
 const readTasks=signal=>Promise.all(ids.map(id=>read(`/api/tasks/${id}`,signal)));
 try{
  const data=await readTasks();if(!owned())return;paint(data);
  if(!data.some(d=>['queued','running'].includes(d.task.status)||['queued','in_progress','submitting'].includes(d.task.plan?.clientDemo?.packet?.genjutsuPreparation?.submission?.status)))return;
  host._apActivityWatcher=watchRecords({schedule:(fn,ms)=>host.ownerDocument.defaultView.setTimeout(fn,ms),cancel:id=>host.ownerDocument.defaultView?.clearTimeout(id),initial:data,isCurrent:owned,read:readTasks,onChange:paint,onStatus:({ok})=>{host.dataset.apActivityConnection=ok?'connected':'retrying';}});
 }catch{if(owned())host.insertAdjacentHTML('beforeend','<p class="hint" role="status">Saved task history is unavailable. Open the task to retry.</p>');}
}
