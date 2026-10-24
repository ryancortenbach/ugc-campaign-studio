import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {mountClientDemo} from './public/client-demo.js';

const tick = () => new Promise(resolve => setImmediate(resolve));
const response = data => ({ok:true, status:200, json:async () => data});
const event = (id, stage, mode = 'recorded', extra = {}) => ({id, stage, mode, tool:id, title:id, status:mode === 'recorded' ? 'complete' : 'pending', input:{query:id}, output:{result:id}, evidence:[], ...extra});
const fixture = () => ({preparedAt:'2026-10-24', brands:[
  {id:'waddle', name:'Waddle', founders:[{name:'Donald Chu'}], taskId:'saved-task', storyboardImageUrl:'/demo/waddle-board.png', offerPdfUrl:'/demo/waddle-offer.pdf', script:{shots:[{start:0,end:3,line:'Original shot dialogue'}]}, history:[
    event('founder_lookup', 0), event('public_source_fetch', 1, 'recorded', {status:'blocked', note:'One source was unavailable.'}),
    event('human_approval', 5, 'simulated', {output:{approval:'Not real. Demonstration only.'}}),
    event('video_render', 4, 'simulated', {output:{video:'Fictitious sample.mp4'}}),
    event('outreach_send', 5, 'simulated', {output:{to:'demo@example.invalid', sent:false, preview:'Fictitious send result'}}),
    event('crm_call', 5, 'simulated', {output:{contactId:'DEMO-NOT-A-REAL-CONTACT', meeting:'Fictitious call booking'}})
  ]},
  {id:'award-scholar', name:'Award Scholar', taskId:'other-task', history:[event('award_lookup', 2)]}
]});

async function setup(fn, data = fixture()) {
  const originalFetch = globalThis.fetch, originalTimeout = globalThis.setTimeout, originalClear = globalThis.clearTimeout;
  const timers = new Map(), calls = [];
  const dom = new JSDOM('<div id="host"></div>'), host = dom.window.document.querySelector('#host');
  globalThis.fetch = async (url, options = {}) => { calls.push({url,...options}); return response(data); };
  globalThis.setTimeout = (callback, delay, ...args) => {
    if (delay !== 1400) return originalTimeout(callback, delay, ...args);
    const token = {replayTimer:true}; timers.set(token, () => callback(...args)); return token;
  };
  globalThis.clearTimeout = token => token?.replayTimer ? timers.delete(token) : originalClear(token);
  const advanceTimer = async () => {
    assert.equal(timers.size, 1, 'exactly one replay timer should be active');
    const [token, callback] = timers.entries().next().value;
    timers.delete(token); callback(); await tick();
  };
  try { await fn({host,dom,calls,timers,advanceTimer,setFetch:handler => {globalThis.fetch = handler;}}); }
  finally {
    host.remove(); await tick(); dom.window.close();
    globalThis.fetch = originalFetch; globalThis.setTimeout = originalTimeout; globalThis.clearTimeout = originalClear;
  }
}

test('manual replay reveals recorded calls in order and preserves blocked evidence', async () => setup(async ({host,calls,timers}) => {
  await mountClientDemo(host, {brandId:'waddle'});
  assert.equal(host.querySelectorAll('[data-ap-cd-event]').length, 0);
  host.querySelector('[data-ap-cd-replay-next]').click();
  assert.equal(host.querySelectorAll('[data-ap-cd-event]').length, 1);
  assert.equal(host.querySelector('[aria-current="step"]').dataset.apCdStage, '0');
  assert.match(host.querySelector('[data-ap-cd-event]').textContent, /Recorded step/);
  assert.match(host.querySelector('pre').textContent, /founder_lookup/);
  host.querySelector('[data-ap-cd-replay-next]').click();
  assert.equal(host.querySelector('[aria-current="step"]').dataset.apCdStage, '1');
  assert.match(host.querySelectorAll('[data-ap-cd-event]')[1].textContent, /blocked/);
  assert.equal(timers.size, 0);
  assert.deepEqual(calls.map(call => call.url), ['/api/client-demo']);
}));

