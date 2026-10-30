import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const source=readFileSync(new URL('./public/app.js',import.meta.url),'utf8');
const drawerSource=source.slice(source.indexOf('let leadDrawerRequest=0;'),source.indexOf('// Leads: filter chips'));
function fixture(t){
 const dom=new JSDOM('<aside id="drawer" hidden></aside>');t.after(()=>dom.window.close());const {document}=dom.window,state={selectedLead:null,dr:new Map()},requests=[],notices=[];
 const context=vm.createContext({document,state,$:s=>document.querySelector(s),esc:String,api:(path,body)=>{assert.equal(body,undefined,'Only mocked detail reads');return new Promise((resolve,reject)=>requests.push({path,resolve,reject}));},toast:(...args)=>notices.push(args),brandThumb:()=>'',leadStatusCell:()=>'',contactChip:()=>'',ic:()=>'',instaUrl:()=>'',socMark:()=>'',ideationPanel:()=>'<button data-retry-ideation>Retry</button>',clip:String,needText:{},renderStatus:{},reviewStatus:{},statusIcon:{},openPdf:()=>assert.fail('No PDF actions'),softRefresh:()=>{},route:()=>{}});
 vm.runInContext(drawerSource+'\nthis.show=openLead;this.close=closeLeadDrawer;',context);
 const finish=async(p,id,index=requests.length-1)=>{requests[index].resolve({lead:{id,company:`Fixture ${id}`,domain:`fixture-${id}.example`,status:'found'}});await p;};
 return {document,state,requests,notices,show:context.show,close:context.close,finish,escape:()=>document.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})),drawer:document.querySelector('#drawer'),fail:async(p,index=requests.length-1)=>{requests[index].reject(Error('Detail unavailable'));await p;}};
}
test('switching brands hides the old drawer controls while the new detail is pending',async t=>{
 const f=fixture(t);await f.finish(f.show(1),1);const pending=f.show(2);assert.equal(f.drawer.hidden,true);assert.equal(f.drawer.querySelector('[data-retry-ideation]'),null);await f.finish(pending,2);assert.equal(f.drawer.hidden,false);assert.equal(f.drawer.querySelector('h2').textContent,'Fixture 2');
});
test('a failed brand switch leaves no mismatched drawer ownership or unhandled rejection',async t=>{
 const f=fixture(t);await f.finish(f.show(1),1);const pending=f.show(2);await f.fail(pending);assert.equal(f.drawer.hidden,true);assert.equal(f.state.selectedLead,null);assert.deepEqual(f.notices,[['Detail unavailable','bad']]);assert.equal(f.state.dr.size,0);
});
test('a failed same-brand refresh retains its displayed details and reports the read error',async t=>{
 const f=fixture(t);await f.finish(f.show(1),1);const content=f.drawer.innerHTML,pending=f.show(1);await f.fail(pending);assert.equal(f.drawer.hidden,false);assert.equal(f.drawer.innerHTML,content);assert.equal(f.state.selectedLead,1);assert.equal(f.notices.length,1);
});
test('an older failed read cannot disturb a newer opened brand or report a stale error',async t=>{
 const f=fixture(t),older=f.show(1);await f.finish(f.show(2),2);await f.fail(older,0);assert.equal(f.drawer.querySelector('h2').textContent,'Fixture 2');assert.equal(f.state.selectedLead,2);assert.equal(f.notices.length,0);
});
test('an older failure for the same brand cannot report an error after its newer read succeeds',async t=>{
 const f=fixture(t),older=f.show(1);await f.finish(f.show(1),1);await f.fail(older,0);assert.equal(f.drawer.hidden,false);assert.equal(f.state.selectedLead,1);assert.equal(f.notices.length,0);
});
test('closing while a detail read waits suppresses its later failure',async t=>{
 const f=fixture(t),pending=f.show(1);f.close();await f.fail(pending);assert.equal(f.drawer.hidden,true);assert.equal(f.state.selectedLead,null);assert.equal(f.notices.length,0);
});
test('an initial failed read supports a successful explicit retry',async t=>{
 const f=fixture(t);await f.fail(f.show(1));await f.finish(f.show(1),1);assert.equal(f.drawer.hidden,false);assert.equal(f.state.selectedLead,1);assert.equal(f.drawer.querySelector('h2').textContent,'Fixture 1');assert.equal(f.requests.length,2);
});
test('Escape during a brand switch prevents the successful pending read from reopening it',async t=>{
 const f=fixture(t);await f.finish(f.show(1),1);const pending=f.show(2);f.escape();await f.finish(pending,2);assert.equal(f.drawer.hidden,true);assert.equal(f.state.selectedLead,null);
});
test('Escape during a brand switch suppresses its later read failure',async t=>{
 const f=fixture(t);await f.finish(f.show(1),1);const pending=f.show(2);f.escape();await f.fail(pending);assert.equal(f.drawer.hidden,true);assert.equal(f.state.selectedLead,null);assert.equal(f.notices.length,0);
});
