import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {openStore} from './store.mjs';
import {createProductionResearch,productionToolDefinitions} from './production-research.mjs';
import {searchResearchFree} from './tools/research-exa.mjs';
import {createApp} from './server.mjs';
import {createAssistant} from './assistant.mjs';

const freeResult={provider:'Exa free keyless MCP',costUsd:0,results:[{title:'Brand community',url:'https://brand.example/community',text:'Customers share styling ideas.'}]};
test('historical workflow rehearses and compiles without network or paid claims',async t=>{
 const store=openStore(':memory:');t.after(()=>store.db.close());
 const production=createProductionResearch({store,search:()=>{throw Error('Unexpected search');}});
 const previous=globalThis.fetch;globalThis.fetch=()=>{throw Error('Unexpected network');};t.after(()=>globalThis.fetch=previous);
 const known=await production.call('workflow_knowledge');
 assert.match(known.workflow,/speech-to-speech/);assert.equal(known.manifest.sessionId,'834cd3d9-d209-4e3a-b993-4a5e3d0f0d4d');
 const reference=await production.call('workflow_reference',{file:'prompts/08_clip2_fix_plan.txt'});
 assert.match(reference.content,/eyes|girl|chair/i);assert.equal(reference.executable,false);
 await assert.rejects(production.call('workflow_reference',{file:'../../.env.local'}),/Invalid option/);
 const rehearsal=await production.call('workflow_rehearse');
 assert.equal(rehearsal.generated,false);assert.equal(rehearsal.costUsd,0);assert.equal(rehearsal.networkCalls,0);
 assert.equal(rehearsal.assets.length,6);
 const prepared=await production.call('workflow_prepare');
 assert.equal(prepared.readyToSubmit,false);assert.equal(prepared.clips.length,3);
 assert.deepEqual(prepared.clips.map(c=>c.duration),[10,10,7]);
 assert.ok(prepared.clips.every(c=>c.publicApiRequest===null&&c.voiceReference.includes('clip')));
 assert.match(prepared.clips[0].prompt,/Canary Wharf/);
 assert.match(prepared.clips[2].prompt,/index and middle fingers/);
 assert.equal(store.spendSummary().total,0);assert.equal(store.listRenders().length,0);
 assert.ok(store.listEvents().some(e=>e.tool==='production.workflow_rehearse'&&e.type==='tool_result'));
});

test('paid provider request preparation cannot execute even if credentials exist',async t=>{
 const store=openStore(':memory:');t.after(()=>store.db.close());const p=createProductionResearch({store});
 for(const operation of ['audio_isolation','voice_remix','voice_change','solari_visit','seedance_text_video']){
  const out=await p.call('provider_prepare',{operation,voiceId:'exampleVoice'});
  assert.equal(out.executable,false);assert.equal(out.networkCalls,0);assert.equal(out.budgetUsd,0);
 }
 const speech=await p.call('provider_prepare',{operation:'voice_change',voiceId:'exampleVoice'});
 assert.equal(speech.url,'https://api.elevenlabs.io/v1/voice-changer/exampleVoice');
 assert.equal(speech.fields.model_id,'eleven_multilingual_sts_v2');assert.equal(speech.fields.remove_background_noise,false);
 const hf=await p.call('provider_prepare',{operation:'seedance_text_video'});
 assert.equal(hf.body.aspect_ratio,'9:16');assert.equal(hf.body.generate_audio,true);
 assert.ok(!('audio_references' in hf.body));
 await assert.rejects(p.call('provider_prepare',{operation:'voice_change',execute:true}),/Unrecognized key/);
 await assert.rejects(p.call('workflow_prepare',{budgetUsd:10}),/Unrecognized key/);
 await assert.rejects(p.call('submit_generation',{}),/Unknown production tool/);
});

