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
create index if not exists events_task on events(task_id,id);
create index if not exists events_lead on events(lead_id,id);`;

export function openStore(file=path.join(dataDir,'agent.db')){
 if(file!==':memory:')mkdirSync(path.dirname(file),{recursive:true});
 const db=new DatabaseSync(file);
 if(file!==':memory:')db.exec('pragma journal_mode=wal');
 db.exec(schema);
 const bus=new EventEmitter();bus.setMaxListeners(100);
 const task=row=>row&&{...row,plan:parse(row.plan)};
 const event=row=>row&&{...row,data:parse(row.data)};
 const lead=row=>row&&{...row,reasons:parse(row.reasons)||[],risks:parse(row.risks)||[],emails:parse(row.emails)||[]};
 const render=row=>row&&{...row,input:parse(row.input),checks:parse(row.checks)};
 const store={db,bus,
  createTask(prompt){const at=now();const id=Number(db.prepare('insert into tasks(prompt,status,created_at,updated_at) values(?,?,?,?)').run(prompt,'queued',at,at).lastInsertRowid);const t=store.getTask(id);bus.emit('change',{kind:'task',task:t});return t;},
  getTask(id){return task(db.prepare('select * from tasks where id=?').get(id));},
  listTasks(){return db.prepare('select t.*,(select count(*) from leads l where l.task_id=t.id) leads,(select count(*) from drafts d where d.task_id=t.id) drafts from tasks t order by t.id desc limit 200').all().map(task);},
  updateTask(id,fields){const at=now();const cols=Object.keys(fields);db.prepare(`update tasks set ${cols.map(c=>`${c}=?`).join(',')},updated_at=? where id=?`).run(...cols.map(c=>c==='plan'?json(fields[c]):fields[c]),at,id);const t=store.getTask(id);bus.emit('change',{kind:'task',task:t});return t;},
  addCost(id,usd){if(usd>0)db.prepare('update tasks set cost_usd=cost_usd+? where id=?').run(usd,id);},
  addEvent({taskId=null,leadId=null,type,tool=null,title,detail=null,data}){const at=now();const id=Number(db.prepare('insert into events(task_id,lead_id,at,type,tool,title,detail,data) values(?,?,?,?,?,?,?,?)').run(taskId,leadId,at,type,tool,title,detail,json(data)).lastInsertRowid);const e=event(db.prepare('select * from events where id=?').get(id));bus.emit('change',{kind:'event',event:e});return e;},
  listEvents({taskId,leadId,after=0,limit=1000}={}){if(leadId)return db.prepare('select * from events where lead_id=? and id>? order by id limit ?').all(leadId,after,limit).map(event);if(taskId)return db.prepare('select * from events where task_id=? and id>? order by id limit ?').all(taskId,after,limit).map(event);return db.prepare('select * from events where id>? order by id desc limit ?').all(after,limit).map(event).reverse();},
  addSteer(taskId,message){const id=Number(db.prepare('insert into steers(task_id,at,message) values(?,?,?)').run(taskId,now(),message).lastInsertRowid);return db.prepare('select * from steers where id=?').get(id);},
  pendingSteers(taskId){return db.prepare('select * from steers where task_id=? and applied_at is null order by id').all(taskId);},
  listSteers(taskId){return db.prepare('select * from steers where task_id=? order by id').all(taskId);},
  markSteer(id,reply){db.prepare('update steers set applied_at=?,reply=? where id=?').run(now(),reply,id);},
  findLeadByDomain(domain){return lead(db.prepare('select * from leads where domain=?').get(domain));},
  createLead(fields){const at=now();const id=Number(db.prepare('insert into leads(task_id,domain,company,url,market,territory,status,evidence,created_at,updated_at) values(?,?,?,?,?,?,?,?,?,?)').run(fields.taskId,fields.domain,fields.company,fields.url,fields.market,fields.territory,fields.status||'found',fields.evidence||null,at,at).lastInsertRowid);const l=store.getLead(id);bus.emit('change',{kind:'lead',lead:l});return l;},
  getLead(id){return lead(db.prepare('select * from leads where id=?').get(id));},
  listLeads({taskId}={}){const rows=taskId?db.prepare('select * from leads where task_id=? order by id desc').all(taskId):db.prepare('select * from leads order by id desc limit 1000').all();return rows.map(lead);},
  updateLead(id,fields){const at=now();const cols=Object.keys(fields);db.prepare(`update leads set ${cols.map(c=>`${c}=?`).join(',')},updated_at=? where id=?`).run(...cols.map(c=>['reasons','risks','emails'].includes(c)?json(fields[c]):fields[c]),at,id);const l=store.getLead(id);bus.emit('change',{kind:'lead',lead:l});return l;},
  addDraft(fields){const id=Number(db.prepare('insert into drafts(lead_id,task_id,to_email,subject,body,gmail_draft_id,gmail_url,status,created_at) values(?,?,?,?,?,?,?,?,?)').run(fields.leadId,fields.taskId,fields.to,fields.subject,fields.body,fields.gmailDraftId||null,fields.gmailUrl||null,fields.status,now()).lastInsertRowid);return db.prepare('select * from drafts where id=?').get(id);},
  listDrafts({leadId,taskId}={}){if(leadId)return db.prepare('select * from drafts where lead_id=? order by id desc').all(leadId);if(taskId)return db.prepare('select * from drafts where task_id=? order by id desc').all(taskId);return db.prepare('select * from drafts order by id desc limit 500').all();},
  createRender({title,endpoint,input}){const at=now();const id=Number(db.prepare('insert into renders(title,endpoint,input,status,created_at,updated_at) values(?,?,?,?,?,?)').run(title,endpoint,json(input),'draft',at,at).lastInsertRowid);const r=store.getRender(id);bus.emit('change',{kind:'render',render:r});return r;},
  getRender(id){return render(db.prepare('select * from renders where id=?').get(id));},
  listRenders(){return db.prepare('select * from renders order by id desc').all().map(render);},
  updateRender(id,fields){const at=now();const cols=Object.keys(fields);db.prepare(`update renders set ${cols.map(c=>`${c}=?`).join(',')},updated_at=? where id=?`).run(...cols.map(c=>['input','checks'].includes(c)?json(fields[c]):fields[c]),at,id);const r=store.getRender(id);bus.emit('change',{kind:'render',render:r});return r;},
  stats(){return {tasks:db.prepare("select count(*) n from tasks where status in ('running','paused','queued')").get().n,leads:db.prepare('select count(*) n from leads').get().n,drafts:db.prepare("select count(*) n from drafts where status='gmail_draft'").get().n,spend:db.prepare('select coalesce(sum(cost_usd),0) n from tasks').get().n};}
 };
 return store;
}
