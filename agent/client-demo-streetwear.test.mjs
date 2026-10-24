import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {mountClientDemo} from './public/client-demo.js';

const css = readFileSync(new URL('./public/client-demo.css', import.meta.url), 'utf8');
const fixture = () => ({activeBrandIds:['disobedient','vylin'], brands:[
  {id:'award-scholar',name:'Award Scholar',taskId:'legacy-award',founders:[{name:'Founder pending'}]},
  {id:'waddle',name:'Waddle',taskId:'legacy-waddle',founders:[{name:'Donald Chu'}]},
  {id:'disobedient',name:'Disobedient',demoKind:'streetwear',taskId:'streetwear-task',product:{summary:'Streetwear brand research'},outboundDemo:{channel:'Instagram',message:'Here is a prepared concept for your brand.',status:'draft'},assets:[
    {kind:'logo',title:'Disobedient logo',imageUrl:'/brand-assets/real-logo.png',sourceUrl:'https://disobedientnyc.com/'},
    {kind:'product',title:'Source garment',imageUrl:'https://example.com/real-product.jpg?source=original',sourceUrl:'https://example.com/product'}
  ],sourceVideo:{url:'/production-media/final',title:'Existing PS2 reference',note:'Historical source, wardrobe edit pending.'},genjutsuPreparation:{model:'genjutsu-light/object-swap',request:{source_video:'/production-media/final',garment_reference:'/brand-assets/real-product.jpg'},limitations:['Audio remains the source audio.'],sourceUrl:'https://example.com/model'},history:[
    {id:'exa',stage:1,tool:'web_search_exa',title:'Saved Exa research',mode:'recorded',status:'blocked',startedAt:'2026-10-24T18:00:00.000Z',completedAt:'2026-10-24T18:00:01.250Z',durationMs:1250,input:{query:'Disobedient streetwear'},output:{status:'partial',gap:'One source unavailable'},evidence:[{url:'https://disobedientnyc.com/',title:'Official site'}],rawRecordUrl:'/demo-records/exa.json'}
  ]},
  {id:'vylin',name:'VYLIN',demoKind:'streetwear',taskId:'vylin-task'}
]});

test('a rejected garment is reviewed separately from its static CTA and the correction is not claimed as a video',async()=>{
 const data=fixture(),brand=data.brands[2];
 brand.sampleVideo={url:'/garment-review-v2.mp4',requestId:'actual-provider-id',containsCTA:false,status:'needs_revision',ctaPreviewUrl:'/cta-still.png',visualQA:{status:'needs_revision',findings:['Back artwork appears on the chest.']},cta:{url:'https://disobedientnyc.com/products/low-lives-hoodie'}};
 brand.revisionDraft={referenceRule:'Use only the official blank front.',ctaRule:'Approve garment before assembling the CTA.',estimatedUsd:1.2,request:{image_urls:['https://example.com/front.jpg']}};
 await setup(async({host,calls})=>{
  await mountClientDemo(host);
  host.querySelector('[data-ap-cd-stage="4"]').click();
  const video=host.querySelector('video');
  assert.equal(video.getAttribute('src'),'/garment-review-v2.mp4');assert.equal(video.autoplay,false);
  assert.match(host.textContent,/Garment render only/);assert.match(host.textContent,/Revision required/);
  const cta=[...host.querySelectorAll('details')].find(el=>el.querySelector('summary')?.textContent==='CTA still preview');
  assert.ok(cta);assert.equal(cta.open,false);assert.ok(cta.querySelector('img[src="/cta-still.png"]'));
  assert.match(host.querySelector('.ap-cd-preparation').textContent,/Prepared \/ not submitted/);
  assert.equal(calls.length,1);assert.equal(calls[0].url,'/api/client-demo');
 },data);
});

