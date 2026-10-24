// Documented read-only account usage. Higgsfield estimates are not invoices or website-credit spending.
export async function higgsfieldMonthUsage(fetch,env=process.env,now=new Date()){
 if(!/^[^:\s]+:[^:\s]+$/.test(env.HF_CREDENTIALS||''))throw Error('Higgsfield API credentials are not configured');
 const start=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),1)),seen=new Set();let page=1,total=null,cost=0,requests=0,today=0;
 const models=new Map(),day=now.toISOString().slice(0,10);
 for(;;){
  const url=new URL('https://api.higgsfield.ai/models/usage');
  for(const [k,v] of Object.entries({start:start.toISOString(),end:now.toISOString(),timeframe:'day',bound_to_timeframe:'false',expand:'time_series',page:String(page),limit:'100'}))url.searchParams.set(k,v);
  const response=await fetch(url,{headers:{Authorization:`Key ${env.HF_CREDENTIALS}`},signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error(`Higgsfield usage failed with HTTP ${response.status}`);
  const data=await response.json();
  if(!Array.isArray(data.time_series)||!Number.isInteger(data.total)||data.total<0||data.page!==page||!Number.isInteger(data.limit)||data.limit<1)throw Error('Higgsfield usage pagination is incomplete');
  if(total===null)total=data.total;else if(total!==data.total)throw Error('Higgsfield usage changed during pagination. Refresh to retry.');
  for(const bucket of data.time_series){
   if(typeof bucket.bucket!=='string'||!/^\d{4}-\d{2}-\d{2}T/.test(bucket.bucket)||!Array.isArray(bucket.results)||seen.has(bucket.bucket))throw Error('Higgsfield returned an invalid or repeated usage bucket');
   const stamp=Date.parse(/[zZ]|[+-]\d\d:\d\d$/.test(bucket.bucket)?bucket.bucket:bucket.bucket+'Z');
   if(!Number.isFinite(stamp)||new Date(stamp).toISOString().slice(0,10)!==bucket.bucket.slice(0,10)||stamp<start.getTime()||stamp>now.getTime())throw Error('Higgsfield returned usage outside the requested month');
   seen.add(bucket.bucket);
   for(const row of bucket.results){
    if(row.currency!=='USD'||row.cost===null||row.cost===''||!Number.isFinite(Number(row.cost))||Number(row.cost)<0)throw Error('Higgsfield usage includes an unknown cost or currency');
    const usd=Number(row.cost);cost+=usd;if(bucket.bucket.slice(0,10)===day)today+=usd;
    if(row.quantity!==null&&row.quantity!==''&&Number.isFinite(Number(row.quantity)))requests+=Number(row.quantity);
    models.set(row.model,(models.get(row.model)||0)+usd);
   }
  }
  if(seen.size===total)break;
  if(!data.time_series.length||seen.size>total||page>=100)throw Error('Higgsfield usage history is incomplete');
  page++;
 }
 return {estimatedUsd:Number(cost.toFixed(6)),todayEstimatedUsd:Number(today.toFixed(6)),requests,start:start.toISOString(),end:now.toISOString(),timeZone:'UTC',scope:'API account this month',models:[...models].map(([model,usd])=>({model,usd:Number(usd.toFixed(6))}))};
}
