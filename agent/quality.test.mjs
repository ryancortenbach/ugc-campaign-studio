import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';

// No network, no credits: every fetch, Claude, logo and Gmail call is a stub, and the data folder is a temp dir.
process.env.AGENT_DATA_DIR=mkdtempSync(path.join(tmpdir(),'quality-'));
const {openStore}=await import('./store.mjs');
const {createRunner}=await import('./runner.mjs');
const {createApp}=await import('./server.mjs');
const {extractSocials,fetchHomepage,parseHtml}=await import('./tools/site.mjs');
const q=await import('./quality.mjs');

const GLOBE=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAACXBIWXMAAAsSAAALEgHS3X78AAACiElEQVQ4EaVTzU8TURCf2tJuS7tQtlRb6UKBIkQwkRRSEzkQgyEc6lkOKgcOph78Y+CgjXjDs2i44FXY9AMTlQRUELZapVlouy3d7kKtb0Zr0MSLTvL2zb75eL838xtTvV6H/xELBptMJojeXLCXyobnyog4YhzXYvmCFi6qVSfaeRdXdrfaU1areV5KykmX06rcvzumjY/1ggkR3Jh+bNf1mr8v1D5bLuvR3qDgFbvbBJYIrE1mCIoCrKxsHuzK+Rzvsi29+6DEbTZz9unijEYI8ObBgXOzlcrx9OAlXyDYKUCzwwrDQx1wVDGg089Dt+gR3mxmhcUnaWeoxwMbm/vzDFzmDEKMMNhquRqduT1KwXiGt0vre6iSeAUHNDE0d26NBtAXY9BACQyjFusKuL2Ry+IPb/Y9ZglwuVscdHaknUChqLF/O4jn3V5dP4mhgRJgwSYm+gV0Oi3XrvYB30yvhGa7BS70eGFHPoTJyQHhMK+F0ZesRVVznvXw5Ixv7/C10moEo6OZXbWvlFAF9FVZDOqEABUMRIkMd8GnLwVWg9/RkJF9sA4oDfYQAuzzjqzwvnaRUFxn/X2ZlmGLXAE7AL52B4xHgqAUqrC1nSNuoJkQtLkdqReszz/9aRvq90NOKdOS1nch8TpL555WDp49f3uAMXhACRjD5j4ykuCtf5PP7Fm1b0DIsl/VHGezzP1KwOiZQobFF9YyjSRYQETRENSlVzI8iK9mWlzckpSSCQHVALmN9Az1euDho9Xo8vKGd2rqooA8yBcrwHgCqYR0kMkWci08t/R+W4ljDCanWTg9TJGwGNaNk3vYZ7VUdeKsYJGFNkfSzjXNrSX20s4/h6kB81/271ghG17l+rPTAAAAAElFTkSuQmCC','base64');
const png=(w,h)=>{const b=Buffer.alloc(33);Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]).copy(b);b.write('IHDR',12);b.writeUInt32BE(w,16);b.writeUInt32BE(h,20);return b;};
const keepValue=async()=>({data:{valueScore:90,verdict:'keep',reason:'established brand'},cost:0.0002,model:'fake'});
const goodLogo=async()=>({ok:true,checked:true,cost:0.0003,logo:{checked:true,isRealLogo:true,matchesBrand:true,quality:90,reason:'wordmark'}});

test('social extraction keeps profile links and ignores share links, posts and home pages',()=>{
 const s=extractSocials([
  'https://www.instagram.com/p/Cabc123/','https://instagram.com/','https://www.instagram.com/accounts/login','https://www.instagram.com/Brand.Co/?hl=en',
  {href:'https://www.tiktok.com/@brand/video/123'},'https://www.tiktok.com/','https://www.tiktok.com/@brand?lang=en',
  'https://twitter.com/share?url=https://x.com','https://twitter.com/intent/tweet?text=hi','https://twitter.com/Brand_Co',
  'https://www.facebook.com/sharer/sharer.php?u=1','https://www.facebook.com/brandpage/',
  'https://www.youtube.com/watch?v=1','https://youtube.com/@brandyt','mailto:a@b.co','not a url'
 ]);
 assert.deepEqual(s,{instagram:'https://www.instagram.com/brand.co/',tiktok:'https://www.tiktok.com/@brand',x:'https://x.com/brand_co',facebook:'https://www.facebook.com/brandpage',youtube:'https://www.youtube.com/@brandyt'});
 assert.deepEqual(extractSocials(['https://instagram.com/shopify','https://www.instagram.com/reel/abc','https://www.tiktok.com/tag/foo','https://www.facebook.com/sharer.php','https://x.com/home']),{});
 assert.equal(extractSocials(['https://www.instagram.com/first/','https://www.instagram.com/second/']).instagram,'https://www.instagram.com/first/');
});

