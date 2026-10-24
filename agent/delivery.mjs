// The last step of a Whop order, done in the Mac app now that nothing is hosted on Vercel. It joins the order's finished
// shots into one captioned vertical video with ffmpeg, uploads it to the private "deliveries" bucket of the team's Supabase
// project, and drafts the delivery email in Gmail with a signed download link. Nothing is sent: the operator reads the
// draft and sends it. ffmpeg, Supabase Storage on the free plan and Gmail drafts cost nothing per order.
import {spawn,spawnSync} from 'node:child_process';
import {existsSync,mkdirSync,statSync,readFileSync} from 'node:fs';
import {mkdtemp,writeFile,copyFile,rm} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {dataDir} from './store.mjs';
import * as gmailTools from './tools/gmail.mjs';

const require=createRequire(import.meta.url);
export const BUCKET='deliveries',LINK_DAYS=30;
const fail=(status,message)=>Object.assign(Error(message),{status});

// ffmpeg comes from FFMPEG_PATH, the optional ffmpeg-static package that npm installs with the agent, Homebrew, or PATH.
export function findFfmpeg(env=process.env){
 const candidates=[env.FFMPEG_PATH];
 try{candidates.push(require('ffmpeg-static'));}catch{}
 candidates.push('/opt/homebrew/bin/ffmpeg','/usr/local/bin/ffmpeg');
 const found=candidates.find(p=>p&&existsSync(p));
 if(found)return found;
 return spawnSync('ffmpeg',['-version'],{stdio:'ignore'}).status===0?'ffmpeg':null;
}
const FONTS=['/System/Library/Fonts/Supplemental/Arial Bold.ttf','/Library/Fonts/Arial Bold.ttf','/System/Library/Fonts/Helvetica.ttc','/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'];
export const captionFont=(env=process.env)=>[env.CAPTION_FONT,...FONTS].find(f=>f&&existsSync(f))||null;
// Some ffmpeg builds have no drawtext filter. Those videos are made without captions instead of failing.
const drawtext=new Map();
const hasDrawtext=ffmpeg=>{if(!drawtext.has(ffmpeg))drawtext.set(ffmpeg,/\bdrawtext\b/.test(spawnSync(ffmpeg,['-hide_banner','-filters'],{encoding:'utf8'}).stdout||''));return drawtext.get(ffmpeg);};

