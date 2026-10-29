import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {rendersView} from './public/renders-view.js';

const record={id:7,title:'Fixture shot',status:'draft',input:{prompt:'Fixture'},plan:{},created_at:'2026-10-29T04:00:00Z'};
async function fixture(t){
 const dom=new JSDOM('<main></main>'),view=dom.window.document.querySelector('main'),calls=[];
 const api=async(path,body)=>{
  calls.push([path,body]);assert.equal(body,undefined,'This fixture only reads local mocked data');
  if(path==='/api/state')return {config:{spendingPaused:true}};
  if(path==='/api/leads')return {leads:[]};
  assert.equal(path,'/api/renders');return {renders:[record]};
 };
 const controller=await rendersView({view,api,poll:false});
 t.after(()=>{controller.stop();dom.window.close();});
 return {dom,view,calls,controller,document:dom.window.document};
}

test('selecting an empty render tab retains focus on the selected tab',async t=>{
 const f=await fixture(t),tab=f.view.querySelector('[data-tab="done"]');tab.focus();tab.click();
 assert.equal(f.view.querySelector('#render-empty').hidden,false);
 assert.equal(f.view.querySelector('.rv-grid').children.length,0);
 assert.equal(f.document.activeElement,f.view.querySelector('[data-tab="done"]'));
 assert.equal(f.document.activeElement.getAttribute('aria-selected'),'true');
});

test('stream updates preserve the focused render tab while counts change',async t=>{
 const f=await fixture(t),tab=f.view.querySelector('[data-tab="you"]');tab.focus();
 f.dom.window.mintRendersView.patch({...record,status:'in_progress'});
 assert.equal(f.document.activeElement,f.view.querySelector('[data-tab="you"]'));
 assert.equal(f.view.querySelector('#render-empty').hidden,false);
 assert.match(f.view.querySelector('[data-tab="work"]').textContent,/1/);
});

test('render tab updates do not steal focus from another control',async t=>{
 const f=await fixture(t),button=f.view.querySelector('[data-a="newshot"]');button.focus();
 f.dom.window.mintRendersView.patch({...record,status:'in_progress'});
 assert.equal(f.document.activeElement,button);assert.equal(f.calls.length,3);
});

test('gallery tiles retain existing keyboard open and Escape-close behavior',async t=>{
 const f=await fixture(t),card=f.view.querySelector('.rv-card');assert.equal(card.tabIndex,0);card.focus();
 card.dispatchEvent(new f.dom.window.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
 assert.equal(f.view.querySelector('.rvp').hidden,false);
 card.dispatchEvent(new f.dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
 assert.equal(f.view.querySelector('.rvp').hidden,true);
 card.dispatchEvent(new f.dom.window.KeyboardEvent('keydown',{key:' ',bubbles:true,cancelable:true}));
 assert.equal(f.view.querySelector('.rvp').hidden,false);assert.equal(f.calls.length,3);
});