test('fetch parsing finds socials in anchors, and the plain homepage fetch is capped and strict',async()=>{
 const html='<html><title>Brand</title><body><a href="/cart">Cart</a><footer><a href=\'https://www.instagram.com/brandco\'><svg></svg></a> <a href="https://www.tiktok.com/@brandco">TikTok</a></footer></body></html>';
 assert.equal(parseHtml(html,'https://brand.co/').links.length,3);
 let seen;
 const ok=await fetchHomepage('https://brand.co/',{fetchImpl:async(u,init)=>{seen=init;return new Response(html,{status:200});}});
 assert.deepEqual(ok.socials,{instagram:'https://www.instagram.com/brandco/',tiktok:'https://www.tiktok.com/@brandco'});
 assert.ok(seen.signal);
 const big=await fetchHomepage('https://brand.co/',{maxBytes:60,fetchImpl:async()=>new Response(html)});
 assert.ok(big.links.length<3,'only the first 60 bytes are read');
 await assert.rejects(fetchHomepage('https://brand.co/',{fetchImpl:async()=>new Response('blocked',{status:403})}),/HTTP 403/);
 await assert.rejects(fetchHomepage('file:///etc/passwd'),/http/);
});

test('company names lose markup and entities, and fall back to the domain brand',()=>{
 assert.equal(q.cleanCompany('<b>Alpha</b>  &amp; Co&nbsp;Goods'),'Alpha & Co Goods');
 assert.equal(q.cleanCompany('&lt;span&gt;Beta&lt;/span&gt;'),'Beta');
 assert.equal(q.companyFrom('<div class="logo__image','awful-cloth-store.com'),'Awful Cloth Store');
 assert.equal(q.companyFrom('','mint-tees.co.uk'),'Mint Tees');
 assert.equal(q.companyFrom('Alpha | Shop','alpha.com'),'Alpha');
 assert.equal(q.companyFrom('{{ shop.name }}','gamma.com'),'Gamma');
 assert.equal(q.companyFrom('Dolce &amp; Gabbana - Official','dg.com'),'Dolce & Gabbana');
 assert.equal(q.companyFrom('<img src=x onerror=1>','delta.shop'),'Delta');
});

test('the default globe and tiny icons count as no logo, real marks do not',()=>{
 assert.equal(q.isDefaultFavicon(GLOBE,'image/png'),true);
 assert.equal(q.isDefaultFavicon(png(16,16),'image/png'),true);
 assert.equal(q.isDefaultFavicon(png(128,128),'image/png'),false);
 assert.equal(q.isDefaultFavicon(png(512,300),'image/png'),false);
});

test('logo gate: missing logo, default globe, checker reject, checker keep, unsupported format',async()=>{
 const lead={company:'Alpha',domain:'alpha.com'};
 const hit={file:'x',type:'image/png',source:'google favicons'};
 let checks=0;
 const check=verdict=>async args=>{checks++;assert.equal(args.company,'Alpha');assert.equal(args.domain,'alpha.com');assert.ok(Buffer.isBuffer(args.data));return {data:verdict,cost:0.0004,model:'fake'};};
 const run=(data,type,v)=>q.logoGate({lead,resolve:async()=>data?hit:null,read:()=>({data,type}),check:check(v)});
 let r=await run(null);
 assert.deepEqual([r.ok,r.reason,checks],[false,'No logo found',0]);
 r=await run(GLOBE,'image/png');
 assert.deepEqual([r.ok,r.reason,checks],[false,'No logo found',0],'default globe never reaches the checker');
 r=await run(png(200,200),'image/png',{isRealLogo:false,matchesBrand:true,quality:10,reason:'Shopify default'});
 assert.equal(r.ok,false);assert.match(r.reason,/Shopify default/);assert.equal(r.cost,0.0004);assert.equal(checks,1);
 r=await run(png(200,200),'image/png',{isRealLogo:true,matchesBrand:false,quality:80,reason:'shows another brand'});
 assert.equal(r.ok,false);assert.match(r.short,/does not match/);
 r=await run(png(200,200),'image/png',{isRealLogo:true,matchesBrand:true,quality:88,reason:'wordmark'});
 assert.equal(r.ok,true);assert.equal(r.logo.quality,88);assert.equal(r.cost,0.0004);
 const n=checks;
 r=await run(Buffer.alloc(900,1),'image/svg+xml');
 assert.deepEqual([r.ok,r.checked,checks],[true,false,n],'formats the vision model cannot read are accepted unchecked and flagged');
});

