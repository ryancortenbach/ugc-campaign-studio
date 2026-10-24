import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtempSync,existsSync,readFileSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';

// No network and no credits: fetch is stubbed for every ElevenLabs URL and the data folder is a temp dir.
const tmp=mkdtempSync(path.join(tmpdir(),'voices-'));
process.env.AGENT_DATA_DIR=tmp;process.env.ELEVENLABS_API_KEY='test-key-not-real';process.env.ANTHROPIC_API_KEY='test-key-not-real';
const {openStore}=await import('./store.mjs');
const el=await import('./tools/elevenlabs.mjs');
const vc=await import('./voicecheck.mjs');
const {createApp}=await import('./server.mjs');

const LINE="Hey, it's Maya from Mint Labs. I wanted to show you the new graphic tee drop before it lands on Friday, because I think you will love it.";
const SPEC='Warm woman in her twenties, American accent, about 150 words per minute, upbeat and relaxed.';
const real=globalThis.fetch;
const calls=[];let sub,fail=false;
const resetSub=()=>{sub={tier:'pro',status:'active',character_count:1000,character_limit:610000,next_character_count_reset_unix:1793817143,voice_slots_used:10,voice_limit:160,billing_period:'monthly_period',character_refresh_period:'monthly_period',currency:'usd',next_invoice:{subtotal_cents:0,amount_due_cents:0}};};resetSub();
const b64=s=>Buffer.from(s).toString('base64');
const heard=[['Hey','0.1','0.3'],["it's",'0.35','0.5'],['Maya','0.55','0.9'],['from','0.95','1.1'],['Mint','1.15','1.4'],['Labs','1.45','1.8']].map(([text,start,end])=>({text,type:'word',start:Number(start),end:Number(end)}));
const json=(body,init={})=>new Response(JSON.stringify(body),{status:200,headers:{'Content-Type':'application/json'},...init});
globalThis.fetch=async(url,init={})=>{
 url=String(url);
 if(url.startsWith('http://127.0.0.1'))return real(url,init);
 const u=new URL(url);assert.equal(u.hostname,'api.elevenlabs.io');
 calls.push({path:u.pathname,query:u.search,method:init.method||'GET',key:init.headers?.['xi-api-key'],body:init.body});
 if(fail)throw new TypeError('fetch failed');
 if(u.pathname==='/v1/user/subscription')return json(sub);
 if(u.pathname==='/v1/text-to-voice/design')return json({text:JSON.parse(init.body).text,previews:[1,2,3].map(n=>({generated_voice_id:`gen_${n}`,audio_base_64:b64(`ID3fake-mp3-${n}`),media_type:'audio/mpeg',duration_secs:8.5,language:'en'}))});
 if(u.pathname==='/v1/text-to-voice')return json({voice_id:'voice_abc',name:JSON.parse(init.body).voice_name,labels:{origin:'mint-labs'},category:'generated'});
 if(u.pathname.startsWith('/v1/text-to-speech/'))return new Response(Buffer.from('ID3speech'),{status:200,headers:{'Content-Type':'audio/mpeg','character-cost':'12'}});
 if(u.pathname==='/v1/speech-to-text')return json({language_code:'eng',text:"Hey, it's Maya from Mint Labs.",audio_duration_secs:1.9,words:[...heard,{text:' ',type:'spacing',start:0.3,end:0.35}]});
 return new Response('{"detail":{"message":"unexpected"}}',{status:404});
};
const grade=score=>async({system})=>({data:{score,summary:`graded ${system.slice(0,24)}`,issues:score>=85?[]:[{severity:'major',evidence:'x',fix:'y'}]},cost:0.001,model:'fake'});
const post=(base,p,b={})=>real(`${base}${p}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)}).then(async r=>({status:r.status,body:await r.json()}));
async function harness(over={}){
 const store=openStore(':memory:');
 const server=http.createServer(createApp({store,runner:{start(){},control(){},steer(){},isRunning:()=>false},...over}));
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base=`http://127.0.0.1:${server.address().port}`;
 return {store,base,get:p=>real(`${base}${p}`).then(async r=>({status:r.status,body:await r.json()})),post:(p,b)=>post(base,p,b),close:()=>new Promise(r=>server.close(r))};
}

