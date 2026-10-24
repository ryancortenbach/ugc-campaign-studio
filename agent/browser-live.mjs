import {EventEmitter} from 'node:events';

// Live view of every Solari cloud browser the app has open. There is no hosted viewer, so each page is watched over CDP:
// Page.startScreencast pushes JPEG frames, only the newest one is kept, and routes serve it as MJPEG or as a single still.
// "You control" mode relays clicks, keys, typed text and scrolling back through Input.*. Typed text and keys are NEVER
// logged, stored, put in an event or echoed in an error: Ryan types his Instagram password through this.

const SCREENCAST={format:'jpeg',quality:60,maxWidth:1280,maxHeight:1280,everyNthFrame:1};
const fail=(status,message)=>Object.assign(new Error(message),{status});
const now=()=>new Date().toISOString();

// Width and height of a JPEG, read from its start-of-frame marker. Frame pixel coordinates from the UI are scaled with this.
export function jpegSize(buf){
 if(!buf||buf.length<4||buf[0]!==0xff||buf[1]!==0xd8)return null;
 let i=2;
 while(i+9<buf.length){
  if(buf[i]!==0xff){i++;continue;}
  const marker=buf[i+1];
  if(marker===0xff){i++;continue;}
  if(marker>=0xc0&&marker<=0xcf&&![0xc4,0xc8,0xcc].includes(marker))return {height:buf.readUInt16BE(i+5),width:buf.readUInt16BE(i+7)};
  if(marker===0xd8||marker===0x01||(marker>=0xd0&&marker<=0xd7)){i+=2;continue;}
  i+=2+buf.readUInt16BE(i+2);
 }
 return null;
}

const KEYS={
 Enter:{code:'Enter',vk:13,text:'\r'},Backspace:{code:'Backspace',vk:8},Tab:{code:'Tab',vk:9},Escape:{code:'Escape',vk:27},Delete:{code:'Delete',vk:46},
 ArrowLeft:{code:'ArrowLeft',vk:37},ArrowUp:{code:'ArrowUp',vk:38},ArrowRight:{code:'ArrowRight',vk:39},ArrowDown:{code:'ArrowDown',vk:40},
 Home:{code:'Home',vk:36},End:{code:'End',vk:35},PageUp:{code:'PageUp',vk:33},PageDown:{code:'PageDown',vk:34}
};
export const INPUT_TYPES=['click','key','type','scroll'];

