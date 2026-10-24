import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {rendersView,groupRenders,stateOf,mediaCandidates,defaultTab,tabCounts,tilesFor,dialogueOf,promptsOf} from './public/renders-view.js';

const R=(id,over={})=>({id,title:'Shot',endpoint:'xai/grok-imagine-image-2.0',input:{prompt:'p',resolution:'720p'},status:'checks_failed',checks:null,estimate_usd:null,request_id:null,result_url:null,local_file:null,error:null,review:null,review_note:null,lead_id:null,plan:null,created_at:'2026-10-24T20:00:00Z',...over});
const clip=(id,lead,over={},plan={})=>R(id,{lead_id:lead,title:`Brand${lead} video`,plan:{type:'product_clip',step:'still',hero:{index:3,title:'Black Thermal',kind:'top',imageUrl:'https://cdn.example/hero.png',price:'45.00'},still:{status:'pending',input:{prompt:'STILL PROMPT'},local_file:null},video:{status:'pending',input:{prompt:'Camera: x\nDialogue, spoken exactly: "Stay disobedient."\nVoice: y'}},...plan},...over});
const checks=scores=>({passed:true,results:scores.map((s,i)=>({id:'c'+i,name:'Checker '+i,score:s,summary:'Note '+i}))});
const fixture=()=>[
 clip(1,4,{status:'checks_failed'}),clip(2,4,{status:'checks_failed'}),
 clip(3,4,{status:'checks_passed',estimate_usd:'2.38',checks:checks([91,82,95])}),
 clip(4,5,{status:'checks_failed'}),clip(5,5,{status:'checks_failed'}),
 clip(6,6,{status:'checks_failed',error:'Concept budget reached ($0.41 of $0.4)'}),
 clip(7,7,{status:'in_progress'}),
 R(8,{title:'Disobedient: hoodie opening v2',status:'completed',review:'rejected',local_file:'a-v2.mp4',plan:{supersededByRenderId:9}}),
 R(9,{title:'Disobedient: hoodie opening v3',status:'completed',review:'pending',local_file:'a-v3.mp4'}),
 R(10,{title:'Loose shot',status:'failed',error:'credit low'}),
];
const names={4:'Disobedient',5:'Gifted Elite',6:'VYLIN',7:'BLAN'};
const tick=()=>new Promise(r=>setImmediate(r));

async function mount({renders=fixture(),paused=false,calls=[],arg}={}){
 const dom=new JSDOM('<!doctype html><main id="view"></main>',{url:'http://localhost/'});
 globalThis.CSS=dom.window.CSS||{escape:s=>s};
 const view=dom.window.document.querySelector('main');
 const api=async(path,body)=>{
  calls.push([path,body]);
  if(path==='/api/renders'&&body===undefined)return {renders,enabled:true};
  if(path==='/api/state')return {config:{spendingPaused:paused}};
  if(path==='/api/leads')return {leads:Object.entries(names).map(([id,company])=>({id:Number(id),company}))};
  return {};
 };
 const toasts=[];
 await rendersView({view,api,toast:(...a)=>toasts.push(a),arg,poll:false});
 return {dom,view,calls,toasts,api};
}

test('one tile per lead showing the latest version, with older versions behind a v badge', async()=>{
 const tiles=groupRenders(fixture(),names);
 const keys=tiles.map(t=>t.key).sort();
 assert.deepEqual(keys,['lead:4','lead:5','lead:6','lead:7','title:disobedient: hoodie opening','title:loose shot']);
 const d=tiles.find(t=>t.key==='lead:4');
 assert.equal(d.latest.id,3);assert.equal(d.count,3);assert.equal(d.name,'Disobedient');
 // A render superseded by a newer one joins its group instead of becoming a second tile.
 assert.equal(tiles.find(t=>t.key.startsWith('title:disobedient')).latest.id,9);
 const {view,dom}=await mount();
 try{
  assert.equal(view.querySelectorAll('.rv-card').length,5,'default tab is Needs you');
  view.querySelector('[data-tab="all"]').click();
  assert.equal(view.querySelectorAll('.rv-card').length,6);
  const cap=[...view.querySelectorAll('.rv-card')].find(c=>c.dataset.key==='lead:4').querySelector('.rv-cap');
  assert.match(cap.textContent,/Disobedient/);assert.match(cap.querySelector('.rv-ver').textContent,/^v3$/);
  const single=[...view.querySelectorAll('.rv-card')].find(c=>c.dataset.key==='lead:6');
  assert.equal(single.querySelector('.rv-ver'),null);
 }finally{dom.window.close();}
});

