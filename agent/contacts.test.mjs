import test from 'node:test';
import assert from 'node:assert/strict';
import {openStore} from './store.mjs';
import {createRunner} from './runner.mjs';
import {createRequalifier} from './quality.mjs';
import {classifyEmail,rankContacts,extractFounderName,findPersonalContact,resolveContact,MAX_EXA_CALLS,NO_CONTACT,ONLY_GENERIC} from './contacts.mjs';

// Everything below is stubbed: no Exa, Claude, Gmail or site call is ever made.
const exaStub=(pages={},cost=0.005)=>{
 const calls=[];
 const hit=urls=>urls.filter(u=>pages[u]!==undefined).map(u=>({url:u,title:'',text:pages[u]}));
 return {calls,
  search:async q=>{calls.push(['search',q]);return {results:Object.entries(pages.search||{}).map(([url,text])=>({url,title:'',text})),costUsd:cost};},
  contents:async urls=>{calls.push(['contents',urls]);return {results:urls.filter(u=>pages.contents?.[u]!==undefined).map(u=>({url:u,title:'',text:pages.contents[u]})),costUsd:cost};}};
};

test('classification: role inboxes, personal names, and everything else',()=>{
 for(const e of ['info','support','hello','contact','sales','press','team','admin','orders','help','care','service','customerservice','customer-service','wholesale','shop','store','marketing','partnerships','collabs','noreply','office','general','inquiries','mail','studio','hello+x','support2'])assert.equal(classifyEmail(`${e}@brand.com`,{domain:'brand.com'}),'role',e);
 for(const e of ['sarah@brand.com','sarah.lee@brand.com','s.lee@brand.com','jane_doe@brand.com','john.smith@gmail.com'])assert.equal(classifyEmail(e,{domain:'brand.com'}),'personal',e);
 assert.equal(classifyEmail('brand@brand.com',{domain:'brand.com'}),'role','the brand name alone is not a person');
 assert.equal(classifyEmail('bybrand@gmail.com',{domain:'brand.com'}),'other','a free mailbox with no name behind it');
 assert.equal(classifyEmail('sam@other.com',{domain:'brand.com'}),'other','an unrelated domain is not trusted');
 assert.equal(classifyEmail('slee@gmail.com',{domain:'brand.com',names:['Sarah Lee']}),'personal','a named founder address');
 assert.equal(classifyEmail('sarahlee@gmail.com',{domain:'brand.com'}),'other','without a known name a single token on a free mailbox is not trusted');
});

test('personal ranks before role, and the brand domain before outside domains',()=>{
 const ranked=rankContacts([{email:'Info@brand.com'},{email:'help@brand.com'},{email:'jo.kim@gmail.com'},{email:'sarah@brand.com'},{email:'sarah@brand.com'}],{domain:'brand.com'});
 assert.deepEqual(ranked.map(e=>[e.email,e.kind]),[['sarah@brand.com','personal'],['jo.kim@gmail.com','personal'],['info@brand.com','role'],['help@brand.com','role']]);
});

test('founder name comes from the page text, not from a title or the brand',()=>{
 assert.equal(extractFounderName('Alpha was founded by Sarah Lee in Brooklyn.','Alpha'),'Sarah Lee');
 assert.equal(extractFounderName('Meet Sarah Lee, founder of Alpha','Alpha'),'Sarah Lee');
 assert.equal(extractFounderName('Founder: Tom Ray','Alpha'),'Tom Ray');
 assert.equal(extractFounderName('Our Story. Shop the Collection. Founder of nothing.','Alpha'),null);
});

test('an email is only returned if it is printed in fetched text: names and domains are never combined',async()=>{
 const exa=exaStub({search:{'https://alpha.com/about':'Alpha was founded by Sarah Lee in 2019. Questions go through the form below.'},contents:{'https://www.instagram.com/alpha/':'Alpha. Founder Sarah Lee. DM us. Link in bio.'}});
 const out=await findPersonalContact({brand:'Alpha',domain:'alpha.com',homepageText:'Shop new arrivals',socials:{instagram:'https://www.instagram.com/alpha/'},exa});
 assert.equal(out.personal,null);assert.equal(out.name,'Sarah Lee');
 assert.equal(out.kind,'instagram');assert.equal(out.instagram.handle,'alpha');
 const everything=JSON.stringify([...exa.calls,'Shop new arrivals']);
 for(const e of [out.personal,out.role].filter(Boolean))assert.ok(everything.includes(e.email),'only literal emails');
 for(const guess of ['sarah@alpha.com','sarah.lee@alpha.com','slee@alpha.com','sarahlee@alpha.com'])assert.ok(!JSON.stringify(out).includes(guess),guess);
});

