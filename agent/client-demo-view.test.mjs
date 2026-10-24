import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {mountClientDemo} from './public/client-demo.js';

const fixture = () => ({mode:'demo', preparedAt:'2026-10-24', brands:[
  {id:'award-scholar', name:'Award Scholar', founders:[{name:'Founder pending', status:'Unverified'}], product:{summary:'Scholarship research'}, score:{total:null,max:100}, revenue:{status:'Unknown'}, persona:{}, references:[], sources:[], taskId:null},
  {id:'waddle', name:'Waddle', founders:[{name:'Donald Chu',role:'Founder',status:'Cited',url:'https://example.com/founder'}], product:{summary:'App research'}, score:{total:70,max:100,confidence:'Low',components:[{name:'Fit',score:70,max:100,rationale:'Editorial hypothesis'}]}, persona:{name:'Jordan',imageUrl:'/demo/waddle.png'}, references:[], sources:[], taskId:'task-waddle'}
]});
const response = (data, status = 200) => ({ok:status >= 200 && status < 300,status,json:async()=>data});
const tick = () => new Promise(resolve => setImmediate(resolve));
async function setup(fn, data = fixture()) {
  const originalFetch = globalThis.fetch, calls = [];
  const dom = new JSDOM('<div id="host"></div>'), host = dom.window.document.getElementById('host');
  globalThis.fetch = async (url, options = {}) => { calls.push({url,...options}); return response(data); };
  try { await fn({host,calls,dom,setFetch:handler => {globalThis.fetch=handler;}}); }
  finally { globalThis.fetch = originalFetch; dom.window.close(); }
}

test('demo navigation stays read-only and supports selecting a client task', async () => setup(async ({host,calls}) => {
  await mountClientDemo(host, {brandId:'waddle'});
  assert.match(host.textContent, /Donald Chu/);
  assert.equal(host.querySelector('a[href="#/tasks/task-waddle"]').textContent, 'Open task');
  assert.equal(host.querySelectorAll('[data-ap-cd-stage]').length, 6);
  host.querySelector('[data-ap-cd-stage="3"]').click();
  assert.equal(host.querySelector('.ap-cd-image img').getAttribute('src'), '/demo/waddle.png');
  host.querySelector('[data-ap-cd-stage="5"]').click();
  assert.match(host.textContent, /Human approval has not been recorded/);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/api/client-demo');
  assert.ok(![...host.querySelectorAll('button')].some(button => /send|generate/i.test(button.textContent)));
}));

test('missing scores, images and post evidence remain explicit', async () => setup(async ({host}) => {
  await mountClientDemo(host);
  host.querySelector('[data-ap-cd-stage="1"]').click();
  assert.match(host.textContent, /Pending/);
  assert.doesNotMatch(host.textContent, /0 \/ 100/);
  assert.match(host.textContent, /No verified revenue data/);
  host.querySelector('[data-ap-cd-stage="3"]').click();
  assert.match(host.textContent, /ImageGen concept pending/);
  host.querySelector('[data-ap-cd-stage="4"]').click();
  assert.match(host.textContent, /Individual post references are pending/);
}));

test('only an explicit click creates a local task and exposes its deep link', async () => setup(async ({host,calls,setFetch}) => {
  await mountClientDemo(host);
  setFetch(async (url, options) => { calls.push({url,...options}); return response({task:{id:'demo-created'}}); });
  host.querySelector('[data-ap-cd-create]').click();
  await tick();
  assert.equal(calls.length, 2);
  assert.equal(calls[1].url, '/api/client-demo/tasks');
  assert.equal(calls[1].method, 'POST');
  assert.deepEqual(JSON.parse(calls[1].body), {brandId:'award-scholar'});
  assert.equal(host.querySelector('a[href="#/tasks/demo-created"]').textContent, 'Open task');
  assert.match(host.querySelector('[role="status"]').textContent, /Local demo task ready/);
}));

test('task failure restores the action and reports the server error', async () => setup(async ({host,setFetch}) => {
  await mountClientDemo(host);
  setFetch(async () => response({error:'Local store unavailable'}, 503));
  host.querySelector('[data-ap-cd-create]').click();
  await tick();
  assert.match(host.querySelector('[role="alert"]').textContent, /Local store unavailable/);
  assert.equal(host.querySelector('[data-ap-cd-create]').disabled, false);
}));

test('hostile content is escaped and unsafe links are not navigable', async () => {
  const data = fixture();
  data.brands[0].name = '<img src=x onerror=alert(1)>';
  data.brands[0].website = 'javascript:alert(1)';
  data.brands[0].founders[0].name = '<script>alert(1)</script>';
  data.brands[0].persona.imageUrl = 'data:text/html,unsafe';
  await setup(async ({host}) => {
    await mountClientDemo(host);
    assert.equal(host.querySelector('script'), null);
    assert.equal(host.querySelector('[onerror]'), null);
    assert.equal(host.querySelector('a[href^="javascript:"]'), null);
    assert.match(host.textContent, /<script>alert\(1\)<\/script>/);
    host.querySelector('[data-ap-cd-stage="3"]').click();
    assert.equal(host.querySelector('.ap-cd-image img'), null);
  }, data);
});

test('image errors reveal a real missing asset state', async () => setup(async ({host,dom}) => {
  await mountClientDemo(host, {brandId:'waddle'});
  host.querySelector('[data-ap-cd-stage="3"]').click();
  const img = host.querySelector('.ap-cd-image img');
  img.dispatchEvent(new dom.window.Event('error'));
  assert.equal(img.hidden, true);
  assert.equal(host.querySelector('[data-ap-cd-image-error]').hidden, false);
}));

test('empty research and failed initial requests are recoverable', async () => setup(async ({host,setFetch}) => {
  setFetch(async () => response({error:'Research unavailable'}, 503));
  await mountClientDemo(host);
  assert.match(host.textContent, /Research unavailable/);
  setFetch(async () => response({brands:[]}));
  host.querySelector('[data-ap-cd-retry]').click();
  await tick();
  assert.match(host.textContent, /No client demo research/);
}));

test('a stale request cannot overwrite a newer client mount or another route', async () => setup(async ({host,setFetch}) => {
  const pending = [];
  setFetch(() => new Promise(resolve => pending.push(resolve)));
  const first = mountClientDemo(host, {brandId:'award-scholar'});
  const second = mountClientDemo(host, {brandId:'waddle'});
  pending[1](response(fixture()));
  await second;
  pending[0](response(fixture()));
  await first;
  assert.match(host.textContent, /Donald Chu/);
  const third = mountClientDemo(host);
  host.innerHTML = '<p>Another route</p>';
  pending[2](response(fixture()));
  await third;
  assert.equal(host.textContent, 'Another route');
}));
