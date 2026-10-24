import test from'node:test';import assert from'node:assert/strict';import{deliveryMessageId,buildMime,findDeliveryDraft}from'./tools/gmail.mjs';
const token='11111111-2222-4333-8444-555555555555',to='buyer@example.test',subject='Your video';
function transport(over={}){const calls=[];return{calls,request:async p=>{calls.push(p);return p.startsWith('drafts?')?over.list??{drafts:[{id:'draft1'}]}:{id:'draft1',message:{id:'message1',payload:{headers:[{name:'From',value:'sender@example.test'},{name:'Message-ID',value:`<${deliveryMessageId(token)}>`},{name:'To',value:over.to??to},{name:'Subject',value:over.subject??subject}]}}};}};}
test('delivery MIME carries an exact validated message identity and cannot inject headers',()=>{const raw=buildMime({from:'sender@example.test',to,subject,body:'Hello',deliveryToken:token});assert.ok(raw.includes(`Message-ID: <${deliveryMessageId(token)}>`));assert.throws(()=>buildMime({from:'sender@example.test',to,subject,body:'Hello',deliveryToken:'bad\r\nBcc: other@example.test'}),/intent token/);});
test('recovery uses only read-only draft search/get and verifies exact recipient and subject',async()=>{const t=transport();const out=await findDeliveryDraft({token,to,subject},{request:t.request,account:'sender@example.test'});assert.equal(out.draftId,'draft1');assert.equal(t.calls.length,2);assert.match(decodeURIComponent(t.calls[0]),/rfc822msgid:<mint-delivery-/);assert.equal(t.calls[1],'drafts/draft1?format=full');});
test('no-match, pagination, multiple matches and identity mismatch never select an unverified draft',async()=>{const none=transport({list:{drafts:[]}});assert.equal(await findDeliveryDraft({token,to,subject},{request:none.request,account:'sender@example.test'}),null);for(const over of[{list:{drafts:[{id:'one'},{id:'two'}]}},{list:{drafts:[],nextPageToken:'more'}},{to:'other@example.test'},{subject:'Other order'}]){const t=transport(over);await assert.rejects(()=>findDeliveryDraft({token,to,subject},{request:t.request,account:'sender@example.test'}));}});


test('extra recipients and duplicate identity headers are rejected',async()=>{
 for(const extra of[[{name:'Cc',value:'other@example.test'}],[{name:'Bcc',value:'other@example.test'}],[{name:'To',value:to}]]){
  const t=transport(),request=async p=>{const r=await t.request(p);if(r.message)r.message.payload.headers.push(...extra);return r;};await assert.rejects(()=>findDeliveryDraft({token,to,subject},{request,account:'sender@example.test'}));
 }
 const t=transport({to:'Buyer <buyer@example.test>, Other <other@example.test>'});await assert.rejects(()=>findDeliveryDraft({token,to,subject},{request:t.request,account:'sender@example.test'}));
});
