import {spawn} from 'node:child_process';
import {mkdtemp, writeFile, readFile, rm} from 'node:fs/promises';
import {existsSync, accessSync, copyFileSync, chmodSync, constants} from 'node:fs';
import {tmpdir} from 'node:os';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
// On Vercel the Linux binary ships at ops/bin/ffmpeg (scripts/fetch-ffmpeg.mjs). If the bundle dropped its execute bit,
// it is copied to /tmp and made executable once. Locally the ffmpeg-static binary for this machine is used.
const bundled = fileURLToPath(new URL('../bin/ffmpeg', import.meta.url));
let resolved;
export function ffmpegPath() {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  if (resolved) return resolved;
  if (process.platform === 'linux' && existsSync(bundled)) {
    try { accessSync(bundled, constants.X_OK); resolved = bundled; }
    catch { const copy = path.join(tmpdir(), 'mint-ffmpeg'); if (!existsSync(copy)) { copyFileSync(bundled, copy); chmodSync(copy, 0o755); } resolved = copy; }
    return resolved;
  }
  const pkg = 'ffmpeg-static';
  return (resolved = require(pkg));
}
export const fontPath = () => process.env.CAPTION_FONT || require.resolve('dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf');

function run(args, {timeoutMs = 120000} = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath(), ['-hide_banner', '-loglevel', 'error', ...args], {stdio: ['ignore', 'ignore', 'pipe']});
    let stderr = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.stderr.on('data', d => { stderr = (stderr + d).slice(-4000); });
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => { clearTimeout(timer); code === 0 ? resolve() : reject(Error(`ffmpeg exited ${code}: ${stderr.trim().split('\n').slice(-3).join(' | ')}`)); });
  });
}
async function hasAudio(file) {
  // ffmpeg -i always exits non-zero without an output, so read its stream listing instead of the exit code.
  return new Promise(resolve => {
    const child = spawn(ffmpegPath(), ['-hide_banner', '-i', file], {stdio: ['ignore', 'ignore', 'pipe']});
    let out = '';
    child.stderr.on('data', d => { out += d; });
    child.on('close', () => resolve(/Stream #\d+:\d+.*Audio:/.test(out)));
    child.on('error', () => resolve(false));
  });
}

// Breaks a caption into lines short enough to sit inside a 720 px wide frame.
export function wrapCaption(text, width = 24) {
  const lines = [];
  let line = '';
  for (const word of String(text).replace(/\s+/g, ' ').trim().split(' ')) {
    if (line && (line + ' ' + word).length > width) { lines.push(line); line = word; }
    else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines.slice(0, 4).join('\n');
}

// Joins clips into one 720x1280 vertical video. Each clip is normalized first (size, frame rate, stereo audio,
// silence when a clip has none) so the concat copies streams instead of failing on mismatched clips.
// captions: one {text} per clip, burned in across that clip. Returns the finished MP4 as a Buffer.
export async function stitch(clips, captions = [], {fontSize = 46} = {}) {
  if (!clips.length) throw Error('Nothing to stitch');
  const dir = await mkdtemp(path.join(tmpdir(), 'mint-stitch-'));
  try {
    const parts = [];
    for (const [i, buf] of clips.entries()) {
      const src = path.join(dir, `in-${i}.mp4`), out = path.join(dir, `part-${i}.mp4`);
      await writeFile(src, buf);
      const text = captions[i]?.text ? wrapCaption(captions[i].text) : '';
      let vf = 'scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2,fps=30,setsar=1,format=yuv420p';
      // One drawtext per line, because this ffmpeg cannot center lines inside a single text block.
      for (const [n, line] of (text ? text.split('\n') : []).entries()) {
        const textFile = path.join(dir, `caption-${i}-${n}.txt`);
        await writeFile(textFile, line);
        vf += `,drawtext=fontfile='${fontPath()}':textfile='${textFile}':fontsize=${fontSize}:fontcolor=white:borderw=4:bordercolor=black:x=(w-text_w)/2:y=h*0.70+${n * (fontSize + 14)}`;
      }
      const audio = await hasAudio(src);
      await run(['-y', '-i', src, ...(audio ? [] : ['-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100']), '-vf', vf,
        '-map', '0:v:0', '-map', audio ? '0:a:0' : '1:a:0', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-c:a', 'aac', '-ar', '44100', '-ac', '2', '-b:a', '128k', '-shortest', out]);
      parts.push(out);
    }
    const list = path.join(dir, 'list.txt'), final = path.join(dir, 'final.mp4');
    await writeFile(list, parts.map(p => `file '${p}'`).join('\n'));
    await run(['-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', final]);
    return await readFile(final);
  } finally {
    await rm(dir, {recursive: true, force: true});
  }
}

// A short test clip (color bars plus a tone), used by tests and the local smoke run instead of real renders.
export async function sampleClip(seconds = 2, {audio = true, size = '720x1280'} = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), 'mint-sample-'));
  try {
    const out = path.join(dir, 'clip.mp4');
    await run(['-y', '-f', 'lavfi', '-i', `testsrc2=size=${size}:rate=24:duration=${seconds}`, ...(audio ? ['-f', 'lavfi', '-i', `sine=frequency=440:duration=${seconds}`] : []),
      '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', ...(audio ? ['-c:a', 'aac', '-shortest'] : []), out]);
    return await readFile(out);
  } finally {
    await rm(dir, {recursive: true, force: true});
  }
}
