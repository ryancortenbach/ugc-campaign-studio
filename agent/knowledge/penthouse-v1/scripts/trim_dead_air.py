"""Find dead-air gaps in a joined video so they can be cut (Ryan: "cut the clips so dead sound isn't all there").

Usage:
  python3 trim_dead_air.py VIDEO.mp4                      # list gaps >= 0.25 s and the camera cuts
  python3 trim_dead_air.py VIDEO.mp4 OUT.mp4 KEEP.json    # cut: KEEP.json = [[start, end], ...] ranges to keep

How it was done on the penthouse video (26.0 s -> 23.1 s):
- Leave about 0.08 to 0.15 s of air on each side of every gap so speech never gets clipped.
- Prefer cutting where a camera cut already happens (hidden). Jump cuts at clip joins are acceptable.
- Never cut inside an action (the 0.36 s while the bag is lowered onto the table was kept on purpose).
- Each kept range gets an 8 ms audio fade in/out so joins do not click.
"""
import json, subprocess, sys, numpy as np
v = sys.argv[1]
if len(sys.argv) == 2:
    sr = 16000
    x = np.frombuffer(subprocess.run(["ffmpeg", "-nostdin", "-loglevel", "error", "-i", v, "-ac", "1", "-ar", str(sr), "-f", "s16le", "-"],
                                     capture_output=True).stdout, np.int16).astype(np.float32) / 32768
    hop, win = 160, 480
    db = np.array([20 * np.log10(np.sqrt((x[i:i + win] ** 2).mean()) + 1e-9) for i in range(0, len(x) - win, hop)])
    thr = np.percentile(db, 90) - 28; q = db < thr; i = 0
    print(f"speech ~{np.percentile(db, 90):.1f} dB, silence below {thr:.1f} dB")
    while i < len(q):
        if q[i]:
            j = i
            while j < len(q) and q[j]: j += 1
            s, e = i * hop / sr, (j * hop + win) / sr
            if e - s >= 0.25: print(f"dead air {s:6.2f} - {e:6.2f} ({e - s:.2f}s)")
            i = j
        else: i += 1
    cuts = subprocess.run(["ffmpeg", "-nostdin", "-i", v, "-vf", "select='gt(scene,0.25)',showinfo", "-an", "-f", "null", "-"],
                          capture_output=True, text=True).stderr
    print("camera cuts:", " ".join(f"{float(t):.2f}" for t in __import__("re").findall(r"pts_time:([0-9.]+)", cuts)))
else:
    out, keep = sys.argv[2], json.load(open(sys.argv[3])); parts, labels = [], ""
    for i, (s, e) in enumerate(keep):
        d = e - s
        parts.append(f"[0:v]trim=start={s}:end={e},setpts=PTS-STARTPTS[v{i}]")
        parts.append(f"[0:a]atrim=start={s}:end={e},asetpts=PTS-STARTPTS,afade=t=in:d=0.008,afade=t=out:st={d - 0.008:.3f}:d=0.008[a{i}]")
        labels += f"[v{i}][a{i}]"
    parts.append(f"{labels}concat=n={len(keep)}:v=1:a=1[v][a]")
    subprocess.run(["ffmpeg", "-nostdin", "-loglevel", "error", "-y", "-i", v, "-filter_complex", ";".join(parts), "-map", "[v]", "-map", "[a]",
                    "-c:v", "libx264", "-crf", "17", "-r", "24", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
                    "-movflags", "+faststart", out], check=True)
    print("wrote", out)
