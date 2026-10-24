import test from 'node:test';
import assert from 'node:assert/strict';
import {priceCart} from '../public/cart.js';
test('proposed bundle charges three of four and keeps free-shipping threshold after discount',()=>{
 const result=priceCart(Array.from({length:4},()=>({price:59.99})));
 assert.equal(result.freeItems,1);
 assert.equal(result.discount,59.99);
 assert.ok(Math.abs(result.merchandise-179.97)<.001);
 assert.equal(result.freeShipping,true);
 assert.equal(priceCart([{price:90}]).freeShipping,false);
 assert.equal(priceCart([{price:90.01}]).freeShipping,true);
});
test('bundle makes the cheapest eligible item free for every four items',()=>{
 const result=priceCart([10,20,30,40,50,60,70,80].map(price=>({price})));
 assert.equal(result.discount,30);
 assert.equal(result.freeItems,2);
 assert.deepEqual(priceCart([]),{subtotal:0,discount:0,merchandise:0,freeItems:0,freeShipping:false,shippingGap:90.01});
});
