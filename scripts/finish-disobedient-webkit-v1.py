#!/usr/bin/env python3
"""Flatten the existing completed ad into one H.264 stream for native WebKit playback."""
from pathlib import Path
import subprocess,json,re,hashlib
from datetime import datetime,timezone
ROOT=Path(__file__).resolve().parents[1];W=ROOT/'work/disobedient-webkit-v1';FF=ROOT/'ops/node_modules/ffmpeg-static/ffmpeg';SRC=ROOT/'agent/public/streetwear-demo-assets/disobedient-full-ad-30s-v2.mp4';CAND=W/'full-ad-candidate-v3b.mp4';OUT=ROOT/'agent/public/streetwear-demo-assets/disobedient-full-ad-30s-v3.mp4';RECEIPT=W/'receipt-v1.json'
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def run(args):
 p=subprocess.run([str(FF),'-hide_banner','-nostdin',*map(str,args)],capture_output=True)
 if p.returncode:raise RuntimeError(p.stderr.decode(errors='replace')[-3000:])
 return p
if RECEIPT.exists():
 r=json.loads(RECEIPT.read_text())
 if sha(OUT)!=r['finalSha256']:raise RuntimeError('Published WebKit media changed.')
 print(json.dumps(r));raise SystemExit(0)
if not CAND.exists():run(['-v','error','-n','-i',SRC,'-vf','setsar=1,fps=30,tpad=stop_mode=clone:stop_duration=0.1,trim=end_frame=900','-c:v','libx264','-preset','medium','-crf','12','-profile:v','high','-level:v','3.1','-pix_fmt','yuv420p','-bf','0','-refs','3','-g','60','-keyint_min','60','-sc_threshold','0','-frames:v','900','-c:a','copy','-movflags','+faststart',CAND])
frame=run(['-v','error','-i',CAND,'-map','0:v:0','-an','-f','framemd5','-']);count=sum(1 for l in frame.stdout.splitlines()if l and not l.startswith(b'#'))
if count!=900 or frame.stderr:raise RuntimeError('Flattened video failed 900-frame decode.')
info=subprocess.run([str(FF),'-hide_banner','-i',str(CAND)],capture_output=True).stderr.decode();
if '00:00:30.00' not in info or '720x1280' not in info or '30 fps' not in info:raise RuntimeError('Output dimensions or duration differ.')
def audio(p):return run(['-v','error','-i',p,'-map','0:a:0','-c:a','copy','-f','adts','-']).stdout
if audio(SRC)!=audio(CAND):raise RuntimeError('Audio packets changed.')
s=run(['-v','info','-i',SRC,'-i',CAND,'-filter_complex','[0:v][1:v]ssim','-an','-f','null','-']).stderr.decode();similarity=float(re.search(r'All:([\d.]+)',s).group(1))
if similarity<.99:raise RuntimeError('Re-encode quality falls below the 0.99 SSIM threshold.')
def configs(p):
 b=run(['-v','error','-i',p,'-map','0:v:0','-c:v','copy','-bsf:v','h264_mp4toannexb','-f','h264','-']).stdout
 return len({n for n in re.split(b'\x00\x00\x00\x01|\x00\x00\x01',b)if n and n[0]&31==7})
old,new=configs(SRC),configs(CAND)
if new!=1:raise RuntimeError('Flattened video still changes H.264 sequence parameters.')
if OUT.exists():raise RuntimeError('Prior output will not be overwritten.')
OUT.hardlink_to(CAND)
r={'createdAt':datetime.now(timezone.utc).isoformat(),'url':'/streetwear-demo-assets/'+OUT.name,'finalSha256':sha(OUT),'sourceUrl':'/streetwear-demo-assets/'+SRC.name,'sourceSha256':sha(SRC),'durationSeconds':30,'frames':900,'dimensions':[720,1280],'fps':30,'ssimToSource':similarity,'audioPacketsUnchanged':True,'sourceUniqueH264SequenceParameters':old,'outputUniqueH264SequenceParameters':new,'profile':'H.264 High level 3.1, yuv420p, SAR 1:1','reason':'Native player turned black at the join from the character to independently encoded product cards. Re-encode as one continuous decoder configuration.','newProviderCalls':0,'humanApproval':False}
RECEIPT.write_text(json.dumps(r,indent=2)+'\n');print(json.dumps(r))
