// Puts a Linux ffmpeg for Vercel's function architecture (arm64 by default, FFMPEG_ARCH=x64 otherwise) at ops/bin/ffmpeg,
// using ffmpeg-static's own installer with a platform override. Run before `vercel build`; bin/ is git-ignored.
import {execFileSync} from 'node:child_process';
import {mkdtempSync, copyFileSync, chmodSync, mkdirSync, readFileSync, rmSync, openSync, readSync, closeSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ops = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const version = JSON.parse(readFileSync(path.join(ops, 'node_modules/ffmpeg-static/package.json'), 'utf8')).version;
const arch = process.env.FFMPEG_ARCH || 'arm64', machine = {arm64: 0xb7, x64: 0x3e}[arch];
if (!machine) throw Error('FFMPEG_ARCH must be arm64 or x64');
const dir = mkdtempSync(path.join(tmpdir(), 'mint-ffmpeg-linux-'));
try {
  execFileSync('npm', ['install', '--no-save', '--no-audit', '--no-fund', '--prefix', dir, `ffmpeg-static@${version}`], {stdio: 'inherit', env: {...process.env, npm_config_platform: 'linux', npm_config_arch: arch}});
  const src = path.join(dir, 'node_modules/ffmpeg-static/ffmpeg');
  const head = Buffer.alloc(20), fd = openSync(src, 'r');
  readSync(fd, head, 0, 20, 0); closeSync(fd);
  // ELF magic, 64-bit class, and the machine type for the requested architecture at byte 18.
  if (head.toString('latin1', 1, 4) !== 'ELF' || head[4] !== 2 || head.readUInt16LE(18) !== machine) throw Error(`Downloaded ffmpeg is not a Linux ${arch} binary`);
  mkdirSync(path.join(ops, 'bin'), {recursive: true});
  copyFileSync(src, path.join(ops, 'bin/ffmpeg'));
  chmodSync(path.join(ops, 'bin/ffmpeg'), 0o755);
  console.log(`ops/bin/ffmpeg ready (ffmpeg-static ${version}, linux ${arch})`);
} finally {
  rmSync(dir, {recursive: true, force: true});
}
