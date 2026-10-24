export const terminal=status=>['completed','cancelled','failed'].includes(status);
export function storedJob(value){return{runId:typeof value.runId==='string'?value.runId:null,requestId:typeof value.requestId==='string'?value.requestId:null,status:String(value.status||'unknown'),uncertain:Boolean(value.uncertain),updated:Date.now()};}
export function mergeHosted(current,incoming){if(current?.runId===incoming.runId&&terminal(current.status)&&!terminal(incoming.status))return current;return{...current,...incoming};}
export function mergeHistory(records,record){return[storedJob(record),...records.filter(x=>!(record.runId&&x.runId===record.runId)&&!(record.requestId&&x.requestId===record.requestId))].slice(0,40);}
