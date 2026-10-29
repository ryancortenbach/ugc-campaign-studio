import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';

const source=readFileSync(new URL('./public/app.js',import.meta.url),'utf8');
const spendSource=source.slice(source.indexOf('const usd=n=>'),source.indexOf('// Connections tab: logo'));
const costs=amount=>({allTimeUsd:amount,todayUsd:amount,coverage:'complete',providers:[{id:'higgsfield',name:'Higgsfield',spentUsd:amount,todayUsd:amount}]});
const whop=amount=>({orders:[{status:'paid',amount}]});
function fixture(t){
 const dom=new JSDOM('<aside id="spendbody"></aside>');t.after(()=>dom.window.close());
 const {document}=dom.window,state={spendData:null},requests=[];
 const context=vm.createContext({document,state,railTab:'spend',esc:String,$:selector=>document.querySelector(selector),providerName:{higgsfield:'Higgsfield'},logoImg:()=>'',
  tryGet:path=>{assert.ok(['/api/costs','/api/whop','/api/spend'].includes(path));return new Promise(resolve=>requests.push({path,resolve}));}});
 vm.runInContext(spendSource,context);
 return {document,state,requests,load:context.renderSpend,paint:context.paintSpend,resolve:(offset,cost,orders)=>{requests[offset].resolve(cost);requests[offset+1].resolve(orders);}};
}

test('an older spend response cannot replace newer provider totals or collected revenue',async t=>{
 const f=fixture(t),old=f.load(),current=f.load();
 f.resolve(2,costs(5),whop(200));await current;f.resolve(0,costs(1),whop(100));await old;
 assert.equal(f.state.spendData.all,5);assert.equal(f.state.spendData.earned.sum,200);
 assert.match(f.document.querySelector('#spendbody').textContent,/\$5\.00/);
});

test('a delayed legacy fallback cannot overwrite a newer modern cost snapshot',async t=>{
 const f=fixture(t),old=f.load();f.resolve(0,null,whop(100));await new Promise(resolve=>setImmediate(resolve));
 assert.equal(f.requests[2].path,'/api/spend');const current=f.load();f.resolve(3,costs(5),whop(200));await current;
 f.requests[2].resolve({total:1,today:1,providers:[]});await old;
 assert.equal(f.state.spendData.all,5);assert.equal(f.state.spendData.earned.sum,200);
});

test('partial coverage and unknown provider amounts retain their existing labels',async t=>{
 const f=fixture(t),pending=f.load();
 f.resolve(0,{allTimeUsd:2.9,todayUsd:.5,coverage:'partial',providers:[{id:'higgsfield',name:'Higgsfield',spentUsd:null},{id:'elevenlabs',name:'ElevenLabs',spentUsd:null,usage:'1500 of 10000 characters'},{id:'terac',name:'Terac',spentUsd:null,balanceUsd:20}]},null);await pending;
 const text=f.document.querySelector('#spendbody').textContent;
 assert.match(text,/Partial/);assert.match(text,/Not synced/);assert.match(text,/Usage only/);assert.match(text,/Balance only/);
 assert.equal(f.state.spendData.earned,null);assert.doesNotMatch(text,/Collected/);
 assert.equal(f.state.spendData.all,2.9);
});

test('failure of both cost endpoints preserves the prior snapshot',async t=>{
 const f=fixture(t),previous={all:3,today:1,providers:[],earned:null};f.state.spendData=previous;f.paint();
 const pending=f.load();f.resolve(0,null,null);await new Promise(resolve=>setImmediate(resolve));f.requests[2].resolve(null);await pending;
 assert.equal(f.state.spendData,previous);assert.match(f.document.querySelector('#spendbody').textContent,/\$3\.00/);
});

test('a current legacy backend still renders its ledger and verified zero collected revenue',async t=>{
 const f=fixture(t),pending=f.load();f.resolve(0,null,{orders:[]});await new Promise(resolve=>setImmediate(resolve));
 f.requests[2].resolve({total:3,today:1,providers:[{provider:'higgsfield',total:3,today:1,count:2}]});await pending;
 assert.equal(f.state.spendData.all,3);assert.equal(f.state.spendData.providers[0].usage,'2 charges');
 assert.equal(f.state.spendData.earned.sum,0);assert.match(f.document.querySelector('#spendbody').textContent,/Collected\$0/);
});
