import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {analyticsView} from './public/analytics.js';
import {summarizeAnalytics} from './analytics.mjs';
async function fixture(t,providers){
 const dom=new JSDOM('<main></main>',{url:'https://fixture.example/#/analytics'}),keys=['location','localStorage'],previous=Object.fromEntries(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 globalThis.location=dom.window.location;globalThis.localStorage=dom.window.localStorage;
 t.after(()=>{dom.window.close();for(const k of keys)if(previous[k])Object.defineProperty(globalThis,k,previous[k]);else delete globalThis[k];});
 const data=summarizeAnalytics({now:new Date('2026-10-29T13:24:38Z'),spend:providers.map(provider=>({at:'2026-10-29T12:00:00Z',provider,usd:.1}))}),view=dom.window.document.querySelector('main');let calls=0;
 await analyticsView({view,esc:String,api:async path=>{calls++;assert.equal(path,'/api/analytics?range=today');return data;}});
 return {view,data,calls,logos:[...view.querySelectorAll('.ap-an-logos img')]};
}
for(const id of ['constructor','toString','__proto__'])test(`unknown provider ${id} retains spend without a fabricated supported-provider logo`,async t=>{
 const f=await fixture(t,[id,'claude']);assert.equal(f.data.totals.spend,.2);assert.deepEqual(f.logos.map(x=>x.alt),['Claude']);assert.deepEqual(f.logos.map(x=>x.getAttribute('src')),['/logos/claude.png']);assert.equal(f.view.querySelectorAll('.ap-an-money-card strong')[1].textContent,'$0.20');assert.equal(f.calls,1);
});
test('only supported logos count toward the existing five-logo limit',async t=>{
 const f=await fixture(t,['fixture-provider','constructor','toString','__proto__','claude','exa','solari','higgsfield','elevenlabs','terac']);
 assert.equal(f.data.totals.spend,1);assert.deepEqual(f.logos.map(x=>x.alt),['Claude','Exa','Solari','Higgsfield','ElevenLabs']);assert.equal(f.logos.length,5);assert.equal(f.calls,1);
});
