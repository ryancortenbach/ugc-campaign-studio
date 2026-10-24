import {test}from'node:test';import assert from'node:assert/strict';
import {ingestProspects,editProspect,saveProspectVersion,restoreProspectVersion,prospectBrief,exportOutreach,importOutreach}from'../public/outreach-model.js';
const prospect={name:'Contact',url:'https://brand.test/contact?utm_source=test',evidence:'Published creator collaboration route.',emails:['collabs@brand.test'],draft:'Original unsent message',sampleBrief:'Planned five-second product concept',lastChecked:'2026-10-24'};
const context={provider:'Manual primary source',kind:'manual_seed'};
test('research sources merge without overwriting edited drafts or duplicating identical source evidence',()=>{
 const original=ingestProspects([],[prospect],context);assert.equal(original[0].name,'brand.test');assert.equal(original[0].id,'https://brand.test/contact');
 assert.equal(ingestProspects(original,[prospect],context)[0].sources.length,1);
 const edited=editProspect(original[0],{draft:'My personalized draft'});
 const merged=ingestProspects([edited],[{...prospect,draft:'A newly proposed draft'}],{provider:'Exa free MCP',kind:'live_exa',searchedAt:'2026-10-24T09:00:00Z'});
 assert.equal(merged.length,1);assert.equal(merged[0].sources.length,2);assert.equal(merged[0].draft,'My personalized draft');assert.equal(original[0].draft,'Original unsent message');
});
test('version restore preserves the latest draft and resets personal-review state',()=>{
 const original=ingestProspects([],[prospect],context)[0];let edited=saveProspectVersion(editProspect(original,{draft:'Revised draft',state:'ready_for_personal_review'}));
 edited=restoreProspectVersion(edited,0);assert.equal(edited.draft,original.draft);assert.equal(edited.state,'draft_unsent');assert.equal(edited.versions.at(-1).draft,'Revised draft');assert.equal(edited.sent,false);assert.equal(original.versions.length,1);
});
test('portable outreach history is retained without treating imported sources or flags as verified',()=>{
 const records=ingestProspects([],[prospect],context),data=exportOutreach(records);data.records[0].sent=true;data.records[0].sampleGenerated=true;data.records[0].state='ready_for_personal_review';
 const imported=importOutreach(JSON.stringify(data),[]);assert.equal(imported[0].sent,false);assert.equal(imported[0].sampleGenerated,false);assert.equal(imported[0].state,'draft_unsent');assert.equal(imported[0].sources[0].kind,'imported_unverified');assert.equal(imported[0].versions.length,1);
 const existing=[editProspect(records[0],{draft:'Keep my current draft'})];const merged=importOutreach(JSON.stringify(data),existing);assert.equal(merged[0].draft,'Keep my current draft');assert.equal(merged[0].versions.at(-1).draft,'Original unsent message');
});
test('invalid imports fail without changing existing records and unsafe source links are excluded',()=>{
 const records=ingestProspects([],[prospect],context),before=JSON.stringify(records);
 for(const raw of ['invalid','{}',JSON.stringify({schemaVersion:'outreach-1.0',records:[{...records[0],url:'javascript:alert(1)'}]})])assert.throws(()=>importOutreach(raw,records));
 assert.equal(JSON.stringify(records),before);assert.equal(ingestProspects([],[{...prospect,url:'https://secret@brand.test'}],context).length,0);
});
test('prospect-to-campaign draft carries evidence but leaves unverified audience, offer, identity and voice unresolved',()=>{
 const brief=prospectBrief(ingestProspects([],[prospect],context)[0]);assert.ok(brief.objective.includes('five-second'));for(const key of ['audience','offer','avatar','voice'])assert.equal(brief[key],'');assert.ok(brief.constraints.includes('not approved claims'));assert.ok(brief.brand.includes('https://brand.test/contact'));
});