test('gate: no socials rejects without any logo or grader call, then logo, then value',async()=>{
 const calls=[];
 const tools={logo:async()=>{calls.push('logo');return {ok:true,cost:0,logo:{checked:true}};},value:async()=>{calls.push('value');return keepValue();}};
 const lead={company:'Alpha',domain:'alpha.com'};
 const spent=[];const spend=(usd,provider)=>spent.push([provider,usd]);
 let g=await q.gateLead({lead,socials:{youtube:'https://www.youtube.com/@a',facebook:'https://www.facebook.com/alpha'},tools,spend});
 assert.deepEqual([g.pass,g.reason,g.title,calls.length,spent.length],[false,'No Instagram or TikTok linked from the site','Skipped Alpha: no Instagram or TikTok',0,0]);
 assert.equal(g.value.verdict,'reject');
 g=await q.gateLead({lead,socials:{tiktok:'https://www.tiktok.com/@alpha'},tools,spend});
 assert.equal(g.pass,true);assert.deepEqual(calls,['logo','value']);assert.equal(g.value.score,90);assert.ok(g.value.checkedAt);assert.ok(spent.some(s=>s[0]==='claude'));
 calls.length=0;
 g=await q.gateLead({lead,socials:{instagram:'https://www.instagram.com/a/'},tools:{...tools,logo:async()=>({ok:false,reason:'No logo found',cost:0})}});
 assert.deepEqual([g.pass,g.reason,calls.length],[false,'No logo found',0],'no logo means no value grader call');
 g=await q.gateLead({lead,socials:{instagram:'https://www.instagram.com/a/'},tools:{...tools,value:async()=>({data:{valueScore:65,verdict:'keep',reason:'thin site'},cost:0,model:'f'})}});
 assert.equal(g.pass,false,'below 70 is rejected even when the verdict says keep');assert.match(g.title,/low-value brand \(65\/100\)/);
 g=await q.gateLead({lead,socials:{instagram:'https://www.instagram.com/a/'},tools:{...tools,value:async()=>({data:{valueScore:95,verdict:'reject',reason:'print on demand'},cost:0,model:'f'})}});
 assert.equal(g.pass,false);assert.equal(g.value.verdict,'reject');
});

