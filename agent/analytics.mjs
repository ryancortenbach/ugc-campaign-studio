import {amountOf,whopEnabled} from './tools/whop.mjs';

const MINT_ACCOUNT='biz_Fj9QjiVTYUDda8';
export function normalizeRevenuePayment(p={}){
 const gross=amountOf(p.total),tax=Math.min(gross,Math.max(0,amountOf(p.tax_amount))),refund=p.auto_refunded===true||/^(?:(?:fully|auto)_)?refunded$/i.test(p.substatus||'')?gross:amountOf(p.refunded_amount),currency=String(p.total?.currency||p.currency||'').toLowerCase();
 return {id:p.id,status:p.status,paid:p.status==='paid'&&!/disput|void|fail/i.test(p.substatus||''),refunded:refund>=gross,amount:Math.max(0,(gross-tax)*(gross>0?1-Math.min(refund,gross)/gross:0)),collectedAmount:Math.max(0,gross-refund),taxAmount:Math.max(0,tax*(gross>0?1-Math.min(refund,gross)/gross:0)),grossAmount:gross,refundAmount:refund,estimatedRefundTax:tax>0&&refund>0&&refund<gross,currency,paidAt:p.paid_at||null,createdAt:p.created_at||null,product:p.product?.title||(p.line_items||[])[0]?.product_title||'Whop purchase'};
}
export async function readRevenuePage({after,first=100,request=fetch,env=process.env}={}){
 if(!/^apik_\S+$/.test(env.WHOP_API_KEY||''))throw Error('Whop is not connected');
 const account=env.WHOP_ACCOUNT_ID||MINT_ACCOUNT,qs=new URLSearchParams({account_id:account,first:String(first),order:'created_at',direction:'desc'});if(after)qs.set('after',after);
 const r=await request(`https://api.whop.com/api/v1/payments?${qs}`,{method:'GET',headers:{Authorization:`Bearer ${env.WHOP_API_KEY}`,Accept:'application/json'},signal:AbortSignal.timeout(20000)});
 if(!r.ok)throw Error(`Payment history unavailable (${r.status})`);const body=await r.json();if(!Array.isArray(body.data))throw Error('Invalid payment history');
 if(typeof body.page_info?.has_next_page!=='boolean'||(body.page_info.has_next_page&&(typeof body.page_info.end_cursor!=='string'||!body.page_info.end_cursor.trim())))throw Error('Incomplete payment pagination');
 return {payments:body.data.filter(p=>!p.company?.id||p.company.id===account).map(normalizeRevenuePayment),next:body.page_info?.has_next_page?body.page_info.end_cursor:null};
}
const ZONE='America/New_York';
const round=n=>Math.round(n*1000000)/1000000;
const parts=(d,zone)=>Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(d).filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)]));
function midnight(y,m,d,zone){let t=Date.UTC(y,m-1,d);for(let i=0;i<3;i++){const p=parts(new Date(t),zone);t+=Date.UTC(y,m-1,d)-Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second);}return new Date(t);}
const localDate=(date,zone)=>{const p=parts(date,zone);return new Date(Date.UTC(p.year,p.month-1,p.day));};
export function analyticsPeriod(range='today',now=new Date(),zone=ZONE){
 if(!['today','week','month','year'].includes(range))throw Object.assign(Error('Choose today, week, month or year.'),{status:400});
 const p=parts(now,zone),start=localDate(now,zone);
 if(range==='week')start.setUTCDate(start.getUTCDate()-(start.getUTCDay()+6)%7);
 if(range==='month')start.setUTCDate(1);
 if(range==='year'){start.setUTCMonth(0,1);}
 const from=midnight(start.getUTCFullYear(),start.getUTCMonth()+1,start.getUTCDate(),zone),buckets=[];
 if(range==='today'){
  for(let at=new Date(from);at<=now;at=new Date(+at+3600000))buckets.push({from:at.toISOString(),label:new Intl.DateTimeFormat('en-US',{timeZone:zone,hour:'numeric',timeZoneName:'short'}).format(at)});
 }else{
  for(let day=new Date(start);day<=localDate(now,zone);range==='year'?day.setUTCMonth(day.getUTCMonth()+1):day.setUTCDate(day.getUTCDate()+1)){
   const at=midnight(day.getUTCFullYear(),day.getUTCMonth()+1,day.getUTCDate(),zone);
   buckets.push({from:at.toISOString(),label:new Intl.DateTimeFormat('en-US',{timeZone:zone,month:'short',...(range==='year'?{}:{day:'numeric'})}).format(at)});
  }
 }
 return {range,timeZone:zone,from:from.toISOString(),to:now.toISOString(),series:buckets.map((b,i)=>({...b,to:buckets[i+1]?.from||now.toISOString(),revenue:0,spend:0,orders:0,brands:0,drafts:0}))};
}
function paymentFact(p){
 if(p.paid!==true||p.refunded||p.status!=='paid')return {skip:'not_paid'};
 if(String(p.currency||'').toLowerCase()!=='usd')return {skip:'currency'};
 const amount=Number(p.amount);if(!Number.isFinite(amount)||amount<=0)return {skip:'amount'};
 const at=p.paidAt||p.createdAt;
 if(!at||!Number.isFinite(Date.parse(at)))return {skip:'timestamp'};
 return {id:p.id,at,amount,product:p.product||'Whop purchase',refundAmount:p.refundAmount||0,collectedAmount:p.collectedAmount??amount,taxAmount:p.taxAmount||0,estimatedRefundTax:Boolean(p.estimatedRefundTax),dateBasis:p.paidAt?'paid':'created'};
}
export function summarizeAnalytics({range='today',now=new Date(),timeZone=ZONE,payments=[],spend=[],leads=[],drafts=[],coverage={status:'unavailable'}}={}){
 const out=analyticsPeriod(range,now,timeZone),start=Date.parse(out.from),end=Date.parse(out.to),seen=new Set(),orders=[],providers=new Map(),excluded={currency:0,timestamp:0,amount:0},inRange=at=>{const t=Date.parse(at);return Number.isFinite(t)&&t>=start&&t<=end;};
 const add=(at,key,value)=>{const t=Date.parse(at);for(let i=out.series.length-1;i>=0;i--)if(t>=Date.parse(out.series[i].from)){out.series[i][key]+=value;break;}};
 for(const p of payments){if(!p.id||seen.has(p.id))continue;seen.add(p.id);const f=paymentFact(p);if(f.skip){if(f.skip in excluded)excluded[f.skip]++;continue;}if(!inRange(f.at))continue;orders.push(f);add(f.at,'revenue',f.amount);add(f.at,'orders',1);}
 for(const row of spend){const v=Number(row.usd);if(!inRange(row.at)||!Number.isFinite(v)||v<0)continue;add(row.at,'spend',v);const key=row.provider||'other';providers.set(key,(providers.get(key)||0)+v);}
 for(const row of leads)if(inRange(row.at))add(row.at,'brands',1);
 for(const row of drafts)if(inRange(row.at))add(row.at,'drafts',1);
 const sum=key=>round(out.series.reduce((n,b)=>n+b[key],0)),known=['live','cached','stale'].includes(coverage.status);
 out.series=out.series.map(b=>({...b,revenue:known?round(b.revenue):null,spend:round(b.spend)}));
 return {...out,updatedAt:now.toISOString(),totals:{revenue:known?sum('revenue'):null,collected:known?round(orders.reduce((n,o)=>n+o.collectedAmount,0)):null,tax:known?round(orders.reduce((n,o)=>n+o.taxAmount,0)):null,orders:known?orders.length:null,spend:sum('spend'),brands:sum('brands'),drafts:sum('drafts')},providers:[...providers].map(([id,usd])=>({id,usd:round(usd)})).sort((a,b)=>b.usd-a.usd),orders:orders.sort((a,b)=>Date.parse(b.at)-Date.parse(a.at)).slice(0,12),coverage:{...coverage,excluded,createdDateFallback:orders.filter(o=>o.dateBasis==='created').length,estimatedRefundTax:orders.filter(o=>o.estimatedRefundTax).length,revenueBasis:'USD sales excluding reported tax, after refunds and before processing fees. For partially refunded taxable payments, tax is allocated proportionally and flagged as an estimate. Disputed payments excluded. Payment time when available; otherwise creation time.',spendBasis:'Recorded app spend. Provider balances and unrecorded expenses are excluded.'}};
}
export function createAnalytics({store,payments=readRevenuePage,configured=whopEnabled,now=()=>new Date(),timeZone=ZONE,ttlMs=300000}={}){
 let cached=null,inFlight=null,lastFailure=null;
 async function sync(){
  if(inFlight)return inFlight;
  inFlight=(async()=>{const all=[],cursors=new Set();let after=null;
   for(let page=0;page<200;page++){
    const r=await payments({after,first:100});if(!Array.isArray(r.payments))throw Error('Invalid payment history');all.push(...r.payments);
    if(!r.next){cached={payments:all,at:now().toISOString()};lastFailure=null;return;}
    if(cursors.has(r.next))throw Error('Payment history cursor repeated');cursors.add(r.next);after=r.next;
   }
   throw Error('Payment history is incomplete');
  })().catch(()=>{lastFailure=now().toISOString();}).finally(()=>{inFlight=null;});
  return inFlight;
 }
 return {async get({range='today',refresh=false}={}){
  analyticsPeriod(range,now(),timeZone);
  if(configured()&&(refresh||!cached||+now()-Date.parse(cached.at)>ttlMs))await sync();
  const coverage={status:!configured()?'unavailable':lastFailure?(cached?'stale':'unavailable'):cached?(refresh?'live':'cached'):'unavailable',syncedAt:cached?.at||null,source:'Whop payments',reason:!configured()?'Whop is not connected':lastFailure?'Payment history could not be refreshed':null};
  return summarizeAnalytics({range,now:now(),timeZone,payments:cached?.payments||[],coverage,spend:store.db.prepare('select at,provider,usd from spend').all(),leads:store.db.prepare('select created_at at from leads').all(),drafts:store.db.prepare("select created_at at from drafts where status!='withdrawn'").all()});
 }};
}
