import test from 'node:test';
import assert from 'node:assert/strict';
import {analyticsPeriod,summarizeAnalytics,createAnalytics,normalizeRevenuePayment,readRevenuePage} from './analytics.mjs';
import {openStore} from './store.mjs';
const now=new Date('2026-10-24T18:00:00Z');
const payment=(id,amount,paidAt,extra={})=>({id,amount,paidAt,status:'paid',paid:true,currency:'usd',...extra});
test('calendar periods follow New York midnight, Monday and the first of the month',()=>{
 assert.equal(analyticsPeriod('today',now).from,'2026-10-24T04:00:00.000Z');
 assert.equal(analyticsPeriod('week',now).from,'2026-10-19T04:00:00.000Z');
 assert.equal(analyticsPeriod('month',now).from,'2026-10-01T04:00:00.000Z');
 assert.equal(analyticsPeriod('year',now).from,'2026-01-01T05:00:00.000Z');
 assert.equal(analyticsPeriod('today',new Date('2026-03-09T03:59:59Z')).series.length,23);
 assert.equal(analyticsPeriod('today',new Date('2026-11-02T04:59:59Z')).series.length,25);
});
test('paid USD revenue is deduplicated and independent of fulfillment, future rows and refunds excluded',()=>{
 const p=[payment('1',100,'2026-10-24T10:00:00Z',{state:'failed'}),payment('1',100,'2026-10-24T10:00:00Z'),payment('2',50,'2026-10-24T11:00:00Z',{refunded:true}),payment('3',20,'2026-10-24T11:00:00Z',{currency:'eur'}),payment('4',30,'2026-10-25T00:00:00Z'),payment('5',40,'2026-10-23T23:00:00Z'),payment('6',5,null)];
 const out=summarizeAnalytics({now,payments:p,coverage:{status:'live'},spend:[{at:'2026-10-24T09:00:00Z',provider:'claude',usd:.62},{at:'2026-10-25T02:00:00Z',provider:'claude',usd:4}]});
 assert.equal(out.totals.revenue,100);assert.equal(out.totals.orders,1);assert.equal(out.totals.spend,.62);assert.equal(out.coverage.excluded.currency,1);assert.equal(out.coverage.excluded.timestamp,1);
});
test('unknown revenue stays null, verified empty history is zero',()=>{
 assert.equal(summarizeAnalytics({now}).totals.revenue,null);
 assert.equal(summarizeAnalytics({now,coverage:{status:'live'}}).totals.revenue,0);
});
test('complete pagination is cached; a failed refresh retains stale complete history, never partial totals',async()=>{
 const store=openStore(':memory:');let calls=0,fail=false;
 const analytics=createAnalytics({store,now:()=>now,configured:()=>true,payments:async({after})=>{calls++;if(fail)throw Error('offline');return after?{payments:[payment('2',5,'2026-10-24T15:00:00Z')],next:null}:{payments:[payment('1',10,'2026-10-24T12:00:00Z')],next:'next'};}});
 const a=await analytics.get();assert.equal(calls,2);assert.equal(a.totals.revenue,15);await analytics.get({range:'month'});assert.equal(calls,2);
 fail=true;const b=await analytics.get({refresh:true});assert.equal(b.coverage.status,'stale');assert.equal(b.totals.revenue,15);
});
test('unconfigured analytics never calls Whop and reads actual local ledger counts',async()=>{
 const store=openStore(':memory:');store.db.prepare('insert into spend(at,provider,usd) values(?,?,?)').run('2026-10-24T10:00:00Z','exa',.12);
 const analytics=createAnalytics({store,configured:()=>false,now:()=>now,payments:()=>{throw Error('must not call');}});
 const a=await analytics.get();assert.equal(a.totals.spend,.12);assert.equal(a.coverage.status,'unavailable');assert.equal(a.totals.revenue,null);
 await assert.rejects(analytics.get({range:'invalid'}),{status:400});
});


