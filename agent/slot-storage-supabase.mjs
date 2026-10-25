import {createHash} from 'node:crypto';
const fail=(status,message)=>Object.assign(Error(message),{status});
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const KEY=/^orders\/[a-f0-9]{64}\/slot-[1-9][0-9]*\/v[1-9][0-9]*-([a-f0-9]{64})\.mp4$/;

// No environment loading or global fetch fallback. Callers must explicitly opt in.
export function createSupabaseSlotTransport({enabled=false,url,secret,bucket,fetch:request,maxBytes=6*1024*1024,timeoutMs=30000}={}){
 if(typeof enabled!=='boolean')throw fail(400,'Adapter activation must be an explicit boolean.');
 let origin;
 if(enabled){
  try{const u=new URL(url);if(u.protocol!=='https:'||! /^[a-z0-9-]+\.supabase\.co$/.test(u.hostname)||u.port||u.username||u.password||u.pathname!=='/'||u.search||u.hash)throw Error();origin=u.origin;}catch{throw fail(400,'An explicit hosted Supabase project origin is required.');}
  if(typeof secret!=='string'||!/^sb_secret_[A-Za-z0-9_-]+$/.test(secret)||typeof bucket!=='string'||! /^[a-z0-9][a-z0-9_-]{0,62}$/.test(bucket)||typeof request!=='function'||!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>6*1024*1024||!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>300000)throw fail(400,'Explicit secret, bucket, transport and bounded limits are required.');
 }
 const ready=()=>{if(!enabled)throw fail(503,'Slot storage adapter is disabled.');};
 const keyHash=key=>{const match=typeof key==='string'&&KEY.exec(key);if(!match)throw fail(400,'Invalid immutable slot object key.');return match[1];};
 async function call(method,route,body){
  ready();
  try{
   const res=await request(`${origin}/storage/v1${route}`,{method,redirect:'error',cache:'no-store',signal:AbortSignal.timeout(timeoutMs),headers:{apikey:secret,'cache-control':'no-store',...(body?{'content-type':'video/mp4','x-upsert':'false'}:{})},...(body?{body}:{})});
   if(res.redirected||res.status<200||res.status>=300){try{await res.body?.cancel();}catch{}throw fail(409,'Storage request could not be confirmed.');}
   return res;
  }catch{throw fail(409,'Storage request could not be confirmed.');}
 }
 async function bounded(res,limit){
  const reader=res.body?.getReader();if(!reader)throw fail(409,'Storage response is incomplete.');
  const chunks=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit)throw Error();chunks.push(Buffer.from(value));}return Buffer.concat(chunks,size);}
  catch{try{await reader.cancel();}catch{}throw fail(409,'Storage response is incomplete or exceeds the size limit.');}
  finally{reader.releaseLock();}
 }
 async function privateBucket(){
  const res=await call('GET',`/bucket/${bucket}`);
  let data;try{data=JSON.parse((await bounded(res,16384)).toString('utf8'));}catch{throw fail(409,'Private bucket configuration could not be confirmed.');}
  if(data.id!==bucket||data.public!==false)throw fail(409,'Expected private bucket configuration was not confirmed.');
 }
 async function find({key}={}){
  ready();const expected=keyHash(key);
  await privateBucket();
  // An ambiguous/missing object is an error, never proof that another put is safe.
  const res=await call('GET',`/object/authenticated/${bucket}/${key}`);
  const bytes=await bounded(res,maxBytes);
  if(!bytes.length||digest(bytes)!==expected)throw fail(409,'Stored object bytes do not match the immutable key.');
  await privateBucket();
  return {key,sha256:expected,bytes:bytes.length,private:true};
 }
 async function put({key,bytes,sha256,private:privateObject,createOnly}={}){
  ready();const expected=keyHash(key);
  if(!Buffer.isBuffer(bytes)||!bytes.length||bytes.length>maxBytes||privateObject!==true||createOnly!==true||sha256!==expected||digest(bytes)!==expected)throw fail(400,'Exact bounded private create-only bytes are required.');
  const copy=Buffer.from(bytes);
  await privateBucket();
  const res=await call('POST',`/object/${bucket}/${key}`,copy);
  // Neither the upload's JSON nor caller metadata establishes the stored digest.
  try{await res.body?.cancel();}catch{throw fail(409,'Upload response could not be finalized.');}
  const receipt=await find({key});
  if(receipt.bytes!==copy.length)throw fail(409,'Stored object size changed.');
  return receipt;
 }
 return {enabled:Boolean(enabled),put,find};
}
