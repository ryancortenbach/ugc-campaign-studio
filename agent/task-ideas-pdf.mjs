import {PDFDocument,PDFName,PDFString,StandardFonts,rgb} from 'pdf-lib';
import {createHash} from 'node:crypto';
import {readFileSync,statSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {uploadDir} from './tools/uploads.mjs';
import {dataDir} from './store.mjs';
import {cachedProductImage} from './tools/products.mjs';
import {cachedLogo} from './logo.mjs';

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
 if((bytes[0]===0x89&&bytes[1]===0x50)||(bytes[0]===0xff&&bytes[1]===0xd8))return new Uint8Array(bytes);
 // Pillow is also used by the desktop app's build. Decode locally, with no URLs or scripts from the file.
 const code="import io,sys,warnings; from PIL import Image,ImageOps; Image.MAX_IMAGE_PIXELS=32000000; warnings.simplefilter('error',Image.DecompressionBombWarning); im=ImageOps.exif_transpose(Image.open(io.BytesIO(sys.stdin.buffer.read()))); im.seek(0); im.thumbnail((1280,1280)); im.convert('RGBA').save(sys.stdout.buffer,'PNG')";
 try{return new Uint8Array(execFileSync('python3',['-c',code],{input:bytes,maxBuffer:16*1024*1024,timeout:10000,stdio:['pipe','pipe','ignore']}));}catch{return null;}
}

const KIND_LABEL={top:'Top',bottom:'Bottom',outerwear:'Outerwear',footwear:'Footwear',headwear:'Headwear',accessory:'Accessory'};
// Logos are cached by domain. SVG is rasterised locally, other formats go through the same local decoder as product photos.
async function logoBytes(domain){
 try{
  const hit=cachedLogo(path.join(dataDir,'logos'),String(domain||'').toLowerCase());if(!hit||statSync(hit.file).size>1024*1024)return null;
  const data=readFileSync(hit.file);
  if(hit.type==='image/svg+xml'){const {Resvg}=await import('@resvg/resvg-js');return new Uint8Array(new Resvg(data,{fitTo:{mode:'width',value:256},background:'white'}).render().asPng());}
  return imageBytes(data);
 }catch{return null;}
}
const rounded=(w,h,r)=>`M ${r},0 L ${w-r},0 A ${r},${r} 0 0 1 ${w},${r} L ${w},${h-r} A ${r},${r} 0 0 1 ${w-r},${h} L ${r},${h} A ${r},${r} 0 0 1 0,${h-r} L 0,${r} A ${r},${r} 0 0 1 ${r},0 Z`;
// First sentence(s) that fit in `max` characters, so long saved prose becomes one short line without cutting mid-word.
const short=(value,max=150)=>{
 const t=String(value??'').replace(/\s+/g,' ').trim();if(t.length<=max)return t;
 const sentence=t.slice(0,max).match(/^.*[.!?](?=\s|$)/);if(sentence&&sentence[0].length>40)return sentence[0];
 return t.slice(0,max-3).replace(/\s+\S*$/,'')+'...';
};
const price=p=>{const n=Number(p.price);if(!Number.isFinite(n)||n<=0)return '';const text=Number.isInteger(n)?String(n):n.toFixed(2),cur=String(p.currency||'USD').toUpperCase();return cur==='USD'?'$'+text:`${cur} ${text}`;};