test('voices store: create, read, list, update, and change events',()=>{
 const store=openStore(':memory:');const events=[];store.bus.on('change',c=>events.push(c));
 const v=store.createVoice({name:'Maya 1',description:SPEC,line:LINE,generatedVoiceId:'gen_1',sampleFile:'gen_1.mp3',storyboardId:null,characters:140});
 assert.equal(v.status,'needs_checks');assert.equal(v.characters,140);assert.equal(v.checks,null);
 const u=store.updateVoice(v.id,{status:'checks_failed',checks:{passed:false,results:[]}},10);
 assert.equal(u.status,'checks_failed');assert.deepEqual(u.checks,{passed:false,results:[]});assert.equal(u.characters,150);
 store.createVoice({name:'Maya 2',description:SPEC,line:LINE});
 assert.deepEqual(store.listVoices().map(x=>x.name),['Maya 2','Maya 1']);
 assert.deepEqual(events.filter(e=>e.kind==='voice').map(e=>e.voice.id),[1,1,2]);
 store.addUsage({provider:'elevenlabs',note:'x'});
 const s=store.spendSummary();assert.equal(s.total,0);assert.equal(s.providers[0].provider,'elevenlabs');
});

test('measurements: word accuracy, pacing, and a pace stated in the spec',()=>{
 const a=vc.wordAccuracy("Hey, it's Maya from Mint Labs.","hey its maya from mint labs");
 assert.ok(a.accuracy>0.8&&a.accuracy<1);assert.ok(a.missing.includes("it's"));
 assert.equal(vc.wordAccuracy('Mint Labs','Mint Labs').accuracy,1);
 assert.equal(vc.wordAccuracy('Mint Labs drop','Mint').accuracy.toFixed(2),'0.33');
 const p=vc.pacing(heard);assert.equal(p.words,6);assert.equal(p.spanSeconds,1.7);assert.equal(p.wps,3.53);assert.equal(p.wpm,212);assert.equal(vc.pacing([]).wps,null);
 assert.deepEqual(vc.statedPace('about 150 words per minute, calm'),{minWps:2.5,maxWps:2.5,text:'150 words per minute'});
 assert.deepEqual(vc.statedPace('Pace 120-180 wpm'),{minWps:2,maxWps:3,text:'120-180 wpm'});
 assert.equal(vc.statedPace('2.5 words per second').maxWps,2.5);
 assert.equal(vc.statedPace('slow and warm'),null);
});

test('elevenlabs module sends the documented requests and never leaks the key',async()=>{
 calls.length=0;
 const s=await el.subscription();
 assert.deepEqual([s.tier,s.used,s.limit,s.left,s.usdPerChar],['pro',1000,610000,609000,null]);assert.match(s.resetAt,/^2026-/);
 const d=await el.designVoices({description:SPEC,text:LINE});
 assert.equal(d.previews.length,3);assert.equal(d.characters,LINE.length);
 for(const p of d.previews)assert.ok(readFileSync(path.join(el.voiceDir(),p.file)).toString().startsWith('ID3fake-mp3'));
 const dc=calls.find(c=>c.path==='/v1/text-to-voice/design');
 assert.deepEqual(JSON.parse(dc.body),{voice_description:SPEC,text:LINE});assert.equal(dc.method,'POST');assert.match(dc.query,/output_format=mp3_44100_128/);
 const sv=await el.saveVoice({generatedVoiceId:'gen_2',name:'Maya',description:SPEC});
 assert.deepEqual(JSON.parse(calls.find(c=>c.path==='/v1/text-to-voice').body),{voice_name:'Maya',voice_description:SPEC,generated_voice_id:'gen_2',labels:{origin:'mint-labs'}});
 assert.equal(sv.voiceId,'voice_abc');
 const sp=await el.speak({voiceId:'voice_abc',text:'Hello there'});
 assert.equal(sp.audio.toString(),'ID3speech');assert.equal(sp.characters,12);
 const tc=calls.find(c=>c.path==='/v1/text-to-speech/voice_abc');assert.equal(JSON.parse(tc.body).model_id,'eleven_flash_v2_5');
 const tr=await el.transcribe(Buffer.from('ID3fake'));
 assert.equal(tr.text,"Hey, it's Maya from Mint Labs.");assert.equal(tr.words.length,6);assert.equal(tr.durationSecs,1.9);
 const form=calls.find(c=>c.path==='/v1/speech-to-text').body;
 assert.equal(form.get('model_id'),'scribe_v2');assert.equal(form.get('timestamps_granularity'),'word');assert.ok(form.get('file'));assert.equal(form.get('keyterms'),null);
 assert.ok(calls.every(c=>c.key==='test-key-not-real'));
 const prev=process.env.ELEVENLABS_API_KEY;delete process.env.ELEVENLABS_API_KEY;process.env.ELEVENLABS_KEY_FILE=path.join(tmp,'no-such-key');
 assert.equal(el.elevenEnabled(),false);await assert.rejects(el.subscription(),/Add ELEVENLABS_API_KEY/);
 delete process.env.ELEVENLABS_KEY_FILE;process.env.ELEVENLABS_API_KEY=prev;
});