function missionTools(over={}){
 const graded=[],valued=[],drafts=[];
 const withSocials=new Set(['alpha.com','gamma.com','delta.com']);
 return {graded,valued,drafts,
  loadProfile:()=>({senderName:'Ryan',company:'Mint Labs',offer:'AI UGC',senderFact:'x',cta:'y',rules:'z'}),
  brainMode:()=>'fake',exaMode:()=>'rest',siteMode:()=>'fetch',gmailEnabled:()=>true,draftAccount:()=>'me@x.co',
  plan:async()=>({data:{reply:'ok',markets:['m'],territories:['t'],maxDrafts:2,qualify:'q',exclusions:[],searchQueries:[{query:'q1',market:'m',territory:'t'}]},cost:0,model:'fake'}),
  search:async()=>({via:'fake',costUsd:0,requestId:null,results:[
   {title:'<div class="logo__image',url:'https://awful-cloth-store.com/',text:'junk'},
   {title:'Beta | Shop',url:'https://beta.com/',text:'tees'},
   {title:'Alpha',url:'https://alpha.com/',text:'real'},
   {title:'Gamma',url:'https://gamma.com/',text:'real'},
   {title:'Delta',url:'https://delta.com/',text:'real'}]}),
  visit:async url=>{const d=new URL(url).hostname;return {via:'fake',sessionId:null,screenshot:null,domain:d,socials:withSocials.has(d)||d==='beta.com'?{instagram:`https://www.instagram.com/${d}/`}:{},pages:[{url,title:d,chars:1}],homeText:'Shop',contactText:'',emails:[{email:`sam.lee@${d}`,sourceUrl:url,excerpt:'x'}],best:{email:`sam.lee@${d}`,sourceUrl:url,excerpt:'x'}};},
  logo:goodLogo,
  value:async({lead})=>{valued.push(lead.domain);return lead.domain==='beta.com'?{data:{valueScore:30,verdict:'reject',reason:'print on demand shop'},cost:0.0002,model:'fake'}:keepValue();},
  score:async({lead})=>{graded.push(lead.domain);return {data:{company:lead.company,fitScore:80,decision:'pursue',reasons:['good'],risks:[],personalDetail:'d'},cost:0,model:'fake'};},
  draft:async({graded:g})=>({data:{subject:`Hi ${g.company}`,body:'Body'},cost:0,model:'fake'}),
  createDraft:async d=>{drafts.push(d);return {draftId:'d',messageId:'m',url:'https://mail.google.com/x'};},
  steer:async({currentPlan})=>({data:{reply:'ok',action:'continue',plan:currentPlan,skipDomains:[]},cost:0,model:'fake'}),
  ...over};
}

test('runner: rejects need no spend and do not count toward maxDrafts',async()=>{
 const store=openStore(':memory:');const tools=missionTools();const runner=createRunner(store,tools);
 const t=runner.start('find brands');await runner.wait(t.id);
 const by=Object.fromEntries(store.listLeads({taskId:t.id}).map(l=>[l.domain,l]));
 const awful=by['awful-cloth-store.com'];
 assert.equal(awful.status,'rejected');assert.equal(awful.notes,'No Instagram or TikTok linked from the site');assert.equal(awful.company,'Awful Cloth Store');
 assert.equal(by['beta.com'].status,'rejected');assert.equal(by['beta.com'].notes,'print on demand shop');
 assert.deepEqual(by['beta.com'].value.verdict,'reject');assert.equal(by['beta.com'].value.score,30);
 assert.equal(by['alpha.com'].status,'drafted');assert.equal(by['gamma.com'].status,'drafted');
 assert.equal(by['alpha.com'].value.verdict,'keep');assert.deepEqual(by['alpha.com'].socials,{instagram:'https://www.instagram.com/alpha.com/'});
 assert.equal(by['delta.com'],undefined,'maxDrafts 2 reached by the two kept brands, the two rejects did not use it up');
 assert.ok(!tools.valued.includes('awful-cloth-store.com'),'no grader call for a brand without socials');
 assert.deepEqual(tools.graded.sort(),['alpha.com','gamma.com']);
 assert.deepEqual(tools.drafts.map(d=>d.to).sort(),['sam.lee@alpha.com','sam.lee@gamma.com']);
 const events=store.listEvents({taskId:t.id});
 assert.ok(events.some(e=>e.type==='decision'&&e.title==='Skipped Awful Cloth Store: no Instagram or TikTok'));
 assert.ok(events.some(e=>e.type==='decision'&&/Skipped Beta: low-value brand \(30\/100\)/.test(e.title)));
 const spend=store.db.prepare("select note from spend where provider='claude'").all().map(r=>r.note);
 assert.ok(spend.includes('brand value check')&&spend.includes('logo check'));
 assert.match(store.getTask(t.id).summary,/2 draft\(s\).*2 rejected as low value/);
});

test('runner: a missing or fake logo rejects before the grader runs',async()=>{
 const store=openStore(':memory:');
 const tools=missionTools({logo:async({lead})=>lead.domain==='alpha.com'?{ok:false,reason:'No logo found',cost:0}:lead.domain==='gamma.com'?{ok:false,reason:'Logo failed the check: Shopify default',short:'logo is not a real brand mark',cost:0.0003,logo:{checked:true,isRealLogo:false}}:goodLogo()});
 const runner=createRunner(store,tools);await runner.wait(runner.start('go').id);
 const by=Object.fromEntries(store.listLeads().map(l=>[l.domain,l]));
 assert.equal(by['alpha.com'].status,'rejected');assert.equal(by['alpha.com'].notes,'No logo found');
 assert.equal(by['gamma.com'].status,'rejected');assert.equal(by['gamma.com'].value.logo.isRealLogo,false);
 assert.ok(!tools.valued.includes('alpha.com')&&!tools.valued.includes('gamma.com'));
 assert.ok(store.listEvents().some(e=>e.title==='Skipped Gamma: logo is not a real brand mark'));
});

