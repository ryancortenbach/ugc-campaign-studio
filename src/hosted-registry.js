const statuses=new Set(['pending','running','completed','failed','cancelled']);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function registryOptions(input,workflowName){
 const {cursor,status}=input||{};
 if(cursor!==undefined&&cursor!==null&&(typeof cursor!=='string'||cursor.length>8192))throw Error('Invalid page cursor.');
 if(status!==undefined&&status!==''&&!statuses.has(status))throw Error('Choose one valid execution status.');
 return{workflowName,resolveData:'none',pagination:{limit:20,sortOrder:'desc',...(cursor?{cursor}:{})},...(status?{status}:{})};
}
function date(value){if(!value)return null;const parsed=new Date(value);return Number.isFinite(parsed.getTime())?parsed.toISOString():null;}
export function registryPage(page,workflowName){
 if(!page||!Array.isArray(page.data)||typeof page.hasMore!=='boolean'||!(page.cursor===null||typeof page.cursor==='string')||(page.hasMore&&!page.cursor))throw Error('Incomplete cloud page.');
 const jobs=page.data.map(run=>{
  if(run.workflowName!==workflowName||!/^wrun_[0-9A-Z]{26}$/.test(run.runId)||!statuses.has(run.status))throw Error('Unexpected cloud run metadata.');
  return{runId:run.runId,status:run.status,requestId:typeof run.attributes?.requestId==='string'&&uuid.test(run.attributes.requestId)?run.attributes.requestId:null,createdAt:date(run.createdAt),updatedAt:date(run.updatedAt),payloadExpired:Boolean(run.expiredAt)};
 });
 return{jobs,cursor:page.cursor,hasMore:page.hasMore,checkedAt:new Date().toISOString(),scope:'Hosted readiness execution metadata only. Completion is not specialist approval.'};
}
