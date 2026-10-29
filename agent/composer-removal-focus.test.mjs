import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const source=readFileSync(new URL('./public/app.js',import.meta.url),'utf8');
const attachmentSource=source.slice(source.indexOf('function attachHTML(){'),source.indexOf('function composerHTML(){'));
const uploadSource=source.slice(source.indexOf('function bindAttach(){'),source.indexOf('async function sendComposer(){'));
function fixture(t,{files=2,links=['https://fixture.example'],readFail=false,uploadFail=false}={}){
 const dom=new JSDOM('<main id="view"><div id="cfiles"></div><form id="composer"><textarea aria-label="Message"></textarea></form></main>');t.after(()=>dom.window.close());
 const {document}=dom.window,comp={files:Array.from({length:files},(_,i)=>({key:'key'+i,name:'ref'+i+'.png',id:'id'+i})),links:[...links]},notices=[],calls=[];
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let failRead=readFail,failUpload=uploadFail;
 const context=vm.createContext({document,comp,$:s=>document.querySelector(s),esc,ic:()=>'',URL:{createObjectURL:f=>'blob:'+f.name,revokeObjectURL:()=>{}},
  FileReader:class{readAsDataURL(){if(failRead){failRead=false;this.onerror();}else{this.result='data:image/png;base64,fixture';this.onload();}}},
  api:async(path,body)=>{assert.equal(path,'/api/uploads');calls.push(body);if(failUpload){failUpload=false;throw Error('Fixture upload failed');}return {upload:{id:'new'+calls.length}};},toast:(...args)=>notices.push(args)});
 vm.runInContext(attachmentSource+uploadSource+'\ndocument.querySelector("#cfiles").innerHTML=attachHTML();bindAttach();',context);
 const button=i=>document.querySelectorAll('[data-unfile],[data-unlink]')[i];
 const remove=i=>{const b=button(i);b.focus();b.click();};
 return {document,comp,notices,calls,button,remove,add:context.addFiles};
}

test('removing a focused first file moves focus to the next attachment',t=>{
 const f=fixture(t);f.remove(0);assert.equal(f.comp.files.length,1);assert.equal(f.document.activeElement,f.button(0));
});
test('removing a focused final link moves focus to the previous attachment',t=>{
 const f=fixture(t);f.remove(2);assert.equal(f.comp.links.length,0);assert.equal(f.document.activeElement,f.button(1));
});
test('removing the sole attachment returns focus to the message',t=>{
 const f=fixture(t,{files:1,links:[]});f.remove(0);assert.equal(f.document.activeElement,f.document.querySelector('textarea'));
});
test('removing the sole link returns focus to the message',t=>{
 const f=fixture(t,{files:0});f.remove(0);assert.equal(f.document.activeElement,f.document.querySelector('textarea'));
});
test('a removal does not steal focus already in the message',t=>{
 const f=fixture(t),ta=f.document.querySelector('textarea');ta.focus();f.button(0).click();assert.equal(f.document.activeElement,ta);
});
test('a FileReader failure removes the failed item and a retry succeeds',async t=>{
 const f=fixture(t,{files:0,links:[],readFail:true}),file={name:'retry.png',size:20,type:'image/png'};
 await f.add([file]);assert.equal(f.comp.files.length,0);assert.equal(f.calls.length,0);assert.equal(f.notices[0][0],'Could not read retry.png');
 await f.add([file]);assert.equal(f.comp.files.length,1);assert.equal(f.comp.files[0].id,'new1');assert.equal(f.document.querySelectorAll('.cfile.up').length,0);
});
test('an upload failure retains other references and allows a retry',async t=>{
 const f=fixture(t,{files:1,uploadFail:true}),file={name:'retry.png',size:20,type:'image/png'};await f.add([file]);
 assert.equal(f.comp.files.length,1);assert.equal(f.comp.links.length,1);assert.equal(f.notices[0][0],'Fixture upload failed');
 await f.add([file]);assert.equal(f.comp.files.length,2);assert.equal(f.comp.files[1].id,'new2');
});

test('removing a middle attachment keeps focus at the same position',t=>{
 const f=fixture(t,{files:3,links:[]});f.remove(1);assert.equal(f.comp.files[1].key,'key2');assert.equal(f.document.activeElement,f.button(1));
});
test('returning to the message preserves its unsent text and selection',t=>{
 const f=fixture(t,{files:1,links:[]}),ta=f.document.querySelector('textarea');ta.value='Keep this unsent message';ta.setSelectionRange(5,9);f.remove(0);
 assert.equal(f.document.activeElement,ta);assert.equal(ta.value,'Keep this unsent message');assert.equal(ta.selectionStart,5);assert.equal(ta.selectionEnd,9);
});
