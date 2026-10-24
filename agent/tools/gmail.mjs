import {readFileSync,existsSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Drafts only. Ryan sends every email himself, so this module never calls a send endpoint.
const tokenPath=()=>process.env.GMAIL_TOKEN_PATH||path.join(os.homedir(),'.gmail-mcp/columbia/token.json');
export const draftAccount=()=>(process.env.GMAIL_DRAFT_ACCOUNT||'rmc2249@columbia.edu').toLowerCase();
export const gmailEnabled=()=>existsSync(tokenPath());
let cached={token:null,expires:0};

async function accessToken(){
 if(cached.token&&Date.now()<cached.expires-60000)return cached.token;
 const t=JSON.parse(readFileSync(tokenPath(),'utf8'));
 const res=await fetch(t.token_uri||'https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:t.client_id,client_secret:t.client_secret,refresh_token:t.refresh_token,grant_type:'refresh_token'}),signal:AbortSignal.timeout(15000)});
 if(!res.ok)throw Error(`Gmail token refresh failed with HTTP ${res.status}`);
 const data=await res.json();
 cached={token:data.access_token,expires:Date.now()+(data.expires_in||3600)*1000};
 return cached.token;
}
async function gmail(pathname,init={}){
 const res=await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${pathname}`,{...init,headers:{Authorization:`Bearer ${await accessToken()}`,'Content-Type':'application/json',...init.headers},signal:AbortSignal.timeout(20000)});
 if(!res.ok)throw Error(`Gmail ${pathname} failed with HTTP ${res.status}`);
 return res.json();
}
const header=v=>/[^\x20-\x7e]/.test(v)?`=?UTF-8?B?${Buffer.from(v).toString('base64')}?=`:v;
export function buildMime({from,to,subject,body}){
 if(/[\r\n]/.test(to+subject))throw Error('Header injection blocked');
 return [`From: ${from}`,`To: ${to}`,`Subject: ${header(subject)}`,'MIME-Version: 1.0','Content-Type: text/plain; charset="UTF-8"','Content-Transfer-Encoding: 8bit','',body.replace(/\r?\n/g,'\r\n')].join('\r\n');
}

export async function createDraft({to,subject,body}){
 const profile=await gmail('profile');
 if(profile.emailAddress?.toLowerCase()!==draftAccount())throw Error(`Gmail token belongs to ${profile.emailAddress}, expected ${draftAccount()}`);
 const raw=Buffer.from(buildMime({from:profile.emailAddress,to,subject,body})).toString('base64url');
 const draft=await gmail('drafts',{method:'POST',body:JSON.stringify({message:{raw}})});
 return {draftId:draft.id,messageId:draft.message?.id,account:profile.emailAddress,url:`https://mail.google.com/mail/u/?authuser=${encodeURIComponent(profile.emailAddress)}#drafts?compose=${draft.message?.id}`};
}
