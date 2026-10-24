import Anthropic from '@anthropic-ai/sdk';
import {randomUUID} from 'node:crypto';
import {safeLogValue} from './public/tool-logs.js';
import {z} from 'zod';
import {currentMainModel,costOf,llmEnabled,mainModels} from './tools/llm.mjs';
import {createProductionResearch,productionToolDefinitions} from './production-research.mjs';

const TURNS=40,MAX_STEPS=8,MAX_RESULT=12000;
const fail=(message,status=400)=>Object.assign(Error(message),{status});
const clip=(text,n)=>text==null?text:String(text).length>n?`${String(text).slice(0,n)}...`:text;
const slimEvent=e=>({id:e.id,mission:e.task_id,lead:e.lead_id,at:e.at,type:e.type,tool:e.tool,title:clip(e.title,200)});
const slimLead=l=>({id:l.id,mission:l.task_id,company:l.company,domain:l.domain,market:l.market,territory:l.territory,status:l.status,fit:l.fit_score});

const SYSTEM=`You are Mint, the assistant inside Ryan's Mint Labs app. The app runs his outreach and UGC studio: missions find brands, grade them and save Gmail drafts, and the studio plans storyboards, voices and Higgsfield video renders.
Ryan talks to you to see what the agent is doing and to steer it. Use the read tools before you answer questions about the app; never guess at state, and say so when you do not know.
You can start a mission (it costs a few cents of search and model spend), steer a running mission, and pause, resume or stop one. Say what you are about to do and why before you act, then report what happened.
You cannot approve render spend, submit renders, send email, mark email as sent, or delete anything, and you have no tools for them. If Ryan asks for one of those, tell him where to click: approve a render on the Reviews page after its checks pass, send a draft from Gmail or press Mark sent on the lead, delete from the page that holds the item.
For brand audience research, ICPs, creator research, original characters, scenes, or recreating the London penthouse ad, use the production workflow tools. These tools have a fixed zero-dollar provider budget. Read workflow_knowledge first for production questions. Use research_plan then research_search_free and cited observations. Search excerpts alone do not prove demographics, account ownership or video views. Keep unsupported reference/Extend Video steps and unverified visual parity explicit. provider_prepare only prepares requests and never executes them. The regular chat model itself costs money, so direct the operator to the Production page for a fully model-free rehearsal.
Style: brief and plain-spoken. No em dashes, no emojis, exclamation marks only rarely, and never the word "really". Short paragraphs, dollars with two or three decimals.`;

