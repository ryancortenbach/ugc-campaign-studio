export const whopApiVersion='2026-10-24';
const idPattern=/^plan_[a-zA-Z0-9]{1,80}$/;
export function checkoutLink(value){
 if(typeof value!=='string')return null;try{const url=new URL(value);const match=url.pathname.match(/^\/(?:[a-zA-Z0-9_-]+\/)?checkout\/(plan_[a-zA-Z0-9]{1,80})\/?$/);if(url.protocol!=='https:'||url.hostname!=='whop.com'||url.port||url.username||url.password||url.search||url.hash||!match)return null;return{url:url.href,variantId:match[1]};}catch{return null;}
}
export function courseConfiguration(env){
 const missing=['WHOP_API_KEY','WHOP_COURSE_VARIANT_ID','WHOP_COURSE_PRODUCT_ID','WHOP_ACCOUNT_ID'].filter(key=>typeof env[key]!=='string'||!env[key].trim());const issues=[];
 if(env.WHOP_COURSE_VARIANT_ID&&!idPattern.test(env.WHOP_COURSE_VARIANT_ID))issues.push('Variant ID must be a plan_ identifier.');
 if(env.WHOP_COURSE_PRODUCT_ID&&!/^prod_[a-zA-Z0-9]+$/.test(env.WHOP_COURSE_PRODUCT_ID))issues.push('Product ID must be a prod_ identifier.');
 if(env.WHOP_ACCOUNT_ID&&!/^biz_[a-zA-Z0-9]+$/.test(env.WHOP_ACCOUNT_ID))issues.push('Account ID must be a biz_ identifier.');
 const link=env.WHOP_COURSE_CHECKOUT_URL?checkoutLink(env.WHOP_COURSE_CHECKOUT_URL):null;
 if(env.WHOP_COURSE_CHECKOUT_URL&&!link)issues.push('Use a canonical HTTPS Whop checkout URL without query parameters, credentials or fragment.');
 if(link&&env.WHOP_COURSE_VARIANT_ID&&link.variantId!==env.WHOP_COURSE_VARIANT_ID)issues.push('Configured checkout URL and variant ID disagree.');
 return{configured:missing.length===0&&issues.length===0,missing,issues,checkoutLinkConfigured:Boolean(link)};
}
export function evaluateCourseVariant(data,env){
 const checks=[];const check=(name,pass)=>checks.push({name,pass:Boolean(pass)});const link=checkoutLink(data?.purchase_url);
 check('Expected variant',data?.id===env.WHOP_COURSE_VARIANT_ID);check('Expected account',data?.account?.id===env.WHOP_ACCOUNT_ID);check('Expected product',data?.product?.id===env.WHOP_COURSE_PRODUCT_ID);
 check('USD base currency',data?.currency==='usd');check('One-time billing',data?.plan_type==='one_time'&&data?.billing_period===null&&data?.renewal_price===0);check('Base price is 97 USD',data?.initial_price===97&&data?.initial_price_due?.currency==='usd'&&typeof data?.initial_price_due?.amount==='string'&&/^97(?:\.0{1,2})?$/.test(data?.initial_price_due?.amount||''));
 check('No installment or trial offer',data?.split_pay_required_payments===null&&(data?.trial_period_days===null||data?.trial_period_days===0));check('Purchasable metadata',data?.release_method==='buy_now'&&['visible','hidden'].includes(data?.visibility)&&(data?.unlimited_stock===true||Number.isInteger(data?.stock)&&data.stock>0));
 check('Canonical checkout matches variant',link?.variantId===env.WHOP_COURSE_VARIANT_ID);const configured=env.WHOP_COURSE_CHECKOUT_URL?checkoutLink(env.WHOP_COURSE_CHECKOUT_URL):null;if(configured)check('Configured checkout matches returned URL',configured.url===link?.url);
 return{status:checks.every(x=>x.pass)?'offer_metadata_matches':'offer_needs_attention',checks,expectedBasePrice:{amount:97,currency:'usd',billing:'one_time'},paymentsEnabled:false,courseAccessGranted:false,webhookVerified:false,checkoutOpened:false,disclosure:'Metadata check only. Taxes, checkout quotes, payment completion, course delivery and refund handling are not verified.'};
}
export async function verifyConfiguredCourse(env,request=fetch){
 const configuration=courseConfiguration(env);if(!configuration.configured)return{http:503,body:{status:'not_configured',...configuration,providerRequested:false,paymentsEnabled:false}};
 try{const response=await request('https://api.whop.com/api/v1/variants/'+env.WHOP_COURSE_VARIANT_ID,{method:'GET',headers:{Authorization:'Bearer '+env.WHOP_API_KEY,'Api-Version-Date':whopApiVersion},redirect:'error',signal:AbortSignal.timeout(15000)});if(!response.ok)return{http:502,body:{status:'provider_unavailable',providerRequested:true,paymentsEnabled:false,error:'Whop did not return variant metadata. No purchase or checkout was requested.'}};const data=await response.json();return{http:200,body:{...evaluateCourseVariant(data,env),providerRequested:true,apiVersion:whopApiVersion,checkedAt:new Date().toISOString()}};}catch{return{http:502,body:{status:'provider_unavailable',providerRequested:true,paymentsEnabled:false,error:'Whop metadata request failed. No purchase or checkout was requested.'}};}
}