test('superseded checks_failed versions never show up as their own tile or in Needs you', async()=>{
 const list=[clip(1,4,{status:'checks_failed'}),clip(2,4,{status:'checks_failed'}),clip(3,4,{status:'completed',review:'approved',local_file:'x.mp4'})];
 const tiles=groupRenders(list,names);
 assert.equal(tiles.length,1);
 assert.equal(tabCounts(tiles).you,0);
 assert.equal(defaultTab(tiles),'all');
 assert.equal(tilesFor(tiles,'done').length,1);
});

test('default tab is Needs you when it has items, otherwise All', async()=>{
 assert.equal(defaultTab(groupRenders(fixture(),names)),'you');
 assert.equal(defaultTab(groupRenders([clip(1,4,{status:'completed',review:'approved',local_file:'x.mp4'})],names)),'all');
 const {view,dom}=await mount({renders:[clip(1,4,{status:'completed',review:'approved',local_file:'x.mp4'})]});
 try{assert.equal(view.querySelector('.rv-tabs .on').dataset.tab,'all');assert.equal(view.querySelectorAll('.rv-card').length,1);}finally{dom.window.close();}
});

test('status labels are one vocabulary and tabs carry icons and counts', async()=>{
 assert.equal(stateOf(R(1,{status:'checks_passed'})).label,'Needs approval');
 assert.equal(stateOf(R(1,{status:'checks_failed'})).label,'Needs work');
 assert.equal(stateOf(R(1,{status:'in_progress'})).label,'Rendering');
 assert.equal(stateOf(R(1,{status:'completed',review:'approved',local_file:'a.mp4'})).label,'Done');
 assert.equal(stateOf(R(1,{status:'completed',review:'pending',local_file:'a.mp4'})).label,'Needs review');
 const {view,dom}=await mount();
 try{
  const tabs=[...view.querySelectorAll('.rv-tabs button')];
  assert.deepEqual(tabs.map(b=>b.dataset.tab),['you','work','done','all']);
  assert.ok(tabs.every(b=>b.querySelector('svg')));
  assert.match(tabs[0].textContent,/Needs you\s*5/);
  assert.match(tabs[3].textContent,/All\s*6/);
  assert.ok(view.querySelector('.rv-pill svg'),'pill has an icon');
  assert.equal(view.querySelector('.rv-shimmer'),null,'only rendering tiles shimmer');
  view.querySelector('[data-tab="work"]').click();
  assert.ok(view.querySelector('.rv-pill.s-run svg'));assert.ok(view.querySelector('.rv-shimmer'));
 }finally{dom.window.close();}
});

