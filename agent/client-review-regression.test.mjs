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
test('new video QA findings invalidate an earlier approval without replacing the clip',()=>{
 const store=openStore(':memory:'),brand=brandFixture();brand.sampleVideo={url:'/clip.mp4',requestId:'mock-request',status:'completed',visualQA:{status:'passed'}};
 try{
  const clientDemo=createClientDemo({store,readPacket:()=>({preparedAt:'v1',brands:[brand]})}),{task}=clientDemo.prepare('test'),review=createClientReview({store,clientDemo});
  const old=review.get(task.id);review.review(task.id,{section:'video',version:old.versions.video,decision:'approved'});
  brand.sampleVideo.visualQA={status:'needs_revision',findings:['Back artwork appears on the front.']};
  const current=review.get(task.id);
  assert.notEqual(current.versions.video,old.versions.video);assert.equal(current.reviews.length,0);
  assert.throws(()=>review.review(task.id,{section:'video',version:old.versions.video,decision:'approved'}),error=>error.status===409);
 }finally{store.db.close();}
});
test('a known video defect stays visible and the simulated reviewer requests changes',async()=>{
 const dom=new JSDOM('<main></main>'),view=dom.window.document.querySelector('main'),brand=brandFixture();
 brand.sampleVideo={url:'/clip.mp4',requestId:'mock-request',status:'needs_revision',visualQA:{status:'needs_revision',findings:['Back artwork appears on the front.']}};
 const data={task:{id:10},brand,versions:{research:'r1',images:'i1',video:'v1'},videoRenderId:42,reviews:['research','images','video'].map(section=>({section,mode:'local',decision:'approved'})),events:[]};
 let saved;
 try{
  await clientTaskReviewView({view,taskId:10,api:async(path,body)=>{if(body)saved=body;return structuredClone(data);}});
  assert.match(view.querySelector('.ct-heading').textContent,/Needs revision/);
  assert.match(view.querySelector('[data-ct-section="video"]').textContent,/Back artwork appears on the front/);
  assert.equal(view.querySelector('video'),null);assert.equal(view.querySelector('a[href="#/renders/42"]').textContent,'Review video');
  view.querySelector('[data-ct-terac="video"]').click();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(saved.mode,'simulated');assert.equal(saved.decision,'changes_requested');assert.equal(saved.note,brand.sampleVideo.visualQA.findings[0]);
 }finally{dom.window.close();}
});