test('partial refunds reduce revenue; failed or fully refunded payments do not count',()=>{
 const partial=normalizeRevenuePayment({id:'a',status:'paid',substatus:'partially_refunded',total:{amount:'100',currency:'usd'},refunded_amount:'25',paid_at:'2026-10-24T12:00:00Z'});
 const full=normalizeRevenuePayment({id:'b',status:'paid',total:100,currency:'usd',refunded_amount:100,paid_at:'2026-10-24T12:00:00Z'});
 const out=summarizeAnalytics({now,payments:[partial,full],coverage:{status:'live'}});assert.equal(out.totals.revenue,75);assert.equal(out.orders[0].refundAmount,25);
});
test('read-only revenue requests are scoped to Mint Labs and discard other businesses',async()=>{
 const prior=process.env.WHOP_API_KEY;process.env.WHOP_API_KEY='apik_test';
 try{
  const result=await readRevenuePage({env:{WHOP_API_KEY:'apik_test'},request:async(url,opts)=>{
   assert.equal(opts.method,'GET');assert.equal(new URL(url).searchParams.get('account_id'),'biz_Fj9QjiVTYUDda8');
   return Response.json({data:[{id:'mint',company:{id:'biz_Fj9QjiVTYUDda8'}},{id:'other',company:{id:'biz_other'}}],page_info:{has_next_page:false}});
  }});assert.deepEqual(result.payments.map(p=>p.id),['mint']);
 }finally{if(prior===undefined)delete process.env.WHOP_API_KEY;else process.env.WHOP_API_KEY=prior;}
});


test('full refund flags cannot inflate revenue when the refund amount is absent',()=>{
 for(const flags of [{substatus:'refunded'},{substatus:'fully_refunded'},{substatus:'auto_refunded'},{auto_refunded:true}]){
  const p=normalizeRevenuePayment({id:'refund',status:'paid',total:100,currency:'usd',paid_at:'2026-10-24T12:00:00Z',...flags});
  assert.equal(p.amount,0);assert.equal(p.refunded,true);
 }
});
test('malformed pagination is rejected instead of converting a partial page into known revenue',async()=>{
 for(const page_info of [undefined,{}, {has_next_page:true,end_cursor:null},{has_next_page:true,end_cursor:''},{has_next_page:'false'}]){
  await assert.rejects(readRevenuePage({env:{WHOP_API_KEY:'apik_test'},request:async()=>Response.json({data:[{id:'partial',total:100,currency:'usd',status:'paid'}],page_info})}),/pagination/);
 }
 const store=openStore(':memory:');
 const a=createAnalytics({store,configured:()=>true,now:()=>now,payments:()=>readRevenuePage({env:{WHOP_API_KEY:'apik_test'},request:async()=>Response.json({data:[{id:'partial',total:100,currency:'usd',status:'paid'}],page_info:{has_next_page:true,end_cursor:null}})})});
 const result=await a.get();assert.equal(result.totals.revenue,null);assert.equal(result.coverage.status,'unavailable');
});


test('sales revenue excludes sales tax while customer payments remain separately reported',()=>{
 const p=[normalizeRevenuePayment({id:'a',status:'paid',substatus:'succeeded',total:{amount:'541.25',currency:'usd'},subtotal:{amount:'500',currency:'usd'},tax_amount:{amount:'41.25',currency:'usd'},paid_at:'2026-10-24T12:00:00Z'}),normalizeRevenuePayment({id:'b',status:'paid',total:500,tax_amount:0,currency:'usd',paid_at:'2026-10-24T13:00:00Z'})];
 const out=summarizeAnalytics({now,payments:p,coverage:{status:'live'}});assert.equal(out.totals.revenue,1000);assert.equal(out.totals.collected,1041.25);assert.equal(out.totals.tax,41.25);
});
test('partial taxable refunds disclose proportional tax allocation as an estimate',()=>{
 const p=normalizeRevenuePayment({id:'a',status:'paid',substatus:'partially_refunded',total:110,tax_amount:10,refunded_amount:55,currency:'usd',paid_at:'2026-10-24T12:00:00Z'});
 const out=summarizeAnalytics({now,payments:[p],coverage:{status:'live'}});assert.equal(out.totals.revenue,50);assert.equal(out.totals.tax,5);assert.equal(out.totals.collected,55);assert.equal(out.coverage.estimatedRefundTax,1);
});
