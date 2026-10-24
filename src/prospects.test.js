import {test} from 'node:test';
import assert from 'node:assert/strict';
import {prospectFromResult,findProspects} from '../api/prospects.js';
test('prospect drafts retain the exact contact source and distinguish unrelated email domains',()=>{
 const result=prospectFromResult({title:'Keyboard Works',url:'https://keyboards.test/contact',text:'We design compact keyboards for small workspaces. Collaborations: marketing@keyboards.test. Agency: hello@agency.test. Support: support@keyboards.test'},'desk accessories');
 assert.deepEqual(result.emails,['marketing@keyboards.test','hello@agency.test']);
 assert.equal(result.emailEvidence[0].sourceUrl,'https://keyboards.test/contact');
 assert.equal(result.emailEvidence[0].domainMatchesPage,true);assert.equal(result.emailEvidence[1].domainMatchesPage,false);
 assert.ok(result.draft.includes('We design compact keyboards for small workspaces.'));
 assert.equal(result.status,'draft_unsent');assert.ok(result.sampleBrief.includes('No video generated'));
});
test('missing evidence never invents a contact, and unsafe result links are excluded',()=>{
 const result=prospectFromResult({url:'https://brand.test',title:'Brand'},'clothes');
 assert.deepEqual(result.emails,[]);assert.equal(result.personalizationEvidence,null);
 for(const url of ['javascript:alert(1)','http://brand.test','https://secret@brand.test'])assert.equal(prospectFromResult({url},'test'),null);
});
test('unconfigured discovery fails before requesting Exa',async()=>{
 const prior=process.env.EXA_API_KEY;delete process.env.EXA_API_KEY;let calls=0;
 try{const result=await findProspects({query:'gaming accessories'},'',async()=>{calls++;});assert.equal(result.status,503);assert.equal(calls,0);}finally{if(prior!==undefined)process.env.EXA_API_KEY=prior;}
});
