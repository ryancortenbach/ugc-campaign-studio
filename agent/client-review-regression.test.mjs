import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {openStore} from './store.mjs';
import {createClientDemo} from './client-demo.mjs';
import {createClientReview} from './client-review.mjs';
import {clientTaskReviewView} from './public/client-task-review.js';

const brandFixture=()=>({id:'test',name:'Test',website:'https://test.example',product:{summary:'Shirt'},icp:{summary:'Audience hypothesis'},persona:{description:'Original creator',imageUrl:'/creator.png'},script:{hook:'Original creative angle'},sources:[],gaps:[],score:{total:1},storyboardImageUrl:'/concept.png',storyboardCaption:'Combined sheet: Test left, Other right. Static concept only.',assets:[{kind:'product',title:'Front',imageUrl:'/front-v1.png'}]});
for(const section of ['research','images'])test(`changes to displayed ${section} invalidate earlier approvals`,()=>{
 const store=openStore(':memory:'),brand=brandFixture(),packet={preparedAt:'v1',brands:[brand]};
 try{
  const clientDemo=createClientDemo({store,readPacket:()=>packet}),{task}=clientDemo.prepare('test'),review=createClientReview({store,clientDemo});
  const old=review.get(task.id);
  review.review(task.id,{section,version:old.versions[section],decision:'approved'});
  if(section==='research')brand.script.hook='Replacement creative angle';else brand.assets[0].imageUrl='/front-v2.png';
  const current=review.get(task.id);
  assert.notEqual(current.versions[section],old.versions[section]);
  assert.equal(current.reviews.filter(item=>item.section===section).length,0);
  assert.throws(()=>review.review(task.id,{section,version:old.versions[section],decision:'approved'}),error=>error.status===409);
 }finally{store.db.close();}
});
test('an older refresh cannot undo a newer successful approval in the mounted review',async()=>{
 const dom=new JSDOM('<main></main>'),view=dom.window.document.querySelector('main');
 const original={task:{id:10},brand:brandFixture(),versions:{research:'r1',images:'i1',video:null},reviews:[],events:[]};
 let phase=0,releaseRefresh;
 const api=async(path,body)=>{
  if(!body){if(phase===0)return structuredClone(original);return new Promise(resolve=>releaseRefresh=resolve);}
  if(phase++===0)throw Error('Temporary save failure');
  return {...structuredClone(original),reviews:[{section:'research',mode:'local',decision:'approved'}]};
 };
 try{
  await clientTaskReviewView({view,api,taskId:10});
  await view.querySelector('[data-ct-approve="research"]').onclick();
  view.querySelector('[data-ct-refresh]').click();
  const approval=view.querySelector('[data-ct-approve="research"]');
  if(!approval.disabled)await approval.onclick();
  releaseRefresh(structuredClone(original));await new Promise(resolve=>setImmediate(resolve));
  if(approval.disabled)await view.querySelector('[data-ct-approve="research"]').onclick();
  assert.equal(view.querySelector('[data-ct-approve="research"]').textContent,'Approved');
 }finally{dom.window.close();}
});
test('combined concept sheets retain the supplied brand mapping and limitations',async()=>{
 const dom=new JSDOM('<main></main>'),view=dom.window.document.querySelector('main'),brand=brandFixture();
 try{
  await clientTaskReviewView({view,api:async()=>({task:{id:10},brand,versions:{research:'r1',images:'i1',video:null},reviews:[],events:[]}),taskId:10});
  assert.ok(view.textContent.includes(brand.storyboardCaption));
 }finally{dom.window.close();}
});