function run(ffmpeg,args,{timeoutMs=180000}={}){
 return new Promise((resolve,reject)=>{
  const child=spawn(ffmpeg,['-hide_banner','-loglevel','error',...args],{stdio:['ignore','ignore','pipe']});
  let stderr='';const timer=setTimeout(()=>child.kill('SIGKILL'),timeoutMs);
  child.stderr.on('data',d=>{stderr=(stderr+d).slice(-4000);});
  child.on('error',e=>{clearTimeout(timer);reject(e);});
  child.on('close',code=>{clearTimeout(timer);code===0?resolve():reject(Error(`ffmpeg exited ${code}: ${stderr.trim().split('\n').slice(-3).join(' | ')}`));});
 });
}
// ffmpeg -i always exits non-zero without an output file, so read its stream listing instead of the exit code.
function hasAudio(ffmpeg,file){
 return new Promise(resolve=>{
  const child=spawn(ffmpeg,['-hide_banner','-i',file],{stdio:['ignore','ignore','pipe']});let out='';
  child.stderr.on('data',d=>{out+=d;});child.on('close',()=>resolve(/Stream #\d+:\d+.*Audio:/.test(out)));child.on('error',()=>resolve(false));
 });
}

// Up to four lines short enough for a 720 px wide frame.
export function wrapCaption(text,width=24){
 const lines=[];let line='';
 for(const word of String(text||'').replace(/\s+/g,' ').trim().split(' ').filter(Boolean)){
  if(line&&`${line} ${word}`.length>width){lines.push(line);line=word;}else line=line?`${line} ${word}`:word;
 }
 if(line)lines.push(line);
 return lines.slice(0,4);
}

// Joins clips into one 720x1280 MP4 at out. Each clip is normalized first (size, frame rate, stereo audio, silence when a
// clip has none) so the final concat copies streams instead of failing on mismatched clips. captions[i] is burned into clip i.
export async function stitch({clips,captions=[],out,ffmpeg=findFfmpeg(),font=captionFont(),fontSize=46}){
 if(!ffmpeg)throw fail(503,'ffmpeg is not installed. Run npm install in agent/ or brew install ffmpeg, then try again.');
 if(!clips.length)throw fail(409,'There are no clips to join.');
 const dir=await mkdtemp(path.join(tmpdir(),'mint-final-'));
 try{
  const burn=Boolean(font)&&hasDrawtext(ffmpeg),parts=[];
  for(const [i,clip] of clips.entries()){
   let vf='scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2,fps=30,setsar=1,format=yuv420p';
   // One drawtext per line, because drawtext cannot center the lines of one text block.
   if(burn)for(const [n,line] of wrapCaption(captions[i]).entries()){
    const textFile=path.join(dir,`caption-${i}-${n}.txt`);await writeFile(textFile,line);
    vf+=`,drawtext=fontfile='${font}':textfile='${textFile}':fontsize=${fontSize}:fontcolor=white:borderw=4:bordercolor=black:x=(w-text_w)/2:y=h*0.70+${n*(fontSize+14)}`;
   }
   const audio=await hasAudio(ffmpeg,clip),part=path.join(dir,`part-${i}.mp4`);
   await run(ffmpeg,['-y','-i',clip,...(audio?[]:['-f','lavfi','-i','anullsrc=channel_layout=stereo:sample_rate=44100']),'-vf',vf,
    '-map','0:v:0','-map',audio?'0:a:0':'1:a:0','-c:v','libx264','-preset','veryfast','-crf','21','-c:a','aac','-ar','44100','-ac','2','-b:a','128k','-shortest',part]);
   parts.push(part);
  }
  const list=path.join(dir,'list.txt'),joined=path.join(dir,'final.mp4');
  await writeFile(list,parts.map(p=>`file '${p}'`).join('\n'));
  await run(ffmpeg,['-y','-f','concat','-safe','0','-i',list,'-c','copy','-movflags','+faststart',joined]);
  mkdirSync(path.dirname(out),{recursive:true});await copyFile(joined,out);
  return {captions:burn};
 }finally{await rm(dir,{recursive:true,force:true});}
}

// The Supabase project and key the Mac app already uses. The panel's variable names work too, so one project serves both.
export const supabaseUrl=env=>String(env.SUPABASE_URL||env.SUPABASE_PANEL_URL||'').trim().replace(/\/$/,'');
export const supabaseKey=env=>String(env.SUPABASE_SECRET_KEY||env.SUPABASE_SERVICE_ROLE_KEY||env.SUPABASE_PANEL_SERVICE_KEY||'').trim();
// New sb_secret_ keys go only in the apikey header. Legacy service_role keys are JWTs and are also sent as the Bearer token.
const storageHeaders=(key,extra={})=>({apikey:key,...(key.startsWith('eyJ')?{Authorization:`Bearer ${key}`}:{}),...extra});
const objectPath=p=>p.split('/').map(encodeURIComponent).join('/');

export function deliveryEmail({buyerName,brand,link,expiresAt,sender='Mint Labs'}){
 const first=String(buyerName||'').trim().split(/\s+/)[0]||'there';
 const until=new Date(expiresAt).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric',timeZone:'UTC'});
 return {
  subject:`Your ${brand?`${brand} `:''}video from Mint Labs`,
  body:`Hi ${first},\n\nYour video is ready. You can watch and download it here:\n${link}\n\nThe link works until ${until}. If you would like any changes, reply to this email and we will take care of it.\n\nThanks,\n${sender}`
 };
}

export function createDelivery({store,env=process.env,gmail=gmailTools,fetch=globalThis.fetch,renderDir=path.join(dataDir,'renders'),stitch:join=stitch,ffmpeg=()=>findFfmpeg(env),font=()=>captionFont(env),sender=()=>'Mint Labs',now=()=>new Date()}={}){
 const db=store.db;
 // final_version counts remakes; prepared_for names the version the current link and draft deliver.
 db.exec('create table if not exists deliveries(payment_id text primary key,final_file text,final_render_ids text,final_at text,final_bytes integer,final_version integer,captions integer,storage_path text,link text,link_expires_at text,draft_id text,draft_url text,email text,prepared_at text,prepared_for integer,updated_at text not null)');
 const iso=()=>new Date(now()).toISOString();
 const row=id=>db.prepare('select * from deliveries where payment_id=?').get(id);
 const save=(id,fields)=>{
  const cols=Object.keys(fields),at=iso();
  db.prepare(`insert into deliveries(payment_id,${cols.join(',')},updated_at) values(?,${cols.map(()=>'?').join(',')},?) on conflict(payment_id) do update set ${cols.map(c=>`${c}=excluded.${c}`).join(',')},updated_at=excluded.updated_at`).run(id,...cols.map(c=>fields[c]),at);
 };
 const order=id=>{
  if(!db.prepare("select name from sqlite_master where type='table' and name='whop_orders'").get())return null;
  const o=db.prepare('select payment_id,product,buyer_email,buyer_name,brand_domain,task_id,storyboard_id,render_ids from whop_orders where payment_id=?').get(id);
  return o&&{...o,render_ids:o.render_ids?JSON.parse(o.render_ids):[]};
 };
 const need=id=>{const o=order(id);if(!o)throw fail(404,'No such Whop order.');return o;};
 const log=(o,title,tool)=>{if(o.task_id)store.addEvent({taskId:o.task_id,type:'status',tool,title});};
 const localFile=f=>f?path.join(renderDir,f):null;

 // Each shot uses its newest finished version that review did not reject. Revisions are new renders with the same shot id.
 function shots(o){
  const all=store.listRenders();
  return o.render_ids.map(id=>store.getRender(id)).filter(Boolean).map(first=>{
   const versions=all.filter(r=>r.id===first.id||(first.shot_id&&r.shot_id===first.shot_id&&r.group_name===first.group_name)).sort((a,b)=>b.id-a.id);
   const usable=versions.filter(r=>r.status==='completed'&&r.review!=='rejected'&&r.local_file&&existsSync(localFile(r.local_file)));
   return {shotId:first.shot_id,title:first.title.replace(/ \(v\d+\)$/,''),render:usable.find(r=>r.review==='approved')||usable[0]||null,latest:versions[0]};
  });
 }

 function get(id){
  const o=need(id),list=shots(o),d=row(id);
  const current=JSON.stringify(list.map(s=>s.render?.id||null));
  const final=d?.final_file&&existsSync(localFile(d.final_file))?{url:`/renders/${d.final_file}?v=${encodeURIComponent(d.final_at)}`,at:d.final_at,bytes:d.final_bytes,captions:Boolean(d.captions),stale:d.final_render_ids!==current}:null;
  return {
   order:{paymentId:o.payment_id,product:o.product,buyerName:o.buyer_name,buyerEmail:o.buyer_email,brand:o.brand_domain},
   shots:list.map(s=>({shotId:s.shotId,title:s.title,renderId:s.render?.id||null,status:s.render?'finished':s.latest?.status||'missing',review:s.render?.review||null})),
   ready:list.length>0&&list.every(s=>s.render),
   final,
   delivery:d?.link?{link:d.link,expiresAt:d.link_expires_at,draftUrl:d.draft_url,email:d.email?JSON.parse(d.email):null,preparedAt:d.prepared_at,stale:!final||d.prepared_for!==d.final_version}:null,
   setup:{ffmpeg:Boolean(ffmpeg()),storage:Boolean(supabaseUrl(env)&&supabaseKey(env)),gmail:Boolean(gmail.gmailEnabled?.())}
  };
 }

 const busy=new Map();
 const once=(key,fn)=>{if(busy.has(key))return busy.get(key);const p=fn().finally(()=>busy.delete(key));busy.set(key,p);return p;};

 const finish=id=>once(`final:${id}`,async()=>{
  const o=need(id),list=shots(o);
  if(!list.length)throw fail(409,'This order has no shots yet. They appear once its storyboard is approved.');
  const missing=list.filter(s=>!s.render);
  if(missing.length)throw fail(409,`${missing.length} of ${list.length} shots are not finished: ${missing.map(s=>s.title).join(', ')}.`);
  const plan=o.storyboard_id?store.getStoryboard(o.storyboard_id)?.plan:null;
  const dialogue=new Map((plan?.shots||[]).map((s,i)=>[String(s.id||`shot-${i+1}`),String(s.dialogue||'')]));
  const file=`finals/${o.payment_id.replace(/[^A-Za-z0-9_-]/g,'_')}.mp4`;
  const made=await join({clips:list.map(s=>localFile(s.render.local_file)),captions:list.map(s=>dialogue.get(String(s.shotId))||''),out:localFile(file),ffmpeg:ffmpeg(),font:font()});
  save(o.payment_id,{final_file:file,final_render_ids:JSON.stringify(list.map(s=>s.render.id)),final_at:iso(),final_bytes:statSync(localFile(file)).size,final_version:(row(o.payment_id)?.final_version||0)+1,captions:made?.captions?1:0});
  log(o,`Final video made from ${list.length} shots${made?.captions?' with captions':''}. Review it, then prepare the delivery email.`,'ffmpeg');
  return get(id);
 });

 async function storage(method,p,{body,type='application/json',upsert=false}={}){
  const res=await fetch(`${supabaseUrl(env)}/storage/v1${p}`,{method,headers:storageHeaders(supabaseKey(env),{'Content-Type':type,...(upsert?{'x-upsert':'true'}:{})}),body,signal:AbortSignal.timeout(300000)});
  const text=await res.text();
  if(!res.ok)throw Object.assign(fail(502,`Supabase Storage ${method} ${p.split('?')[0]} failed (HTTP ${res.status}): ${text.slice(0,200)}`),{http:res.status,text});
  try{return text?JSON.parse(text):null;}catch{return null;}
 }

 const deliver=id=>once(`deliver:${id}`,async()=>{
  const o=need(id),d=row(id);
  if(!d?.final_file||!existsSync(localFile(d.final_file)))throw fail(409,'Make the final video first.');
  if(!o.buyer_email)throw fail(409,'This order has no buyer email on Whop.');
  if(!supabaseUrl(env)||!supabaseKey(env))throw fail(503,'Add SUPABASE_URL and SUPABASE_SECRET_KEY to .env.local, then restart the app.');
  // The bucket stays private: buyers only get time-limited signed links.
  try{await storage('POST','/bucket',{body:JSON.stringify({id:BUCKET,name:BUCKET,public:false})});}
  catch(e){if(!/already exists|duplicate/i.test(e.text||''))throw e;}
  // A new name per upload, so a remade video never hides behind an older link.
  const name=`${o.payment_id.replace(/[^A-Za-z0-9_-]/g,'_')}/${String(o.brand_domain||'mint-labs').replace(/[^a-z0-9.-]/gi,'-')}-v${d.final_version}.mp4`;
  await storage('POST',`/object/${BUCKET}/${objectPath(name)}`,{body:readFileSync(localFile(d.final_file)),type:'video/mp4',upsert:true});
  const signed=await storage('POST',`/object/sign/${BUCKET}/${objectPath(name)}`,{body:JSON.stringify({expiresIn:LINK_DAYS*86400})});
  const href=signed?.signedURL||signed?.signedUrl;
  if(!href)throw fail(502,'Supabase did not return a download link.');
  const link=/^https?:/.test(href)?href:`${supabaseUrl(env)}/storage/v1${href.startsWith('/')?'':'/'}${href}`;
  const expiresAt=new Date(new Date(now()).getTime()+LINK_DAYS*86400000).toISOString();
  const email=deliveryEmail({buyerName:o.buyer_name,brand:o.brand_domain,link,expiresAt,sender:sender()});
  let draft=null;
  if(gmail.gmailEnabled?.()){
   // Rewrite this order's earlier draft when there is one. Never send.
   if(d.draft_id)try{draft=await gmail.updateDraft({draftId:d.draft_id,to:o.buyer_email,subject:email.subject,body:email.body});}catch{draft=null;}
   draft??=await gmail.createDraft({to:o.buyer_email,subject:email.subject,body:email.body});
  }
  save(o.payment_id,{storage_path:name,link,link_expires_at:expiresAt,draft_id:draft?.draftId||null,draft_url:draft?.url||null,email:JSON.stringify(email),prepared_at:iso(),prepared_for:d.final_version});
  log(o,draft?`Delivery email drafted in Gmail for ${o.buyer_email} with a ${LINK_DAYS}-day download link. Not sent.`:`Download link ready for ${o.buyer_email}. Gmail is not connected, so copy the email from the order page. Not sent.`,'supabase.storage');
  return get(id);
 });

 return {get,finish,deliver};
}
