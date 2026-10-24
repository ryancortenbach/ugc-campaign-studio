#!/usr/bin/env python3
"""Assemble the authorized complete character ad with a real product and website outro."""
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
from datetime import datetime,timezone
import json,hashlib,runpy,sys,numpy as np
ROOT=Path(__file__).resolve().parents[1];WORK=ROOT/'work/disobedient-full-ad-v1';PUB=ROOT/'agent/public/streetwear-demo-assets'
H=runpy.run_path(str(ROOT/'scripts/finish-streetwear-pilots-v1.py'));run,probe,hashes=H['run'],H['probe'],H['frame_hashes']
FFMPEG=H['FFMPEG'];SOURCE=ROOT/'private-research/penthouse-v1/PS2_penthouse_FINAL_v4.mp4'
FINAL=PUB/'disobedient-full-ad-30s-v1.mp4';RECEIPT=WORK/'final-receipt-v1.json';sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
if FINAL.exists() and RECEIPT.exists():
 r=json.loads(RECEIPT.read_text())
 if sha(FINAL)!=r['finalSha256']:raise RuntimeError('Full ad changed after validation.')
 print(json.dumps({'status':'already_finished','url':r['url']}));raise SystemExit(0)
if FINAL.exists():raise RuntimeError('Existing full ad will not be overwritten.')
prepare_outro='--prepare-outro' in sys.argv
state=json.loads((WORK/'generation-state-v1.json').read_text())
if not prepare_outro and (len(state['jobs'])!=2 or any(j['status']!='completed' for j in state['jobs'])):raise RuntimeError('Both full-ad sections must finish before assembly.')
parts=[]
for name,source,frames in [('opening',PUB/'disobedient-outreach-sample-v4.mp4',180),('middle-a',WORK/'middle-a-raw-v1.mp4',258),('middle-b',WORK/'middle-b-raw-v1.mp4',258)] if not prepare_outro else []:
 m=probe(source)
 if (m['width'],m['height'])!=(720,1280):raise RuntimeError('Full-ad section dimensions differ.')
 target=WORK/f'{name}-normalized-v1.mp4';duration=frames/30
 if not target.exists():run(['-v','error','-n','-i',source,'-vf',f'setpts=PTS-STARTPTS,fps=30,tpad=stop_mode=clone:stop_duration=0.1,trim=end_frame={frames}','-an','-c:v','libx264','-crf','6','-preset','slow','-profile:v','high','-pix_fmt','yuv420p','-bf','0','-r','30','-frames:v',str(frames),target])
 if len(hashes(target))!=frames:raise RuntimeError(f'Wrong frame count in {name}.')
 parts.append(target)
# Render product text independently; source product photographs remain unedited.
image=Image.new('RGBA',(720,1280),(0,0,0,0));draw=ImageDraw.Draw(image)
for text,y,size in [('DISOBEDIENT',105,46),('LOW LIVES HOODIE',970,42),('SHOP THE HOODIE',1050,30),('disobedientnyc.com',1110,31)]:
 font=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf',size);b=draw.textbbox((0,0),text,font=font);x=(720-(b[2]-b[0]))/2-b[0];draw.text((x,y),text,font=font,fill=(12,12,16,255))
overlay=WORK/'product-outro-type-v1.png';image.save(overlay)
for name,photo,frames in [('product-front','disobedient-hoodie-front.jpg',90),('product-back','disobedient-hoodie-back.jpg',114)]:
 target=WORK/f'{name}-v1.mp4'
 if not target.exists():run(['-v','error','-n','-loop','1','-i',PUB/photo,'-loop','1','-i',overlay,'-filter_complex','[0:v]scale=620:620:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:260:color=white[p];[p][1:v]overlay=0:0,setsar=1[v]','-map','[v]','-an','-frames:v',str(frames),'-r','30','-c:v','libx264','-crf','6','-preset','slow','-profile:v','high','-pix_fmt','yuv420p','-bf','0',target])
 if len(hashes(target))!=frames:raise RuntimeError('Product outro has the wrong frame count.')
 parts.append(target)
if prepare_outro:
 print(json.dumps({'status':'product_outro_prepared','parts':[str(p) for p in parts],'finishedAd':False}));raise SystemExit(0)
concat=WORK/'full-ad-concat-v1.txt';concat.write_text(''.join(f"file '{p}'\n" for p in parts))
joined=WORK/'full-ad-video-only-v1.mp4'
if not joined.exists():run(['-v','error','-n','-f','concat','-safe','0','-i',concat,'-an','-c:v','copy',joined])
expected=sum((hashes(p) for p in parts),[])
if len(expected)!=900 or hashes(joined)!=expected:raise RuntimeError('Video join changed a decoded frame or frame count.')
candidate=WORK/'full-ad-candidate-v1.mp4'
if not candidate.exists():run(['-v','error','-n','-i',joined,'-i',SOURCE,'-filter_complex','[1:a]apad=pad_dur=7,atrim=duration=30[a]','-map','0:v:0','-map','[a]','-c:v','copy','-c:a','aac','-b:a','192k','-ar','48000','-t','30','-movflags','+faststart',candidate])
meta=probe(candidate)
if abs(meta['duration']-30)>.04 or len(hashes(candidate))!=900:raise RuntimeError('Final ad is not exactly 30 seconds.')
if hashes(candidate)!=expected:raise RuntimeError('Final mux changed the pictures.')
x,y=H['pcm'](SOURCE),H['pcm'](candidate);n=min(len(x),len(y));coefficient=float(np.corrcoef(x[:n],y[:n])[0,1])
if coefficient<.99:raise RuntimeError('Original full-length audio did not survive finishing.')
FINAL.hardlink_to(candidate)
r={'createdAt':datetime.now(timezone.utc).isoformat(),'url':'/streetwear-demo-assets/'+FINAL.name,'finalSha256':sha(FINAL),'durationSeconds':30,'frames':900,'fps':30,'dimensions':[720,1280],'characterSeconds':23.2,'productOutroSeconds':6.8,'outroStartsAt':23.2,'sourceAudioCorrelation':coefficient,'sourceInputsPreserved':True,'allJoinedFrameHashesVerified':True,'sourceDialoguePreserved':True,'providerTimingPolicy':'Trim the rounded final padding. Keep original frame timing; do not speed up generated footage.','sceneCutAlignmentFile':'scene-cut-alignment-v1.json','productFrontAndBackPhotos':True,'ctaDestination':'https://disobedientnyc.com/products/low-lives-hoodie','ctaDisplayWebsite':'disobedientnyc.com','providerRequests':[j['requestId'] for j in state['jobs']],'humanApproval':False,'sends':0}
RECEIPT.write_text(json.dumps(r,indent=2)+'\n');print(json.dumps(r))
