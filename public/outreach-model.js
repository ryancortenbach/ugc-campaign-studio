const states=new Set(['draft_unsent','needs_source_review','ready_for_personal_review']);
const safeText=(value,max=6000)=>typeof value==='string'?value.slice(0,max):'';
export function prospectKey(value){const url=new URL(value);if(url.protocol!=='https:'||url.username||url.password)throw Error('Use a public HTTPS source without credentials.');url.hash='';for(const key of [...url.searchParams.keys()])if(/^utm_|^(fbclid|gclid)$/i.test(key))url.searchParams.delete(key);return url.href;}
function nameFor(name,url){return !name||/^(contact|contact us|n\/a)$/i.test(name.trim())?new URL(url).hostname.replace(/^www\./,''):safeText(name,200);}
function sourceSnapshot(prospect,context){return {provider:safeText(context.provider||prospect.provider||'Unspecified source',200),kind:context.kind||'research',originalProvider:safeText(prospect.originalProvider||prospect.provider,200),checkedAt:safeText(context.searchedAt||prospect.lastChecked||'Not recorded',100),url:prospectKey(prospect.url),name:nameFor(prospect.name,prospect.url),evidence:safeText(prospect.evidence),emails:Array.isArray(prospect.emails)?prospect.emails.filter(x=>typeof x==='string').slice(0,20).map(x=>safeText(x,300)):[],verification:safeText(prospect.verification||prospect.sourceStatus||'Source and business purpose require review'),draft:safeText(prospect.draft),sampleBrief:safeText(prospect.sampleBrief),emailEvidence:Array.isArray(prospect.emailEvidence)?prospect.emailEvidence.map(x=>({email:safeText(x.email,300),sourceUrl:prospectKey(x.sourceUrl||prospect.url),excerpt:safeText(x.excerpt,500),domainMatchesPage:x.domainMatchesPage===true})):[]};}
export function ingestProspects(existing,prospects,context={}){
 const records=structuredClone(existing);
 for(const prospect of prospects){let source;try{source=sourceSnapshot(prospect,context);}catch{continue;}const id=prospectKey(prospect.url),record=records.find(x=>x.id===id);
  if(record){if(!record.sources.some(x=>JSON.stringify(x)===JSON.stringify(source)))record.sources.push(source);continue;}
  const draft={draft:source.draft,sampleBrief:source.sampleBrief,notes:'',state:'draft_unsent'};
  records.push({id,name:source.name,url:id,sources:[source],...draft,versions:[{savedAt:context.searchedAt||prospect.lastChecked||null,reason:'Original research draft',...draft}],sent:false,sampleGenerated:false});
 }
 return records;
}
export function editProspect(record,patch){const next=structuredClone(record);for(const field of ['draft','sampleBrief','notes'])if(field in patch)next[field]=safeText(patch[field]);if(states.has(patch.state))next.state=patch.state;next.sent=false;next.sampleGenerated=false;return next;}
export function saveProspectVersion(record,at=new Date().toISOString()){const next=structuredClone(record);next.versions.push({savedAt:at,reason:'Saved draft',draft:record.draft,sampleBrief:record.sampleBrief,notes:record.notes,state:record.state});return next;}
export function restoreProspectVersion(record,index,at=new Date().toISOString()){const version=record.versions[index];if(!version)throw Error('Choose a saved draft version.');const previous=saveProspectVersion(record,at);return editProspect(previous,{draft:version.draft,sampleBrief:version.sampleBrief,notes:version.notes,state:'draft_unsent'});}
export function prospectBrief(record){const evidence=record.sources.at(-1);return {brand:record.name+' | '+record.url,audience:'',offer:'',objective:'Prepare one original five-second sample concept. No rendering or publication approved.',avatar:'',voice:'',creative:record.sampleBrief,constraints:'Draft based on public research. Confirm product, claims, permissions, references, script and spend before generation. No guaranteed outcomes. Source: '+record.url+' Public evidence, not approved claims: '+(evidence?.evidence||'Not supplied')};}
export function exportOutreach(records){return {schemaVersion:'outreach-1.0',records:structuredClone(records),sent:0,generatedSamples:0,disclosure:'Local research and unsent drafts. Contact suitability, references, claims and generation approval remain pending.'};}
export function importOutreach(raw,existing){
 if(typeof raw!=='string'||new TextEncoder().encode(raw).length>5*1024*1024)throw Error('Use an outreach JSON file up to 5 MB.');let data;try{data=JSON.parse(raw);}catch{throw Error('Invalid JSON.');}
 if(data?.schemaVersion!=='outreach-1.0'||!Array.isArray(data.records)||data.records.length>500)throw Error('Use an outreach-1.0 export with up to 500 prospect records.');
 const result=structuredClone(existing);
 for(const input of data.records){
  if(!input||!Array.isArray(input.sources)||input.sources.length>500||!Array.isArray(input.versions)||input.versions.length>500)throw Error('Invalid prospect source or version history.');
  const url=prospectKey(input.url),sources=input.sources.map(source=>sourceSnapshot({...source,url:source.url||url},{provider:'Imported evidence (unverified)',kind:'imported_unverified',searchedAt:source.checkedAt}));
  const versions=input.versions.map(version=>({savedAt:safeText(version.savedAt,100),reason:'Imported: '+safeText(version.reason,200),draft:safeText(version.draft),sampleBrief:safeText(version.sampleBrief),notes:safeText(version.notes),state:'draft_unsent'}));
  const incoming=editProspect({id:url,url,name:nameFor(input.name,url),sources,versions,draft:'',sampleBrief:'',notes:'',state:'draft_unsent'},input);incoming.state='draft_unsent';
  const current=result.find(record=>record.id===url);
  if(current){current.sources.push(...sources);current.versions.push(...versions,{savedAt:null,reason:'Imported current draft',draft:incoming.draft,sampleBrief:incoming.sampleBrief,notes:incoming.notes,state:'draft_unsent'});}
  else result.push(incoming);
 }
 return result;
}
