import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {rendersView} from './public/renders-view.js';

const record={id:7,lead_id:3,title:'Fixture shot',status:'checks_failed',input:{prompt:'Fixture'},plan:{hero:{index:0,imageUrl:'https://fixture.example/old-product.png'}},created_at:'2026-10-29T05:00:00Z'};
async function fixture(t){
 const dom=new JSDOM('<main></main>'),view=dom.window.document.querySelector('main'),calls=[];
 const api=async(path,body)=>{
  calls.push([path,body]);assert.equal(body,undefined,'This fixture only reads mocked data');
  if(path==='/api/state')return {config:{spendingPaused:true}};
  if(path==='/api/leads')return {leads:[]};
  assert.equal(path,'/api/renders');return {renders:[structuredClone(record)]};
 };
 const controller=await rendersView({view,api,poll:false});
 t.after(()=>{controller.stop();dom.window.close();});
 return {dom,view,calls,patch:next=>dom.window.mintRendersView.patch(next),card:()=>view.querySelector('.rv-card'),fail:element=>element.dispatchEvent(new dom.window.Event('error'))};
}

test('a changed hero URL at the same product index refreshes the tile and open panel',async t=>{
 const f=await fixture(t);f.card().click();
 f.patch({...record,plan:{hero:{...record.plan.hero,imageUrl:'https://fixture.example/new-product.png'}}});
 assert.equal(f.card().querySelector('.rv-media img').getAttribute('src'),'https://fixture.example/new-product.png');
 assert.equal(f.view.querySelector('.rvp-media img').getAttribute('src'),'https://fixture.example/new-product.png');
 assert.equal(f.calls.length,3);
});

test('a newly available remote still replaces the hero without a status change',async t=>{
 const f=await fixture(t);f.card().click();
 f.patch({...record,plan:{...record.plan,still:{result_url:'https://fixture.example/ready-still.png'}}});
 assert.equal(f.card().querySelector('.rv-media img').getAttribute('src'),'https://fixture.example/ready-still.png');
 assert.equal(f.view.querySelector('.rvp-media img').getAttribute('src'),'https://fixture.example/ready-still.png');
});

test('fresh media retries from the first candidate after old fallbacks are exhausted',async t=>{
 const f=await fixture(t);f.fail(f.card().querySelector('.rv-media img'));f.fail(f.card().querySelector('.rv-media img'));
 assert.ok(f.card().querySelector('.rv-fallback'));
 f.patch({...record,plan:{hero:{...record.plan.hero,imageUrl:'https://fixture.example/recovered.png'}}});
 assert.equal(f.card().dataset.mi,'0');assert.equal(f.card().querySelector('.rv-media img').getAttribute('src'),'https://fixture.example/recovered.png');
});

test('unrelated metadata preserves the displayed fallback and healthy media element',async t=>{
 const f=await fixture(t);f.fail(f.card().querySelector('.rv-media img'));
 const cached=f.card().querySelector('.rv-media img');assert.match(cached.getAttribute('src'),/^\/api\/leads\/3\/products\/0\/image\?v=/);
 f.patch({...record,review_note:'Local fixture note'});
 assert.equal(f.card().querySelector('.rv-media img'),cached);assert.equal(f.card().dataset.mi,'1');assert.equal(f.calls.length,3);
});
