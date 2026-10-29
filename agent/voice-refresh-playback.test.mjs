import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';

const source=readFileSync(new URL('./public/app.js',import.meta.url),'utf8'),start=source.indexOf('stream.onmessage=msg=>{');
const voiceBranch=source.slice(source.indexOf(" if(change.kind==='voice'",start),source.indexOf(" if(change.kind==='render'",start));
const refreshSource=source.slice(source.indexOf('const softRefresh='),source.indexOf('\n',source.indexOf('const softRefresh=')));
function fixture(t){
 const dom=new JSDOM('<audio></audio>');t.after(()=>dom.window.close());
 let paused=true,page='voices',refreshes=0,next=0;const timers=new Map();
 Object.defineProperty(dom.window.document.querySelector('audio'),'paused',{get:()=>paused});
 const context=vm.createContext({document:dom.window.document,tab:()=>page,route:()=>refreshes++,setTimeout:fn=>{timers.set(++next,fn);return next;},clearTimeout:id=>timers.delete(id)});
 vm.runInContext(`let refreshTimer;${refreshSource}\nthis.deliver=()=>{const change={kind:'voice'};${voiceBranch}};`,context);
 return {deliver:context.deliver,play:()=>paused=false,pause:()=>paused=true,leave:()=>page='tasks',refreshes:()=>refreshes,timers,
  flush:()=>{const callbacks=[...timers.values()];timers.clear();callbacks.forEach(fn=>fn());}};
}

test('starting a preview during the refresh delay prevents the pending route rebuild',t=>{
 const f=fixture(t);f.deliver();assert.equal(f.timers.size,1);f.play();f.flush();assert.equal(f.refreshes(),0);
});

test('a voice event received during playback does not schedule a refresh',t=>{
 const f=fixture(t);f.play();f.deliver();assert.equal(f.timers.size,0);assert.equal(f.refreshes(),0);
});

test('a pending voice refresh still runs when previews remain paused',t=>{
 const f=fixture(t);f.deliver();f.flush();assert.equal(f.refreshes(),1);
});

test('leaving Voices during the refresh delay prevents a late route rebuild',t=>{
 const f=fixture(t);f.deliver();f.leave();f.flush();assert.equal(f.refreshes(),0);
});

test('a later event can refresh normally after playback has paused',t=>{
 const f=fixture(t);f.deliver();f.play();f.flush();f.pause();f.deliver();f.flush();assert.equal(f.refreshes(),1);
});
