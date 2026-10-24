import {z} from 'zod';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {structured,llmEnabled,models} from './tools/llm.mjs';
import {dataDir} from './store.mjs';

export const defaultProfile={
 senderName:'Ryan Cortenbach',
 company:'Mint Labs',
 senderFact:'I am a Columbia engineering student building Mint Labs, an AI content studio, at the Zero Human Company hackathon in NYC.',
 offer:'We create a consistent AI brand character for a brand and produce short-form UGC-style videos with it on a daily cadence. Every script and shot passes an automated quality check before anything is published.',
 cta:'Open to a 15 minute call this week to see a sample built for your brand?',
 rules:'No em dashes or en dashes. Never use the word "really". At most one exclamation mark. Under 120 words. No invented results, client names, view counts, prices or guarantees. Mention one specific true detail from their own site.'
};
const profileFile=()=>path.join(dataDir,'profile.json');
export function loadProfile(){try{return {...defaultProfile,...JSON.parse(readFileSync(profileFile(),'utf8'))};}catch{return {...defaultProfile};}}
export function saveProfile(next){const merged={...loadProfile(),...Object.fromEntries(Object.entries(next).filter(([k,v])=>k in defaultProfile&&typeof v==='string'))};mkdirSync(dataDir,{recursive:true});writeFileSync(profileFile(),JSON.stringify(merged,null,1));return merged;}

export const cleanCopy=text=>text.replace(/\s*[\u2014\u2013]\s*/g,', ').replace(/\breally\s+/gi,'').replace(/!(?=[\s\S]*!)/g,'.');
export const brainMode=()=>llmEnabled()?`claude (${models.main} plans and writes, ${models.grader} grades)`:'rules (no ANTHROPIC_API_KEY)';

const planSchema=z.object({
 reply:z.string(),
 markets:z.array(z.string()),
 territories:z.array(z.string()),
 maxDrafts:z.number().int(),
 qualify:z.string(),
 exclusions:z.array(z.string()),
 searchQueries:z.array(z.object({query:z.string(),market:z.string(),territory:z.string()}))
});
const scoreSchema=z.object({company:z.string(),fitScore:z.number().int(),decision:z.enum(['pursue','skip']),reasons:z.array(z.string()),risks:z.array(z.string()),personalDetail:z.string()});
const draftSchema=z.object({subject:z.string(),body:z.string()});
const steerSchema=z.object({reply:z.string(),action:z.enum(['continue','pause','stop']),plan:planSchema.omit({reply:true}),skipDomains:z.array(z.string())});

