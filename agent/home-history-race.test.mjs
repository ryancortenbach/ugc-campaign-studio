import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';

const source=readFileSync(new URL('./public/app.js',import.meta.url),'utf8');
const snippets=[
 source.slice(source.indexOf('function syncComposer(){'),source.indexOf('function closeMenus(){')),
 source.slice(source.indexOf('async function sendComposer(){'),source.indexOf('// Speech:')),
 source.slice(source.indexOf('function threadHTML(){'),source.indexOf('function paintChatActivity(){')),
 source.slice(source.indexOf('function paintThread(){'),source.indexOf('async function home(){'))
].join('\n');
const history=[{role:'assistant',text:'Saved conversation'}];
const texts=messages=>Array.from(messages,m=>m.text);
function fixture(t){
 const dom=new JSDOM('<main class="home"><div id="thread"></div><form id="composer"><textarea name="message"></textarea><button id="csend" type="button"></button><button id="cdictate" type="button"></button></form></main>',{url:'https://fixture.example/#/home'});
 t.after(()=>dom.window.close());dom.window.HTMLElement.prototype.scrollIntoView=function(){};
 Object.defineProperty(dom.window.HTMLFormElement.prototype,'message',{get(){return this.elements.namedItem('message');}});
 const document=dom.window.document,thread={messages:structuredClone(history),thinking:false,ok:true},comp={tool:'mission',files:[],links:[],busy:false},reads=[],posts=[],notices=[];
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const context=vm.createContext({document,location:dom.window.location,thread,comp,listening:null,$:s=>document.querySelector(s),esc,ic:()=>'',claudeAv:()=>'',paintChatActivity:()=>{},
  currentModel:()=> 'fixture-model',tab:()=> 'home',voice:{speak:()=>{}},toast:(...a)=>notices.push(a),
  api:(path,body)=>{assert.equal(path,'/api/assistant');return new Promise((resolve,reject)=>(body===undefined?reads:posts).push({body,resolve:value=>resolve(structuredClone(value)),reject}));}});
 vm.runInContext(snippets,context);context.paintThread();
 return {document,thread,comp,reads,posts,notices,load:context.loadThread,send:()=>{document.querySelector('textarea').value='New message';return context.sendComposer();}};
}

test('a late history read cannot overwrite a newer history response',async t=>{
 const f=fixture(t),old=f.load(),latest=f.load();
 f.reads[1].resolve({messages:[{role:'assistant',text:'Newest saved reply'}]});await latest;
 f.reads[0].resolve({messages:[]});await old;
 assert.deepEqual(texts(f.thread.messages),['Newest saved reply']);assert.match(f.document.querySelector('#thread').textContent,/Newest saved reply/);
});

test('a stale history failure cannot disable a newer successful conversation',async t=>{
 const f=fixture(t),old=f.load(),latest=f.load();f.reads[1].resolve({messages:history});await latest;
 f.reads[0].reject(Error('Old read failed'));await old;assert.equal(f.thread.ok,true);
});

test('history requested before a message cannot erase the pending user turn',async t=>{
 const f=fixture(t),read=f.load(),sent=f.send();
 f.reads[0].resolve({messages:history});await read;
 const during=texts(f.thread.messages),shown=f.document.querySelector('#thread').textContent;
 f.posts[0].resolve({reply:'Current reply'});await sent;
 assert.deepEqual(during,['Saved conversation','New message']);assert.match(shown,/New message/);
 assert.deepEqual(texts(f.thread.messages),['Saved conversation','New message','Current reply']);
});

test('history requested before a message cannot erase its already completed reply',async t=>{
 const f=fixture(t),read=f.load(),sent=f.send();f.posts[0].resolve({reply:'Current reply'});await sent;
 f.reads[0].resolve({messages:history});await read;
 assert.deepEqual(texts(f.thread.messages),['Saved conversation','New message','Current reply']);assert.match(f.document.querySelector('#thread').textContent,/Current reply/);
});

test('opening Home during a pending reply does not start another history replacement',async t=>{
 const f=fixture(t),sent=f.send(),read=f.load(),requested=f.reads.length;
 if(f.reads.length)f.reads[0].resolve({messages:history});await read;f.posts[0].resolve({reply:'Current reply'});await sent;
 assert.equal(requested,0);assert.deepEqual(texts(f.thread.messages),['Saved conversation','New message','Current reply']);
});

test('an old history response cannot make a failed reply remove a saved conversation turn',async t=>{
 const f=fixture(t),read=f.load(),sent=f.send();f.reads[0].resolve({messages:history});await read;
 f.posts[0].reject(Error('Reply failed'));await sent;
 assert.deepEqual(texts(f.thread.messages),['Saved conversation']);assert.equal(f.document.querySelector('textarea').value,'New message');assert.equal(f.comp.busy,false);
});

test('a current failed history read preserves messages and a later read can recover',async t=>{
 const f=fixture(t),failed=f.load();f.reads[0].reject(Error('Read failed'));await failed;
 assert.equal(f.thread.ok,false);assert.deepEqual(texts(f.thread.messages),['Saved conversation']);
 const retry=f.load();f.reads[1].resolve({messages:[{role:'assistant',text:'Recovered history'}]});await retry;
 assert.equal(f.thread.ok,true);assert.deepEqual(texts(f.thread.messages),['Recovered history']);
});

test('fresh history can still replace the conversation after a reply has finished',async t=>{
 const f=fixture(t),sent=f.send();f.posts[0].resolve({reply:'Current reply'});await sent;
 const read=f.load();f.reads[0].resolve({messages:[...history,{role:'user',text:'New message'},{role:'assistant',text:'Current reply'},{role:'assistant',text:'Later saved activity'}]});await read;
 assert.deepEqual(texts(f.thread.messages),['Saved conversation','New message','Current reply','Later saved activity']);assert.match(f.document.querySelector('#thread').textContent,/Later saved activity/);
});
