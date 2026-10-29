import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {openStore} from './store.mjs';
const source=readFileSync(new URL('./public/app.js',import.meta.url),'utf8');
const statsSource=source.slice(source.indexOf('const metricTabs='),source.indexOf('// Chat box: one composer'));
const turn=()=>new Promise(resolve=>setImmediate(resolve));
function data(range,count){
 const store=openStore(':memory:');try{for(let i=1;i<=count;i++){const row=store.createLead({taskId:1,company:`Fixture brand ${i}`,domain:`fixture-${i}.example`,url:`https://fixture-${i}.example`,market:'streetwear',territory:'NYC'});store.db.prepare('update leads set created_at=? where id=?').run('2026-10-29T12:15:00Z',row.id);}return store.metrics(range,new Date('2026-10-29T13:00:00Z'));}finally{store.db.close();}
}
function fixture(t){
 const dom=new JSDOM('<main><section id="stats"></section></main>');t.after(()=>dom.window.close());const {document}=dom.window,requests=[],preferences=new Map([['range','today']]),observers=[],opened=[];
 Object.defineProperty(dom.window.HTMLElement.prototype,'clientWidth',{get:()=>600});
 class Observer{constructor(){this.disconnected=false;observers.push(this);}observe(){}disconnect(){this.disconnected=true;}}
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const context=vm.createContext({document,$:s=>document.querySelector(s),pref:{get:(k,v)=>preferences.get(k)||v,set:(k,v)=>preferences.set(k,v)},esc,ResizeObserver:Observer,brandThumb:l=>`<span>${esc(l.company)}</span>`,openLead:id=>opened.push(id),setTimeout,api:path=>new Promise((resolve,reject)=>requests.push({path,resolve,reject}))});
 vm.runInContext(statsSource+'\nthis.load=loadStats;',context);
 const box=()=>document.querySelector('#stats');
 const initial=async()=>{const pending=context.load();requests.at(-1).resolve(data('today',1));await pending;};
 return {dom,document,requests,preferences,observers,opened,box,load:context.load,initial};
}
test('an older Home metrics response cannot replace the newer selected range or its brand markers',async t=>{
 const f=fixture(t);await f.initial();const older=f.load();f.box().querySelector('[data-range="year"]').click();f.requests[2].resolve(data('year',2));await turn();const current=f.box().innerHTML;f.requests[1].resolve(data('today',1));await older;assert.equal(f.box().innerHTML,current);assert.equal(f.box().querySelector('[data-range].on').dataset.range,'year');assert.match(f.box().querySelector('[data-metric="leads"]').textContent,/2/);
});
test('a response for a replaced stats host cannot disconnect the current chart observer',async t=>{
 const f=fixture(t);await f.initial();const older=f.load(),oldBox=f.box();oldBox.replaceWith(f.document.createElement('section'));f.document.querySelector('section').id='stats';const latest=f.load();f.requests[2].resolve(data('week',2));await latest;const observer=f.observers.at(-1);f.requests[1].resolve(data('today',1));await older;assert.equal(observer.disconnected,false);assert.equal(f.observers.length,2);assert.equal(oldBox.innerHTML.includes('Fixture brand 1'),true);
});
test('a detached stats host is not repainted by its late response',async t=>{
 const f=fixture(t);const pending=f.load(),box=f.box();box.remove();f.requests[0].resolve(data('today',1));await pending;assert.equal(box.innerHTML,'');assert.equal(f.observers.length,0);
});
test('an older response cannot mark the newly focused chart stale and force an extra read',async t=>{
 const f=fixture(t);await f.initial();const older=f.load(),latest=f.load();f.requests[2].resolve(data('today',2));await latest;const plot=f.box().querySelector('.plot');plot.focus();f.requests[1].resolve(data('today',1));await older;plot.blur();await turn();assert.equal(f.requests.length,3);
});
test('a current update received during chart inspection defers until focus leaves',async t=>{
 const f=fixture(t);await f.initial();const plot=f.box().querySelector('.plot');plot.focus();const pending=f.load();f.requests[1].resolve(data('today',2));await pending;assert.equal(f.box().querySelector('.plot'),plot);plot.blur();assert.equal(f.requests.length,3);f.requests[2].resolve(data('today',2));await turn();assert.match(f.box().querySelector('[data-metric="leads"]').textContent,/2/);
});
test('a single brand marker opens the recorded brand without another metrics request',async t=>{
 const f=fixture(t);await f.initial();f.box().querySelector('[data-mk="1"]').click();assert.deepEqual(f.opened,[1]);assert.equal(f.requests.length,1);assert.doesNotMatch(f.box().innerHTML,/NaN|Infinity/);
});

test('replacing an inspected stats host resets its hold and releases the old observer',async t=>{
 const f=fixture(t);await f.initial();f.box().querySelector('.plot').focus();const oldObserver=f.observers[0];f.box().replaceWith(f.document.createElement('section'));f.document.querySelector('section').id='stats';const pending=f.load();f.requests[1].resolve(data('week',2));await pending;assert.ok(f.box().querySelector('.plot'));assert.equal(oldObserver.disconnected,true);assert.match(f.box().querySelector('[data-metric="leads"]').textContent,/2/);
});
test('a detached chart blur callback cannot release inspection of the new chart',async t=>{
 const f=fixture(t);await f.initial();const oldPlot=f.box().querySelector('.plot');oldPlot.focus();f.box().replaceWith(f.document.createElement('section'));f.document.querySelector('section').id='stats';let pending=f.load();f.requests[1].resolve(data('today',2));await pending;const plot=f.box().querySelector('.plot');assert.ok(plot);plot.focus();oldPlot.dispatchEvent(new f.dom.window.Event('blur'));pending=f.load();f.requests[2].resolve(data('today',3));await pending;assert.equal(f.box().querySelector('.plot'),plot);plot.blur();assert.equal(f.requests.length,4);f.requests[3].resolve(data('today',3));await turn();assert.match(f.box().querySelector('[data-metric="leads"]').textContent,/3/);
});