test('a personal email printed on the Instagram bio or about page is found, and beats a generic inbox on the same page',async()=>{
 const exa=exaStub({search:{'https://alpha.com/pages/about':'Alpha. Founded by Sarah Lee. Orders: info@alpha.com'},contents:{'https://www.instagram.com/alpha/':'Alpha official. For collabs: sarah.lee@alpha.com'}});
 const spent=[];
 const out=await findPersonalContact({brand:'Alpha',domain:'alpha.com',socials:{instagram:'https://www.instagram.com/alpha/'},exa,onSpend:(usd,note)=>spent.push([usd,note])});
 assert.equal(out.kind,'personal');assert.equal(out.personal.email,'sarah.lee@alpha.com');assert.equal(out.personal.sourceUrl,'https://www.instagram.com/alpha/');
 assert.equal(out.role.email,'info@alpha.com');
 assert.equal(out.calls,2,'stops once a personal email is found');assert.equal(spent.length,2);assert.equal(out.costUsd,0.01);
});

test('emails on pages outside the brand and its Instagram only count when they sit on the brand domain',async()=>{
 const exa=exaStub({search:{'https://blog.example/post':'Alpha is great. Contact their buyer at pat.jones@gmail.com or founder sarah.lee@alpha.com'}});
 const out=await findPersonalContact({brand:'Alpha',domain:'alpha.com',exa});
 assert.equal(out.personal.email,'sarah.lee@alpha.com');
});

test('at most 3 Exa calls per lead, each with its real cost recorded',async()=>{
 const exa=exaStub({});const spent=[];
 const out=await findPersonalContact({brand:'Alpha',domain:'alpha.com',socials:{instagram:'https://www.instagram.com/alpha/'},exa,onSpend:(usd,note)=>spent.push([usd,note])});
 assert.equal(MAX_EXA_CALLS,3);assert.equal(exa.calls.length,3);assert.equal(out.calls,3);assert.equal(spent.length,3);
 assert.ok(Math.abs(spent.reduce((s,x)=>s+x[0],0)-0.015)<1e-9);
 const capped=exaStub({});await findPersonalContact({brand:'Alpha',domain:'alpha.com',exa:capped,maxCalls:1});
 assert.equal(capped.calls.length,1);
});

test('failed Exa calls are reported, not rejected as "no contact", and a skipped call is not counted',async()=>{
 const broken={search:async()=>{throw new Error('HTTP 500');},contents:async()=>{throw new Error('HTTP 500');}};
 const out=await findPersonalContact({brand:'Alpha',domain:'alpha.com',exa:broken});
 assert.equal(out.failed,true);
 const r=await resolveContact({brand:'Alpha',domain:'alpha.com',emails:[],find:args=>findPersonalContact({...args,exa:broken})});
 assert.equal(r.uncertain,true);assert.match(r.reason,/Contact lookup failed/);
 const keyless={search:async()=>({results:[],costUsd:null}),contents:async()=>({results:[],costUsd:null,skipped:true})};
 const k=await findPersonalContact({brand:'Alpha',domain:'alpha.com',socials:{instagram:'https://www.instagram.com/alpha/'},exa:keyless});
 assert.equal(k.calls,2,'search twice, the keyless contents call does not count');
});

