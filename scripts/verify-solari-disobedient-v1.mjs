import '../agent/network-dns.mjs';
import {Solari} from '../agent/node_modules/@solarisdk/browser/dist/index.js';
import {writeFileSync} from 'node:fs';
import {openStore} from '../agent/store.mjs';
const client=new Solari({apiKey:process.env.SOLARI_API_KEY,baseUrl:'https://api.getsolari.com',maxAttempts:1,timeoutMs:15000});let browser;
const start=Date.now();console.log('ITEM Verify Solari API');
try{
 browser=await client.launch({stealth:false});console.log('ITEM Cloud browser connected');
 const page=await browser.newPage();await page.goto('https://disobedientnyc.com',{waitUntil:'domcontentloaded',timeout:30000});
 const result=await page.evaluate(()=>({title:document.title,text:document.body.innerText.slice(0,4000),url:location.href}));
 console.log('ITEM Brand website read');
 const receipt={provider:'Solari',tool:'solari.browser',checkedAt:new Date().toISOString(),realToolCall:true,url:result.url,title:result.title,observedText:result.text,durationMs:Date.now()-start,costBasis:'Time estimate at the existing Mint rate of $0.10 per browser-hour. Provider did not return an itemized charge.'};
 writeFileSync('agent/public/provider-status/solari-research-v1.json',JSON.stringify(receipt,null,2)+'\n');
 const store=openStore();store.addEvent({taskId:10,type:'tool_result',tool:'solari.browser',title:'Read Disobedient product and brand content for the ICP',data:{status:'success',output:receipt}});store.db.close();
}finally{await browser?.close().catch(()=>{});await client.close().catch(()=>{});}
console.log('ITEM Cloud browser closed');console.log('DONE');
