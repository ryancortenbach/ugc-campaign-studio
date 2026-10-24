import {PDFDocument,PDFName,PDFString,StandardFonts,rgb} from 'pdf-lib';
import {Resvg} from '@resvg/resvg-js';
import {readFileSync,writeFileSync,mkdirSync,existsSync,statSync,mkdtempSync,rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import path from 'node:path';

// The personalized 2 page offer PDF. The base file (made in Google Docs) is never edited: every lead gets a copy where the X logo
// becomes the brand logo, "Hey everyone," becomes "Hey <name>,", and page 2 gains a line with the brand's 5 second clip.
// Coordinates are PDF points measured from the top left of the US Letter page (792 tall), taken from `pdftotext -bbox` on base-v3.pdf.
export const LAYOUT={
 pageHeight:792,
 // Page 1: the X logo is centered at x=306, between y=55 and y=95. The first text line starts at y=105.9, so the logo box ends at 102.
 logoBox:{cx:306,top:48,width:180,height:54},
 // "Hey everyone," is Arial 11pt: box 54..124.9 by 105.94..118.23, so the baseline sits 0.905 em below the top of the box.
 greeting:{x:54,top:105.94,bottom:118.23,size:11,coverRight:130},
 // Page 2: the last picture ends at y=650 and the page margin is 54, so the free band is y 658..738 and content starts at 668.
 clip:{x:54,top:668,bottom:738,right:558,stillHeight:62}
};
const ARIAL_ASCENT=0.905;

const sniff=b=>b.length>8&&b[0]===0x89&&b[1]===0x50&&b[2]===0x4e&&b[3]===0x47?'png':b.length>3&&b[0]===0xff&&b[1]===0xd8&&b[2]===0xff?'jpg':null;
const extFor=mime=>({'image/svg+xml':'svg','image/webp':'webp','image/x-icon':'ico','image/vnd.microsoft.icon':'ico','image/gif':'gif','image/avif':'avif','image/jpeg':'jpg','image/png':'png'})[String(mime||'').toLowerCase()]||'img';

// SVG needs its own renderer because macOS sips does not reliably decode it. Other raster types use sips.
export function convertToPng(bytes,mime){
 if(mime==='image/svg+xml'){
  try{const svg=new Resvg(bytes,{fitTo:{mode:'width',value:512}});if(svg.width>4096||svg.height>4096)return null;return svg.render().asPng();}catch{return null;}
 }
 let dir;
 try{
  dir=mkdtempSync(path.join(tmpdir(),'offer-logo-'));
  const src=path.join(dir,`in.${extFor(mime)}`),out=path.join(dir,'out.png');
  writeFileSync(src,bytes);
  execFileSync('sips',['-s','format','png',src,'--out',out],{stdio:'ignore',timeout:15000});
  const png=readFileSync(out);
  return sniff(png)==='png'?png:null;
 }catch{return null;}
 finally{if(dir)try{rmSync(dir,{recursive:true,force:true});}catch{}}
}
async function embedImage(pdf,img){
 if(!img?.bytes?.length)return null;
 const bytes=Buffer.from(img.bytes),kind=sniff(bytes);
 const tryEmbed=async(b,k)=>{try{return k==='png'?await pdf.embedPng(b):await pdf.embedJpg(b);}catch{return null;}};
 if(kind){const hit=await tryEmbed(bytes,kind);if(hit)return hit;}
 // An unsupported or unusual file (interlaced PNG, 16 bit, webp, svg, ico, gif): convert once and try again.
 const png=convertToPng(bytes,img.mime);
 return png?tryEmbed(png,'png'):null;
}
// Standard fonts only encode WinAnsi. Drop anything else instead of throwing on a brand name with an unusual character.
function safeText(font,text){
 let out='';
 for(const ch of String(text??'').normalize('NFC').replace(/[\r\n\t]+/g,' ')){try{font.encodeText(ch);out+=ch;}catch{}}
 return out.replace(/\s+/g,' ').trim();
}
function fitSize(font,text,size,maxWidth,min=6){
 let s=size;
 while(s>min&&font.widthOfTextAtSize(text,s)>maxWidth)s-=0.25;
 return s;
}
function ellipsize(font,text,size,maxWidth){
 if(font.widthOfTextAtSize(text,size)<=maxWidth)return text;
 let t=text;
 while(t.length>1&&font.widthOfTextAtSize(`${t}...`,size)>maxWidth)t=t.slice(0,-1);
 return `${t}...`;
}
const yFromTop=top=>LAYOUT.pageHeight-top;
function addLink(pdf,page,{x,top,width,height,url}){
 const ref=pdf.context.register(pdf.context.obj({
  Type:'Annot',Subtype:'Link',Rect:[x,yFromTop(top+height),x+width,yFromTop(top)],Border:[0,0,0],
  A:{Type:'Action',S:'URI',URI:PDFString.of(url)}
 }));
 const existing=page.node.lookup(PDFName.of('Annots'));
 if(existing&&existing.push)existing.push(ref);else page.node.set(PDFName.of('Annots'),pdf.context.obj([ref]));
}
const safeUrl=url=>{try{const u=new URL(String(url));return u.protocol==='https:'||u.protocol==='http:'?u.href:null;}catch{return null;}};

// base: PDF bytes or a file path. Returns the personalized PDF as a Buffer.
export async function personalizeOffer({base,company,greetingName=null,logo=null,clip=null}){
 const baseBytes=typeof base==='string'?readFileSync(base):base;
 const pdf=await PDFDocument.load(baseBytes);
 const pages=pdf.getPages();
 if(pages.length<2)throw Error('The base offer PDF needs 2 pages');
 const font=await pdf.embedFont(StandardFonts.Helvetica);
 const [p1,p2]=pages;
 const white=rgb(1,1,1);
 const name=safeText(font,company)||'your brand';

 // 1. Logo: white over the X, then the brand logo centered in the same band. No logo leaves the band white.
 const box=LAYOUT.logoBox;
 p1.drawRectangle({x:box.cx-box.width/2,y:yFromTop(box.top+box.height),width:box.width,height:box.height,color:white,borderWidth:0});
 const img=await embedImage(pdf,logo);
 if(img){
  const scale=Math.min(box.width/img.width,box.height/img.height),w=img.width*scale,h=img.height*scale;
  p1.drawImage(img,{x:box.cx-w/2,y:yFromTop(box.top+box.height/2)-h/2,width:w,height:h});
 }

 // 2. Greeting: same size and baseline as "Hey everyone,".
 const g=LAYOUT.greeting;
 p1.drawRectangle({x:g.x-2,y:yFromTop(g.bottom+1.5),width:g.coverRight-g.x+2,height:g.bottom-g.top+3,color:white,borderWidth:0});
 const hello=safeText(font,`Hey ${safeText(font,greetingName)||`${name} team`},`);
 p1.drawText(ellipsize(font,hello,g.size,500),{x:g.x,y:yFromTop(g.top+ARIAL_ASCENT*g.size),size:g.size,font,color:rgb(0,0,0)});

 // 3. Clip line, link and optional still on page 2. Nothing is added without a safe clip URL.
 const url=clip?safeUrl(clip.url):null;
 if(url){
  const c=LAYOUT.clip;
  const still=await embedImage(pdf,clip.still);
  let x=c.x;
  if(still){
   const h=c.stillHeight,w=Math.min(h*still.width/still.height,90);
   p2.drawImage(still,{x:c.x,y:yFromTop(c.top+h),width:w,height:h});
   p2.drawRectangle({x:c.x,y:yFromTop(c.top+h),width:w,height:h,borderColor:rgb(0.8,0.8,0.8),borderWidth:0.5});
   addLink(pdf,p2,{x:c.x,top:c.top,width:w,height:h,url});
   x=c.x+w+12;
  }
  const maxW=c.right-x;
  const line=`We made this 5 second clip for ${name}:`;
  const lineSize=fitSize(font,line,11,maxW);
  const lineTop=c.top+(still?10:0);
  p2.drawText(ellipsize(font,line,lineSize,maxW),{x,y:yFromTop(lineTop+ARIAL_ASCENT*lineSize),size:lineSize,font,color:rgb(0,0,0)});
  const shown=safeText(font,url);
  const linkSize=fitSize(font,shown,10,maxW,7),text=ellipsize(font,shown,linkSize,maxW),linkW=font.widthOfTextAtSize(text,linkSize);
  const linkTop=lineTop+lineSize+7,blue=rgb(0.07,0.33,0.8);
  p2.drawText(text,{x,y:yFromTop(linkTop+ARIAL_ASCENT*linkSize),size:linkSize,font,color:blue});
  p2.drawLine({start:{x,y:yFromTop(linkTop+linkSize+0.5)},end:{x:x+linkW,y:yFromTop(linkTop+linkSize+0.5)},thickness:0.5,color:blue});
  addLink(pdf,p2,{x,top:linkTop,width:linkW,height:linkSize+2,url});
 }
 pdf.setTitle(`Offer for ${name}`);pdf.setCreator('Mint Labs');pdf.setProducer('Mint Labs');
 return Buffer.from(await pdf.save());
}

// ---- Per lead files: <dir>/<leadId>-<renderId|none>.pdf with a sidecar .json holding a hash of every input. ----
const sha=b=>createHash('sha256').update(b).digest('hex').slice(0,16);
let ffmpegOk=null;
export const hasFfmpeg=()=>{if(ffmpegOk===null){try{execFileSync('which',['ffmpeg'],{stdio:'ignore'});execFileSync('ffmpeg',['-version'],{stdio:'ignore',timeout:10000});ffmpegOk=true;}catch{ffmpegOk=false;}}return ffmpegOk;};
// First frame past the opening, as a small JPEG. Null when ffmpeg is missing or the file is not a video.
export function stillFromVideo(file,out){
 if(!hasFfmpeg()||!file||!existsSync(file))return null;
 try{
  mkdirSync(path.dirname(out),{recursive:true});
  if(existsSync(out)&&statSync(out).mtimeMs>=statSync(file).mtimeMs&&statSync(out).size>0)return {bytes:readFileSync(out),mime:'image/jpeg'};
  for(const ss of ['1','0'])try{
   execFileSync('ffmpeg',['-y','-v','error','-ss',ss,'-i',file,'-frames:v','1','-vf','scale=-2:256','-q:v','4',out],{stdio:'ignore',timeout:30000});
   if(existsSync(out)&&statSync(out).size>0)return {bytes:readFileSync(out),mime:'image/jpeg'};
  }catch{}
 }catch{}
 return null;
}
export const offerFile=(dir,leadId,renderId)=>path.join(dir,`${leadId}-${renderId||'none'}.pdf`);
// Builds (or reuses) the PDF for one lead. Returns {file,bytes,name,cached}. Regenerates when the base, name, logo, clip or still changed.
export async function buildLeadOffer({baseFile,dir,leadId,renderId=null,company,greetingName=null,logo=null,clip=null,videoFile=null}){
 if(!existsSync(baseFile))throw Object.assign(Error('The base offer PDF is missing (agent/.data/offer/base-v3.pdf)'),{status:503});
 mkdirSync(dir,{recursive:true});
 const file=offerFile(dir,leadId,renderId),side=file.replace(/\.pdf$/,'.json');
 let still=null;
 if(clip?.url)still=clip.still??stillFromVideo(videoFile,file.replace(/\.pdf$/,'.still.jpg'));
 const base=statSync(baseFile);
 const key=sha(JSON.stringify([base.size,base.mtimeMs,company,greetingName,logo?.bytes?sha(logo.bytes):null,clip?.url||null,still?.bytes?sha(still.bytes):null]));
 const name=`${String(company||'brand').replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'').toLowerCase()||'brand'}-offer.pdf`;
 try{if(existsSync(file)&&JSON.parse(readFileSync(side,'utf8')).key===key)return {file,bytes:readFileSync(file),name,cached:true,still:Boolean(still)};}catch{}
 const bytes=await personalizeOffer({base:baseFile,company,greetingName,logo,clip:clip?.url?{url:clip.url,still}:null});
 writeFileSync(file,bytes);writeFileSync(side,JSON.stringify({key,at:new Date().toISOString()}));
 return {file,bytes,name,cached:false,still:Boolean(still)};
}
// PNG preview of one page, cached next to the PDF and rebuilt when the PDF is newer.
export function previewPage(pdfFile,page,dpi=110){
 if(!(page>=1&&page<=2&&Number.isInteger(page)))throw Object.assign(Error('Page is 1 or 2'),{status:400});
 const out=pdfFile.replace(/\.pdf$/,`.p${page}.png`);
 try{if(statSync(out).mtimeMs>=statSync(pdfFile).mtimeMs)return readFileSync(out);}catch{}
 const stem=pdfFile.replace(/\.pdf$/,`.tmp${page}`);
 try{execFileSync('pdftoppm',['-png','-r',String(dpi),'-f',String(page),'-l',String(page),'-singlefile',pdfFile,stem],{stdio:'ignore',timeout:30000});}
 catch{throw Object.assign(Error('Could not render the preview (is pdftoppm installed?)'),{status:503});}
 const data=readFileSync(`${stem}.png`);writeFileSync(out,data);try{rmSync(`${stem}.png`);}catch{}
 return data;
}
