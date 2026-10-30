import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {rendersView} from './public/renders-view.js';
const record=id=>({id,lead_id:3,title:`Fixture shot (v${id-6})`,status:'draft',input:{prompt:`Fixture prompt ${id}`},plan:{},created_at:'2026-10-30T20:00:00Z'});
async function fixture(t){
 const dom=new JSDOM('<main></main>'),document=dom.window.document,view=document.querySelector('main'),calls=[];
 const api=async(path,body)=>{calls.push(path);assert.equal(body,undefined,'Mocked reads only');if(path==='/api/state')return {config:{spendingPaused:true}};if(path==='/api/leads')return {leads:[{id:3,company:'Fixture brand'}]};assert.equal(path,'/api/renders');return {renders:[record(7),record(8)]};};
 const controller=await rendersView({view,api,poll:false});t.after(()=>{controller.stop();dom.window.close();});view.querySelector('.rv-card').click();
 const version=id=>view.querySelector(`[data-a="ver"][data-rid="${id}"]`),select=id=>{version(id).focus();version(id).click();};
 return {view,document,calls,version,select,patch:r=>dom.window.mintRendersView.patch(r)};
}
test('a new rendering version retains the inspected historical version and focus after filtering its card',async t=>{
 const f=await fixture(t);f.select(7);f.patch({...record(9),status:'in_progress'});
 assert.equal(f.view.querySelector('.rv-card'),null);assert.equal(f.view.querySelector('[data-a="ver"].on').dataset.rid,'7');assert.equal(f.document.activeElement,f.version(7));assert.match(f.view.querySelector('.rvp-sub').textContent,/#7/);assert.equal(f.calls.length,3);
});
test('an inspected version status update retains version focus and shows fresh status',async t=>{
 const f=await fixture(t);f.select(7);f.patch({...record(7),status:'failed',error:'Fixture failure'});
 assert.equal(f.document.activeElement,f.version(7));assert.match(f.view.querySelector('.rvp-head').textContent,/Failed/);assert.match(f.view.querySelector('.rvp-body').textContent,/Fixture failure/);
});
test('a focused unselected version stays focused without changing the inspected version',async t=>{
 const f=await fixture(t);f.select(7);f.version(8).focus();f.patch(record(9));assert.equal(f.document.activeElement,f.version(8));assert.equal(f.view.querySelector('[data-a="ver"].on').dataset.rid,'7');
});
test('version updates preserve newer focus outside the detail panel',async t=>{
 const f=await fixture(t);f.select(7);const outside=f.view.querySelector('[data-a="newshot"]');outside.focus();f.patch(record(9));assert.equal(f.document.activeElement,outside);assert.equal(f.view.querySelector('[data-a="ver"].on').dataset.rid,'7');
});
test('an identical stream record preserves its focused version element',async t=>{
 const f=await fixture(t);f.select(7);const button=f.version(7);f.patch(record(7));assert.equal(f.document.activeElement,button);assert.equal(f.version(7),button);
});
test('closing the filtered historical panel after an update returns focus to the selected tab',async t=>{
 const f=await fixture(t);f.select(7);f.patch({...record(9),status:'in_progress'});const close=f.view.querySelector('[data-a="close"]');close.focus();close.click();assert.equal(f.view.querySelector('.rvp').hidden,true);assert.equal(f.document.activeElement,f.view.querySelector('[data-tab="you"]'));
});
