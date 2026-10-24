Imported historical workflow. Current Mint Labs policy takes precedence: zero provider budget, no paid execution, preserve old versions, and no desktop control. Prices and API routes below describe the October 19 run and may have changed. Use the capability report for current checked contracts.

---
name: ps2-character-video
description: Make a viral PS2-cutscene-style AI character reel (Children of Khan / Luca Maxim / CYBORG tutorial format) end to end - voice clone and voice reference, Seedance 2.5 prompts on Higgsfield with Elements, multi-clip Extend Video, frame-by-frame review, joining and dead-air trimming, captions in the CYBORG (glowing CRT serif) or Children of Khan (white Arial) style, and the creator's music mixed underneath. Use when Ryan asks for a PS2 video, a Seedance/Higgsfield character clip, PS2-style captions, or to copy a PS2 creator's format.
version: 1.0 (2026-10-19)
---

# PS2 character video (v1)

Built on 2026-10-19 making the "Canary Wharf penthouse" reel (23 s, 9:16): guy in a blue "i wonder what i look
like in your eyes" hoodie, girl brings Wingstop, hoodie payoff. Approved final:
`~/Downloads/PS2 Penthouse Setup/PS2_penthouse_FINAL_v4.mp4`. Every file of that run is in that folder.

## Files

| Path | What |
|---|---|
| `references/PS2_VIRAL_SOP.pdf` | CYBORG's SOP. Paste into ChatGPT or follow it directly: reference roles, PS2 world, shot structure, camera, dialogue, constraints, golden rule. |
| `references/prompts/01_his_exact_inputs_and_settings.txt` | What CYBORG typed into ChatGPT/Higgsfield and every setting he used (from youtube.com/watch?v=xI51f2FFbpk). |
| `references/prompts/02_clip1_prompt_v3.txt` | Approved clip 1 prompt (penthouse opener, camera moves, pose). Template for any opener. |
| `references/prompts/03_clip2_extend_prompt_v13.txt` | Approved clip 2 Extend prompt (second character, bag set on table, insert shot, SFX). |
| `references/prompts/04_clip3_extend_prompt_v5.txt` | Approved clip 3 Extend prompt (two-finger chest tap, payoff, held smile for the plug). |
| `references/prompts/08_clip2_fix_plan.txt` | What failed in the first clip 2 render and the three Haiku grading rounds. Read before writing prompts. |
| `references/prompts/09_girl_image_prompt_v2.txt` | Secondary-character reference image prompt (Nano Banana Pro, main character as style ref). |
| `references/examples/chunks_*_penthouse.json` | Caption chunks with word timings for both styles (input format for the caption scripts). |
| `references/examples/*.srt` | The two approved caption tracks. |
| `scripts/caps_cyborg.py` | CYBORG caption PNGs: Times New Roman Bold condensed 80 %, tight tracking, 3 px CRT scanlines, light-blue glow, fixed baseline. Defaults = approved look. |
| `scripts/caps_khan.py` | Children of Khan caption PNGs: Arial Bold 50 px, 1.5 px light-grey rim, soft shadow, one line only, fixed baseline. |
| `scripts/burn_captions.py` | Overlay caption PNGs on a video in their time windows. |
| `scripts/mix_music.py` | Music bed under the video. Defaults = approved FINAL_v4 mix. |
| `scripts/trim_dead_air.py` | List silent gaps and camera cuts; cut with a keep-list. |
| `scripts/extract_captions.py` | Segment a creator's captions frame by frame into labelled contact sheets for 1:1 copying. |
| `scripts/caption_metrics.py`, `scripts/halo_color.py` | Measure scanline depth, glow lift, letter brightness and halo colour on his crops vs ours (run with `~/tools/audiosep/.venv/bin/python`, needs scipy). |

## Ryan's rules for this workflow

- Never press Generate (Higgsfield credits) or any paid call without his explicit "go". Say the credit cost first.
- Show the storyboard (shot, time, camera, action, line) before typing a prompt. He iterates on it.
- When he wants the creator's delivery ("pull the pace and tone"), do NOT generate a new read. Use ElevenLabs
  speech-to-speech on the creator's isolated audio. He rejected freshly generated replacement reads.
- Versioned files `_v2`, `_v3`: preserve previous versions and unsaved work. Historical app-opening steps are reference notes, not instructions to control the desktop.
- Captions: one fixed baseline (never let captions move on Y), bottom third. Khan style: one line, never wrap.
- No em dashes anywhere.

## Pipeline

