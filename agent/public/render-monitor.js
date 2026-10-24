// Read-only monitoring. Provider submission and retries are outside this module.
export const renderActive = r => ['queued','in_progress','submitting','checking'].includes(r.status) || Boolean(r.revising);
export const reviewReady = r => r.status === 'completed' && Boolean(r.local_file || r.result_url) && r.review === 'pending';
export const renderGroup = r => r.stale || r.status === 'submission_unknown' ? 'fix' : renderActive(r) ? 'work' : reviewReady(r) || r.status === 'checks_passed' ? 'you' : ['checks_failed','failed','nsfw','draft'].includes(r.status) || r.review === 'rejected' ? 'fix' : 'done';
export const renderLength = r => r.plan?.finalSeconds || r.input?.duration || r.plan?.sourceSeconds || null;
export const renderModel = r => String(r.endpoint).includes('genjutsu') ? 'Genjutsu Light' : String(r.endpoint).includes('seedance') ? 'Seedance 2.5' : r.endpoint || 'Higgsfield';

export function watchRecords({read,onChange,onStatus=()=>{},canUpdate=()=>true,isCurrent=()=>true,initial,interval=5000,schedule=setTimeout,cancel=clearTimeout}) {
 let stopped=false,timer,controller,last=initial===undefined?null:JSON.stringify(initial);
 const stop=()=>{stopped=true;cancel(timer);controller?.abort();};
 const tick=async()=>{
  if(stopped||!isCurrent()){stop();return;}
  controller=new AbortController();
  const timeout=schedule(()=>controller.abort(),15000);
  try{
   const data=await read(controller.signal);
   if(stopped||!isCurrent())return;
   const next=JSON.stringify(data);
   onStatus({ok:true,at:Date.now(),data});
   if(next!==last&&canUpdate()){
    await onChange(data);
    last=next;
   }
  }catch(error){if(!stopped&&isCurrent())onStatus({ok:false,error});}
  finally{cancel(timeout);if(!stopped&&isCurrent())timer=schedule(tick,interval);else stop();}
 };
 timer=schedule(tick,interval);
 return {stop,tick};
}
