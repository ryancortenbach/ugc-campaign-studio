import {z} from 'zod';
import * as boards from '../../agent/storyboard.mjs';
import * as hf from '../../agent/tools/higgsfield.mjs';
import {structured, llmEnabled} from '../../agent/tools/llm.mjs';
import {stitch} from './stitch.mjs';

// The pipeline's tools, built on the agent's own storyboard, checker and Higgsfield modules so both apps grade work the same way.
const angleSchema = z.object({
  angles: z.array(z.object({title: z.string(), hook: z.string(), idea: z.string()})),
  creator: z.object({identity: z.string(), wardrobe: z.string(), voice: z.string()}),
});

export async function planAngles(brief, count) {
  const out = await structured({role: 'main', effort: 'medium', schema: angleSchema, maxTokens: 6000,
    system: `You plan short vertical UGC videos for a brand. Return exactly ${count} creative angles, each clearly different from the others: a different hook, situation or format (reaction, routine, problem and fix, unboxing, day in the life, comparison, honest review, skit). Each angle has a title under 8 words, the spoken or on-screen hook under 15 words, and the idea under 45 words. Work only from the brief: no invented product claims, prices, results, discounts, scarcity or guarantees, and never copy a real creator's face, name or catchphrases. Also describe one original on-camera creator who fits the audience, used when the brand wants the same person in every video: identity (age, look, hair, build), everyday wardrobe and voice, each under 40 words and specific enough to repeat exactly. No em dashes.`,
    prompt: JSON.stringify(brief)});
  const angles = out.data.angles.filter(a => a.title && a.idea);
  if (!angles.length) throw Error('The model returned no usable angles');
  return {angles, creator: out.data.creator, cost: out.cost};
}

const MAX_CLIP = 60 * 1024 * 1024;
export async function fetchFile(url, {timeoutMs = 120000} = {}) {
  const u = new URL(url);
  if (u.protocol !== 'https:') throw Error('Refusing a non-HTTPS clip URL');
  const res = await fetch(u, {signal: AbortSignal.timeout(timeoutMs)});
  if (!res.ok) throw Error(`Clip download failed with HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_CLIP) throw Error('Clip is larger than 60 MB');
  return buf;
}

// Supabase Storage, private bucket. Signed links are the only way videos leave it.
export function supabaseStorage(client, bucket = 'fulfillment') {
  const b = () => client.storage.from(bucket);
  const must = ({data, error}, what) => { if (error) throw Error(`Storage ${what} failed: ${error.message}`); return data; };
  return {
    async put(path, buf, contentType) { must(await b().upload(path, buf, {contentType, upsert: true}), 'upload'); return path; },
    async get(path) { return Buffer.from(await must(await b().download(path), 'download').arrayBuffer()); },
    async remove(paths) { if (paths.length) must(await b().remove(paths), 'delete'); },
    async signedUrl(path, seconds = 7 * 86400, download = null) { return must(await b().createSignedUrl(path, seconds, download ? {download} : undefined), 'link').signedUrl; },
    async ping() { must(await b().list('', {limit: 1}), 'list'); return true; },
  };
}

export function realTools({storage}) {
  return {
    ready: () => ({llm: llmEnabled(), higgsfield: hf.higgsfieldEnabled()}),
    angles: planAngles,
    draftStoryboard: brief => boards.draftStoryboard(brief),
    checkStoryboard: boards.checkStoryboard,
    reviseStoryboard: boards.reviseStoryboard,
    shotsFromStoryboard: hf.shotsFromStoryboard,
    textToVideo: hf.endpoints['text-to-video'],
    runCheckers: hf.runCheckers,
    estimate: async (endpoint, input) => hf.priceFrom(await hf.estimate(endpoint, input), input),
    submit: hf.approveAndSubmit,
    status: hf.status,
    fetchFile,
    stitch,
    storage,
  };
}
