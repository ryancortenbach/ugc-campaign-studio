import test from 'node:test';
import assert from 'node:assert/strict';
import {openStore} from './store.mjs';
import {createSentWatch} from './sentwatch.mjs';

const reply=(status,body)=>({ok:status>=200&&status<300,status,json:async()=>body});
function setup({draftGone=true,sent=[]}={}){
 const store=openStore(':memory:');
 const lead=store.createLead({taskId:1,domain:'alpha.com',company:'Alpha',url:'https://alpha.com',market:'m',territory:'t'});
 store.updateLead(lead.id,{status:'drafted'});
 const draft=store.addDraft({leadId:lead.id,taskId:1,to:'hello@alpha.com',subject:'Hi',body:'B',gmailDraftId:'d1',gmailUrl:'u',status:'gmail_draft'});
 const calls=[];
 const fetch=async(url,init={})=>{
  calls.push({url:String(url),method:init.method||'GET',auth:init.headers?.Authorization});
  const u=new URL(url),p=u.pathname.replace('/gmail/v1/users/me/','');
  if(p==='drafts/d1')return draftGone?reply(404,{}):reply(200,{id:'d1'});
  if(p==='messages')return reply(200,{messages:sent.map(m=>({id:m.id}))});
  const m=sent.find(x=>p==='messages/'+x.id);
  return m?reply(200,m):reply(404,{});
 };
 return {store,lead,draft,calls,watch:createSentWatch({store,gmail:{fetch,token:async()=>'tok'}})};
}
const titles=(store)=>store.listEvents().filter(e=>e.tool==='sentwatch').map(e=>e.title);

test('draft gone and a sent message exists: marked sent, lead contacted, event logged', async () => {
 const {store,draft,lead,watch,calls}=setup({sent:[{id:'m9',threadId:'t9',internalDate:String(Date.now()+60000)}]});
 const out=await watch.tick();
 assert.equal(out.sent,1);
 assert.equal(store.getDraft(draft.id).status,'sent');
 assert.equal(store.getLead(lead.id).status,'contacted');
 assert.deepEqual(titles(store),['Sent: hello@alpha.com']);
 const notice=store.listEvents().find(e=>e.tool==='sentwatch');
 assert.equal(notice.type,'draft');assert.equal(notice.data.draftId,draft.id);assert.equal(notice.data.messageId,'m9');
 const list=calls.find(c=>new URL(c.url).pathname.endsWith('/messages'));
 const q=new URL(list.url).searchParams.get('q');
 assert.match(q,/^in:sent to:hello@alpha\.com after:\d{4}\/\d{2}\/\d{2}$/);
 assert.ok(calls.every(c=>c.method==='GET'&&c.auth==='Bearer tok'),'read-only GET calls with the bearer token');
});

test('draft gone and nothing sent: stays gmail_draft, "deleted" logged once', async () => {
 const {store,draft,watch}=setup({sent:[]});
 await watch.tick();await watch.tick();await watch.tick();
 assert.equal(store.getDraft(draft.id).status,'gmail_draft');
 assert.deepEqual(titles(store),['Draft deleted in Gmail: hello@alpha.com']);
});

test('older sent mail to the same address does not count as sent', async () => {
 const {store,draft,watch}=setup({sent:[{id:'old',internalDate:String(Date.now()-3*86400000)}]});
 await watch.tick();
 assert.equal(store.getDraft(draft.id).status,'gmail_draft');
 assert.deepEqual(titles(store),['Draft deleted in Gmail: hello@alpha.com']);
});

test('draft still exists: no search, no change', async () => {
 const {store,draft,watch,calls}=setup({draftGone:false});
 const out=await watch.tick();
 assert.equal(out.checked,1);
 assert.equal(store.getDraft(draft.id).status,'gmail_draft');
 assert.deepEqual(titles(store),[]);
 assert.equal(calls.length,1);
});

test('crm_only and already sent drafts are ignored; API errors change nothing', async () => {
 const store=openStore(':memory:');
 const l=store.createLead({taskId:1,domain:'b.com',company:'B',url:'u',market:'m',territory:'t'});
 store.addDraft({leadId:l.id,taskId:1,to:'a@b.com',subject:'s',body:'b',status:'crm_only'});
 const d2=store.addDraft({leadId:l.id,taskId:1,to:'a@b.com',subject:'s',body:'b',gmailDraftId:'x',status:'gmail_draft'});
 const watch=createSentWatch({store,gmail:{fetch:async()=>reply(500,{}),token:async()=>'t'}});
 const out=await watch.tick();
 assert.equal(out.checked,1);assert.equal(out.errors,1);
 assert.equal(store.getDraft(d2.id).status,'gmail_draft');
 assert.deepEqual(titles(store),[]);
 watch.start();watch.start();watch.stop();watch.stop();
});
