import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {chat} from './api/chat.js';
const root=fileURLToPath(new URL('./public/',import.meta.url));
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
http.createServer(async(req,res)=>{
  const send=(code,data)=>{res.writeHead(code,{'Content-Type':'application/json'});res.end(JSON.stringify(data));};
  if(req.url==='/api/chat'){
    if(req.method!=='POST')return send(405,{error:'POST required'});
    let body='';try{for await(const chunk of req){body+=chunk;if(body.length>64000)return send(413,{error:'Request too large'});}
    const r=await chat(JSON.parse(body),req.headers.authorization||'');return send(r.status,r.body);}catch{return send(400,{error:'Invalid request'});}
  }
  try{
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const file=pathname==='/src/brief.js'?fileURLToPath(new URL('./src/brief.js',import.meta.url)):path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
    if(!file.startsWith(root+path.sep) && pathname!=='/src/brief.js')return send(403,{error:'Forbidden'});
    const data=await readFile(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','X-Content-Type-Options':'nosniff'});res.end(data);
  }catch{send(404,{error:'Not found'});}
}).listen(Number(process.env.PORT||3000),'127.0.0.1',()=>console.log('UGC Campaign Studio ready at http://127.0.0.1:'+(process.env.PORT||3000)));
