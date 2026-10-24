import {readFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {z} from 'zod';
import {searchResearchFree} from './tools/research-exa.mjs';

const here=path.dirname(fileURLToPath(import.meta.url)),knowledge=path.join(here,'knowledge/penthouse-v1');
const mediaRoot=path.join(here,'../private-research/penthouse-v1');
const read=name=>readFileSync(path.join(knowledge,name),'utf8');
const manifest=()=>JSON.parse(read('manifest.json'));
const referenceFiles=()=>manifest().files.map(f=>f.file).filter(f=>/\.(md|txt|py|json|srt)$/.test(f));
const error=(message,status=400)=>Object.assign(Error(message),{status});
const text=z.string().trim().min(1).max(2000);
const key=z.string().min(1).max(100);
const publicUrl=z.string().url().max(1500).refine(s=>{const u=new URL(s);return u.protocol==='https:'&&!u.username&&!u.password;},'Use a public HTTPS URL without credentials.');
const section=z.enum(['brand','audience','creators','formats']);
export const researchAgents=[
 {id:'brand',name:'Brand researcher',output:'Products, price range, positioning, official site and owned social accounts with dated citations.'},
 {id:'audience',name:'Audience researcher',output:'Customer evidence, interests, use cases and candidate ICPs. Keep demographics unknown unless a source states them.'},
 {id:'creators',name:'Creator researcher',output:'Relevant public Instagram, X, TikTok and YouTube profiles, recent post URLs, view counts, dates and category fit. No invented performance.'},
 {id:'formats',name:'Format researcher',output:'Source-backed hooks, beats, camera grammar and scenes. Adapt ideas into original scripts and original characters.'},
 {id:'creative',name:'Character and scene planner',output:'An ICP-linked original character brief, product and voice locks, then a timed storyboard using the recovered workflow.'},
 {id:'parity',name:'Production checker',output:'Reference readiness, missing inputs, exact request contracts, unsupported capabilities and a zero-spend receipt.'}
];
const schemas={
 workflow_knowledge:z.object({}).strict(),
 workflow_reference:z.object({file:z.enum(referenceFiles())}).strict(),
 workflow_rehearse:z.object({}).strict(),
 research_plan:z.object({brand:text,category:z.enum(['apparel','streetwear','drink','other']).default('apparel'),website:publicUrl.optional()}).strict(),
 research_search_free:z.object({id:key,section}).strict(),
 research_add_evidence:z.object({id:key,section,sourceUrl:publicUrl,claim:text,kind:z.enum(['observation','hypothesis']).default('observation'),observedAt:z.string().datetime().optional(),creatorProfile:publicUrl.optional(),postUrl:publicUrl.optional(),views:z.number().int().nonnegative().optional(),publishedAt:z.string().datetime().optional(),rights:z.enum(['unknown','owned','licensed']).default('unknown')}).strict(),
 research_synthesize:z.object({id:key}).strict(),
 workflow_prepare:z.object({id:key.optional()}).strict(),
 provider_prepare:z.object({operation:z.enum(['audio_isolation','voice_remix','voice_change','solari_visit','seedance_text_video']),voiceId:z.string().regex(/^[A-Za-z0-9_-]{1,100}$/).optional(),prompt:text.optional()}).strict()
};
const descriptions={
 workflow_knowledge:'Read the recovered London penthouse workflow, exact prompts, lessons, assets and current API parity gaps. Local only, zero cost.',
 workflow_reference:'Read one imported prompt, fix plan, caption timing example or production script from the knowledge manifest. Local, zero cost, no script execution.',
 workflow_rehearse:'Rehearse the historical 3-clip workflow locally and verify hashes. Shows historical playback and missing inputs. Never calls a paid provider.',
 research_plan:'Create a zero-budget brand research dossier and specialist research queues. Does not run models or searches.',
 research_search_free:'Run one specialist section through the free keyless Exa MCP. No paid REST fallback, LLM call or Solari session.',
 research_add_evidence:'Save a cited audience, creator, brand or format observation to a local dossier. Views require a post URL. No network call.',
 research_synthesize:'Turn saved evidence into a source-linked ICP brief, creator performance shortlist and original character/scene handoff. Unknown facts stay unknown. No model call.',
 workflow_prepare:'Compile the historical multi-clip production plan with exact prompts and voice references. Reports unsupported API reference and extension features. Never submits.',
 provider_prepare:'Build a documented provider request envelope as a dry run. Returns executable=false for every paid operation; it cannot spend or submit.'
};
export const productionToolDefinitions=Object.entries(schemas).map(([name,schema])=>{const {$schema,...input_schema}=z.toJSONSchema(schema);return {name,description:descriptions[name],input_schema};});

const doc={
 seedance:'https://open.higgsfield.ai/models/bytedance/seedance-2.5/text-to-video/api-reference',
 isolation:'https://elevenlabs.io/docs/api-reference/audio-isolation/convert',
 remix:'https://elevenlabs.io/docs/api-reference/text-to-voice/remix',
 change:'https://elevenlabs.io/docs/api-reference/speech-to-speech/convert',
 solari:'https://docs.getsolari.com/api-reference',
 exa:'https://exa.ai/docs/get-started/exa-mcp'
};
export function productionCapabilities(){return {checkedAt:'2026-10-24',budgetUsd:0,paidExecutionEnabled:false,capabilities:[
 {id:'exa',state:'free_transport',detail:'Free keyless MCP only. Never uses the configured REST key.',source:doc.exa},
 {id:'solari',state:'blocked_budget',detail:'Cloud-browser sessions consume resources. Requests can be planned, but no session is launched.',source:doc.solari},
 {id:'voice_change',state:'documented_not_executed',detail:'Current docs use /v1/voice-changer/:voice_id with audio and eleven_multilingual_sts_v2. Historical workflow used /v1/speech-to-speech.',source:doc.change},
 {id:'isolation_remix',state:'documented_not_executed',detail:'Audio isolation and studio remix contracts prepared. No credits consumed.',source:doc.remix},
 {id:'seedance',state:'partial_contract_only',detail:'Public text-to-video schema supports prompt, duration, resolution, aspect_ratio, output_format and generate_audio. It does not document character Elements, audio references or Extend Video.',source:doc.seedance},
 {id:'exact_visual_parity',state:'unverified',detail:'Historical final plays locally. A new API-generated match has not been demonstrated. Generation and reference/extend support remain blocked.'}
]};}

export function localWorkflowAsset(id){
 const item=manifest().media.find(m=>m.id===id);if(!item)throw error('Unknown historical asset.',404);
 const file=path.join(mediaRoot,item.file);if(!existsSync(file))throw error('Historical asset is missing on this machine.',404);
 return {file,type:({'.mp4':'video/mp4','.mp3':'audio/mpeg','.jpg':'image/jpeg'})[path.extname(file)],item};
}
function requestEnvelope(operation,args){
 const base={operation,mode:'dry_run',executable:false,budgetUsd:0,networkCalls:0,reason:'Paid execution is disabled for this workspace.'};
 switch(operation){
  case 'audio_isolation':return {...base,method:'POST',url:'https://api.elevenlabs.io/v1/audio-isolation',encoding:'multipart/form-data',fields:{audio:'<licensed source audio file>'},source:doc.isolation};
  case 'voice_remix':return {...base,method:'POST',url:`https://api.elevenlabs.io/v1/text-to-voice/${args.voiceId||'<voice_id>'}/remix`,encoding:'application/json',body:{voice_description:'Recorded in a studio on a condenser microphone, crisp and relaxed, preserve the British delivery.',auto_generate_text:true},source:doc.remix};
  case 'voice_change':return {...base,method:'POST',url:`https://api.elevenlabs.io/v1/voice-changer/${args.voiceId||'<voice_id>'}`,encoding:'multipart/form-data',fields:{audio:'<isolated reference performance>',model_id:'eleven_multilingual_sts_v2',remove_background_noise:false},source:doc.change};
  case 'solari_visit':return {...base,sdk:'@solarisdk/browser',calls:['new Solari({apiKey, baseUrl: "https://api.getsolari.com"})','launch({stealth:false})','newPage()','goto(publicSourceUrl)','evaluate(public visible content)','close() in finally'],source:doc.solari};
  case 'seedance_text_video':return {...base,method:'POST',url:'https://api.higgsfield.ai/bytedance/seedance-2.5/text-to-video',encoding:'application/json',body:{prompt:args.prompt||'Prepared penthouse scene prompt',duration:10,resolution:'720p',aspect_ratio:'9:16',output_format:'mp4',generate_audio:true},unsupported:['Element references','audio reference','previous video extension'],source:doc.seedance};
 }
}
function queriesFor(brand,category,website){
 const subject=`${brand} ${category} brand${website?' '+website:''}`;
 return {
  brand:`${subject} official products about pricing positioning Instagram X TikTok YouTube`,
  audience:`${subject} customer reviews community who buys target audience interests customer interviews. Return evidence and URLs; do not infer age or demographics from appearance.`,
  creators:`${subject} relevant independent creators Instagram reels TikTok YouTube X public posts views dates product fashion styling reviews. Return profile and individual post URLs.`,
  formats:`${subject} high-view creator reels hooks storytelling scripts product demonstration camera shots. Cite individual public posts and visible view counts. Analyze format and original adaptation ideas.`
 };
}
export function createProductionResearch({store,search=searchResearchFree}={}){
 if(!store)throw Error('A local store is required.');
 store.db.exec('create table if not exists production_research(id text primary key,created_at text not null,updated_at text not null,body text not null)');
 const busy=new Set();
 const save=d=>{d.updatedAt=new Date().toISOString();store.db.prepare('insert into production_research(id,created_at,updated_at,body) values(?,?,?,?) on conflict(id) do update set updated_at=excluded.updated_at,body=excluded.body').run(d.id,d.createdAt,d.updatedAt,JSON.stringify(d));store.bus.emit('change',{kind:'production_research'});return d;};
 const get=id=>{const row=store.db.prepare('select body from production_research where id=?').get(id);if(!row)throw error('Research dossier not found.',404);return JSON.parse(row.body);};
 const list=()=>store.db.prepare('select body from production_research order by updated_at desc limit 50').all().map(r=>JSON.parse(r.body));
 const synthesis=d=>{
  const e=d.evidence,observations=type=>e.filter(x=>x.section===type&&x.kind==='observation');
  const audience=observations('audience');
  const candidates=new Map();
  for(const x of observations('creators')){
   const profile=x.creatorProfile||null;if(!profile)continue;
   const c=candidates.get(profile)||{profile,postSamples:[],evidenceIds:[],rights:'unknown'};
   if(x.postUrl&&Number.isInteger(x.views)&&x.observedAt&&x.publishedAt&&!c.postSamples.some(p=>p.url===x.postUrl))c.postSamples.push({url:x.postUrl,views:x.views,observedAt:x.observedAt,publishedAt:x.publishedAt});
   c.evidenceIds.push(x.id);candidates.set(profile,c);
  }
  const creators=[...candidates.values()].map(c=>{const views=c.postSamples.map(p=>p.views).sort((a,b)=>a-b),mid=Math.floor(views.length/2);return {...c,sampleCount:views.length,medianViews:views.length?(views.length%2?views[mid]:(views[mid-1]+views[mid])/2):null,status:views.length>=5?'performance_sample_ready':'needs_more_post_evidence',fit:'Unverified. A view sample alone does not establish audience fit.',avatarUse:'Original character by default. Identity or voice reuse requires a separate owned or licensed reference.'};}).sort((a,b)=>(b.medianViews??-1)-(a.medianViews??-1));
  return {brand:d.brand,category:d.category,budgetUsd:0,method:'Evidence assembly without an LLM. No demographic or audience-fit conclusion is invented.',
   icp:{status:audience.length?'candidate_needs_review':'insufficient_evidence',audienceEvidence:audience,demographics:'Unknown unless explicit cited evidence establishes them.',hypotheses:e.filter(x=>x.kind==='hypothesis'),requiredNext:['Validate one customer use case and buying motivation against audience evidence.','Confirm creator audience overlap and review at least five dated posts before selection.']},
   creators,
   characterBrief:{identity:'Original character; define appearance after ICP review.',audienceEvidenceIds:audience.map(x=>x.id),wardrobe:`Verified ${d.brand} product reference required.`,voice:'Original or licensed British delivery reference if the penthouse direction is selected.',environment:'Choose a customer-relevant setting from cited audience research.',status:'planning_only'},
   scenes:[{id:'hook',seconds:[0,3],purpose:'Audience-relevant hook grounded in a cited problem or desire.',sourceIds:audience.map(x=>x.id)},{id:'demonstration',seconds:[3,10],purpose:'Verified product action in the same setting, with character and product references locked.',sourceIds:observations('brand').map(x=>x.id)},{id:'payoff',seconds:[10,15],purpose:'Original punchline or product reveal and verified offer.',sourceIds:observations('formats').map(x=>x.id)}],
   blockers:['ICP and original script need review.','No Solari browser verification has run.','No images, voice or video have been generated.']};
 };
 async function execute(name,args){
  switch(name){
   case 'workflow_knowledge':{const m=manifest();return {manifest:m,workflow:read('WORKFLOW.md'),agents:researchAgents,capabilities:productionCapabilities(),rules:m.rules};}
   case 'workflow_reference':return {file:args.file,content:read(args.file),mode:'local_reference',executable:false,costUsd:0};
   case 'workflow_rehearse':{const m=manifest();return {mode:'historical_rehearsal',costUsd:0,networkCalls:0,generated:false,assets:m.media.map(a=>{try{const {file}=localWorkflowAsset(a.id);return {...a,url:`/production-media/${a.id}`,hashVerified:createHash('sha256').update(readFileSync(file)).digest('hex')===a.sha256};}catch{return {...a,hashVerified:false,missing:true};}}),missing:m.missing,stages:['Review exact prompts and storyboard','Reuse approved historical voice reference locally','Clip 1: penthouse opener, 10 seconds','Clip 2: Wingstop entrance and bag crunch, 10 seconds','Clip 3: two-finger hoodie tap and payoff, 7 seconds','Join, trim dead air, fixed-baseline captions, music mix'],parity:'Historical playback only. A new matching generation remains unverified.'};}
   case 'research_plan':{const id=randomUUID(),now=new Date().toISOString(),queries=queriesFor(args.brand,args.category,args.website);return save({id,brand:args.brand,category:args.category,website:args.website||null,createdAt:now,budgetUsd:0,agents:researchAgents,queries,evidence:[],searches:[],status:'planned'});}
   case 'research_search_free':{
    if(busy.has(args.id))throw error('A research search is already running for this dossier.',409);
    const d=get(args.id);if(d.searches.length>=8)throw error('This dossier reached its eight-search rehearsal limit.',409);
    busy.add(args.id);try{
     const query=d.queries[args.section],out=await search(query);
     if(out.costUsd!==0||out.provider!=='Exa free keyless MCP')throw error('The research transport did not confirm the free-only contract.',502);
     const checkedAt=new Date().toISOString();
     // Merge with current saved evidence, including any observations added while the search was in flight.
     const latest=get(args.id);latest.searches.push({section:args.section,query,provider:out.provider,checkedAt,costUsd:0,resultCount:out.results.length});
     for(const r of out.results){const url=publicUrl.safeParse(r.url);if(!url.success)continue;latest.evidence.push({id:randomUUID(),section:args.section,sourceUrl:url.data,title:String(r.title||'').slice(0,300),claim:String(r.text||'').slice(0,6000),kind:'search_excerpt',observedAt:checkedAt,rights:'unknown',verification:'Indexed excerpt only. Open source to verify claims, ownership and metrics.'});}
     latest.status='research_partial';return save(latest);
    }finally{busy.delete(args.id);}
   }
   case 'research_add_evidence':{
    if(args.views!=null&&(!args.postUrl||!args.creatorProfile||!args.observedAt||!args.publishedAt))throw error('View evidence needs a creator profile, post URL, observation date and publication date.');
    const d=get(args.id),{id,...fields}=args;d.evidence.push({...fields,id:randomUUID(),verification:args.kind==='hypothesis'?'Unvalidated hypothesis':'Operator-supplied cited observation. Not independently verified.'});return save(d);
   }
   case 'research_synthesize':{const d=get(args.id);d.synthesis=synthesis(d);d.status='brief_ready_for_review';return save(d);}
   case 'workflow_prepare':{
    const m=manifest(),d=args.id?get(args.id):null;
    const names=['02_clip1_prompt_v3.txt','03_clip2_extend_prompt_v13.txt','04_clip3_extend_prompt_v5.txt'];
    const clips=names.map((file,i)=>({clip:i+1,mode:i?'extend':'reference_generation',previousClip:i||null,prompt:read(`prompts/${file}`),duration:m.historicalSettings.clipDurations[i],aspectRatio:'9:16',resolution:'720p',voiceReference:`/production-media/clip${i+1}-voice`,referenceRoles:['character','hoodie',...(i===1?['girl','Wingstop bag']:[]),...(i?['previous clip']:[]),'voice performance'],publicApiRequest:null,blockedReason:'The verified public text-to-video contract does not include the reference/extension inputs used by this historical clip.'}));
    return {mode:'dry_run',budgetUsd:0,networkCalls:0,generated:false,readyToSubmit:false,brand:d?.brand||null,creativeHandoff:d?.synthesis||null,clips,voiceRequests:['audio_isolation','voice_remix','voice_change'].map(operation=>requestEnvelope(operation,{voiceId:m.voiceId})),referenceReadiness:m.missing,capabilities:productionCapabilities(),next:'Resolve documented reference and Extend Video support and the missing original assets before any paid trial. No text-only substitution is claimed to match.'};
   }
   case 'provider_prepare':return requestEnvelope(args.operation,args);
   default:throw error(`Unknown production tool: ${name}`);
  }
 }
 async function call(name,input={}){
  const schema=schemas[name];if(!schema)throw error(`Unknown production tool: ${name}`);
  let args;try{args=schema.parse(input);}catch(e){throw error(e.issues?.map(x=>x.message).join('; ')||'Invalid tool arguments.');}
  const callId=randomUUID(),at=performance.now();
  store.addEvent({type:'tool_call',tool:`production.${name}`,title:`Calling ${name}`,data:{callId,status:'running',input:args,budgetUsd:0}});
  try{const out=await execute(name,args);store.addEvent({type:'tool_result',tool:`production.${name}`,title:`${name} completed with $0 provider spend`,data:{callId,status:'success',durationMs:Math.round(performance.now()-at),output:{mode:out.mode||out.status||'read',id:out.id||null,costUsd:0}}});return out;}
  catch(e){store.addEvent({type:'tool_result',tool:`production.${name}`,title:`${name}: ${e.message}`,data:{callId,status:'error',durationMs:Math.round(performance.now()-at),error:e.message}});throw e;}
 }
 return {call,list,get,capabilities:productionCapabilities,tools:productionToolDefinitions};
}
