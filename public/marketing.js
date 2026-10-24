import {priceCart} from './cart.js';
const cart=[];
const money=value=>'$'+value.toFixed(2);
function renderCart(){
 let box=document.querySelector('.cart-box');
 if(!box){box=document.createElement('aside');box.className='cart-box';box.id='preview-cart';box.tabIndex=-1;box.setAttribute('aria-label','Preview shopping cart');document.body.append(box);}
 document.querySelectorAll('[data-open-cart]').forEach(button=>{button.textContent='Preview cart ('+cart.length+')';button.setAttribute('aria-expanded','true');});
 box.replaceChildren();
 const title=document.createElement('strong');title.textContent=cart.length+' item'+(cart.length===1?'':'s')+' in preview cart';box.append(title);
 cart.forEach((item,index)=>{
  const row=document.createElement('div');row.className='cart-item';
  const label=document.createElement('span');label.textContent=item.name+' / '+item.size;
  const remove=document.createElement('button');remove.textContent='Remove';remove.setAttribute('aria-label','Remove '+item.name+' '+item.size);remove.onclick=()=>{cart.splice(index,1);renderCart();};
  row.append(label,remove);box.append(row);
 });
 const totals=priceCart(cart);
 for(const text of ['Subtotal '+money(totals.subtotal),'Bundle saving '+money(totals.discount),'Merchandise total '+money(totals.merchandise),totals.freeShipping?'Free shipping threshold reached.':money(totals.shippingGap)+' more merchandise to reach free shipping.',cart.length%4===0&&cart.length>0?'Bundle applied.':(4-cart.length%4)+' more item(s) to unlock the next free tee.','Proposed launch offer. Shipping, tax, inventory and checkout are not connected.']){
  const line=document.createElement('p');line.textContent=text;box.append(line);
 }
 const close=document.createElement('button');close.textContent='Close cart';close.onclick=()=>{box.remove();document.querySelectorAll('[data-open-cart]').forEach(button=>button.setAttribute('aria-expanded','false'));document.querySelector('[data-open-cart]')?.focus();};box.append(close);box.focus();
}
document.querySelectorAll('[data-open-cart]').forEach(button=>button.onclick=renderCart);
document.querySelectorAll('[data-add]').forEach(button=>button.onclick=()=>{
 const product=button.closest('.product');cart.push({name:button.dataset.add,size:product.querySelector('select').value,price:59.99});renderCart();
});
document.querySelectorAll('[data-checkout]').forEach(button=>button.onclick=()=>{
 const message=document.querySelector('#checkout-status');if(!message)return;
 const link=document.createElement('a');link.href='/brands/#packages';link.textContent='UGC video packages';message.replaceChildren('The course is not on sale, so there is no checkout. Mint Labs is selling ',link,' right now.');
});