async function api(store,requalifier){
 const server=http.createServer(createApp({store,runner:{start(){},control(){},steer(){},isRunning:()=>false},requalifier}));
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base=`http://127.0.0.1:${server.address().port}`;
 return {base,close:()=>new Promise(r=>server.close(r)),post:p=>fetch(base+p,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}).then(async r=>({status:r.status,body:await r.json()}))};
}

test('requalify route marks rejects only, lists their Gmail drafts, never deletes or calls Gmail, and 409s while running',async()=>{
 const store=openStore(':memory:');
 const mk=(domain,status,extra={})=>{const l=store.createLead({taskId:null,domain,company:extra.company||domain,url:`https://${domain}/`,market:'m',territory:'t',status,evidence:'ev'});return extra.fields?store.updateLead(l.id,extra.fields):l;};
 const keep=mk('keep.com','drafted'),bare=mk('bare.com','drafted',{company:'<div class="logo__image'}),nologo=mk('nologo.com','awaiting_video'),done=mk('done.com','skipped',{fields:{contact_kind:'personal',value:{score:90,verdict:'keep',reason:'x',checkedAt:'t'}}}),was=mk('was.com','rejected'),sent=mk('sent.com','contacted'),down=mk('down.com','skipped');
 const draftFor=(l,fields={})=>store.addDraft({leadId:l.id,taskId:null,to:`hi@${l.domain}`,subject:'s',body:'b',gmailDraftId:'gd'+l.id,gmailUrl:`https://mail.google.com/${l.id}`,status:'gmail_draft',...fields});
 draftFor(keep);const dBare=draftFor(bare);const dNoLogo=draftFor(nologo);const dHeld=draftFor(bare,{status:'waiting_video',gmailDraftId:null,gmailUrl:null});
 const page=(socials,links=[{href:'https://x.test/a',text:'a'}])=>({url:'https://x.test/',text:'Shop our collection',links,socials});
 const pages={'keep.com':page({instagram:'https://www.instagram.com/keep/'}),'bare.com':page({youtube:'https://www.youtube.com/@bare'}),'nologo.com':page({tiktok:'https://www.tiktok.com/@nologo'}),'down.com':null,'was.com':page({})};
 let release;const gate=new Promise(r=>{release=r;});const fetched=[],valued=[];
 const tools={
  fetchHome:async url=>{const d=new URL(url).hostname;fetched.push(d);await gate;const p=pages[d];if(!p)throw new Error('HTTP 403');return p;},
  logo:async({lead})=>lead.domain==='nologo.com'?{ok:false,reason:'No logo found',cost:0}:goodLogo(),
  value:async({lead,site,socials})=>{valued.push(lead.domain);assert.match(site.homeText,/Shop/);assert.ok(socials.instagram||socials.tiktok);return keepValue();},
  draftDm:async a=>({data:{subject:`Instagram DM to @${a.contact.handle}`,body:'dm'},cost:0,model:'fake'}),loadProfile:()=>({senderName:'Ryan',company:'Mint Labs',offer:'AI UGC',senderFact:'x',cta:'y',rules:'z'}),
  createDraft(){throw new Error('requalify must never call Gmail');},updateDraft(){throw new Error('no Gmail');},deleteDraft(){throw new Error('no Gmail');}
 };
 const app=await api(store,q.createRequalifier({store,tools}));
 try{
  const first=app.post('/api/leads/requalify');
  await new Promise(r=>setTimeout(r,30));
  assert.equal((await app.post('/api/leads/requalify')).status,409);
  release();
  const res=await first;
  assert.equal(res.status,200);
  const b=res.body;
  assert.equal(b.checked,3);assert.equal(b.kept,1);
  assert.deepEqual(b.rejected.map(r=>[r.id,r.company,r.reason]),[[bare.id,'Bare','No Instagram or TikTok linked from the site'],[nologo.id,'nologo.com','No logo found']]);
  assert.deepEqual(b.withdrawnDrafts.map(d=>[d.leadId,d.to,d.gmail_url]).sort((x,y)=>x[0]-y[0]),[[bare.id,'hi@bare.com',`https://mail.google.com/${bare.id}`],[nologo.id,'hi@nologo.com',`https://mail.google.com/${nologo.id}`]]);
  assert.deepEqual(b.unchecked.map(u=>u.id),[down.id]);assert.match(b.unchecked[0].reason,/HTTP 403/);
  assert.ok(!fetched.includes('done.com')&&!fetched.includes('was.com')&&!fetched.includes('sent.com'),'checked, already rejected and already contacted leads are left alone');
  assert.deepEqual(valued,['keep.com'],'rejected leads never reach the grader');
  const get=l=>store.getLead(l.id);
  assert.equal(get(keep).status,'drafted');assert.equal(get(keep).value.verdict,'keep');assert.deepEqual(get(keep).socials,{instagram:'https://www.instagram.com/keep/'});
  assert.equal(get(bare).status,'rejected');assert.equal(get(bare).company,'Bare');assert.equal(get(bare).value.verdict,'reject');
  assert.equal(get(nologo).status,'rejected');assert.equal(get(nologo).notes,'No logo found');
  assert.equal(get(sent).status,'contacted');assert.equal(store.listLeads().length,7,'no lead rows deleted');
  assert.equal(store.listDrafts().length,5,'no drafts deleted: the 4 originals plus the one Instagram DM written for keep.com');
  assert.equal(store.getDraft(dBare.id).status,'gmail_draft');assert.equal(store.getDraft(dHeld.id).status,'waiting_video');assert.equal(store.getDraft(dNoLogo.id).gmail_draft_id,'gd'+nologo.id);
  assert.equal(store.listEvents({leadId:bare.id}).filter(e=>e.type==='decision').length,1);
  assert.equal((await app.post('/api/leads/requalify')).body.checked,0,'a second run finds nothing new to check');
 }finally{await app.close();}
});

