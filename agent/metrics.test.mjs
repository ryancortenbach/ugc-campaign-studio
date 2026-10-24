import test from 'node:test';
import assert from 'node:assert/strict';
import {openStore} from './store.mjs';

// Pin the clock to a mid-day moment so every range has a known shape.
const CLOCK=new Date(2026,9,24,15,30,0);
const iso=(y,m,d,h=12,mi=0)=>new Date(y,m,d,h,mi,0).toISOString();
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} vs ${b}`);

function seed(){
 const store=openStore(':memory:');
 const db=store.db;
 const lead=(domain,company,at)=>{
  const l=store.createLead({taskId:1,domain,company,url:`https://${domain}`,market:'m',territory:'t'});
  db.prepare('update leads set created_at=? where id=?').run(at,l.id);return l.id;
 };
 const draft=(leadId,at)=>{
  const d=store.addDraft({leadId,taskId:1,to:'a@b.co',subject:'S',body:'B',status:'gmail_draft'});
  db.prepare('update drafts set created_at=? where id=?').run(at,d.id);return d.id;
 };
 const spend=(provider,usd,at)=>{db.prepare('insert into spend(at,provider,usd) values(?,?,?)').run(at,provider,usd);};
 return {store,db,lead,draft,spend};
}

test('bucket provider breakdown sums to the bucket total and the range total', () => {
 const {store,spend}=seed();
 spend('claude',0.25,iso(2026,9,24,9,5));
 spend('exa',0.01,iso(2026,9,24,9,40));
 spend('claude',0.5,iso(2026,9,24,9,59));
 spend('solari',0.1,iso(2026,9,24,14,0));
 spend('higgsfield',2,iso(2026,9,23,10,0));
 const m=store.metrics('today',CLOCK);
 assert.equal(m.series.length,24);
 const nine=m.series[9];
 near(nine.spend,0.76);
 near(nine.spendBy.claude,0.75);
 near(nine.spendBy.exa,0.01);
 assert.equal(nine.spendBy.higgsfield,undefined);
 near(m.series[14].spendBy.solari,0.1);
 for(const b of m.series)near(Object.values(b.spendBy).reduce((s,v)=>s+v,0),b.spend);
 near(m.totals.spend,0.86);
 const w=store.metrics('week',CLOCK);
 near(w.totals.spend,2.86);
 near(w.series[5].spendBy.higgsfield,2);
 for(const b of w.series)near(Object.values(b.spendBy).reduce((s,v)=>s+v,0),b.spend);
});

test('every bucket carries a contiguous from and to range', () => {
 const {store}=seed();
 for(const r of ['today','week','month','year']){
  const m=store.metrics(r,CLOCK);
  assert.equal(m.series[0].from,m.from);
  assert.equal(m.series.at(-1).to,m.to);
  for(let i=1;i<m.series.length;i++)assert.equal(m.series[i].from,m.series[i-1].to);
  for(const b of m.series)assert.ok(b.to>b.from);
 }
});

test('ranges have the expected bucket counts and start points', () => {
 const {store}=seed();
 const len=r=>store.metrics(r,CLOCK).series.length;
 assert.equal(len('today'),24);
 assert.equal(len('week'),7);
 assert.equal(len('month'),30);
 assert.equal(len('year'),12);
 assert.equal(store.metrics('today',CLOCK).from,iso(2026,9,24,0));
 assert.equal(store.metrics('week',CLOCK).from,iso(2026,9,18,0));
 assert.equal(store.metrics('month',CLOCK).from,iso(2026,8,25,0));
 assert.equal(store.metrics('year',CLOCK).from,iso(2025,10,1,0));
 assert.equal(store.metrics('week',CLOCK).range,'week');
});

test('rows before the range are left out of series, totals and events', () => {
 const {store,lead,draft,spend}=seed();
 const old=lead('old.com','Old',iso(2026,9,1,10));
 draft(old,iso(2026,9,1,11));
 spend('claude',5,iso(2026,9,1,11));
 const fresh=lead('new.com','New',iso(2026,9,22,10));
 const m=store.metrics('week',CLOCK);
 assert.equal(m.totals.leads,1);
 assert.equal(m.totals.drafts,0);
 assert.equal(m.totals.spend,0);
 assert.deepEqual(m.events.map(e=>e.leadId),[fresh]);
 const month=store.metrics('month',CLOCK);
 assert.equal(month.totals.leads,2);
 assert.equal(month.events.length,3);
});

test('events come from real lead and draft rows at their real timestamps, oldest first', () => {
 const {store,db,lead,draft}=seed();
 const a=lead('alpha.com','Alpha',iso(2026,9,24,8,15));
 const b=lead('beta.com','Beta',iso(2026,9,24,10,45));
 const d=draft(a,iso(2026,9,24,9,0));
 const m=store.metrics('today',CLOCK);
 assert.deepEqual(m.events.map(e=>[e.kind,e.leadId]),[['lead',a],['draft',a],['lead',b]]);
 assert.deepEqual(m.events.map(e=>e.at),[iso(2026,9,24,8,15),iso(2026,9,24,9,0),iso(2026,9,24,10,45)]);
 const ev=m.events.find(e=>e.kind==='draft');
 assert.equal(ev.draftId,d);
 assert.equal(ev.company,'Alpha');
 assert.equal(ev.domain,'alpha.com');
 const real=db.prepare('select created_at from leads where id=?').get(b).created_at;
 assert.equal(m.events.find(e=>e.kind==='lead'&&e.leadId===b).at,real);
 assert.equal(m.totals.leads,2);
 assert.equal(m.totals.drafts,1);
 assert.equal(m.series[8].leads,1);
 assert.equal(m.series[9].drafts,1);
});

test('an empty database returns empty events and zeroed buckets', () => {
 const {store}=seed();
 const m=store.metrics('week',CLOCK);
 assert.deepEqual(m.events,[]);
 assert.deepEqual(m.totals,{drafts:0,leads:0,missions:0,spend:0});
 for(const b of m.series)assert.deepEqual(b.spendBy,{});
});

test('metrics still runs with the default clock and keeps the old fields', () => {
 const {store,lead}=seed();
 lead('now.com','Now',new Date().toISOString());
 const m=store.metrics();
 assert.equal(m.range,'week');
 assert.equal(m.totals.leads,1);
 for(const k of ['label','drafts','leads','missions','spend'])assert.ok(k in m.series[0]);
 assert.equal(m.events.length,1);
});
