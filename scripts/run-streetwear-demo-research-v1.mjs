// Real free Exa research, recorded in each local task. No paid fallback or messages.
import {openStore} from '../agent/store.mjs';
import {createProductionResearch} from '../agent/production-research.mjs';
import {searchResearchFree} from '../agent/tools/research-exa.mjs';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,readFile,writeFile,appendFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

const root=path.resolve(import.meta.dirname,'..');
const work=path.join(root,'work/streetwear-demo-v1');
const output=path.join(root,'research_notes/streetwear-demo-v1');
await mkdir(work,{recursive:true});await mkdir(output,{recursive:true});
const rawFile=path.join(work,'exa-rpc.jsonl'),run=promisify(execFile);
const temp=await mkdtemp(path.join(tmpdir(),'mint-streetwear-exa-'));
const store=openStore();
const brands=[{id:'disobedient',name:'Disobedient',website:'https://disobedientnyc.com/'},{id:'vylin',name:'VYLIN',website:'https://www.wearvylin.com/'}];
const results=[];
let activeBrand=null,activeSection=null,sequence=0,quotaBlocked=false;
async function transport(url,init){
 if(new URL(url).hostname!=='mcp.exa.ai')throw Error('Only the free Exa MCP host is permitted.');
 const rpc=JSON.parse(init.body),startedAt=new Date().toISOString(),started=performance.now();
 const id=randomUUID(),headerFile=path.join(temp,`${++sequence}.headers`);
 const dns=await run('/usr/bin/dig',['+short','+time=2','+tries=1','@10.104.0.1','mcp.exa.ai','A']);
 const ip=dns.stdout.split(/\s+/).find(v=>/^\d+\.\d+\.\d+\.\d+$/.test(v));
 const args=['--silent','--show-error','--max-time','35','--dump-header',headerFile,'-X','POST'];
 if(ip)args.push('--resolve',`mcp.exa.ai:443:${ip}`);
 for(const [k,v] of Object.entries(init.headers||{}))args.push('-H',`${k}: ${v}`);
 args.push('--data-binary',init.body,url);
 const call={id,brandId:activeBrand,section:activeSection,startedAt,url,request:rpc};
 await appendFile(rawFile,JSON.stringify({...call,type:'call'})+'\n');
 try{
  const out=await run('/usr/bin/curl',args,{maxBuffer:3000000});
  const block=(await readFile(headerFile,'utf8')).trim().split(/\r?\n\r?\n/).at(-1),lines=block.split(/\r?\n/),status=Number(lines.shift().split(' ')[1]);
  const headers=new Headers();for(const line of lines){const n=line.indexOf(':');if(n>0)headers.append(line.slice(0,n),line.slice(n+1).trim());}
  await appendFile(rawFile,JSON.stringify({...call,type:'result',completedAt:new Date().toISOString(),durationMs:Math.round(performance.now()-started),httpStatus:status,responseBody:out.stdout})+'\n');
  return new Response(out.stdout,{status,headers});
 }catch(error){await appendFile(rawFile,JSON.stringify({...call,type:'error',error:error.message,completedAt:new Date().toISOString(),durationMs:Math.round(performance.now()-started)})+'\n');throw error;}
}
try{
 for(const brand of brands){
  activeBrand=brand.id;
  let task=store.listTasks().find(t=>t.plan?.kind==='client_demo'&&t.plan.clientDemo?.brandId===brand.id);
  if(!task){task=store.createTask(`Streetwear demo: ${brand.name}`);store.updateTask(task.id,{status:'researching',summary:'Real free Exa research in progress. Demo recipient and paid production remain pending.',plan:{kind:'client_demo',brand:brand.name,domain:new URL(brand.website).hostname.replace(/^www\./,''),clientDemo:{brandId:brand.id,version:2,stage:'researching',productionAuthorized:false,sendingAuthorized:false}}});}
  const taggedStore={...store,addEvent:event=>store.addEvent({...event,taskId:task.id})};
  const search=async query=>{
   const startedAt=new Date().toISOString(),at=performance.now();
   const result=await searchResearchFree(query,{request:transport});
   const item={brandId:brand.id,taskId:task.id,section:activeSection,query,startedAt,completedAt:new Date().toISOString(),durationMs:Math.round(performance.now()-at),...result};
   await writeFile(path.join(work,`${brand.id}-${activeSection}.json`),JSON.stringify(item,null,2)+'\n');
   console.log(`COMPLETED ${brand.name}: ${activeSection}, ${result.results.length} Exa sources, $0`);
   return result;
  };
  const production=createProductionResearch({store:taggedStore,search});
  let dossier=await production.call('research_plan',{brand:brand.name,category:'streetwear',website:brand.website});
  for(const section of ['brand','audience','creators','formats']){
   if(quotaBlocked)break;
   activeSection=section;
   try{dossier=await production.call('research_search_free',{id:dossier.id,section});}
   catch(error){console.log(`FAILED ${brand.name}: ${section}: ${error.message}`);if(error.status===429||/quota|429/.test(error.message))quotaBlocked=true;}
  }
  dossier=await production.call('research_synthesize',{id:dossier.id});
  await writeFile(path.join(work,`${brand.id}-dossier.json`),JSON.stringify(dossier,null,2)+'\n');
  results.push({brand,taskId:task.id,dossierId:dossier.id,searches:dossier.searches||[],evidenceCount:dossier.evidence.length});
 }
 await writeFile(path.join(output,'run-receipt-v1.json'),JSON.stringify({startedFor:'Two-brand streetwear product demo',completedAt:new Date().toISOString(),brands:results,provider:'Exa free keyless MCP',paidFallback:false,quotaBlocked,providerCostUsd:0,rawLedger:'work/streetwear-demo-v1/exa-rpc.jsonl',note:'Actual research calls. No payment, DM receipt, model-generated ICP, video or send is invented.'},null,2)+'\n');
}finally{store.db.close();await rm(temp,{recursive:true,force:true});}
