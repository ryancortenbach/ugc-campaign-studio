// Proposed preview offer. Fulfillment and live checkout remain pending.
export function priceCart(items) {
 const prices=items.map(item=>item.price).sort((a,b)=>a-b);
 const subtotal=prices.reduce((sum,price)=>sum+price,0);
 const freeItems=Math.floor(prices.length/4);
 const discount=prices.slice(0,freeItems).reduce((sum,price)=>sum+price,0);
 const merchandise=subtotal-discount;
 return {subtotal,discount,merchandise,freeItems,freeShipping:merchandise>90,shippingGap:Math.max(0,90.01-merchandise)};
}
