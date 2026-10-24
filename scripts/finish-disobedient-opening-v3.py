#!/usr/bin/env python3
"""Join the one repaired opening to the preserved ending. No provider calls."""
import hashlib
import json
import re
import numpy as np
import runpy
from pathlib import Path
from datetime import datetime, timezone

ROOT=Path(__file__).resolve().parents[1]
helpers=runpy.run_path(str(ROOT/'scripts/finish-streetwear-pilots-v1.py'))
run,probe,frame_hashes,audio_check=[helpers[k] for k in ('run','probe','frame_hashes','audio_check')]
WORK=ROOT/'work/streetwear-demo-v1'
FOLDER=WORK/'opening-finish-v3c'
FOLDER.mkdir(exist_ok=True)
RAW=WORK/'disobedient-opening-raw-v3.mp4'
ORIGINAL=WORK/'disobedient-genjutsu-raw-v1.mp4'
SOURCE=ROOT/'agent/public/streetwear-demo-assets/generic-source-6s-v1.mp4'
FINAL=ROOT/'agent/public/streetwear-demo-assets/disobedient-garment-review-v3.mp4'
RECEIPT=WORK/'disobedient-opening-finish-receipt-v3.json'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
if FINAL.exists() and RECEIPT.exists():
    prior=json.loads(RECEIPT.read_text())
    if prior.get('finalSha256')!=sha(FINAL):raise RuntimeError('Published repair changed. Reconcile before proceeding.')
    print(json.dumps({'status':'already_finished','receipt':str(RECEIPT.relative_to(ROOT))}))
    raise SystemExit(0)
if FINAL.exists():raise RuntimeError('Existing output has no receipt. It will not be overwritten.')
raw_meta=probe(RAW)
if (raw_meta['width'],raw_meta['height'],raw_meta['fps'])!=(720,1280,30.0):raise RuntimeError('Provider settings differ from the preserved tail. Local adaptation required.')
raw_before,original_before=sha(RAW),sha(ORIGINAL)
new_hashes,old_hashes=frame_hashes(RAW),frame_hashes(ORIGINAL)
if len(new_hashes)<165 or len(old_hashes)!=180:raise RuntimeError('Provider/source frame counts cannot form the intended 165+15 frame join.')
opening=FOLDER/'repaired-first-165-frames-v3.mp4'
tail=FOLDER/'preserved-last-15-frames-v3.mp4'
if not opening.exists():run(['-v','error','-n','-i',RAW,'-map','0:v:0','-frames:v','165','-an','-c:v','libx264','-crf','6','-preset','slow','-profile:v','high','-pix_fmt','yuv420p','-bf','0','-movflags','+faststart',opening])
if not tail.exists():run(['-v','error','-n','-ss','5.5','-i',ORIGINAL,'-map','0:v:0','-an','-c:v','copy','-movflags','+faststart',tail])
opening_hashes=frame_hashes(opening)
if len(opening_hashes)!=165:raise RuntimeError('Opening encoding has the wrong frame count.')
# Arbitrary stream-copy cuts can omit future reference pictures for B-frames.
# Encode the opening once, then keep the original ending stream untouched.
quality=run(['-v','info','-i',RAW,'-i',opening,'-filter_complex','[0:v]trim=end_frame=165,setpts=PTS-STARTPTS[a];[1:v]setpts=PTS-STARTPTS[b];[a][b]ssim','-an','-f','null','-'])
match=re.search(r'All:([0-9.]+)',quality.stderr)
ssim=float(match[1]) if match else 0
if ssim<.995:raise RuntimeError(f'Opening re-encode changed provider pictures too much: SSIM {ssim}')
if frame_hashes(tail)!=old_hashes[165:]:raise RuntimeError('Tail trim changed original ending frames.')
concat=FOLDER/'concat-v3.txt'
concat.write_text("file 'repaired-first-165-frames-v3.mp4'\nfile 'preserved-last-15-frames-v3.mp4'\n")
joined=FOLDER/'joined-video-only-v3.mp4'
if not joined.exists():run(['-v','error','-n','-f','concat','-safe','0','-i',concat,'-map','0:v:0','-an','-c:v','copy','-movflags','+faststart',joined])
candidate=FOLDER/'garment-review-candidate-v3.mp4'
if not candidate.exists():run(['-v','error','-n','-i',joined,'-i',SOURCE,'-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','aac','-b:a','192k','-ar','48000','-t','6','-movflags','+faststart',candidate])
expected=opening_hashes+old_hashes[165:]
final_hashes=frame_hashes(candidate)
if final_hashes!=expected:raise RuntimeError('Joined decode differs from repaired opening plus the unchanged ending.')
meta=probe(candidate)
if abs(meta['duration']-6)>.04:raise RuntimeError('Joined video is not six seconds.')
x,y=helpers['pcm'](SOURCE),helpers['pcm'](candidate)
n=min(len(x),len(y),6*48000)
if n<5.9*48000:raise RuntimeError('Source or restored speech is too short.')
x,y=x[:n],y[:n]
rms=float(np.sqrt(np.mean(y*y)))
coefficient=float(np.corrcoef(x,y)[0,1])
nfft=1<<(2*n-1).bit_length()
correlation=np.fft.irfft(np.fft.rfft(y,nfft)*np.conj(np.fft.rfft(x,nfft)),nfft)
lags=np.arange(-24000,24001)
lag=int(lags[np.argmax(correlation[np.mod(lags,nfft)])])
if rms<.0001 or coefficient<.99 or lag!=0:raise RuntimeError('Restored speech is silent or misaligned.')
audio={'sampleRate':48000,'comparedSamples':n,'peakLagSamples':lag,'zeroLagCorrelation':coefficient,'rms':rms,'containsCTA':False}
if sha(RAW)!=raw_before or sha(ORIGINAL)!=original_before:raise RuntimeError('An input changed during finishing.')
FINAL.hardlink_to(candidate)
receipt={'version':3,'createdAt':datetime.now(timezone.utc).isoformat(),'mediaChecksPassed':True,'finalUrl':'/streetwear-demo-assets/disobedient-garment-review-v3.mp4','finalSha256':sha(FINAL),'durationSeconds':6,'dimensions':[720,1280],'fps':30,'totalFrames':180,'repairedOpeningFrames':165,'preservedEndingFrames':15,'generatedOpeningReencodedOnce':True,'openingSSIMToProvider':ssim,'joinedOpeningFrameHashesUnchanged':True,'originalEndingFrameHashesUnchanged':True,'sourceInputsUnchanged':True,'audio':audio,'containsCTA':False,'humanApproval':False,'visualReview':'Separate visual review required. Media checks do not establish garment consistency.','sends':0}
RECEIPT.write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({'status':'media_checks_passed','receipt':str(RECEIPT.relative_to(ROOT)),'video':str(FINAL.relative_to(ROOT))}))