test('checkVoice grades transcript, pacing and spec, and passes only at 85 or above',async()=>{
 const v={line:LINE,description:SPEC,sample_file:'a.mp3'};
 const ok=await vc.checkVoice({voice:v,audio:Buffer.from('x'),spec:SPEC,grade:grade(92)});
 assert.deepEqual(ok.results.map(r=>r.id),['transcript','pacing','voice-spec']);
 assert.equal(ok.passed,true);assert.equal(ok.measured.wps,3.53);assert.equal(ok.measured.statedPace.maxWps,2.5);assert.equal(ok.transcribed,true);
 const bad=await vc.checkVoice({voice:v,audio:Buffer.from('x'),spec:SPEC,cachedTranscript:ok.transcript,grade:grade(70)});
 assert.equal(bad.passed,false);assert.equal(bad.transcribed,false);
 const seen=[];
 await vc.checkVoice({voice:v,audio:Buffer.from('x'),spec:SPEC,grade:async a=>{seen.push(JSON.parse(a.prompt));return grade(90)(a);}});
 assert.equal(seen[0].measured.missingWords.includes('friday'),true);assert.equal(seen[1].measured.wps,3.53);assert.equal(seen[2].targetSpec,SPEC);
 const broken=await vc.checkVoice({voice:v,audio:Buffer.from('x'),spec:SPEC,grade:async()=>{throw Error('boom');}});
 assert.equal(broken.passed,false);assert.ok(broken.results.every(r=>r.score===0&&/Checker failed: boom/.test(r.summary)));
});

test('routes: design makes one voice per preview, then check, gate and save',async()=>{
 const h=await harness({checkVoice:a=>vc.checkVoice({...a,grade:grade(92)})});
 try{
  calls.length=0;
  const list=await h.get('/api/voices');
  assert.equal(list.body.enabled,true);assert.equal(list.body.subscription.tier,'pro');assert.equal(list.body.subscription.left,609000);assert.deepEqual(list.body.voices,[]);
  const state=await h.get('/api/state');assert.ok(state.body.config.integrations.some(i=>i.id==='elevenlabs'&&i.on));
  // validation costs nothing: no design call is made
  assert.equal((await h.post('/api/voices/design',{description:'short',line:LINE})).status,400);
  assert.equal((await h.post('/api/voices/design',{description:SPEC,line:'too short'})).status,400);
  assert.equal((await h.post('/api/voices/design',{description:SPEC,line:LINE,storyboardId:99})).status,404);
  assert.equal(calls.filter(c=>c.path.includes('design')).length,0);
  const d=await h.post('/api/voices/design',{description:SPEC,line:LINE});
  assert.equal(d.status,200);assert.equal(d.body.voices.length,3);assert.equal(calls.filter(c=>c.path.includes('design')).length,1);
  assert.deepEqual(d.body.voices.map(v=>v.status),['needs_checks','needs_checks','needs_checks']);
  assert.deepEqual(d.body.voices.map(v=>v.characters),[LINE.length,0,0]);
  assert.ok(readdirSync(el.voiceDir()).includes('gen_1.mp3'));
  const mp3=await real(`${h.base}/voices/gen_1.mp3`);assert.equal(mp3.status,200);assert.equal(mp3.headers.get('content-type'),'audio/mpeg');assert.equal(mp3.headers.get('accept-ranges'),'bytes');
  const part=await real(`${h.base}/voices/gen_1.mp3`,{headers:{Range:'bytes=0-2'}});assert.equal(part.status,206);assert.equal(await part.text(),'ID3');
  assert.equal((await real(`${h.base}/voices/..%2Fagent.db`)).status,403);
  // design spend: the plan price is unknown, so the ledger row has zero dollars and the characters in the note
  const spend=h.store.db.prepare("select * from spend where provider='elevenlabs'").all();
  assert.equal(spend.length,1);assert.equal(spend[0].usd,0);assert.match(spend[0].note,new RegExp(`voice design, ${LINE.length} characters \\(dollars unknown\\)`));
  const id=d.body.voices[1].id;
  assert.equal((await h.post(`/api/voices/${id}/save`)).status,409);
  const c=await h.post(`/api/voices/${id}/check`);
  assert.equal(c.status,200);assert.equal(c.body.voice.status,'checks_passed');assert.equal(c.body.voice.checks.results.length,3);
  assert.equal(calls.filter(x=>x.path==='/v1/speech-to-text').length,1);
  const again=await h.post(`/api/voices/${id}/check`);
  assert.equal(again.status,200);assert.equal(calls.filter(x=>x.path==='/v1/speech-to-text').length,1);
  assert.equal(h.store.db.prepare("select count(*) n from spend where provider='claude'").get().n,2);
  calls.length=0;
  const saved=await h.post(`/api/voices/${id}/save`,{name:'Maya UGC'});
  assert.equal(saved.status,200);assert.equal(saved.body.voice.status,'saved');assert.equal(saved.body.voice.voice_id,'voice_abc');assert.equal(saved.body.voice.name,'Maya UGC');
  assert.equal(JSON.parse(calls.find(x=>x.path==='/v1/text-to-voice').body).generated_voice_id,'gen_2');
  assert.equal((await h.post(`/api/voices/${id}/save`)).status,409);
  assert.equal((await h.post('/api/voices/999/check')).status,404);
  // a voice whose checks failed needs an explicit force to save
  const other=d.body.voices[2].id;
  assert.equal((await h.post(`/api/voices/${other}/check`)).body.voice.status,'checks_passed');
  h.store.updateVoice(other,{status:'checks_failed'});
  assert.equal((await h.post(`/api/voices/${other}/save`)).status,409);
  assert.equal((await h.post(`/api/voices/${other}/save`,{force:true})).status,200);
 }finally{await h.close();}
});

