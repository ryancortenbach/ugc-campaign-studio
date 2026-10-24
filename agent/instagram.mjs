import {draftReadiness,dmHandle} from './outreach.mjs';

// Instagram through a Solari cloud browser. Ryan logs in himself in the Browser tab ("You control"), the login is saved into a
// Solari profile named mint-instagram, and the only thing that ever sends a DM is sendDm(), called by POST /api/drafts/:id/send-dm
// from the paper-airplane click in the lead drawer. The runner, autopilot, whopwatch, the requalifier, the assistant and brand
// ideation never call it (instagram.test.mjs greps for that). Cookie values are never returned, logged or stored outside Solari.

export const PROFILE_NAME='mint-instagram';
export const LOGIN_URL='https://www.instagram.com/accounts/login/';
const SETTINGS_KEY='instagram';
const fail=(status,message,extra)=>Object.assign(new Error(message),{status,...(extra?{extra}:{})});
const defaultSleep=ms=>new Promise(r=>setTimeout(r,ms));

async function defaultMakeClient(){
 const {Solari}=await import('@solarisdk/browser');
 return new Solari({apiKey:process.env.SOLARI_API_KEY,baseUrl:'https://api.getsolari.com'});
}

// A saved Instagram login always has a non-empty sessionid cookie on instagram.com.
export const hasInstagramSession=state=>Boolean(state?.cookies?.some(c=>c?.name==='sessionid'&&/(^|\.)instagram\.com$/i.test(String(c.domain||'').replace(/^\./,''))&&c.value));

// Drives one DM on an open Instagram page. Every failure carries .step so the activity log says where it stopped.
// The message text only ever goes to page.keyboard.insertText. It is never logged or put in an error.
export async function driveDm(page,{handle,text,sleep=defaultSleep}){
 const step=(name,fn)=>fn().catch(err=>{throw Object.assign(new Error(String(err?.message||err).split('\n')[0]),{step:name,cause:err});});
 const quiet=async fn=>{try{return await fn();}catch{return null;}};
 await step('open profile',async()=>{await page.goto(`https://www.instagram.com/${handle}/`,{waitUntil:'domcontentloaded',timeout:30000});});
 if(/\/accounts\/login/.test(String(page.url?.()||'')))throw Object.assign(new Error('Instagram asked for a login again. Connect Instagram and save the login.'),{step:'login',loggedOut:true});
 await quiet(()=>page.getByRole('button',{name:/^not now$/i}).first().click({timeout:1500}));
 // The Message button on the profile. When it is missing (some profiles hide it), start a new thread from the inbox instead.
 let viaProfile=true;
 try{
  const btn=page.getByRole('button',{name:'Message',exact:true}).first();
  await btn.waitFor({timeout:8000});await btn.click({timeout:5000});
 }catch{viaProfile=false;}
 if(!viaProfile){
  await step('new message',async()=>{
   await page.goto('https://www.instagram.com/direct/new/',{waitUntil:'domcontentloaded',timeout:30000});
   await quiet(()=>page.getByRole('button',{name:/^not now$/i}).first().click({timeout:1500}));
   const search=page.locator('input[name="queryBox"], input[placeholder*="Search"]').first();
   await search.waitFor({timeout:10000});await search.fill(handle);
   const hit=page.getByText(handle,{exact:true}).first();
   await hit.waitFor({timeout:10000});await hit.click({timeout:5000});
   await page.getByRole('button',{name:/^(chat|next)$/i}).first().click({timeout:5000});
  });
 }
 const composer=page.locator('div[role="textbox"][contenteditable="true"]').first();
 await step('composer',async()=>{await composer.waitFor({timeout:15000});await composer.click({timeout:5000});});
 await step('type message',async()=>{
  const lines=String(text).split('\n');
  for(let i=0;i<lines.length;i++){
   if(i>0)await page.keyboard.press('Shift+Enter');
   if(lines[i])await page.keyboard.insertText(lines[i]);
  }
 });
 await step('send',async()=>{await page.keyboard.press('Enter');});
 // Sent means: the composer emptied AND the text shows up as a bubble in the thread.
 await step('verify',async()=>{
  let emptied=false;
  for(let i=0;i<20&&!emptied;i++){await sleep(500);emptied=!String(await composer.innerText().catch(()=>'x')).trim();}
  if(!emptied)throw new Error('The message is still in the box. It may not have been sent, check Instagram before trying again.');
  const snippet=String(text).split('\n').map(l=>l.trim()).find(Boolean)?.slice(0,40)||String(text).trim().slice(0,40);
  await page.getByText(snippet,{exact:false}).first().waitFor({timeout:10000}).catch(()=>{throw new Error('No message bubble appeared. It may not have been sent, check Instagram before trying again.');});
 });
}

