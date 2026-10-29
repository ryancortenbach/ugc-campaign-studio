import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {primaryLeadStatus} from './public/lead-badges.js';
import {draftReadiness} from './outreach.mjs';

const source=readFileSync(new URL('./public/app.js',import.meta.url),'utf8');
const mapsSource=source.slice(source.indexOf('async function loadDraftMaps('),source.indexOf('const lstat='));
const statusSource=source.slice(source.indexOf('function leadStatusCell('),source.indexOf('function leadRow('));
const drawerSource=source.slice(source.indexOf('let leadDrawerRequest=0;'),source.indexOf('// Leads: filter chips'));
const lead={id:1,company:'Fixture brand',domain:'fixture.example',status:'drafted',contact_kind:'instagram',instagram_handle:'fixture'};
const email={id:11,lead_id:1,status:'withdrawn',channel:'email',to_email:'info@fixture.example',gmail_url:'https://mail.google.com/#drafts/11'};
const render={id:41,status:'completed',result_url:'https://fixture.example/clip.mp4'};
const dm={id:22,lead_id:1,status:'dm_ready',channel:'instagram_dm',to_email:'@fixture',render_id:41,body:'Preview: '+render.result_url};
dm.readiness=draftReadiness({draft:dm,lead,render,instagram:true});
assert.equal(dm.readiness.ready,true);
function fixture(t){
 const dom=new JSDOM('<aside id="drawer" hidden></aside>');t.after(()=>dom.window.close());
 const {document}=dom.window,state={selectedLead:null,dr:new Map(),dm:new Map(),gmail:new Map()};let detail={lead,drafts:[dm,email]},drafts=[dm,email];
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const context=vm.createContext({document,state,$:s=>document.querySelector(s),esc,primaryLeadStatus,
  api:async(path,body)=>{assert.equal(body,undefined,'No actions allowed');assert.equal(path,'/api/leads/1');return structuredClone(detail);},
  tryGet:async path=>{assert.equal(path,'/api/drafts');return {drafts:structuredClone(drafts)};},
  ls:status=>status==='rejected'?['Not a fit','s-idle']:['Drafted','s-wait'],logoSrc:k=>'/logos/'+k+'.png',socialNames:{},providerName:{},statusIcon:{},
  brandThumb:()=>'',contactChip:()=>'',ic:()=>'',instaUrl:()=>'',socMark:()=>'',ideationPanel:()=>'',clip:String,
  needText:{},renderStatus:{},reviewStatus:{},openPdf:()=>{throw Error('Unexpected PDF action');},toast:()=>{},softRefresh:()=>{},route:()=>{}});
 vm.runInContext(mapsSource+statusSource+drawerSource+'\nthis.show=openLead;',context);
 return {state,document,maps:context.loadDraftMaps,show:()=>context.show(1),set:(next,list)=>{detail=next;if(list)drafts=list;},badge:()=>document.querySelector('[data-primary-status]')?.textContent};
}

test('fresh ready DM in the drawer supersedes its earlier waiting state',async t=>{
 const f=fixture(t),waiting={...dm,status:'waiting_video',readiness:{ready:false,missing:['clip']}};
 f.set({lead,drafts:[dm,email]},[waiting,email]);await f.maps();await f.show();
 assert.equal(f.badge(),'DM ready');assert.equal(f.document.querySelector('#sendbtn').disabled,false);
});

test('opening a ready DM without a cached DM map still shows its current milestone',async t=>{
 const f=fixture(t);await f.show();assert.equal(f.badge(),'DM ready');
});

test('requalified conversion exposes the DM while the withdrawn email only has a cleanup link',async t=>{
 const f=fixture(t);await f.maps();await f.show();
 assert.equal(f.state.gmail.has(1),false);assert.equal(f.state.dr.get(1).id,22);
 assert.equal(f.document.querySelectorAll('[aria-label="Open draft in Gmail"]').length,0);
 assert.equal(f.document.querySelectorAll('.oldmail').length,1);
 assert.match(f.document.querySelector('.oldmail').href,/#drafts\/11$/);
 assert.match(f.document.querySelector('#sendbtn').getAttribute('aria-label'),/DM to @fixture/);
});

test('a newer withdrawn row does not replace the active DM',async t=>{
 const f=fixture(t);f.set({lead,drafts:[{...email,id:33},dm,email]},[{...email,id:33},dm,email]);await f.maps();await f.show();
 assert.equal(f.state.dr.get(1).id,22);assert.equal(f.badge(),'DM ready');
});

test('missing Instagram connection remains the next blocker for a ready-status DM',async t=>{
 const f=fixture(t),blocked={...dm,readiness:{ready:false,missing:['instagram']}};f.set({lead,drafts:[blocked,email]},[blocked,email]);await f.maps();await f.show();
 assert.equal(f.badge(),'Connect Instagram');assert.equal(f.document.querySelector('#sendbtn').disabled,true);
});

test('rejected shared inbox remains rejected with a disabled email send control',async t=>{
 const f=fixture(t),rejected={...lead,status:'rejected',contact_kind:'role',contact_email:'info@fixture.example'},active={...email,status:'gmail_draft',gmail_draft_id:'g11'};
 active.readiness=draftReadiness({draft:active,lead:rejected});
 f.set({lead:rejected,drafts:[active]},[active]);await f.maps();await f.show();
 assert.equal(f.document.querySelector('#sendbtn').disabled,true);assert.equal(f.badge(),'Not a fit');assert.equal(f.document.querySelectorAll('[data-primary-status]').length,1);
});

test('an older cached ready DM does not label a newer primary email as DM ready',async t=>{
 const f=fixture(t),person={...lead,contact_kind:'personal',contact_email:'sarah@fixture.example'},current={...email,id:33,status:'gmail_draft',to_email:'sarah@fixture.example',gmail_draft_id:'g33',render_id:41,attachments:[{kind:'offer_pdf',filename:'offer.pdf',mime:'application/pdf'}]};
 current.readiness=draftReadiness({draft:current,lead:person,render});assert.equal(current.readiness.ready,true);
 f.set({lead:person,drafts:[current,dm]},[current,dm]);await f.maps();await f.show();
 assert.equal(f.badge(),'Drafted');
});
