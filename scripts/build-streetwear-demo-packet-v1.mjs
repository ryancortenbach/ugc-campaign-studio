// Assemble actual research history and review assets without executing paid work.
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {openStore} from '../agent/store.mjs';
import {createProductionResearch} from '../agent/production-research.mjs';
import path from 'node:path';

const root=path.resolve(import.meta.dirname,'..');
const notes=path.join(root,'research_notes/streetwear-demo-v1');
const work=path.join(root,'work/streetwear-demo-v1');
const pub=path.join(root,'agent/public');
const dir=path.join(pub,'streetwear-demo-records');mkdirSync(dir,{recursive:true});
const read=file=>JSON.parse(readFileSync(file,'utf8'));
const receipt=read(path.join(notes,'run-receipt-v1.json'));
const verified=read(path.join(notes,'verified-sources-v1.json'));
const bindings=read(path.join(notes,'genjutsu-bound-v1.json'));
const imageCall=read(path.join(notes,'imagegen-concept-call-v1.json'));
const qa=read(path.join(notes,'garment-concept-qa-v1.json'));
const rpc=readFileSync(path.join(work,'exa-rpc.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
const prior=read(path.join(pub,'client-demo-data-v1.json'));
const store=openStore();
const asset=file=>'/streetwear-demo-assets/'+file;
const source=(url,title)=>({url,title});
const local=(id,stage,tool,title,input,output,evidence=[])=>({id,stage,tool,title,mode:'recorded',kind:'tool',status:'complete',input,output,evidence,note:'Completed local workflow step. No paid video or outbound execution is implied.'});
const brands=[];
try{
 for(const row of receipt.brands){
  const {id,name,website}=row.brand;
  const v=verified.brands.find(b=>b.name===name),product=v.selected_demo_product;
  const sources=v.sources.map(s=>source(s.url,s.kind.replaceAll('_',' ')));
  const tagged={...store,addEvent:event=>store.addEvent({...event,taskId:row.taskId})};
  const production=createProductionResearch({store:tagged});
  const observations=[{section:'brand',sourceUrl:website,claim:v.official_positioning},
   {section:'brand',sourceUrl:product.product_url,claim:`Official product listing: ${product.name}, displayed ${product.displayed_price}. ${product.visually_observed.join('; ')}.`},
   {section:'audience',sourceUrl:website,claim:'Creative hypothesis: test adults aged 18-24 in London who like streetwear and nostalgic game-style content. This is a proposed demo target, not measured customer demographics.',kind:'hypothesis'}];
  for(const observation of observations){
   if(!production.get(row.dossierId).evidence.some(e=>e.claim===observation.claim))await production.call('research_add_evidence',{id:row.dossierId,kind:'observation',...observation});
  }
  const dossier=await production.call('research_synthesize',{id:row.dossierId});
  const calls=rpc.filter(r=>r.brandId===id);
  const rawUrl=`/streetwear-demo-records/${id}-exa-rpc-v1.json`;
  writeFileSync(path.join(pub,rawUrl),JSON.stringify({provenance:'Actual request and response bodies. Session and authorization headers were never recorded. Search excerpts are unverified candidates, not accepted findings.',records:calls},null,2)+'\n');
  const history=[];
  for(const section of ['brand','audience','creators','formats']){
   const result=read(path.join(work,`${id}-${section}.json`));
   const resultUrl=`/streetwear-demo-records/${id}-${section}-exa-v1.json`;
   writeFileSync(path.join(pub,resultUrl),JSON.stringify({...result,verification:'Raw live Exa search results. Unrelated and unvisited candidates are not verified brand evidence.'},null,2)+'\n');
   const official=result.results.filter(r=>new URL(r.url).hostname.replace(/^www\./,'')===new URL(website).hostname.replace(/^www\./,''));
   history.push({id:`exa-${section}`,stage:section==='audience'?2:section==='brand'?0:4,tool:'Exa.web_search_exa',title:`Research ${section} for ${name}`,mode:'recorded',kind:'tool',status:'complete',startedAt:result.startedAt,completedAt:result.completedAt,durationMs:result.durationMs,input:{query:result.query,provider:result.provider,paidFallback:false},output:{resultCount:result.results.length,officialDomainCandidates:official.length,costUsd:0,qualification:'Returned excerpts are leads only. Similar-name creators and generic format pages do not establish brand relationships, customer analytics or paid ads.'},evidence:official.map(r=>source(r.url,r.title)),rawRecordUrl:resultUrl,note:'Actual completed Exa call. Full MCP initialize, initialized, tools/list and tools/call history is also available in the raw transport record.'});
  }
  const apparel=(id==='disobedient'?'Light heather grey Low Lives pullover, blank front, no zipper or chest mark. Blue/red rear artwork only on the back.':'Black Cream Headphones zip hoodie; small cream globe/leaf at wearer left chest, large cream headphones/leaf on the back only.');
  const plan=bindings.brandPreflights.find(b=>b.brandId===id);
  const request=plan.preparedRequest.documentedInputFieldsBound;
  const componentScores=id==='disobedient'?[20,17,7,8,12]:[20,18,10,9,12];
  const scoreNames=['Product and sample fit','Original creative potential','Decision maker reachability','Commercial evidence','Usable content reference'];
  const scoreReasons=['Exact hoodie photographs and product page verified.','Existing fictional UK character can demonstrate an original variation; actual customer fit untested.','Official social/contact route available; founder and friend recipient unknown.','Product pricing visible; revenue, payers, client payment and buying intent unknown.','Real garment references; no verified brand-specific Meta or organic video reference.'];
  const briefUrl=asset(`${id}-brief-v1.pdf`);
  const b={id,name,website,demoKind:'streetwear',taskId:row.taskId,
   founders:[{name:'Founder not established',role:'Official brand verified. Neither payment nor an inbound DM is attributed to this brand. Friend test recipient has not been supplied.',status:'Identity unresolved',url:website}],
   product:{summary:`${v.official_positioning} Demo garment: ${product.name}.`,features:[...product.vendor_claims,...product.visually_observed]},
   score:{total:componentScores.reduce((a,b)=>a+b,0),max:100,confidence:'Editorial creative fit only',components:scoreNames.map((name,i)=>({name,score:componentScores[i],max:20,rationale:scoreReasons[i]}))},
   revenue:{status:'Unknown',summary:'No verified company revenue or customer count. Product price is not revenue.',scenarios:[],limitations:['No payment is mapped to this brand. No sales, conversion or audience performance claim is made.']},
   icp:{summary:'Proposed creative test: adult UK/London streetwear fans, aged 18-24, who enjoy nostalgic game-style edits and hoodie styling. This is an original demo direction, not measured brand analytics.',evidence:[v.official_positioning,`Official ${product.name} apparel imagery and vendor product description.`],hypotheses:['Test whether the existing London character works for a New York brand; UK customer overlap is unverified.','Compare a short identity-driven opener with a product-led hoodie opener.'],painPoints:['Choosing clothing with a recognizable visual identity','Understanding fit, color, construction and where to shop']},
   persona:{name:'Original London game character',description:'Reuse the existing fictional adult PS2-style London presenter: blond braids, same face, grey trousers and white sneakers. This is a historical owned creative asset, not a newly discovered creator or customer.',wardrobe:apparel,imageUrl:asset('original-london-character-1s.jpg'),environment:'Existing Canary Wharf penthouse at dusk, leather armchair, floor lamp and London skyline. Preserve camera, pose, voice and scene through the garment edit.',rationale:'The current user-selected direction uses an existing character. Exact brand audience fit remains a creative hypothesis. The ImageGen garment concept is a still preview, not a Genjutsu result.'},
   assets:[{kind:'logo',title:`Official ${name} logo`,imageUrl:asset(id==='disobedient'?'disobedient-official-logo-v1.png':'vylin-official-wordmark-v1.png'),sourceUrl:website,note:'Official unedited header logo.'},...verified.assets.filter(a=>a.file?.includes(`${id}-hoodie-`)).map(a=>({kind:'product',title:path.basename(a.file).replaceAll('-',' ').replace('.jpg',''),imageUrl:asset(path.basename(a.file)),sourceUrl:a.source_url,note:'Actual official ecommerce photograph. Reference only; not a Meta ad or generated output.'}))],
   references:verified.assets.filter(a=>a.file?.includes(`${id}-hoodie-`)).map(a=>({url:product.product_url,title:`${product.name}: ${path.basename(a.file).includes('back')?'back':path.basename(a.file).includes('model')?'on-body fit':'front'}`,status:'Official product photo inspected',observation:'Real garment reference. Match construction and artwork placement. Do not copy the photographed model identity.',imageUrl:asset(path.basename(a.file))})),
   sourceVideo:{url:asset('generic-source-6s-v1.mp4'),title:'Existing London character, six-second generic source',kind:'historical',posterUrl:asset('original-london-character-1s.jpg'),note:'Earlier generic lettering-cleanup asset. This source is real, but it is not a newly rendered branded garment swap.'},
   storyboardImageUrl:asset('london-character-hoodie-concepts-v1.png'),storyboardCaption:'Combined ImageGen approval sheet: Disobedient at left, VYLIN at right. Static concepts only. Exact logo fidelity and motion remain unverified.',
   script:{durationSeconds:8,hook:`Same London character. ${product.name}. Shop ${new URL(website).hostname.replace(/^www\./,'')}.`,shots:[{start:0,end:3,camera:'Existing vertical PS2 penthouse opening.',action:`Replace only the blue garment with the verified ${product.name}. Keep the face, scene and original movement.`,line:'Preserve the original source dialogue; no new speech is claimed.'},{start:3,end:6,camera:'Continue the existing source camera cuts.',action:'Keep garment construction, graphics and hand occlusion stable. No fake rear design on the front.',line:'Suggested overlay: '+product.name},{start:6,end:8,camera:'Deterministic product end card.',action:`Show genuine hoodie reference, product name, and brand website ${website}. Link destination: ${product.product_url}. No Mint checkout destination.`,line:`Shop ${product.name} at ${new URL(website).hostname.replace(/^www\./,'')}.`}]},
   genjutsuPreparation:{model:'higgsfield/genjutsu-light/object-swap/v1.0',request,sourceUrl:'https://open.higgsfield.ai/models/higgsfield/genjutsu-light/object-swap/v1.0/api-reference',limitations:['Preparation only; no new branded video submitted or generated.','Six-second source is within the first-15-second processing limit.','Audio is preserved by Genjutsu; any new brand-specific speech requires separate voice/lip-sync work.','Provider-accessible historical source verified: six seconds at30fps, without audio. Restore original local audio after garment repair.','Planning estimate: $1.20 per brand at 720p, subject to account quote.','Append a two-second website/product end card after the six-second garment repair.']},
   outboundDemo:{channel:'DM',recipientLabel:'Friend test recipient',recipientStatus:'Recipient handle and platform not supplied',status:'draft',message:`Hey, this is a real outbound test of our creative workflow using ${name}. The task contains the sourced research, a two-page brief and a hoodie concept around our London game character. The branded motion sample is still awaiting production. Product: ${product.product_url}`},
   reportUrl:briefUrl,offerPdfUrl:briefUrl,offerPreviewUrls:[asset(`${id}-brief-v1-page-1.png`),asset(`${id}-brief-v1-page-2.png`)],sources,
   gaps:['Actual friend DM handles and platform','No verified paid-client relationship or inbound message','Brand customer demographics, revenue and founder identity','No verified target Meta ad or individual organic video','Human concept approval, production quote approval and actual branded Genjutsu output','Exact garment/logo motion QA and full audio review'],
   cta:{label:`Shop ${product.name}`,websiteUrl:website,url:product.product_url,checkoutUrl:null},history};
  history.push(local('source-verification',0,'public_web + view_image','Verify the real brand and hoodie references',{website,product:product.product_url},{verified:true,paidClientVerified:false,inboundDmVerified:false},sources));
  history.push(local('icp',2,'production.research_synthesize','Assemble cited observations and ICP hypotheses',{dossierId:row.dossierId},{method:'Evidence assembly, not a model invocation',synthesis:dossier.synthesis},sources));
  history.push({...local('imagegen',3,'image_gen.imagegen','Preview both hoodies on the existing London character',{prompt:imageCall.prompt,references:imageCall.references},{imageUrl:imageCall.output,itemizedCostUsd:null,videoGenerated:false},[source(imageCall.output,'Actual generated still concepts')]),startedAt:imageCall.startedAt,completedAt:imageCall.completedAt});
  history.push(local('static-review',3,'view_image + independent review','Review identity and garment direction',{assets:['original London frame','both official garment references','generated concept sheet']},{review:'Conditional concept pass. Framing changed; exact VYLIN logo linework unverified. Human approval and motion review pending.'}));
  history.push(local('pdf',5,'local_pdf.build','Create the two-page ICP and creative brief',{brand:name},{pdfUrl:briefUrl,pages:2,source:'Actual generated and rendered PDF'},[source(briefUrl,'Two-page brief')]));
  history.push(local('prepare',4,'Genjutsu request preparation','Bind the real garment references',{model:b.genjutsuPreparation.model},{request,submitted:false,executable:false,cta:b.cta},[source(product.product_url,'Exact hoodie'),source(b.genjutsuPreparation.sourceUrl,'Official model docs')]));
  const quote=read(path.join(work,`${id}-estimate.json`));
  const quoteUrl=`/streetwear-demo-records/${id}-genjutsu-estimate-v1.json`;
  writeFileSync(path.join(pub,quoteUrl),JSON.stringify(quote,null,2)+'\n');
  history.push({...local('quote',4,'Higgsfield.estimate','Fetch the real Genjutsu pricing rule',{model:b.genjutsuPreparation.model,sourceSeconds:6,resolution:'720p',garmentImages:request.image_urls},{quote,planningEstimateUsd:1.2,retries:0,submitted:false},[source(quoteUrl,'Actual estimate response')]),rawRecordUrl:quoteUrl});
  history.push({id:'production-approval',stage:5,tool:'production approval',title:'Actual production approval pending',mode:'recorded',kind:'gate',status:'pending',input:{planningEstimateUsd:1.2},output:{approved:false,submitted:false},evidence:[],note:'This is a real unresolved gate. Replay does not approve or run it.'});
  const task=store.getTask(row.taskId),callId=randomUUID();
  store.addEvent({taskId:task.id,type:'tool_call',tool:'streetwear_demo.assemble',title:`Assemble the ${name} research demo`,data:{callId,status:'running',input:{brandId:id}}});
  store.updateTask(task.id,{status:'ready',summary:'Real Exa research, real hoodie references, two-page ICP brief and original London-character concepts ready. Genjutsu execution and friend DM remain pending.',plan:{...task.plan,brief:{product:b.product.summary,audience:b.icp.summary,idea:b.script.hook},clientDemo:{brandId:id,version:2,stage:'human_review',productionAuthorized:false,sendingAuthorized:false,reportUrl:briefUrl,offerPdfUrl:briefUrl,sourceMode:'live_exa_and_verified_official_sources',packet:b}}});
  store.addEvent({taskId:task.id,type:'tool_result',tool:'streetwear_demo.assemble',title:`${name} research demo ready for review`,data:{callId,status:'success',costUsd:0,output:{pdfUrl:briefUrl,historyEntries:history.length,productionAuthorized:false,sendingAuthorized:false}}});
  brands.push(b);
 }
 const packet={version:2,mode:'demo',preparedAt:new Date().toISOString(),activeBrandIds:brands.map(b=>b.id),historyDisclosure:'Actual free Exa calls, verified official garment sources and local artifact history. No invented paid clients, inbound DMs, Genjutsu results or outbound receipts.',brands:[...brands,...prior.brands.filter(b=>!brands.some(n=>n.id===b.id))]};
 writeFileSync(path.join(pub,'client-demo-data-v2.json'),JSON.stringify(packet,null,2)+'\n');
 mkdirSync(path.join(root,'reports'),{recursive:true});
 const lines=['# Streetwear research and product demo','',packet.historyDisclosure,''];
 for(const b of brands){lines.push(`## ${b.name}`,'',b.product.summary,'',`[Two-page ICP and creative PDF](${b.offerPdfUrl})`,'',b.icp.summary,'',`Product CTA: [${b.cta.label}](${b.cta.url}). Brand website: [${b.name}](${b.website}).`,'',`Research task ${b.taskId}: four real Exa searches. [Complete MCP call history](/streetwear-demo-records/${b.id}-exa-rpc-v1.json).`,'',...b.gaps.map(g=>'- '+g),'',...b.sources.map(s=>`- [${s.title}](${s.url})`),'');}
 writeFileSync(path.join(root,'reports/streetwear-demo-v1.md'),lines.join('\n').trimEnd()+'\n');
 console.log(JSON.stringify({brands:brands.map(b=>({id:b.id,taskId:b.taskId,history:b.history.length,brief:b.offerPdfUrl})),rpcCalls:rpc.filter(r=>r.type==='call').length,paidSubmissions:0,sends:0}));
}finally{store.db.close();}
