import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createCosts} from './costs.mjs';
import {createConnections,parseBalance,parseRpc} from './connections.mjs';

const ENV={ANTHROPIC_API_KEY:'k1',EXA_API_KEY:'k2',SOLARI_API_KEY:'k3',HF_CREDENTIALS:'a:b',WHOP_API_KEY:'apik_x',TERAC_API_KEY:'k6',ELEVENLABS_API_KEY:'k7'};
const ctx=bal=>`# Mint Labs\n\n- **Organization ID:** abc\n- **Slug:** mint-labs-x\n- **Balance:** $${bal}\n- **Add credit:** https://terac.com/x\n`;
const sse=obj=>new Response(`event: message\ndata: ${JSON.stringify(obj)}\n\n`,{status:200,headers:{'content-type':'text/event-stream','mcp-session-id':'sid-1'}});
const json=(o,status=200)=>new Response(JSON.stringify(o),{status,headers:{'content-type':'application/json'}});
// Routes by URL and records every call so tests can count them. `over` replaces a route; a function result can throw.
function stub(over={}){
 const calls=[];
 const routes={
  terac:async(url,init)=>{const b=JSON.parse(init.body);
   if(b.method==='initialize')return sse({jsonrpc:'2.0',id:1,result:{serverInfo:{name:'Terac'}}});
   if(b.method==='notifications/initialized')return new Response(null,{status:202});
   return sse({jsonrpc:'2.0',id:2,result:{content:[{type:'text',text:ctx('37.50')}]}});},
  eleven:async()=>json({tier:'pro',status:'active',character_count:1500,character_limit:10000}),
  whop:async()=>json({title:'Mint Labs',total_earned_usd:541.25}),
  claude:async()=>json({data:[]}),
  solari:async()=>json({ok:true,idle:4,busy:1}),
  gtoken:async()=>json({access_token:'at'}),
  gprofile:async()=>json({emailAddress:'a@b.edu'}),
  ...over
 };
 const fetch=async(url,init={})=>{
  const u=String(url);calls.push({u,init});
  const k=u.includes('terac.com')?'terac':u.includes('elevenlabs')?'eleven':u.includes('whop.com')?'whop':u.includes('anthropic')?'claude':u.includes('getsolari')?'solari':u.includes('oauth2')?'gtoken':u.includes('gmail.googleapis')?'gprofile':null;
  if(!k)throw Error(`unexpected url ${u}`);
  return routes[k](u,init);
 };
 return {fetch,calls,count:s=>calls.filter(c=>c.u.includes(s)).length};
}
const store=(providers=[])=>({spendSummary:()=>({total:providers.reduce((s,p)=>s+p.total,0),today:0,providers})});
const ledger=[{provider:'claude',total:1.5,today:0.5,count:10},{provider:'exa',total:0.25,today:0.25,count:3}];
const clock=()=>{let t=1_700_000_000_000;const f=()=>t;f.advance=ms=>{t+=ms;};return f;};
const byId=r=>Object.fromEntries(r.map(p=>[p.id,p]));

test('parseBalance reads the Balance line and ignores a missing one',()=>{
 assert.equal(parseBalance(ctx('100.00')),100);
 assert.equal(parseBalance('- **Balance:** $1,234.50'),1234.5);
 assert.equal(parseBalance('no money here'),null);
 assert.deepEqual(parseRpc('event: message\ndata: {"id":2}\n\n'),{id:2});
 assert.deepEqual(parseRpc('{"id":3}'),{id:3});
});

test('Terac reads a verified balance without inferring spending from an assumed starting credit',async()=>{
 const s=stub();
 const out=await createCosts({store:store(ledger),fetch:s.fetch,env:ENV}).get();
 const t=byId(out.providers).terac;
 assert.equal(t.balanceUsd,37.5);
 assert.equal(t.spentUsd,null);
 assert.equal(t.source,'mixed');
 const terac=s.calls.filter(c=>c.u.includes('terac.com'));
 assert.deepEqual(terac.map(c=>JSON.parse(c.init.body).method),['initialize','notifications/initialized','tools/call']);
 assert.equal(JSON.parse(terac[2].init.body).params.name,'terac_get_context');
 assert.equal(terac[0].init.headers['x-api-key'],'k6');
 assert.equal(terac[1].init.headers['mcp-session-id'],'sid-1');
 assert.equal(terac[2].init.headers['mcp-session-id'],'sid-1');
});

