import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {homedir} from 'node:os';
import path from 'node:path';
import {dataDir} from '../store.mjs';

// Every call except subscription() spends credits on Ryan's ElevenLabs account. The server calls the paid ones
// only from a button click in the Voices page. The key comes from ELEVENLABS_API_KEY or ~/.elevenlabs/key and is never logged.
const base='https://api.elevenlabs.io';
export const voiceDir=()=>process.env.AGENT_VOICE_DIR||path.join(dataDir,'voices');
export const ttsModel=()=>process.env.ELEVENLABS_TTS_MODEL||'eleven_flash_v2_5';
export const sttModel='scribe_v2';
export const LINE_MIN=100,LINE_MAX=1000;
const keyFile=()=>process.env.ELEVENLABS_KEY_FILE||path.join(homedir(),'.elevenlabs','key');
const apiKey=()=>{const env=(process.env.ELEVENLABS_API_KEY||'').trim();if(env)return env;try{return readFileSync(keyFile(),'utf8').trim();}catch{return '';}};
export const elevenEnabled=()=>Boolean(apiKey());

async function eleven(pathname,{timeout=30000,...init}={}){
 const key=apiKey();if(!key)throw Object.assign(Error('Add ELEVENLABS_API_KEY or ~/.elevenlabs/key'),{status:503});
 const res=await fetch(`${base}${pathname}`,{...init,headers:{'xi-api-key':key,...init.headers},signal:AbortSignal.timeout(timeout)});
 if(!res.ok){
  const text=await res.text();let body;try{body=JSON.parse(text);}catch{body={};}
  const d=body.detail,msg=typeof d==='string'?d:d?.message||(Array.isArray(d)?d.map(x=>x.msg).join('; '):'')||text.slice(0,160);
  throw Object.assign(Error(`ElevenLabs ${pathname.split('?')[0]} failed with HTTP ${res.status}: ${String(msg).slice(0,200)}`),{status:res.status===401?502:res.status===429?429:502});
 }
 return res;
}
const jsonPost=(pathname,payload,opts)=>eleven(pathname,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),...opts});
// ElevenLabs may send a character-cost header on speech responses. The docs do not list it, so it is read only when present.
const headerCost=res=>{const n=Number(res.headers.get('character-cost'));return Number.isFinite(n)&&n>0?n:null;};

export async function subscription(){
 const s=await (await eleven('/v1/user/subscription',{timeout:8000})).json();
 const left=Math.max(0,(s.character_limit||0)-(s.character_count||0));
 return {tier:s.tier,status:s.status,used:s.character_count,limit:s.character_limit,left,resetAt:s.next_character_count_reset_unix?new Date(s.next_character_count_reset_unix*1000).toISOString():null,voiceSlotsUsed:s.voice_slots_used,voiceLimit:s.voice_limit,
  // The API returns no per-character price. Use the plan invoice only when it is positive and monthly, otherwise dollars stay unknown.
  usdPerChar:s.next_invoice?.subtotal_cents>0&&s.billing_period==='monthly_period'&&s.character_refresh_period==='monthly_period'&&s.currency==='usd'&&s.character_limit>0?s.next_invoice.subtotal_cents/100/s.character_limit:null};
}

const safe=s=>String(s).replace(/[^\w-]/g,'_').slice(0,80);
// Voice design returns three previews for one charge, priced as the characters in the preview text.
export async function designVoices({description,text}){
 const body={voice_description:description,text};
 const res=await jsonPost('/v1/text-to-voice/design?output_format=mp3_44100_128',body,{timeout:120000});
 const out=await res.json();
 if(!Array.isArray(out.previews)||!out.previews.length)throw Object.assign(Error('ElevenLabs returned no voice previews'),{status:502});
 mkdirSync(voiceDir(),{recursive:true});
 const previews=out.previews.map(p=>{const file=`${safe(p.generated_voice_id)}.mp3`;writeFileSync(path.join(voiceDir(),file),Buffer.from(p.audio_base_64,'base64'));return {generatedVoiceId:p.generated_voice_id,file,durationSecs:p.duration_secs??null,language:p.language??null};});
 return {text:out.text||text,previews,characters:headerCost(res)||String(out.text||text).length};
}

export async function saveVoice({generatedVoiceId,name,description,labels={origin:'mint-labs'}}){
 const v=await (await jsonPost('/v1/text-to-voice',{voice_name:name,voice_description:description,generated_voice_id:generatedVoiceId,labels})).json();
 if(!v.voice_id)throw Object.assign(Error('ElevenLabs did not return a voice id'),{status:502});
 return {voiceId:v.voice_id,name:v.name||name,labels:v.labels||{},category:v.category||null};
}

export async function speak({voiceId,text}){
 const res=await jsonPost(`/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,{text,model_id:ttsModel()},{timeout:120000});
 return {audio:Buffer.from(await res.arrayBuffer()),characters:headerCost(res)||String(text).length};
}

// Scribe is billed by audio time, not characters. No keyterms are sent so a mispronounced brand name stays visible.
export async function transcribe(buffer,{filename='sample.mp3'}={}){
 const form=new FormData();
 form.append('model_id',sttModel);form.append('timestamps_granularity','word');form.append('tag_audio_events','false');form.append('diarize','false');
 form.append('file',new Blob([buffer],{type:'audio/mpeg'}),filename);
 const out=await (await eleven('/v1/speech-to-text',{method:'POST',body:form,timeout:120000})).json();
 const words=(out.words||[]).filter(w=>w.type==='word'||w.type==='audio_event').map(w=>({text:w.text,type:w.type,start:w.start??null,end:w.end??null}));
 return {text:String(out.text||'').trim(),words,language:out.language_code||null,durationSecs:out.audio_duration_secs??null};
}
