import {z} from 'zod';

export const creativeResearchSchema=z.object({
 researchBrief:z.string(),
 icp:z.object({summary:z.string(),motivations:z.array(z.string()),evidence:z.array(z.string()),unknowns:z.array(z.string())}),
 character:z.object({appearance:z.string(),wardrobe:z.string(),rationale:z.string()}),
 designDirections:z.array(z.object({name:z.string(),description:z.string(),rationale:z.string()})),
 gameAffinities:z.array(z.object({name:z.string(),basis:z.enum(['observed','hypothesis']),rationale:z.string(),sourceUrl:z.string().nullable()})),
 environments:z.array(z.object({name:z.string(),description:z.string(),rationale:z.string()})),
 sources:z.array(z.object({url:z.string(),observation:z.string()})),
 unknowns:z.array(z.string())
});
export const creativeResearchInstructions=`Include a full research object: researchBrief preserves a detailed narrative of the brand evidence and implications, icp includes summary, motivations, evidence and unknowns; character specifies an original character's appearance, wardrobe and rationale; designDirections describe two or three distinct visual approaches and why each fits; environments describe specific sets, lighting and why they fit. gameAffinities names only games supported by the evidence, or explicitly marks a creative hypothesis with basis=hypothesis and sourceUrl=null. A style suggestion does not establish that customers like a game. Use sources with actual provided URLs, never invent URLs or demographics. State missing evidence in unknowns. No real-person likeness or generated-image claim. Product references must come from the supplied real catalog. No em dashes.`;
export function normalizeCreativeResearch(research,sourceUrls=[]){
 if(!research)return null;
 const canonical=url=>{try{const u=new URL(url);return ['https:','http:'].includes(u.protocol)?u.href:null;}catch{return null;}};
 const allowed=new Set(sourceUrls.map(canonical).filter(Boolean)),out=structuredClone(research);
 out.sources=(out.sources||[]).filter(s=>allowed.has(canonical(s.url)));
 out.gameAffinities=(out.gameAffinities||[]).map(g=>g.basis==='observed'&&g.sourceUrl&&allowed.has(canonical(g.sourceUrl))?g:{...g,basis:'hypothesis',sourceUrl:null});
 return out;
}

// Read only. Historical purchases can have no linked brand or agent work yet.
export function clientOrderReport({store,paymentId}){
 const order=store.db.prepare('select payment_id,brand_domain,buyer_name,product,task_id,storyboard_id,state,amount,currency from whop_orders where payment_id=?').get(paymentId);
 if(!order)throw Object.assign(Error('Order not found.'),{status:404});
 const task=order.task_id?store.getTask(order.task_id):null,board=order.storyboard_id?store.getStoryboard(order.storyboard_id):null;
 const lead=(task&&store.listLeads({taskId:task.id})[0])||(order.brand_domain?store.listLeads().find(l=>l.domain===order.brand_domain):null);
 const brief=board?.brief||task?.plan?.brief||{};
 return {order,reportStatus:!order.brand_domain?'needs_brand':task?.status||'not_started',task:task||{id:null,status:'needs_research'},lead:{...(lead||{company:order.brand_domain||`${order.buyer_name||'Client'}: ${order.product||'Video project'}`,domain:order.brand_domain||'',url:order.brand_domain?`https://${order.brand_domain}`:'',products:[]}),products:task?.plan?.productReferences||lead?.products||[]},brief,creativeBrief:task?.plan?.creativeBrief||brief.research||null,researchModel:task?.plan?.researchModel||null,lab:{options:{audience:brief.audience||'Audience research has not been saved.'},plans:board?.plan?[board.plan]:[],refs:[]},events:task?store.listEvents({taskId:task.id}):[],revision:board?.version||0};
}
