#!/usr/bin/env python3
"""Add timed product text to the saved outreach sample. No provider calls."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
from datetime import datetime,timezone
import json,runpy,hashlib
ROOT=Path(__file__).resolve().parents[1]
WORK=ROOT/'work/campaign-demo-v1'
PUB=ROOT/'agent/public/streetwear-demo-assets'
H=runpy.run_path(str(ROOT/'scripts/finish-streetwear-pilots-v1.py'))
run,probe,hashes=H['run'],H['probe'],H['frame_hashes']
SOURCE=PUB/'disobedient-garment-review-v3.mp4'
SAMPLE=PUB/'disobedient-outreach-sample-v4.mp4'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
receipt_file=WORK/'disobedient-text-and-final-receipt-v1.json'
if receipt_file.exists():
 old=json.loads(receipt_file.read_text())
 if sha(SAMPLE)!=old['sampleSha256']:raise RuntimeError('Existing demo output changed.')
 print(json.dumps({'status':'already_built','sample':str(SAMPLE)}));raise SystemExit(0)
if SAMPLE.exists():raise RuntimeError('Existing output will not be overwritten.')
WORK.mkdir(exist_ok=True)
texts=[('DISOBEDIENT',0,2),('LOW LIVES HOODIE',2,4),('SHOP DISOBEDIENTNYC.COM',4,6)]
bounds=[]
for i,(text,start,end) in enumerate(texts):
 image=Image.new('RGBA',(720,1280),(0,0,0,0));draw=ImageDraw.Draw(image);size=43
 while True:
  font=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf',size)
  box=draw.textbbox((0,0),text,font=font,stroke_width=2)
  if box[2]-box[0]<=624:break
  size-=1
 x=(720-(box[2]-box[0]))/2-box[0];y=1060-box[1]
 draw.text((x+1,y+3),text,font=font,fill=(0,0,0,170),stroke_width=3,stroke_fill=(0,0,0,170))
 draw.text((x,y),text,font=font,fill=(255,255,255,255),stroke_width=2,stroke_fill=(0,0,0,190))
 image.save(WORK/f'disobedient-caption-{i}-v1.png')
 bounds.append({'text':text,'start':start,'end':end,'fontSize':size,'bounds':[round(x+box[0]),1060,round(x+box[2]),round(y+box[3])]})
args=['-v','error','-n','-i',SOURCE]
for i in range(3):args+=['-loop','1','-i',WORK/f'disobedient-caption-{i}-v1.png']
filters="[0:v][1:v]overlay=0:0:enable='gte(t,0)*lt(t,2)'[a];[a][2:v]overlay=0:0:enable='gte(t,2)*lt(t,4)'[b];[b][3:v]overlay=0:0:enable='gte(t,4)*lt(t,6)'[v]"
args+=['-filter_complex',filters,'-map','[v]','-map','0:a:0','-c:v','libx264','-crf','6','-preset','slow','-profile:v','high','-pix_fmt','yuv420p','-bf','0','-r','30','-c:a','copy','-t','6','-movflags','+faststart',WORK/'sample-candidate-v4.mp4']
if not (WORK/'sample-candidate-v4.mp4').exists():run(args)
sample_candidate=WORK/'sample-candidate-v4.mp4'
if probe(sample_candidate)['duration']!=6 or len(hashes(sample_candidate))!=180:raise RuntimeError('Captioned sample has invalid timing.')
def audio_packets(file):return run(['-v','error','-i',file,'-map','0:a:0','-c:a','copy','-f','adts','-'],binary=True).stdout
if audio_packets(SOURCE)!=audio_packets(sample_candidate):raise RuntimeError('Sample audio packets changed during text overlay.')
SAMPLE.hardlink_to(sample_candidate)
receipt={'createdAt':datetime.now(timezone.utc).isoformat(),'sourceSha256':sha(SOURCE),'sampleUrl':'/streetwear-demo-assets/'+SAMPLE.name,'sampleSha256':sha(SAMPLE),'sampleSeconds':6,'timedProductText':bounds,'textIsDialogueTranscription':False,'sampleAudioPacketsUnchanged':True,'finalAdStatus':'Thirty-second version is being built separately.','newProviderCalls':0,'humanApproval':False,'sends':0}
receipt_file.write_text(json.dumps(receipt,indent=2)+'\n');print(json.dumps(receipt))