const idArg=z.number().int().positive();
const defs=[
 {name:'get_overview',description:'Snapshot of the app: missions with status and counts, the latest 15 events, spend today and total, and everything waiting on Ryan (renders at checks_passed, scenes with review pending, drafts waiting_video).',input:z.object({}),
  run:({store})=>{
   const renders=store.listRenders(),pend=r=>({id:r.id,title:r.title,status:r.status,estimate_usd:r.estimate_usd,group:r.group_name});
   return {missions:store.listTasks().slice(0,25).map(t=>({id:t.id,prompt:clip(t.prompt,120),status:t.status,leads:t.leads,drafts:t.drafts,working:t.working,failed:t.failed,cost_usd:t.cost_usd,summary:clip(t.summary,160)})),
    latest_events:store.listEvents({limit:15}).map(slimEvent),spend:store.spendSummary(),
    pending_approvals:{renders_awaiting_approval:renders.filter(r=>r.status==='checks_passed').map(pend),scenes_awaiting_review:renders.filter(r=>r.review==='pending').map(pend),drafts_waiting_video:store.listDrafts().filter(d=>d.status==='waiting_video').map(d=>({id:d.id,lead:d.lead_id,subject:d.subject}))}};
  },summary:r=>`${r.missions.length} missions, ${r.pending_approvals.renders_awaiting_approval.length} renders awaiting approval`},
 {name:'get_mission',description:'One mission: its task, plan, leads with statuses and the last 30 events.',input:z.object({id:idArg}),
  run:({store,runner},{id})=>{const t=store.getTask(id);if(!t)throw fail(`No mission ${id}`,404);return {mission:{id:t.id,prompt:t.prompt,status:t.status,summary:t.summary,cost_usd:t.cost_usd,plan:t.plan,running:runner.isRunning(id)},leads:store.listLeads({taskId:id}).map(slimLead),events:store.listEvents({taskId:id}).slice(-30).map(slimEvent)};},
  summary:r=>`mission ${r.mission.id} ${r.mission.status}, ${r.leads.length} leads`},
 {name:'find_leads',description:'Search leads by text (company, domain, market, territory) and/or exact status (found, visiting, grading, drafting, drafted, contacted, skipped, unreachable, error). Returns up to 25.',input:z.object({query:z.string().max(200).optional(),status:z.string().max(40).optional()}),
  run:({store},{query,status})=>{const q=query?.trim().toLowerCase();const hits=store.listLeads().filter(l=>(!status||l.status===status)&&(!q||[l.company,l.domain,l.market,l.territory].some(v=>String(v||'').toLowerCase().includes(q))));return {total:hits.length,leads:hits.slice(0,25).map(slimLead)};},
  summary:r=>`${r.total} leads`},
 {name:'get_lead',description:'One lead with its evidence, contact, drafts and events.',input:z.object({id:idArg}),
  run:({store},{id})=>{const l=store.getLead(id);if(!l)throw fail(`No lead ${id}`,404);const {screenshot,...rest}=l;return {lead:{...rest,evidence:clip(l.evidence,600),contact_excerpt:clip(l.contact_excerpt,300)},drafts:store.listDrafts({leadId:id}).map(d=>({id:d.id,to:d.to_email,subject:d.subject,body:clip(d.body,1500),status:d.status,gmail_url:d.gmail_url})),events:store.listEvents({leadId:id}).slice(-20).map(slimEvent)};},
  summary:r=>`lead ${r.lead.id} ${r.lead.status}, ${r.drafts.length} drafts`},
 {name:'start_mission',description:'Start a new outreach mission from a plain-English request. Costs a few cents of search and model spend. Creates Gmail drafts only; nothing is sent.',input:z.object({prompt:z.string().min(3).max(2000)}),
  run:({runner},{prompt})=>{const t=runner.start(prompt.trim());return {id:t.id,status:t.status};},summary:r=>`started mission ${r.id}`},
 {name:'steer_mission',description:'Send a steering message to a mission. A running mission applies it at its next checkpoint.',input:z.object({id:idArg,message:z.string().min(1).max(1000)}),
  run:({store,runner},{id,message})=>{if(!store.getTask(id))throw fail(`No mission ${id}`,404);const s=runner.steer(id,message.trim());return {queued:true,live:Boolean(s.live)};},summary:r=>r.live?'queued for a running mission':'noted, mission is not running'},
 {name:'control_mission',description:'Pause, resume or stop a running mission.',input:z.object({id:idArg,action:z.enum(['pause','resume','stop'])}),
  run:({store,runner},{id,action})=>{if(!store.getTask(id))throw fail(`No mission ${id}`,404);const ok=runner.control(id,action);return ok?{done:true,action}:{done:false,reason:'The mission is not running.'};},summary:r=>r.done?r.action:r.reason}
];
for(const tool of productionToolDefinitions)defs.push({name:tool.name,description:tool.description,input:z.unknown(),schema:tool.input_schema,run:({production},args)=>production.call(tool.name,args),summary:r=>`${tool.name}: ${r.mode||r.status||'read'}, $0 provider spend`});
const jsonSchema=s=>{const {$schema,...rest}=z.toJSONSchema(s);return rest;};
export const assistantTools=defs.map(d=>({name:d.name,description:d.description,input_schema:d.schema||jsonSchema(d.input)}));

