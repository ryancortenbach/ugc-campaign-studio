"""Burn caption PNGs (from caps_cyborg.py or caps_khan.py) onto a video, each shown only during its time window.

Usage: python3 burn_captions.py VIDEO.mp4 CAPDIR OUT.mp4
CAPDIR holds cap_NN.png + caps.json. Video is re-encoded (libx264 crf 17), audio copied.
Uses an argument list (no shell), because zsh mangles long filter strings with [labels].
"""
import json, subprocess, sys
video, capdir, out = sys.argv[1:4]
caps = json.load(open(f"{capdir}/caps.json"))
args = ["ffmpeg", "-nostdin", "-loglevel", "error", "-y", "-i", video]
for i in range(len(caps)): args += ["-i", f"{capdir}/cap_{i:02d}.png"]
chain, prev = [], "[0:v]"
for i, (_, s, e) in enumerate(caps):
    lab = f"[o{i}]" if i < len(caps) - 1 else "[vout]"
    chain.append(f"{prev}[{i + 1}:v]overlay=0:0:enable='between(t,{s},{e})'{lab}"); prev = lab
args += ["-filter_complex", ";".join(chain), "-map", "[vout]", "-map", "0:a", "-c:v", "libx264", "-crf", "17",
         "-preset", "medium", "-pix_fmt", "yuv420p", "-c:a", "copy", "-movflags", "+faststart", out]
subprocess.run(args, check=True); print("wrote", out)