export function rulesPlan(prompt){
 const count=Math.min(15,Math.max(1,Number((prompt.match(/\b(\d{1,2})\b/)||[])[1])||5));
 const inMatch=prompt.match(/\b(?:in|across|around|near)\s+(.+?)(?:\s+(?:that|who|which|for|with)\b|[.?!]|$)/i);
 const territories=inMatch?inMatch[1].split(/,|\band\b|\bor\b|\//).map(s=>s.trim()).filter(Boolean).slice(0,4):['United States'];
 const market=(prompt.replace(inMatch?.[0]||'','').replace(/\b(find|get|search|look for|me|some|leads?|brands?|companies|the|\d+)\b/gi,' ').replace(/\s+/g,' ').trim())||'direct-to-consumer';
 return {reply:`Searching for ${market} brands in ${territories.join(', ')}. Up to ${count} drafts.`,markets:[market],territories,maxDrafts:count,qualify:`Independent ${market} brands that sell online and could use short-form UGC video.`,exclusions:[],searchQueries:territories.map(t=>({query:`official website of a direct-to-consumer ${market} brand based in ${t}`,market,territory:t}))};
}

export async function plan(prompt,profile){
 if(!llmEnabled())return {data:rulesPlan(prompt),cost:0,model:'rules'};
 return structured({role:'main',effort:'low',schema:planSchema,system:`You plan lead research for ${profile.company}. Offer: ${profile.offer} Turn the operator's request into Exa neural search queries that return official brand websites (not marketplaces, listicles, news, or agencies). Write each query as a description of the page you want, e.g. "official website of an independent streetwear brand based in Brooklyn". Use at most 6 queries. maxDrafts is how many outreach drafts to produce: use the number the operator gave, otherwise 5, never more than 15. qualify is one sentence on what makes a brand a good fit. reply is one short sentence to the operator describing the plan. No em dashes.`,prompt});
}

export async function score({lead,visit,planned}){
 if(!llmEnabled()){
  const reasons=[],risks=[];let s=30;
  if(visit.best){s+=35;reasons.push(`Public business email on their own site: ${visit.best.email}`);}else risks.push('No public business email found');
  if(/shop|cart|collection|add to bag|new arrivals/i.test(visit.homeText)){s+=20;reasons.push('Sells direct to consumers on its own site');}
  if(planned.territory&&visit.homeText.toLowerCase().includes(planned.territory.toLowerCase().split(/[ ,]/)[0])){s+=10;reasons.push(`Mentions ${planned.territory}`);}
  return {data:{company:lead.company,fitScore:Math.min(100,s),decision:s>=60?'pursue':'skip',reasons,risks,personalDetail:(visit.homeText.split(/(?<=[.!?])\s+/).find(x=>x.length>30&&x.length<160)||'').trim()},cost:0,model:'rules'};
 }
 return structured({role:'grader',effort:'low',schema:scoreSchema,system:`You grade whether a brand is a good outreach target for this offer: ${planned.offer}. Good fit: ${planned.qualify} Exclusions: ${planned.exclusions.join('; ')||'none'}. Use only the page text given. fitScore is 0 to 100; choose pursue only if fitScore is at least 60 and a contact email exists. reasons and risks are short factual bullets citing what the page says. personalDetail is one specific true detail from their site that an email could mention, copied or closely paraphrased, or empty. company is the brand's proper name.`,prompt:JSON.stringify({market:planned.market,territory:planned.territory,url:lead.url,searchTitle:lead.company,contactEmail:visit.best?.email||null,contactSource:visit.best?.sourceUrl||null,homepageText:visit.homeText,contactPageText:visit.contactText})});
}

export async function draft({lead,profile,graded}){
 if(!llmEnabled()){
  const detail=graded.personalDetail?` I saw this on your site: "${graded.personalDetail.split(/\s+/).slice(0,14).join(' ')}".`:'';
  return {data:{subject:`${graded.company} x ${profile.company}`,body:cleanCopy(`Hi ${graded.company} team,\n\n${profile.senderFact}${detail}\n\n${profile.offer}\n\n${profile.cta}\n\n${profile.senderName}`)},cost:0,model:'rules'};
 }
 const out=await structured({role:'main',effort:'low',schema:draftSchema,system:`You write a short cold email from ${profile.senderName} at ${profile.company}. True sender fact you may use: ${profile.senderFact} Offer: ${profile.offer} Call to action: ${profile.cta} Rules: ${profile.rules} Address the brand team by brand name. Lead with the specific detail from their site and connect it to the offer honestly. Sign as ${profile.senderName}. Plain text, short paragraphs.`,prompt:JSON.stringify({company:graded.company,url:lead.url,personalDetail:graded.personalDetail,whyTheyFit:graded.reasons})});
 out.data={subject:cleanCopy(out.data.subject),body:cleanCopy(out.data.body)};
 return out;
}

export async function steer({message,currentPlan,progress}){
 if(!llmEnabled()){
  const lower=message.toLowerCase();
  const next={...currentPlan};let action='continue';const skipDomains=[];
  if(/\b(stop|cancel|halt)\b/.test(lower))action='stop';else if(/\bpause\b/.test(lower))action='pause';
  const max=lower.match(/\b(?:max|only|limit)\s+(\d{1,2})\b/);if(max)next.maxDrafts=Number(max[1]);
  for(const m of message.matchAll(/\bskip\s+([a-z0-9.-]+\.[a-z]{2,})/gi))skipDomains.push(m[1].toLowerCase().replace(/^www\./,''));
  const focus=message.match(/\b(?:focus on|only in)\s+(.+)$/i);if(focus){next.territories=[focus[1].trim()];next.searchQueries=next.searchQueries.map(q=>({...q,territory:focus[1].trim(),query:q.query.replace(/based in .+$/,`based in ${focus[1].trim()}`)}));}
  next.exclusions=[...next.exclusions,...(lower.startsWith('exclude ')?[message.slice(8)]:[])];
  return {data:{reply:`Applied in rules mode: action ${action}${max?`, max drafts ${next.maxDrafts}`:''}${skipDomains.length?`, skipping ${skipDomains.join(', ')}`:''}${focus?`, territory ${next.territories[0]}`:''}.`,action,plan:next,skipDomains},cost:0,model:'rules'};
 }
 const {reply,...planOnly}=currentPlan;
 return structured({role:'main',effort:'low',schema:steerSchema,system:'You are steering a running lead-research task. Apply the operator message to the plan: change queries, territories, markets, exclusions, qualify or maxDrafts as asked, and list any domains to skip. action is stop or pause only if the operator asks for that. Queries not yet run are listed in progress.remainingQueries; rewrite searchQueries to be the remaining work only. reply is one short sentence saying exactly what changed. No em dashes.',prompt:JSON.stringify({operatorMessage:message,currentPlan:planOnly,progress})});
}
