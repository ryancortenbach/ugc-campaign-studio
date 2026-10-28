import test from 'node:test';
import assert from 'node:assert/strict';
import {openStore} from './store.mjs';
import {createSentWatch} from './sentwatch.mjs';

function fixture(t,{sent=true}={}){
 const store=openStore(':memory:');t.after(()=>store.db.close());
 const lead=store.createLead({taskId:1,company:'Fixture',domain:'fixture.example',url:'https://fixture.example',market:'apparel',territory:'NYC',status:'drafted'});
 const draft=store.addDraft({leadId:lead.id,taskId:1,to:'person@fixture.example',subject:'Fixture offer',body:'Original body',gmailDraftId:'original',status:'gmail_draft'});
 let resume,entered,hold=true;
 const waiting=new Promise(resolve=>entered=resolve),gate=new Promise(resolve=>resume=resolve),calls=[];
 const response=(status,body)=>({status,ok:status===200,json:async()=>body});
 const watch=createSentWatch({store,gmail:{token:async()=>'fixture-token',fetch:async(url,init)=>{
  assert.equal(init.method,'GET');const path=new URL(url).pathname;calls.push(path);
  if(path.endsWith('/drafts/original'))return response(404,{});
  if(path.endsWith('/drafts/replacement'))return response(200,{id:'replacement'});
  if(path.endsWith('/messages')){
   if(hold){hold=false;entered();await gate;}
   return response(200,{messages:sent?[{id:'sent-original'}]:[]});
  }
  if(path.endsWith('/messages/sent-original'))return response(200,{id:'sent-original',threadId:'thread-original',internalDate:String(Date.now()+60000)});
  throw Error(`Unexpected mocked path ${path}`);
 }}});
 return {store,lead,draft,watch,waiting,resume,calls,events:()=>store.listEvents().filter(event=>event.tool==='sentwatch')};
}

test('a delayed sent check cannot mark a replacement draft sent',async t=>{
 const f=fixture(t),pending=f.watch.tick();await f.waiting;
 f.store.updateDraft(f.draft.id,{gmail_draft_id:'replacement',body:'Newer body',render_id:9});
 f.resume();const result=await pending;
 assert.equal(result.sent,0);
 assert.equal(f.store.getDraft(f.draft.id).status,'gmail_draft');
 assert.equal(f.store.getDraft(f.draft.id).body,'Newer body');
 assert.equal(f.store.getLead(f.lead.id).status,'drafted');
 assert.deepEqual(f.events(),[]);
 await f.watch.tick();assert.ok(f.calls.some(path=>path.endsWith('/drafts/replacement')));
 assert.deepEqual(f.events(),[]);
});

test('a concurrent confirmed send is not counted or announced again by a stale poll',async t=>{
 const f=fixture(t),pending=f.watch.tick();await f.waiting;
 f.store.markDraftSent(f.draft.id);f.resume();const result=await pending;
 assert.equal(result.sent,0);assert.equal(f.store.getDraft(f.draft.id).status,'sent');
 assert.deepEqual(f.events(),[]);
});

test('a delayed missing-message check cannot announce deletion of an updated draft',async t=>{
 const f=fixture(t,{sent:false}),pending=f.watch.tick();await f.waiting;
 f.store.updateDraft(f.draft.id,{gmail_draft_id:'replacement'});f.resume();
 assert.equal((await pending).deleted,0);assert.deepEqual(f.events(),[]);
});

test('in-place edits and local removal also invalidate the inspected snapshot',async t=>{
 for(const [name,fields] of Object.entries({body:{body:'Updated in place'},recipient:{to_email:'new@fixture.example'},subject:{subject:'New offer'},attachments:{attachments:[{filename:'new.pdf',mime:'application/pdf',bytes:100}]},withdrawn:{status:'withdrawn'},localOnly:{status:'crm_only'},removed:null})){
  await t.test(name,async t=>{
   const f=fixture(t),pending=f.watch.tick();await f.waiting;
   if(fields)f.store.updateDraft(f.draft.id,fields);
   else f.store.db.prepare('delete from drafts where id=?').run(f.draft.id);
   const expected=f.store.getDraft(f.draft.id);f.resume();
   assert.equal((await pending).sent,0);assert.deepEqual(f.store.getDraft(f.draft.id),expected);
   assert.equal(f.store.getLead(f.lead.id).status,'drafted');assert.deepEqual(f.events(),[]);
  });
 }
});

test('unchanged drafts still reconcile after a delayed response',async t=>{
 const f=fixture(t),pending=f.watch.tick();await f.waiting;f.resume();
 assert.equal((await pending).sent,1);assert.equal(f.store.getDraft(f.draft.id).status,'sent');
 assert.equal(f.events().length,1);await f.watch.tick();assert.equal(f.events().length,1);
});
