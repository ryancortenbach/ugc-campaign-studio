import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {createBrowserLive,browserHttp,jpegSize} from './browser-live.mjs';

import {jpeg,FakeCdp,fakePage} from './browser-test-helpers.mjs';

test('jpegSize reads the frame size from the start-of-frame marker',()=>{
 assert.deepEqual(jpegSize(jpeg(1280,720)),{width:1280,height:720});
 assert.equal(jpegSize(Buffer.from('nope')),null);
});

test('registry: register lists a session, update and end are announced, unregister stops the screencast',async()=>{
 const live=createBrowserLive({pollMs:5});const events=[];live.on(c=>events.push(c));
 const cdp=new FakeCdp(),page=fakePage(cdp);
 await live.register({id:'s1',purpose:'Visiting acme.com',leadId:7,page});
 const [s]=live.list();
 assert.equal(s.id,'s1');assert.equal(s.purpose,'Visiting acme.com');assert.equal(s.leadId,7);assert.equal(s.control,false);assert.ok(s.startedAt);
 const start=cdp.calls.find(c=>c.method==='Page.startScreencast');
 assert.equal(start.params.format,'jpeg');assert.equal(start.params.quality,60);assert.equal(start.params.maxWidth,1280);
 assert.equal(events[0].op,'start');
 page.u='https://acme.com/contact';page.t='Contact';
 await new Promise(r=>setTimeout(r,40));
 assert.equal(live.get('s1').url,'https://acme.com/contact');assert.equal(live.get('s1').title,'Contact');
 assert.ok(events.some(e=>e.op==='update'&&e.session.url==='https://acme.com/contact'));
 assert.equal(await live.unregister('s1'),true);
 assert.deepEqual(live.list(),[]);assert.equal(events.at(-1).op,'end');assert.equal(events.at(-1).id,'s1');
 assert.ok(cdp.calls.some(c=>c.method==='Page.stopScreencast'));assert.equal(cdp.detached,true);
 assert.equal(await live.unregister('s1'),false,'idempotent');
});

test('attach never throws: a page that cannot be watched only means no live view',async()=>{
 const live=createBrowserLive();
 assert.equal(await live.attach({id:'x',page:{context:()=>{throw new Error('nope');}}}),null);
 assert.deepEqual(live.list(),[]);
});

test('frames: every frame is acknowledged and only the latest is kept',async()=>{
 const live=createBrowserLive();const cdp=new FakeCdp();
 await live.register({id:'s1',page:fakePage(cdp),cdp});
 assert.equal(live.frame('s1'),null);
 const seen=[];live.subscribe('s1',(b,n)=>seen.push(n));
 cdp.frame(jpeg(1280,720,1));cdp.frame(jpeg(1280,720,2));cdp.frame(jpeg(1280,720,3));
 assert.equal(live.frame('s1').seq,3);
 assert.equal(live.frame('s1').data.at(-1),3,'the newest frame wins');
 assert.equal(cdp.calls.filter(c=>c.method==='Page.screencastFrameAck').length,3);
 assert.deepEqual(seen,[1,2,3]);
 assert.equal(live.get('s1').hasFrame,true);
});

test('input is refused unless the session is in control mode, then it is relayed with frame coordinates scaled to the page',async()=>{
 const live=createBrowserLive();const cdp=new FakeCdp();
 await live.register({id:'s1',page:fakePage(cdp),cdp});
 cdp.frame(jpeg(640,360));            // the frame is half the page width (deviceWidth 1280)
 await assert.rejects(live.input('s1',{type:'click',x:10,y:10}),e=>e.status===409);
 await assert.rejects(live.input('s1',{type:'type',text:'hello'}),e=>e.status===409);
 assert.equal(cdp.calls.filter(c=>c.method.startsWith('Input.')).length,0,'nothing reached the browser');
 live.setControl('s1',true);assert.equal(live.get('s1').control,true);
 await live.input('s1',{type:'click',x:100,y:50});
 const mouse=cdp.calls.filter(c=>c.method==='Input.dispatchMouseEvent').map(c=>c.params);
 assert.deepEqual(mouse.map(m=>m.type),['mouseMoved','mousePressed','mouseReleased']);
 assert.equal(mouse[1].x,200);assert.equal(mouse[1].y,100);assert.equal(mouse[1].button,'left');
 await live.input('s1',{type:'scroll',x:100,y:50,dx:0,dy:30});
 const wheel=cdp.calls.filter(c=>c.method==='Input.dispatchMouseEvent').at(-1).params;
 assert.equal(wheel.type,'mouseWheel');assert.equal(wheel.deltaY,60);
 await live.input('s1',{type:'type',text:'abc'});
 assert.deepEqual(cdp.calls.at(-1),{method:'Input.insertText',params:{text:'abc'}});
 await live.input('s1',{type:'key',key:'Enter'});
 const keys=cdp.calls.filter(c=>c.method==='Input.dispatchKeyEvent').map(c=>c.params);
 assert.equal(keys[0].key,'Enter');assert.equal(keys[0].windowsVirtualKeyCode,13);assert.equal(keys.at(-1).type,'keyUp');
 await assert.rejects(live.input('s1',{type:'key',key:'F13'}),e=>e.status===400);
 await assert.rejects(live.input('s1',{type:'click',x:'a',y:1}),e=>e.status===400);
 await assert.rejects(live.input('nope',{type:'type',text:'x'}),e=>e.status===404);
 live.setControl('s1',false);
 await assert.rejects(live.input('s1',{type:'type',text:'x'}),e=>e.status===409);
});

