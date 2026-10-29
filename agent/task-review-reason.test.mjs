import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {taskReviewHTML} from './public/task-review-queue.js';
const render=(findings)=>({id:7,title:'Fixture scene',status:'completed',review:'pending',local_file:'fixture.mp4',plan:{taskId:10,visualQA:{status:'needs_revision',findings}}});
function fixture(t,rows){const dom=new JSDOM('<main></main>');t.after(()=>dom.window.close());const view=dom.window.document.querySelector('main');view.innerHTML=taskReviewHTML(rows);return view;}
test('the review queue shows the actual non-garment revision finding',t=>{
 const view=fixture(t,[render(['The final CTA is missing.'])]);assert.equal(view.querySelector('.hint').textContent,'Needs revision: The final CTA is missing.');assert.doesNotMatch(view.textContent,/garment artwork/);
});
test('missing or empty findings use a neutral revision label',t=>{
 for(const findings of [undefined,[],['  ']]){const view=fixture(t,[render(findings)]);assert.equal(view.querySelector('.hint').textContent,'Needs revision.');assert.doesNotMatch(view.textContent,/garment artwork|undefined/);}
});
test('the first finding stays escaped text without adding controls or media',t=>{
 const view=fixture(t,[render(['<img src=x onerror=bad()> Fix the final frame.','Another finding'])]);assert.equal(view.querySelector('img,video,audio'),null);assert.equal(view.querySelector('.hint').textContent,'Needs revision: <img src=x onerror=bad()> Fix the final frame.');assert.doesNotMatch(view.textContent,/Another finding/);assert.equal(view.querySelectorAll('a').length,2);
});
test('a normal ready review retains its existing message and task links',t=>{
 const row=render([]);row.plan.visualQA.status='passed';const view=fixture(t,[row]);assert.equal(view.querySelector('.hint').textContent,'Generated clip ready for review.');assert.ok(view.querySelector('a[href="#/tasks/10"]'));assert.ok(view.querySelector('a[href="#/renders/7"]'));
});