test('routes: failing checks mark the voice failed, errors restore status, a plan price becomes dollars',async()=>{
 sub={...sub,next_invoice:{subtotal_cents:9900,amount_due_cents:9900},character_limit:600000};
 const h=await harness({checkVoice:a=>vc.checkVoice({...a,grade:grade(60)})});
 try{
  const d=await h.post('/api/voices/design',{description:SPEC,line:LINE});
  const row=h.store.db.prepare("select * from spend where provider='elevenlabs'").get();
  assert.ok(Math.abs(row.usd-LINE.length*99/600000)<1e-9);assert.match(row.note,/estimated from plan price/);
  const id=d.body.voices[0].id;
  assert.equal((await h.post(`/api/voices/${id}/check`)).body.voice.status,'checks_failed');
  h.store.updateVoice(id,{status:'needs_checks',checks:null});
  fail=true;
  const err=await h.post(`/api/voices/${id}/check`);
  fail=false;
  assert.equal(err.status,500);assert.equal(h.store.getVoice(id).status,'needs_checks');
 }finally{fail=false;resetSub();await h.close();}
});

test('routes: the page still loads offline and unkeyed design is refused before any call',async()=>{
 const h=await harness();
 try{
  fail=true;
  const off=await h.get('/api/voices');
  assert.equal(off.status,200);assert.equal(off.body.subscription,null);assert.match(off.body.error,/fetch failed/);
  fail=false;calls.length=0;
  const prev=process.env.ELEVENLABS_API_KEY;delete process.env.ELEVENLABS_API_KEY;process.env.ELEVENLABS_KEY_FILE=path.join(tmp,'none');
  const r=await h.post('/api/voices/design',{description:SPEC,line:LINE});
  const list=await h.get('/api/voices');
  process.env.ELEVENLABS_API_KEY=prev;delete process.env.ELEVENLABS_KEY_FILE;
  assert.equal(r.status,503);assert.equal(list.body.enabled,false);assert.equal(calls.length,0);
 }finally{fail=false;await h.close();}
});

test('no em dash character in the voices code or UI',()=>{
 const dash=String.fromCharCode(0x2014);
 for(const f of ['tools/elevenlabs.mjs','voicecheck.mjs','voices.test.mjs','public/voices.js','public/voices.css','server.mjs','store.mjs']){
  const file=path.join(import.meta.dirname,f);
  if(existsSync(file))assert.ok(!readFileSync(file,'utf8').includes(dash),`${f} has an em dash`);
 }
});
