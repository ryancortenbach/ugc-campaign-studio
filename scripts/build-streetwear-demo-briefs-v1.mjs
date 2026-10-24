#!/usr/bin/env node
// Local research/creative briefs. Requires Python reportlab and PyMuPDF.
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const python=String.raw`
import json, hashlib, re
from pathlib import Path
from xml.sax.saxutils import escape
import fitz
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.utils import ImageReader

root=Path.cwd();assets=root/'agent/public/streetwear-demo-assets';qa=root/'work/streetwear-brief-qa-v1'
qa.mkdir(parents=True,exist_ok=True)
verified=json.loads((root/'research_notes/streetwear-demo-v1/verified-sources-v1.json').read_text())
pdfmetrics.registerFont(TTFont('Arial','/System/Library/Fonts/Supplemental/Arial.ttf'))
pdfmetrics.registerFont(TTFont('ArialBold','/System/Library/Fonts/Supplemental/Arial Bold.ttf'))
pdfmetrics.registerFontFamily('Arial',normal='Arial',bold='ArialBold',italic='Arial',boldItalic='ArialBold')
ink=HexColor('#17212b');muted=HexColor('#54616c');green=HexColor('#26634e');wash=HexColor('#f1f5f3')
body=ParagraphStyle('body',fontName='Arial',fontSize=10.2,leading=14,textColor=ink,spaceAfter=0)
small=ParagraphStyle('small',parent=body,fontSize=8.3,leading=11,textColor=muted)
left=48;width=516
receipts=[]

def para(c,text,y,w=width,x=left,style=body):
    p=Paragraph(text,style);_,h=p.wrap(w,1000)
    assert y-h>=45, f'Content would overflow page at {text[:50]}'
    p.drawOn(c,x,y-h);return y-h
def heading(c,text,y):
    c.setFillColor(ink);c.setFont('ArialBold',12);c.drawString(left,y-12,text);return y-22
def footer(c,brand,page):
    c.setFont('Arial',8);c.setFillColor(muted);c.drawString(left,30,f'{brand} / research + creative demo / 24 Oct 2026')
    c.drawRightString(564,30,f'{page} / 2')
def top(c,name,subtitle):
    c.setFillColor(green);c.setFont('ArialBold',8);c.drawString(left,750,'MINT LABS / DEMO BRIEF / HUMAN REVIEW PENDING')
    c.setFillColor(ink);c.setFont('ArialBold',27);c.drawString(left,712,name)
    c.setFillColor(muted);c.setFont('Arial',11);c.drawString(left,690,subtitle)
    return 665
def photo(c,file,x,y,w,h,label,url=None):
    c.setFillColor(wash);c.roundRect(x,y-h,w,h,6,fill=1,stroke=0)
    reader=ImageReader(str(assets/file));iw,ih=reader.getSize();scale=min(w/iw,h/ih)
    dw,dh=iw*scale,ih*scale
    c.drawImage(reader,x+(w-dw)/2,y-h+(h-dh)/2,dw,dh,mask='auto')
    if url:c.linkURL(url,(x,y-h,x+w,y),relative=0,thickness=0)
    para(c,escape(label),y-h-7,w=w,x=x,style=small)
def url_line(c,label,url,y):
    return para(c,f'<a href="{escape(url)}" color="#245b8e"><u>{escape(label)}</u></a>',y,style=small)

for brand in verified['brands']:
    name=brand['name'];slug='disobedient' if name=='Disobedient' else 'vylin';is_dis=slug=='disobedient'
    product=brand['selected_demo_product'];site=brand['exact_domain'];product_url=product['product_url']
    file=assets/f'{slug}-brief-v1.pdf'
    c=canvas.Canvas(str(file),pagesize=(612,792),pageCompression=1,invariant=1)
    c.setTitle(f'{name}: two-page ICP and creative brief');c.setAuthor('Ryan Cortenbach / Mint Labs')
    c.setSubject('Research demo. Original London character, official hoodie references and brand website CTA. No paid render or outbound message.')
    y=top(c,name,'1. Sourced research and proposed ICP')
    y=heading(c,'Verified brand and product',y)
    position=brand['official_positioning']
    y=para(c,escape(position),y)-9
    y=para(c,f'<b>Proposed hero:</b> {escape(product["name"])}. Official display: {escape(product["displayed_price"])}. '+('Currency code was not separately verified.' if is_dis else 'Price is a listing, not a verified current checkout offer.'),y)-8
    vendor='; '.join(product['vendor_claims']).replace('cotton,2%','cotton, 2%').replace('10oz3-end','10oz 3-end').replace('poly,100%','poly, 100%')
    y=para(c,'<b>Vendor describes:</b> '+escape(vendor)+'. Stock and per-variant availability remain untested.',y)-9
    y=heading(c,'Research performed',y)
    searches=[]
    for area in ['brand','audience','creators','formats']:
        result=json.loads((root/f'work/streetwear-demo-v1/{slug}-{area}.json').read_text())
        assert result['brandId']==slug
        searches.append({'section':area,'query':result['query'],'results':len(result['results']),'provider':result.get('provider'),'tool':result.get('tool'),'startedAt':result.get('startedAt'),'completedAt':result.get('completedAt')})
    counts=', '.join(f'{s["section"]}: {s["results"]}' for s in searches)
    y=para(c,'Four completed Exa searches: '+escape(counts)+'. The full recorded query/result history is retained in the demo. Search candidates are not verified brand or creator facts.',y)-8
    y=para(c,'Official site and product sources establish the findings above. No individual social post or Meta ad was verified. No creator views, conversion rates or current paid-media performance are claimed.',y)-12
    y=heading(c,'ICP: hypotheses to test',y)
    audience='Adult UK/London streetwear shoppers who enjoy graphic hoodies, music and game-inspired short-form culture. This is a proposed demo audience, not the NYC brand\'s measured audience.'
    y=para(c,'<b>End user:</b> '+escape(audience),y)-8
    angle='Minimal front, expressive music-lettering back: a reveal that rewards a second look.' if is_dis else 'A restrained front mark and larger music-themed back graphic: a wearable statement with a clear visual contrast.'
    y=para(c,'<b>Creative hypothesis:</b> '+escape(angle)+' <b>Need to test:</b> whether the game-world presenter and real garment insert earn attention and product-page interest.',y)-8
    y=para(c,'<b>Buyer hypothesis:</b> founder or creative/growth operator seeking fresh apparel concepts. Founder identity, buying intent, customer age mix, revenue, sales and ad budget remain unknown. No paid-client relationship is established.',y)-12
    y=heading(c,'Source links and limits',y)
    y=url_line(c,'Official brand website',site,y)-4
    y=url_line(c,'Selected hoodie: exact official product page',product_url,y)-4
    extra=next((s['url'] for s in brand['sources'] if s['kind']=='official_about'),next(s['url'] for s in brand['sources'] if s['kind']=='official_collection')) if is_dis else next(s['url'] for s in brand['sources'] if s['kind']=='official_about')
    y=url_line(c,'Official collection / brand context',extra,y)-7
    y=para(c,'Product photos on page 2 are official ecommerce references, not ad screenshots or generated samples. Public social links do not prove audience demographics. Brand signoff and asset-use permission remain pending.',y,style=small)
    footer(c,name,1);c.showPage()

    y=top(c,name,'2. Existing London character and 8-second creative plan')
    y=para(c,'Reuse the historical adult PS2 penthouse presenter: blond braids, warm-brown skin, tan chair and London dusk skyline. Keep face, body, trousers, scene, camera and source performance consistent. The image below is an existing source frame, not a new branded output.',y)-13
    image_y=y
    if is_dis:
        specs=[('original-london-character-1s.jpg',48,112,'Historical character',None),('disobedient-hoodie-front.jpg',172,112,'Official front',product_url),('disobedient-hoodie-back.jpg',296,112,'Official back',product_url),('disobedient-hoodie-model.jpg',420,144,'Official on-body fit',product_url)]
    else:
        specs=[('original-london-character-1s.jpg',48,144,'Historical character',None),('vylin-hoodie-front.jpg',210,168,'Official front',product_url),('vylin-hoodie-back.jpg',396,168,'Official back',product_url)]
    for image_file,x,w,label,url in specs:photo(c,image_file,x,image_y,w,164,label,url)
    y=image_y-194
    garment='Grey pullover with blank visible front and kangaroo pocket. Blue lettering and red musical staff belong on the back. Do not add a zipper or move the back print onto the chest.' if is_dis else 'Black zip hoodie. Preserve the cream left-chest globe/leaf mark and the large cream back headphones/leaf design. Keep zipper, cuffs and graphic placement faithful to the actual product.'
    y=para(c,'<b>Garment lock:</b> '+escape(garment),y)-10
    y=heading(c,'8-second edit: proposed overlay script',y)
    hook='Quiet front. Loud back.' if is_dis else 'Headphones on. World off.'
    shots=[('0-2 sec','Keep original seated character and camera. Repair the visible top only.',hook),('2-6 sec','Retain source performance. Use a genuine official rear-product still as a separately edited insert; do not invent a new body turn.',product['name']),('6-8 sec','Add a clean two-second website end card after the six-second repair. Remove any Mint Labs payment/checkout destination.','Explore '+('disobedientnyc.com' if is_dis else 'wearvylin.com'))]
    for timing,action,line in shots:
        y=para(c,f'<b>{timing}</b> / {escape(action)}<br/><font color="#26634e">Overlay: {escape(line)}</font>',y)-8
    y=url_line(c,'Website CTA: '+site,site,y)-5
    y=url_line(c,'Product destination: '+product_url,product_url,y)-8
    y=heading(c,'Generation boundary and review',y)
    y=para(c,'Genjutsu Light processes the first 15 source seconds and preserves source audio. The available generic pilot is six seconds; the eight-second edit adds a two-second end card. Overlay copy above is not new speech. Brand-name dialogue needs separate approved voice/lip-sync work. No new apparel render has been submitted.',y,style=small)-6
    y=para(c,'Check every frame for identity, hands, fabric, graphics and occlusion. A human must watch the full edit with sound and verify the exact website destination. Official product images are references, not proof of perfect AI garment reproduction.',y,style=small)-5
    y=url_line(c,'Official Genjutsu Light input/audio/15-second documentation','https://open.higgsfield.ai/models/higgsfield/genjutsu-light/object-swap/v1.0/api-reference',y)
    footer(c,name,2);c.save()

    doc=fitz.open(file);assert len(doc)==2
    text=' '.join(page.get_text() for page in doc)
    assert '\u2014' not in text and '{{' not in text and 'Award Scholar' not in text and 'Waddle' not in text
    links=[link['uri'] for page in doc for link in page.get_links() if link.get('uri')]
    assert site in links and product_url in links
    assert not any('checkout' in link or 'mintlabs' in link.lower() or 'whop.com' in link for link in links)
    previews=[]
    for number,page in enumerate(doc,1):
        public=assets/f'{slug}-brief-v1-page-{number}.png'
        page.get_pixmap(matrix=fitz.Matrix(1.5,1.5),alpha=False).save(public)
        previews.append(str(public.relative_to(root)))
    receipts.append({'brand':name,'pdf':str(file.relative_to(root)),'pages':len(doc),'sha256':hashlib.sha256(file.read_bytes()).hexdigest(),'links':len(links),'websiteCta':site,'productUrl':product_url,'previews':previews,'researchSearches':searches,'renderSubmitted':False,'sent':False})
    doc.close()
(qa/'receipt.json').write_text(json.dumps(receipts,indent=2)+'\n')
print(json.dumps([{k:v for k,v in row.items() if k!='researchSearches'} for row in receipts],indent=2))
`;
const result=spawnSync(process.env.PYTHON||'python3',['-c',python],{cwd:root,stdio:'inherit'});
if(result.error)throw result.error;
process.exitCode=result.status??1;