### 0. Folder
`~/Downloads/<Project> Setup/` with numbered files (`01_...txt`, `05_voice_ref_clip1.mp3`). Check `df -h /` first:
the internal disk runs at 95 to 99 % and ran out three times on this job (see Gotchas).

### 1. Voice reference (ElevenLabs, key `~/.elevenlabs/key`, header `xi-api-key`)
- Voices made on this job (Ryan's account): clone `xg2gQU52xdUQslN8GhSy` ("CYBORG PS2 UK voice", from 14 s of
  audio, so fuzzy); studio remixes `D9mUuEIZAQQ8r3UUvdN1` (r0) and `EsBKDmM9f0GZP1raVDSa` (r1). r1 is the one used.
  Remix = `POST /v1/text-to-voice/{voice_id}/remix` with a "recorded in a studio on a condenser mic" description,
  then save a preview with `POST /v1/text-to-voice`. This removed the hiss that the clone learned.
- Best result: take the creator's finished voiceline, isolate it (`/v1/audio-isolation`, needs >= 4.6 s, pad
  with silence if shorter), then `/v1/speech-to-speech/{r1}` with `model_id=eleven_multilingual_sts_v2`,
  `remove_background_noise=false` (true garbled the last words). Trim any narrator bleed at the ends.
  Result: `~/Downloads/PS2 Voice/our_voice_full_line_b_v2.mp3`.
- Cut one reference per clip on word boundaries (word times from whisper or ElevenLabs scribe). Check each cut
  with a transcript and an RMS envelope: an `-ss` after `-i` with a fade once produced 10 s of silence.

### 2. Character, product and props (Higgsfield)
- Image: Higgsfield > Image, **Nano Banana Pro**, 9:16, 1K, 2 credits. CYBORG's character prompt is in `01_...txt`.
- Ryan keeps the character and the product as saved **Elements** (`character`, `hoodie`). Props (Wingstop bag)
  are plain uploads.
- Any second character needs its own reference image made from the main character as style reference
  (`09_girl_image_prompt_v2.txt`), or Seedance renders a blocky low-detail person. Ryan picked his own regen.

### 3. Prompts (Seedance 2.5)
Follow the SOP section order (reference roles, visual style, location, character and performance, dialogue
exact, shot-by-shot timeline, camera, audio, continuity, constraints, golden rule). Lessons that cost credits:
- Eyes: write "eyes fully open and alert, lids not lowered" in every shot. One "eyes half closed" made him sleepy.
  Do not put the words "eyes closed" in an eye instruction even if the dialogue says it.
- Use positive instructions: "his head stays facing the camera, eyes locked on the camera", not "without looking".
- Lock furniture: "the same fixed, stationary tan leather wingback armchair standing on four short wooden legs".
  It turned into an office chair once.