export function createBrowserLive({pollMs=1500}={}){
 const bus=new EventEmitter();bus.setMaxListeners(100);
 const sessions=new Map();
 const view=e=>({id:e.id,purpose:e.purpose,leadId:e.leadId,url:e.url,title:e.title,startedAt:e.startedAt,control:e.control,hasFrame:Boolean(e.frame)});
 const emit=(op,e)=>bus.emit('change',{op,...(e?{session:view(e)}:{})});
 const need=id=>{const e=sessions.get(String(id));if(!e)throw fail(404,'No such browser session');return e;};

 async function refresh(e){
  let url=e.url,title=e.title;
  try{if(typeof e.page?.url==='function')url=e.page.url()||url;}catch{}
  try{if(typeof e.page?.title==='function')title=(await e.page.title())||title;}catch{}
  if(!sessions.has(e.id)||(url===e.url&&title===e.title))return;
  e.url=url;e.title=title;emit('update',e);
 }

 const live={
  bus,
  on:(fn)=>{bus.on('change',fn);return ()=>bus.off('change',fn);},
  list:()=>[...sessions.values()].map(view),
  get:id=>{const e=sessions.get(String(id));return e?view(e):null;},
  has:id=>sessions.has(String(id)),
  // Registers a page and starts watching it. `cdp` can be passed in (tests); otherwise one is opened on the page.
  // close: how to really end the session (release the Solari browser) when the UI's close button is pressed.
  async register({id,purpose='Browser',leadId=null,page,cdp=null,close=null}){
   id=String(id);
   if(sessions.has(id))await live.unregister(id);
   cdp=cdp||await page.context().newCDPSession(page);
   const e={id,purpose,leadId,startedAt:now(),url:'',title:'',control:false,page,cdp,close,frame:null,seq:0,meta:null,frames:new EventEmitter(),timer:null,off:[]};
   e.frames.setMaxListeners(50);
   const onFrame=ev=>{
    // Acknowledge every frame or Chrome stops sending. Keep only the newest.
    Promise.resolve(cdp.send('Page.screencastFrameAck',{sessionId:ev.sessionId})).catch(()=>{});
    e.frame=Buffer.from(ev.data,'base64');e.meta=ev.metadata||null;e.seq++;
    if(e.seq===1)emit('update',e);
    e.frames.emit('frame',e.frame,e.seq);
   };
   cdp.on('Page.screencastFrame',onFrame);
   try{
    e.url=typeof page?.url==='function'?page.url()||'':'';
    sessions.set(id,e);
    await cdp.send('Page.startScreencast',SCREENCAST);
   }catch(err){sessions.delete(id);try{cdp.off?.('Page.screencastFrame',onFrame);}catch{}throw err;}
   try{page.on?.('framenavigated',f=>{if(!page.mainFrame||f===page.mainFrame())refresh(e);});page.on?.('close',()=>{live.unregister(id).catch(()=>{});});}catch{}
   e.timer=setInterval(()=>refresh(e),pollMs);e.timer.unref?.();
   emit('start',e);
   refresh(e).catch(()=>{});
   return {id};
  },
  // Same as register, but a failure only means "no live view". A site visit must never break because the viewer could not attach.
  async attach(opts){try{return await live.register(opts);}catch{return null;}},
  async unregister(id){
   const e=sessions.get(String(id));if(!e)return false;
   sessions.delete(e.id);clearInterval(e.timer);
   try{await Promise.race([e.cdp.send('Page.stopScreencast'),new Promise(r=>setTimeout(r,1500))]);}catch{}
   try{await e.cdp.detach?.();}catch{}
   e.frames.emit('end');e.frames.removeAllListeners();
   bus.emit('change',{op:'end',id:e.id});
   return true;
  },
  async close(id){const e=need(id);try{if(e.close)await e.close();}finally{await live.unregister(e.id);}},
  frame(id){const e=sessions.get(String(id));return e?.frame?{data:e.frame,seq:e.seq}:null;},
  // Calls fn(buffer,seq) for every new frame and onEnd when the session goes away. Returns an unsubscribe function.
  subscribe(id,fn,onEnd=()=>{}){const e=need(id);e.frames.on('frame',fn);e.frames.on('end',onEnd);return ()=>{e.frames.off('frame',fn);e.frames.off('end',onEnd);};},
  setControl(id,on){const e=need(id);e.control=Boolean(on);emit('update',e);return view(e);},
  // Relays one input event. Refused unless the UI put the session in control mode. The payload is never logged.
  async input(id,p={}){
   const e=need(id);
   if(!e.control)throw fail(409,'Press You control first. Input is ignored until then.');
   if(!INPUT_TYPES.includes(p.type))throw fail(400,'Input type is click, key, type or scroll.');
   const send=(method,params)=>e.cdp.send(method,params);
   const mods=Number.isInteger(p.modifiers)?p.modifiers&15:0;
   try{
    if(p.type==='type'){
     const text=typeof p.text==='string'?p.text.slice(0,4000):'';
     if(text)await send('Input.insertText',{text});
     return {ok:true};
    }
    if(p.type==='key'){
     const key=String(p.key??'');
     if(KEYS[key]){
      const k=KEYS[key];
      await send('Input.dispatchKeyEvent',{type:k.text?'keyDown':'rawKeyDown',key,code:k.code,windowsVirtualKeyCode:k.vk,nativeVirtualKeyCode:k.vk,modifiers:mods,...(k.text?{text:k.text,unmodifiedText:k.text}:{})});
      await send('Input.dispatchKeyEvent',{type:'keyUp',key,code:k.code,windowsVirtualKeyCode:k.vk,nativeVirtualKeyCode:k.vk,modifiers:mods});
      return {ok:true};
     }
     if(key.length===1){await send('Input.insertText',{text:key});return {ok:true};}
     throw fail(400,'That key is not supported.');
    }
    // Mouse and wheel coordinates arrive in frame pixels. The page lives in CSS pixels, so scale by deviceWidth / frame width.
    const x=Number(p.x),y=Number(p.y);
    if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||y<0)throw fail(400,'x and y are frame pixels.');
    const size=jpegSize(e.frame),dw=e.meta?.deviceWidth;
    const k=size&&dw?dw/size.width:1,px=Math.round(x*k),py=Math.round(y*k);
    if(p.type==='click'){
     await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:px,y:py,modifiers:mods});
     await send('Input.dispatchMouseEvent',{type:'mousePressed',x:px,y:py,button:'left',clickCount:1,modifiers:mods});
     await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:px,y:py,button:'left',clickCount:1,modifiers:mods});
     return {ok:true};
    }
    const dx=Math.max(-5000,Math.min(5000,Number(p.dx)||0)),dy=Math.max(-5000,Math.min(5000,Number(p.dy)||0));
    await send('Input.dispatchMouseEvent',{type:'mouseWheel',x:px,y:py,deltaX:dx*k,deltaY:dy*k});
    return {ok:true};
   }catch(err){
    if(err.status)throw err;
    throw fail(502,'The browser did not accept that input.');
   }
  }
 };
 return live;
}

