const context=e=>`${e.task_id??'none'}:${e.lead_id??'none'}`;
const sequence=e=>Number(e.id)||Date.parse(e.at)||0;
const trace=e=>e.type==='tool_call'||e.type==='tool_result';
const operation=e=>{
 const tool=String(e.tool||'');
 if(/exa\.search \(REST\)|api\.exa\.ai \/search/.test(tool))return 'exa.search.rest';
 if(/exa\.web_search_exa \(MCP\)|mcp\.exa\.ai web_search_exa/.test(tool))return 'exa.search.mcp';
 return tool;
};
export function buildGroups(events,isMain){
 const groups=[],pending=new Map();
 for(const e of [...events].sort((a,b)=>sequence(a)-sequence(b))){
  const key=context(e);
  if(trace(e)){const tools=pending.get(key)||[];tools.push(e);pending.set(key,tools);continue;}
  if(!isMain(e))continue;
  const tools=pending.get(key)||[];pending.delete(key);
  const previous=groups.at(-1);
  if(previous&&!previous.orphan&&context(previous.main)===key&&previous.main.type===e.type&&previous.main.title===e.title){previous.n++;previous.latest=e;previous.tools.push(...tools);}
  else groups.push({main:e,tools,n:1});
 }
 for(const tools of pending.values())groups.push({main:tools.at(-1),tools,orphan:true,n:1});
 return groups.sort((a,b)=>sequence(a.latest||a.main)-sequence(b.latest||b.main));
}
export function pairTools(tools){
 const out=[];
 for(const event of [...tools].sort((a,b)=>sequence(a)-sequence(b))){
  if(event.type==='tool_result'){
   const paired=[...out].reverse().find(item=>item.call&&!item.result&&context(item.call)===context(event)&&(event.data?.callId?item.call.data?.callId===event.data.callId:!item.call.data?.callId&&operation(item.call)===operation(event)));
   if(paired){paired.result=event;continue;}
   out.push({call:null,result:event});
  }else out.push({call:event,result:null});
 }
 return out;
}