test('media falls back from video to still to hero photo to the brand logo', async()=>{
 const done=clip(1,4,{status:'completed',local_file:'v.mp4'},{still:{local_file:'s.png',input:{prompt:'s'}}});
 // The exact hero URL the render was built from comes before the position-based cached copy, which carries a version tag.
 assert.deepEqual(mediaCandidates(done).map(c=>[c.kind,c.src.replace(/\?v=.*$/,'')]),[['video','/renders/v.mp4'],['still','/renders/s.png'],['hero','https://cdn.example/hero.png'],['hero','/api/leads/4/products/3/image']]);
 assert.match(mediaCandidates(done)[3].src,/\?v=[a-z0-9-]+$/);
 assert.equal(mediaCandidates(done)[0].poster,'/renders/s.png');
 const stillOnly=clip(2,4,{status:'checks_passed'},{still:{local_file:'s.png',input:{prompt:'s'}}});
 assert.equal(mediaCandidates(stillOnly)[0].kind,'still');
 const heroOnly=clip(3,4,{status:'checks_passed'});
 assert.deepEqual(mediaCandidates(heroOnly).map(c=>c.kind),['hero','hero']);
 assert.equal(mediaCandidates(R(4,{lead_id:4,title:'x'})).length,0);
 const {view,dom}=await mount({renders:[done,clip(5,5,{status:'checks_passed',estimate_usd:'2.38'}),R(6,{lead_id:6,title:'VYLIN video'}),R(7,{title:'Text only'})]});
 try{
  view.querySelector('[data-tab="all"]').click();
  const by=k=>view.querySelector(`.rv-card[data-key="${k}"]`);
  assert.ok(by('lead:4').querySelector('video[src="/renders/v.mp4"]'),'finished clip plays as video');
  assert.equal(by('lead:4').querySelector('video').getAttribute('poster'),'/renders/s.png');
  const hero=by('lead:5');assert.ok(hero.querySelector('img[src="https://cdn.example/hero.png"]'),'the exact hero photo the render used');assert.match(hero.textContent,/Concept/);
  const logo=by('lead:6');assert.ok(logo.querySelector('.rv-biglogo img[src="/api/leads/6/logo"]'),'text-only concept shows the brand logo large');
  assert.match(logo.textContent,/Concept/);
  assert.equal(by('title:text only').querySelector('.rv-biglogo.text b').textContent,'T');
  // A broken hero image advances to the next candidate, then to the logo tile.
  const img=hero.querySelector('.rv-media img');img.dispatchEvent(new dom.window.Event('error'));
  assert.ok(hero.querySelector('img[src^="/api/leads/5/products/3/image?v="]'),'then the cached copy');
  hero.querySelector('.rv-media img').dispatchEvent(new dom.window.Event('error'));
  assert.ok(hero.querySelector('.rv-biglogo'));
 }finally{dom.window.close();}
});

test('spending paused shows a disabled Approve with a chip up front and never calls approve', async()=>{
 const calls=[];
 const {view,dom}=await mount({paused:true,calls});
 try{
  assert.equal(view.querySelector('.rv-paused').hidden,false);
  const card=view.querySelector('.rv-card[data-key="lead:4"]');
  assert.match(card.querySelector('.rv-hover').textContent,/Spending paused/);
  card.click();
  const btn=[...view.querySelectorAll('.rvp button')].find(b=>/Approve \$2\.38/.test(b.textContent));
  assert.ok(btn,'approve button shows the price');assert.equal(btn.disabled,true);
  assert.ok(view.querySelector('.rvp-actions .rv-chip,.rvp-actions .rvp-tipwrap'));
  assert.match(view.querySelector('.rvp-tipwrap').dataset.tip,/paused/i);
  btn.click();
  assert.equal(view.querySelector('.rvp-confirm'),null);
  assert.ok(!calls.some(([p])=>/approve/.test(p)));
 }finally{dom.window.close();}
});

test('approve confirms in the panel with the price, then posts the estimate', async()=>{
 const calls=[];
 const {view,dom}=await mount({calls});
 try{
  view.querySelector('.rv-card[data-key="lead:4"]').click();
  const ap=[...view.querySelectorAll('.rvp button')].find(b=>/Approve \$2\.38/.test(b.textContent));assert.equal(ap.disabled,false);
  ap.click();
  assert.match(view.querySelector('.rvp-confirm').textContent,/Render for \$2\.38\?/);
  assert.ok(!calls.some(([p])=>/approve/.test(p)),'nothing is sent before Start');
  view.querySelector('[data-a="approve-no"]').click();
  assert.equal(view.querySelector('.rvp-confirm'),null);
  [...view.querySelectorAll('.rvp button')].find(b=>/Approve \$2\.38/.test(b.textContent)).click();
  view.querySelector('[data-a="approve-go"]').click();await tick();
  const sent=calls.filter(([p])=>/approve/.test(p));
  assert.deepEqual(sent,[['/api/renders/3/approve',{estimate:'2.38'}]]);
 }finally{dom.window.close();}
});

