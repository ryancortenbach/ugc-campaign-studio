"""Put a music bed under a finished video the way Ryan approved it (PS2 penthouse FINAL_v4, 2026-10-19).

Usage: python3 mix_music.py VIDEO.mp4 SONG.(m4a|mp3|wav) OUT.mp4 [--start 0.86] [--gain -17.24] [--out-gain -2.1]

- VIDEO voice track should already be loudness-normalised (about -14 LUFS), as the joined clips are.
- --start  : where in the song to begin (Khan's reels start the GLM-RST preview at 0.86 s).
- --gain   : music gain in dB. History: -14.5 (8 LU under voice, Khan's measured gap) was "can't hear it";
             -11.0 (4.5 LU under) was audible; Ryan then asked for 35 % then 25 % quieter -> -17.24 dB = final.
             "X % quieter" means amplitude x (1 - X/100): add 20*log10(1 - X/100) dB to --gain.
- --out-gain: master trim so the voice level stays where it was (-2.1 dB matched v2's voice exactly).
Music fades in 0.15 s and out over the last 1.2 s. A limiter at 0.84 keeps true peaks under about -1.5 dB.
"""
import argparse, subprocess
p = argparse.ArgumentParser()
p.add_argument("video"); p.add_argument("song"); p.add_argument("out")
p.add_argument("--start", type=float, default=0.86); p.add_argument("--gain", type=float, default=-17.24)
p.add_argument("--out-gain", type=float, default=-2.1)
a = p.parse_args()
dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", a.video],
                           capture_output=True, text=True).stdout)
fc = (f"[1:a]atrim=0:{dur},asetpts=PTS-STARTPTS,aresample=48000,volume={a.gain}dB,afade=t=in:d=0.15,"
      f"afade=t=out:st={dur - 1.2:.2f}:d=1.2[m];[0:a]aresample=48000[vo];"
      f"[vo][m]amix=inputs=2:normalize=0:duration=first,volume={a.out_gain}dB,alimiter=limit=0.84,aresample=48000[a]")
subprocess.run(["ffmpeg", "-nostdin", "-loglevel", "error", "-y", "-i", a.video, "-ss", str(a.start), "-i", a.song,
                "-filter_complex", fc, "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
                "-movflags", "+faststart", a.out], check=True)
print("wrote", a.out)
