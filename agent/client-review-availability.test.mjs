import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {clientTaskReviewView} from './public/client-task-review.js';

const fixture=()=>({task:{id:10},brand:{name:'Fixture',icp:{summary:'Pending audience hypothesis'},assets:[]},versions:{research:'r1',images:null,video:null},reviews:[],events:[]});
const turn=()=>new Promise(resolve=>setImmediate(resolve));

test('unavailable sections do not offer a feedback action that cannot save',async t=>{
 const dom=new JSDOM('<main></main>');t.after(()=>dom.window.close());const view=dom.window.document.querySelector('main');
 const data=fixture();await clientTaskReviewView({view,taskId:10,api:async()=>data});
 const images=view.querySelector('[data-ct-edit="images"]');
 assert.equal(images.disabled,true,'Images without an artifact version cannot accept versioned feedback');
 images.click();assert.equal(view.querySelector('[data-ct-note="images"]'),null);
 assert.equal(view.querySelector('[data-ct-edit="research"]').disabled,false);
});

test('refreshing to a missing artifact removes the now-unsaveable editor',async t=>{
 const dom=new JSDOM('<main></main>');t.after(()=>dom.window.close());const view=dom.window.document.querySelector('main'),data=fixture();
 data.versions.images='i1';let initial=true,posts=0;
 await clientTaskReviewView({view,taskId:10,api:async(path,body)=>{
  if(body){posts++;throw Error('Artifact changed');}
  if(initial){initial=false;return data;}return {...data,versions:{...data.versions,images:null}};
 }});
 view.querySelector('[data-ct-edit="images"]').click();const input=view.querySelector('textarea');input.value='Keep this image feedback';input.dispatchEvent(new dom.window.Event('input'));
 await view.querySelector('form').onsubmit({preventDefault(){}});
 view.querySelector('[data-ct-refresh]').click();await turn();
 assert.equal(view.querySelector('[data-ct-edit="images"]').disabled,true);
 assert.equal(view.querySelector('[data-ct-note="images"]'),null);
 assert.match(view.textContent,/Creative images are not ready yet/);assert.equal(posts,1);
});

test('available sections still accept feedback for their displayed artifact version',async t=>{
 const dom=new JSDOM('<main></main>');t.after(()=>dom.window.close());const view=dom.window.document.querySelector('main'),data=fixture(),posts=[];
 data.versions.images='i1';await clientTaskReviewView({view,taskId:10,api:async(path,body)=>{if(body)posts.push(body);return data;}});
 const button=view.querySelector('[data-ct-edit="images"]');assert.equal(button.disabled,false);button.click();
 const input=view.querySelector('textarea');input.value='Adjust the sleeve';input.dispatchEvent(new dom.window.Event('input'));
 await view.querySelector('form').onsubmit({preventDefault(){}});
 assert.equal(posts.length,1);assert.equal(posts[0].version,'i1');assert.equal(posts[0].note,'Adjust the sleeve');
});