export function createInstagram({store,live,makeClient=defaultMakeClient,env=process.env,holdMs=5000,sleep=defaultSleep}={}){
 const {db}=store;
 db.exec('create table if not exists settings(key text primary key, value text)');
 const read=()=>{const r=db.prepare('select value from settings where key=?').get(SETTINGS_KEY);if(!r)return {};try{return JSON.parse(r.value)||{};}catch{return {};}};
 const write=patch=>{const next={...read(),...patch};db.prepare('insert into settings(key,value) values(?,?) on conflict(key) do update set value=excluded.value').run(SETTINGS_KEY,JSON.stringify(next));return next;};
 const requireKey=()=>{if(!env.SOLARI_API_KEY)throw fail(503,'Add SOLARI_API_KEY to use Instagram.');};
 let login=null;           // the open login session {client,browser,page,id}
 const sending=new Set();  // drafts being sent right now

 const closeSession=async s=>{
  if(!s)return;
  await live.unregister(s.id).catch(()=>{});
  await s.browser.close().catch(()=>{});
  await s.client.close?.().catch?.(()=>{});
 };
 const ig={
  // {connected, profileId, savedAt}. Reads the settings row only. Never returns cookies.
  status(){const s=read();return {connected:Boolean(s.connected&&s.profileId),profileId:s.profileId||null,savedAt:s.savedAt||null};},
  hasLoginSession:()=>Boolean(login),

  async ensureProfile(client){
   const known=read().profileId;
   if(known)return known;
   const found=(await client.profiles.list()).find(p=>p.name===PROFILE_NAME)||await client.profiles.create({name:PROFILE_NAME});
   write({profileId:found.id});
   return found.id;
  },

  // Opens the Instagram login page in a stealth Solari browser with the mint-instagram profile attached. Ryan logs in through the Browser tab.
  async connect(){
   requireKey();
   if(login&&live.has(login.id))return {sessionId:login.id,profileId:login.profileId,url:login.page.url?.()||LOGIN_URL,reused:true};
   const client=await makeClient();
   let browser;
   try{
    const profileId=await ig.ensureProfile(client);
    browser=await client.launch({stealth:true,proxy:'us',recording:false,profileId});
    const page=await browser.newPage();
    const s={client,browser,page,id:browser.id,profileId};
    login=s;
    await live.attach({id:s.id,purpose:'Instagram login',page,close:()=>ig.cancelLogin()});
    await page.goto(LOGIN_URL,{waitUntil:'domcontentloaded',timeout:30000});
    return {sessionId:s.id,profileId,url:page.url?.()||LOGIN_URL,reused:false};
   }catch(err){
    const s=login;login=null;
    if(s)await closeSession(s);else{await browser?.close?.().catch(()=>{});await client.close?.().catch?.(()=>{});}
    throw err.status?err:fail(502,`Could not open Instagram: ${String(err.message||err).split('\n')[0]}`);
   }
  },

  async cancelLogin(){const s=login;login=null;await closeSession(s);},

  // Saves the open session's cookies and localStorage into the profile, then closes the session.
  async save(){
   requireKey();
   const s=login;
   if(!s)throw fail(409,'No Instagram login is open. Press Connect Instagram first.');
   const ctx=s.browser.context||s.browser.raw?.contexts?.()[0];
   const state=await ctx.storageState();
   if(!hasInstagramSession(state))throw fail(409,'Instagram is not logged in yet. Finish logging in, then press Save login.');
   await s.client.profiles.save(s.profileId,state);
   write({profileId:s.profileId,connected:true,savedAt:new Date().toISOString()});
   login=null;
   await closeSession(s);
   return ig.status();
  },

  // The only DM sender. Needs Ryan's confirm, a ready instagram_dm draft and a connected Instagram. Returns after the draft is marked sent;
  // the browser stays open for holdMs so he sees the thread, then closes. result.closed resolves when it has closed.
  async sendDm(draftId,body={}){
   const id=Number(draftId),d=store.getDraft(id);
   if(!d)throw fail(404,'No such draft');
   if(body?.confirm!==true)throw fail(400,'Sending needs {"confirm":true}. Press the send button to confirm.');
   if(d.channel!=='instagram_dm')throw fail(409,'Only an Instagram DM draft can be sent here.');
   if(d.status==='sent')throw fail(409,'This DM was already sent.');
   if(d.status==='withdrawn')throw fail(409,'This draft was withdrawn.');
   const lead=store.getLead(d.lead_id),handle=dmHandle(d,lead);
   const ready=draftReadiness({draft:d,lead,render:d.render_id?store.getRender(d.render_id):null,instagram:ig.status().connected});
   if(!ready.ready)throw fail(409,`Not ready to send. Missing: ${ready.missing.join(', ')}.`,{missing:ready.missing});
   requireKey();
   if(sending.has(id))throw fail(409,'This DM is already being sent.');
   if(sending.size)throw fail(409,'Another DM is being sent. Wait for it to finish.');
   sending.add(id);
   let s=null,step='open session';
   const log=(type,title,data)=>store.addEvent({taskId:lead?.task_id??d.task_id??null,leadId:d.lead_id,type,tool:'instagram.dm',title,data});
   try{
    const client=await makeClient();
    const profileId=read().profileId;
    const browser=await client.launch({stealth:true,proxy:'us',recording:false,profileId});
    s={client,browser,id:browser.id};
    const page=await browser.newPage();
    await live.attach({id:s.id,purpose:`DM to @${handle}`,leadId:d.lead_id,page,close:()=>closeSession(s)});
    try{await driveDm(page,{handle,text:d.body,sleep});}
    catch(err){step=err.step||'send';if(err.loggedOut)write({connected:false});throw err;}
    // markDraftSent is idempotent on status, and the in-flight guard plus the status check above stop a second send.
    const sent=store.markDraftSent(id);
    log('draft',`DM sent to @${handle}`,{draftId:id,handle});
    const closed=(async()=>{if(holdMs>0)await sleep(holdMs);await closeSession(s);})();
    closed.catch(()=>{});
    return {draft:sent,handle,closed};
   }catch(err){
    const keep=s;s=null;
    if(keep)await closeSession(keep);
    // The error text is scrubbed so the message body can never leak into the log.
    let why=String(err?.message||err).split('\n')[0];
    for(const piece of [String(d.body||''),...String(d.body||'').split('\n').map(l=>l.trim())].filter(p=>p.length>=3).sort((x,y)=>y.length-x.length))why=why.split(piece).join('[message]');
    why=why.slice(0,200);
    log('error',`DM to @${handle} failed at ${err?.step||step}: ${why}. The draft was left unsent.`,{draftId:id,step:err?.step||step});
    throw err.status?err:fail(502,`The DM did not send (${err?.step||step}). ${why}`,{step:err?.step||step});
   }finally{sending.delete(id);}
  }
 };
 return ig;
}
