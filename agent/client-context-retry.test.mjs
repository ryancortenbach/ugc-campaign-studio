import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {clientProjectView,taskStoryboardView,refreshTaskStoryboardActivity} from './public/task-storyboards.js';

async function fixture(t,{failPost=false,holdRefresh=false}={}){
 const dom=new JSDOM('<main></main>'),previous=Object.getOwnPropertyDescriptor(globalThis,'document');
 globalThis.document=dom.window.document;
 t.after(()=>{dom.window.close();if(previous)Object.defineProperty(globalThis,'document',previous);else delete globalThis.document;});
 const view=document.querySelector('main'),notices=[],posts=[];let domain=null,reads=0,release,enter;
 const entered=new Promise(resolve=>enter=resolve);
 const api=async(path,body)=>{
  if(path==='/api/whop/orders/pay_fixture/delivery')return {shots:[],ready:false};
  if(path==='/api/whop/orders/pay_fixture/context'){
   posts.push(body);if(failPost&&posts.length===1)throw Error('Save failed');domain=body.domain;return {};
  }
  assert.equal(path,'/api/whop/orders/pay_fixture/report');assert.equal(body,undefined);reads++;
  if(reads===2&&!failPost){if(holdRefresh){enter();await new Promise(resolve=>release=resolve);}throw Error('Report refresh failed');}
  return {workspace:{revision:1,task:{id:2,status:'needs_brand'},order:{payment_id:'pay_fixture',buyer_name:'Fixture client',brand_domain:domain},events:[]}};
 };
 const options={view,api,esc:String,toast:(...args)=>notices.push(args),paymentId:'pay_fixture'};
 await clientProjectView(options);
 return {view,api,options,notices,posts,reads:()=>reads,entered,release:()=>release(),form:()=>view.querySelector('.client-brand-form')};
}

test('a successful context save followed by failed report refresh can retry',async t=>{
 const f=await fixture(t),form=f.form();form.querySelector('input').value='fixture.example';
 await form.onsubmit({preventDefault(){}});
 assert.equal(f.reads(),2);assert.equal(form.querySelector('button').disabled,false);
 assert.equal(f.notices.at(-1)[0],'Report refresh failed');assert.equal(form.querySelector('input').value,'fixture.example');
 await form.onsubmit({preventDefault(){}});
 assert.equal(f.reads(),3,'Retry must still refresh the current client report');
 assert.equal(f.view.querySelector('h2').textContent,'fixture.example');assert.equal(f.form(),null);
});

test('a failed context POST keeps input and supports retry without starting research',async t=>{
 const f=await fixture(t,{failPost:true}),form=f.form();form.querySelector('input').value='fixture.example';
 await form.onsubmit({preventDefault(){}});
 assert.equal(form.querySelector('input').value,'fixture.example');assert.equal(form.querySelector('button').disabled,false);
 await form.onsubmit({preventDefault(){}});assert.equal(f.posts.length,2);
 assert.equal(f.view.querySelector('h2').textContent,'fixture.example');
});

test('a failed old report reload cannot take ownership from a newer task',async t=>{
 const f=await fixture(t,{holdRefresh:true}),form=f.form();form.querySelector('input').value='fixture.example';
 const pending=form.onsubmit({preventDefault(){}});await f.entered;
 const workspace={revision:1,task:{id:9,status:'researching'},lead:{company:'Current task'},events:[]};
 await taskStoryboardView({view:f.view,api:async()=>({workspace}),esc:String,taskId:9});
 f.release();await pending;workspace.task.status='ready';await refreshTaskStoryboardActivity();
 assert.equal(f.view.querySelector('h2').textContent,'Current task');
 assert.match(f.view.querySelector('#task-ideas-status').textContent,/Ideas ready/);
});