async function setup(fn, data = fixture()) {
  const originalFetch = globalThis.fetch, calls = [];
  const dom = new JSDOM('<style></style><div id="host"></div>');
  dom.window.document.querySelector('style').textContent = css;
  const host = dom.window.document.querySelector('#host');
  globalThis.fetch = async (url, options = {}) => {calls.push({url,...options});return {ok:true,status:200,json:async () => data};};
  try {await fn({host,dom,calls});}
  finally {host.remove();await new Promise(resolve => setImmediate(resolve));dom.window.close();globalThis.fetch = originalFetch;}
}

test('active streetwear clients are the default while an explicit archived client retains its task', async () => setup(async ({host}) => {
  await mountClientDemo(host);
  assert.deepEqual([...host.querySelectorAll('[data-ap-cd-brand]')].map(button => button.dataset.apCdBrand), ['disobedient','vylin']);
  assert.match(host.textContent, /Research to sample/);
  assert.match(host.querySelector('[data-ap-cd-stage="3"]').textContent, /Source character/);
  await mountClientDemo(host, {brandId:'waddle'});
  assert.match(host.textContent, /Donald Chu/);
  assert.match(host.textContent, /Archived demo/);
  assert.ok(host.querySelector('a[href="#/tasks/legacy-waddle"]'));
  assert.deepEqual([...host.querySelectorAll('[data-ap-cd-brand]')].map(button => button.dataset.apCdBrand), ['waddle','disobedient','vylin']);
  await mountClientDemo(host);
  assert.equal(host.querySelector('[data-ap-cd-brand][aria-pressed="true"]').dataset.apCdBrand, 'disobedient');
}));

test('outbound DM defaults remain draft and no inbound or send workflow is invented', async () => setup(async ({host,calls}) => {
  await mountClientDemo(host);
  const dm = host.querySelector('.ap-cd-dm');
  assert.match(dm.textContent, /Recipient not supplied/);
  assert.match(dm.textContent, /Draft, not sent/);
  assert.match(dm.textContent, /prepared concept/);
  assert.doesNotMatch(host.textContent, /Simulated inbound|Fictional message/);
  assert.ok(![...host.querySelectorAll('button')].some(button => /send/i.test(button.textContent)));
  assert.deepEqual(calls, [{url:'/api/client-demo'}]);
}));

test('a sent flag without a provider ID and timestamp cannot claim delivery', async () => {
  const data = fixture();data.brands[2].outboundDemo.status = 'sent';data.brands[2].outboundDemo.receiptUrl = 'https://example.com/not-proof';
  await setup(async ({host}) => {
    await mountClientDemo(host);
    assert.match(host.querySelector('.ap-cd-dm').textContent, /Draft, not sent/);
    assert.doesNotMatch(host.textContent, /Sent \/ receipt recorded/);
    assert.equal(host.querySelector('a[href="https://example.com/not-proof"]'), null);
  }, data);
});

test('a stored provider receipt and sent timestamp display delivery evidence without issuing a request', async () => {
  const data = fixture();Object.assign(data.brands[2].outboundDemo,{status:'sent',recipientLabel:'Reviewed recipient',providerId:'provider-receipt-123',sentAt:'2026-10-24T18:05:00Z',receiptUrl:'https://example.com/receipt'});
  await setup(async ({host,calls}) => {
    await mountClientDemo(host);
    assert.match(host.textContent, /Sent \/ receipt recorded/);
    assert.match(host.querySelector('.ap-cd-dm').textContent, /provider-receipt-123/);
    assert.equal(host.querySelector('a[href="https://example.com/receipt"]').textContent, 'Delivery receipt');
    assert.deepEqual(calls, [{url:'/api/client-demo'}]);
  }, data);
});

