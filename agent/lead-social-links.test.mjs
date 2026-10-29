import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';

const source=readFileSync(new URL('./public/app.js',import.meta.url),'utf8');
const declaration=name=>{const start=source.indexOf(`const ${name}=`);assert.ok(start>=0);return source.slice(start,source.indexOf('\n',start));};
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function fixture(t,lead,{big=false}={}){
 const context=vm.createContext({esc,socMark:k=>`<span data-test-mark="${k}"></span>`});
 vm.runInContext(['instaUrl','socialNames','socialLinks'].map(declaration).join('\n')+'\nthis.links=socialLinks;this.instagram=instaUrl;',context);
 const dom=new JSDOM(context.links(lead,big));t.after(()=>dom.window.close());return {document:dom.window.document,instagram:()=>context.instagram(lead)};
}

test('a saved Instagram handle supplies the Leads social link without a separate social URL',t=>{
 const f=fixture(t,{instagram_handle:'fixture.wear',socials:{}}),link=f.document.querySelector('[data-social="instagram"]');
 assert.ok(link,'A known Instagram profile must remain reachable from the brand social links');
 assert.equal(link.getAttribute('href'),'https://www.instagram.com/fixture.wear/');assert.equal(link.getAttribute('href'),f.instagram());
});

test('the Leads Instagram icon uses the same preferred handle as the drawer',t=>{
 const f=fixture(t,{instagram_handle:'@current_fixture',socials:{instagram:'https://instagram.com/older_fixture'}});
 const link=f.document.querySelector('[data-social="instagram"]');assert.equal(link.getAttribute('href'),f.instagram());
 assert.equal(link.getAttribute('href'),'https://www.instagram.com/current_fixture/');assert.equal(f.document.querySelectorAll('[data-social="instagram"]').length,1);
});

test('a social URL remains the Instagram fallback when no handle was found',t=>{
 const f=fixture(t,{socials:{instagram:'https://www.instagram.com/fixture/?source=site&ref=brand'}});
 assert.equal(f.document.querySelector('[data-social="instagram"]').getAttribute('href'),f.instagram());
});

test('all provider links stay in one compact wrapper with labels and external-link attributes',t=>{
 const socials={instagram:'https://instagram.com/fixture',tiktok:'https://tiktok.com/@fixture',x:'https://x.com/fixture',youtube:'https://youtube.com/@fixture',facebook:'https://facebook.com/fixture'};
 const f=fixture(t,{socials}),links=[...f.document.querySelectorAll('a')];assert.equal(links.length,5);assert.equal(f.document.querySelectorAll('.socs').length,1);
 assert.deepEqual(links.map(a=>a.dataset.social),['instagram','tiktok','x','youtube','facebook']);
 assert.ok(links.every(a=>a.parentElement.className==='socs'&&a.target==='_blank'&&a.rel==='noopener'&&a.getAttribute('aria-label')));
});

test('empty contacts and unsupported social URL schemes do not invent links',t=>{
 const f=fixture(t,{socials:{instagram:'javascript:alert(1)',tiktok:'data:text/html,test',x:'ftp://fixture.example'}});
 assert.equal(f.document.querySelectorAll('a').length,0);
});

test('large social links retain their labels without the compact wrapper',t=>{
 const f=fixture(t,{instagram_handle:'@fixture_wear',socials:{youtube:'https://youtube.com/@fixture'}},{big:true});
 assert.equal(f.document.querySelector('.socs'),null);assert.deepEqual([...f.document.querySelectorAll('a')].map(a=>a.textContent),['Instagram','YouTube']);
 assert.ok([...f.document.querySelectorAll('a')].every(a=>a.classList.contains('chip')));
});
