export const defaults={days:30,postsDaily:10,viewsPerPost:3000,viewToVisit:.003,teeConversion:.015,courseConversion:.01,teeTrafficShare:.6,courseTrafficShare:.4,teePrice:59.99,unitsPerOrder:1.1,teeDiscount:.05,teeCost:18,teeShipping:5,shippingCharged:0,teeRefund:.05,coursePrice:97,courseRefund:.08,courseSupport:3,affiliateShare:.15,affiliateCommission:.2,paymentRate:.027,paymentFixed:.3,extraPlatformRate:0,secondsPerPost:15,costPerSecond:.25,firstPassYield:.75,reuseFraction:.4,voicePerPost:.05,reviewPerPost:.15,editPerPost:.1,llmPerPost:.08,sharedOverhead:150,laborHours:15,hourlyRate:25,courseSetup:1000,monthsAmortization:6,startingCash:2000,payoutDelayDays:7,brandClients:3,brandPrice:1497,brandChurn:.08,brandAcquisitionCost:150,brandRefund:.03,brandSupportHours:2,sampleSeconds:5,samplesMonthly:30,outreachCostPerLead:.15,outreachLeads:100,outreachReply:.1,outreachClose:.1,unreviewedYield:.5,baselineReviewCost:0};
const rates=new Set(['viewToVisit','teeConversion','courseConversion','teeTrafficShare','courseTrafficShare','teeDiscount','teeRefund','courseRefund','affiliateShare','affiliateCommission','paymentRate','extraPlatformRate','firstPassYield','reuseFraction','brandChurn','brandRefund','outreachReply','outreachClose','unreviewedYield']);
const label=key=>key.replace(/[A-Z]/g,letter=>' '+letter.toLowerCase());
export function validateAssumptions(input={}){
 const a={...defaults,...input},issues=[];
 for(const key of Object.keys(defaults)){const value=a[key];if(typeof value!=='number'||!Number.isFinite(value)){issues.push(label(key)+' must be a finite number.');continue;}if(value<0)issues.push(label(key)+' cannot be negative.');if(rates.has(key)&&value>1)issues.push(label(key)+' cannot exceed 100%.');}
 for(const key of ['firstPassYield','unreviewedYield','monthsAmortization'])if(typeof a[key]==='number'&&a[key]<=0)issues.push(label(key)+' must be greater than zero.');
 if(typeof a.days==='number'&&(a.days<=0||a.days>31))issues.push('Production days per month must be greater than zero and no more than 31.');
 if(typeof a.unitsPerOrder==='number'&&a.unitsPerOrder<1)issues.push('Units per completed order must be at least 1.');
 if(a.teeTrafficShare+a.courseTrafficShare>1+1e-10)issues.push('T-shirt and course traffic allocations cannot total more than 100%.');
 if(a.paymentRate+a.extraPlatformRate>1+1e-10)issues.push('Combined percentage payment fees cannot exceed 100%.');
 return issues;
}
export function calculate(input={}){
 const a={...defaults,...input};const issues=validateAssumptions(a);if(issues.length)throw new RangeError(issues.join(' ' ));
 const posts=a.days*a.postsDaily,views=posts*a.viewsPerPost,visits=views*a.viewToVisit;
 const teeOrders=visits*a.teeTrafficShare*a.teeConversion,courseOrders=visits*a.courseTrafficShare*a.courseConversion;
 const affiliateRate=a.affiliateShare*a.affiliateCommission;
 const teeGross=teeOrders*(a.teePrice*a.unitsPerOrder*(1-a.teeDiscount)+a.shippingCharged);
 const teeNet=teeGross*(1-a.teeRefund),teeFees=teeGross*(a.paymentRate+a.extraPlatformRate)+teeOrders*a.paymentFixed;
 const teeFulfillment=teeOrders*(a.teeCost*a.unitsPerOrder+a.teeShipping);
 const teeAffiliate=teeNet*affiliateRate,teeContribution=teeNet-teeFees-teeFulfillment-teeAffiliate;
 const courseGross=courseOrders*a.coursePrice,courseNet=courseGross*(1-a.courseRefund);
 const courseFees=courseGross*(a.paymentRate+a.extraPlatformRate)+courseOrders*a.paymentFixed;
 const courseVariable=courseOrders*a.courseSupport+courseNet*affiliateRate;
 const courseContribution=courseNet-courseFees-courseVariable;
 const unreviewedGenerationPerPost=a.secondsPerPost*a.costPerSecond*(1-a.reuseFraction)/a.unreviewedYield;
 const generationPerPost=a.secondsPerPost*a.costPerSecond*(1-a.reuseFraction)/a.firstPassYield;
 const costPerPost=generationPerPost+a.voicePerPost+a.reviewPerPost+a.editPerPost+a.llmPerPost;
 const sharedContentCost=posts*costPerPost;
 const brandRevenue=a.brandClients*a.brandPrice;
 const brandNet=brandRevenue*(1-a.brandRefund);
 const brandDelivery=a.brandClients*(posts*costPerPost+a.brandSupportHours*a.hourlyRate);
 const brandFees=brandRevenue*(a.paymentRate+a.extraPlatformRate)+a.brandClients*a.paymentFixed;
 const brandReplacementCAC=a.brandClients*a.brandChurn*a.brandAcquisitionCost;
 const brandContribution=brandNet-brandDelivery-brandFees-brandReplacementCAC;
 const samplesCost=a.samplesMonthly*a.sampleSeconds*a.costPerSecond/a.firstPassYield;
 const outreachCost=a.outreachLeads*a.outreachCostPerLead+samplesCost;
 const overhead=a.sharedOverhead+a.laborHours*a.hourlyRate+a.courseSetup/a.monthsAmortization+outreachCost;
 const operatingProfit=teeContribution+courseContribution+brandContribution-sharedContentCost-overhead;
 const teeOrderGross=a.teePrice*a.unitsPerOrder*(1-a.teeDiscount)+a.shippingCharged;
 const teeUnitMargin=teeOrderGross*(1-a.teeRefund)*(1-affiliateRate)-teeOrderGross*(a.paymentRate+a.extraPlatformRate)-(a.teeCost*a.unitsPerOrder+a.teeShipping)-a.paymentFixed;
 const courseUnitMargin=a.coursePrice*(1-a.courseRefund)*(1-affiliateRate)-a.coursePrice*(a.paymentRate+a.extraPlatformRate)-a.paymentFixed-a.courseSupport;
 const brandUnitMargin=a.brandPrice*(1-a.brandRefund-a.paymentRate-a.extraPlatformRate)-(posts*costPerPost+a.brandSupportHours*a.hourlyRate)-a.paymentFixed-a.brandChurn*a.brandAcquisitionCost;
 const cashRevenue=teeNet+courseNet+brandNet;
 const cashCosts=teeFees+teeFulfillment+teeAffiliate+courseFees+courseVariable+brandDelivery+brandFees+brandReplacementCAC+sharedContentCost+overhead;
 const reviewSavingsPerPost=unreviewedGenerationPerPost-generationPerPost-(a.reviewPerPost-a.baselineReviewCost);
 const retainedBrandRevenue=Math.abs(1-(a.brandRefund+a.paymentRate+a.extraPlatformRate))<1e-12?0:1-a.brandRefund-a.paymentRate-a.extraPlatformRate;
 const result={reviewSavingsPerPost,monthlyReviewSavings:posts*reviewSavingsPerPost,assumptions:a,posts,views,visits,teeOrders,courseOrders,teeGross,teeNet,teeFees,teeFulfillment,teeAffiliate,teeContribution,courseGross,courseNet,courseFees,courseVariable,courseContribution,generationPerPost,costPerPost,sharedContentCost,brandRevenue,brandNet,brandDelivery,brandFees,brandReplacementCAC,brandContribution,samplesCost,outreachCost,overhead,operatingProfit,teeUnitMargin,courseUnitMargin,brandUnitMargin,teeBreakEven:teeUnitMargin>0?Math.ceil((sharedContentCost+overhead)/teeUnitMargin):null,courseBreakEven:courseUnitMargin>0?Math.ceil((sharedContentCost+overhead)/courseUnitMargin):null,brandBreakEven:brandUnitMargin>0?Math.ceil(overhead/brandUnitMargin):null,brandMinimumPrice:retainedBrandRevenue>0?(posts*costPerPost+a.brandSupportHours*a.hourlyRate+a.paymentFixed+a.brandChurn*a.brandAcquisitionCost)/retainedBrandRevenue:null,monthlyCashChange:cashRevenue-cashCosts-a.courseSetup+a.courseSetup/a.monthsAmortization,workingCapitalEstimate:cashCosts/a.days*a.payoutDelayDays,expectedNewClients:a.outreachLeads*a.outreachReply*a.outreachClose,monthlyChurnedClients:a.brandClients*a.brandChurn,startingCash:a.startingCash};
 if(Object.values(result).some(value=>typeof value==='number'&&!Number.isFinite(value)))throw new RangeError('Scenario exceeds the numeric range. Reduce the input magnitude.');return result;
}
export const cases={conservative:{viewsPerPost:500,viewToVisit:.001,teeConversion:.008,courseConversion:.005,firstPassYield:.55,brandClients:1},base:{},upside:{viewsPerPost:10000,viewToVisit:.005,teeConversion:.025,courseConversion:.02,firstPassYield:.85,brandClients:5}};