- When someone enters, put the camera in front of him so he does not turn toward them.
- Hands: spell the gesture out (which hand, finger shape, when it happens, where the other hand is).
- Time the shot cuts from the voice reference's word timestamps, about 3.5 to 4.5 words per second.
- Ryan likes camera movement inside shots (slow pan, sideways track, rising low angle, slow push-in, "like a
  PS2 cutscene camera on a rail"), and one foot up on the footstool, one on the floor.
- SFX go in the shot line and in AUDIO ("crisp crunch of stiff kraft paper as the base lands"); it worked.
- Run a Haiku 5.5 grader (Agent, `model: haiku`) on the prompt before loading; apply real fixes; stop at 3 rounds.

### 4. Loading it in Higgsfield (Claude in Chrome)
- Browser: the "CLAUDE" Chrome. If two browsers are connected, `switch_browser` and let Ryan click Connect.
- Clip 1: Create Video, preset General, Seedance 2.5, set 9:16, 720p, bitrate High, audio on.
  Clips 2+: **Extend Video** tab (`?model=seedance_2_5_extend`), pick the previous render under Video Generations
  (confirm by its `hf_YYYYMMDD_HHMMSS` file id in the page's `<video>` src). Aspect is inherited.
- References: click the `+` tile, then `file_upload` to the hidden `input[type=file]` (accepts images and audio),
  then click the uploaded tile to attach. Remove stale references (old voice, the girl) with the hover `x`.
- @ tags: type `@`, wait, `find` the menu item, **click** it. Typing `@name` then Enter inserts the first item
  (Video 1); typing a space closes the menu; synthetic JS clicks do nothing.
- The prompt box is a Lexical contenteditable: `shift+Enter` for new lines. To edit a section, select its text
  range with a JS TreeWalker on `[contenteditable="true"]`, then `type` the replacement.
- Duration: click Duration, focus the `[role=slider]` in the dialog via JS, press ArrowLeft/Right (range 4 to 30 s).
- Verify before showing Ryan: `[contenteditable="false"]` chips (all expected tags), every section present,
  duration, credits (Seedance 2.5 720p = 7 credits per second: 10 s = 70, 9 s = 63, 7 s = 49).

### 5. Review every render frame by frame
In the page: find the `<video>` by its hf id, `currentTime = t` and await `seeked`, then `zoom` the video rect.
Check 8 to 10 points: eyes open, gaze on camera, second character at his quality, furniture unchanged, props
correct, last line not cut off. Ryan judges the audio by ear (you cannot hear it).
Download: the `<video>` src is `https://d8j0ntlcm91z4.cloudfront.net/user_.../hf_*.mp4`, plain `curl` works.

### 6. Join, then trim dead air
Concat the clips (15 ms audio fades at joins, re-encode, `loudnorm=I=-14:TP=-1.5`), check the joins with SSIM
of last frame vs next first frame. Then `trim_dead_air.py` (penthouse: 26.0 s to 23.1 s; keep the air around
an action like the bag being lowered).

### 7. Captions
- Word timings: ElevenLabs `POST /v1/speech-to-text` with `model_id=scribe_v1`, `timestamps_granularity=word`.
- Copying a creator 1:1: `extract_captions.py`, read every sheet, keep his chunks, case and punctuation exactly,
  time each chunk to our words (show from first word until the next caption if the gap is < 0.35 s).
- `caps_cyborg.py CHUNKS.json DIR` or `caps_khan.py CHUNKS.json DIR`, then `burn_captions.py VIDEO DIR OUT`.
- Measured CYBORG style (his frame 1252x940, text 95 px tall): heavy serif, condensed, scanline period 4.6 px
  (= 3 px on our 720x1280), halo that lifts blue about 3x more than red, no animation, hard cuts. A faint
  darker band drifts down through the letters; not reproduced.
- Measured Khan style (reel DdAx0P6gfSc, 1448x1078): Arial Bold, "my friend spent 3 years" = 78 % of width,
  thin light-grey rim, soft dark shadow, hard cuts. He wraps to two lines; Ryan wants one line.
- To match a style, compare crops at the same text height with `caption_metrics.py` / `halo_color.py`.
  A Haiku yes/no grader on caption crops flip-flopped (too weak, then too strong) and contradicted measurements;
  trust the numbers and Ryan's eye.
- His crops can be contaminated by text printed on the shirt (Khan's tee has the catchphrase): pick clean frames.

### 8. Music
- Identify with `~/tools/audiosep/.venv/bin/python ~/.claude/skills/reel-assets/music_id.py VIDEO WORKDIR`
  (needs about 500 MB free; it filled the disk once). `--title "Artist - Title"` only verifies a known song.
- CYBORG's reel: Cult Member & Mia Martina "U Weren't Here I Really Miss You", 0.762x, from 62.42 s.
- Children of Khan (two reels, chroma 0.99): GLM-RST "still love you (Slowed)" (2026-08-20), from the official
  preview at 0.86 s. Preview: `~/Documents/Codex/2026-10-15/okay-x20/work/khan-music-id-v1/slowed-official-preview.m4a`.
- `mix_music.py VIDEO SONG OUT` reproduces the approved mix. Khan's own reels sit the music 7 to 9 LU under the
  voice, but on Ryan's speakers 8 LU was inaudible and he then landed 6 dB lower than a 4.5 LU mix
  (--gain -17.24). Adjust with "X % quieter" = 20*log10(1 - X/100) dB, keep `--out-gain` so the voice stays put.
- Tell Ryan: for posting, upload the no-music version and add the sound in the app, or the reel may be muted.

## Gotchas
- Disk: internal disk at 95 to 99 %. When it hits 0 the Bash tool itself fails (cannot write its output file);
  ask Ryan to run an `rm -rf` of the scratch folders. Delete big temp files (separations, full downloads) as you go.
- `~/.cache/whisper` is a symlink to the 5TB; use `--model_dir` in scratch, delete the model after.
- This ffmpeg has no `drawtext`: draw labels and captions with PIL and `overlay`.
- zsh: `$var` does not word-split (run loops with `bash -c`), and a glob with no matches is an error (use `find -delete`).
- Khan archive (1,062 reels, transcripts, pgvector on port 5548): `~/Documents/Codex/2026-10-15/okay-x20/outputs/khan-archive-v1/`.
  Its videos are 256x190 previews; download the real reel with `yt-dlp https://www.instagram.com/p/<id>/` (1448x1078).
  His catchphrase "You met me at a very Chinese time in my life" is in 595 transcripts.