export function createAssistant({store,runner,client,production=createProductionResearch({store})}){
 store.db.exec('create table if not exists assistant_messages(id integer primary key,at text not null,role text not null,content text not null)');
 let busy=false;
 const row=r=>{let c;try{c=JSON.parse(r.content);}catch{c={text:String(r.content)};}return {id:r.id,at:r.at,role:r.role,text:c.text||'',actions:c.actions||[]};};
 const history=()=>store.db.prepare('select * from assistant_messages order by id').all().map(row);
 const save=(role,content)=>store.db.prepare('insert into assistant_messages(at,role,content) values(?,?,?)').run(new Date().toISOString(),role,JSON.stringify(content));
 const byName=new Map(defs.map(d=>[d.name,d]));

 async function reply({message,model}={}){
  const text=String(message??'').trim();
  if(text.length<1||text.length>4000)throw fail('Write a message between 1 and 4000 characters.');
  if(model!=null&&model!==''&&!mainModels.includes(model))throw fail('Pick Sonnet 5.5 or Haiku 5.5.');
  if(!client&&!llmEnabled())throw Object.assign(Error('ANTHROPIC_API_KEY is not set'),{status:503,code:'no_key'});
  if(busy)throw fail('Mint is still answering the last message.',409);
  busy=true;
  try{
   client??=new Anthropic();
   const use=model||currentMainModel();
   const fallback=use.startsWith('claude-sonnet-5-5')?{betas:['server-side-fallback-2026-07-01'],fallbacks:'default'}:{};
   const past=history().slice(-TURNS).map(h=>({role:h.role,content:h.text}));
   while(past.length&&past[0].role!=='user')past.shift();
   const messages=[...past,{role:'user',content:text}],actions=[];let cost=0,answer='';
   for(let step=0;step<MAX_STEPS;step++){
    const res=await client.beta.messages.create({model:use,max_tokens:2000,system:`${SYSTEM}\nToday is ${new Date().toISOString().slice(0,10)}.`,tools:assistantTools,messages,...fallback});
    const usd=costOf(use,res.usage);cost+=usd;store.addSpend({provider:'claude',usd,note:'assistant'});
    const parts=res.content||[];
    const said=parts.filter(b=>b.type==='text').map(b=>b.text).join('\n').trim();
    if(res.stop_reason==='refusal'){answer='I cannot help with that request.';break;}
    const calls=parts.filter(b=>b.type==='tool_use');
    if(res.stop_reason!=='tool_use'||!calls.length){answer=said||(res.stop_reason==='max_tokens'?'That answer ran too long. Ask again with a narrower question.':'Done.');break;}
    messages.push({role:'assistant',content:parts});
    const results=[];
    for(const c of calls){
     const def=byName.get(c.name);let out,is_error=false,summary;
     const callId=randomUUID(),started=performance.now(),tool=`assistant.${c.name}`;
     const candidateId=Number.isInteger(c.input?.id)&&c.input.id>0?c.input.id:null;
     const context=candidateId&&c.name==='get_lead'&&store.getLead(candidateId)?{leadId:candidateId}:candidateId&&['get_mission','steer_mission','control_mission'].includes(c.name)&&store.getTask(candidateId)?{taskId:candidateId}:{};
     store.addEvent({...context,type:'tool_call',tool,title:`Calling ${c.name}`,data:{callId,status:'running',input:safeLogValue(c.input??{})}});
     try{
      if(!def)throw fail(`Unknown tool ${c.name}`);
      const input=def.input.parse(c.input??{});
      out=await def.run({store,runner,production},input);summary=def.summary(out);
     }catch(e){is_error=true;out={error:e instanceof z.ZodError?e.issues.map(i=>`${i.path.join('.')||'input'}: ${i.message}`).join('; '):e.message};summary=`error: ${out.error}`;}
     store.addEvent({...context,type:'tool_result',tool,title:safeLogValue(summary),data:{callId,status:is_error?'error':'success',durationMs:Math.round(performance.now()-started),...(is_error?{error:safeLogValue(out.error)}:{output:clip(JSON.stringify(safeLogValue(out)),MAX_RESULT)})}});
     actions.push({tool:c.name,callId,status:is_error?'error':'success',input:safeLogValue(c.input??{}),output:safeLogValue(out),durationMs:Math.round(performance.now()-started),result_summary:safeLogValue(summary)});
     results.push({type:'tool_result',tool_use_id:c.id,content:clip(JSON.stringify(out),MAX_RESULT),...(is_error?{is_error:true}:{})});
    }
    messages.push({role:'user',content:results});
    if(step===MAX_STEPS-1)answer='I hit my step limit before finishing. Ask me to continue.';
   }
   save('user',{text});save('assistant',{text:answer,actions});
   store.bus.emit('change',{kind:'assistant'});
   return {reply:answer,actions,cost};
  }finally{busy=false;}
 }
 return {history,reply};
}
