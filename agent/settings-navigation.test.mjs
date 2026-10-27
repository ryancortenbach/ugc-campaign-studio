import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {JSDOM} from 'jsdom';

const source=readFileSync(new URL('./public/app.js',import.meta.url),'utf8');
const settingsSource=source.slice(source.indexOf('async function settings('),source.indexOf('\nasync function voices('));
function fixture({loadState=async()=>{},api=async()=>({})}={}){
 const dom=new JSDOM('<main id="view"></main>'),{document,FormData}=dom.window,notices=[];
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const context=vm.createContext({document,FormData,$:selector=>document.querySelector(selector),loadState,api,esc,connRows:()=>[],autosize:()=>{},toast:(...args)=>notices.push(args),state:{config:{profile:{senderName:'Original sender',company:'Mint'}}}});
 vm.runInContext(settingsSource+'\nthis.mountSettings=settings;',context);
 return {dom,document,view:document.querySelector('#view'),mount:context.mountSettings,notices};
}

test('a delayed Settings load cannot replace the page opened after it',async()=>{
 let resolve,current=true;
 const f=fixture({loadState:()=>new Promise(done=>resolve=done)});
 try{
  const loading=f.mount(undefined,{isCurrent:()=>current});
  current=false;f.view.innerHTML='<h2>Current task</h2>';resolve();await loading;
  assert.equal(f.view.innerHTML,'<h2>Current task</h2>','Late settings response must not overwrite the current route');
 }finally{f.dom.window.close();}
});

test('the active Settings form retains edits after a failed save and supports retry',async()=>{
 let fail=true,calls=0;
 const f=fixture({api:async(path,body)=>{assert.equal(path,'/api/profile');assert.equal(body.senderName,'Updated sender');calls++;if(fail)throw Error('Temporary failure');return {};}});
 try{
  await f.mount(undefined,{isCurrent:()=>true});
  const form=f.document.querySelector('#profile'),input=form.querySelector('[name="senderName"]');
  input.value='Updated sender';input.dispatchEvent(new f.dom.window.Event('input',{bubbles:true}));
  await form.onsubmit({preventDefault(){}});
  assert.equal(f.document.querySelector('#pfstate').textContent,'Unsaved changes');
  assert.equal(f.document.querySelector('#pfsave').disabled,false);assert.equal(input.value,'Updated sender');
  assert.equal(f.notices.at(-1)[1],'bad');fail=false;
  await form.onsubmit({preventDefault(){}});
  assert.equal(calls,2);assert.equal(f.document.querySelector('#pfstate').textContent,'All changes saved');
  assert.equal(f.document.querySelector('#pfsave').disabled,true);assert.equal(f.notices.at(-1)[0],'Profile saved');
 }finally{f.dom.window.close();}
});
