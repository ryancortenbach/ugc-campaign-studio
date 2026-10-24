import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {JSDOM} from 'jsdom';

const file=path.join(path.dirname(fileURLToPath(import.meta.url)),'public','panel-check.js');
const src=readFileSync(file,'utf8');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const tick=(ms=5)=>new Promise(r=>setTimeout(r,ms));

async function mount(api){
 const dom=new JSDOM('<!doctype html><body><div id="h"></div></body>',{url:'http://127.0.0.1:3200/',pretendToBeVisual:true});
 globalThis.document=dom.window.document;globalThis.EventSource=undefined;
 const url='data:text/javascript;base64,'+Buffer.from(src+`\n//${Math.random()}`).toString('base64');
 const m=await import(url);
 const toasts=[];
 m.panelSection({render:{id:7,status:'completed',result_url:'https://x/y.mp4'},api,esc,toast:(...a)=>toasts.push(a),host:dom.window.document.getElementById('h')});
 return {doc:dom.window.document,toasts};
}
const panel=over=>({id:3,render_id:7,status:'draft',participants:5,price_per_participant:7.5,total_usd:37.5,audience:{city:'New York City',state:'New York',age:'18 to 44',income:'$100,000 a year or more'},links:{draft_editor:'https://terac.test/d'},responses:0,score:null,...over});

test('no panel: a Terac Human check button creates a draft, then shows the stepper, chips and price', async()=>{
 const calls=[];let existing=[];
 const {doc}=await mount(async(p,body)=>{calls.push([p,body]);if(p.startsWith('/api/panels?'))return {panels:existing,ready:{terac:true,database:true}};if(p==='/api/renders/7/panel'){existing=[panel()];return {panel:panel()};}throw Error('unexpected '+p);});
 await tick();
 const btn=doc.querySelector('[data-pc=create]');assert.ok(btn);assert.match(btn.textContent,/Human check/);assert.ok(btn.querySelector('img[src="/logos/terac.png"]'));
 btn.click();await tick();
 assert.deepEqual(calls.find(c=>c[0]==='/api/renders/7/panel')[1],{participants:5});
 const t=doc.body.textContent;
 assert.match(t,/New York City, New York/);assert.match(t,/Age 18 to 44/);assert.match(t,/\$100,000/);assert.match(t,/\$7\.50/);assert.match(t,/\$37\.50/);
 assert.match(doc.querySelector('[data-pc=launch]').textContent,/Launch \$37\.50/);
});
test('launch needs Start in the row; Cancel backs out without a call', async()=>{
 const calls=[];
 const {doc}=await mount(async(p,body)=>{calls.push([p,body]);if(p.startsWith('/api/panels?'))return {panels:[panel()],ready:{}};if(p==='/api/panels/3/launch')return {panel:panel({status:'launched'})};throw Error('unexpected '+p);});
 await tick();
 doc.querySelector('[data-pc=launch]').click();
 assert.ok(doc.querySelector('[data-pc=start]')&&doc.querySelector('[data-pc=cancel]'));
 assert.equal(doc.querySelector('dialog,.scrim,[role=dialog]'),null);
 doc.querySelector('[data-pc=cancel]').click();
 assert.equal(calls.some(c=>c[0].endsWith('/launch')),false);
 doc.querySelector('[data-pc=launch]').click();doc.querySelector('[data-pc=start]').click();await tick();
 assert.deepEqual(calls.find(c=>c[0]==='/api/panels/3/launch')[1],{confirm:true});
 assert.match(doc.body.textContent,/0 of 5/);
});
test('stepper stays between 3 and 20 and posts the new size', async()=>{
 const calls=[];
 const {doc}=await mount(async(p,body)=>{calls.push([p,body]);if(p.startsWith('/api/panels?'))return {panels:[panel({participants:3})],ready:{}};return {panel:panel({participants:body.participants})};});
 await tick();
 assert.equal(doc.querySelector('[data-pc=less]').disabled,true);
 doc.querySelector('[data-pc=more]').click();await tick();
 assert.deepEqual(calls.find(c=>c[0]==='/api/panels/3/participants')[1],{participants:4});
});
test('a launched panel shows rated count and the score ring', async()=>{
 const {doc}=await mount(async p=>({panels:[panel({status:'launched',responses:2,score:74})],ready:{}}));
 await tick();
 assert.match(doc.body.textContent,/2 of 5/);assert.equal(doc.querySelector('.ring b').textContent,'74');
});