test('detail panel: versions strip, checker rings, collapsed prompts, hero chip, Esc closes with no scrim', async()=>{
 const {view,dom}=await mount();
 try{
  view.querySelector('.rv-card[data-key="lead:4"]').click();
  const panel=view.querySelector('.rvp');assert.equal(panel.hidden,false);
  assert.equal(panel.querySelectorAll('.rvp-v').length,3);
  assert.equal(panel.querySelectorAll('.rvp-rg').length,3);
  assert.equal(panel.querySelectorAll('.rvp-rg')[0].title,'Note 0');
  const det=[...panel.querySelectorAll('details')];
  assert.deepEqual(det.map(d=>d.querySelector('summary').textContent.trim()),['Still','Motion','Dialogue']);
  assert.ok(det.every(d=>!d.open));
  assert.match(det[2].textContent,/Stay disobedient/);
  assert.match(panel.querySelector('.rvp-hero').textContent,/Black Thermal/);assert.match(panel.querySelector('.rv-kind').textContent,/top/);
  assert.equal(view.querySelector('.scrim,.backdrop,[class*=scrim]'),null);
  panel.querySelector('.rvp-v:not(.on)').click();
  assert.notEqual(view.querySelector('.rvp-sub').textContent.indexOf('v'),-1);
  dom.window.document.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape'}));
  assert.equal(panel.hidden,true);
  view.querySelector('.rv-card[data-key="lead:4"]').click();
  panel.querySelector('[data-a="close"]').click();assert.equal(panel.hidden,true);
 }finally{dom.window.close();}
});

test('completed videos get Approve and Reject review buttons; reject needs a note', async()=>{
 const calls=[];
 const {view,dom}=await mount({calls});
 try{
  view.querySelector('.rv-card[data-key="title:disobedient: hoodie opening"]').click();
  assert.ok(view.querySelector('[data-mint-player] video:not([controls])'));assert.ok(view.querySelector('[data-mp-seek]'));
  view.querySelector('[data-a="rev-no"]').click();
  view.querySelector('[data-a="rev-send"]').click();await tick();
  assert.ok(!calls.some(([p])=>/review/.test(p)));
 }finally{dom.window.close();}
});

test('live patch updates a tile in place without rebuilding the grid', async()=>{
 const {view,dom}=await mount();
 try{
  const win=dom.window;view.querySelector('[data-tab="all"]').click();const card=view.querySelector('.rv-card[data-key="lead:4"]');
  card.querySelector('.rv-tile').dataset.mark='kept';
  win.mintRendersView.patch({...fixture()[2],id:3,status:'in_progress'});
  assert.equal(win.document.querySelector('.rv-card[data-key="lead:4"]'),card,'same element');
  assert.equal(view.querySelectorAll('.rv-tabs .n').length>0,true);
  view.querySelector('[data-tab="work"]').click();
  assert.match(view.querySelector('.rv-card[data-key="lead:4"] .rv-pill').textContent,/Rendering/);
 }finally{dom.window.close();}
});

test('deep link opens the detail panel on that render', async()=>{
 const {view,dom}=await mount({arg:9});
 try{assert.equal(view.querySelector('.rvp').hidden,false);assert.match(view.querySelector('.rvp-title').textContent,/Disobedient: hoodie opening/);}finally{dom.window.close();}
});

test('dialogue and prompt extraction', ()=>{
 assert.equal(dialogueOf('a\nDialogue, spoken exactly: "Hi."\nb'),'"Hi."');
 const p=promptsOf(clip(1,4));assert.equal(p.Still,'STILL PROMPT');assert.match(p.Motion,/Camera/);assert.equal(p.Dialogue,'"Stay disobedient."');
 assert.equal(promptsOf(R(2,{input:{prompt:'just motion'}})).Motion,'just motion');
});

test('no em dash characters in the new view files', ()=>{
 for(const f of ['public/renders-view.js','public/renders-view.css','renders-view.test.mjs'])assert.equal(readFileSync(new URL('./'+f,import.meta.url),'utf8').includes(String.fromCharCode(0x2014)),false,f);
});
