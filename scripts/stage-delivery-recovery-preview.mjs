import {mkdir,copyFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.join(root,'work/recovery-ui-preview-v1');
await mkdir(out,{recursive:true});
for(const name of ['index.html','fixture.js','vercel.json'])await copyFile(path.join(root,'experiments/delivery-recovery-preview-v1',name),path.join(out,name));
for(const name of ['delivery.js','icons.js','style.css','task-storyboards.css'])await copyFile(path.join(root,'agent/public',name),path.join(out,name));
console.log('Staged fictional delivery recovery review assets only. No account configuration or deployment.');
