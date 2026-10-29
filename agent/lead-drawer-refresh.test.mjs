import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';

const source=readFileSync(new URL('./public/app.js',import.meta.url),'utf8');
const start=source.indexOf('let leadDrawerRequest=0;');
const drawerSource=source.slice(start<0?source.indexOf('async function openLead(id){'):start,source.indexOf('// Leads: filter chips'));
function fixture(t){
 const dom=new JSDOM('<aside id="drawer" hidden></aside>');t.after(()=>dom.window.close());
 const {document}=dom.window,requests=[],state={selectedLead:null,dr:new Map()};
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const context=vm.createContext({document,state,$:selector=>document.querySelector(selector),esc,
  api:path=>new Promise(resolve=>requests.push({path,resolve})),brandThumb:()=>'',leadStatusCell:()=>'',contactChip:()=>'',ic:()=>'',instaUrl:()=>'',socMark:()=>'',ideationPanel:()=>'',clip:String,
  needText:{},renderStatus:{},reviewStatus:{},statusIcon:{},openPdf:()=>{throw Error('Unexpected PDF action');},toast:()=>{},softRefresh:()=>{},route:()=>{}});
 vm.runInContext(drawerSource+'\nthis.showLead=openLead;',context);
 const resolve=(index,id,company,draftId)=>requests[index].resolve({lead:{id,company,domain:`brand-${id}.example`,status:'drafted'},drafts:[{id:draftId,lead_id:id,to_email:'fixture@example.invalid',status:'gmail_draft',gmail_url:`https://mail.google.com/#drafts/${draftId}`,readiness:{ready:false,missing:['clip']}}]});
 return {dom,document,state,requests,resolve,show:context.showLead,drawer:document.querySelector('#drawer')};
}

test('a slower refresh of the same lead cannot replace its newer drawer or draft map',async t=>{
 const f=fixture(t),old=f.show(1),current=f.show(1);
 f.resolve(1,1,'Current brand',22);await current;
 f.resolve(0,1,'Older brand',11);await old;
 assert.equal(f.drawer.querySelector('h2').textContent,'Current brand');assert.equal(f.state.dr.get(1).id,22);
 assert.match(f.drawer.querySelector('[aria-label="Open draft in Gmail"]').href,/#drafts\/22$/);
});

test('returning to a lead does not revive its older in-flight response',async t=>{
 const f=fixture(t),first=f.show(1),middle=f.show(2),latest=f.show(1);
 f.resolve(2,1,'Latest first brand',33);await latest;
 f.resolve(1,2,'Second brand',22);await middle;
 f.resolve(0,1,'Old first brand',11);await first;
 assert.equal(f.drawer.querySelector('h2').textContent,'Latest first brand');assert.equal(f.state.dr.get(1).id,33);assert.equal(f.state.dr.has(2),false);
});

test('opening another lead keeps its drawer when an earlier read finishes',async t=>{
 const f=fixture(t),first=f.show(1),second=f.show(2);
 f.resolve(1,2,'Second brand',22);await second;f.resolve(0,1,'First brand',11);await first;
 assert.equal(f.drawer.querySelector('h2').textContent,'Second brand');assert.equal(f.state.selectedLead,2);assert.equal(f.state.dr.has(1),false);
});

test('closing the drawer prevents a pending refresh from reopening it',async t=>{
 const f=fixture(t),initial=f.show(1);f.resolve(0,1,'Initial brand',11);await initial;
 const refresh=f.show(1);f.drawer.querySelector('#close').click();f.resolve(1,1,'Late brand',22);await refresh;
 assert.equal(f.drawer.hidden,true);assert.equal(f.state.selectedLead,null);assert.equal(f.state.dr.get(1).id,11);
});
