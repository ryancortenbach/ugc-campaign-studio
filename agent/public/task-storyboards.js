import {icons} from './icons.js';
import {toolLogRow} from './tool-logs.js';
import {paintDelivery} from './delivery.js';
let active=null;
const planningStatus={planning:['Ideation in progress','s-run'],running:['Research in progress','s-run'],researching:['Research in progress','s-run'],queued:['Research queued','s-wait'],research_queued:['Research queued','s-wait'],paused:['Paused','s-you'],stopped:['Stopped','s-idle'],done:['Brief saved','s-ok'],ready:['Ideas ready','s-ok'],needs_brand:['Needs brand','s-you'],not_started:['Not started','s-idle'],needs_research:['Research needs review','s-you'],failed:['Research paused','s-bad']};
const statusChip=status=>{const [label,cls]=planningStatus[status]||['Not started','s-idle'];return `<span class="schip ${cls}"><svg class="lu" viewBox="0 0 24 24" aria-hidden="true">${icons[cls==='s-run'?'loader':cls==='s-ok'?'circle-check':cls==='s-wait'?'clock':'circle-alert']}</svg>${label}</span>`;};
function activityHTML(workspace,esc){
 const events=workspace.events||[],entries=events.filter(e=>e.type==='tool_call'||(e.type==='error'&&e.tool)).slice(-12).reverse();
 return entries.length?entries.map(e=>toolLogRow(e,{events,esc})).join(''):'<p class="faint">Research tool calls will appear here as the brand is qualified.</p>';
}
function paintActivity(context,workspace){
 const container=context.view.querySelector('#task-board-activity'),html=activityHTML(workspace,context.esc);
 if(context.activityHTML===html)return;
 const focused=container.contains(document.activeElement)?document.activeElement:null;
 const focusRow=focused?.closest('[data-ap-log]'),focusDetails=focused?.closest('details');
 const focusLabel=focusDetails?.classList.contains('ap-log-payload')?focusDetails.querySelector('summary')?.textContent:null;
 const states=new Map([...container.querySelectorAll('[data-ap-log]')].map(row=>[row.dataset.apLog,{open:row.open,payloads:new Map([...row.querySelectorAll('.ap-log-payload')].map(detail=>[detail.querySelector('summary')?.textContent,detail.open]))}]));
 container.innerHTML=html;context.activityHTML=html;
 for(const row of container.querySelectorAll('[data-ap-log]')){
  const state=states.get(row.dataset.apLog);if(!state)continue;
  row.open=state.open;
  for(const detail of row.querySelectorAll('.ap-log-payload')){
   const label=detail.querySelector('summary')?.textContent;if(state.payloads.has(label))detail.open=state.payloads.get(label);
  }
  if(focusRow?.dataset.apLog===row.dataset.apLog){
   const target=focusLabel?[...row.querySelectorAll('.ap-log-payload')].find(detail=>detail.querySelector('summary')?.textContent===focusLabel)?.querySelector('summary'):row.querySelector('summary');
   target?.focus({preventScroll:true});
  }
 }
 if(focused&&!container.contains(document.activeElement))container.closest('.task-ideas-activity')?.querySelector(':scope > summary')?.focus({preventScroll:true});
}
function paintProgress(context,workspace){
 if(active!==context||!context.isCurrent()||!context.view.isConnected||!context.view.querySelector('#task-ideas-report'))return;
 context.view.querySelector('#task-ideas-status').innerHTML=statusChip(workspace.reportStatus||workspace.task.status);
 paintActivity(context,workspace);
 const report=context.view.querySelector('#task-ideas-report'),key=`${workspace.revision}:${workspace.task.status}`;
 if(report.dataset.version!==key){report.dataset.version=key;report.data=`${context.reportUrl||`/api/tasks/${context.taskId}/ideas.pdf`}?v=${encodeURIComponent(key)}`;}
}
export async function refreshTaskStoryboardActivity(){
 const context=active;if(!context?.view.isConnected)return;
 const sequence=context.refreshSequence=(context.refreshSequence||0)+1;
 try{const {workspace}=await context.api(context.apiPath||`/api/tasks/${context.taskId}/storyboard`);if(active===context&&sequence===context.refreshSequence)paintProgress(context,workspace);}catch{}
}
export async function taskStoryboardView({view,api,esc,toast,taskId,isCurrent=()=>true}){
 const context={view,api,esc,taskId,isCurrent};active=context;
 const current=()=>active===context&&isCurrent()&&view.isConnected;
 const {workspace}=await api(`/api/tasks/${taskId}/storyboard`);
 if(!current())return;
 const url=`/api/tasks/${taskId}/ideas.pdf`,brand=workspace.lead.company||workspace.lead.domain;
 view.innerHTML=`<div class="pagebar task-ideas-heading"><div><a class="faint" href="#/tasks">Tasks</a><h2>${esc(brand)}</h2></div><span id="task-ideas-status">${statusChip(workspace.task.status)}</span><a class="btn sm" href="${url}" target="_blank" rel="noopener">Open PDF</a></div>
 <object id="task-ideas-report" class="task-ideas-report" type="application/pdf" aria-label="${esc(brand)} creative ideas report" data="${url}"><p>Your ideas report is ready to view. <a href="${url}" target="_blank" rel="noopener">Open the PDF</a>.</p></object>
 <details class="task-ideas-activity"><summary>Task activity</summary><div id="task-board-activity">${activityHTML(workspace,esc)}</div></details>`;
 paintProgress(context,workspace);
}
export async function clientProjectView({view,api,esc,toast,paymentId,taskId,isCurrent=()=>true}){
 const previous=active,context={view,api,esc,taskId,isCurrent};active=context;
 context.apiPath=paymentId?`/api/whop/orders/${encodeURIComponent(paymentId)}/report`:`/api/tasks/${taskId}/client-report`;
 let workspace;
 try{({workspace}=await api(context.apiPath));}
 catch(error){if(active===context&&previous?.view===view&&isCurrent()&&previous.isCurrent()&&view.isConnected)active=previous;throw error;}
 if(active!==context||!isCurrent())return;
 const id=workspace.order.payment_id,url=`/api/whop/orders/${encodeURIComponent(id)}/brief.pdf`;context.reportUrl=url;
 const brand=workspace.order.brand_domain||workspace.order.buyer_name||'Client project';
 view.innerHTML=`<div class="pagebar task-ideas-heading"><div><a class="faint" href="#/tasks">Tasks</a><h2>${esc(brand)}</h2><p class="faint">${esc(workspace.order.product||'Creative brief')}</p></div><span id="task-ideas-status"></span><a class="btn sm" href="${url}" target="_blank" rel="noopener">Open PDF</a></div>
 ${!workspace.order.brand_domain?'<form class="client-brand-form"><label for="client-brand">Which brand is this for?</label><input type="text" id="client-brand" name="domain" placeholder="brand.com" required><button class="btn sm" type="submit">Save brand</button><span class="faint">Saves context only. Research stays paused.</span></form>':''}
 <section id="order-delivery" class="card order-delivery" aria-live="polite"></section>
 <object id="task-ideas-report" class="task-ideas-report" type="application/pdf" aria-label="Client creative brief" data="${url}"><p><a href="${url}" target="_blank" rel="noopener">Open the creative brief PDF</a>.</p></object><details class="task-ideas-activity"><summary>Task activity</summary><div id="task-board-activity">${activityHTML(workspace,esc)}</div></details>`;
 paintProgress(context,workspace);
 paintDelivery({el:view.querySelector('#order-delivery'),api,esc,toast,paymentId:id,isCurrent:()=>active===context&&isCurrent()});
 const form=view.querySelector('.client-brand-form');if(form)form.onsubmit=async e=>{e.preventDefault();const b=form.querySelector('button');b.disabled=true;try{await api(`/api/whop/orders/${encodeURIComponent(id)}/context`,{domain:form.querySelector('input').value});if(active===context&&isCurrent())await clientProjectView({view,api,esc,toast,paymentId:id,isCurrent});}catch(error){toast(error.message,'bad');b.disabled=false;}};
}
export async function storyboardTasksView({view,api,esc,isCurrent=()=>true}){
 const {workspaces}=await api('/api/storyboard-tasks');
 if(!isCurrent())return;
 view.innerHTML=`<div class="pagebar"><div><h2>Brand ideas</h2><p class="faint">Research and creative ideas, one report per brand.</p></div></div><div class="stack">${workspaces.map(w=>`<a class="card task-board-card" href="#/tasks/${w.taskId}"><div class="head"><h2>${esc(w.brand)}</h2>${statusChip(w.status)}</div><div class="body"><p>${esc(w.title)}</p><p class="faint">${w.stages.filter(s=>['done','ready','passed'].includes(s.status)).length} of ${w.stages.length} stages ready · Open report</p></div></a>`).join('')||'<div class="card"><div class="empty">Ideas appear here when a brand enters outreach.</div></div>'}</div>`;
}
