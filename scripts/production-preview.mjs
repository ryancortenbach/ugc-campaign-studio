import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {openStore} from '../agent/store.mjs';
import {createApp} from '../agent/server.mjs';

// A local review server with its own database and no background workers.
// Only the Production API, read-only shell APIs and static assets are reachable.
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const store=openStore(path.join(repo,'work/production-rehearsal/preview.db'));
const app=createApp({store});
const readApis=new Set(['/api/state','/api/events','/api/renders','/api/spend','/api/metrics']);
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/api/stream'){res.writeHead(200,{'Content-Type':'text/event-stream'});res.write(': zero-budget preview\n\n');req.on('close',()=>res.end());return;}
 if(url.pathname.startsWith('/api/')&&!url.pathname.startsWith('/api/production')&&!(req.method==='GET'&&readApis.has(url.pathname))){
  res.writeHead(403,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Only zero-budget Production tools are enabled on this review server.'}));return;
 }
 return app(req,res);
});
const port=Number(process.env.PRODUCTION_PREVIEW_PORT||3211);
server.listen(port,'127.0.0.1',()=>console.log(`Zero-budget Mint Labs review: http://127.0.0.1:${port}/#/production`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{server.closeAllConnections();server.close(()=>{store.db.close();process.exit(0);});});