test('requalify converts a kept Instagram lead: one DM, the email withdrawn, no Gmail call, and a second run converts nothing',async()=>{
 const store=openStore(':memory:');
 const mk=(domain,status,handle)=>{const l=store.createLead({taskId:null,domain,company:domain,url:`https://${domain}/`,market:'m',territory:'t',status,evidence:'ev'});return store.updateLead(l.id,{fit_score:81,reasons:['good fit'],value:{score:90,verdict:'keep',reason:'x',checkedAt:'t'},contact_kind:'instagram',instagram_handle:handle});};
 const held=mk('held.com','awaiting_video','heldwear'),ready=mk('ready.com','drafted','readywear'),vid=mk('vid.com','drafted','vidwear'),dmAlready=mk('has.com','drafted','haswear'),sentOnly=mk('sentonly.com','contacted','sentwear');
 const email=(l,fields={})=>store.addDraft({leadId:l.id,taskId:null,to:`info@${l.domain}`,subject:'s',body:'b',gmailDraftId:'gd'+l.id,gmailUrl:`https://mail.google.com/${l.id}`,status:'gmail_draft',...fields});
 const eHeld=email(held,{status:'waiting_video',gmailDraftId:null,gmailUrl:null}),eReady=email(ready);
 const render=store.createRender({title:'v',endpoint:'e',input:{},leadId:vid.id});store.updateRender(render.id,{status:'completed',review:'approved'});
 const eVid=email(vid,{renderId:render.id});
 const existingDm=store.addDraft({leadId:dmAlready.id,taskId:null,to:'@haswear',subject:'dm',body:'dm',status:'crm_only',channel:'instagram_dm'});const eHas=email(dmAlready);
 store.addEvent({leadId:ready.id,type:'decision',tool:'claude.score (fake)',title:'Pursuing',data:{personalDetail:'hand-dyed linen'}});
 const written=[],gmail=[];
 const tools={
  loadProfile:()=>({senderName:'Ryan',company:'Mint Labs',offer:'AI UGC',senderFact:'x',cta:'y',rules:'z'}),
  draftDm:async a=>{written.push(a);return {data:{subject:`Instagram DM to @${a.contact.handle}`,body:`Hi ${a.graded.company}`},cost:0.002,model:'fake'};},
  fetchHome:async()=>{throw new Error('resolved leads are not fetched again');},
  createDraft:()=>{gmail.push('create');throw new Error('no Gmail');},updateDraft:()=>{gmail.push('update');throw new Error('no Gmail');},deleteDraft:()=>{gmail.push('delete');throw new Error('no Gmail');}
 };
 const rq=q.createRequalifier({store,tools});
 const out=await rq.run();
 assert.equal(gmail.length,0,'zero Gmail calls');
 assert.equal(out.convertedDrafts.length,3);
 assert.deepEqual(out.convertedDrafts.map(c=>c.handle).sort(),['heldwear','readywear','vidwear']);
 const dmOf=l=>store.listDrafts({leadId:l.id}).filter(d=>d.channel==='instagram_dm');
 assert.equal(dmOf(held).length,1);assert.equal(dmOf(held)[0].to_email,'@heldwear');assert.equal(dmOf(held)[0].status,'waiting_video');
 assert.equal(dmOf(ready)[0].status,'crm_only');assert.equal(dmOf(ready)[0].render_id,null);
 assert.equal(dmOf(vid)[0].status,'dm_ready');assert.equal(dmOf(vid)[0].render_id,render.id);
 assert.equal(out.convertedDrafts.find(c=>c.leadId===vid.id).draftId,dmOf(vid)[0].id);
 for(const d of [eHeld,eReady,eVid,eHas])assert.equal(store.getDraft(d.id).status,'withdrawn');
 assert.equal(store.getDraft(eReady.id).gmail_draft_id,'gd'+ready.id,'the Gmail draft id is kept for the record');
 assert.equal(dmOf(dmAlready).length,1,'a lead that already has a DM does not get a second one');assert.equal(store.getDraft(existingDm.id).status,'crm_only');
 assert.deepEqual(out.genericDrafts.map(d=>d.leadId).sort((a,b)=>a-b),[ready.id,vid.id,dmAlready.id].sort((a,b)=>a-b),'only drafts with a Gmail url are listed for hand deletion');
 assert.ok(out.genericDrafts.every(d=>d.gmail_url&&d.instagram));
 assert.equal(dmOf(sentOnly).length,0);
 assert.equal(written.length,3);assert.equal(written.find(w=>w.lead.id===ready.id).graded.personalDetail,'hand-dyed linen');
 assert.equal(written.find(w=>w.lead.id===held.id).graded.company,'held.com');assert.equal(written[0].profile.senderName,'Ryan');
 const ev=store.listEvents({leadId:ready.id}).find(e=>e.type==='draft');
 assert.equal(ev.tool,'instagram');assert.equal(ev.title,'Instagram DM for @readywear written. The old email to info@ready.com is withdrawn; delete its Gmail draft by hand.');
 assert.ok(!ev.title.includes(String.fromCharCode(8212)));
 assert.equal(store.db.prepare("select count(*) n from spend where provider='claude'").get().n,3);
 const again=await rq.run();
 assert.deepEqual([again.convertedDrafts.length,again.genericDrafts.length,again.checked],[0,0,0],'a second run converts nothing');
 assert.equal(written.length,3);assert.equal(store.listDrafts().filter(d=>d.channel==='instagram_dm').length,4);assert.equal(gmail.length,0);
});

test('a withdrawn draft is never listed as pending and cannot be marked sent',async()=>{
 const store=openStore(':memory:');
 const l=store.createLead({taskId:null,domain:'w.com',company:'W',url:'https://w.com/',market:'m',territory:'t',status:'drafted'});
 const d=store.addDraft({leadId:l.id,taskId:null,to:'info@w.com',subject:'s',body:'b',status:'withdrawn'});
 const app=await api(store,{});
 try{
  const res=await fetch(app.base+'/api/drafts').then(r=>r.json());
  assert.equal(res.drafts.length,0);
  assert.equal(store.markDraftSent(d.id).status,'withdrawn');assert.equal(store.getLead(l.id).status,'drafted');
 }finally{await app.close();}
});