test('resolveContact: a personal email on the site needs no Exa call; a generic inbox alone is not enough',async()=>{
 let finds=0;const find=async()=>{finds++;return {kind:'none',personal:null,role:null,instagram:null,calls:0};};
 const a=await resolveContact({brand:'Alpha',domain:'alpha.com',emails:[{email:'info@alpha.com'},{email:'sarah@alpha.com',sourceUrl:'https://alpha.com/c'}],find});
 assert.equal(a.kind,'personal');assert.equal(a.email,'sarah@alpha.com');assert.equal(finds,0);
 const b=await resolveContact({brand:'Alpha',domain:'alpha.com',emails:[{email:'info@alpha.com'}],find});
 assert.equal(b.kind,'role');assert.equal(b.reason,ONLY_GENERIC);assert.equal(finds,1);
 const c=await resolveContact({brand:'Alpha',domain:'alpha.com',emails:[],find});
 assert.equal(c.kind,'none');assert.equal(c.reason,NO_CONTACT);
 const d=await resolveContact({brand:'Alpha',domain:'alpha.com',emails:[{email:'info@alpha.com'}],socials:{instagram:'https://www.instagram.com/alpha/'},find});
 assert.equal(d.kind,'instagram');assert.equal(d.handle,'alpha');assert.equal(d.email,null,'the generic inbox is not kept as the contact');
});

// ---- runner ----
const site=(domain,{emails=[],socials={instagram:`https://www.instagram.com/${domain.split('.')[0]}/`}}={})=>({via:'fake',sessionId:null,screenshot:null,domain,socials,pages:[{url:`https://${domain}/`,title:domain,chars:1}],homeText:`Shop. Founded by Sam Lee.`,contactText:'',emails:emails.map(email=>({email,sourceUrl:`https://${domain}/c`,excerpt:email})),best:emails[0]?{email:emails[0],sourceUrl:`https://${domain}/c`,excerpt:emails[0]}:null});
function runnerTools(sites,over={}){
 const calls={gmail:[],find:[],dm:[],email:[],score:0};
 const tools={calls,
  loadProfile:()=>({senderName:'Ryan',company:'Mint Labs',offer:'AI UGC',senderFact:'x',cta:'y',rules:'z'}),
  brainMode:()=>'fake',exaMode:()=>'rest',siteMode:()=>'fetch',gmailEnabled:()=>true,draftAccount:()=>'me@x.co',
  plan:async()=>({data:{reply:'ok',markets:['m'],territories:['t'],maxDrafts:5,qualify:'q',exclusions:[],searchQueries:[{query:'q1',market:'m',territory:'t'}]},cost:0,model:'fake'}),
  search:async()=>({via:'fake',costUsd:0,requestId:null,results:Object.keys(sites).map(d=>({title:d.split('.')[0],url:`https://${d}/`,text:'brand'}))}),
  visit:async url=>sites[new URL(url).hostname],
  logo:async()=>({ok:true,checked:true,cost:0,logo:{checked:true,isRealLogo:true,matchesBrand:true,quality:90,reason:'f'}}),
  value:async()=>({data:{valueScore:90,verdict:'keep',reason:'good'},cost:0,model:'fake'}),
  score:async({lead})=>{calls.score++;return {data:{company:lead.company,fitScore:80,decision:'pursue',reasons:['good'],risks:[],personalDetail:'d'},cost:0,model:'fake'};},
  draft:async({graded,contact})=>{calls.email.push(contact);return {data:{subject:`Hi ${graded.company}`,body:`Hi ${contact?.name||'team'}`},cost:0,model:'fake'};},
  draftDm:async({graded,contact})=>{calls.dm.push(contact);return {data:{subject:`Instagram DM to @${contact.handle}`,body:`Hi ${graded.company}`},cost:0,model:'fake'};},
  createDraft:async d=>{calls.gmail.push(d);return {draftId:'d',messageId:'m',url:'https://mail.google.com/x'};},
  steer:async({currentPlan})=>({data:{reply:'ok',action:'continue',plan:currentPlan,skipDomains:[]},cost:0,model:'fake'}),
  ...over};
 return tools;
}
const run=async(tools)=>{const store=openStore(':memory:');const runner=createRunner(store,tools);const t=runner.start('go');await runner.wait(t.id);const by=Object.fromEntries(store.listLeads({taskId:t.id}).map(l=>[l.domain,l]));return {store,by,task:store.getTask(t.id)};};

