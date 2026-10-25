import {storyboardPlanHash} from './order-storyboard-family.mjs';
import {DatabaseSync} from 'node:sqlite';
import {EventEmitter} from 'node:events';
import {mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const here=path.dirname(fileURLToPath(import.meta.url));
export const dataDir=process.env.AGENT_DATA_DIR||path.join(here,'.data');
const now=()=>new Date().toISOString();
const json=value=>value===undefined?null:JSON.stringify(value);
const parse=text=>{if(text==null)return null;try{return JSON.parse(text);}catch{return null;}};

const schema=`
create table if not exists tasks(id integer primary key,prompt text not null,status text not null,plan text,summary text,cost_usd real not null default 0,created_at text not null,updated_at text not null);
create table if not exists events(id integer primary key,task_id integer,lead_id integer,at text not null,type text not null,tool text,title text not null,detail text,data text);
create table if not exists steers(id integer primary key,task_id integer not null,at text not null,message text not null,applied_at text,reply text);
create table if not exists leads(id integer primary key,task_id integer,domain text not null unique,company text,url text,market text,territory text,status text not null,fit_score integer,reasons text,risks text,evidence text,contact_email text,contact_source text,contact_excerpt text,emails text,screenshot text,notes text,created_at text not null,updated_at text not null);
create table if not exists drafts(id integer primary key,lead_id integer not null,task_id integer,to_email text,subject text not null,body text not null,gmail_draft_id text,gmail_url text,status text not null,created_at text not null);
create table if not exists renders(id integer primary key,title text not null,endpoint text not null,input text not null,status text not null,checks text,estimate_usd text,request_id text,result_url text,local_file text,error text,approved_at text,created_at text not null,updated_at text not null);
create table if not exists storyboards(id integer primary key,title text not null,brief text not null,plan text not null,status text not null,checks text,version integer not null default 1,parent_id integer,note text,cost_usd real not null default 0,created_at text not null,updated_at text not null);
create table if not exists voices(id integer primary key,name text not null,description text not null,line text not null,status text not null,generated_voice_id text,voice_id text,sample_file text,checks text,characters integer not null default 0,storyboard_id integer,created_at text not null,updated_at text not null);
create table if not exists spend(id integer primary key,at text not null,provider text not null,usd real not null,task_id integer,storyboard_id integer,render_id integer,note text);
create index if not exists events_task on events(task_id,id);
create table if not exists panels(id integer primary key,render_id integer not null,token text not null unique,opportunity_id text,status text not null,participants integer not null,price_per_participant real,total_usd real,links text,audience text,responses integer not null default 0,score integer,error text,created_at text not null,updated_at text not null);
create index if not exists events_lead on events(lead_id,id);`;

export function openStore(file=path.join(dataDir,'agent.db')){
 if(file!==':memory:')mkdirSync(path.dirname(file),{recursive:true});
 const db=new DatabaseSync(file);
 if(file!==':memory:')db.exec('pragma journal_mode=wal');
 db.exec(schema);
 for(const col of ['model text','attachments text'])try{db.exec(`alter table tasks add column ${col}`);}catch{}
 for(const col of ['group_name text','shot_id text','review text','review_note text','reviewed_at text','submission_key text','reconciled_at text','lead_id integer','storyboard_id integer','storyboard_plan_hash text'])try{db.exec(`alter table renders add column ${col}`);}catch{}
 try{db.exec('alter table leads add column logo text');}catch{}
 for(const col of ['socials text','value text','contact_kind text','instagram_handle text','contact_name text'])try{db.exec(`alter table leads add column ${col}`);}catch{}
 for(const col of ['products text','brand_profile text'])try{db.exec(`alter table leads add column ${col}`);}catch{}
 try{db.exec('alter table renders add column plan text');}catch{}
 try{db.exec('alter table drafts add column render_id integer');}catch{}
 try{db.exec("alter table drafts add column channel text not null default 'email'");}catch{}
 try{db.exec('alter table drafts add column attachments text');}catch{}
 // One time: itemize spend recorded before the ledger existed. Exa prices were logged on its events; the rest was Claude.
 if(!db.prepare('select count(*) n from spend').get().n){
  const add=db.prepare('insert into spend(at,provider,usd,task_id,storyboard_id,note) values(?,?,?,?,?,?)');
  for(const t of db.prepare('select id,cost_usd,updated_at from tasks where cost_usd>0').all()){
   const exa=db.prepare("select title from events where task_id=? and type='tool_result' and tool like '%exa%'").all(t.id).reduce((sum,e)=>sum+Number((e.title.match(/\(\$([\d.]+)\)/)||[])[1]||0),0);
   if(exa>0)add.run(t.updated_at,'exa',Math.min(exa,t.cost_usd),t.id,null,'itemized from earlier totals');
   if(t.cost_usd-exa>0)add.run(t.updated_at,'claude',t.cost_usd-exa,t.id,null,'itemized from earlier totals');
  }
  for(const s of db.prepare('select id,cost_usd,updated_at from storyboards where cost_usd>0').all())add.run(s.updated_at,'claude',s.cost_usd,null,s.id,'itemized from earlier totals');
 }
 const bus=new EventEmitter();bus.setMaxListeners(100);
 const task=row=>row&&{...row,plan:parse(row.plan),attachments:parse(row.attachments)||[]};
 const event=row=>row&&{...row,data:parse(row.data)};
 const lead=row=>row&&{...row,reasons:parse(row.reasons)||[],risks:parse(row.risks)||[],emails:parse(row.emails)||[],socials:parse(row.socials)||{},value:parse(row.value)||null,products:parse(row.products),brand_profile:parse(row.brand_profile)};
 const render=row=>row&&{...row,input:parse(row.input),checks:parse(row.checks),plan:parse(row.plan)};
 // Attachments are metadata only ([{kind,filename,mime,bytes}]); the files are rebuilt when Gmail needs them.
 const draft=row=>row&&{...row,attachments:parse(row.attachments)||[]};
 const voice=row=>row&&{...row,checks:parse(row.checks)};
 const board=row=>row&&{...row,brief:parse(row.brief),plan:parse(row.plan),checks:parse(row.checks)};
 const panelRow=row=>row&&{...row,links:parse(row.links),audience:parse(row.audience)};
 const store={db,bus,
  createTask(prompt,{model=null,attachments=[]}={}){const at=now();const id=Number(db.prepare('insert into tasks(prompt,status,model,attachments,created_at,updated_at) values(?,?,?,?,?,?)').run(prompt,'queued',model,json(attachments),at,at).lastInsertRowid);const t=store.getTask(id);bus.emit('change',{kind:'task',task:t});return t;},
  getTask(id){return task(db.prepare('select * from tasks where id=?').get(id));},
  listTasks(){return db.prepare("select t.*,(select count(*) from leads l where l.task_id=t.id) leads,(select count(*) from drafts d where d.task_id=t.id) drafts,(select count(*) from leads l where l.task_id=t.id and l.status in ('visiting','grading','drafting')) working,(select count(*) from leads l where l.task_id=t.id and l.status in ('unreachable','error')) failed from tasks t order by t.id desc limit 200").all().map(task);},
  updateTask(id,fields){const at=now();const cols=Object.keys(fields);db.prepare(`update tasks set ${cols.map(c=>`${c}=?`).join(',')},updated_at=? where id=?`).run(...cols.map(c=>c==='plan'?json(fields[c]):fields[c]),at,id);const t=store.getTask(id);bus.emit('change',{kind:'task',task:t});return t;},
  addCost(id,usd){if(usd>0)db.prepare('update tasks set cost_usd=cost_usd+? where id=?').run(usd,id);},
  addEvent({taskId=null,leadId=null,type,tool=null,title,detail=null,data}){const at=now();const id=Number(db.prepare('insert into events(task_id,lead_id,at,type,tool,title,detail,data) values(?,?,?,?,?,?,?,?)').run(taskId,leadId,at,type,tool,title,detail,json(data)).lastInsertRowid);const e=event(db.prepare('select * from events where id=?').get(id));bus.emit('change',{kind:'event',event:e});return e;},
  listEvents({taskId,leadId,after=0,limit=1000}={}){if(leadId)return db.prepare('select * from events where lead_id=? and id>? order by id limit ?').all(leadId,after,limit).map(event);if(taskId)return db.prepare('select * from events where task_id=? and id>? order by id limit ?').all(taskId,after,limit).map(event);return db.prepare('select * from events where id>? order by id desc limit ?').all(after,limit).map(event).reverse();},
  addSteer(taskId,message){const id=Number(db.prepare('insert into steers(task_id,at,message) values(?,?,?)').run(taskId,now(),message).lastInsertRowid);return db.prepare('select * from steers where id=?').get(id);},
  pendingSteers(taskId){return db.prepare('select * from steers where task_id=? and applied_at is null order by id').all(taskId);},
  listSteers(taskId){return db.prepare('select * from steers where task_id=? order by id').all(taskId);},
  markSteer(id,reply){db.prepare('update steers set applied_at=?,reply=? where id=?').run(now(),reply,id);},
  findLeadByDomain(domain){return lead(db.prepare('select * from leads where domain=?').get(domain));},
  createLead(fields){const at=now();const id=Number(db.prepare('insert into leads(task_id,domain,company,url,market,territory,status,evidence,logo,created_at,updated_at) values(?,?,?,?,?,?,?,?,?,?,?)').run(fields.taskId,fields.domain,fields.company,fields.url,fields.market,fields.territory,fields.status||'found',fields.evidence||null,fields.logo||null,at,at).lastInsertRowid);const l=store.getLead(id);bus.emit('change',{kind:'lead',lead:l});return l;},
  getLead(id){return lead(db.prepare('select * from leads where id=?').get(id));},
  listLeads({taskId}={}){const rows=taskId?db.prepare('select * from leads where task_id=? order by id desc').all(taskId):db.prepare('select * from leads order by id desc limit 1000').all();return rows.map(lead);},
  updateLead(id,fields){const at=now();const cols=Object.keys(fields);db.prepare(`update leads set ${cols.map(c=>`${c}=?`).join(',')},updated_at=? where id=?`).run(...cols.map(c=>['reasons','risks','emails','socials','value','products','brand_profile'].includes(c)?json(fields[c]):fields[c]),at,id);const l=store.getLead(id);bus.emit('change',{kind:'lead',lead:l});return l;},
  addDraft(fields){const id=Number(db.prepare('insert into drafts(lead_id,task_id,to_email,subject,body,gmail_draft_id,gmail_url,status,render_id,channel,created_at,attachments) values(?,?,?,?,?,?,?,?,?,?,?,?)').run(fields.leadId,fields.taskId,fields.to,fields.subject,fields.body,fields.gmailDraftId||null,fields.gmailUrl||null,fields.status,fields.renderId||null,fields.channel||'email',now(),fields.attachments?json(fields.attachments):null).lastInsertRowid);return store.getDraft(id);},
  updateDraft(id,fields){const cols=Object.keys(fields);if(cols.length)db.prepare(`update drafts set ${cols.map(c=>`${c}=?`).join(',')} where id=?`).run(...cols.map(c=>c==='attachments'?json(fields[c]):fields[c]),id);return store.getDraft(id);},
  getDraft(id){return draft(db.prepare('select * from drafts where id=?').get(id));},
  markDraftSent(id){const d=store.getDraft(id);if(!d)return null;if(d.status==='withdrawn')return d;db.prepare("update drafts set status='sent' where id=?").run(id);const l=store.getLead(d.lead_id);if(l&&['drafted','found','awaiting_video'].includes(l.status))store.updateLead(l.id,{status:'contacted'});return store.getDraft(id);},
  listDrafts({leadId,taskId}={}){if(leadId)return db.prepare('select * from drafts where lead_id=? order by id desc').all(leadId).map(draft);if(taskId)return db.prepare('select * from drafts where task_id=? order by id desc').all(taskId).map(draft);return db.prepare('select * from drafts order by id desc limit 500').all().map(draft);},
  createRender({title,endpoint,input,group=null,shotId=null,leadId=null,plan=null,storyboardId=null,sourceConfirmed=true}){const at=now();const id=Number(db.prepare('insert into renders(title,endpoint,input,status,group_name,shot_id,lead_id,plan,storyboard_id,storyboard_plan_hash,created_at,updated_at) values(?,?,?,?,?,?,?,?,?,?,?,?)').run(title,endpoint,json(input),'draft',group,shotId,leadId,plan?json(plan):null,storyboardId,sourceConfirmed===true&&storyboardId&&store.getStoryboard(storyboardId)?storyboardPlanHash(store.getStoryboard(storyboardId).plan):null,at,at).lastInsertRowid);const r=store.getRender(id);bus.emit('change',{kind:'render',render:r});return r;},
  getRender(id){return render(db.prepare('select * from renders where id=?').get(id));},
  listRenders({leadId}={}){return (leadId?db.prepare('select * from renders where lead_id=? order by id desc').all(leadId):db.prepare('select * from renders order by id desc').all()).map(render);},
  // A render keeps its first key, so approving again after a never-started reconcile sends Higgsfield the same Idempotency-Key.
  claimRenderSubmission(id,estimate,key){const at=now();const changed=db.prepare("update renders set status='submitting',submission_key=coalesce(submission_key,?),approved_at=?,updated_at=? where id=? and status='checks_passed' and estimate_usd=?").run(key,at,at,id,String(estimate));if(Number(changed.changes)!==1)return null;const r=store.getRender(id);bus.emit('change',{kind:'render',render:r});return r;},
  // Settles an uncertain submission: Higgsfield has the request, or it never started and the render goes back to awaiting approval.
  reconcileRender(id,{requestId=null}={}){const at=now();const changed=requestId?db.prepare("update renders set status='queued',request_id=?,error=null,reconciled_at=?,updated_at=? where id=? and status in ('submitting','submission_unknown') and request_id is null").run(requestId,at,at,id):db.prepare("update renders set status='checks_passed',error=null,approved_at=null,reconciled_at=?,updated_at=? where id=? and status in ('submitting','submission_unknown') and request_id is null").run(at,at,id);if(Number(changed.changes)!==1)return null;const r=store.getRender(id);bus.emit('change',{kind:'render',render:r});return r;},
  updateRender(id,fields){const before=store.getRender(id);if(['input','shot_id','endpoint','storyboard_id'].some(k=>Object.hasOwn(fields,k)&&(k==='input'?json(fields[k])!==json(before?.[k]):fields[k]!==before?.[k])))fields={...fields,storyboard_plan_hash:null};const at=now();const cols=Object.keys(fields);db.prepare(`update renders set ${cols.map(c=>`${c}=?`).join(',')},updated_at=? where id=?`).run(...cols.map(c=>['input','checks','plan'].includes(c)?json(fields[c]):fields[c]),at,id);const r=store.getRender(id);bus.emit('change',{kind:'render',render:r});return r;},
  createStoryboard({title,brief,plan,version=1,parentId=null,cost=0}){const at=now();const id=Number(db.prepare('insert into storyboards(title,brief,plan,status,version,parent_id,cost_usd,created_at,updated_at) values(?,?,?,?,?,?,?,?,?)').run(title,json(brief),json(plan),'draft',version,parentId,cost,at,at).lastInsertRowid);const s=store.getStoryboard(id);bus.emit('change',{kind:'storyboard',storyboard:s});return s;},
  getStoryboard(id){return board(db.prepare('select * from storyboards where id=?').get(id));},
  listStoryboards(){return db.prepare('select * from storyboards order by id desc limit 200').all().map(board);},
  updateStoryboard(id,fields,addCost=0){const at=now();const cols=Object.keys(fields);db.prepare(`update storyboards set ${cols.map(c=>`${c}=?`).join(',')}${cols.length?',':''}cost_usd=cost_usd+?,updated_at=? where id=?`).run(...cols.map(c=>['brief','plan','checks'].includes(c)?json(fields[c]):fields[c]),addCost,at,id);const s=store.getStoryboard(id);bus.emit('change',{kind:'storyboard',storyboard:s});return s;},
  // Human panels (Terac). One row per panel bought for a render; status draft, launched, complete or failed.
  createPanel({renderId,token,opportunityId=null,status='draft',participants,pricePerParticipant=null,totalUsd=null,links=null,audience=null}){const at=now();const id=Number(db.prepare('insert into panels(render_id,token,opportunity_id,status,participants,price_per_participant,total_usd,links,audience,created_at,updated_at) values(?,?,?,?,?,?,?,?,?,?,?)').run(renderId,token,opportunityId,status,participants,pricePerParticipant,totalUsd,json(links),json(audience),at,at).lastInsertRowid);const p=store.getPanel(id);bus.emit('change',{kind:'panel',panel:p});return p;},
  getPanel(id){return panelRow(db.prepare('select * from panels where id=?').get(id));},
  listPanels({renderId}={}){return (renderId?db.prepare('select * from panels where render_id=? order by id desc').all(renderId):db.prepare('select * from panels order by id desc limit 500').all()).map(panelRow);},
  updatePanel(id,fields){const at=now();const cols=Object.keys(fields);db.prepare(`update panels set ${cols.map(c=>`${c}=?`).join(',')}${cols.length?',':''}updated_at=? where id=?`).run(...cols.map(c=>['links','audience'].includes(c)?json(fields[c]):fields[c]),at,id);const p=store.getPanel(id);bus.emit('change',{kind:'panel',panel:p});return p;},
  createVoice({name,description,line,generatedVoiceId=null,sampleFile=null,storyboardId=null,characters=0}){const at=now();const id=Number(db.prepare('insert into voices(name,description,line,status,generated_voice_id,sample_file,characters,storyboard_id,created_at,updated_at) values(?,?,?,?,?,?,?,?,?,?)').run(name,description,line,'needs_checks',generatedVoiceId,sampleFile,characters,storyboardId,at,at).lastInsertRowid);const v=store.getVoice(id);bus.emit('change',{kind:'voice',voice:v});return v;},
  getVoice(id){return voice(db.prepare('select * from voices where id=?').get(id));},
  listVoices(){return db.prepare('select * from voices order by id desc limit 300').all().map(voice);},
  updateVoice(id,fields,addCharacters=0){const at=now();const cols=Object.keys(fields);db.prepare(`update voices set ${cols.map(c=>`${c}=?`).join(',')}${cols.length?',':''}characters=characters+?,updated_at=? where id=?`).run(...cols.map(c=>c==='checks'?json(fields[c]):fields[c]),addCharacters,at,id);const v=store.getVoice(id);bus.emit('change',{kind:'voice',voice:v});return v;},
  addSpend({provider,usd,taskId=null,storyboardId=null,renderId=null,note=null}){if(!(usd>0))return;db.prepare('insert into spend(at,provider,usd,task_id,storyboard_id,render_id,note) values(?,?,?,?,?,?,?)').run(now(),provider,usd,taskId,storyboardId,renderId,note);bus.emit('change',{kind:'spend'});},
  // Usage with no known dollar figure (ElevenLabs credits). Kept as a zero dollar ledger row so the note records what was used.
  addUsage({provider,taskId=null,storyboardId=null,renderId=null,note=null}){db.prepare('insert into spend(at,provider,usd,task_id,storyboard_id,render_id,note) values(?,?,?,?,?,?,?)').run(now(),provider,0,taskId,storyboardId,renderId,note);bus.emit('change',{kind:'spend'});},
  spendSummary(){
   const day=new Date();day.setHours(0,0,0,0);
   const rows=db.prepare('select provider,sum(usd) total,count(*) n,sum(case when at>=? then usd else 0 end) today from spend group by provider order by total desc').all(day.toISOString());
   return {total:rows.reduce((s,r)=>s+r.total,0),today:rows.reduce((s,r)=>s+r.today,0),providers:rows.map(r=>({provider:r.provider,total:r.total,today:r.today,count:r.n}))};
  },
  // Home chart: totals plus one bucket per hour (today), day (week, month) or month (year), in local time.
  // Each bucket carries its own range (from, to), spendBy (usd per provider) and the totals stay as before.
  // events lists the real leads and drafts created inside the range (oldest first), for timeline markers.
  // The optional second argument is the clock, so tests can pin "now".
  metrics(range='week',clock=new Date()){
   const start=new Date(clock);start.setHours(0,0,0,0);const buckets=[];
   if(range==='today')for(let h=0;h<24;h++){const at=new Date(start);at.setHours(h);buckets.push({at,label:`${String(h).padStart(2,'0')}:00`});}
   else if(range==='year'){start.setDate(1);start.setMonth(start.getMonth()-11);for(let i=0;i<12;i++){const at=new Date(start);at.setMonth(start.getMonth()+i);buckets.push({at,label:at.toLocaleDateString('en-US',{month:'short'})});}}
   else{const days=range==='month'?30:7;start.setDate(start.getDate()-(days-1));for(let i=0;i<days;i++){const at=new Date(start);at.setDate(start.getDate()+i);buckets.push({at,label:at.toLocaleDateString('en-US',{month:'short',day:'numeric'})});}}
   const edge=new Date(buckets[buckets.length-1].at);
   if(range==='today')edge.setHours(edge.getHours()+1);else if(range==='year')edge.setMonth(edge.getMonth()+1);else edge.setDate(edge.getDate()+1);
   const since=buckets[0].at.toISOString();
   const series=buckets.map((b,i)=>({label:b.label,from:b.at.toISOString(),to:(buckets[i+1]?.at||edge).toISOString(),drafts:0,leads:0,missions:0,spend:0,spendBy:{}}));
   const slot=at=>{const t=new Date(at);for(let i=buckets.length-1;i>=0;i--)if(t>=buckets[i].at)return i;return -1;};
   const tally=(rows,key,value=()=>1)=>{for(const r of rows){const i=slot(r.at);if(i>=0)series[i][key]+=value(r);}};
   tally(db.prepare('select created_at at from drafts where created_at>=?').all(since),'drafts');
   tally(db.prepare('select created_at at from leads where created_at>=?').all(since),'leads');
   tally(db.prepare('select created_at at from tasks where created_at>=?').all(since),'missions');
   for(const r of db.prepare('select at,provider,usd from spend where at>=?').all(since)){const i=slot(r.at);if(i<0)continue;series[i].spend+=r.usd;series[i].spendBy[r.provider]=(series[i].spendBy[r.provider]||0)+r.usd;}
   const events=[
    ...db.prepare('select id leadId,created_at at,company,domain from leads where created_at>=?').all(since).map(r=>({kind:'lead',at:r.at,leadId:r.leadId,company:r.company,domain:r.domain})),
    ...db.prepare('select d.id draftId,d.lead_id leadId,d.created_at at,l.company,l.domain from drafts d left join leads l on l.id=d.lead_id where d.created_at>=?').all(since).map(r=>({kind:'draft',at:r.at,leadId:r.leadId,draftId:r.draftId,company:r.company,domain:r.domain}))
   ].sort((a,b)=>a.at<b.at?-1:a.at>b.at?1:0).slice(-400);
   const sum=k=>series.reduce((s,b)=>s+b[k],0);
   return {range,from:since,to:edge.toISOString(),totals:{drafts:sum('drafts'),leads:sum('leads'),missions:sum('missions'),spend:sum('spend')},series,events};
  },
  stats(){return {reviews:db.prepare("select count(*) n from renders where review='pending'").get().n,needsYou:db.prepare("select count(*) n from renders where status='checks_passed' or (status='completed' and review='pending')").get().n,tasks:db.prepare("select count(*) n from tasks where status in ('running','paused','queued')").get().n,leads:db.prepare('select count(*) n from leads').get().n,drafts:db.prepare("select count(*) n from drafts where status='gmail_draft'").get().n,spend:db.prepare('select coalesce(sum(usd),0) n from spend').get().n};}
 };
 return store;
}
