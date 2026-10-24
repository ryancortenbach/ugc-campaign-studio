// Compact tool traces shared by the live feed and mission logs.
const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sensitive=/api[_-]?key|secret|password|authorization|cookie|access[_-]?token|refresh[_-]?token|credential|^session(?:[_-]?id)?$/i;
export function safeLogValue(value,depth=0){
 if(depth>6)return '[Nested content]';
 if(typeof value==='string')return value.replace(/\bBearer\s+[^\s"']+/gi,'Bearer [redacted]').replace(/\bsk-(?:ant-)?[A-Za-z0-9_-]{12,}/g,'[redacted]').replace(/([?&](?:api[_-]?key|token|secret|password|signature)=)[^&#\s]+/gi,'$1[redacted]').replace(/(https?:\/\/)[^\s/@:]+:[^\s/@]+@/gi,'$1[redacted]@').replaceAll('\u2014',',').slice(0,3000);
 if(Array.isArray(value))return value.slice(0,30).map(x=>safeLogValue(x,depth+1));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).slice(0,40).map(([k,v])=>[k,sensitive.test(k)?'[redacted]':safeLogValue(v,depth+1)]));
 return value;
}
export const isToolEvent=e=>Boolean(e?.tool)&&(e.type==='tool_call'||e.type==='tool_result'||e.type==='error');
const duration=n=>n<1000?`${Math.round(n)}ms`:`${(n/1000).toFixed(n<10000?1:0)}s`;
function metadata(e,events){
 const d=e.data||{},matched=d.callId?events.find(x=>x.id!==e.id&&x.data?.callId===d.callId&&x.type==='tool_result'):null;
 const end=matched?.data||d;
 const status=e.type==='error'||end.status==='error'?'Failed':end.status==='success'?'Done':end.status==='running'?'Running':e.type==='tool_result'?'Result':'Recorded';
 return {status,kind:status==='Failed'?'bad':status==='Done'?'ok':status==='Running'?'run':'idle',durationMs:typeof end.durationMs==='number'&&Number.isFinite(end.durationMs)&&end.durationMs>=0?end.durationMs:null,costUsd:typeof end.costUsd==='number'&&Number.isFinite(end.costUsd)&&end.costUsd>=0?end.costUsd:null};
}
export function toolLogDetails(e,{esc=escape}={}){
 const d=e.data||{},sections=[];
 if(Object.hasOwn(d,'input'))sections.push(['Input',d.input]);
 if(Object.hasOwn(d,'output'))sections.push(['Result',d.output]);
 if(Object.hasOwn(d,'error'))sections.push(['Error',d.error]);
 if(!sections.length&&e.data)sections.push([e.type==='tool_call'?'Input':'Result',e.data]);
 if(e.detail)sections.push(['Detail',e.detail]);
 return `<div class="ap-log-detail"><p>${esc(safeLogValue(e.title||e.tool))}</p>${sections.map(([label,value])=>`<details class="ap-log-payload"><summary>${label}</summary><pre>${esc((typeof value==='string'?safeLogValue(value):JSON.stringify(safeLogValue(value),null,2)).slice(0,14000))}</pre></details>`).join('')}${!sections.length?'<span class="ap-log-muted">No payload recorded</span>':''}</div>`;
}
export function toolLogRow(e,{events=[],esc=escape,logoFor=()=>null,open=false}={}){
 const result=e.type==='tool_call'&&e.data?.callId?events.find(x=>x.type==='tool_result'&&x.data?.callId===e.data.callId):null;
 const detail=result?{...e,data:{...e.data,...result.data,...(Object.hasOwn(e.data,'input')?{input:e.data.input}:{})}}:e;
 const m=metadata(e,events),raw=String(e.tool||'').toLowerCase(),logo=logoFor(e.tool)||(['gmail','claude','exa','solari','higgsfield','whop','elevenlabs','terac','instagram'].find(x=>raw.includes(x)))||(raw.startsWith('assistant.')?'claude':null),at=new Date(e.at),stamp=Number.isNaN(+at)?'':at.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});
 const status=['Failed','Running'].includes(m.status)?`<span class="ap-log-status ap-log-${m.kind}" aria-label="${m.status}" title="${m.status}"></span>`:'';
 return `<details class="ap-log" data-ap-log="${esc(e.id)}" ${open?'open':''}><summary>${logo?`<span class="ap-log-icon"><img src="/logos/${esc(logo)}.${logo==='instagram'?'svg':'png'}" alt=""></span>`:''}<span class="ap-log-name" title="${esc(e.tool)}">${esc(e.tool)}</span>${status}${m.durationMs!==null?`<span class="ap-log-metric">${duration(m.durationMs)}</span>`:''}${m.costUsd!==null?`<span class="ap-log-metric">$${m.costUsd.toFixed(m.costUsd<1?4:2)}</span>`:''}<time class="ap-log-time" datetime="${esc(e.at)}">${stamp}</time><span class="ap-log-chevron" aria-hidden="true">›</span></summary>${toolLogDetails(detail,{esc})}</details>`;
}