test('partial totals include only priced ledger entries and exclude balances and Whop revenue',async()=>{
 const out=await createCosts({store:store(ledger),fetch:stub().fetch,env:ENV}).get();
 assert.equal(out.allTimeUsd,1.75);assert.equal(out.coverage,'partial');assert.ok(out.unsyncedProviders.includes('higgsfield'));
 assert.equal(out.todayUsd,0.75);
 const w=byId(out.providers).whop;
 assert.equal(w.spentUsd,null);
 assert.match(w.detail,/541\.25/);
 const c=byId(out.providers);
 assert.equal(c.claude.spentUsd,1.5);
 assert.equal(c.claude.source,'ledger');
 assert.match(c.claude.detail,/admin key/i);
 assert.equal(c.higgsfield.spentUsd,null);
 assert.match(c.elevenlabs.usage,/1,500 of 10,000 characters/);
 assert.equal(c.elevenlabs.source,'mixed');
 assert.equal(c.elevenlabs.spentUsd,null);
});

test('top-ups cannot turn an unknown spending total into a confirmed zero',async()=>{
 const s=stub({terac:async(u,i)=>{const b=JSON.parse(i.body);return b.method==='tools/call'?sse({jsonrpc:'2.0',id:2,result:{content:[{type:'text',text:ctx('250.00')}]}}):b.method==='initialize'?sse({jsonrpc:'2.0',id:1,result:{serverInfo:{name:'Terac'}}}):new Response(null,{status:202});}});
 const t=byId((await createCosts({store:store(),fetch:s.fetch,env:ENV}).get()).providers).terac;
 assert.equal(t.spentUsd,null);assert.equal(t.balanceUsd,250);assert.match(t.detail,/top-ups/i);
});

test('provider calls are cached for 5 minutes and refresh bypasses the cache',async()=>{
 const s=stub(),now=clock(),costs=createCosts({store:store(ledger),fetch:s.fetch,now,env:ENV});
 await costs.get();await costs.get();
 assert.equal(s.count('terac.com'),3);assert.equal(s.count('elevenlabs'),1);assert.equal(s.count('whop.com'),1);
 now.advance(4*60000);await costs.get();
 assert.equal(s.count('terac.com'),3);
 now.advance(2*60000);await costs.get();
 assert.equal(s.count('terac.com'),6);
 await costs.get({refresh:true});
 assert.equal(s.count('terac.com'),9);assert.equal(s.count('elevenlabs'),3);
});

test('the ledger is read fresh on every call even when provider data is cached',async()=>{
 let rows=ledger;const st={spendSummary:()=>({providers:rows})};
 const costs=createCosts({store:st,fetch:stub().fetch,env:ENV});
 assert.equal(byId((await costs.get()).providers).claude.spentUsd,1.5);
 rows=[{provider:'claude',total:2,today:2,count:11}];
 assert.equal(byId((await costs.get()).providers).claude.spentUsd,2);
});

test('a failing provider gives null values and a detail, never an exception',async()=>{
 const s=stub({terac:async()=>{throw Error('network down');},eleven:async()=>json({detail:'bad'},401),whop:async()=>json({},500)});
 const out=await createCosts({store:store(ledger),fetch:s.fetch,env:ENV}).get();
 const p=byId(out.providers);
 assert.equal(p.terac.spentUsd,null);assert.equal(p.terac.balanceUsd,null);assert.match(p.terac.detail,/network down/);
 assert.match(p.elevenlabs.detail,/401/);
 assert.match(p.whop.detail,/500/);
 assert.equal(out.allTimeUsd,1.75);
 assert.equal(JSON.stringify(out).includes('k6'),false);
});

test('a Terac reply with no Balance line is a failure, and failures are retried after a minute',async()=>{
 let bad=true;
 const s=stub({terac:async(u,i)=>{const b=JSON.parse(i.body);if(b.method==='initialize')return sse({jsonrpc:'2.0',id:1,result:{serverInfo:{name:'Terac'}}});if(b.method==='notifications/initialized')return new Response(null,{status:202});return sse({jsonrpc:'2.0',id:2,result:{content:[{type:'text',text:bad?'no balance':ctx('90.00')}]}});}});
 const now=clock(),costs=createCosts({store:store(),fetch:s.fetch,now,env:ENV});
 assert.match(byId((await costs.get()).providers).terac.detail,/no Balance/);
 bad=false;now.advance(30000);
 assert.equal(byId((await costs.get()).providers).terac.balanceUsd,null);
 now.advance(40000);
 assert.equal(byId((await costs.get()).providers).terac.balanceUsd,90);
});

