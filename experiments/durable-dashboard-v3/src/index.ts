import express from 'express';
import {start,getRun} from 'workflow/api';
import {getWorld} from 'workflow/runtime';
import {registryOptions,registryPage} from '../../../src/hosted-registry.js';
import {readinessWorkflowV3} from './readiness.js';
import {equal,issueTicket,verifyTicket} from '../lib/access.js';
import chatHandler from '../../../api/chat.js';
import reviewHandler from '../../../api/review.js';
import prospectHandler from '../../../api/prospects.js';
import {configurationStatus} from '../../../api/status.js';
const app=express();
app.disable('x-powered-by');
app.use(express.json({limit:'64kb'}));
app.get('/health',(_req,res)=>res.json({experiment:'durable-dashboard-v3',dashboard:true,registry:true,courseOfferCheck:false,modelEnabled:false,mediaEnabled:false,vercelRuntime:Boolean(process.env.VERCEL_DEPLOYMENT_ID)}));
app.use('/api',(_req,res,next)=>{res.set('Cache-Control','no-store');if(!process.env.DURABLE_DEMO_ACCESS_TOKEN)return res.status(503).json({error:'Operator access is not configured.'});next();});
const secret=()=>process.env.DURABLE_DEMO_ACCESS_TOKEN!;
function operator(req:any,res:any,next:any){if(!equal(secret(),(req.headers.authorization||'').replace(/^Bearer /,'')))return res.status(401).json({error:'Private operator access required.'});next();}
app.post('/api/course-offer/verify',operator,(_req,res)=>res.status(410).json({status:'retired',error:'The course checkout is retired. Review the current UGC packages.',providerRequested:false,paymentsEnabled:false}));
function ticket(req:any,res:any,next:any){if(!/^wrun_[0-9A-Z]{26}$/.test(req.params.id)||!verifyTicket(secret(),req.headers['x-job-ticket'],req.params.id))return res.status(401).json({error:'A valid ticket for this job is required.'});next();}
async function describe(run:any){const status=await run.status;return {runId:run.runId,status,result:status==='completed'?await run.returnValue:null,checkedAt:new Date().toISOString()};}
app.post('/api/jobs',operator,async(req,res)=>{
 const {prompt,brief,references,settings,lockedDialogue,requestId}=req.body||{};
 if(typeof prompt!=='string'||!prompt.trim()||prompt.length>30000||typeof requestId!=='string'||!/^[0-9a-f-]{36}$/i.test(requestId))return res.status(400).json({error:'Supply a draft prompt and a request UUID.'});
 try{const run=await start(readinessWorkflowV3,[{prompt,brief,references,settings,lockedDialogue}],{attributes:{app:'ugc-readiness-v3',requestId}});res.status(202).json({runId:run.runId,requestId,ticket:issueTicket(secret(),run.runId),status:'accepted'});}
 catch{res.status(502).json({error:'Submission outcome is uncertain. Do not resubmit automatically. Reconcile this request in Vercel.',requestId,uncertain:true});}
});
app.post('/api/recover',operator,async(req,res)=>{
 if(typeof req.body?.runId!=='string'||!/^wrun_[0-9A-Z]{26}$/.test(req.body.runId))return res.status(400).json({error:'Supply the saved run ID.'});
 try{const run=getRun(req.body.runId);if(await run.workflowName!==(readinessWorkflowV3 as any).workflowId)return res.status(404).json({error:'This job does not belong to the v3 dashboard.'});res.json({...await describe(run),ticket:issueTicket(secret(),run.runId)});}
 catch{res.status(404).json({error:'Job unavailable or expired. No new job was created.'});}
});
app.post('/api/jobs/list',operator,async(req,res)=>{
 let options;const name=(readinessWorkflowV3 as any).workflowId;
 try{options=registryOptions(req.body,name);}catch{return res.status(400).json({error:'Supply one valid execution status and a valid page cursor.'});}
 try{res.json(registryPage(await (await getWorld()).runs.list(options),name));}
 catch{res.status(502).json({error:'Cloud run list is unavailable. No empty list or passing result was invented.'});}
});
app.get('/api/jobs/:id',ticket,async(req,res)=>{try{res.json(await describe(getRun(req.params.id)));}catch{res.status(404).json({error:'Job unavailable or expired. No new job was created.'});}});
app.post('/api/jobs/:id/cancel',ticket,async(req,res)=>{
 try{const run=getRun(req.params.id),before=await run.status;if(!['pending','running'].includes(before))return res.status(409).json({...await describe(run),error:'Job was already terminal. It was not cancelled.'});await run.cancel({cancelReason:'Operator requested cancellation from the readiness console.'});res.json(await describe(run));}
 catch{res.status(502).json({error:'Cancellation not confirmed. Refresh status before taking another action.'});}
});
app.all('/api/chat',(req,res)=>req.body?.mode==='ai'?res.status(503).json({error:'Model chat is disabled in this readiness preview. Guided intake is available.'}):chatHandler(req,res));
app.all('/api/review',(req,res)=>req.body?.mode!=='preflight'?res.status(503).json({error:'Specialist model calls are disabled in this hosted readiness preview.'}):reviewHandler(req,res));
app.all('/api/prospects',(req,res)=>req.body?.transport!=='free_mcp'?res.status(503).json({error:'Only free Exa MCP discovery is enabled in this preview.'}):prospectHandler(req,res));
app.get('/api/status',(_req,res)=>res.json({...configurationStatus(),chat:{configured:false,verified:false},review:{configured:false,verified:false},hostedReadiness:{configured:true,mode:'deterministic_only'}}));
app.use((err:any,_req:any,res:any,_next:any)=>res.status(err.status===413?413:400).json({error:err.status===413?'Request body exceeds 64 KB.':'Invalid request body.'}));
export default app;
