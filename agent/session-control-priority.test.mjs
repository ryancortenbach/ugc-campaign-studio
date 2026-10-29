import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {sortTaskGroups} from './public/task-list-model.js';
const source=readFileSync(new URL('./public/app.js',import.meta.url),'utf8');
const snippet=source.slice(source.indexOf('const isLive='),source.indexOf('function sessHead('));
const run=(id,status,prompt='Find fixture brands')=>({id,status,prompt,updated_at:'2026-10-29T18:08:00Z'});
function fixture(tasks){
 const state={tasks},context=vm.createContext({state,sortTaskGroups,ic:()=>''});
 vm.runInContext(snippet+'\nthis.groups=sessionGroups;this.controls=sessControls;',context);
 const group=context.groups()[0],dom=new JSDOM(`<main>${context.controls(group)}</main>`);
 const controls=[...dom.window.document.querySelectorAll('button')].map(b=>({action:b.dataset.gact,id:Number(b.dataset.id)}));dom.window.close();return {group,controls};
}
test('a newer queued repeat does not hide Resume for its paused session',()=>{
 const f=fixture([run(1,'paused'),run(2,'queued')]);assert.equal(f.group.status,'paused');assert.deepEqual(f.controls,[{action:'resume',id:1},{action:'stop',id:1}]);
});
test('a running session takes priority over paused and queued repeats',()=>{
 const f=fixture([run(1,'running'),run(2,'paused'),run(3,'queued')]);assert.equal(f.group.status,'running');assert.deepEqual(f.controls,[{action:'pause',id:1},{action:'stop',id:1}]);
});
test('the newest paused repeat owns Resume when no run is active',()=>{
 const f=fixture([run(1,'paused'),run(2,'paused'),run(3,'done')]);assert.equal(f.group.status,'paused');assert.deepEqual(f.controls,[{action:'resume',id:2},{action:'stop',id:2}]);
});
test('queued-only sessions keep Stop on the newest queued run',()=>{
 const f=fixture([run(1,'queued'),run(2,'queued')]);assert.equal(f.group.status,'queued');assert.deepEqual(f.controls,[{action:'stop',id:2}]);
});
test('finished sessions expose no execution controls',()=>{
 const f=fixture([run(1,'done'),run(2,'failed')]);assert.equal(f.group.live.length,0);assert.deepEqual(f.controls,[]);
});
test('Whop sessions expose no mission controls even when paused',()=>{
 const f=fixture([run(1,'paused','Whop order: Fixture')]);assert.equal(f.group.whop,true);assert.deepEqual(f.controls,[]);
});