test('without keys the providers report what to add and nothing is fetched',async()=>{
 const s=stub();
 const out=await createCosts({store:store(),fetch:s.fetch,env:{ELEVENLABS_KEY_FILE:'/nonexistent/key'}}).get();
 assert.equal(s.calls.length,0);
 const p=byId(out.providers);
 assert.match(p.terac.detail,/TERAC_API_KEY/);assert.equal(p.terac.spentUsd,null);
 assert.equal(p.whop,undefined);
 assert.equal(out.allTimeUsd,0);
});
test('a subscription missing its usage count never claims zero usage or verified usage',async()=>{
 const out=await createCosts({store:store(),env:ENV,fetch:stub({eleven:async()=>json({tier:'pro',character_limit:610000})}).fetch}).get();
 const row=byId(out.providers).elevenlabs;assert.equal(row.spentUsd,null);assert.equal(row.usage,'Account usage unavailable');assert.doesNotMatch(row.detail,/usage is verified/);
});

test('connections return the health shape for all eight services and cover each check',async()=>{
 const s=stub(),now=clock();
 const fetch=async(u,i)=>{now.advance(5);return s.fetch(u,i);};
 const rows=await createConnections({fetch,now,env:ENV,tokenPath:'/t.json',readFile:()=>JSON.stringify({client_id:'c',client_secret:'s',refresh_token:'r'}),exists:()=>true}).get();
 assert.deepEqual(rows.map(r=>r.id),['claude','exa','solari','gmail','higgsfield','whop','elevenlabs','terac']);
 for(const r of rows){
  assert.deepEqual(Object.keys(r).sort(),['checkedAt','detail','id','name','ok','on','verification','latencyMs'].sort());
  assert.equal(r.on,true);assert.equal(r.ok,true,r.id);assert.equal(typeof r.detail,'string');assert.ok(!Number.isNaN(Date.parse(r.checkedAt)));
 }
 const c=byId(rows);
 assert.equal(c.exa.latencyMs,null);assert.match(c.exa.detail,/paid search/);
 assert.equal(c.higgsfield.latencyMs,null);
 assert.ok(c.claude.latencyMs>0);
 assert.match(c.gmail.detail,/a@b\.edu/);
 assert.equal(s.calls.find(x=>x.u.includes('anthropic')).init.headers['x-api-key'],'k1');
 assert.equal(s.count('terac.com'),1);
 assert.equal(JSON.stringify(rows).includes('apik_x'),false);
});

test('connections report a failing service as on but not ok, and a missing key as off',async()=>{
 const s=stub({claude:async()=>json({},401),terac:async()=>{throw Error('boom');}});
 const env={...ENV};delete env.WHOP_API_KEY;
 const rows=byId(await createConnections({fetch:s.fetch,env,tokenPath:'/t.json',exists:()=>false}).get());
 assert.deepEqual([rows.claude.on,rows.claude.ok],[true,false]);assert.match(rows.claude.detail,/401/);
 assert.deepEqual([rows.terac.on,rows.terac.ok],[true,false]);assert.match(rows.terac.detail,/boom/);
 assert.deepEqual([rows.whop.on,rows.whop.ok,rows.whop.latencyMs],[false,false,null]);assert.match(rows.whop.detail,/WHOP_API_KEY/);
 assert.equal(rows.gmail.on,false);
});

test('connections cache for 60 seconds and refresh bypasses it',async()=>{
 const s=stub(),now=clock(),conn=createConnections({fetch:s.fetch,now,env:ENV,exists:()=>false});
 await conn.get();await conn.get();
 assert.equal(s.count('anthropic'),1);
 now.advance(59000);await conn.get();assert.equal(s.count('anthropic'),1);
 now.advance(2000);await conn.get();assert.equal(s.count('anthropic'),2);
 await conn.get({refresh:true});assert.equal(s.count('anthropic'),3);
});
