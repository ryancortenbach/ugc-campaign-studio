// One-time package planning. No provider prices or production yields are implied.
export const packageOffers = Object.freeze({
 starter: Object.freeze({name:'UGC Starter',price:500,videos:5,url:'https://whop.com/checkout/plan_lW3DqSYybecYj/'}),
 campaign: Object.freeze({name:'UGC Campaign',price:1000,videos:12,url:'https://whop.com/checkout/plan_GohcF3fkgSBnb/'})
});
export const packageDefaults = Object.freeze({price:500,videos:5,seconds:20,generationPerSecond:.15,yield:.65,revisionFraction:.2,voicePerVideo:.25,checksPerVideo:.2,otherPerVideo:1,editMinutes:30,reviewMinutes:15,setupHours:2,hourlyRate:35,feeRate:.03,fixedFee:.3,refundRate:.05,acquisitionCost:0,overhead:0});
export const packageCases = Object.freeze({
 base:Object.freeze({}),
 conservative:Object.freeze({seconds:30,generationPerSecond:.2,yield:.4,revisionFraction:.5,setupHours:3,editMinutes:40,reviewMinutes:20,hourlyRate:45,refundRate:.1}),
 upside:Object.freeze({seconds:15,generationPerSecond:.1,yield:.85,revisionFraction:.1,setupHours:1,editMinutes:15,reviewMinutes:10,hourlyRate:30,refundRate:.02})
});
export function calculatePackage(input={}) {
 const a={...packageDefaults,...input};
 for(const key of Object.keys(packageDefaults)) {
  if(typeof a[key]!=='number'||!Number.isFinite(a[key])||a[key]<0)throw new RangeError(`${key} must be a finite, nonnegative number.`);
 }
 if(!Number.isSafeInteger(a.videos)||a.videos<1)throw new RangeError('Video count must be a positive safe integer.');
 if(a.price<=0)throw new RangeError('Package price must be greater than zero.');
 if(a.seconds<15||a.seconds>30)throw new RangeError('Duration must be between 15 and 30 seconds per video.');
 if(a.yield<=0||a.yield>1)throw new RangeError('Usable generation yield must be greater than 0 and no more than 1.');
 for(const key of ['revisionFraction','feeRate','refundRate'])if(a[key]>1)throw new RangeError(`${key} must be between 0 and 1.`);
 const deliveredSeconds=a.videos*a.seconds;
 const generatedSeconds=deliveredSeconds*(1+a.revisionFraction)/a.yield;
 const generationCost=generatedSeconds*a.generationPerSecond;
 const ancillaryCost=a.videos*(a.voicePerVideo+a.checksPerVideo+a.otherPerVideo);
 const laborHours=a.setupHours+a.videos*(a.editMinutes+a.reviewMinutes)/60;
 const laborCost=laborHours*a.hourlyRate;
 const directCost=generationCost+ancillaryCost+laborCost+a.acquisitionCost+a.overhead;
 const fees=a.price*a.feeRate+a.fixedFee;
 const retainedRevenue=a.price*(1-a.refundRate);
 const contribution=retainedRevenue-fees-directCost;
 const denominator=1-(a.refundRate+a.feeRate);
 const breakEvenPrice=denominator>0?(directCost+a.fixedFee)/denominator:null;
 const result={assumptions:a,deliveredSeconds,generatedSeconds,generationCost,ancillaryCost,laborHours,laborCost,directCost,fees,retainedRevenue,contribution,margin:retainedRevenue>0?contribution/retainedRevenue:null,breakEvenPrice,costPerVideo:(directCost+fees)/a.videos};
 if(Object.values(result).some(v=>typeof v==='number'&&!Number.isFinite(v)))throw new RangeError('Scenario exceeds the numeric range. Reduce the input magnitude.');
 return result;
}