test('runner: no personal email but an Instagram handle writes a DM draft, never touches Gmail, and stays out of the email flow',async()=>{
 const tools=runnerTools({'alpha.com':site('alpha.com',{emails:['info@alpha.com']})},{findContact:async()=>({kind:'instagram',personal:null,role:{email:'info@alpha.com'},name:'Sam Lee',instagram:{handle:'alpha',url:'https://www.instagram.com/alpha/'},calls:2,costUsd:0.01,errors:[]})});
 const {store,by}=await run(tools);
 const lead=by['alpha.com'];
 assert.equal(lead.status,'drafted');assert.equal(lead.contact_kind,'instagram');assert.equal(lead.instagram_handle,'alpha');assert.equal(lead.contact_name,'Sam Lee');assert.equal(lead.contact_email,null);
 assert.equal(tools.calls.gmail.length,0,'no Gmail call for a DM');assert.equal(tools.calls.email.length,0);assert.equal(tools.calls.dm.length,1);
 const [d,...rest]=store.listDrafts({leadId:lead.id});
 assert.equal(rest.length,0);assert.equal(d.channel,'instagram_dm');assert.equal(d.status,'crm_only');assert.equal(d.gmail_draft_id,null);assert.equal(d.gmail_url,null);assert.equal(d.to_email,'@alpha');
 assert.ok(store.listEvents().some(e=>e.type==='draft'&&/Instagram DM for @alpha saved in CRM\. Not sent\./.test(e.title)));
});

test('runner: a DM draft still goes through the video step and waits there',async()=>{
 const video={enabled:()=>({ok:false,reason:'Higgsfield is not configured'})};
 const tools=runnerTools({'alpha.com':site('alpha.com',{emails:[]})},{video,findContact:async()=>({kind:'instagram',personal:null,role:null,name:null,instagram:{handle:'alpha',url:'https://www.instagram.com/alpha/'},calls:0,costUsd:0,errors:[]})});
 const {store,by}=await run(tools);
 assert.equal(by['alpha.com'].status,'awaiting_video');
 const d=store.listDrafts({leadId:by['alpha.com'].id})[0];
 assert.equal(d.channel,'instagram_dm');assert.equal(d.status,'waiting_video');
 assert.equal(tools.calls.gmail.length,0);
});

test('runner: a personal email is written to by name; a site-printed personal email needs no Exa lookup',async()=>{
 const tools=runnerTools({'alpha.com':site('alpha.com',{emails:['info@alpha.com','sam.lee@alpha.com']})},{findContact:async()=>{throw new Error('must not look up');}});
 const {store,by}=await run(tools);
 const l=by['alpha.com'];
 assert.equal(l.status,'drafted');assert.equal(l.contact_kind,'personal');assert.equal(l.contact_email,'sam.lee@alpha.com');assert.equal(l.contact_name,'Sam Lee');
 assert.deepEqual(tools.calls.gmail.map(d=>d.to),['sam.lee@alpha.com']);assert.equal(tools.calls.email[0].name,'Sam Lee');
 assert.equal(store.listDrafts({leadId:l.id})[0].channel,'email');
});

test('runner: Exa finds a personal email behind a generic inbox, and its cost lands in the spend ledger',async()=>{
 const tools=runnerTools({'alpha.com':site('alpha.com',{emails:['hello@alpha.com']})},{findContact:async({onSpend})=>{onSpend(0.004,'exa search: founder');onSpend(0.001,'exa contents: about and instagram');return {kind:'personal',personal:{email:'sam.lee@alpha.com',sourceUrl:'https://www.instagram.com/alpha/',excerpt:'bio'},role:null,name:'Sam Lee',instagram:null,calls:2,costUsd:0.005,errors:[]};}});
 const {store,by,task}=await run(tools);
 assert.equal(by['alpha.com'].contact_email,'sam.lee@alpha.com');assert.deepEqual(tools.calls.gmail.map(d=>d.to),['sam.lee@alpha.com']);
 const rows=store.db.prepare("select usd,note from spend where provider='exa'").all();
 assert.deepEqual(rows.map(r=>r.usd).sort(),[0.001,0.004]);assert.ok(rows.every(r=>/^contact lookup: /.test(r.note)));
 assert.ok(Math.abs(task.cost_usd-0.005)<1e-9);
});

