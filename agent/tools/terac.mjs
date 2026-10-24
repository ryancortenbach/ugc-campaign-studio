import {parseRpc,parseBalance} from '../connections.mjs';

// Terac MCP client (JSON-RPC over HTTP). One session per client, re-opened once if the server drops it.
// tools/call results come back as {content:[{type:'text',text:'<json or markdown>'}]}; call() parses JSON text when it can.
// terac_launch_draft_opportunity SPENDS REAL MONEY. It is only reachable through launchDraft() below, which panel.mjs calls from
// the confirm:true launch route. Nothing else in the codebase may name that tool (panel.test.mjs greps for it).
export const TERAC_URL='https://terac.com/api/mcp';
const sig=ms=>AbortSignal.timeout(ms);

export function createTerac({fetch=globalThis.fetch,env=process.env}={}){
 let sid=null,n=0;
 const headers=()=>({'x-api-key':env.TERAC_API_KEY,'content-type':'application/json',accept:'application/json, text/event-stream',...(sid?{'mcp-session-id':sid}:{})});
 const enabled=()=>Boolean(env.TERAC_API_KEY);
 async function open(){
  if(!enabled())throw Error('TERAC_API_KEY is not set');
  sid=null;
  const res=await fetch(TERAC_URL,{method:'POST',headers:headers(),body:JSON.stringify({jsonrpc:'2.0',id:++n,method:'initialize',params:{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'mint-labs',version:'1'}}}),signal:sig(20000)});
  if(!res.ok)throw Error(`Terac initialize failed with HTTP ${res.status}`);
  const body=parseRpc(await res.text());
  if(!body?.result)throw Error('Terac initialize returned no result');
  sid=res.headers.get('mcp-session-id');
  const note=await fetch(TERAC_URL,{method:'POST',headers:headers(),body:JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'}),signal:sig(15000)});
  if(!note.ok)throw Error(`Terac notifications/initialized failed with HTTP ${note.status}`);
 }
 async function rpc(method,params,timeout=60000){
  const res=await fetch(TERAC_URL,{method:'POST',headers:headers(),body:JSON.stringify({jsonrpc:'2.0',id:++n,method,params}),signal:sig(timeout)});
  if(!res.ok){const e=Error(`Terac ${method} failed with HTTP ${res.status}`);e.http=res.status;throw e;}
  const body=parseRpc(await res.text());
  if(!body)throw Error(`Terac ${method} returned nothing`);
  return body;
 }
 // Returns {text, json} for a tool call. Throws on JSON-RPC errors and on tool errors (isError).
 async function call(name,args={},timeout=60000){
  if(!sid)await open();
  let body;
  try{body=await rpc('tools/call',{name,arguments:args},timeout);}
  catch(e){if(e.http===400||e.http===404||e.http===401){await open();body=await rpc('tools/call',{name,arguments:args},timeout);}else throw e;}
  if(body.error)throw Error(`Terac ${name}: ${String(body.error.message).slice(0,300)}`);
  const text=(body.result?.content||[]).map(c=>c.text||'').join('\n');
  if(body.result?.isError)throw Error(`Terac ${name}: ${text.slice(0,300)}`);
  let json=null;try{json=JSON.parse(text);}catch{}
  return {text,json};
 }
 const data=async(name,args,timeout)=>{const r=await call(name,args,timeout);return r.json?.data??r.json??r.text;};
 return {
  enabled,call,data,
  async balance(){const {text}=await call('terac_get_context');const b=parseBalance(text);if(b==null)throw Error('Terac context had no Balance line');return b;},
  filterOptions:(slug,search,scope={})=>data('terac_get_filter_options',{filter_slug:slug,...(search?{search}:{}),...scope,per_page:100}),
  createOpportunity:args=>call("terac_create_opportunity",args,590000).then(r=>r.json??{text:r.text}),
  getOpportunity:id=>call('terac_get_opportunity',{opportunityId:id}).then(r=>r.json??{text:r.text}),
  deleteOpportunity:id=>call('terac_delete_opportunity',{opportunityId:id}),
  listSubmissions:(id,extra={})=>call('terac_get_submissions',{opportunityId:id,...extra}).then(r=>r.json??{text:r.text}),
  approveSubmission:id=>call('terac_approve_submission',{submissionId:id}),
  // Real money. See the header comment.
  launchDraft:id=>call('terac_launch_draft_opportunity',{opportunityId:id},120000).then(r=>r.json??{text:r.text})
 };
}
