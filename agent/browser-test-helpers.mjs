import {EventEmitter} from 'node:events';
// Fakes for the browser live view and Instagram tests. No network, no Solari.
export function jpeg(width,height,tag=0){
 const sof=Buffer.alloc(19);sof.writeUInt16BE(17,0);sof[2]=8;sof.writeUInt16BE(height,3);sof.writeUInt16BE(width,5);sof[7]=3;
 return Buffer.concat([Buffer.from([0xff,0xd8,0xff,0xc0]),sof,Buffer.from([0xff,0xd9,tag])]);
}
export class FakeCdp extends EventEmitter{
 calls=[];
 async send(method,params){this.calls.push({method,params});if(this.failInput&&method.startsWith('Input.'))throw new Error(`boom ${JSON.stringify(params)}`);return {};}
 frame(buf,deviceWidth=1280){this.emit('Page.screencastFrame',{data:buf.toString('base64'),sessionId:this.calls.length+1,metadata:{deviceWidth,deviceHeight:720}});}
 async detach(){this.detached=true;}
 off(ev,fn){return super.off(ev,fn);}
}
export function fakePage(cdp,{url='https://example.com/',title='Example'}={}){
 const page=new EventEmitter();
 page.u=url;page.t=title;
 page.url=()=>page.u;page.title=async()=>page.t;page.mainFrame=()=>'main';
 page.context=()=>({newCDPSession:async()=>cdp});
 return page;
}
