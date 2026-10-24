import {readFileSync,existsSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomBytes} from 'node:crypto';

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
 if(!res.ok)throw Object.assign(Error(`Gmail ${pathname} failed with HTTP ${res.status}`),{status:res.status});
 return res.json();
}
const header=v=>/[^\x20-\x7e]/.test(v)?`=?UTF-8?B?${Buffer.from(v).toString('base64')}?=`:v;
export const MAX_ATTACH_BYTES=20*1024*1024;
const wrap76=b64=>b64.replace(/(.{76})/g,'$1\r\n');
// With an attachment the message is multipart/mixed: the plain text body, then the file as base64.
export function buildMime({from,to,subject,body,attachment=null}){
 if(/[\r\n]/.test(to+subject))throw Error('Header injection blocked');
 const head=[`From: ${from}`,`To: ${to}`,`Subject: ${header(subject)}`,'MIME-Version: 1.0'];
 const text=body.replace(/\r?\n/g,'\r\n');
 if(!attachment)return [...head,'Content-Type: text/plain; charset="UTF-8"','Content-Transfer-Encoding: 8bit','',text].join('\r\n');
 const {filename,mime='application/octet-stream',data}=attachment;
 if(/[\r\n"\\]/.test(filename+mime)||!/^[a-z]+\/[a-z0-9.+-]+$/i.test(mime))throw Error('Header injection blocked');
 if(!Buffer.isBuffer(data))throw Error('Attachment data must be a Buffer');
 let boundary;do boundary=`=_mint_${randomBytes(12).toString('hex')}`;while(text.includes(boundary));
 return [...head,`Content-Type: multipart/mixed; boundary="${boundary}"`,'',`--${boundary}`,'Content-Type: text/plain; charset="UTF-8"','Content-Transfer-Encoding: 8bit','',text,`--${boundary}`,`Content-Type: ${mime}; name="${filename}"`,'Content-Transfer-Encoding: base64',`Content-Disposition: attachment; filename="${filename}"`,'',wrap76(data.toString('base64')),`--${boundary}--`,''].join('\r\n');
}
async function ownAccount(){
 const profile=await gmail('profile');
 if(profile.emailAddress?.toLowerCase()!==draftAccount())throw Error(`Gmail token belongs to ${profile.emailAddress}, expected ${draftAccount()}`);
 return profile.emailAddress;
}
const draftUrl=(account,draft)=>`https://mail.google.com/mail/u/?authuser=${encodeURIComponent(account)}#drafts?compose=${draft.message?.id}`;

export async function createDraft({to,subject,body,attachment=null}){
 const account=await ownAccount();
 const raw=Buffer.from(buildMime({from:account,to,subject,body,attachment})).toString('base64url');
 const draft=await gmail('drafts',{method:'POST',body:JSON.stringify({message:{raw}})});
 return {draftId:draft.id,messageId:draft.message?.id,account,url:draftUrl(account,draft)};
}
// Rewrites an existing draft in place (drafts.update). Never deletes a draft and never sends one.
export async function updateDraft({draftId,to,subject,body,attachment=null}){
 if(!/^[A-Za-z0-9_-]+$/.test(String(draftId||'')))throw Error('Invalid Gmail draft id');
 const account=await ownAccount();
 const raw=Buffer.from(buildMime({from:account,to,subject,body,attachment})).toString('base64url');
 const draft=await gmail(`drafts/${draftId}`,{method:'PUT',body:JSON.stringify({id:draftId,message:{raw}})});
 return {draftId:draft.id||draftId,messageId:draft.message?.id,account,url:draftUrl(account,draft)};
}