export const live=createBrowserLive();

const SAME_ORIGIN=/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i;
const GUARDED_POST=/^\/api\/(browser\/|instagram\/|drafts\/\d+\/send-dm$)/;

// Request hook for server.mjs, called before the JSON routes. Handles the two image routes (they stream, so they cannot be JSON
// routes) and refuses cross-site POSTs to the browser, Instagram and DM endpoints. Returns true when it answered.
export function browserHttp(liveApi=live){
 return function handle(req,res,url){
  const reply=(code,data)=>{res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));return true;};
  if(req.method==='POST'&&GUARDED_POST.test(url.pathname)){
   const origin=req.headers.origin;
   if(origin&&!SAME_ORIGIN.test(origin))return reply(403,{error:'Cross-site requests are not allowed here.'});
   return false;
  }
  const m=req.method==='GET'&&url.pathname.match(/^\/api\/browser\/([\w.:-]+)\/(live\.mjpg|frame\.jpg)$/);
  if(!m)return false;
  const [,id,kind]=m;
  if(!liveApi.has(id))return reply(404,{error:'No such browser session'});
  if(kind==='frame.jpg'){
   const f=liveApi.frame(id);
   if(!f)return reply(404,{error:'No frame yet'});
   res.writeHead(200,{'Content-Type':'image/jpeg','Content-Length':f.data.length,'Cache-Control':'no-store','X-Frame-Seq':String(f.seq)});res.end(f.data);return true;
  }
  const boundary='mintframe';
  res.writeHead(200,{'Content-Type':`multipart/x-mixed-replace; boundary=${boundary}`,'Cache-Control':'no-store',Connection:'keep-alive','Pragma':'no-cache'});
  const write=buf=>{
   if(res.destroyed||res.writableNeedDrain)return;
   res.write(`--${boundary}\r\nContent-Type: image/jpeg\r\nContent-Length: ${buf.length}\r\n\r\n`);res.write(buf);res.write('\r\n');
  };
  const first=liveApi.frame(id);if(first)write(first.data);
  const off=liveApi.subscribe(id,buf=>write(buf),()=>{off();res.end();});
  req.on('close',off);
  return true;
 };
}