test('research keeps indexed snippets separate from verified evidence and exposes unknown ICPs',async t=>{
 const store=openStore(':memory:');t.after(()=>store.db.close());const calls=[];
 const p=createProductionResearch({store,search:async q=>{calls.push(q);return freeResult;}});
 let d=await p.call('research_plan',{brand:'Example Streetwear',category:'streetwear'});
 assert.equal(d.agents.length,6);assert.equal(calls.length,0);
 d=await p.call('research_search_free',{id:d.id,section:'audience'});
 assert.equal(calls.length,1);assert.match(calls[0],/customer reviews/);assert.equal(d.evidence[0].kind,'search_excerpt');
 d=await p.call('research_synthesize',{id:d.id});
 assert.equal(d.synthesis.icp.status,'insufficient_evidence');assert.deepEqual(d.synthesis.creators,[]);
 d=await p.call('research_add_evidence',{id:d.id,section:'audience',sourceUrl:'https://brand.example/reviews',claim:'Customers describe wearing the hoodie to local skate events.',kind:'observation'});
 d=await p.call('research_synthesize',{id:d.id});
 assert.equal(d.synthesis.icp.status,'candidate_needs_review');assert.equal(d.synthesis.characterBrief.audienceEvidenceIds.length,1);
 assert.match(d.synthesis.icp.demographics,/Unknown/);
 const plan=await p.call('workflow_prepare',{id:d.id});assert.equal(plan.brand,'Example Streetwear');assert.equal(plan.creativeHandoff.brand,'Example Streetwear');
 assert.equal(p.list().length,1);
});

test('creator ranking requires dated post samples and never counts a duplicate post twice',async t=>{
 const store=openStore(':memory:');t.after(()=>store.db.close());const p=createProductionResearch({store});
 const {id}=await p.call('research_plan',{brand:'Example Drinks',category:'drink'});
 const base={id,section:'creators',kind:'observation',sourceUrl:'https://www.instagram.com/creator/',creatorProfile:'https://www.instagram.com/creator/',claim:'Public reel view count.',observedAt:'2026-10-24T12:00:00Z',publishedAt:'2026-10-20T12:00:00Z'};
 await assert.rejects(p.call('research_add_evidence',{...base,views:1000}),/post URL/);
 for(let i=0;i<5;i++)await p.call('research_add_evidence',{...base,postUrl:`https://www.instagram.com/reel/post${i}/`,views:[100,200,300,400,9000][i]});
 await p.call('research_add_evidence',{...base,postUrl:'https://www.instagram.com/reel/post0/',views:1000000});
 const d=await p.call('research_synthesize',{id});
 assert.equal(d.synthesis.creators[0].sampleCount,5);assert.equal(d.synthesis.creators[0].medianViews,300);
 assert.equal(d.synthesis.creators[0].status,'performance_sample_ready');assert.match(d.synthesis.creators[0].fit,/Unverified/);
 assert.equal(d.synthesis.creators[0].rights,'unknown');
});

test('search failure never falls back or loses observations added during a pending search',async t=>{
 const store=openStore(':memory:');t.after(()=>store.db.close());let resolve;
 const p=createProductionResearch({store,search:()=>new Promise(r=>{resolve=r;})});
 const {id}=await p.call('research_plan',{brand:'Example',category:'apparel'});
 const pending=p.call('research_search_free',{id,section:'brand'});
 await assert.rejects(p.call('research_search_free',{id,section:'creators'}),/already running/);
 await p.call('research_add_evidence',{id,section:'brand',sourceUrl:'https://brand.example/product',claim:'Product evidence.'});
 resolve(freeResult);await pending;assert.equal(p.get(id).evidence.length,2);
 const failing=createProductionResearch({store,search:async()=>{throw Error('Free quota unavailable');}});
 await assert.rejects(failing.call('research_search_free',{id,section:'formats'}),/quota unavailable/);
 assert.equal(p.get(id).evidence.length,2);assert.equal(store.spendSummary().total,0);
});

