import {existsSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {safeLogValue} from './public/tool-logs.js';
export const campaignVisualStyle={id:'ps2-cutscene',label:'PS2 cutscene',direction:'Early-2000s 3D game character, visible low-poly geometry, game textures and cutscene lighting. Keep the existing fictional London avatar and world.',exclude:'Photorealistic humans, live-action footage, photographic skin, replacement actors or product-model identities.'};
const fail=message=>Object.assign(Error(message),{status:400});
export function campaignDemoTrigger(message){
 const text=String(message||'').trim().replace(/[.!?]+$/,'').toLowerCase();
 return /^(?:run|play|start)(?: the)? streetwear demo$/.test(text)||/^find me streetwear brands (?:that )?(?:we can )?run ai ugc content campaigns for$/.test(text);
}
export function campaignDemoBrands(message){
 const text=String(message||'');
 if(!/streetwear|disobedient|vylin|villain/i.test(text))return [];
 const ids=[/disobedient/i.test(text)&&'disobedient',/\b(?:vylin|villain)\b/i.test(text)&&'vylin'].filter(Boolean);
 return ids.length?ids:['disobedient','vylin'];
}
export function createCampaignDemo({store,clientDemo,assetExists=url=>Boolean(url?.startsWith('/')&&existsSync(new URL('./public'+url,import.meta.url)))}){
 function get(brandId='disobedient'){
  const packet=clientDemo.get(),brands=packet.brands.filter(b=>['disobedient','vylin'].includes(b.id));
  const brand=brands.find(b=>b.id===brandId);if(!brand)throw fail('Choose Disobedient or VYLIN for this rehearsal.');
  const sample=(brand.demoSampleVideo||brand.sampleVideo)&&assetExists((brand.demoSampleVideo||brand.sampleVideo).url)&&(brand.demoSampleVideo||brand.sampleVideo).visualQA?.status!=='needs_revision'?(brand.demoSampleVideo||brand.sampleVideo):null;
  const final=brand.demoFinalVideo&&assetExists(brand.demoFinalVideo.url)?brand.demoFinalVideo:null;
  const exa=(brand.history||[]).filter(e=>e.mode==='recorded'&&/exa/i.test(e.tool||''));
  const product=(brand.assets||[]).find(a=>a.kind==='product'&&/back/i.test(a.title||''))||(brand.assets||[]).find(a=>a.kind==='product');
  const characterUrl=brand.demoKind==='streetwear'?'/streetwear-demo-assets/london-character-hoodie-concepts-v1.png':brand.persona?.imageUrl;
  const message=`Hey ${brand.name} team, we made a short AI UGC sample around your hoodie using our PS2-style London game character. Here is the sample. If you like the direction, we can turn it into a finished campaign ad for $500. Interested?`;
  const steps=[
   {id:'task',title:'Create the campaign task',provider:'Mint',mode:'recorded',view:'task',input:{request:'Find me streetwear brands we can run AI UGC content campaigns for'},output:{taskId:brand.taskId,brand:brand.name,taskReused:true}},
   {id:'research',title:'Find Disobedient and VYLIN',provider:'Exa',mode:'recorded',view:'brands',input:{queries:exa.map(e=>e.input)},output:{brands:brands.map(b=>({name:b.name,website:b.website})),savedSearches:exa.length},records:exa.map(e=>safeLogValue(e))},
   {id:'product',title:'Collect the hoodie reference',provider:'Web',mode:'recorded',view:'product',input:{website:brand.website},output:{imageUrl:product?.imageUrl,sourceUrl:product?.sourceUrl||brand.website,title:product?.title}},
   {id:'character',title:'Prepare the PS2 character and campaign direction',provider:'ImageGen',mode:'recorded',view:'character',input:{brand:brand.name,environment:brand.persona?.environment,visualStyle:campaignVisualStyle},output:{conceptUrl:brand.id==='disobedient'?null:assetExists(characterUrl)?characterUrl:null,historicalImageGenConceptUrl:assetExists(characterUrl)?characterUrl:null,garmentAnchorUrl:brand.storyboardImageUrl,visualStyle:campaignVisualStyle.label,note:'Saved character concepts and garment reference. No new image generation during replay.'}},
   {id:'sample',title:'Generate the outreach sample',provider:'Higgsfield',mode:'replay',view:'sample',input:{brand:brand.name},output:{videoUrl:sample?.url||null,requestId:sample?.requestId||null,durationSeconds:sample?.durationSeconds||null,note:sample?'Replay the actual saved generated sample.':'No generated sample is available for this brand yet.'}},
   {id:'review',title:'Wait for sample review',provider:'Terac',mode:'simulated',view:'review',delayMs:4500,input:{sampleUrl:sample?.url||null},output:{status:'Waiting for review',realHumanPanel:false,productionApprovalRecorded:false}},
   {id:'review-approved',title:'Sample approved',provider:'Terac',mode:'simulated',view:'review-approved',delayMs:2500,input:{scenario:'Approval notification'},output:{decision:'Someone approved the sample',realHumanPanel:false,productionApprovalRecorded:false},notification:'Someone approved the sample'},
   {id:'outreach',title:'Send the sample and outreach copy',provider:'Email',mode:'simulated',view:'email',input:{recipient:`${brand.name} team`,subject:`A hoodie ad sample for ${brand.name}`,copy:message,attachments:sample?[{title:'Generated hoodie sample',url:sample.url}]:[]},output:{sent:true,providerReceipt:null,realEmailSent:false},notification:`Email sent to ${brand.name} with the sample`},
   {id:'reply',title:'Receive a positive reply',provider:'Email',mode:'simulated',view:'reply',input:{thread:`Demo ${brand.name} outreach`},output:{text:'Hey, yeah, I like this. Let’s do it. Send me the checkout link.',realReplyReceived:false},notification:`Reply from ${brand.name}: “I like this”`},
   {id:'checkout',title:'Create and send the Whop checkout link',provider:'Whop MCP',mode:'simulated',view:'checkout',input:{product:'AI UGC campaign ad',amountUsd:500,brand:brand.name},output:{checkoutId:`demo-${brand.id}-500`,displayLink:`Checkout / ${brand.name} / $500`,realCheckoutCreated:false}},
   {id:'paid',title:'Receive the $500 checkout notification',provider:'Whop MCP',mode:'simulated',view:'paid',input:{checkoutId:`demo-${brand.id}-500`},output:{buyer:'Tobin',amountUsd:500,status:'paid',realPaymentReceived:false},notification:'Tobin checked out for $500'},
   {id:'full-render',title:'Generate the finished campaign clip',provider:'Higgsfield',mode:'replay',view:'rendering',input:{payment:'Simulated checkout',brand:brand.name},output:{videoUrl:final?.url||null,providerRequests:final?.verification?.providerRequests||[],note:'Demo generation progress loads an existing finished asset. No new paid generation.'}},
   {id:'delivery',title:'Show the completed ad',provider:'Mint',mode:'replay',view:'final',input:{brand:brand.name},output:{videoUrl:final?.url||null,durationSeconds:final?.durationSeconds||null,note:final?'Actual saved finished ad, shown after the demo checkout.':'Finished ad is not ready for this brand.'}}
  ];
  return {mode:'rehearsal',brandId:brand.id,brandName:brand.name,taskId:brand.taskId,brands:brands.map(b=>({id:b.id,name:b.name,taskId:b.taskId,sampleReady:Boolean(b.sampleVideo&&assetExists(b.sampleVideo.url)&&b.sampleVideo.visualQA?.status!=='needs_revision')})),sampleReady:Boolean(sample),finalReady:Boolean(final),visualStyle:campaignVisualStyle,steps,safety:{realEmailSent:false,realPaymentReceived:false,realTeracPanelLaunched:false,realWhopMcpCalled:false,newProviderGeneration:false},preparedAt:packet.preparedAt};
 }
 function start(message){
  const text=String(message||'').trim();if(text.length<3||text.length>2000)throw fail('Write a streetwear campaign request.');
  const ids=campaignDemoBrands(text);if(!ids.length)throw fail('This demo supports streetwear campaigns for Disobedient and VYLIN.');
  const tasks=ids.map(id=>clientDemo.prepare(id).task);
  const packet=clientDemo.get(),selected=packet.brands.find(b=>ids.includes(b.id)&&b.sampleVideo?.visualQA?.status!=='needs_revision'&&assetExists(b.sampleVideo?.url))?.id||ids[0];
  const scenario=get(selected),runId=`demo-${randomUUID()}`;
  store.db.exec('create table if not exists assistant_messages(id integer primary key,at text not null,role text not null,content text not null)');
  const actions=[{tool:'campaign_demo',input:{brandId:selected,taskId:scenario.taskId},status:'success',result_summary:'Campaign workflow ready with research, character references and media.'}];
  const reply=`Campaign ready for ${scenario.brandName}. Open the workflow to follow research, sample creation, review, outreach, checkout and delivery.`;
  const insert=store.db.prepare('insert into assistant_messages(at,role,content) values(?,?,?)');
  insert.run(new Date().toISOString(),'user',JSON.stringify({text}));insert.run(new Date().toISOString(),'assistant',JSON.stringify({text:reply,actions}));
  store.bus.emit('change',{kind:'assistant'});
  return {demo:true,mode:'rehearsal',runId,brandId:selected,taskId:scenario.taskId,tasks:tasks.map(t=>({id:t.id,brand:t.plan.brand})),reply,actions,url:`#/walkthrough/${selected}?autoplay=1`,cost:0};
 }
 return {get,start};
}