test('runner: no email and no Instagram is rejected with "No reachable contact" and nothing more is spent',async()=>{
 const tools=runnerTools({'alpha.com':site('alpha.com',{emails:[],socials:{tiktok:'https://www.tiktok.com/@alpha'}})},{findContact:async()=>({kind:'none',personal:null,role:null,name:null,instagram:null,calls:3,costUsd:0.015,errors:[]})});
 const {store,by,task}=await run(tools);
 const l=by['alpha.com'];
 assert.equal(l.status,'rejected');assert.equal(l.notes,'No reachable contact');assert.equal(l.contact_kind,'none');
 assert.equal(tools.calls.email.length+tools.calls.dm.length+tools.calls.gmail.length,0);assert.equal(store.listDrafts().length,0);
 assert.match(task.summary,/0 draft\(s\).*1 rejected with no personal contact/);
});

test('runner: only a generic inbox is rejected, unless there is an Instagram to DM',async()=>{
 const none=runnerTools({'alpha.com':site('alpha.com',{emails:['info@alpha.com'],socials:{tiktok:'https://www.tiktok.com/@alpha'}})},{findContact:async()=>({kind:'role',personal:null,role:{email:'info@alpha.com'},name:null,instagram:null,calls:3,costUsd:0,errors:[]})});
 const a=await run(none);
 assert.equal(a.by['alpha.com'].status,'rejected');assert.equal(a.by['alpha.com'].notes,'Only a generic inbox');assert.equal(a.by['alpha.com'].contact_kind,'role');
 assert.equal(none.calls.gmail.length,0);
 // the finder is not even wired: the Instagram linked from the site is enough for a DM
 const dm=runnerTools({'beta.com':site('beta.com',{emails:['support@beta.com']})});
 const b=await run(dm);
 assert.equal(b.by['beta.com'].contact_kind,'instagram');assert.equal(dm.calls.dm.length,1);assert.equal(dm.calls.gmail.length,0);
});

test('runner: a failed contact lookup marks the lead error instead of rejecting it',async()=>{
 const tools=runnerTools({'alpha.com':site('alpha.com',{emails:['info@alpha.com'],socials:{tiktok:'https://www.tiktok.com/@alpha'}})},{findContact:async()=>({kind:'role',personal:null,role:{email:'info@alpha.com'},name:null,instagram:null,calls:3,costUsd:0,errors:['x: HTTP 500','y: HTTP 500','z: HTTP 500'],failed:true})});
 const {by}=await run(tools);
 assert.equal(by['alpha.com'].status,'error');assert.match(by['alpha.com'].notes,/Contact lookup failed/);
});

