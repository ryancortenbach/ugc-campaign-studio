import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {rendersView} from './public/renders-view.js';

async function fixture(t){
 const dom=new JSDOM('<main></main>'),document=dom.window.document,view=document.querySelector('main');
 const renders=[7,8].map(id=>({id,title:`Fixture shot (v${id-6})`,status:'draft',input:{prompt:'Fixture'},plan:{},created_at:'2026-10-29T04:00:00Z'}));
 const api=async(path,body)=>{
  assert.equal(body,undefined,'Only mocked reads are allowed');
  if(path==='/api/state')return {config:{spendingPaused:true}};
  if(path==='/api/leads')return {leads:[]};
  assert.equal(path,'/api/renders');return {renders};
 };
 const controller=await rendersView({view,api,poll:false});
 t.after(()=>{controller.stop();dom.window.close();});
 const card=view.querySelector('.rv-card');card.focus();card.click();
 const escape=()=>document.activeElement.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
 return {dom,document,view,card,escape};
}

test('closing render details returns focus to its gallery card',async t=>{
 const f=await fixture(t),close=f.view.querySelector('[data-a="close"]');close.focus();close.click();
 assert.equal(f.view.querySelector('.rvp').hidden,true);assert.equal(f.document.activeElement,f.card);
});

test('Escape from a panel prompt returns focus to its gallery card',async t=>{
 const f=await fixture(t);f.view.querySelector('.rvp-pr summary').focus();f.escape();
 assert.equal(f.view.querySelector('.rvp').hidden,true);assert.equal(f.document.activeElement,f.card);
});

test('switching render versions preserves focus on the selected version',async t=>{
 const f=await fixture(t),version=f.view.querySelector('[data-a="ver"][data-rid="7"]');version.focus();version.click();
 const selected=f.view.querySelector('[data-a="ver"].on');
 assert.equal(selected.dataset.rid,'7');assert.equal(f.document.activeElement,selected);
});

test('Escape after switching versions returns focus to the same gallery card',async t=>{
 const f=await fixture(t),version=f.view.querySelector('[data-a="ver"][data-rid="7"]');version.focus();version.click();
 f.view.querySelector('[data-a="close"]').focus();f.escape();
 assert.equal(f.document.activeElement,f.card);
});

test('closing details after filtering its card returns focus to the selected tab',async t=>{
 const f=await fixture(t);f.view.querySelector('[data-tab="done"]').click();
 assert.equal(f.card.isConnected,false);f.view.querySelector('[data-a="close"]').focus();f.escape();
 assert.equal(f.document.activeElement,f.view.querySelector('[data-tab="done"]'));
});

test('Escape outside the panel preserves the external focused control',async t=>{
 const f=await fixture(t),button=f.view.querySelector('[data-a="newshot"]');button.focus();f.escape();
 assert.equal(f.view.querySelector('.rvp').hidden,true);assert.equal(f.document.activeElement,button);
});