test('typed text and keys never appear in events, errors, session views or console output',async()=>{
 const SECRET='hunter2-s3cret';
 const live=createBrowserLive();const events=[];live.on(c=>events.push(c));
 const cdp=new FakeCdp(),logs=[];
 const orig={log:console.log,error:console.error,warn:console.warn,info:console.info};
 for(const k of Object.keys(orig))console[k]=(...a)=>logs.push(a.join(' '));
 try{
  await live.register({id:'s1',page:fakePage(cdp),cdp});
  live.setControl('s1',true);
  await live.input('s1',{type:'type',text:SECRET});
  cdp.failInput=true;                                   // the fake browser's error would echo the text
  const err=await live.input('s1',{type:'type',text:SECRET}).catch(e=>e);
  assert.equal(err.status,502);assert.ok(!err.message.includes(SECRET));
  await live.input('s1',{type:'key',key:'x'}).catch(()=>{});
 }finally{Object.assign(console,orig);}
 assert.ok(!JSON.stringify(events).includes(SECRET));
 assert.ok(!JSON.stringify(live.list()).includes(SECRET));
 assert.ok(!logs.join('\n').includes(SECRET));
});

test('http: frame.jpg returns the latest frame, live.mjpg streams multipart frames, cross-site POSTs are refused',async()=>{
 const live=createBrowserLive();const cdp=new FakeCdp();
 await live.register({id:'s1',page:fakePage(cdp),cdp});
 const gate=browserHttp(live);
 const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://x');if(!gate(req,res,url)){res.writeHead(200);res.end('fallthrough');}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
 try{
  assert.equal((await fetch(`${base}/api/browser/s1/frame.jpg`)).status,404,'no frame yet');
  const f1=jpeg(640,360,9);cdp.frame(f1);
  const still=await fetch(`${base}/api/browser/s1/frame.jpg`);
  assert.equal(still.status,200);assert.equal(still.headers.get('content-type'),'image/jpeg');
  assert.deepEqual(Buffer.from(await still.arrayBuffer()),f1);
  assert.equal((await fetch(`${base}/api/browser/zzz/frame.jpg`)).status,404);
  const res=await fetch(`${base}/api/browser/s1/live.mjpg`);
  assert.match(res.headers.get('content-type'),/^multipart\/x-mixed-replace; boundary=/);
  const reader=res.body.getReader();let got=Buffer.alloc(0);
  const f2=jpeg(640,360,7);setTimeout(()=>cdp.frame(f2),30);
  while(!got.includes(f2)){const {value,done}=await reader.read();if(done)break;got=Buffer.concat([got,Buffer.from(value)]);}
  assert.ok(got.includes(f1),'the latest frame is sent first');assert.ok(got.includes(f2),'then each new frame');
  assert.match(got.toString('latin1'),/Content-Type: image\/jpeg/);
  await reader.cancel();
  const bad=await fetch(`${base}/api/browser/s1/input`,{method:'POST',headers:{Origin:'https://evil.example'},body:'{}'});
  assert.equal(bad.status,403);
  const same=await fetch(`${base}/api/instagram/connect`,{method:'POST',headers:{Origin:base},body:'{}'});
  assert.equal(await same.text(),'fallthrough');
 }finally{server.closeAllConnections?.();await new Promise(r=>server.close(r));}
});

test('the mjpg stream ends when the session ends',async()=>{
 const live=createBrowserLive();const cdp=new FakeCdp();
 await live.register({id:'s1',page:fakePage(cdp),cdp});cdp.frame(jpeg(10,10));
 const gate=browserHttp(live);
 const server=http.createServer((req,res)=>{gate(req,res,new URL(req.url,'http://x'));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try{
  const res=await fetch(`http://127.0.0.1:${server.address().port}/api/browser/s1/live.mjpg`);
  const reader=res.body.getReader();await reader.read();
  await live.unregister('s1');
  let done=false;for(let i=0;i<10&&!done;i++)done=(await reader.read()).done;
  assert.ok(done);
 }finally{server.closeAllConnections?.();await new Promise(r=>server.close(r));}
});

test('close runs the session closer and removes the session',async()=>{
 const live=createBrowserLive();const cdp=new FakeCdp();let closed=0;
 await live.register({id:'s1',page:fakePage(cdp),cdp,close:async()=>{closed++;}});
 await live.close('s1');assert.equal(closed,1);assert.deepEqual(live.list(),[]);
 await assert.rejects(live.close('s1'),e=>e.status===404);
});

test('no em dash in the browser live code',async()=>{
 const {readFileSync}=await import('node:fs');
 for(const f of ['browser-live.mjs','instagram.mjs','public/browser-panel.js','public/browser-panel.css'])assert.ok(!readFileSync(new URL(`./${f}`,import.meta.url),'utf8').includes('\u2014'),f);
});
