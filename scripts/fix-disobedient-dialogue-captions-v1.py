#!/usr/bin/env python3
"""Replace product overlays with the original spoken subtitles and rebuild the full ad."""
from pathlib import Path
from datetime import datetime, timezone
import json, runpy, hashlib, os
from PIL import Image
ROOT=Path(__file__).resolve().parents[1];W=ROOT/'work/disobedient-dialogue-captions-v1';W.mkdir(exist_ok=True)
PUB=ROOT/'agent/public/streetwear-demo-assets';OLD=ROOT/'work/disobedient-full-ad-v1'
H=runpy.run_path(str(ROOT/'scripts/finish-streetwear-pilots-v1.py'));run,probe,hashes=H['run'],H['probe'],H['frame_hashes']
SOURCE=PUB/'disobedient-garment-review-v3.mp4';SAMPLE=PUB/'disobedient-outreach-sample-v5.mp4';FINAL=PUB/'disobedient-full-ad-30s-v2.mp4';RECEIPT=W/'receipt-v1.json'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
if RECEIPT.exists():
 r=json.loads(RECEIPT.read_text())
 if sha(SAMPLE)!=r['sampleSha256'] or sha(FINAL)!=r['finalSha256']:raise RuntimeError('Published captions changed.')
 print(json.dumps({'status':'already_finished','sample':r['sampleUrl'],'final':r['url']}));raise SystemExit(0)
if SAMPLE.exists() or FINAL.exists():raise RuntimeError('Existing output will not be overwritten.')
chunksFile=ROOT/'agent/knowledge/penthouse-v1/references/examples/chunks_khan_penthouse.json'
chunks=[c for c in json.loads(chunksFile.read_text()) if c[1]<6]
CAPS=runpy.run_path(str(ROOT/'agent/knowledge/penthouse-v1/scripts/caps_khan.py'))
capdir=W/'captions';CAPS['build'](chunks,str(capdir));captions=json.loads((capdir/'caps.json').read_text())
frames=W/'frames';frames.mkdir(exist_ok=True);blank=W/'blank.png';Image.new('RGBA',(720,1280),(0,0,0,0)).save(blank)
for frame in range(180):
 t=frame/30;chosen=next((i for i,(_,start,end) in enumerate(captions) if start<=t<min(end,6)),None)
 source=capdir/f'cap_{chosen:02d}.png' if chosen is not None else blank
 target=frames/f'{frame:04d}.png'
 if not target.exists():os.link(source,target)
candidate=W/'sample-candidate-v5.mp4'
if not candidate.exists():run(['-v','error','-n','-i',SOURCE,'-framerate','30','-i',str(frames/'%04d.png'),'-filter_complex','[0:v][1:v]overlay=0:0:shortest=1[v]','-map','[v]','-map','0:a:0','-c:v','libx264','-crf','6','-preset','slow','-profile:v','high','-pix_fmt','yuv420p','-bf','0','-r','30','-frames:v','180','-c:a','copy','-t','6','-movflags','+faststart',candidate])
if len(hashes(candidate))!=180 or probe(candidate)['duration']!=6:raise RuntimeError('Sample timing changed.')
def audio_packets(file):return run(['-v','error','-i',file,'-map','0:a:0','-c:a','copy','-f','adts','-'],binary=True).stdout
if audio_packets(SOURCE)!=audio_packets(candidate):raise RuntimeError('Spoken audio changed while adding subtitles.')
print('CAPTIONS: spoken text rendered; all source audio packets unchanged',flush=True)
parts=[candidate,OLD/'middle-a-normalized-v1.mp4',OLD/'middle-b-normalized-v1.mp4',OLD/'product-front-v1.mp4',OLD/'product-back-v1.mp4']
concat=W/'concat-v2.txt';concat.write_text(''.join(f"file '{p}'\n" for p in parts));joined=W/'joined-v2.mp4'
if not joined.exists():run(['-v','error','-n','-f','concat','-safe','0','-i',concat,'-an','-c:v','copy',joined])
expected=sum((hashes(p) for p in parts),[])
if len(expected)!=900 or hashes(joined)!=expected:raise RuntimeError('Subtitle update altered the joined picture sequence.')
full=W/'full-candidate-v2.mp4';prior=PUB/'disobedient-full-ad-30s-v1.mp4'
if not full.exists():run(['-v','error','-n','-i',joined,'-i',prior,'-map','0:v:0','-map','1:a:0','-c','copy','-t','30','-movflags','+faststart',full])
if len(hashes(full))!=900 or hashes(full)!=expected or abs(probe(full)['duration']-30)>.04:raise RuntimeError('Full ad failed decoded frame verification.')
if audio_packets(prior)!=audio_packets(full):raise RuntimeError('Full ad audio packets changed.')
SAMPLE.hardlink_to(candidate);FINAL.hardlink_to(full)
old=json.loads((OLD/'final-receipt-v1.json').read_text())
r={**old,'createdAt':datetime.now(timezone.utc).isoformat(),'url':'/streetwear-demo-assets/'+FINAL.name,'finalSha256':sha(FINAL),'sampleUrl':'/streetwear-demo-assets/'+SAMPLE.name,'sampleSha256':sha(SAMPLE),'sampleSeconds':6,'textIsDialogueTranscription':True,'captionSource':str(chunksFile.relative_to(ROOT)),'captions':[{ 'text':t,'start':s,'end':min(e,6)}for t,s,e in captions],'sourceAudioPacketsUnchanged':True,'laterScenesUnchanged':True,'newProviderCalls':0,'supersedes':'/streetwear-demo-assets/disobedient-full-ad-30s-v1.mp4'}
RECEIPT.write_text(json.dumps(r,indent=2)+'\n');print(json.dumps(r))
