import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {apparelView} from './public/apparel-storyboards.js';

async function fixture(t,{extra=false,role='character'}={}){
 const dom=new JSDOM('<button id="outside">Outside</button><main></main>',{url:'https://fixture.example'});
 const originals=Object.fromEntries(['document','localStorage','fetch'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
 globalThis.document=dom.window.document;globalThis.localStorage=dom.window.localStorage;
 globalThis.fetch=async path=>{assert.equal(path,'/apparel-storyboard-research-v1.json');return {ok:true,json:async()=>JSON.parse(readFileSync(new URL('./public/apparel-storyboard-research-v1.json',import.meta.url),'utf8'))};};
 t.after(()=>{dom.window.close();for(const [key,descriptor] of Object.entries(originals))if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];});
 const root=document.querySelector('main'),key='mintlabs.apparel-storyboards.v1';await apparelView({view:root});
 if(extra){const lab=JSON.parse(localStorage.getItem(key));lab.refs.push({id:'fixture-second',name:'Second reference',role,url:'/fixture-second.png'},{id:'fixture-third',name:'Third reference',role,url:'/fixture-third.png'});localStorage.setItem(key,JSON.stringify(lab));await apparelView({view:root});}
 const open=()=>{const picker=root.querySelector('[data-ap-assets]');picker.open=true;picker.ontoggle();return picker;};
 open();if(role!=='character')root.querySelector(`[data-ap-role="${role}"]`).click();
 return {root,document,open,lab:()=>JSON.parse(localStorage.getItem(key)),remove:()=>[...root.querySelectorAll('[data-ap-remove]')]};
}

test('removing a focused reference keeps focus on the next reference removal control',async t=>{
 const f=await fixture(t,{extra:true}),buttons=f.remove(),nextId=buttons[1].dataset.apRemove;
 buttons[0].focus();buttons[0].click();
 assert.equal(f.document.activeElement.dataset.apRemove,nextId);
 assert.equal(f.lab().refs.length,2);assert.equal(f.root.querySelector('[data-ap-assets]').open,true);
});

test('removing the last focused reference moves focus to the previous remaining reference',async t=>{
 const f=await fixture(t,{extra:true}),buttons=f.remove(),previousId=buttons[1].dataset.apRemove;
 buttons[2].focus();buttons[2].click();
 assert.equal(f.document.activeElement.dataset.apRemove,previousId);assert.equal(f.lab().refs.length,2);
});

test('removing the only focused reference moves focus to Upload image in the same role',async t=>{
 const f=await fixture(t),button=f.remove()[0];button.focus();button.click();
 assert.equal(f.document.activeElement,f.root.querySelector('[data-ap-upload="character"]'));
 assert.equal(f.lab().refs.length,0);assert.equal(f.root.querySelector('[data-ap-assets]').open,true);
});

test('a removal without focus on its control does not steal external focus',async t=>{
 const f=await fixture(t),outside=f.document.querySelector('#outside');outside.focus();f.remove()[0].click();
 assert.equal(f.document.activeElement,outside);assert.equal(f.lab().refs.length,0);
});

test('Escape after removal closes the picker and returns focus to its summary',async t=>{
 const f=await fixture(t),button=f.remove()[0];button.focus();button.click();
 const picker=f.root.querySelector('[data-ap-assets]');
 f.document.activeElement.dispatchEvent(new f.document.defaultView.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
 assert.equal(picker.open,false);assert.equal(f.document.activeElement,picker.querySelector('summary'));
});

test('removing all apparel references keeps focus and the selected role in the apparel panel',async t=>{
 const f=await fixture(t,{extra:true,role:'apparel'});
 let button=f.remove()[0];button.focus();button.click();
 assert.equal(f.document.activeElement.dataset.apRemove,'fixture-third');
 button=f.remove()[0];button.click();
 assert.equal(f.document.activeElement,f.root.querySelector('[data-ap-upload="apparel"]'));
 assert.equal(f.root.querySelector('[data-ap-role="apparel"]').getAttribute('aria-selected'),'true');
 assert.equal(f.root.querySelector('[data-ap-drop]').getAttribute('aria-label'),'Apparel references');
 assert.equal(f.lab().refs.length,1);assert.equal(f.lab().refs[0].role,'character');
});
