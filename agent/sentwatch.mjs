import {readFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Read-only: only GET calls to Gmail (drafts.get, messages.list, messages.get). Never sends, modifies or deletes.
// gmail.mjs does not export its token helper, so this is a minimal refresh from the same token file.
const tokenPath=()=>process.env.GMAIL_TOKEN_PATH||path.join(os.homedir(),'.gmail-mcp/columbia/token.json');
let cached={token:null,expires:0};
export async function fileToken(fetchImpl=fetch){
 if(cached.token&&Date.now()<cached.expires-60000)return cached.token;
 const t=JSON.parse(readFileSync(tokenPath(),'utf8'));
 const res=await fetchImpl(t.token_uri||'https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:t.client_id,client_secret:t.client_secret,refresh_token:t.refresh_token,grant_type:'refresh_token'}),signal:AbortSignal.timeout(15000)});
 if(!res.ok)throw Error(`Gmail token refresh failed with HTTP ${res.status}`);
 const data=await res.json();
 cached={token:data.access_token,expires:Date.now()+(data.expires_in||3600)*1000};
 return cached.token;
}
const ymd=d=>`${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;

export function createSentWatch({store,gmail={},intervalMs=180000}){
 const doFetch=gmail.fetch||fetch,token=gmail.token||(()=>fileToken(doFetch));
 let timer=null,busy=false;
 async function get(pathname){
  const res=await doFetch(`https://gmail.googleapis.com/gmail/v1/users/me/${pathname}`,{method:'GET',headers:{Authorization:`Bearer ${await token()}`},signal:AbortSignal.timeout(20000)});
  if(res.status===404)return null;
  if(!res.ok)throw Error(`Gmail ${pathname.split('?')[0]} failed with HTTP ${res.status}`);
  return res.json();
 }
 // A sent message to this address that appeared after the draft was created. The date in q is a day early to dodge timezone edges, so internalDate decides.
 async function sentAfter(d){
  const created=new Date(d.created_at);
  const q=`in:sent to:${d.to_email} after:${ymd(new Date(created.getTime()-86400000))}`;
  const list=await get(`messages?q=${encodeURIComponent(q)}&maxResults=10`);
  for(const m of list?.messages||[]){
   const msg=await get(`messages/${m.id}?format=minimal`);
   if(msg&&Number(msg.internalDate)>=created.getTime()-60000)return msg;
  }
  return null;
 }
 async function tick(){
  if(busy)return {skipped:true};
  busy=true;
  const out={checked:0,sent:0,deleted:0,errors:0};
  try{
   for(const d of store.listDrafts().filter(d=>d.status==='gmail_draft'&&d.gmail_draft_id&&d.to_email)){
    out.checked++;
    try{
     if(await get(`drafts/${encodeURIComponent(d.gmail_draft_id)}?format=minimal`))continue;
     const msg=await sentAfter(d);
     if(msg){store.markDraftSent(d.id);store.addEvent({taskId:d.task_id,leadId:d.lead_id,type:'draft',tool:'sentwatch',title:`Sent: ${d.to_email}`,data:{draftId:d.id,messageId:msg.id,threadId:msg.threadId}});out.sent++;continue;}
     const title=`Draft deleted in Gmail: ${d.to_email}`;
     if(!store.listEvents({leadId:d.lead_id}).some(e=>e.title===title)){store.addEvent({taskId:d.task_id,leadId:d.lead_id,type:'draft',tool:'sentwatch',title});out.deleted++;}
    }catch{out.errors++;}
   }
  }finally{busy=false;}
  return out;
 }
 return {
  tick,
  start(){if(!timer){timer=setInterval(()=>tick().catch(()=>{}),intervalMs);timer.unref?.();}return this;},
  stop(){if(timer){clearInterval(timer);timer=null;}}
 };
}
