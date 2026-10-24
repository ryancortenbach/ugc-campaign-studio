import {classifyEmail} from './contacts.mjs';

// An outreach message is READY only when all four hold. Nothing here sends anything: it only tells the UI whether the
// send button may be enabled and what is still missing.
//   email  the channel is email, the contact is a personal address (never info@, support@, cs@ ...)
//   clip   a completed render with a result URL is linked to the draft
//   pdf    the personalized offer PDF is attached
//   gmail  the message exists as a Gmail draft that can be sent
export const MISSING_KEYS=['email','clip','pdf','gmail'];
// An Instagram DM is ready when Instagram is connected, the lead has a handle, and the finished clip's link is in the message.
export const DM_MISSING_KEYS=['instagram','handle','clip'];
export const OFFER_KIND='offer_pdf';

export const isRoleInbox=(email,domain='',names=[])=>classifyEmail(email,{domain,names})==='role';
export const hasOfferPdf=attachments=>Array.isArray(attachments)&&attachments.some(a=>a&&(a.kind===OFFER_KIND||a.mime==='application/pdf'));

export const dmHandle=(draft,lead)=>{const h=String(lead?.instagram_handle||draft?.to_email||'').trim().replace(/^@/,'');return /^[A-Za-z0-9._]{1,30}$/.test(h)?h:null;};

export function draftReadiness({draft,lead,render,instagram=false}){
 if(draft?.channel==='instagram_dm'){
  const missing=[];
  if(!instagram)missing.push('instagram');
  if(!dmHandle(draft,lead))missing.push('handle');
  const clip=Boolean(render&&render.status==='completed'&&render.result_url&&draft?.render_id&&draft.render_id===render.id&&String(draft.body||'').includes(render.result_url));
  if(!clip)missing.push('clip');
  return {ready:missing.length===0&&!['sent','withdrawn'].includes(draft?.status),missing};
 }
 const missing=[];
 const email=draft?.channel==='email'&&lead?.contact_kind==='personal'&&Boolean(draft?.to_email)&&!isRoleInbox(draft.to_email,lead?.domain||'',[lead?.contact_name]);
 if(!email)missing.push('email');
 const clip=Boolean(render&&render.status==='completed'&&render.result_url&&draft?.render_id&&draft.render_id===render.id);
 if(!clip)missing.push('clip');
 if(!hasOfferPdf(draft?.attachments))missing.push('pdf');
 if(!draft?.gmail_draft_id)missing.push('gmail');
 // A sent or withdrawn draft has nothing left to send, so it is never ready even though nothing is missing.
 return {ready:missing.length===0&&!['sent','withdrawn'].includes(draft?.status),missing};
}
