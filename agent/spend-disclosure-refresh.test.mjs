import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const source=readFileSync(new URL('./public/app.js',import.meta.url),'utf8');
const spendSource=source.slice(source.indexOf('const usd=n=>'),source.indexOf('// Connections tab: logo'));
const costs=(a=5,b=2)=>({allTimeUsd:a+b,todayUsd:a+b,coverage:'complete',providers:[{id:'higgsfield',name:'Higgsfield',spentUsd:a,detail:'Fixture account detail'},{id:'elevenlabs',name:'ElevenLabs',spentUsd:b,detail:'Fixture usage detail'}]});
function fixture(t){
 const dom=new JSDOM('<aside id="spendbody"></aside>');t.after(()=>dom.window.close());const {document}=dom.window,state={},requests=[];
 const context=vm.createContext({document,state,railTab:'spend',esc:v=>String(v).replaceAll('&','&amp;').replaceAll('"','&quot;'),$:s=>document.querySelector(s),providerName:{higgsfield:'Higgsfield',elevenlabs:'ElevenLabs'},logoImg:()=>'',
  tryGet:path=>{assert.ok(['/api/costs','/api/whop','/api/spend'].includes(path));return new Promise(resolve=>requests.push({path,resolve}));}});
 vm.runInContext(spendSource,context);
 const provider=name=>[...document.querySelectorAll('.sp-provider')].find(n=>n.querySelector('.sp-top b').textContent===name);
 const refresh=async data=>{const at=requests.length,p=context.renderSpend();requests[at].resolve(data);requests[at+1].resolve(null);await p;};
 return {document,state,requests,provider,refresh,load:context.renderSpend,paint:context.paintSpend};
}
test('provider billing details remain expanded during an unrelated repaint',async t=>{
 const f=fixture(t);await f.refresh(costs());f.provider('Higgsfield').open=true;f.paint();
 assert.equal(f.provider('Higgsfield').open,true);assert.equal(f.provider('ElevenLabs').open,false);
});
test('updated spending and row ordering preserve each provider disclosure choice',async t=>{
 const f=fixture(t);await f.refresh(costs());f.provider('Higgsfield').open=true;await f.refresh(costs(1,9));
 assert.equal(f.document.querySelector('.sp-top b').textContent,'ElevenLabs');
 assert.equal(f.provider('Higgsfield').open,true);assert.equal(f.provider('ElevenLabs').open,false);
 assert.match(f.document.querySelector('#spendbody').textContent,/\$10\.00/);
});
test('a disclosure closed during a pending read stays closed when it finishes',async t=>{
 const f=fixture(t);await f.refresh(costs());f.provider('Higgsfield').open=true;
 const at=f.requests.length,p=f.load();f.provider('Higgsfield').open=false;f.requests[at].resolve(costs(3,4));f.requests[at+1].resolve(null);await p;
 assert.equal(f.provider('Higgsfield').open,false);
});
test('failed modern and legacy reads preserve the existing open provider details',async t=>{
 const f=fixture(t);await f.refresh(costs());const existing=f.provider('Higgsfield');existing.open=true;
 const at=f.requests.length,p=f.load();f.requests[at].resolve(null);f.requests[at+1].resolve(null);await new Promise(setImmediate);
 f.requests[at+2].resolve(null);await p;assert.equal(f.provider('Higgsfield'),existing);assert.equal(existing.open,true);
});
test('legacy spend fallback preserves expansion for the same provider',async t=>{
 const f=fixture(t);await f.refresh(costs());f.provider('Higgsfield').open=true;
 const at=f.requests.length,p=f.load();f.requests[at].resolve(null);f.requests[at+1].resolve(null);await new Promise(setImmediate);
 f.requests[at+2].resolve({total:3,today:1,providers:[{provider:'higgsfield',total:3,today:1,count:2}]});await p;
 assert.equal(f.provider('Higgsfield').open,true);assert.equal(f.provider('ElevenLabs'),undefined);
});
test('new providers start collapsed and removed providers do not transfer expansion',async t=>{
 const f=fixture(t);await f.refresh(costs());f.provider('Higgsfield').open=true;
 await f.refresh({allTimeUsd:1,todayUsd:1,coverage:'complete',providers:[{id:'terac',name:'Terac',spentUsd:1}]});
 assert.equal(f.provider('Terac').open,false);assert.equal(f.provider('Higgsfield'),undefined);
});
