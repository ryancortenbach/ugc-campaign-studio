import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const source=readFileSync(new URL('./public/app.js',import.meta.url),'utf8');
const drawerSource=source.slice(source.indexOf('let leadDrawerRequest=0;'),source.indexOf('// Leads: filter chips'));
function fixture(t){
 const dom=new JSDOM('<button id="first">First brand</button><button id="second">Second brand</button><button id="other">Other control</button><aside id="drawer" hidden></aside>');t.after(()=>dom.window.close());
 const {document}=dom.window,state={selectedLead:null,dr:new Map()},requests=[];
 const context=vm.createContext({document,state,$:s=>document.querySelector(s),esc:String,api:path=>new Promise(resolve=>requests.push({path,resolve})),brandThumb:()=>'',leadStatusCell:()=>'',contactChip:()=>'',ic:()=>'',instaUrl:()=>'',socMark:()=>'',ideationPanel:()=>'',clip:String,needText:{},renderStatus:{},reviewStatus:{},statusIcon:{},openPdf:()=>assert.fail('No PDF action'),toast:()=>{},softRefresh:()=>{},route:()=>{}});
 vm.runInContext(drawerSource+'\nthis.show=openLead;',context);
 const open=async(id,trigger)=>{if(trigger)document.querySelector(trigger).focus();const pending=context.show(id);requests.at(-1).resolve({lead:{id,company:`Fixture ${id}`,domain:`fixture-${id}.example`,status:'found'}});await pending;};
 return {dom,document,state,requests,show:context.show,open,drawer:document.querySelector('#drawer'),close:()=>document.querySelector('#close'),escape:()=>document.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}))};
}
test('closing from the focused close button returns focus to the brand trigger',async t=>{
 const f=fixture(t);await f.open(1,'#first');f.close().focus();f.close().click();assert.equal(f.drawer.hidden,true);assert.equal(f.state.selectedLead,null);assert.equal(f.document.activeElement,f.document.querySelector('#first'));
});
test('Escape from a drawer link restores its brand trigger',async t=>{
 const f=fixture(t);await f.open(1,'#first');f.drawer.querySelector('a').focus();f.escape();assert.equal(f.drawer.hidden,true);assert.equal(f.document.activeElement,f.document.querySelector('#first'));
});
test('refreshing the same drawer does not replace its external return target',async t=>{
 const f=fixture(t);await f.open(1,'#first');f.close().focus();await f.open(1);f.close().focus();f.escape();assert.equal(f.document.activeElement,f.document.querySelector('#first'));
});
test('Escape while focus is outside the drawer does not steal that focus',async t=>{
 const f=fixture(t);await f.open(1,'#first');f.document.querySelector('#other').focus();f.escape();assert.equal(f.drawer.hidden,true);assert.equal(f.document.activeElement,f.document.querySelector('#other'));
});
test('a removed return target is never focused on drawer close',async t=>{
 const f=fixture(t);await f.open(1,'#first');const trigger=f.document.querySelector('#first');trigger.remove();trigger.focus=()=>assert.fail('Detached target must not receive focus');f.close().focus();f.close().click();assert.equal(f.drawer.hidden,true);assert.equal(f.state.selectedLead,null);
});
test('a stale request cannot replace the newer drawer return target',async t=>{
 const f=fixture(t);f.document.querySelector('#first').focus();const older=f.show(1);await f.open(2,'#second');f.requests[0].resolve({lead:{id:1,company:'Stale fixture',domain:'stale.example',status:'found'}});await older;f.close().focus();f.escape();assert.equal(f.document.activeElement,f.document.querySelector('#second'));
});
