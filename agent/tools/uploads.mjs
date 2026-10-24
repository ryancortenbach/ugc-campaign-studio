import {mkdirSync,writeFileSync,readFileSync,existsSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {dataDir} from '../store.mjs';

// Files the operator attaches in the chat box. Claude sees images, PDFs and text files when it plans the work.
export const uploadDir=()=>process.env.AGENT_UPLOAD_DIR||path.join(dataDir,'uploads');
export const MAX_BYTES=5*1024*1024;
const kinds={'image/png':['image','.png'],'image/jpeg':['image','.jpg'],'image/gif':['image','.gif'],'image/webp':['image','.webp'],'application/pdf':['pdf','.pdf'],'text/plain':['text','.txt'],'text/markdown':['text','.md'],'text/csv':['text','.csv'],'application/json':['text','.json']};
const textExt={'.txt':'text/plain','.md':'text/markdown','.csv':'text/csv','.json':'application/json'};

export function saveUpload({name,type,data}){
 const clean=String(name||'file').replace(/[^\w.\- ]+/g,'_').slice(0,120)||'file';
 const mime=kinds[type]?type:textExt[path.extname(clean).toLowerCase()];
 if(!mime)throw Object.assign(Error('Attach an image (PNG, JPG, GIF, WebP), a PDF, or a text, Markdown, CSV or JSON file.'),{status:415});
 const bytes=Buffer.from(String(data||''),'base64');
 if(!bytes.length)throw Object.assign(Error('That file is empty.'),{status:400});
 if(bytes.length>MAX_BYTES)throw Object.assign(Error('Files can be up to 5 MB.'),{status:413});
 const [kind,ext]=kinds[mime];const id=randomUUID();
 mkdirSync(uploadDir(),{recursive:true});
 writeFileSync(path.join(uploadDir(),id+ext),bytes);
 const meta={id,name:clean,mime,kind,size:bytes.length,file:id+ext};
 writeFileSync(path.join(uploadDir(),id+'.json'),JSON.stringify(meta));
 return meta;
}

export function getUpload(id){
 if(!/^[0-9a-f-]{36}$/.test(String(id)))return null;
 const f=path.join(uploadDir(),id+'.json');
 return existsSync(f)?JSON.parse(readFileSync(f,'utf8')):null;
}

// Content blocks for the Messages API, placed before the request text.
export function attachmentBlocks(metas=[]){
 return metas.map(m=>{
  const bytes=readFileSync(path.join(uploadDir(),m.file));
  if(m.kind==='image')return {type:'image',source:{type:'base64',media_type:m.mime,data:bytes.toString('base64')}};
  if(m.kind==='pdf')return {type:'document',source:{type:'base64',media_type:'application/pdf',data:bytes.toString('base64')},title:m.name};
  return {type:'text',text:`Attached file ${m.name}:\n${bytes.toString('utf8').slice(0,20000)}`};
 });
}
