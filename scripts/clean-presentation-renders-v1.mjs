// Hide the retired attempts from the active gallery. All files and records remain recoverable.
import {mkdirSync,writeFileSync} from 'node:fs';
import {openStore} from '../agent/store.mjs';
mkdirSync('work/campaign-chat-v1',{recursive:true});
const store=openStore();try{
 const retired=store.listRenders().filter(r=>r.id<=27||r.id===31);
 const receipt={at:new Date().toISOString(),reason:'User requested a Disobedient-only gallery without the unrelated people, products and failed attempts.',records:retired.map(r=>({id:r.id,title:r.title,priorPlan:r.plan}))};
 writeFileSync('work/campaign-chat-v1/retired-renders-v2.json',JSON.stringify(receipt,null,2)+'\n');
 for(const r of retired)store.updateRender(r.id,{plan:{...r.plan,hiddenFromGallery:true,hiddenReason:'Retired from the Disobedient presentation'}});
 for(const [id,title] of [[28,'Disobedient hoodie: sample'],[34,'Disobedient hoodie: complete character ad']]){const r=store.getRender(id);store.updateRender(id,{title,plan:{...r.plan,presentationReady:true}});}
 for(const id of [3,4,6,11]){const t=store.getTask(id);store.updateTask(id,{plan:{...t.plan,hiddenFromTasks:true,hiddenReason:'Retired from the current Disobedient presentation'}});}
 console.log(JSON.stringify({hidden:retired.map(r=>r.id),visible:[28,34],deleted:0,reviewChanges:0}));
}finally{store.db.close();}