test('automatic replay pauses for local simulated approval and never executes future actions', async () => setup(async ({host,calls,timers,advanceTimer}) => {
  await mountClientDemo(host, {brandId:'waddle'});
  host.querySelector('[data-ap-cd-play]').click();
  assert.equal(host.querySelectorAll('[data-ap-cd-event]').length, 1);
  await advanceTimer();
  await advanceTimer();
  assert.equal(host.querySelectorAll('[data-ap-cd-event]').length, 3);
  assert.match(host.querySelector('.ap-cd-replay-status').textContent, /Paused for simulated human approval/);
  assert.equal(timers.size, 0);
  assert.equal(host.querySelector('[data-ap-cd-replay-next]').disabled, true);
  assert.equal(host.querySelector('[data-ap-cd-play]').disabled, true);
  host.querySelector('[data-ap-cd-demo-approve]').click();
  assert.equal(host.querySelector('[data-ap-cd-demo-approve]'), null);
  assert.match(host.querySelectorAll('[data-ap-cd-event]')[2].textContent, /Simulated approval/);
  await advanceTimer();
  assert.equal(host.querySelector('[aria-current="step"]').dataset.apCdStage, '4');
  assert.match(host.textContent, /Fictitious sample/);
  await advanceTimer();
  await advanceTimer();
  assert.equal(timers.size, 0);
  assert.match(host.querySelector('.ap-cd-replay-status').textContent, /Replay complete/);
  assert.match(host.textContent, /Illustrative output only/);
  assert.match(host.textContent, /DEMO-NOT-A-REAL-CONTACT/);
  assert.deepEqual(calls, [{url:'/api/client-demo'}]);
}));

test('reset clears the local approval and a second pass must stop at the gate again', async () => setup(async ({host,timers}) => {
  await mountClientDemo(host, {brandId:'waddle'});
  for (let i = 0; i < 3; i++) host.querySelector('[data-ap-cd-replay-next]').click();
  host.querySelector('[data-ap-cd-demo-approve]').click();
  assert.equal(timers.size, 0, 'manual replay stays manual after demo approval');
  host.querySelector('[data-ap-cd-reset]').click();
  assert.equal(host.querySelectorAll('[data-ap-cd-event]').length, 0);
  assert.equal(host.querySelector('[aria-current="step"]').dataset.apCdStage, '0');
  for (let i = 0; i < 3; i++) host.querySelector('[data-ap-cd-replay-next]').click();
  assert.ok(host.querySelector('[data-ap-cd-demo-approve]'));
}));

test('brand switching cancels timers and invalidates even a queued old callback', async () => setup(async ({host,timers}) => {
  await mountClientDemo(host, {brandId:'waddle'});
  host.querySelector('[data-ap-cd-play]').click();
  const staleCallback = timers.values().next().value;
  host.querySelector('[data-ap-cd-brand="award-scholar"]').click();
  assert.equal(timers.size, 0);
  const before = host.innerHTML;
  staleCallback(); await tick();
  assert.equal(host.innerHTML, before);
  assert.equal(host.querySelectorAll('[data-ap-cd-event]').length, 0);
  host.querySelector('[data-ap-cd-replay-next]').click();
  assert.match(host.querySelector('[data-ap-cd-event]').textContent, /award_lookup/);
  assert.equal(host.querySelector('[aria-current="step"]').dataset.apCdStage, '2');
}));

test('stage navigation, remounts and route replacement stop replay without stale repaint', async () => setup(async ({host,timers}) => {
  await mountClientDemo(host, {brandId:'waddle'});
  host.querySelector('[data-ap-cd-play]').click();
  host.querySelector('[data-ap-cd-stage="3"]').click();
  assert.equal(timers.size, 0);
  host.querySelector('[data-ap-cd-play]').click();
  const staleCallback = timers.values().next().value;
  await mountClientDemo(host, {brandId:'award-scholar'});
  assert.equal(timers.size, 0);
  const before = host.innerHTML;
  staleCallback(); await tick();
  assert.equal(host.innerHTML, before);
  await mountClientDemo(host, {brandId:'waddle'});
  host.querySelector('[data-ap-cd-play]').click();
  host.innerHTML = '<p>Another route</p>';
  await tick();
  assert.equal(timers.size, 0);
  assert.equal(host.textContent, 'Another route');
}));

