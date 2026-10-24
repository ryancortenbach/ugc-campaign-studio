// Read-only Whop API v1 client. GET requests only: this file never refunds, cancels, updates or messages anyone.
const base='https://api.whop.com/api/v1';
export const whopEnabled=()=>/^apik_\S+$/.test(process.env.WHOP_API_KEY||'');

async function get(pathname,query={},{request=fetch}={}){
 if(!whopEnabled())throw Error('WHOP_API_KEY is not set');
 const qs=new URLSearchParams();for(const [k,v] of Object.entries(query))if(v!=null&&v!=='')qs.set(k,String(v));
 const res=await request(`${base}/${pathname}${qs.size?`?${qs}`:''}`,{method:'GET',headers:{Authorization:`Bearer ${process.env.WHOP_API_KEY}`,Accept:'application/json'},signal:AbortSignal.timeout(20000)});
 const body=await res.json().catch(()=>({}));
 if(!res.ok)throw Object.assign(Error(`Whop ${pathname.split('?')[0]} failed with HTTP ${res.status}: ${String(body?.error?.message||body?.message||'').slice(0,160)}`),{status:res.status});
 return body;
}

// Money comes back as {currency,amount:"541.25",decimals:2} from the live API; the docs describe a plain number. Accept both.
export const amountOf=m=>{const n=Number(m&&typeof m==='object'?m.amount:m);return Number.isFinite(n)?n:0;};
const clean=v=>typeof v==='string'&&v.trim()?v.trim():null;

// One shape for the watcher: paid is true only for a succeeded, non-refunded payment of more than zero dollars.
export function normalizePayment(p={}){
 const line=(p.line_items||[])[0]||{};
 const refunded=amountOf(p.refunded_amount)>0||/refund|dispute|void/i.test(p.substatus||'');
 const amount=amountOf(p.usd_total??p.total);
 return {
  id:p.id,status:p.status||null,substatus:p.substatus||null,
  paid:p.status==='paid'&&(p.substatus==null||p.substatus==='succeeded')&&!refunded&&amount>0,refunded,
  amount,currency:String(p.total?.currency||p.currency||'usd').toLowerCase(),
  product:clean(line.product_title)||clean(line.label)||clean(p.product?.title)||'Whop purchase',
  productId:p.product_id||p.product?.id||null,planId:p.plan_id||p.plan?.id||null,
  memberId:p.member_id||p.member?.id||null,membershipId:p.membership_id||p.membership?.id||null,
  email:clean(p.customer_email)||clean(p.user?.email),name:clean(p.user?.name)||clean(p.billing_address?.name),username:clean(p.user?.username),
  metadata:p.metadata&&typeof p.metadata==='object'?p.metadata:{},createdAt:p.created_at||null,paidAt:p.paid_at||null
 };
}
export async function listPayments({after,first=100,request}={}){
 const body=await get('payments',{first,after,order:'created_at',direction:'desc'},{request});
 return {payments:(body.data||[]).map(normalizePayment),next:body.page_info?.has_next_page?body.page_info.end_cursor:null};
}
export async function getPayment(id,{request}={}){return normalizePayment(await get(`payments/${encodeURIComponent(id)}`,{},{request}));}
export const getMember=(id,{request}={})=>get(`members/${encodeURIComponent(id)}`,{},{request});
export const getMembership=(id,{request}={})=>get(`memberships/${encodeURIComponent(id)}`,{},{request});

// Buyer email, name and checkout answers. The payment usually has the email; the member and membership fill gaps.
// Checkout custom fields live on the membership (custom_field_responses: [{question,answer}]). Each lookup is best effort.
export async function buyerInfo(payment,{request}={}){
 let {email,name}=payment,fields=Object.entries(payment.metadata||{}).filter(([,v])=>typeof v==='string'&&v.trim()).map(([question,answer])=>({question,answer}));
 if(payment.memberId&&(!email||!name))try{const m=await getMember(payment.memberId,{request});email??=clean(m.email)||clean(m.user?.email);name??=clean(m.display_name)||clean(m.user?.name);}catch{}
 if(payment.membershipId)try{const ms=await getMembership(payment.membershipId,{request});fields=[...fields,...(ms.custom_field_responses||[]).filter(f=>f&&typeof f.answer==='string'&&f.answer.trim()).map(f=>({question:String(f.question||''),answer:f.answer.trim()}))];email??=clean(ms.user?.email);name??=clean(ms.user?.name);}catch{}
 return {email:email||null,name:name||payment.username||null,fields};
}
