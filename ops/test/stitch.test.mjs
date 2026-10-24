import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {stitch, sampleClip, wrapCaption, ffmpegPath} from '../lib/stitch.mjs';

test('captions wrap to short centered lines and never exceed four', () => {
  assert.equal(wrapCaption('This shirt survived three raids and a breakup.'), 'This shirt survived\nthree raids and a\nbreakup.');
  assert.equal(wrapCaption('word '.repeat(60)).split('\n').length, 4);
});

test('clips of different sizes, with and without audio, become one 720x1280 video with sound', async () => {
  const clips = [await sampleClip(1.5), await sampleClip(1, {audio: false, size: '640x1138'}), await sampleClip(1, {size: '1080x1920'})];
  const out = await stitch(clips, [{text: 'First line of dialogue'}, {text: ''}, {text: 'Last line'}]);
  assert.ok(out.length > 10000);
  const probe = spawnSync(ffmpegPath(), ['-hide_banner', '-f', 'mp4', '-i', 'pipe:0'], {input: out}).stderr.toString();
  assert.match(probe, /720x1280/);
  assert.match(probe, /Audio: aac/);
  const seconds = Number(probe.match(/Duration: 00:00:(\d+\.\d+)/)[1]);
  assert.ok(seconds > 3.2 && seconds < 3.8, `duration ${seconds}`);
});