test('removing the host cancels a pending replay timer', async () => setup(async ({host,timers}) => {
  await mountClientDemo(host, {brandId:'waddle'});
  host.querySelector('[data-ap-cd-play]').click();
  assert.equal(timers.size, 1);
  const before = host.innerHTML, callback = timers.values().next().value;
  host.remove(); await tick();
  assert.equal(timers.size, 0);
  callback();
  assert.equal(host.innerHTML, before);
}));

test('hash navigation and pagehide stop replay even before the route replaces the host', async () => setup(async ({host,dom,timers}) => {
  await mountClientDemo(host, {brandId:'waddle'});
  host.querySelector('[data-ap-cd-play]').click();
  dom.window.dispatchEvent(new dom.window.HashChangeEvent('hashchange'));
  assert.equal(timers.size, 0);
  const before = host.innerHTML;
  await tick();
  assert.equal(host.innerHTML, before, 'navigation cleanup does not repaint the route');
  await mountClientDemo(host, {brandId:'waddle'});
  host.querySelector('[data-ap-cd-play]').click();
  dom.window.dispatchEvent(new dom.window.Event('pagehide'));
  assert.equal(timers.size, 0);
}));

test('storyboard comes before shots and the review stage links the offer PDF', async () => setup(async ({host,calls}) => {
  await mountClientDemo(host, {brandId:'waddle'});
  host.querySelector('[data-ap-cd-stage="4"]').click();
  const storyboard = host.querySelector('.ap-cd-storyboard'), shot = host.querySelector('.ap-cd-dialogue');
  assert.equal(storyboard.querySelector('img').getAttribute('src'), '/demo/waddle-board.png');
  assert.ok(storyboard.compareDocumentPosition(shot) & 4, 'storyboard precedes shot dialogue');
  host.querySelector('[data-ap-cd-stage="5"]').click();
  assert.equal(host.querySelector('a[href="/demo/waddle-offer.pdf"]').textContent, 'Two-page offer PDF');
  assert.equal(calls.length, 1);
}));

test('history input, output, tool names and evidence are escaped and dangerous URLs are rejected', async () => {
  const data = fixture();
  data.brands[0].history = [event('untrusted', 0, 'recorded', {title:'<script>bad()</script>', tool:'<img src=x onerror=bad()>', input:{text:'</pre><img onerror=bad()>'}, output:{text:'<svg onload=bad()>'}, note:'<b>untrusted</b>', evidence:[{url:'javascript:bad()',title:'<strong>bad link</strong>'},{url:'https://example.com/proof',title:'Proof'}]})];
  data.brands[0].storyboardImageUrl = 'javascript:bad()';
  data.brands[0].offerPdfUrl = 'data:text/html,bad';
  await setup(async ({host}) => {
    await mountClientDemo(host, {brandId:'waddle'});
    host.querySelector('[data-ap-cd-replay-next]').click();
    assert.equal(host.querySelector('script, svg, [onerror], [onload]'), null);
    assert.equal(host.querySelector('a[href^="javascript:"]'), null);
    assert.match(host.textContent, /<script>bad\(\)<\/script>/);
    assert.ok(host.querySelector('a[href="https://example.com/proof"]'));
    host.querySelector('[data-ap-cd-stage="4"]').click();
    assert.equal(host.querySelector('.ap-cd-storyboard'), null);
    host.querySelector('[data-ap-cd-stage="5"]').click();
    assert.equal(host.querySelector('a[href^="data:"]'), null);
  }, data);
});
