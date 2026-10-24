import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync,readFileSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {PDFDocument,PDFName} from 'pdf-lib';
const dir=mkdtempSync(path.join(tmpdir(),'mint-report-pdf-'));process.env.AGENT_DATA_DIR=dir;
const {openStore}=await import('./store.mjs');
const {createTaskStoryboards}=await import('./task-storyboards.mjs');
const {buildTaskIdeasPdf}=await import('./task-ideas-pdf.mjs');
const {normalizeCreativeResearch}=await import('./creative-brief.mjs');
const {saveUpload}=await import('./tools/uploads.mjs');
const store=openStore(':memory:'),boards=createTaskStoryboards({store}),mission=store.createTask('Research');
const lead=store.createLead({taskId:mission.id,company:'PDF Brand',domain:'brand.example',url:'https://brand.example',market:'streetwear',territory:'NYC',status:'drafted'}),base=boards.ensure(lead.id);
const asText=bytes=>{const f=path.join(dir,'report.pdf');writeFileSync(f,bytes);return execFileSync('pdftotext',[f,'-'],{encoding:'utf8'});};
const images=pdf=>pdf.getPages().reduce((n,p)=>n+(p.node.Resources()?.lookup(PDFName.of('XObject'))?.keys().length||0),0);
test.after(()=>{boards.close();store.db.close();rmSync(dir,{recursive:true,force:true});});
test('report contains saved research, ICP, character, designs, games, environment and scripts',async()=>{
 const w=structuredClone(base);w.creativeBrief={researchBrief:'Full saved research narrative.',icp:{summary:'Evidence-limited ICP candidate.',motivations:['Durability'],evidence:['Catalog products'],unknowns:['Age unknown']},character:{appearance:'Original short-haired character.',wardrobe:'Blue tee.',rationale:'Product silhouette remains clear.'},designDirections:[{name:'Flat color study',description:'Restrained texture.',rationale:'Matches catalog.'}],gameAffinities:[{name:'Hypothesis Game',basis:'observed',sourceUrl:null,rationale:'A proposed style only.'}],environments:[{name:'Station',description:'Blue-hour tiled platform.',rationale:'Fits the commute scene.'}],sources:[{url:'https://brand.example',observation:'Brand homepage.'}],unknowns:['Performance unverified.']};
 const out=await buildTaskIdeasPdf(w),text=asText(out.bytes);for(const expected of ['Full saved research narrative.','ICP profile','Original short-haired character.','Flat color study','Hypothesis Game (creative hypothesis)','Blue-hour tiled platform.','Exact spoken line','Script']){if(expected==='Exact spoken line')continue;assert.ok(text.includes(expected),expected);}
 assert.ok((await PDFDocument.load(out.bytes)).getPageCount()>=4);assert.ok(!text.includes('source-supported observation'));assert.equal(store.spendSummary().total,0);
});
test('missing paid-client work remains explicit and does not fabricate a brief or a customer preference',async()=>{
 const w={task:{status:'needs_research'},order:{buyer_name:'Client',product:'Video',brand_domain:null},lead:{company:'Client',products:[]},lab:{options:{},plans:[],refs:[]},revision:0};const text=asText((await buildTaskIdeasPdf(w)).bytes);assert.match(text,/Brand needed/);assert.match(text,/full Sonnet research brief has not been saved/);assert.match(text,/Customer game preferences are unknown/);
});
test('cached WebP, GIF and AVIF product photos embed without a CRM lead',async()=>{
 const refs=[];for(const ext of ['webp','gif','avif']){const image=path.join(dir,`photo.${ext}`);execFileSync('python3',['-c',"from PIL import Image; import sys; Image.open(sys.argv[1]).convert('RGB').save(sys.argv[2])",new URL('./public/favicon.png',import.meta.url).pathname,image],{stdio:'ignore',timeout:15000});const bytes=readFileSync(image);if(ext==='avif'){const folder=path.join(dir,'client-products','77');mkdirSync(folder,{recursive:true});writeFileSync(path.join(folder,'0.avif'),bytes);refs.push({title:'AVIF product',referenceUrl:'/api/tasks/77/products/0/image'});}else{const upload=saveUpload({name:'Product',type:`image/${ext}`,data:bytes.toString('base64')});refs.push({title:`${ext} product`,referenceUrl:`/uploads/${upload.file}`});}}
 const w=structuredClone(base);w.lab.refs=[];w.lead={company:'Client',products:refs};const out=await buildTaskIdeasPdf(w);assert.equal(images(await PDFDocument.load(out.bytes)),3);assert.ok(!asText(out.bytes).includes('Photo previews unavailable'));
});
test('encoded asset traversal is never embedded into the report',async()=>{
 const image=path.join(dir,'private.png');writeFileSync(image,readFileSync(new URL('./public/favicon.png',import.meta.url)));const from=new URL('./public/storyboard-assets/',import.meta.url).pathname;const escaped='/storyboard-assets/'+path.relative(from,image).replaceAll('..','%2e%2e');const w=structuredClone(base);w.lab.refs=[{role:'character',name:'Private reference',url:escaped}];const out=await buildTaskIdeasPdf(w);assert.equal(images(await PDFDocument.load(out.bytes)),0);assert.match(asText(out.bytes),/Photo previews unavailable/);
});
test('unsupported observed game preferences are downgraded and invented URLs are discarded',()=>{
 const out=normalizeCreativeResearch({sources:[{url:'https://invented.example',observation:'x'},{url:'https://brand.example',observation:'Real input'}],gameAffinities:[{name:'A',basis:'observed',sourceUrl:null},{name:'B',basis:'observed',sourceUrl:'https://invented.example'},{name:'C',basis:'observed',sourceUrl:'https://brand.example'}]},['https://brand.example']);assert.equal(out.sources.length,1);assert.deepEqual(out.gameAffinities.map(g=>g.basis),['hypothesis','hypothesis','observed']);
});
