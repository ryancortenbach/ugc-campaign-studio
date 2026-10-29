import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';

const source=readFileSync(new URL('./public/app.js',import.meta.url),'utf8');
const attachmentSource=source.slice(source.indexOf('function attachHTML(){'),source.indexOf('function composerHTML(){'));
const uploadSource=source.slice(source.indexOf('function bindAttach(){'),source.indexOf('async function sendComposer(){'));
const file=name=>({name,type:'image/png',size:20});
function fixture(t,{failFirst=false}={}){
 const dom=new JSDOM('<main id="view"><div id="cfiles"></div></main>');t.after(()=>dom.window.close());
 const {document}=dom.window,comp={files:[],links:[]},calls=[],notices=[];
 let release,enter;const entered=new Promise(resolve=>enter=resolve),gate=new Promise(resolve=>release=resolve);
 const context=vm.createContext({document,comp,$:selector=>document.querySelector(selector),esc:String,ic:()=>'',
  URL:{createObjectURL:input=>`blob:${input.name}`,revokeObjectURL:()=>{}},
  FileReader:class{readAsDataURL(input){this.result='data:image/png;base64,fixture';this.onload();}},
  api:async(path,body)=>{assert.equal(path,'/api/uploads');calls.push(body);const id=calls.length;if(id===1){enter();await gate;if(failFirst)throw Error('Upload failed');}return {upload:{id:`upload-${id}`}};},
  toast:(...args)=>notices.push(args)});
 vm.runInContext(attachmentSource+uploadSource,context);
 return {document,comp,calls,notices,entered,release,add:context.addFiles};
}

test('a selected upload batch completes after leaving the composer view',async t=>{
 const f=fixture(t),pending=f.add([file('front.png'),file('back.png')]);await f.entered;
 f.document.querySelector('#view').innerHTML='<h2>Current task</h2>';f.release();await pending;
 assert.equal(f.calls.length,2);assert.equal(f.document.querySelector('#view').textContent,'Current task');
 assert.deepEqual(f.comp.files.map(item=>item.id),['upload-1','upload-2']);
 assert.ok(f.comp.files.every(item=>!item.uploading));
});

test('a failed upload does not abandon remaining selected files after navigation',async t=>{
 const f=fixture(t,{failFirst:true}),pending=f.add([file('front.png'),file('back.png')]);await f.entered;
 f.document.querySelector('#view').innerHTML='<h2>Current task</h2>';f.release();await pending;
 assert.equal(f.calls.length,2);assert.equal(f.comp.files.length,1);assert.equal(f.comp.files[0].name,'back.png');
 assert.equal(f.comp.files[0].id,'upload-2');assert.equal(f.notices[0][0],'Upload failed');
});

test('returning to a new composer host displays the completed batch',async t=>{
 const f=fixture(t),pending=f.add([file('front.png'),file('back.png')]);await f.entered;
 f.document.querySelector('#view').innerHTML='<div id="cfiles"></div>';f.release();await pending;
 assert.equal(f.document.querySelectorAll('.cfile').length,2);assert.equal(f.document.querySelectorAll('.cfile.up').length,0);
});

test('removing an in-flight attachment keeps it removed when the batch finishes',async t=>{
 const f=fixture(t),pending=f.add([file('front.png'),file('back.png')]);await f.entered;
 f.document.querySelector('[data-unfile]').click();f.release();await pending;
 assert.equal(f.comp.files.length,1);assert.equal(f.comp.files[0].name,'back.png');
 assert.equal(f.document.querySelectorAll('.cfile').length,1);assert.doesNotMatch(f.document.querySelector('#cfiles').textContent,/front/);
});

test('batch upload retains the existing size and attachment-count limits',async t=>{
 const f=fixture(t),pending=f.add([{...file('large.png'),size:6*1024*1024},...Array.from({length:6},(_,i)=>file(`ref-${i}.png`))]);
 await f.entered;f.release();await pending;
 assert.equal(f.calls.length,5);assert.equal(f.comp.files.length,5);
 assert.equal(f.notices[0][0],'large.png is over 5 MB');assert.equal(f.notices[1][0],'Attach up to 5 files');
});
