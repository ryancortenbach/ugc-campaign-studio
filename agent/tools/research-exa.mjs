import {decodeMcpResponse,parseExaMcpSources} from '../../api/prospects.js';

// This transport never reads EXA_API_KEY and has no paid REST fallback.
export async function searchResearchFree(query,{request=fetch}={}){
 const endpoint='https://mcp.exa.ai/mcp',signal=AbortSignal.timeout(35000);
 const headers={'Content-Type':'application/json',Accept:'application/json, text/event-stream'};
 let next=1;
 async function rpc(method,params,notification=false){
  const id=notification?undefined:next++;
  const response=await request(endpoint,{method:'POST',headers:{...headers},signal,body:JSON.stringify({jsonrpc:'2.0',...(id?{id}:{}),method,...(params?{params}:{})})});
  if(!response.ok)throw Object.assign(Error(`Free Exa HTTP ${response.status}. No paid fallback was attempted.`),{status:response.status===429?429:502});
  const sid=response.headers.get('mcp-session-id');if(sid)headers['Mcp-Session-Id']=sid;
  const raw=await response.text();if(raw.length>1500000)throw Error('Free Exa response exceeded the size limit.');
  if(notification)return null;
  const decoded=decodeMcpResponse(raw,response.headers.get('content-type')||'',id);
  if(decoded?.error)throw Error('Free Exa protocol error. No paid fallback was attempted.');
  return decoded?.result;
 }
 const init=await rpc('initialize',{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'mint-labs-zero-budget-research',version:'1'}});
 if(!init?.protocolVersion)throw Error('Free Exa initialization failed.');
 headers['MCP-Protocol-Version']=init.protocolVersion;
 await rpc('notifications/initialized',null,true);
 const listing=await rpc('tools/list',{}),tool=listing?.tools?.find(t=>t.name==='web_search_exa');
 if(!tool)throw Error('Free Exa search tool unavailable.');
 const properties=tool.inputSchema?.properties||{};
 const args={query};if(properties.numResults)args.numResults=5;
 if(properties.contextMaxCharacters)args.contextMaxCharacters=12000;
 const result=await rpc('tools/call',{name:'web_search_exa',arguments:args});
 if(result?.isError)throw Error('Free Exa search failed or its free quota is unavailable. No paid fallback was attempted.');
 const results=parseExaMcpSources(result||{});
 if(!results.length)throw Error('Free Exa returned no parseable sources. No research findings were invented.');
 return {provider:'Exa free keyless MCP',tool:'web_search_exa',results,costUsd:0,verification:'Live search excerpts. Social account ownership, demographics and view counts still require source evidence.'};
}
