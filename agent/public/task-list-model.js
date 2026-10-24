const live=new Set(['running','planning','researching','research_queued','queued']);
const attention=new Set(['needs_research','needs_brand','checks_failed','failed','paused','review']);
export const taskSection=task=>task.plan?.kind==='client_demo'||task.plan?.kind==='client_project'||/^whop order:/i.test(task.prompt||'')?'client':task.plan?.kind==='brand_storyboard'?'research':'missions';
export function paidTaskOrders(orders=[]){
 const seen=new Set();
 return orders.filter(order=>{
  const status=String(order.status||'').toLowerCase(),substatus=String(order.substatus||'').toLowerCase();
  if(status&&!['paid','succeeded','success','successful','completed','complete','captured'].includes(status))return false;
  if(/failed|cancel|refund|void|revers|declin/.test(substatus))return false;
  if(!order.payment_id||seen.has(order.payment_id))return false;
  seen.add(order.payment_id);return true;
 }).sort((a,b)=>Date.parse(b.payment_at||b.created_at||0)-Date.parse(a.payment_at||a.created_at||0)||String(a.payment_id).localeCompare(String(b.payment_id)));
}
export function sortTaskGroups(groups=[]){
 const rank=group=>live.has(group.status)?0:attention.has(group.status)?1:['ready','saved'].includes(group.status)?2:3;
 const date=group=>Math.max(...group.runs.map(task=>Date.parse(task.updated_at||task.created_at)||0));
 return groups.slice().sort((a,b)=>rank(a)-rank(b)||date(b)-date(a)||b.runs[0].id-a.runs[0].id);
}
