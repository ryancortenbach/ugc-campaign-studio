import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {paintDelivery} from './public/delivery.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function fixture(t,{stale=false,ffmpeg=false,final=true}={}){
 const dom=new JSDOM('<section></section>');t.after(()=>dom.window.close());
 const el=dom.window.document.querySelector('section'),calls=[];
 const data={shots:[{renderId:1,title:'Finished fixture'}],ready:true,order:{buyerEmail:'buyer@example.invalid'},setup:{ffmpeg,storage:true},final:final?{url:'/renders/fixture.mp4',at:'2026-10-29T10:14:37Z',bytes:1024,stale}:null,delivery:null};
 const paint=()=>paintDelivery({el,esc,toast:()=>assert.fail('No delivery actions are authorized'),paymentId:'pay_fixture',api:async(path,body)=>{calls.push(path);assert.equal(path,'/api/whop/orders/pay_fixture/delivery');assert.equal(body,undefined);return structuredClone(data);}});
 await paint();return {el,data,paint,calls};
}

for(const stale of [false,true])test(`existing final with stale=${stale} cannot be remade when local tooling is missing`,async t=>{
 const f=await fixture(t,{stale});assert.equal(f.el.querySelector('[data-del="final"]').disabled,true);
 assert.match(f.el.textContent,/ffmpeg is missing on this Mac/);assert.equal(f.el.querySelector('video').getAttribute('src'),'/renders/fixture.mp4');
 assert.equal(f.el.querySelector('[data-del="deliver"]').disabled,stale);assert.equal(f.calls.length,1);
});

test('available tooling keeps an existing final remake enabled and the warning absent',async t=>{
 const f=await fixture(t,{ffmpeg:true,stale:true});assert.equal(f.el.querySelector('[data-del="final"]').disabled,false);
 assert.doesNotMatch(f.el.textContent,/ffmpeg is missing/);assert.equal(f.el.querySelector('[data-del="deliver"]').disabled,true);
});

test('a read after tooling recovery re-enables the same final workflow without invoking it',async t=>{
 const f=await fixture(t,{stale:true});f.data.setup.ffmpeg=true;await f.paint();
 assert.equal(f.el.querySelector('[data-del="final"]').disabled,false);assert.doesNotMatch(f.el.textContent,/ffmpeg is missing/);assert.equal(f.calls.length,2);
});

test('first-time final creation retains the same missing-tool warning and disabled state',async t=>{
 const f=await fixture(t,{final:false});assert.equal(f.el.querySelector('[data-del="final"]').disabled,true);
 assert.match(f.el.textContent,/ffmpeg is missing on this Mac/);assert.equal(f.el.querySelector('[data-del="deliver"]'),null);
});