test('free Exa performs the MCP tool call without paid REST headers, even with a paid key configured',async t=>{
 const old=process.env.EXA_API_KEY;process.env.EXA_API_KEY='paid-key-must-never-be-used';t.after(()=>{if(old===undefined)delete process.env.EXA_API_KEY;else process.env.EXA_API_KEY=old;});
 const calls=[];
 const request=async(url,init)=>{
  calls.push({url,init});const b=JSON.parse(init.body);let result;
  if(b.method==='initialize')result={protocolVersion:'2025-03-26'};
  else if(b.method==='notifications/initialized')return new Response('',{status:202});
  else if(b.method==='tools/list')result={tools:[{name:'web_search_exa',inputSchema:{properties:{query:{},numResults:{}}}}]};
  else result={content:[{type:'text',text:'Title: Source\nURL: https://brand.example/\nHighlights: Brand facts.'}]};
  return new Response(JSON.stringify({jsonrpc:'2.0',id:b.id,result}),{headers:{'content-type':'application/json'}});
 };
 const out=await searchResearchFree('streetwear audience',{request});
 assert.equal(out.costUsd,0);assert.equal(out.results.length,1);assert.equal(calls.length,4);
 assert.ok(calls.every(c=>c.url==='https://mcp.exa.ai/mcp'&&!JSON.stringify(c.init.headers).includes('paid-key')));
 assert.deepEqual(JSON.parse(calls.at(-1).init.body).params.arguments,{query:'streetwear audience',numResults:5});
 let count=0;await assert.rejects(searchResearchFree('query',{request:async()=>{count++;return new Response('',{status:429});}}),/No paid fallback/);assert.equal(count,1);
});

test('Mint assistant can call production tools using the existing tool loop without live models',async t=>{
 const store=openStore(':memory:');t.after(()=>store.db.close());let step=0;
 const client={beta:{messages:{create:async()=>++step===1?{stop_reason:'tool_use',usage:{},content:[{type:'tool_use',id:'w',name:'workflow_prepare',input:{}}]}:{stop_reason:'end_turn',usage:{},content:[{type:'text',text:'Three historical clips prepared. Reference extension remains unsupported.'}]}}}};
 const assistant=createAssistant({store,runner:{},client});
 const out=await assistant.reply({message:'Rehearse the London workflow without spending.'});
 assert.equal(step,2);assert.equal(out.actions[0].tool,'workflow_prepare');assert.equal(store.spendSummary().total,0);
});

test('HTTP tools, dossier persistence, historical media byte ranges and isolated UI are connected',async t=>{
 const store=openStore(':memory:');const production=createProductionResearch({store,search:async()=>freeResult});
 const server=http.createServer(createApp({store,production}));await new Promise(r=>server.listen(0,'127.0.0.1',r));
 t.after(async()=>{await new Promise(r=>server.close(r));store.db.close();});
 const base=`http://127.0.0.1:${server.address().port}`;
 const call=async(name,input)=>{const res=await fetch(base+'/api/production/call',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,input})});return {res,body:await res.json()};};
 const state=await (await fetch(base+'/api/production')).json();assert.equal(state.tools.length,productionToolDefinitions.length);assert.equal(state.capabilities.paidExecutionEnabled,false);
 const {body}=await call('research_plan',{brand:'HTTP Brand',category:'apparel'});const id=body.result.id;
 assert.equal((await (await fetch(base+`/api/production/dossiers/${id}`)).json()).dossier.brand,'HTTP Brand');
 const invalid=await call('provider_prepare',{operation:'voice_change',execute:true});assert.equal(invalid.res.status,400);
 const media=await fetch(base+'/production-media/final',{headers:{Range:'bytes=0-31'}});
 // Private historical files are intentionally absent in a clean checkout.
 assert.ok([206,404].includes(media.status));if(media.status===206){assert.equal((await media.arrayBuffer()).byteLength,32);assert.match(media.headers.get('content-range'),/^bytes 0-31\//);}
 const shell=await (await fetch(base+'/')).text();assert.match(shell,/#\/production/);
 const ui=await (await fetch(base+'/production-research.js')).text();assert.match(ui,/Historical playback/);assert.doesNotMatch(ui,/\/api\/assistant|\/api\/renders.*approve/);
 assert.equal(store.spendSummary().total,0);
});