// ---- requalify ----
test('requalify applies the contact rule: personal or Instagram stays, generic-only and no-contact are rejected, nothing is deleted or sent',async()=>{
 const store=openStore(':memory:');
 const mk=(domain,status,fields={})=>{const l=store.createLead({taskId:null,domain,company:domain,url:`https://${domain}/`,market:'m',territory:'t',status,evidence:'ev'});return store.updateLead(l.id,{value:{score:90,verdict:'keep',reason:'x',checkedAt:'t'},...fields});};
 const e=addr=>[{email:addr,sourceUrl:'https://x/c',excerpt:addr}];
 const person=mk('person.com','drafted',{emails:e('sam.lee@person.com'),socials:{instagram:'https://www.instagram.com/person/'}});
 const generic=mk('generic.com','drafted',{emails:e('info@generic.com'),socials:{tiktok:'https://www.tiktok.com/@generic'}});
 const dmOnly=mk('dmonly.com','drafted',{emails:e('hello@dmonly.com'),socials:{instagram:'https://www.instagram.com/dmonly/'}});
 const nothing=mk('nothing.com','skipped',{socials:{tiktok:'https://www.tiktok.com/@nothing'}});
 const found=mk('found.com','drafted',{emails:e('info@found.com'),socials:{tiktok:'https://www.tiktok.com/@found'}});
 const down=mk('down.com','unreachable',{notes:'fetch failed',value:null});
 const done=mk('done.com','drafted',{contact_kind:'personal'});
 const sent=mk('sent.com','contacted');
 const gd=(l,to)=>store.addDraft({leadId:l.id,taskId:null,to,subject:'s',body:'b',gmailDraftId:'g'+l.id,gmailUrl:`https://mail.google.com/${l.id}`,status:'gmail_draft'});
 gd(generic,'info@generic.com');gd(dmOnly,'hello@dmonly.com');gd(down,'info@down.com');
 const exa=domain=>({calls:0,search:async()=>({results:domain==='found.com'?[{url:'https://found.com/about',text:'Found was started by Pat Ray. Reach Pat at pat@found.com'}]:[],costUsd:0.004}),contents:async()=>({results:[],costUsd:0.001})});
 const per={};
 const tools={
  fetchHome:async()=>{throw new Error('requalify must not refetch leads that were already gated');},
  findContact:args=>{const x=exa(args.domain);per[args.domain]=0;const wrap=f=>async(...a)=>{per[args.domain]++;return f(...a);};return findPersonalContact({...args,exa:{search:wrap(x.search),contents:wrap(x.contents)}});},
  draftDm:async a=>({data:{subject:`Instagram DM to @${a.contact.handle}`,body:'dm'},cost:0,model:'fake'}),loadProfile:()=>({senderName:'Ryan',company:'Mint Labs',offer:'AI UGC',senderFact:'x',cta:'y',rules:'z'}),
  createDraft(){throw new Error('requalify must never call Gmail');},updateDraft(){throw new Error('no Gmail');},deleteDraft(){throw new Error('no Gmail');}
 };
 const out=await createRequalifier({store,tools}).run();
 const get=l=>store.getLead(l.id);
 assert.equal(get(person).status,'drafted');assert.equal(get(person).contact_kind,'personal');assert.equal(get(person).contact_email,'sam.lee@person.com');assert.equal(per['person.com'],undefined,'no Exa call when a personal email is on file');
 assert.equal(get(generic).status,'rejected');assert.equal(get(generic).notes,'Only a generic inbox');assert.equal(get(generic).contact_kind,'role');
 assert.equal(get(dmOnly).status,'drafted');assert.equal(get(dmOnly).contact_kind,'instagram');assert.equal(get(dmOnly).instagram_handle,'dmonly');assert.equal(get(dmOnly).contact_email,null);
 assert.equal(get(nothing).status,'rejected');assert.equal(get(nothing).notes,'No reachable contact');
 assert.equal(get(found).status,'drafted');assert.equal(get(found).contact_email,'pat@found.com');assert.equal(get(found).contact_name,'Pat Ray');
 assert.equal(get(down).status,'rejected');assert.match(get(down).notes,/^Site unreachable: fetch failed/);assert.equal(per['down.com'],undefined,'an unreachable site costs nothing');
 assert.ok(Object.values(per).every(n=>n<=3),'at most 3 Exa calls per lead');
 assert.equal(get(done).status,'drafted');assert.equal(get(sent).status,'contacted');
 assert.deepEqual(out.rejected.map(r=>r.id).sort((a,b)=>a-b),[generic.id,nothing.id,down.id].sort((a,b)=>a-b));
 assert.deepEqual(out.withdrawnDrafts.map(d=>d.to).sort(),['info@down.com','info@generic.com']);
 assert.deepEqual(out.genericDrafts.map(d=>[d.leadId,d.to,d.instagram]),[[dmOnly.id,'hello@dmonly.com','dmonly']]);
 assert.equal(store.listLeads().length,8,'no lead deleted');assert.equal(store.listDrafts().length,4,'no draft deleted: the 3 originals plus the one Instagram DM written for dmonly.com');
 const spend=store.db.prepare("select provider,usd,note from spend").all();
 assert.ok(spend.length>0&&spend.every(s=>s.provider==='exa'&&/^requalify: contact lookup: /.test(s.note)));
 assert.ok(spend.reduce((s,r)=>s+r.usd,0)>0);
 assert.equal((await createRequalifier({store,tools}).run()).checked,0,'a second run has nothing left to do');
});
