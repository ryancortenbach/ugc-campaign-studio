import {createHmac,timingSafeEqual} from 'node:crypto';
const domain='ugc-readiness-v2';
export function equal(a,b){const left=Buffer.from(a||''),right=Buffer.from(b||'');return left.length===right.length&&timingSafeEqual(left,right);}
export function issueTicket(secret,runId,now=Date.now()){
 const payload=Buffer.from(JSON.stringify({v:2,runId,expires:now+86400000})).toString('base64url');
 const signature=createHmac('sha256',secret).update(domain+'.'+payload).digest('base64url');
 return payload+'.'+signature;
}
export function verifyTicket(secret,ticket,runId,now=Date.now()){
 if(typeof ticket!=='string'||ticket.length>1000)return false;
 const [payload,signature,...extra]=ticket.split('.');if(!payload||!signature||extra.length)return false;
 const expected=createHmac('sha256',secret).update(domain+'.'+payload).digest('base64url');if(!equal(expected,signature))return false;
 try{const value=JSON.parse(Buffer.from(payload,'base64url').toString());return value.v===2&&value.runId===runId&&Number.isFinite(value.expires)&&value.expires>now;}catch{return false;}
}
