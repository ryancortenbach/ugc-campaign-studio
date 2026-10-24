import {searchFreeExa} from '../../api/prospects.js';

export const exaMode=()=>process.env.EXA_API_KEY?'rest':'mcp';

// Paid REST when a key is configured, otherwise Exa's free keyless MCP. Both return {title,url,text}.
export async function searchBrands(query,{numResults=8,request=fetch}={}){
 if(!process.env.EXA_API_KEY){
  const data=await searchFreeExa(query,request);
  return {via:'mcp.exa.ai web_search_exa',results:data.results,costUsd:null,requestId:null};
 }
 const res=await request('https://api.exa.ai/search',{method:'POST',headers:{'x-api-key':process.env.EXA_API_KEY,'Content-Type':'application/json'},signal:AbortSignal.timeout(30000),body:JSON.stringify({query,type:'auto',numResults,contents:{text:{maxCharacters:4000}}})});
 if(!res.ok)throw Object.assign(Error(`Exa search failed with HTTP ${res.status}`),{status:res.status});
 const data=await res.json();
 const results=(data.results||[]).filter(r=>typeof r.url==='string').map(r=>({title:(r.title||'').replace(/\s+/g,' ').trim(),url:r.url,text:typeof r.text==='string'?r.text:''}));
 return {via:'api.exa.ai /search',results,costUsd:data.costDollars?.total??null,requestId:data.requestId||null};
}
