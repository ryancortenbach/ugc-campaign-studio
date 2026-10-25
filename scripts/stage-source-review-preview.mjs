import {mkdir,copyFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),out=path.join(root,'work/source-review-preview-v1');
await mkdir(out,{recursive:true});
for(const n of ['index.html','fixture.js','vercel.json'])await copyFile(path.join(root,'experiments/source-review-preview-v1',n),path.join(out,n));
for(const n of ['source-review.js','source-review.css','style.css'])await copyFile(path.join(root,'agent/public',n),path.join(out,n));
console.log('Staged only fictional source-review UI assets. No credentials, account data or deployment.');
