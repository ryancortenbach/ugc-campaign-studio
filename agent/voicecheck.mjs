import {z} from 'zod';
import {structured,llmEnabled} from './tools/llm.mjs';
import {PASS_SCORE} from './tools/higgsfield.mjs';
import {transcribe} from './tools/elevenlabs.mjs';

// Claude cannot hear audio, so these checks run on what can be measured: the speech-to-text transcript, the word timestamps,
// and the written voice spec. Numbers are computed here in code and handed to the Haiku checkers.
const gradeSchema=z.object({score:z.number().int(),summary:z.string(),issues:z.array(z.object({severity:z.enum(['blocking','major','minor']),evidence:z.string(),fix:z.string()}))});
const norm=t=>String(t||'').toLowerCase().replace(/[‘’]/g,"'").replace(/[^a-z0-9'\s]/g,' ').split(/\s+/).filter(Boolean);

// Word level edit distance between the intended line and what was heard.
export function wordAccuracy(intended,heard){
 const a=norm(intended),b=norm(heard);
 if(!a.length)return {accuracy:b.length?0:1,intendedWords:0,heardWords:b.length,missing:[],extra:b.slice(0,20)};
 const d=Array.from({length:a.length+1},(_,i)=>[i,...Array(b.length).fill(0)]);
 for(let j=1;j<=b.length;j++)d[0][j]=j;
 for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++)d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+(a[i-1]===b[j-1]?0:1));
 const heardSet=new Set(b),intendedSet=new Set(a);
 return {accuracy:Math.max(0,1-d[a.length][b.length]/a.length),intendedWords:a.length,heardWords:b.length,missing:[...new Set(a.filter(w=>!heardSet.has(w)))].slice(0,20),extra:[...new Set(b.filter(w=>!intendedSet.has(w)))].slice(0,20)};
}

// Pace in words per second from word timestamps. Pauses over half a second are counted separately.
export function pacing(words=[]){
 const w=words.filter(x=>x.type==='word'&&Number.isFinite(x.start)&&Number.isFinite(x.end));
 if(w.length<2)return {words:w.length,spanSeconds:0,wps:null,wpm:null,pauses:0,longestPause:0,speakingWps:null};
 const span=w[w.length-1].end-w[0].start;
 let pauses=0,longest=0,paused=0;
 for(let i=1;i<w.length;i++){const gap=w[i].start-w[i-1].end;if(gap>0.5){pauses++;paused+=gap;}if(gap>longest)longest=gap;}
 const r=n=>Math.round(n*100)/100;
 return {words:w.length,spanSeconds:r(span),wps:span>0?r(w.length/span):null,wpm:span>0?Math.round(w.length/span*60):null,pauses,longestPause:r(longest),speakingWps:span-paused>0?r(w.length/(span-paused)):null};
}

// Finds a numeric pace in the voice spec, such as "150 wpm", "150 to 170 words per minute" or "2.5 words per second".
export function statedPace(spec=''){
 const m=String(spec).match(/(\d+(?:\.\d+)?)\s*(?:(?:-|–|to)\s*(\d+(?:\.\d+)?)\s*)?(wpm|words?\s*(?:per|a|\/)\s*(minute|min|second|sec)|wps)/i);
 if(!m)return null;
 const perMinute=/wpm|min/i.test(m[3]),scale=perMinute?1/60:1;
 const lo=Number(m[1])*scale,hi=Number(m[2]||m[1])*scale;
 return {minWps:Math.round(lo*100)/100,maxWps:Math.round(hi*100)/100,text:m[0].trim()};
}

const run=async(grade,id,name,system,payload)=>{
 try{const out=await grade({role:'grader',effort:'medium',schema:gradeSchema,system,prompt:JSON.stringify(payload)});return {id,name,...out.data,cost:out.cost};}
 catch(error){return {id,name,score:0,summary:`Checker failed: ${error.message}`,issues:[{severity:'blocking',evidence:'checker unavailable',fix:'rerun checks'}],cost:0};}
};
const rules='Score 0 to 100. Use blocking or major only for problems that would make the voice unusable for the video. Cite exact words or numbers as evidence. You cannot hear audio, so judge only the measurements and text given.';

// voice: a voices row. spec: the written target voice spec. audio: mp3 bytes. cachedTranscript skips a second speech-to-text charge.
export async function checkVoice({voice,audio,spec,cachedTranscript=null,stt=transcribe,grade=structured}){
 if(!llmEnabled())throw Error('Checkers need ANTHROPIC_API_KEY');
 const tr=cachedTranscript||await stt(audio,{filename:voice.sample_file||'sample.mp3'});
 const acc=wordAccuracy(voice.line,tr.text),pace=pacing(tr.words),stated=statedPace(spec);
 const labels=voice.labels||{};
 const results=await Promise.all([
  run(grade,'transcript','Transcript accuracy',`You are the transcript accuracy checker for a designed AI voice. The voice read an intended line and speech-to-text transcribed it. Judge word accuracy, and whether every name, brand term, number and product word in the intended line was said correctly. Small punctuation, casing and filler differences are minor. A wrong or missing name or brand term is major. ${rules}`,{intendedLine:voice.line,transcript:tr.text,measured:{wordAccuracyPercent:Math.round(acc.accuracy*100),intendedWords:acc.intendedWords,heardWords:acc.heardWords,missingWords:acc.missing,extraWords:acc.extra}}),
  run(grade,'pacing','Pacing',`You are the pacing checker for a designed AI voice. Pace was computed in code from word timestamps, in words per second (wps). If the spec states a numeric pace, the measured wps should fall within about 10 percent of that range. If it states none, judge any pace words in the spec (slow, measured, brisk, fast) against these ranges: slow under 2.0 wps, conversational 2.2 to 3.0, fast over 3.4. Storyboard dialogue is written at no more than 2.5 words per second, so a pace above 3.0 is worth a minor note, and a pace above 3.5 or below 1.5 is major. ${rules}`,{voiceSpec:spec,statedPace:stated,measured:pace,sampleLine:voice.line}),
  run(grade,'voice-spec','Voice spec match',`You are the voice spec checker for a designed AI voice. Compare the voice description sent to the voice designer, and any labels on the saved voice, with the target voice spec: age, gender, accent, tone, energy, character fit. Flag contradictions and anything the spec requires that the description leaves out. When the description and spec are the same text, judge whether it is specific enough to reproduce one consistent voice. Do not flag the absence of audio. ${rules}`,{targetSpec:spec,designDescription:voice.description,labels,sampleLine:voice.line})
 ]);
 const passed=results.every(r=>r.score>=PASS_SCORE&&!r.issues.some(i=>i.severity!=='minor'))&&Boolean(tr.text);
 return {passed,results,cost:results.reduce((s,r)=>s+r.cost,0),checkedAt:new Date().toISOString(),measured:{wordAccuracy:Math.round(acc.accuracy*100),...pace,statedPace:stated},transcript:{text:tr.text,words:tr.words,language:tr.language,durationSecs:tr.durationSecs},transcribed:!cachedTranscript};
}
