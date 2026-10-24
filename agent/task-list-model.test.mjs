import test from 'node:test';
import assert from 'node:assert/strict';
import {paidTaskOrders,taskSection,sortTaskGroups} from './public/task-list-model.js';

test('client tasks show successful payments once and retain distinct legitimate purchases',()=>{
 const paid={payment_id:'success',status:'paid',substatus:'succeeded',buyer_name:'Don',payment_at:'2026-10-24T16:57:00Z'};
 const failed={...paid,payment_id:'failed',status:'open',substatus:'failed'};
 const another={...paid,payment_id:'second-purchase'};
 assert.deepEqual(paidTaskOrders([failed,paid,{...paid},another]).map(order=>order.payment_id),['second-purchase','success']);
 assert.equal(failed.status,'open','Filtering must not delete or modify payment history');
 for(const status of ['unpaid','unsuccessful','pending','refunded'])assert.equal(paidTaskOrders([{...paid,status}]).length,0);
 assert.equal(paidTaskOrders([{...paid,substatus:'refunded'}]).length,0);
});
test('tasks have clear categories and active work precedes attention, ready and completed work',()=>{
 assert.equal(taskSection({plan:{kind:'client_demo'}}),'client');
 assert.equal(taskSection({prompt:'Whop order: AI UGC Videos'}),'client');
 assert.equal(taskSection({plan:{kind:'brand_storyboard'}}),'research');
 assert.equal(taskSection({prompt:'Find brands'}),'missions');
 const group=(id,status)=>({status,runs:[{id,updated_at:'2026-10-24'}]});
 assert.deepEqual(sortTaskGroups([group(8,'done'),group(1,'running'),group(7,'ready'),group(3,'needs_research')]).map(group=>group.runs[0].id),[1,3,7,8]);
});
