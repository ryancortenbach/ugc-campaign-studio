import test from 'node:test';
import assert from 'node:assert/strict';
import {openStore} from './store.mjs';
import {createClientDemo} from './client-demo.mjs';
import {createClientReview} from './client-review.mjs';
import {spendingRequestAllowed} from './spending-policy.mjs';
function setup(t){
 const store=openStore(':memory:');t.after(()=>store.db.close());
 const brand={id:'test',name:'Test',website:'https://test.example',product:{summary:'Hoodie'},icp:{summary:'Audience hypothesis'},persona:{description:'Owned character',imageUrl:'/character.png'},script:{hook:'Hook'},sources:[],gaps:[],score:{total:50},storyboardImageUrl:'/storyboard.png'};
 const packet={preparedAt:'v1',brands:[brand]},clientDemo=createClientDemo({store,readPacket:()=>packet});
 const {task}=clientDemo.prepare('test'),review=createClientReview({store,clientDemo});
 return {store,brand,packet,task,review};
}
test('research and image feedback persists locally without authorizing production',t=>{
 const {store,task,review}=setup(t),current=review.get(task.id);
 const approved=review.review(task.id,{section:'research',version:current.versions.research,decision:'approved'});
 assert.equal(approved.reviews[0].decision,'approved');
 assert.equal(approved.reviews[0].mode,'local');
 review.review(task.id,{section:'images',version:current.versions.images,decision:'changes_requested',note:'Keep the hoodie artwork on the back.'});
 assert.equal(review.get(task.id).reviews.length,2);
 assert.equal(store.getTask(task.id).plan.clientDemo.productionAuthorized,false);
 assert.equal(store.spendSummary().total,0);
 assert.equal(store.listRenders().length,0);
 assert.equal(spendingRequestAllowed('POST',`/api/tasks/${task.id}/client-review`),true);
 assert.equal(spendingRequestAllowed('POST','/api/renders/1/approve'),false);
});
test('a simulated Terac result never becomes a real local approval or launches a panel',t=>{
 const {store,task,review,brand}=setup(t),current=review.get(task.id);
 const result=review.review(task.id,{section:'research',version:current.versions.research,decision:'approved',mode:'simulated'});
 assert.ok(!result.reviews.some(item=>item.mode==='local'));
 assert.equal(result.events.length,2);
 assert.equal(result.events[0].tool,'terac.review.simulated');
 assert.equal(result.events[1].data.output.realHumanPanel,false);
 assert.throws(()=>review.review(task.id,{section:'video',version:'anything',decision:'approved',mode:'simulated'}),error=>error.status===409);
 brand.sampleVideo={url:'/generated.mp4',requestId:'request-test'};
 const ready=review.get(task.id);
 review.review(task.id,{section:'video',version:ready.versions.video,decision:'approved',mode:'simulated'});
 assert.equal(store.spendSummary().total,0);
 assert.equal(store.listRenders().length,0);
});
test('new artifacts invalidate old reviews and stale approvals are rejected',t=>{
 const {task,review,packet}=setup(t),old=review.get(task.id);
 review.review(task.id,{section:'images',version:old.versions.images,decision:'approved'});
 packet.preparedAt='v2';
 assert.equal(review.get(task.id).reviews.length,0);
 assert.throws(()=>review.review(task.id,{section:'images',version:old.versions.images,decision:'approved'}),error=>error.status===409);
 assert.throws(()=>review.review(task.id,{section:'research',version:review.get(task.id).versions.research,decision:'changes_requested'}),/Describe/);
 assert.throws(()=>review.get(999),error=>error.status===404);
});
test('changed creative copy or garment photos invalidate the corresponding approval without a date change',t=>{
 const {task,review,brand}=setup(t);brand.assets=[{kind:'product',title:'Front',imageUrl:'/front-v1.jpg'}];
 const old=review.get(task.id);
 for(const section of ['research','images'])review.review(task.id,{section,version:old.versions[section],decision:'approved'});
 brand.script.hook='A revised creative angle';brand.assets[0].imageUrl='/front-v2.jpg';
 assert.equal(review.get(task.id).reviews.length,0);
 for(const section of ['research','images'])assert.throws(()=>review.review(task.id,{section,version:old.versions[section],decision:'approved'}),error=>error.status===409);
});
