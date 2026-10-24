import test from 'node:test';import assert from 'node:assert/strict';import {installProviderDns} from './network-dns.mjs';
test('DNS fallback preserves successful lookups and resolves only address failures through configured DNS',async()=>{
 let resolves=0;const lookup=installProviderDns({apply:false,servers:[],lookup:(host,o,cb)=>host==='cached'?cb(null,'127.0.0.1',4):cb(Object.assign(Error('dns'),{code:'ENOTFOUND'})),resolver:{resolve4:async()=>{resolves++;return ['192.0.2.1'];}}});
 const run=(host,options)=>new Promise((resolve,reject)=>lookup(host,options,(e,...r)=>e?reject(e):resolve(r)));
 assert.deepEqual(await run('cached',{}),['127.0.0.1',4]);assert.equal(resolves,0);
 assert.deepEqual(await run('provider',{all:true}),[[{address:'192.0.2.1',family:4}]]);assert.equal(resolves,1);
});
