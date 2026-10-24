import {test}from'node:test';import assert from'node:assert/strict';import {calculate}from'./finance.js';
test('funnel, refunds and unit economics reconcile',()=>{const r=calculate({viewsPerPost:1000});assert.equal(r.posts,300);assert.equal(r.views,300000);assert.equal(r.visits,900);assert.equal(r.teeOrders,8.1);assert.ok(Math.abs(r.teeNet-r.teeGross*.95)<.0001);assert.ok(Math.abs(r.operatingProfit-(r.teeContribution+r.courseContribution+r.brandContribution-r.sharedContentCost-r.overhead))<.00001);});
test('retry cost and daily delivery scale correctly',()=>{const a=calculate({firstPassYield:.5,reuseFraction:0}),b=calculate({firstPassYield:1,reuseFraction:0});assert.equal(a.generationPerPost,b.generationPerPost*2);const c=calculate({brandClients:1}),d=calculate({brandClients:2});assert.equal(d.brandDelivery,c.brandDelivery*2);});
test('no traffic yields no tee or course sales, negative margins have no break-even',()=>{const r=calculate({viewsPerPost:0,brandPrice:10});assert.equal(r.teeOrders,0);assert.equal(r.courseOrders,0);assert.equal(r.brandBreakEven,null);assert.ok(Number.isFinite(r.operatingProfit));});
test('tee unit margin stays consistent at zero volume and review savings are explicit assumptions',()=>{const a=calculate({viewsPerPost:0}),b=calculate({viewsPerPost:1000});assert.ok(Math.abs(a.teeUnitMargin-b.teeUnitMargin)<1e-8);const c=calculate({firstPassYield:.5,unreviewedYield:.5,reviewPerPost:.15});assert.ok(Math.abs(c.reviewSavingsPerPost+.15)<1e-8);});
import {validateAssumptions}from'./finance.js';
test('invalid scenario inputs cannot produce or export plausible profit figures',()=>{
 for(const input of [{viewToVisit:1.01},{teeTrafficShare:.9,courseTrafficShare:.4},{firstPassYield:0},{teeCost:-1},{days:0},{days:365},{unitsPerOrder:.5},{monthsAmortization:0},{paymentRate:.8,extraPlatformRate:.3},{viewsPerPost:Infinity},{teePrice:'59.99'}]){
  assert.ok(validateAssumptions(input).length>0);assert.throws(()=>calculate(input),RangeError);
 }
});
test('a scenario with no positive retained brand revenue has no finite price floor',()=>{
 for(const input of [{brandRefund:.8,paymentRate:.2},{brandRefund:.7,paymentRate:.3},{brandRefund:1},{brandRefund:.95,paymentRate:.1}])assert.equal(calculate(input).brandMinimumPrice,null);
});
test('very low positive generation yield is used directly rather than silently clamped',()=>{
 const a=calculate({firstPassYield:.005,reuseFraction:0}),b=calculate({firstPassYield:.01,reuseFraction:0});assert.equal(a.generationPerPost,b.generationPerPost*2);
});
test('numeric overflow is rejected instead of displayed as infinite profit',()=>{
 assert.throws(()=>calculate({viewsPerPost:1e308,postsDaily:1e308}),/numeric range/);
});
