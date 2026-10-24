const providers={higgsfield:'Higgsfield',gmail:'Gmail'};
export function notificationIcon(provider){
 return Object.hasOwn(providers,provider)?`<img src="/logos/${provider}.png" alt="${providers[provider]}">`:'';
}
export function eventNotification(event){
 const tool=String(event.tool||'').toLowerCase(),type=event.type,data=event.data||{},title=String(event.title||'');
 const gmail=tool.startsWith('gmail')||tool==='sentwatch'||data.provider==='gmail';
 const status=String(data.status||'').toLowerCase();
 if(!gmail||type==='tool_call'||type==='error'||data.success===false||(status&&!['success','succeeded','sent','delivered','received','done','completed'].includes(status)))return null;
 let label,kind='ok';
 if(['email_received','inbound','reply','replied','received'].includes(type)||(type==='tool_result'&&data.status==='success'&&/^gmail\.(?:receive|received|inbound|reply\.received)$/.test(tool)))label='Email received';
 else if(['email_sent','sent'].includes(type)||(type==='draft'&&['gmail.send','sentwatch'].includes(tool)&&/^Sent\b/i.test(title)))label='Email sent';
 else if(type==='draft'&&/^Draft deleted in Gmail:/i.test(title)){label='Draft removed';kind='info';}
 else if(type==='draft'&&(/^gmail\.drafts(?:\.|$)/.test(tool)||/^Draft ready in Gmail/i.test(title))){label='Draft saved';kind='info';}
 else return null;
 const simulated=data.mode==='simulated'||data.simulated===true;if(simulated)label+=' (simulated)';
 const suffix=simulated?':simulated':'';
 const key=(label.startsWith('Email sent')&&data.draftId!=null?`gmail-sent-draft:${data.draftId}`:event.id!=null?`gmail-event:${event.id}`:null);
 const messageKey=data.messageId&&(label.startsWith('Email sent')||label.startsWith('Email received'))?`gmail-${label.startsWith('Email sent')?'sent':'received'}-message:${data.messageId}`:null;
 const keys=[...new Set([key,messageKey].filter(Boolean).map(key=>key+suffix))];
 return {provider:'gmail',title:label,kind,detail:title,key:keys[0]||null,keys};
}
