import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';

const source=readFileSync(new URL('./public/app.js',import.meta.url),'utf8');
const pdfSource=source.slice(source.indexOf('function openPdf(id){'),source.indexOf('async function openLead(id){'));
function fixture(t){
 const dom=new JSDOM('<main class="center"><button id="other">Other task</button></main><aside id="drawer"><button id="offer">Offer page</button><button id="offer2">Second page</button></aside>');
 t.after(()=>dom.window.close());const {document}=dom.window;
 const context=vm.createContext({document,$:selector=>document.querySelector(selector),ic:()=>'<svg></svg>'});
 vm.runInContext(pdfSource+'\nthis.showPdf=openPdf;this.hidePdf=closePdf;',context);
 return {dom,document,show:context.showPdf,hide:context.hidePdf,trigger:document.querySelector('#offer')};
}

test('opening an offer PDF moves keyboard focus to its close control',t=>{
 const f=fixture(t);f.trigger.focus();f.show(7);
 assert.equal(f.document.activeElement,f.document.querySelector('#pdfclose'));
 assert.equal(f.document.querySelector('iframe').getAttribute('src'),'/api/leads/7/offer.pdf');
});

test('closing an offer PDF restores its originating thumbnail control',t=>{
 const f=fixture(t);f.trigger.focus();f.show(7);
 f.document.querySelector('#pdfclose').focus();f.document.querySelector('#pdfclose').click();
 assert.equal(f.document.querySelector('#pdfview'),null);assert.equal(f.document.activeElement,f.trigger);
});

test('Escape closes only the PDF and restores focus while the drawer stays open',t=>{
 const f=fixture(t),drawer=f.document.querySelector('#drawer');
 f.document.addEventListener('keydown',event=>{if(event.key==='Escape')drawer.hidden=true;});
 f.trigger.focus();f.show(7);f.document.querySelector('#pdfclose').focus();
 f.document.querySelector('#pdfclose').dispatchEvent(new f.dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
 assert.equal(f.document.querySelector('#pdfview'),null);assert.equal(drawer.hidden,false);
 assert.equal(f.document.activeElement,f.trigger);
});

test('switching offer pages returns focus to the most recent external trigger',t=>{
 const f=fixture(t),second=f.document.querySelector('#offer2');
 f.trigger.focus();f.show(7);second.focus();f.show(8);f.hide();
 assert.equal(f.document.activeElement,second);assert.equal(f.document.querySelector('#pdfview'),null);
});

test('replacing a PDF from inside its viewer retains the original return target',t=>{
 const f=fixture(t);f.trigger.focus();f.show(7);f.show(8);f.hide();
 assert.equal(f.document.activeElement,f.trigger);f.hide();assert.equal(f.document.activeElement,f.trigger);
});

test('closing does not refocus removed or hidden drawer controls',t=>{
 const f=fixture(t),other=f.document.querySelector('#other');
 f.trigger.focus();f.show(7);f.trigger.remove();other.focus();f.hide();
 assert.equal(f.document.activeElement,other);
 const second=f.document.querySelector('#offer2');second.focus();f.show(8);
 f.document.querySelector('#drawer').hidden=true;other.focus();f.hide();
 assert.equal(f.document.activeElement,other);
});

test('closing after focus moves outside the PDF preserves the newer focus',t=>{
 const f=fixture(t),other=f.document.querySelector('#other');f.trigger.focus();f.show(7);other.focus();f.hide();
 assert.equal(f.document.querySelector('#pdfview'),null);assert.equal(f.document.activeElement,other);
});

test('Escape from an outside control closes the PDF without taking focus back',t=>{
 const f=fixture(t),other=f.document.querySelector('#other');f.trigger.focus();f.show(7);other.focus();
 other.dispatchEvent(new f.dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
 assert.equal(f.document.querySelector('#pdfview'),null);assert.equal(f.document.activeElement,other);assert.equal(f.document.querySelector('#drawer').hidden,false);
});
