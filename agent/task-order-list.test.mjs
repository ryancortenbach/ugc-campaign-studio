import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {paidTaskOrders} from './public/task-list-model.js';

const source=readFileSync(new URL('./public/app.js',import.meta.url),'utf8');
const orderSource=source.slice(source.indexOf('const whopState='),source.indexOf('function paintOrders()'));
const paintSource=source.slice(source.indexOf('function paintOrders()'),source.indexOf('async function refreshWhop()'));
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const order=(n,over={})=>({payment_id:`pay_${n}`,status:'paid',substatus:'succeeded',product:'UGC Starter',buyer_name:`Buyer ${n}`,state:'ready',amount:500,currency:'usd',payment_at:new Date(Date.UTC(2026,9,29,0,n)).toISOString(),...over});
function render(t,orders){
 const state={whop:{orders},whopConfirm:null},context=vm.createContext({state,paidTaskOrders,esc,ic:()=>'',schip:()=>'',statusIcon:{},clip:String});
 vm.runInContext(orderSource+'\nthis.html=ordersHTML();',context);
 const dom=new JSDOM(`<section data-task-section="client"><span class="task-section-count"></span>${context.html}</section>`);t.after(()=>dom.window.close());
 const document=dom.window.document;context.$=s=>document.querySelector(s);vm.runInContext(paintSource+'\nthis.repaint=paintOrders;',context);
 const refresh=next=>{state.whop.orders=next;context.repaint();};refresh(orders);
 return {document,refresh};
}

test('all successful purchases remain reachable when client work grows past twelve orders',t=>{
 const orders=Array.from({length:13},(_,i)=>order(i+1)),{document}=render(t,orders);
 const links=[...document.querySelectorAll('.ord-open')];
 assert.equal(links.length,paidTaskOrders(orders).length,'Every counted purchase must have a client brief row');
 assert.ok(document.querySelector('.ord-open[href="#/orders/pay_1"]'),'The oldest successful purchase must not silently disappear');
 assert.equal(links[0].getAttribute('href'),'#/orders/pay_13');
 assert.equal(links.at(-1).getAttribute('href'),'#/orders/pay_1');
 assert.equal(document.querySelector('.task-section-count').textContent,'13');
});

test('duplicate payment rows and failed purchases still produce one row per successful purchase',t=>{
 const orders=Array.from({length:15},(_,i)=>order(i+1)),input=[...orders,{...orders[0]},order(30,{status:'open',substatus:'failed'}),order(31,{status:'refunded'})];
 const {document}=render(t,input),links=[...document.querySelectorAll('.ord-open')];
 assert.equal(links.length,15);assert.equal(new Set(links.map(a=>a.getAttribute('href'))).size,15);
 assert.equal(document.querySelector('[href="#/orders/pay_30"]'),null);assert.equal(document.querySelector('[href="#/orders/pay_31"]'),null);
 assert.equal(input.length,18,'Rendering must not remove payment history');
});

test('a refreshed order list can recover from empty and return to empty without stale rows',t=>{
 const {document,refresh}=render(t,[]),section=document.querySelector('[data-task-section]');
 assert.equal(document.querySelectorAll('.ord').length,0);assert.equal(section.hidden,true);
 refresh([order(2),order(1)]);assert.deepEqual([...document.querySelectorAll('.ord-open')].map(a=>a.getAttribute('href')),['#/orders/pay_2','#/orders/pay_1']);
 assert.equal(section.hidden,false);assert.equal(document.querySelector('.task-section-count').textContent,'2');
 refresh([order(1,{status:'unpaid'})]);assert.equal(document.querySelectorAll('.ord').length,0);assert.equal(section.hidden,true);assert.equal(document.querySelector('.task-section-count').textContent,'0');
});

test('product and client text remain escaped in the order list',t=>{
 const {document}=render(t,[order(1,{product:'<img src=x> Starter',buyer_name:'<b>Fixture</b>'})]);
 assert.equal(document.querySelector('.ord-open img'),null);assert.equal(document.querySelector('.ord-open>b').textContent,'<img src=x> Starter');
 assert.equal(document.querySelector('.ord-open').getAttribute('aria-label'),'Open <b>Fixture</b> creative brief');
});

test('refreshing many purchases keeps the client section count aligned with order and task rows',t=>{
 const {document,refresh}=render(t,[order(1)]),section=document.querySelector('[data-task-section]');
 const task=document.createElement('div');task.className='sess';section.append(task);
 refresh(Array.from({length:20},(_,i)=>order(i+1)));
 assert.equal(document.querySelectorAll('.ord').length,20);assert.equal(document.querySelector('.task-section-count').textContent,'21');
 refresh([]);assert.equal(section.hidden,false);assert.equal(document.querySelector('.task-section-count').textContent,'1');assert.equal(section.querySelector('.sess'),task);
});
