import {teracContext,elevenSubscription,elevenConfigured,whopAccount} from './connections.mjs';
import {higgsfieldMonthUsage} from './provider-usage.mjs';

// Real costs per provider. The spend ledger (store.spendSummary) holds the exact per-call dollars Mint recorded. Where a
// provider reports its own balance or usage through a documented API, that is merged in. Keys are never returned or logged.
//
// A current balance does not establish spending. Top-ups, refunds and other account activity need transaction history.
const PROVIDER_TTL=5*60000, FAIL_TTL=60000;
const money=n=>Number.isFinite(n)?Math.round(n*1e6)/1e6:null;
const NAMES={claude:'Claude',exa:'Exa',solari:'Solari',higgsfield:'Higgsfield',elevenlabs:'ElevenLabs',terac:'Terac',whop:'Whop'};
const ORDER=['terac','claude','higgsfield','exa','solari','elevenlabs','whop'];

export function createCosts({store,fetch=globalThis.fetch,now=()=>Date.now(),env=process.env}={}){
 const cache=new Map();
 // Runs one provider call at most once per TTL. A failure is remembered briefly and returned as {error}, never thrown.
 async function cached(key,refresh,fn){
  const hit=cache.get(key);
  if(!refresh&&hit&&now()-hit.at<hit.ttl)return hit.value;
  let value,ttl=PROVIDER_TTL;
  try{value={data:await fn(),checkedAt:new Date(now()).toISOString()};}
  catch(e){value={error:String(e?.message||e).replace(/\s+/g,' ').slice(0,200),checkedAt:new Date(now()).toISOString()};ttl=FAIL_TTL;}
  cache.set(key,{at:now(),ttl,value});
  return value;
 }
 const empty=(id,extra={})=>({id,name:NAMES[id]||id,spentUsd:null,todayUsd:null,balanceUsd:null,usage:null,detail:null,source:'ledger',checkedAt:new Date(now()).toISOString(),...extra});

 return {
  async get({refresh=false}={}){
   const summary=store?.spendSummary?.()||{providers:[]};
   const ledger=new Map(summary.providers.map(p=>[p.provider,p]));
   const calls=n=>`${n} recorded call${n===1?'':'s'}`;
   // Ledger amounts cover this app's recorded calls, never the entire provider account.
   const fromLedger=(id,detail)=>{const l=ledger.get(id);return empty(id,{spentUsd:l?.total>0?money(l.total):null,todayUsd:l?.total>0?money(l.today):null,recordedUsd:money(l?.total||0),coverage:l?.total>0?'partial':'unavailable',usage:calls(l?.count||0),detail});};

   const [terac,eleven,whop,higgsfield]=await Promise.all([
    env.TERAC_API_KEY?cached('terac',refresh,()=>teracContext(fetch,env)):null,
    elevenConfigured(env)?cached('eleven',refresh,()=>elevenSubscription(fetch,env)):null,
    env.WHOP_API_KEY?cached('whop',refresh,()=>whopAccount(fetch,env)):null,
    env.HF_CREDENTIALS?cached('higgsfield',refresh,()=>higgsfieldMonthUsage(fetch,env,new Date(now()))):null
   ]);

   const rows={};
   rows.claude=fromLedger('claude','Ledger only. The Usage and Cost Admin API needs an Anthropic admin key, which is not configured.');
   rows.exa=fromLedger('exa','Ledger only (Exa returns costDollars per request). Exa has no balance API for a normal key; its team API needs a service key.');
   rows.solari=fromLedger('solari','Ledger only. Solari documents no usage or balance endpoint.');
   rows.higgsfield=fromLedger('higgsfield','Only render estimates recorded by Mint are available. Earlier website or API spending is not synced. Higgsfield website credits and API dollars are separate accounts.');
   rows.higgsfield.billingUrl='https://open.higgsfield.ai/billing';
   if(higgsfield?.data){rows.higgsfield={...rows.higgsfield,source:'mixed',checkedAt:higgsfield.checkedAt,accountEstimateUsd:higgsfield.data.estimatedUsd,accountUsage:higgsfield.data,usage:'API usage estimate this month',detail:'API account usage this calendar month (UTC), estimated by Higgsfield. Can lag or differ from invoices. Website plan credits are separate. Not added to the Mint ledger subtotal.'};}
   else if(higgsfield?.error)rows.higgsfield.detail+=` Usage sync unavailable: ${higgsfield.error}`;

   // Terac's MCP context reports the current balance, not historical spending.
   if(!terac)rows.terac=empty('terac',{source:'provider',detail:'Add TERAC_API_KEY'});
   else if(terac.error)rows.terac=empty('terac',{source:'provider',checkedAt:terac.checkedAt,detail:`Terac unavailable: ${terac.error}`});
   else{
    const bal=terac.data.balance;
    rows.terac={...fromLedger('terac','Current credit balance verified. Account spending requires transaction history; top-ups and refunds cannot be inferred from the balance.'),source:'mixed',balanceUsd:money(bal),usage:`$${bal.toFixed(2)} credit remaining`,account:terac.data.orgSlug,checkedAt:terac.checkedAt};
   }

   // ElevenLabs: characters from the subscription, dollars from the ledger (the API gives no per-character price unless the plan invoice does).
   {
    const l=ledger.get('elevenlabs');
    const known=l&&l.total>0;
    const base={spentUsd:known?money(l.total):null,todayUsd:known?money(l.today):null,recordedUsd:money(l?.total||0),coverage:known?'partial':'unavailable',billingUrl:'https://elevenlabs.io/app/subscription'};
    if(!eleven)rows.elevenlabs=empty('elevenlabs',{...base,detail:'Add ELEVENLABS_API_KEY or ~/.elevenlabs/key'});
    else if(eleven.error)rows.elevenlabs=empty('elevenlabs',{...base,source:'ledger',checkedAt:eleven.checkedAt,usage:calls(l?.count||0),detail:`Usage unavailable: ${eleven.error}`});
    else{
     const s=eleven.data;
     const usageKnown=typeof s.used==='number'&&Number.isFinite(s.used)&&s.used>=0;
     rows.elevenlabs=empty('elevenlabs',{...base,source:'mixed',checkedAt:eleven.checkedAt,
      usage:usageKnown?`${s.used.toLocaleString('en-US')}${s.limit!=null?' of '+s.limit.toLocaleString('en-US'):''} characters used (${s.tier||'unknown'} plan)`:'Account usage unavailable',
      detail:`${usageKnown?'Account usage is verified.':'The subscription did not report usage.'} It is not a dollar charge: plans, included credits, rollover and overages differ. Earlier dollar spending is not synced; the amount shown covers priced Mint ledger entries only.`});
    }
   }

   // Whop is revenue, not a cost: shown as a detail and kept out of the totals.
   if(whop){
    rows.whop=empty('whop',{source:'provider',checkedAt:whop.checkedAt,detail:whop.error?`Earnings unavailable: ${whop.error}`:whop.data.earnedUsd!=null?`Customer payments, not a cost. Collected $${whop.data.earnedUsd.toFixed(2)}. Not in the totals.`:'Revenue, not a cost. Earnings not reported. Not in the totals.'});
   }

   // Any other provider the ledger knows about still shows up.
   for(const p of ledger.keys())if(!rows[p])rows[p]=fromLedger(p,'Ledger only.');

   const providers=[...ORDER.filter(id=>rows[id]).map(id=>rows[id]),...Object.keys(rows).filter(id=>!ORDER.includes(id)).map(id=>rows[id])];
   const counted=providers.filter(p=>p.id!=='whop');
   const sum=k=>money(summary.providers.reduce((s,p)=>s+(p[k]||0),0));
   return {allTimeUsd:sum('total'),todayUsd:sum('today'),coverage:'partial',basis:'Priced calls recorded by Mint only. Provider account totals and earlier spending are not fully synced.',unsyncedProviders:counted.filter(p=>p.coverage!=='complete').map(p=>p.id),providers};
  }
 };
}
