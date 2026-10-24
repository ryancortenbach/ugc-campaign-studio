// Always on: starts the next batch by itself. It only ever calls runner.start. It never approves renders, sends email, or touches Higgsfield.
const SUFFIX=' Find brands that are not already in the CRM.';
const DEFAULTS={enabled:false,goal:'',model:'',dailyBudgetUsd:3,pauseMinutes:15};
const dayKey=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

export function createAutopilot({store,runner,now=()=>new Date(),intervalMs=60000}){
 const db=store.db;
 db.exec('create table if not exists settings(key text primary key, value text)');
 const read=key=>{const r=db.prepare('select value from settings where key=?').get(key);if(!r)return undefined;try{return JSON.parse(r.value);}catch{return undefined;}};
 const write=(key,value)=>db.prepare('insert into settings(key,value) values(?,?) on conflict(key) do update set value=excluded.value').run(key,JSON.stringify(value));
 const config=()=>Object.fromEntries(Object.entries(DEFAULTS).map(([k,v])=>[k,read(k)??v]));
 const missionRows=()=>db.prepare('select prompt,plan from tasks order by id desc').all().filter(t=>{try{return !['brand_storyboard','client_demo'].includes(JSON.parse(t.plan||'null')?.kind)&&!/^whop order:/i.test(t.prompt);}catch{return true;}});
 const newestGoal=()=>(missionRows()[0]?.prompt||'').replace(SUFFIX,'').trim();
 // Spend since local midnight. Higgsfield renders need Ryan's approval, so they never count against autopilot.
 const spentToday=()=>{const day=new Date(now());day.setHours(0,0,0,0);return db.prepare("select coalesce(sum(usd),0) n from spend where at>=? and provider!='higgsfield'").get(day.toISOString()).n;};
 const activeTask=()=>db.prepare("select id from tasks where status in ('queued','running','paused')").all().some(t=>runner.isRunning(t.id));
 const lastFinished=()=>{const t=db.prepare("select max(updated_at) t from tasks where status in ('done','failed','stopped') and coalesce(json_extract(plan,'$.kind'),'') not in ('brand_storyboard','client_demo') and prompt not like 'Whop order:%'").get().t;return t?new Date(t):null;};
 let timer=null,last='idle';

 function tick(){
  const c=config();
  if(!c.enabled)return last='off';
  if(activeTask())return last='running';
  if(spentToday()>=c.dailyBudgetUsd){
   const today=dayKey(new Date(now()));
   if(read('budgetLoggedDay')!==today){write('budgetLoggedDay',today);store.addEvent({type:'status',tool:'autopilot',title:'Autopilot paused: daily budget reached'});}
   return last='budget';
  }
  const done=lastFinished();
  if(done&&new Date(now())-done<c.pauseMinutes*60000)return last='pause';
  const goal=c.goal.trim()||newestGoal();
  if(!goal)return last='no goal';
  const task=runner.start(goal+SUFFIX,{model:c.model||null});
  store.addEvent({taskId:task?.id??null,type:'status',tool:'autopilot',title:'Autopilot started the next batch'});
  return last='started';
 }
 function safeTick(){try{tick();}catch(error){last=`error: ${error.message}`;}}

 return {
  tick,
  start(){if(!timer){timer=setInterval(safeTick,intervalMs);timer.unref?.();}return this;},
  stop(){if(timer){clearInterval(timer);timer=null;}},
  get(){
   const c=config(),spent=spentToday(),done=lastFinished();
   return {...c,goalDefault:newestGoal(),spentToday:spent,budgetReached:spent>=c.dailyBudgetUsd,running:activeTask(),lastFinishedAt:done?done.toISOString():null,state:last};
  },
  set(patch={}){
   for(const key of Object.keys(DEFAULTS)){
    if(!(key in patch))continue;
    let v=patch[key];
    if(key==='enabled')v=Boolean(v);
    else if(key==='goal'||key==='model')v=String(v??'').trim();
    else{v=Number(v);if(!Number.isFinite(v)||v<=0)throw Error(`${key} must be a positive number`);}
    write(key,v);
   }
   if(patch.enabled)safeTick();
   return this.get();
  }
 };
}
