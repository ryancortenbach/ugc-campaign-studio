// Use the configured resolver when macOS account lookup cannot resolve provider hosts.
import dns from 'node:dns';
import {Resolver} from 'node:dns/promises';
import {readFileSync} from 'node:fs';
import {syncBuiltinESMExports} from 'node:module';
const configured=()=>{try{return [...readFileSync('/etc/resolv.conf','utf8').matchAll(/^nameserver\s+(\S+)/gm)].map(m=>m[1]).filter(s=>s!=='127.0.0.1'&&s!=='::1');}catch{return [];}};
export function installProviderDns({lookup=dns.lookup,resolver=new Resolver({timeout:3000,tries:1}),servers=configured(),apply=true}={}){
 if(servers.length)resolver.setServers(servers);
 const patched=function(host,options,callback){
  if(typeof options==='function'){callback=options;options={};}
  const opts=typeof options==='number'?{family:options}:options||{};
  lookup(host,opts,async(error,...result)=>{
   if(!error||!['ENOTFOUND','EAI_AGAIN'].includes(error.code))return callback(error,...result);
   try{const family=opts.family===6?6:4;const addresses=await (family===6?resolver.resolve6(host):resolver.resolve4(host));if(!addresses.length)return callback(error);callback(null,...(opts.all?[addresses.map(address=>({address,family}))]:[addresses[0],family]));}catch{callback(error);}
  });
 };
 if(apply){dns.lookup=patched;syncBuiltinESMExports();}
 return patched;
}
installProviderDns();
