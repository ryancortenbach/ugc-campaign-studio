import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {JSDOM,VirtualConsole} from 'jsdom';

const dir=path.join(path.dirname(fileURLToPath(import.meta.url)),'..','public','panel');
const js=readFileSync(path.join(dir,'panel.js'),'utf8');
const html=readFileSync(path.join(dir,'index.html'),'utf8');

function page(search,rpc){
 const calls=[];
 const vc=new VirtualConsole();
 const dom=new JSDOM(html.replace(/<script[^>]*><\/script>/g,''),{url:`https://panel.test/panel/${search}`,runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc});
 const w=dom.window;
 w.PANEL_CONFIG={url:'https://db.test',anon:'anon-key'};
 w.fetch=async(url,init)=>{const fn=String(url).split('/rpc/')[1];const body=JSON.parse(init.body);calls.push({fn,body,headers:init.headers});const out=rpc[fn](body);return {ok:true,json:async()=>out};};
 w.eval(js);
 return {w,calls,doc:w.document};
}
const tick=()=>new Promise(r=>setTimeout(r,5));

test('page shows the brand, clip and offer link, then submits the exact answer shape', async()=>{
 const {w,calls,doc}=page('?t=abcdefgh12345678&teracSubmissionId=sub1&submissionId=sub1&taskId=t1',{
  get_panel:()=>[{brand:'BLAN',clip_url:'https://cdn.test/c.mp4',offer_pdf_url:'https://db.test/storage/v1/object/public/offers/x.pdf'}],
  submit_panel_response:()=>({ok:true})});
 await tick();
 assert.match(doc.body.textContent,/BLAN/);
 const v=doc.querySelector('video');assert.equal(v.getAttribute('src'),'https://cdn.test/c.mp4');assert.ok(v.hasAttribute('playsinline'));assert.ok(v.hasAttribute('controls'));
 assert.equal(doc.querySelector('a[href$="x.pdf"]').getAttribute('target'),'_blank');
 const btn=doc.querySelector('button[type=submit]');assert.equal(btn.disabled,true);
 for(const name of ['stop_scrolling','real_customer','check_out','clear_product'])doc.querySelector(`input[name=${name}][value="7"]`).click();
 const ta=doc.querySelector('textarea');ta.value='Show the fit sooner';ta.dispatchEvent(new w.Event('input'));
 assert.equal(btn.disabled,true,'not watched yet');
 Object.defineProperty(v,'currentTime',{value:4.5,configurable:true});v.dispatchEvent(new w.Event('timeupdate'));
 assert.equal(btn.disabled,false);
 doc.querySelector('form').dispatchEvent(new w.Event('submit',{cancelable:true}));
 await tick();
 const sub=calls.find(c=>c.fn==='submit_panel_response');
 assert.deepEqual(sub.body,{p_token:'abcdefgh12345678',p_submission_id:'sub1',p_participant_id:null,p_answers:{stop_scrolling:7,real_customer:7,check_out:7,clear_product:7,improve:'Show the fit sooner'}});
 assert.equal(sub.headers.apikey,'anon-key');
 assert.match(doc.body.textContent,/Taking you back/);
});
test('an unknown token or missing token shows a plain message', async()=>{
 const a=page('?t=abcdefgh12345678',{get_panel:()=>[]});await tick();
 assert.match(a.doc.body.textContent,/not valid/);
 const b=page('',{get_panel:()=>[]});await tick();
 assert.match(b.doc.body.textContent,/not valid/);assert.equal(b.calls.length,0);
});
test('the page loads nothing from third parties', () => {
 const urls=(html+js).match(/https?:\/\/[^\s'"<>)]+/g)||[];
 assert.deepEqual(urls,['https://terac.com/api/external/callback']);
});
