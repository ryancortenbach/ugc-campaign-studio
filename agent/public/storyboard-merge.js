const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
// Keep local edits while accepting new research fields from a later server revision.
export function mergeStoryboardResearch(base,local,remote,key=''){
 if(same(local,base))return structuredClone(remote);
 if(same(remote,base))return structuredClone(local);
 if(Array.isArray(local)&&Array.isArray(base)&&Array.isArray(remote)){
  if(['plans','shots'].includes(key)&&local.length===base.length&&base.length===remote.length)return local.map((v,i)=>mergeStoryboardResearch(base[i],v,remote[i],key));
  return structuredClone(local);
 }
 if(local&&remote&&base&&typeof local==='object'&&typeof remote==='object'&&typeof base==='object'&&!Array.isArray(local)){
  const out={};for(const k of new Set([...Object.keys(local),...Object.keys(remote)])){
   if(!(k in local)&&k in base)continue;
   out[k]=mergeStoryboardResearch(base[k],local[k],remote[k],k);
  }return out;
 }
 return local===undefined?structuredClone(remote):structuredClone(local);
}
