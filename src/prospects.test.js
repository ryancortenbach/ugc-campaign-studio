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
import {decodeMcpResponse,parseExaMcpSources} from '../api/prospects.js';
test('free MCP text sources retain their URLs and published contact text',()=>{
 const result={content:[{type:'text',text:'Title: Brand contact\nURL: https://brand.test/contact\nPublished: N/A\nAuthor: N/A\nHighlights:\nCreator partnerships: collabs@brand.test\n\nTitle: N/A\nURL: https://other.test/contact\nHighlights:\nPublic business page.'}]};
 const sources=parseExaMcpSources(result);assert.equal(sources.length,2);assert.equal(sources[0].url,'https://brand.test/contact');assert.ok(sources[0].text.includes('collabs@brand.test'));assert.equal(sources[1].title,'other.test');
 assert.deepEqual(parseExaMcpSources({content:[{type:'text',text:'No structured source pages'}]}),[]);
});
test('MCP decoding accepts JSON and SSE without treating notifications as tool results',()=>{
 assert.equal(decodeMcpResponse('','text/event-stream',1),null);
 assert.equal(decodeMcpResponse('{"id":1,"result":{"ok":true}}','application/json',1).result.ok,true);
 assert.equal(decodeMcpResponse('event: message\ndata: {"id":1,"result":{"ok":true}}\n\n','text/event-stream',1).result.ok,true);
 assert.throws(()=>decodeMcpResponse('event: ping\ndata: {}\n\n','text/event-stream',1));
});
function mcpFixture(quota=false){let calls=0;const request=async(url,options)=>{
 calls++;assert.equal(url,'https://mcp.exa.ai/mcp');assert.equal(options.headers['x-api-key'],undefined);assert.equal(options.headers.Authorization,undefined);
 const body=JSON.parse(options.body);if(body.method==='notifications/initialized')return new Response(null,{status:202});
 let result;
 if(body.method==='initialize')result={protocolVersion:'2025-03-26'};
 else if(body.method==='tools/list')result={tools:[{name:'web_search_exa'}]};
 else{assert.equal(body.params.name,'web_search_exa');assert.equal(body.params.arguments.numResults,5);result=quota?{isError:true,content:[{type:'text',text:'Free MCP rate limit reached'}]}:{content:[{type:'text',text:'Title: Draft Works\nURL: https://draft.test/contact\nHighlights:\nWe design gaming desk accessories. Creator partnerships: collabs@draft.test'}]};}
 return new Response('event: message\ndata: '+JSON.stringify({jsonrpc:'2.0',id:body.id,result})+'\n\n',{status:200,headers:{'content-type':'text/event-stream'}});
 };return {request,calls:()=>calls};}
test('explicit free transport returns sourced prospects without any paid API fallback',async()=>{
 const fixture=mcpFixture();const result=await findProspects({query:'gaming desk accessories',transport:'free_mcp'},'',fixture.request);
 assert.equal(result.status,200);assert.equal(result.body.provider,'Exa free MCP');assert.equal(result.body.freeTier,true);assert.deepEqual(result.body.prospects[0].emails,['collabs@draft.test']);assert.equal(result.body.sent,0);assert.equal(result.body.generatedSamples,0);assert.equal(fixture.calls(),4);
});
test('free quota errors stop after one search attempt and never invoke another endpoint',async()=>{
 const fixture=mcpFixture(true);const result=await findProspects({query:'gaming desk accessories',transport:'free_mcp'},'',fixture.request);
 assert.equal(result.status,429);assert.ok(result.body.error.includes('No paid API fallback'));assert.equal(fixture.calls(),4);
});
