import test from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';import {playerHTML,bindPlayers} from './public/mint-player.js';
test('the Mint player controls actual playback, seeking and mute without native controls',()=>{
 const dom=new JSDOM(playerHTML('/clip.mp4')),root=dom.window.document,video=root.querySelector('video');let paused=true;
 Object.defineProperty(video,'duration',{value:30});Object.defineProperty(video,'paused',{get:()=>paused});
 video.play=()=>{paused=false;video.dispatchEvent(new dom.window.Event('play'));return Promise.resolve();};video.pause=()=>{paused=true;video.dispatchEvent(new dom.window.Event('pause'));};
 bindPlayers(root);assert.equal(video.controls,false);root.querySelector('[data-mp-play]').click();assert.equal(paused,false);assert.equal(root.querySelector('[data-mp-play]').getAttribute('aria-label'),'Pause video');
 const seek=root.querySelector('[data-mp-seek]');seek.value='50';seek.dispatchEvent(new dom.window.Event('input'));assert.equal(video.currentTime,15);assert.equal(root.querySelector('[data-mp-time]').textContent,'0:15');root.querySelector('[data-mp-mute]').click();assert.equal(video.muted,true);assert.equal(root.querySelector('[data-mp-mute]').getAttribute('aria-label'),'Unmute video');dom.window.close();
});
test('media markup rejects executable URLs and escapes labels',()=>{assert.doesNotMatch(playerHTML('javascript:alert(1)'),/<video/);assert.match(playerHTML('/clip.mp4',{label:'<script>'}),/&lt;script&gt;/);});
