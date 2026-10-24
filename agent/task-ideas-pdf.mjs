import {PDFDocument,PDFName,PDFString,StandardFonts,rgb} from 'pdf-lib';
import {createHash} from 'node:crypto';
import {readFileSync,statSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {uploadDir} from './tools/uploads.mjs';
import {dataDir} from './store.mjs';
import {cachedProductImage} from './tools/products.mjs';

const pub=path.join(path.dirname(fileURLToPath(import.meta.url)),'public');
function localPhoto(url,leadId){
 let file;
 if(/^\/uploads\/[a-zA-Z0-9-]+\.(png|jpg|jpeg|webp|gif|avif)$/.test(url||''))file=path.join(uploadDir(),path.basename(url));
 else if(/^\/storyboard-assets\/[a-zA-Z0-9_./% -]+\.(png|jpg|jpeg|webp|gif|avif)$/.test(url||'')&&!url.includes('..')){try{file=path.resolve(pub,decodeURIComponent(url).slice(1));if(!file.startsWith(path.join(pub,'storyboard-assets')+path.sep))return null;}catch{return null;}}
 else if(leadId&&/^\d+\.(png|jpg|webp|gif|avif)$/.test(url||''))file=path.join(dataDir,'products',String(Number(leadId)),url);
 else{const client=String(url||'').match(/^\/api\/tasks\/(\d+)\/products\/(\d+)\/image$/);if(client)file=cachedProductImage(Number(client[1]),Number(client[2]),path.join(dataDir,'client-products'))?.file;}
 if(!file)return null;
 try{if(statSync(file).size>8*1024*1024)return null;return readFileSync(file);}catch{return null;}
}
function imageBytes(bytes){
 if(bytes[0]===0x89||bytes[0]===0xff)return bytes;
 // Pillow is also used by the desktop app's build. Decode locally, with no URLs or scripts from the file.
 const code="import io,sys,warnings; from PIL import Image,ImageOps; Image.MAX_IMAGE_PIXELS=32000000; warnings.simplefilter('error',Image.DecompressionBombWarning); im=ImageOps.exif_transpose(Image.open(io.BytesIO(sys.stdin.buffer.read()))); im.seek(0); im.thumbnail((1280,1280)); im.convert('RGBA').save(sys.stdout.buffer,'PNG')";
 try{return execFileSync('python3',['-c',code],{input:bytes,maxBuffer:16*1024*1024,timeout:10000,stdio:['pipe','pipe','ignore']});}catch{return null;}
}

// Export saved agent work only. Opening a report never starts research or generation.
export async function buildTaskIdeasPdf(workspace){
 const pdf=await PDFDocument.create(),regular=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold);
 const ink=rgb(.12,.15,.18),muted=rgb(.39,.43,.46),green=rgb(.05,.38,.26),brand=workspace.lead.company||workspace.lead.domain;
 const clean=value=>{
  let out='';
  for(const c of String(value??'').replace(/[\u2010-\u2015]/g,'-').replace(/[\u2018\u2019]/g,"'").replace(/[\u201c\u201d]/g,'"')){try{regular.encodeText(c);out+=c;}catch{out+=' ';}}
  return out.replace(/\s+/g,' ').trim();
 };
 let page,y,section='Creative ideas';
 const newPage=()=>{page=pdf.addPage([612,792]);page.drawText('MINT LABS',{x:48,y:752,size:9,font:bold,color:green});let title=clean(brand);while(bold.widthOfTextAtSize(title,20)>516)title=title.slice(0,-2);page.drawText(title,{x:48,y:724,size:20,font:bold,color:ink});page.drawText(section,{x:48,y:704,size:10,font:regular,color:muted});y=672;};
 const room=height=>{if(y-height<54)newPage();};
 const lines=(text,font,size,width)=>{
  const result=[];let line='';
  for(const word of clean(text).split(' ')){
   if(font.widthOfTextAtSize(word,size)>width){if(line){result.push(line);line='';}let part='';for(const c of word){if(font.widthOfTextAtSize(part+c,size)>width){result.push(part);part='';}part+=c;}line=part;}
   else if(line&&font.widthOfTextAtSize(line+' '+word,size)>width){result.push(line);line=word;}else line+=(line?' ':'')+word;
  }
  if(line)result.push(line);return result;
 };
 const text=(value,{font=regular,size=10,color=ink,width=516}={})=>{for(const line of lines(value,font,size,width)){room(size+5);page.drawText(line,{x:48,y,size,font,color});y-=size+5;}};
 const field=(label,value)=>{if(!clean(value))return;const height=(lines(label,bold,10,516).length+lines(value,regular,10,516).length)*15+9;room(height<=618?height:60);text(label,{font:bold,size:10,color:green});text(value);y-=9;};
 newPage();
 const full=workspace.creativeBrief||workspace.lead.brand_profile?.research,profile=workspace.lead.brand_profile||{},brief=workspace.brief||{};
 if(workspace.order){field('Client project',`${workspace.order.buyer_name||'Client'} / ${workspace.order.product||'Video project'}`);if(!workspace.order.brand_domain)field('Brand needed','This purchase has no linked brand website. Research and creative direction have not started. Add the brand website in this project to give the agents the right context.');}
 const status=workspace.task.status,ready=status==='ready';
 field('Research status',ready?'Ideas ready for review. No images, voices or videos have been generated.':['researching','research_queued','planning'].includes(status)?'Work in progress. This report contains the saved draft so far.':'Draft for review. Research gaps are listed below.');
 field('Brand website',workspace.lead.url||workspace.lead.domain);
 const plans=workspace.lab.plans||[],evidence=plans.find(p=>p.researchEvidence)?.researchEvidence||{};
 field('How this was prepared',evidence.method||workspace.ideation?.result?.method||'Saved local planning templates. Audience demographics and creator performance have not been verified.');
 field('Saved research brief',full?.researchBrief||brief.product||workspace.lead.evidence||'A full Sonnet research brief has not been saved for this project.');
 if(workspace.researchModel||profile.researchModel)field('Research model',workspace.researchModel||profile.researchModel);
 field('ICP profile',full?.icp?.summary||brief.audience||profile.audience?.join(', ')||workspace.lab.options?.audience);
 if(full?.icp){field('Buying motivations',full.icp.motivations.join(' '));field('ICP evidence',full.icp.evidence.join(' '));field('ICP uncertainties',full.icp.unknowns.join(' '));}
 const source=evidence.source||workspace.lead.url;
 field('Research source',source);
 const unknowns=[...new Set([...(workspace.ideation?.result?.unknowns||[]),...(evidence.unknowns||[])])];
 field('What still needs checking',unknowns.length?unknowns.join(' '):'Confirm audience fit, product accuracy, creator permissions and production costs before making an ad.');
 const products=workspace.lead.products||[];
 field('Product references',products.length?products.slice(0,6).map(p=>p.title||'Product').join('; '):'No product catalog or product photos have been saved for this project.');
 section='Character, design and environment';newPage();
 const first=plans[workspace.lab.selected||0]||plans[0];
 field('Character appearance',full?.character?.appearance||brief.identity||first?.identity||'No character direction has been saved.');
 field('Wardrobe',full?.character?.wardrobe||brief.wardrobe||first?.wardrobe);
 field('Why this character fits',full?.character?.rationale||'The existing character direction is a reusable draft. A brand-specific ICP rationale has not been verified.');
 field('Design directions',full?.designDirections?.length?full.designDirections.map(d=>`${d.name}: ${d.description} Why it fits: ${d.rationale}`).join('\n'):profile.style?.length?`Saved brand style: ${profile.style.join(', ')}. Detailed design alternatives have not been saved.`:'No brand-specific visual design research has been saved.');
 field('Game and cultural influences',full?.gameAffinities?.length?full.gameAffinities.map(g=>`${g.name} (${g.basis==='observed'&&g.sourceUrl?'reported observation, not independently verified':'creative hypothesis'}): ${g.rationale}${g.sourceUrl?' Source: '+g.sourceUrl:''}`).join('\n'):'Customer game preferences are unknown. A PS2-inspired treatment is an existing creative direction, not evidence of a customer preference.');
 field('Environment',full?.environments?.length?full.environments.map(e=>`${e.name}: ${e.description} Why it fits: ${e.rationale}`).join('\n'):brief.environment||first?.environment||'No environment direction has been saved.');
 if(full?.sources?.length)for(const source of full.sources)field('Source',`${source.url} ${source.observation}`);
 if(full?.unknowns?.length)field('Open research questions',full.unknowns.join(' '));
 const refs=[...(workspace.lab.refs||[]).filter(r=>['apparel','character'].includes(r.role)).map(r=>({...r,sourceUrl:r.sourceUrl||products.find(p=>p.referenceUrl===r.url)?.url,photo:localPhoto(r.url,workspace.lead.id)})),...products.slice(0,4).map(p=>({name:p.title,role:'apparel',sourceUrl:p.url,photo:localPhoto(p.referenceUrl||p.image,workspace.lead.id)}))];
 const images=[];
 const missing=[],seenPhotos=new Set();
 for(const ref of refs){if(!ref.photo){missing.push(ref.name);continue;}const key=ref.role+':'+createHash('sha256').update(ref.photo).digest('hex');if(seenPhotos.has(key))continue;seenPhotos.add(key);try{const bytes=imageBytes(ref.photo);if(!bytes)throw Error('No image decoder');const image=bytes[0]===0x89?await pdf.embedPng(bytes):await pdf.embedJpg(bytes);images.push({...ref,image});}catch{missing.push(ref.name);}}
 if(images.length||missing.length){
  section='Saved visual references';newPage();
  for(let i=0;i<Math.min(images.length,6);i+=2){
   const row=images.slice(i,i+2).map(ref=>{
    const caption=lines(ref.name,regular,9.5,246),shown=caption.slice(0,3);if(caption.length>3)shown[2]=shown[2].slice(0,-3)+'...';
    const note=ref.role==='character'?lines('Existing reference. Not a new image or an ICP-validated character.',regular,8.5,246):[];
    const scale=Math.min(220/ref.image.width,96/ref.image.height),height=14+shown.length*13+6+ref.image.height*scale+12+note.length*12+(ref.sourceUrl?15:0)+18;
    return {...ref,caption:shown,note,scale,height};
   });
   const height=Math.max(...row.map(r=>r.height));room(height);const top=y;
   row.forEach((ref,column)=>{
    const x=48+270*column;let cy=top;
    page.drawText(ref.role==='character'?'Existing character reference':'Product photo',{x,y:cy,size:9,font:bold,color:green});cy-=14;
    for(const line of ref.caption){page.drawText(line,{x,y:cy,size:9.5,font:regular,color:ink});cy-=13;}cy-=6;
    page.drawImage(ref.image,{x,y:cy-ref.image.height*ref.scale,width:ref.image.width*ref.scale,height:ref.image.height*ref.scale});cy-=ref.image.height*ref.scale+12;
    for(const line of ref.note){page.drawText(line,{x,y:cy,size:8.5,font:regular,color:muted});cy-=12;}
    if(ref.sourceUrl)try{const url=new URL(ref.sourceUrl);if(['https:','http:'].includes(url.protocol)){page.drawText('Product page',{x,y:cy,size:9,font:regular,color:green});const link=pdf.context.register(pdf.context.obj({Type:'Annot',Subtype:'Link',Rect:[x,cy-2,x+64,cy+10],Border:[0,0,0],A:{Type:'Action',S:'URI',URI:PDFString.of(url.href)}}));const annots=page.node.lookup(PDFName.of('Annots'));if(annots)annots.push(link);else page.node.set(PDFName.of('Annots'),pdf.context.obj([link]));}}catch{}
   });y=top-height;
  }
  if(missing.length)field('Photo previews unavailable',`${[...new Set(missing)].join(', ')}. The catalog source is listed above; no replacement image was generated.`);
 }
 if(!plans.length){field('Creative ideas','No script or scene ideas have been saved for this client yet. The purchase record alone does not create a research result.');}
 for(const [index,plan] of plans.entries()){
  section=`Idea ${index+1} of ${plans.length}`;newPage();
  text(plan.title,{font:bold,size:17});y-=12;
  field('Direction',plan.creativeDirection);field('Length',`${plan.durationSeconds} seconds`);
  field('Character',plan.identity);field('Product and wardrobe',plan.wardrobe);field('Setting',plan.environment);
  for(const [i,shot] of plan.shots.entries()){
   room(94);text(`Shot ${i+1}: ${shot.start}-${shot.start+shot.duration}s`,{font:bold,size:11,color:green});y-=5;
   text(`Camera: ${shot.camera}`,{size:9.5});text(`Action: ${shot.action}`,{size:9.5});text(`Script: ${shot.dialogue||'No dialogue.'}`,{size:9.5});y-=12;
  }
  field('Production note','These are planning ideas, not rendered results. Review the script and product reference before approving any paid production.');
 }
 const pages=pdf.getPages();pages.forEach((p,i)=>p.drawText(`${i+1} / ${pages.length}`,{x:516,y:28,size:9,font:regular,color:muted}));
 pdf.setTitle(`${clean(brand)}: Creative ideas`);pdf.setAuthor('Mint Labs');pdf.setSubject('Saved brand research and creative ideas');
 return {bytes:Buffer.from(await pdf.save()),name:`${String(brand).replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'').toLowerCase().slice(0,80)||'brand'}-ideas.pdf`};
}
