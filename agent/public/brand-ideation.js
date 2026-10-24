import {toolLogRow} from './tool-logs.js';
const labels={queued:'Research queued',researching:'Research in progress',ideating:'Ideation in progress',ready:'Ideas ready',needs_research:'Research needs review',failed:'Research paused',canceled:'Planning stopped'};
export function ideationPanel(ideation,events=[],{esc,icon=()=>''}={}){
 const active=['researching','ideating','queued'].includes(ideation?.status),attention=['needs_research','failed'].includes(ideation?.status);
 const cls=active?'s-run':attention?'s-you':ideation?'s-ok':'s-idle';
 const title=labels[ideation?.status]||'Awaiting qualification';
 const toolEvents=events.filter(e=>e.data?.callId&&['tool_call','tool_result'].includes(e.type));
 const calls=toolEvents.filter(e=>e.type==='tool_call').slice(-12).reverse();
 return `<div class="ap-ideation-head"><span class="lstat ${cls}">${icon(active?'loader':attention?'circle-alert':ideation?'circle-check':'clock')}<span>${esc(title)}</span></span></div>${ideation?.taskId?`<a class="ap-ideas-link" href="#/tasks/${ideation.taskId}">View ideas PDF</a>`:''}${attention?'<button type="button" class="btn sm" data-retry-ideation>Retry research · $0</button>':''}${ideation?.error?`<p class="faint">${esc(ideation.error)}</p>`:''}${ideation?.result?.unknowns?.length?`<details class="ap-ideation-notes"><summary>Research gaps</summary>${ideation.result.unknowns.map(x=>`<p class="faint">${esc(x)}</p>`).join('')}</details>`:''}${calls.length?`<details class="ap-ideation-tools" open><summary>Research tools <span class="faint">${calls.length}</span></summary><div>${calls.map(e=>toolLogRow(e,{events:toolEvents,esc})).join('')}</div></details>`:''}`;
}