// Export saved agent work only. Opening a report never starts research or generation.
export async function buildTaskIdeasPdf(workspace){
 const pdf=await PDFDocument.create(),regular=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold);
 const ink=rgb(.12,.15,.18),muted=rgb(.39,.43,.46),green=rgb(.05,.38,.26),paleGreen=rgb(.89,.95,.92),paleGrey=rgb(.93,.94,.95),line=rgb(.86,.88,.89),white=rgb(1,1,1),brand=workspace.lead.company||workspace.lead.domain;
 const clean=value=>{
  let out='';
  for(const c of String(value??'').replace(/[‐-―]/g,'-').replace(/[‘’]/g,"'").replace(/[“”]/g,'"')){try{regular.encodeText(c);out+=c;}catch{out+=' ';}}
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
 // At most `max` wrapped lines, the last one ending in an ellipsis when the text was cut.
 const clamp=(text,font,size,width,max)=>{const all=lines(text,font,size,width);if(all.length<=max)return all;const out=all.slice(0,max);let last=out[max-1];while(last&&font.widthOfTextAtSize(last+'...',size)>width)last=last.slice(0,-1);out[max-1]=last.trimEnd()+'...';return out;};
 const text=(value,{font=regular,size=10,color=ink,width=516}={})=>{for(const line of lines(value,font,size,width)){room(size+5);page.drawText(line,{x:48,y,size,font,color});y-=size+5;}};
 const field=(label,value)=>{if(!clean(value))return;const height=(lines(label,bold,10,516).length+lines(value,regular,10,516).length)*15+9;room(height<=618?height:60);text(label,{font:bold,size:10,color:green});text(value);y-=9;};
 // One short labeled line: bold green label in a left column, value wrapped beside it.
 const kv=(label,value,{labelWidth=96,size=9.5}={})=>{
  const rows=lines(value,regular,size,516-labelWidth);if(!rows.length)return;
  room(rows.length*(size+4)+4);page.drawText(clean(label),{x:48,y,size,font:bold,color:green});
  for(const row of rows){page.drawText(row,{x:48+labelWidth,y,size,font:regular,color:ink});y-=size+4;}
  y-=3;
 };
 const roundRect=(x,top,w,h,r,opts)=>page.drawSvgPath(rounded(w,h,r),{x,y:top,...opts});
 // Small rounded label. Returns its width so callers can flow chips left to right.
 const chipWidth=(label,size=8.5)=>bold.widthOfTextAtSize(label,size)+14;
 const drawChip=(label,x,top,{size=8.5,fill=paleGrey,color=ink}={})=>{const w=chipWidth(label,size);roundRect(x,top,w,15,7.5,{color:fill,borderWidth:0});page.drawText(label,{x:x+7,y:top-10.8,size,font:bold,color});return w;};
 const chipRow=(label,items,fill,color)=>{
  const list=[...new Set((items||[]).map(clean).filter(Boolean))].slice(0,6).map(t=>t.length>34?t.slice(0,31)+'...':t);if(!list.length)return;
  room(40);page.drawText(label,{x:48,y,size:8,font:bold,color:muted});y-=6;
  let x=48;
  for(const chip of list){const w=chipWidth(chip);if(x+w>564){x=48;y-=20;room(20);}drawChip(chip,x,y,{fill,color});x+=w+6;}
  y-=26;
 };
 const profile=workspace.lead.brand_profile||{},brief=workspace.brief||{},products=workspace.lead.products||[],plans=workspace.lab?.plans||[],lab=workspace.lab||{};
 section=clean(workspace.lead.domain||'')||section;
 newPage();
 // Logo, top right, only when one is cached and decodable.
 const logoData=await logoBytes(workspace.lead.domain);
 if(logoData){try{const logo=logoData[0]===0x89?await pdf.embedPng(logoData):await pdf.embedJpg(logoData),box={w:110,h:46},scale=Math.min(box.w/logo.width,box.h/logo.height),w=logo.width*scale,h=logo.height*scale;page.drawImage(logo,{x:564-w,y:704+(box.h-h)/2,width:w,height:h});}catch{}}
 const full=workspace.creativeBrief||profile.research;
 if(workspace.order){field('Client project',`${workspace.order.buyer_name||'Client'} / ${workspace.order.product||'Video project'}`);if(!workspace.order.brand_domain)field('Brand needed','This purchase has no linked brand website. Research and creative direction have not started. Add the brand website in this project to give the agents the right context.');}
 const pendingAudience=s=>/^Audience research pending/i.test(String(s||''));
 const audience=(profile.audience?.length?profile.audience:[brief.audience,lab.options?.audience].filter(a=>a&&!pendingAudience(a)&&String(a).length<=60));
 chipRow('AUDIENCE',audience,paleGreen,green);
 chipRow('STYLE',profile.style,paleGrey,ink);
 // Product grid: only products whose cached photo decodes. The hero is always shown, ringed.
 const heroIndex=profile.hero&&Number.isInteger(profile.hero.productIndex)?profile.hero.productIndex:-1;
 const tiles=[],missing=[];
 for(const [index,p] of products.entries()){
  if(tiles.length>=12&&index!==heroIndex)continue;
  const photo=localPhoto(p.referenceUrl||p.image,workspace.lead.id);
  let image=null;
  if(photo){try{const bytes=imageBytes(photo);if(bytes)image=bytes[0]===0x89?await pdf.embedPng(bytes):await pdf.embedJpg(bytes);}catch{}}
  if(!image){if(index!==heroIndex)missing.push(p);continue;}
  const tile={p,image,hero:index===heroIndex};
  if(tiles.length>=12)tiles[11]=tile;else tiles.push(tile);
 }
 if(tiles.length){
  const cols=4,gap=10,tw=(516-gap*(cols-1))/cols,photoH=96,tileH=photoH+6+15+5+20+10;
  for(let r=0;r*cols<tiles.length;r++){
   room(tileH);const top=y;
   tiles.slice(r*cols,r*cols+cols).forEach((t,c)=>{
    const x=48+c*(tw+gap);
    roundRect(x,top,tw,photoH,6,{color:rgb(.97,.97,.97),borderColor:t.hero?green:line,borderWidth:t.hero?2.4:.7});
    const s=Math.min((tw-12)/t.image.width,(photoH-12)/t.image.height),w=t.image.width*s,h=t.image.height*s;
    page.drawImage(t.image,{x:x+(tw-w)/2,y:top-photoH+(photoH-h)/2,width:w,height:h});
    if(t.hero)drawChip('Hero',x+6,top-6,{fill:green,color:white});
    const ky=top-photoH-6;let used=0;
    const kind=KIND_LABEL[t.p.kind];if(kind)used=drawChip(kind,x,ky);
    const cost=price(t.p);if(cost){const pw=bold.widthOfTextAtSize(cost,9);page.drawText(cost,{x:x+tw-pw,y:ky-10.5,size:9,font:bold,color:ink});}
    clamp(t.p.title||'Product',regular,8,tw,2).forEach((row,i)=>page.drawText(row,{x,y:ky-15-9-i*10,size:8,font:regular,color:ink}));
   });
   y=top-tileH;
  }
  const hero=tiles.find(t=>t.hero),why=short(profile.hero?.why,200);
  if(hero&&why){const row=clamp(`Hero: ${why}`,regular,9,516,1)[0];room(16);page.drawText(row,{x:48,y,size:9,font:regular,color:ink});y-=16;}
 }else if(products.length){
  chipRow('PRODUCTS',products.slice(0,6).map(p=>p.title||'Product'),paleGrey,ink);
 }
 const status=workspace.task.status,ready=status==='ready';
 const plansEvidence=plans.find(p=>p.researchEvidence)?.researchEvidence||{},evidence=plansEvidence;
 y-=8;
 kv('Status',ready?'Ideas ready for review. Nothing generated yet.':['researching','research_queued','planning'].includes(status)?'Work in progress. Saved draft so far.':'Draft for review.');
 const source=evidence.source||workspace.lead.url||(workspace.lead.domain?`https://${workspace.lead.domain}`:'');
 kv('Source',source);
 const unknowns=[...new Set([...(workspace.ideation?.result?.unknowns||[]),...(evidence.unknowns||[])])];
 if(unknowns.length)kv('To check',unknowns.join(' '));
 if(workspace.researchModel||profile.researchModel)kv('Model',workspace.researchModel||profile.researchModel);
 if(full?.researchBrief){y-=4;field('Research brief',full.researchBrief);}
 if(full?.icp){field('ICP profile',full.icp.summary);field('Buying motivations',full.icp.motivations.join(' '));field('ICP evidence',full.icp.evidence.join(' '));field('ICP uncertainties',full.icp.unknowns.join(' '));}
 else if(brief.audience&&!pendingAudience(brief.audience))field('ICP profile',brief.audience);
 section='Character, design and environment';newPage();
 const first=plans[lab.selected||0]||plans[0];
 const appearance=full?.character?.appearance||brief.identity||first?.identity,wardrobe=full?.character?.wardrobe||brief.wardrobe||first?.wardrobe;
 if(full?.character){field('Character appearance',appearance);field('Wardrobe',wardrobe);field('Why this character fits',full.character.rationale);}
 else{kv('Character',short(appearance,170));kv('Wardrobe',short(wardrobe,170));}
 if(full?.designDirections?.length)field('Design directions',full.designDirections.map(d=>`${d.name}: ${d.description} Why it fits: ${d.rationale}`).join('\n'));
 if(full?.gameAffinities?.length)field('Game and cultural influences',full.gameAffinities.map(g=>`${g.name} (${g.basis==='observed'&&g.sourceUrl?'reported observation, not independently verified':'creative hypothesis'}): ${g.rationale}${g.sourceUrl?' Source: '+g.sourceUrl:''}`).join('\n'));
 else kv('Games','Customer game preferences are unknown. A PS2-inspired look is a creative direction, not customer evidence.');
 if(full?.environments?.length)field('Environment',full.environments.map(e=>`${e.name}: ${e.description} Why it fits: ${e.rationale}`).join('\n'));
 else kv('Environment',short(brief.environment||first?.environment,170));
 if(full?.sources?.length)for(const s of full.sources)kv('Source',`${s.url} ${s.observation}`);
 if(full?.unknowns?.length)field('Open research questions',full.unknowns.join(' '));
 // Reference photos from the storyboard that the grid does not already show.
 const gridTitles=new Set(tiles.map(t=>clean(t.p.title)));
 const refs=(lab.refs||[]).filter(r=>['apparel','character'].includes(r.role)&&!(r.role==='apparel'&&gridTitles.has(clean(r.name)))).map(r=>({...r,sourceUrl:r.sourceUrl||products.find(p=>p.referenceUrl===r.url)?.url,photo:localPhoto(r.url,workspace.lead.id)}));
 const images=[],missingRefs=[],seenPhotos=new Set();
 for(const ref of refs){if(!ref.photo){missingRefs.push(ref.name);continue;}const key=ref.role+':'+createHash('sha256').update(ref.photo).digest('hex');if(seenPhotos.has(key))continue;seenPhotos.add(key);try{const bytes=imageBytes(ref.photo);if(!bytes)throw Error('No image decoder');const image=bytes[0]===0x89?await pdf.embedPng(bytes):await pdf.embedJpg(bytes);images.push({...ref,image});}catch{missingRefs.push(ref.name);}}
 if(images.length||missingRefs.length){
  y-=6;
  for(let i=0;i<Math.min(images.length,6);i+=2){
   const row=images.slice(i,i+2).map(ref=>{
    const caption=clamp(ref.name,regular,9.5,246,2);
    const scale=Math.min(220/ref.image.width,96/ref.image.height),height=14+caption.length*13+6+ref.image.height*scale+12+(ref.sourceUrl?15:0)+10;
    return {...ref,caption,scale,height};
   });
   const height=Math.max(...row.map(r=>r.height));room(height);const top=y;
   row.forEach((ref,column)=>{
    const x=48+270*column;let cy=top;
    page.drawText(ref.role==='character'?'Character reference':'Product photo',{x,y:cy,size:9,font:bold,color:green});cy-=14;
    for(const row of ref.caption){page.drawText(row,{x,y:cy,size:9.5,font:regular,color:ink});cy-=13;}cy-=6;
    page.drawImage(ref.image,{x,y:cy-ref.image.height*ref.scale,width:ref.image.width*ref.scale,height:ref.image.height*ref.scale});cy-=ref.image.height*ref.scale+12;
    if(ref.sourceUrl)try{const url=new URL(ref.sourceUrl);if(['https:','http:'].includes(url.protocol)){page.drawText('Product page',{x,y:cy,size:9,font:regular,color:green});const link=pdf.context.register(pdf.context.obj({Type:'Annot',Subtype:'Link',Rect:[x,cy-2,x+64,cy+10],Border:[0,0,0],A:{Type:'Action',S:'URI',URI:PDFString.of(url.href)}}));const annots=page.node.lookup(PDFName.of('Annots'));if(annots)annots.push(link);else page.node.set(PDFName.of('Annots'),pdf.context.obj([link]));}}catch{}
   });y=top-height;
  }
  if(missingRefs.length)kv('Photo previews unavailable',[...new Set(missingRefs)].join(', '),{labelWidth:150});
 }
 if(!plans.length){kv('Creative ideas','No script or scene ideas have been saved for this client yet.');}
 for(const [index,plan] of plans.entries()){
  section=`Idea ${index+1} of ${plans.length}`;newPage();
  text(plan.title,{font:bold,size:17});y-=10;
  kv('Direction',short(plan.creativeDirection,170));kv('Length',`${plan.durationSeconds} seconds`);
  kv('Character',short(plan.identity,150));kv('Wardrobe',short(plan.wardrobe,150));kv('Setting',short(plan.environment,150));
  y-=6;
  for(const [i,shot] of plan.shots.entries()){
   room(80);text(`Shot ${i+1}: ${shot.start}-${shot.start+shot.duration}s`,{font:bold,size:11,color:green});y-=3;
   text(`Camera: ${short(shot.camera,160)}`,{size:9.5});text(`Action: ${short(shot.action,160)}`,{size:9.5});text(`Script: ${shot.dialogue||'No dialogue.'}`,{size:9.5});y-=10;
  }
  kv('Note','Planning idea, not a rendered result.');
 }
 const pages=pdf.getPages();pages.forEach((p,i)=>p.drawText(`${i+1} / ${pages.length}`,{x:516,y:28,size:9,font:regular,color:muted}));
 pdf.setTitle(`${clean(brand)}: Creative ideas`);pdf.setAuthor('Mint Labs');pdf.setSubject('Saved brand research and creative ideas');
 return {bytes:Buffer.from(await pdf.save()),name:`${String(brand).replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'').toLowerCase().slice(0,80)||'brand'}-ideas.pdf`};
}