test('product and logo previews preserve exact source images and remove their UI backgrounds and outlines', async () => setup(async ({host,dom}) => {
  await mountClientDemo(host);
  const figures = [...host.querySelectorAll('.ap-cd-asset-image')];
  assert.equal(figures.length, 2);
  assert.equal(figures[1].querySelector('img').getAttribute('src'), 'https://example.com/real-product.jpg?source=original');
  for (const figure of figures) {
    assert.equal(dom.window.getComputedStyle(figure).backgroundColor, 'rgba(0, 0, 0, 0)');
    assert.equal(dom.window.getComputedStyle(figure).borderTopWidth, '0px');
    assert.equal(dom.window.getComputedStyle(figure.querySelector('img')).borderRadius, '0');
  }
}));

test('source ad supports explicit playback and Genjutsu stays a preparation preview with no after video', async () => setup(async ({host,dom,calls}) => {
  await mountClientDemo(host);
  host.querySelector('[data-ap-cd-stage="3"]').click();
  const video = host.querySelector('video');
  assert.equal(video.getAttribute('src'), '/production-media/final');
  assert.equal(video.preload, 'none');
  assert.equal(video.controls, true);
  assert.equal(video.autoplay, false);
  assert.match(host.textContent, /Historical source video/);
  assert.match(host.textContent, /not a finished brand sample/);
  video.dispatchEvent(new dom.window.Event('error'));
  assert.equal(video.hidden, true);
  assert.equal(host.querySelector('[data-ap-cd-video-error]').hidden, false);
  host.querySelector('[data-ap-cd-stage="4"]').click();
  assert.match(host.querySelector('.ap-cd-preparation').textContent, /Preparation only/);
  assert.match(host.querySelector('.ap-cd-preparation').textContent, /No after video has been generated/);
  assert.match(host.querySelector('.ap-cd-preparation pre').textContent, /source_video/);
  assert.equal(host.querySelector('video'), null);
  assert.deepEqual(calls, [{url:'/api/client-demo'}]);
}));

test('saved Exa evidence retains actual blocked status, exact timestamps and duration', async () => setup(async ({host,calls}) => {
  await mountClientDemo(host);
  host.querySelector('[data-ap-cd-replay-next]').click();
  const record = host.querySelector('[data-ap-cd-event]');
  assert.match(record.textContent, /blocked/);
  assert.match(record.textContent, /1250 ms/);
  assert.deepEqual([...record.querySelectorAll('time')].map(time => time.dateTime), ['2026-10-24T18:00:00.000Z','2026-10-24T18:00:01.250Z']);
  assert.equal(record.querySelector('a[href="/demo-records/exa.json"]').textContent, 'Saved tool record');
  assert.ok(record.querySelector('a[href="https://disobedientnyc.com/"]'));
  assert.deepEqual(calls, [{url:'/api/client-demo'}]);
}));

test('new streetwear fields escape text and reject unsafe media, asset and receipt URLs', async () => {
  const data = fixture(), brand = data.brands[2];
  Object.assign(brand.outboundDemo,{recipientLabel:'<script>bad()</script>',message:'<img src=x onerror=bad()>',status:'sent',providerId:'receipt',sentAt:'2026-10-24',receiptUrl:'javascript:bad()'});
  brand.assets[0].imageUrl = 'data:image/svg+xml,bad';brand.assets[1].sourceUrl = 'javascript:bad()';
  brand.sourceVideo.url = 'javascript:bad()';brand.genjutsuPreparation.request = {text:'</pre><svg onload=bad()>'};brand.genjutsuPreparation.sourceUrl = 'data:text/html,bad';
  await setup(async ({host}) => {
    await mountClientDemo(host);
    assert.equal(host.querySelector('script,[onerror],[onload],a[href^="javascript:"],a[href^="data:"]'), null);
    assert.match(host.querySelector('.ap-cd-dm').textContent, /<script>bad\(\)<\/script>/);
    host.querySelector('[data-ap-cd-stage="3"]').click();assert.equal(host.querySelector('video'), null);
    host.querySelector('[data-ap-cd-stage="4"]').click();
    assert.equal(host.querySelector('svg,[onload]'), null);
    assert.match(host.querySelector('.ap-cd-preparation pre').textContent, /<svg onload=bad\(\)>/);
  }, data);
});
