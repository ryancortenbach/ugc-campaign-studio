export function prospectFromResult(result,query){
 let url;try{url=new URL(result.url);if(url.protocol!=='https:'||url.username||url.password)return null;}catch{return null;}
 const text=typeof result.text==='string'?result.text:'';
 const pageTitle=(result.title||'').replace(/[\r\n]+/g,' ').trim();const title=!pageTitle||/^(contact|contact us|n\/a)$/i.test(pageTitle)?url.hostname.replace(/^www\./,''):pageTitle.slice(0,120);
 const candidates=[...new Set(text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)||[])].filter(email=>!email.match(/example\.|sentry|wixpress|@2x|^(support|privacy|gdpr|legal|careers|returns|orders)@/i)).slice(0,4);
 const emailEvidence=candidates.map(email=>{const index=text.indexOf(email);const domain=email.split('@')[1].toLowerCase();return {email,sourceUrl:url.href,excerpt:text.slice(Math.max(0,index-40),index+email.length+40),domainMatchesPage:url.hostname===domain||url.hostname.endsWith('.'+domain),verification:'Published candidate only. Business purpose and site ownership require review.'};});
 const observation=text.split(/[\n]+|(?<=[.!?])\s+/).map(line=>line.trim()).find(line=>line.length>=25&&!/privacy|cookie|terms of service|all rights reserved/i.test(line));
 const quote=observation?observation.split(/\s+/).slice(0,12).join(' '):'';
 return {name:title,url:url.href,evidence:text.slice(0,450),sourceStatus:'Search result. Official ownership has not been verified.',emails:candidates,emailEvidence,emailStatus:candidates.length?'Published candidates, verify business purpose':'Not found',personalizationEvidence:quote?{quote,sourceUrl:url.href}:null,draft:`Hi ${title} team, ${quote?'your page mentions "'+quote+'". ':'I found your website while researching '+query+'. '}I have an original five-second creator concept for your product: a clear everyday use moment followed by a product close-up. Would you be open to reviewing the concept?`,sampleBrief:'5-second sample plan: 0-1s original avatar in a customer-relevant setting; 1-4s demonstrate one verified product use; 4-5s product close-up. Product, use, character and claims still need approval. No video generated.',status:'draft_unsent'};
}
export function decodeMcpResponse(raw,type,id){
 if(!raw.trim())return null;
 if(!type.includes('text/event-stream'))return JSON.parse(raw);
 const messages=raw.split(/\r?\n\r?\n/).flatMap(block=>{const data=block.split(/\r?\n/).filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trimStart()).join('\n');try{return data?[JSON.parse(data)]:[];}catch{return [];}});
 const response=messages.findLast(message=>message.id===id);if(!response)throw Error('MCP response was incomplete.');return response;
}
export function parseExaMcpSources(result){
 const sourceText=(result.content||[]).filter(item=>item.type==='text').map(item=>item.text||'').join('\n');
 return sourceText.split(/(?=^Title: )/m).flatMap(block=>{const heading=block.match(/^Title: ([^\n]*)\r?\nURL: (https:[^\n]*)/);if(!heading)return [];const offset=block.indexOf('Highlights:');return [{title:heading[1]==='N/A'?new URL(heading[2].trim()).hostname:heading[1],url:heading[2].trim(),text:offset>=0?block.slice(offset+11).trim():''}];}).slice(0,5);
}
export async function searchFreeExa(query,request=fetch){
 const headers={'Content-Type':'application/json','Accept':'application/json, text/event-stream'},signal=AbortSignal.timeout(35000);let nextId=1;
 async function rpc(method,params,notification=false){
  const id=notification?undefined:nextId++,body={jsonrpc:'2.0',...(notification?{}:{id}),method,...(params?{params}:{})};
  const response=await request('https://mcp.exa.ai/mcp',{method:'POST',headers:{...headers},body:JSON.stringify(body),signal});
  if(!response.ok){const error=Error('Free Exa HTTP failure');error.status=response.status;throw error;}
  if(response.headers.get('mcp-session-id'))headers['Mcp-Session-Id']=response.headers.get('mcp-session-id');
  const raw=await response.text();if(raw.length>1500000)throw Error('Free Exa response was too large.');
  const decoded=decodeMcpResponse(raw,response.headers.get('content-type')||'',id);if(decoded?.error)throw Error('Free Exa protocol error.');return decoded?.result;
 }
 const init=await rpc('initialize',{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'ugc-campaign-studio',version:'0.1.0'}});if(!init?.protocolVersion)throw Error('Free Exa initialization failed.');headers['MCP-Protocol-Version']=init.protocolVersion;
 await rpc('notifications/initialized',null,true);
 const listing=await rpc('tools/list',{});if(!listing?.tools?.some(tool=>tool.name==='web_search_exa'))throw Error('Free Exa search tool unavailable.');
 const result=await rpc('tools/call',{name:'web_search_exa',arguments:{query:'Official direct-to-consumer brand and public business contact pages for: '+query,objective:'Find official brand websites, product context and directly published creator, collaboration or business contact routes. Exclude private personal emails and contact directories. Return source URLs and supporting evidence. Research only, no outreach.',numResults:5}});
 if(result?.isError){const message=(result.content||[]).map(item=>item.text||'').join(' ');const error=Error('Free Exa search failed');if(/rate.?limit|quota|too many/i.test(message))error.status=429;throw error;}
 const results=parseExaMcpSources(result||{});if(!results.length)throw Error('Free Exa returned no parseable source pages.');return {results};
}
export async function findProspects(input,auth='',request=fetch){
 if(typeof input?.query!=='string'||input.query.length<5||input.query.length>1000)return {status:400,body:{error:'Describe the target brands in 5 to 1000 characters.'}};
 if(input.transport==='free_mcp'){
  if(process.env.EXA_FREE_MCP_DISABLED==='true')return {status:503,body:{error:'Free Exa MCP is disabled for this deployment.'}};
  try{const data=await searchFreeExa(input.query,request);const prospects=data.results.map(result=>prospectFromResult(result,input.query)).filter(Boolean);return {status:200,body:{prospects,provider:'Exa free MCP',transport:'free_mcp',searchedAt:new Date().toISOString(),requestId:null,costDollars:null,freeTier:true,sent:0,generatedSamples:0}};}
  catch(error){return {status:error.status===429?429:502,body:{error:error.status===429?'The free Exa quota is temporarily unavailable. No paid API fallback was attempted.':'The free Exa connection could not complete this search. No contacts were invented and no paid fallback was attempted.'}};}
 }
 if(!process.env.EXA_API_KEY||!process.env.CAMPAIGN_ACCESS_TOKEN)return {status:503,body:{error:'Connect EXA_API_KEY and the project access token on the server to discover live prospects.'}};
 if(auth!==`Bearer ${process.env.CAMPAIGN_ACCESS_TOKEN}`)return {status:401,body:{error:'Enter the project access token in AI connection settings.'}};
 try{const res=await request('https://api.exa.ai/search',{method:'POST',headers:{'x-api-key':process.env.EXA_API_KEY,'Content-Type':'application/json'},signal:AbortSignal.timeout(25000),body:JSON.stringify({query:'Find direct-to-consumer brands matching: '+input.query+'. Prefer official brand websites and public business contact pages.',type:'auto',numResults:8,contents:{text:{maxCharacters:6000}}})});if(!res.ok)throw Error('Exa request failed');const data=await res.json();
 const prospects=(data.results||[]).map(result=>prospectFromResult(result,input.query)).filter(Boolean);return {status:200,body:{prospects,provider:'Exa',requestId:data.requestId||null,costDollars:data.costDollars||null,sent:0,generatedSamples:0}};
 }catch{return {status:502,body:{error:'Exa could not complete this search. No prospects or contacts were invented.'}};}
}
export default async function handler(req,res){if(req.method!=='POST')return res.status(405).json({error:'POST required'});let input;try{input=typeof req.body==='string'?JSON.parse(req.body):req.body;}catch{return res.status(400).json({error:'Invalid JSON'});}const r=await findProspects(input,req.headers.authorization||'');res.status(r.status).json(r.body);}
