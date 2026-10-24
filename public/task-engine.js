export function createTask(name,payload,now=Date.now(),id=crypto.randomUUID()){
 return {id,name,created:now,updated:now,status:'queued',stage:'Readiness',payload,findings:[],events:[{at:now,type:'queued',text:'Prompt queued for readiness checks.'}]};
}
export function transition(task,event,data={},now=Date.now()){
 if(['result','error'].includes(event)&&data.runNumber!==undefined&&data.runNumber!==task.runNumber)return task;
 let status=task.status,text='';
 if(event==='start'&&['queued','paused','stopped','needs_attention','ready'].includes(status)){status='running';text='Readiness request started.';}
 else if(event==='pause'&&['queued','running'].includes(status)){status='paused';text='Paused. No generation was submitted.';}
 else if(event==='stop'&&status!=='stopped'){status='stopped';text='Stopped by user.';}
 else if(event==='queue'&&status!=='running'){status='queued';text='Queued for another readiness check.';}
 else if(event==='result'&&status==='running'){status=data.findings?.some(f=>f.blocking)?'needs_attention':'ready';text=status==='ready'?'Readiness checks passed. Specialist and spend review still required.':'Action required before specialist review.';}
 else if(event==='error'&&status==='running'){status='needs_attention';text=data.error||'Readiness request failed.';}
 else if(event==='interrupted'&&status==='running'){status='needs_attention';text='The previous request did not report a result. Review and retry.';}
 else return task;
 return {...task,status,updated:now,...(event==='start'?{runNumber:(task.runNumber||0)+1}:{}),...(event==='result'?{findings:data.findings||[]} :{}),events:[...(task.events||[]),{at:now,type:event,text}].slice(-100)};
}
export const statusLabels={queued:'Queued',running:'Checking inputs',paused:'Paused',stopped:'Stopped',needs_attention:'Needs attention',ready:'Ready for specialist review'};

export function migrateLegacyTask(old){const t=createTask(old.name||'Recovered task',{brief:old.brief||{},prompt:old.brief?.creative||'',references:[],settings:{durationSeconds:5,estimatedCredits:0}},old.created||Date.now(),old.id||crypto.randomUUID());return {...t,status:'needs_attention',findings:old.findings||[],events:[...t.events,{at:Date.now(),type:'migrated',text:'Recovered from the previous task UI. Original record preserved.'}]};}
