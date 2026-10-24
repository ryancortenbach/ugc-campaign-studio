import {readFileSync,existsSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Live connection health for the Mint Labs integrations. Every check is free and read-only: no generation, no searches,
// no writes. Exa and Higgsfield have no free read endpoint, so they are config-only and say so. Keys are never returned or logged.
const TTL=60000;
const TERAC_URL='https://terac.com/api/mcp';
const WHOP_ME='https://api.whop.com/api/v1/accounts/me';
const SOLARI_HEALTH='https://api.getsolari.com/health';
const ok=(detail,extra={})=>({ok:true,detail,...extra});

// ---- shared provider helpers (also used by costs.mjs) ----
const sig=ms=>AbortSignal.timeout(ms);
// Terac answers JSON-RPC either as plain JSON or as one server-sent event ("data: {...}"). Parse both.
export function parseRpc(text){
 const t=String(text||'').trim();if(!t)return null;
 try{return JSON.parse(t);}catch{}
 const lines=t.split(/\r?\n/).filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trim());
 for(const l of lines.reverse()){try{return JSON.parse(l);}catch{}}
 return null;
}
const teracHeaders=(env,sid)=>({'x-api-key':env.TERAC_API_KEY,'content-type':'application/json',accept:'application/json, text/event-stream',...(sid?{'mcp-session-id':sid}:{})});
// JSON-RPC initialize. Returns the mcp-session-id the server assigned.
export async function teracInitialize(fetch,env=process.env){
 if(!env.TERAC_API_KEY)throw Error('TERAC_API_KEY is not set');
 const res=await fetch(TERAC_URL,{method:'POST',headers:teracHeaders(env),body:JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'mint-labs',version:'1'}}}),signal:sig(20000)});
 if(!res.ok)throw Error(`Terac initialize failed with HTTP ${res.status}`);
 const body=parseRpc(await res.text());
 if(!body?.result)throw Error(`Terac initialize returned no result${body?.error?.message?` (${String(body.error.message).slice(0,100)})`:''}`);
 return {sid:res.headers.get('mcp-session-id'),server:body.result.serverInfo?.name||'Terac'};
}
// The context tool prints "- **Balance:** $100.00". Returns the number, or null when the line is missing.
export function parseBalance(markdown){
 const m=String(markdown||'').match(/\*\*Balance:\*\*\s*\$?\s*(-?[\d,]+(?:\.\d+)?)/i);
 return m?Number(m[1].replace(/,/g,'')):null;
}
// Full handshake, then terac_get_context (read only, creates nothing). Returns {balance,orgSlug}.
export async function teracContext(fetch,env=process.env){
 const {sid}=await teracInitialize(fetch,env);
 const note=await fetch(TERAC_URL,{method:'POST',headers:teracHeaders(env,sid),body:JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'}),signal:sig(15000)});
 if(!note.ok)throw Error(`Terac notifications/initialized failed with HTTP ${note.status}`);
 const res=await fetch(TERAC_URL,{method:'POST',headers:teracHeaders(env,sid),body:JSON.stringify({jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'terac_get_context',arguments:{}}}),signal:sig(30000)});
 if(!res.ok)throw Error(`Terac terac_get_context failed with HTTP ${res.status}`);
 const body=parseRpc(await res.text());
 if(body?.error)throw Error(`Terac error: ${String(body.error.message).slice(0,120)}`);
 const text=(body?.result?.content||[]).map(c=>c.text||'').join('\n');
 const balance=parseBalance(text);
 if(balance==null)throw Error('Terac context had no Balance line');
 return {balance,orgSlug:(text.match(/\*\*Slug:\*\*\s*(\S+)/)||[])[1]||null};
}

const elevenKey=env=>{
 const e=(env.ELEVENLABS_API_KEY||'').trim();if(e)return e;
 try{return readFileSync(env.ELEVENLABS_KEY_FILE||path.join(os.homedir(),'.elevenlabs','key'),'utf8').trim();}catch{return '';}
};
export const elevenConfigured=(env=process.env)=>Boolean(elevenKey(env));
// GET /v1/user/subscription: free. Same field mapping as tools/elevenlabs.mjs subscription().
export async function elevenSubscription(fetch,env=process.env){
 const key=elevenKey(env);if(!key)throw Error('No ElevenLabs key');
 const res=await fetch('https://api.elevenlabs.io/v1/user/subscription',{headers:{'xi-api-key':key},signal:sig(8000)});
 if(!res.ok)throw Error(`ElevenLabs subscription failed with HTTP ${res.status}`);
 const s=await res.json();
 return {tier:s.tier||null,status:s.status||null,used:s.character_count??null,limit:s.character_limit??null,
  resetAt:s.next_character_count_reset_unix?new Date(s.next_character_count_reset_unix*1000).toISOString():null,
  usdPerChar:s.next_invoice?.subtotal_cents>0&&s.billing_period==='monthly_period'&&s.character_refresh_period==='monthly_period'&&s.currency==='usd'&&s.character_limit>0?s.next_invoice.subtotal_cents/100/s.character_limit:null};
}

// GET accounts/me with the Whop key. Read only.
export async function whopAccount(fetch,env=process.env){
 if(!env.WHOP_API_KEY)throw Error('WHOP_API_KEY is not set');
 const res=await fetch(WHOP_ME,{headers:{Authorization:`Bearer ${env.WHOP_API_KEY}`,Accept:'application/json'},signal:sig(15000)});
 if(!res.ok)throw Error(`Whop accounts/me failed with HTTP ${res.status}`);
 const a=await res.json();
 const n=Number(a.total_earned_usd);
 return {title:a.title||null,earnedUsd:Number.isFinite(n)?n:null};
}

// ---- connection checks ----
export function createConnections({fetch=globalThis.fetch,now=()=>Date.now(),env=process.env,tokenPath=null,readFile=p=>readFileSync(p,'utf8'),exists=existsSync}={}){
 let cache=null;
 const gmailTokenPath=()=>tokenPath||env.GMAIL_TOKEN_PATH||path.join(os.homedir(),'.gmail-mcp/columbia/token.json');
 const checks=[
  {id:'claude',name:'Claude',on:()=>Boolean(env.ANTHROPIC_API_KEY),missing:'Add ANTHROPIC_API_KEY',run:async()=>{
   // GET /v1/models lists models and is not billed. https://platform.claude.com/docs/en/api/models-list
   const res=await fetch('https://api.anthropic.com/v1/models?limit=1',{headers:{'x-api-key':env.ANTHROPIC_API_KEY,'anthropic-version':'2023-06-01'},signal:sig(15000)});
   if(!res.ok)throw Error(`Models list failed with HTTP ${res.status}`);
   return ok('API key accepted (models list, no charge)');
  }},
  {id:'exa',name:'Exa',on:()=>Boolean(env.EXA_API_KEY),missing:'Add EXA_API_KEY (the free search still works)',run:async()=>
   ok('Key present. Not pinged: every Exa call is a paid search.',{configOnly:true})},
  {id:'solari',name:'Solari',on:()=>Boolean(env.SOLARI_API_KEY),missing:'Add SOLARI_API_KEY',run:async()=>{
   // Unauthenticated pool-health probe, so it proves the gateway is up, not that the key is valid. https://docs.getsolari.com/api-reference
   const res=await fetch(SOLARI_HEALTH,{signal:sig(10000)});
   if(!res.ok)throw Error(`Solari health failed with HTTP ${res.status}`);
   const h=await res.json().catch(()=>({}));
   if(h.ok===false)throw Error('Solari reports its pool unhealthy');
   return ok(`Gateway reachable. Browser credentials have not been verified; no session was launched.`,{verification:'reachable'});
  }},
  {id:'gmail',name:'Gmail',on:()=>exists(gmailTokenPath()),missing:'Add a Gmail token',run:async()=>{
   const t=JSON.parse(readFile(gmailTokenPath()));
   const refresh=await fetch(t.token_uri||'https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:t.client_id,client_secret:t.client_secret,refresh_token:t.refresh_token,grant_type:'refresh_token'}),signal:sig(15000)});
   if(!refresh.ok)throw Error(`Token refresh failed with HTTP ${refresh.status}`);
   const {access_token}=await refresh.json();
   const res=await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile',{headers:{Authorization:`Bearer ${access_token}`},signal:sig(15000)});
   if(!res.ok)throw Error(`Profile read failed with HTTP ${res.status}`);
   const p=await res.json();
   return ok(`Token refreshed. Mailbox ${p.emailAddress||'unknown'}. Drafts only, never sent.`);
  }},
  {id:'higgsfield',name:'Higgsfield',on:()=>/^[^:\s]+:[^:\s]+$/.test(env.HF_CREDENTIALS||''),missing:'Add HF_CREDENTIALS',run:async()=>
   ok('Credentials present. Account usage is verified separately in Spend.',{configOnly:true})},
  {id:'whop',name:'Whop',on:()=>/^apik_\S+$/.test(env.WHOP_API_KEY||''),missing:'Add WHOP_API_KEY',run:async()=>{
   const a=await whopAccount(fetch,env);
   return ok(`Reads ${a.title||'the business'} (accounts/me)`);
  }},
  {id:'elevenlabs',name:'ElevenLabs',on:()=>elevenConfigured(env),missing:'Add ELEVENLABS_API_KEY or ~/.elevenlabs/key',run:async()=>{
   const s=await elevenSubscription(fetch,env);
   return ok(`Subscription read: ${s.tier||'unknown'} plan, ${s.status||'unknown'}`);
  }},
  {id:'terac',name:'Terac',on:()=>Boolean(env.TERAC_API_KEY),missing:'Add TERAC_API_KEY',run:async()=>{
   const h=await teracInitialize(fetch,env);
   return ok(`MCP handshake with ${h.server} succeeded`);
  }}
 ];
 async function one(c){
  const checkedAt=new Date(now()).toISOString();
  if(!c.on())return {id:c.id,name:c.name,on:false,ok:false,verification:'missing',latencyMs:null,checkedAt,detail:c.missing};
  const t0=now();
  try{
   const r=await c.run();
   return {id:c.id,name:c.name,on:true,ok:r.ok,verification:r.configOnly?'configured':r.verification||'verified',latencyMs:r.configOnly?null:Math.max(0,now()-t0),checkedAt,detail:r.detail};
  }catch(e){
   const code=e?.cause?.code||e?.code||null;
   const network=['ENOTFOUND','EAI_AGAIN','ECONNREFUSED','ENETUNREACH','ETIMEDOUT'].includes(code);
   const detail=network?`Network connection failed (${code}). Credentials were not evaluated.`:String(e?.message||e).replace(/\s+/g,' ').slice(0,200);
   return {id:c.id,name:c.name,on:true,ok:false,verification:network?'network_error':'error',errorCode:code,latencyMs:Math.max(0,now()-t0),checkedAt,detail};
  }
 }
 return {
  async get({refresh=false}={}){
   if(!refresh&&cache&&now()-cache.at<TTL)return cache.rows;
   const rows=await Promise.all(checks.map(one));
   cache={at:now(),rows};
   return rows;
  }
 };
}
