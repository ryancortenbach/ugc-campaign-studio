import {isRoleMailbox} from './email-classification.js';
const missingLabels={email:'Needs email',clip:'Needs clip',pdf:'Needs PDF',gmail:'Needs Gmail draft',instagram:'Connect Instagram',handle:'Needs handle'};
const blockerOrder=['email','instagram','handle','clip','pdf','gmail'];
export function primaryLeadStatus(lead,{draft,dmReady=false,fallback=[lead.status,'s-idle']}={}){
 if(lead.simulatedJourney)return {label:'Whop checkout successful',cls:'s-ok',provider:'whop'};
 if(lead.status==='won')return {label:'Won',cls:'s-ok',icon:'circle-check'};
 if(['rejected','skipped','unreachable','error','lost'].includes(lead.status))return {label:fallback[0],cls:fallback[1]};
 const channel=draft?.channel==='instagram_dm'||lead.contact_kind==='instagram'?'instagram':'gmail';
 if(lead.status==='replied')return {label:channel==='gmail'?'Email received':'Reply received',cls:'s-ok',provider:channel};
 if(lead.status==='contacted'||draft?.status==='sent')return {label:'Outreach sent',cls:'s-ok',provider:channel};
 if(draft?.readiness&&!draft.readiness.ready){
  const missing=draft.readiness.missing||[],key=blockerOrder.find(key=>missing.includes(key))||missing[0];
  if(key)return {label:missingLabels[key]||`Needs ${key}`,cls:'s-you',icon:'circle-alert',provider:key==='clip'?'higgsfield':null};
 }
 if(dmReady)return {label:'DM ready',cls:'s-wait',provider:'instagram'};
 return {label:fallback[0],cls:fallback[1]};
}
export function contactSummary(lead){
 if(lead.simulatedJourney)return {label:'Mutual connection',cls:'s-mutual',icon:'users',detail:'Reached through a mutual connection.'};
 const address=String(lead.contact_email||'').trim(),valid=/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address);
 const role=isRoleMailbox(address,{domain:lead.domain});
 if(valid&&lead.contact_kind==='personal'&&!role)return {label:'Email found',cls:'s-ok',icon:'check',detail:address};
 if(valid&&(lead.contact_kind==='role'||role))return {label:'Shared inbox',cls:'s-you',icon:'circle-alert',detail:address};
 if(valid)return {label:'Email needs review',cls:'s-you',icon:'circle-alert',detail:address};
 if(lead.status==='found'&&!lead.contact_kind)return {label:'Not checked',cls:'s-idle',icon:'clock',detail:'Contact research has not finished.'};
 return {label:'No public email',cls:'s-bad',icon:'x',detail:'No personal email address has been found.'};
}
