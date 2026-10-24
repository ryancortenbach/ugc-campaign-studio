import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {clientTaskReviewView} from './public/client-task-review.js';
const fixture=()=>({task:{id:10},brand:{name:'Disobedient',icp:{summary:'An audience hypothesis'},script:{hook:'The creative hook'},persona:{imageUrl:'/character.jpg'},storyboardImageUrl:'/concept.png',assets:[{kind:'product',title:'Official front',imageUrl:'/front.jpg'},{kind:'product',title:'Official back',imageUrl:'/back.jpg'},{kind:'product',title:'On body fit',imageUrl:'/fit.jpg'}],offerPdfUrl:'/brief.pdf'},versions:{research:'r1',images:'i1',video:null},reviews:[],events:[]});
test('a task shows research and images directly with a secondary PDF and no replay or horizontal stages',async()=>{
 const dom=new JSDOM('<main></main>'),view=dom.window.document.querySelector('main'),data=fixture();
 try{
  await clientTaskReviewView({view,taskId:10,api:async()=>data});
  assert.deepEqual([...view.querySelectorAll('.ct-products figcaption')].map(item=>item.textContent),['Front','Back','On-body']);
  assert.equal(view.querySelectorAll('object,iframe,nav').length,0);
  assert.doesNotMatch(view.textContent,/Open task|Research demo|Brand and people|Tool call replay/);
  assert.equal(view.querySelector('a[href="/brief.pdf"]').textContent,'PDF');
  assert.ok(view.querySelector('img[src="/concept.png"]'));
  assert.equal(view.querySelector('[data-ct-terac="video"]').disabled,true);
 }finally{dom.window.close();}
});
test('approval prevents duplicate clicks, keeps simulation distinct and reports failures',async()=>{
 const dom=new JSDOM('<main></main>'),view=dom.window.document.querySelector('main'),data=fixture(),calls=[];let release;
 const api=async(path,body)=>{if(!body)return data;calls.push(body);return new Promise(resolve=>release=resolve);};
 try{
  await clientTaskReviewView({view,taskId:10,api});
  view.querySelector('[data-ct-approve="research"]').click();
  view.querySelector('[data-ct-approve="research"]').click();
  assert.equal(calls.length,1);
  assert.equal(calls[0].mode,'local');
  release({...data,reviews:[{section:'research',mode:'local',decision:'approved'}]});await new Promise(resolve=>setImmediate(resolve));
  assert.equal(view.querySelector('[data-ct-approve="research"]').disabled,true);
  view.querySelector('[data-ct-terac="research"]').click();assert.equal(calls[1].mode,'simulated');
  release({...data,reviews:[{section:'research',mode:'simulated',decision:'approved'}]});await new Promise(resolve=>setImmediate(resolve));
  assert.equal(view.querySelector('[data-ct-approve="research"]').disabled,false,'Simulation must not mark a real review approved');
 }finally{dom.window.close();}
});
test('unavailable images and unsafe asset links have honest, escaped states',async()=>{
 const dom=new JSDOM('<main></main>'),view=dom.window.document.querySelector('main'),data=fixture();
 data.brand.name='<script>bad()</script>';data.brand.offerPdfUrl='javascript:bad()';data.brand.persona.imageUrl='javascript:bad()';
 try{
  await clientTaskReviewView({view,taskId:10,api:async()=>data});
  assert.equal(view.querySelector('script'),null);assert.equal(view.querySelector('[href^="javascript:"]'),null);assert.equal(view.querySelector('[src^="javascript:"]'),null);
  const img=view.querySelector('.ct-products img');img.dispatchEvent(new dom.window.Event('error'));
  assert.equal(img.hidden,true);assert.equal(img.closest('figure').querySelector('p').hidden,false);
 }finally{dom.window.close();}
});
