#!/usr/bin/env python3
"""Append website CTA cards without re-encoding provider video pictures."""
import argparse
import hashlib
import json
import re
import subprocess
from datetime import datetime, timezone
from fractions import Fraction
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
FFMPEG = ROOT / 'ops/node_modules/ffmpeg-static/ffmpeg'
WORK = ROOT / 'work/streetwear-demo-v1/postprocess-v1'
PUBLIC = ROOT / 'agent/public/streetwear-demo-assets'
SOURCE = PUBLIC / 'generic-source-6s-v1.mp4'
FONT = Path('/System/Library/Fonts/Supplemental/Arial.ttf')
BOLD = Path('/System/Library/Fonts/Supplemental/Arial Bold.ttf')
BRANDS = {
    'disobedient': {
        'name': 'Disobedient', 'product': ['Low Lives Hoodie'],
        'domain': 'disobedientnyc.com',
        'url': 'https://disobedientnyc.com/products/low-lives-hoodie',
        'logo': PUBLIC / 'disobedient-official-logo-v1.png',
    },
    'vylin': {
        'name': 'VYLIN', 'product': ['Cream Headphones', 'Black Zip Hoodie'],
        'domain': 'wearvylin.com',
        'url': 'https://www.wearvylin.com/products/cream-headphones-on-black-hoodie',
        'logo': PUBLIC / 'vylin-official-wordmark-v1.png',
    },
}


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def run(args, binary=False):
    result = subprocess.run([str(FFMPEG), '-hide_banner', '-nostdin', *map(str, args)],
                            capture_output=True, text=not binary)
    if result.returncode:
        error = result.stderr.decode(errors='replace') if binary else result.stderr
        raise RuntimeError(error[-4000:])
    return result


def probe(path):
    result = subprocess.run([str(FFMPEG), '-hide_banner', '-nostdin', '-i', str(path)],
                            capture_output=True, text=True)
    text = result.stderr
    line = next((x for x in text.splitlines() if 'Video:' in x), '')
    dimensions = re.search(r'\b(\d{2,5})x(\d{2,5})\b', line)
    rate = re.search(r'([\d.]+) fps', line)
    duration = re.search(r'Duration: (\d+):(\d+):([\d.]+)', text)
    if not dimensions or not rate or not duration:
        raise RuntimeError(f'Cannot probe {path.name}: {text[-1500:]}')
    return {'width': int(dimensions[1]), 'height': int(dimensions[2]),
            'fps': float(rate[1]), 'fps_rational': str(Fraction(rate[1]).limit_denominator(1001)),
            'duration': int(duration[1])*3600 + int(duration[2])*60 + float(duration[3]),
            'codec': line.split('Video: ', 1)[1].split(' ', 1)[0],
            'pixel_format': 'yuv420p' if 'yuv420p' in line else None,
            'video_stream': line.strip(), 'audio_present': 'Audio:' in text}


def frame_hashes(path):
    result = run(['-v', 'error', '-i', path, '-map', '0:v:0', '-an',
                  '-pix_fmt', 'yuv420p', '-f', 'framemd5', '-'])
    if result.stderr.strip():
        raise RuntimeError(f'Decode errors in {path.name}: {result.stderr[-1500:]}')
    return [line.split(',')[-1].strip() for line in result.stdout.splitlines()
            if line and not line.startswith('#')]


def pcm(path):
    result = run(['-v', 'error', '-i', path, '-map', '0:a:0', '-vn', '-ac', '1',
                  '-ar', '48000', '-f', 'f32le', '-'], binary=True)
    return np.frombuffer(result.stdout, dtype='<f4').astype(np.float64)


def audio_check(final):
    original, restored = pcm(SOURCE), pcm(final)
    n = min(len(original), 6*48000, len(restored))
    x, y = original[:n], restored[:n]
    if n < 5.9*48000:
        raise RuntimeError('Original or restored audio is shorter than the six-second source.')
    rms = float(np.sqrt(np.mean(y*y)))
    if rms < 0.0001:
        raise RuntimeError('Restored audio is silent.')
    nfft = 1 << (2*n-1).bit_length()
    correlation = np.fft.irfft(np.fft.rfft(y, nfft)*np.conj(np.fft.rfft(x, nfft)), nfft)
    maxlag = 24000
    lags = np.arange(-maxlag, maxlag+1)
    values = correlation[np.mod(lags, nfft)]
    lag = int(lags[np.argmax(values)])
    coefficient = float(np.corrcoef(x, y)[0, 1])
    if lag != 0 or coefficient < 0.99:
        raise RuntimeError(f'Audio validation failed: lag={lag} samples, correlation={coefficient:.6f}')
    tail = restored[int(6.05*48000):int(7.95*48000)]
    tail_rms = float(np.sqrt(np.mean(tail*tail))) if len(tail) else None
    if tail_rms is None or tail_rms > 0.0001:
        raise RuntimeError(f'Endcard audio is not silent: RMS={tail_rms}')
    return {'sample_rate': 48000, 'comparison': 'decoded mono float32 PCM',
            'compared_samples': n, 'source_rms': float(np.sqrt(np.mean(x*x))),
            'final_first_six_seconds_rms': rms, 'peak_lag_samples': lag,
            'peak_lag_seconds': lag/48000, 'zero_lag_correlation': coefficient,
            'max_absolute_pcm_difference': float(np.max(np.abs(x-y))),
            'endcard_rms_after_6_05_seconds': tail_rms,
            'note': 'AAC is encoded once for the restored audio track; decoded correlation verifies alignment. Provider video is stream-copied.'}


def card(brand, width, height, folder):
    config = BRANDS[brand]
    image = Image.new('RGB', (width, height), '#0a0a0c')
    draw = ImageDraw.Draw(image)
    margin = round(width*0.09)
    logo = Image.open(config['logo']).convert('RGBA')
    alpha_box = logo.getchannel('A').getbbox()
    if alpha_box:
        # Framing the existing alpha bounds does not edit the saved logo asset.
        logo = logo.crop(alpha_box)
    logo.thumbnail((round(width*0.72), round(height*0.20)), Image.Resampling.LANCZOS)
    logo_x = (width-logo.width)//2
    logo_y = round(height*0.23)
    image.paste(logo, (logo_x, logo_y), logo)
    bounds = []
    def line(text, y, size, bold=False, fill='white'):
        font = ImageFont.truetype(str(BOLD if bold else FONT), max(16, round(size*width/720)))
        box = draw.textbbox((0, 0), text, font=font)
        x = round((width-(box[2]-box[0]))/2-box[0])
        y = round(y*height-box[1])
        actual = draw.textbbox((x, y), text, font=font)
        if actual[0] < margin or actual[2] > width-margin or actual[1] < 0 or actual[3] > height:
            raise RuntimeError(f'CTA text overflows: {brand}: {text}')
        draw.text((x, y), text, font=font, fill=fill)
        bounds.append({'text': text, 'bounds': actual, 'font': 'Arial Bold' if bold else 'Arial'})
    first_y = .49 if len(config['product']) == 1 else .46
    for index, text in enumerate(config['product']):
        line(text, first_y+index*.055, 42, True)
    line('Shop the hoodie', .65, 45, True)
    line(config['domain'], .72, 29, fill='#c4c4ca')
    path = folder / f'{brand}-endcard-v1.png'
    if path.exists():
        raise RuntimeError(f'Preserving existing endcard: {path}')
    image.save(path)
    sidecar = {'brand': config['name'], 'product_name': ' '.join(config['product']),
               'cta': 'Shop the hoodie', 'website_domain': config['domain'],
               'product_url': config['url'], 'logo_source_file': str(config['logo'].relative_to(ROOT)),
               'logo_sha256': digest(config['logo']), 'width': width, 'height': height,
               'text_bounds': bounds, 'text_overflow': False,
               'background': '#0a0a0c', 'font_family': 'Arial',
               'mint_checkout': False, 'source_asset_unchanged': True}
    (folder/f'{brand}-endcard-v1.json').write_text(json.dumps(sidecar, indent=2)+'\n')
    return path, sidecar


def finish(brand, prepare=False):
    folder = WORK/brand
    folder.mkdir(parents=True, exist_ok=False)
    raw = ROOT/f'work/streetwear-demo-v1/{brand}-genjutsu-raw-v1.mp4'
    if prepare:
        png, sidecar = card(brand, 720, 1280, folder)
        return {'brand': brand, 'mode': 'cta_prepared_only', 'endcard_png': str(png.relative_to(ROOT)), **sidecar}
    if not raw.exists():
        raise RuntimeError(f'Provider output is not ready: {raw}')
    final = PUBLIC/f'{brand}-sample-v1.mp4'
    if final.exists():
        raise RuntimeError(f'Preserving existing final file: {final}')
    before_hash = digest(raw)
    metadata = probe(raw)
    if metadata['codec'] != 'h264' or metadata['pixel_format'] != 'yuv420p':
        raise RuntimeError(f'Unsupported concat-copy codec. Source will not be resized or re-encoded: {metadata}')
    hashes = frame_hashes(raw)
    duration = len(hashes)/metadata['fps']
    if abs(duration-6) > 1/metadata['fps']+.002:
        raise RuntimeError(f'Provider output is not a six-second pilot: {duration}s. No trim or resize attempted.')
    png, sidecar = card(brand, metadata['width'], metadata['height'], folder)
    cta_video = folder/f'{brand}-endcard-v1.mp4'
    run(['-v', 'error', '-n', '-loop', '1', '-framerate', metadata['fps_rational'], '-i', png,
         '-frames:v', round(2*metadata['fps']), '-an', '-c:v', 'libx264', '-profile:v', 'high',
         '-pix_fmt', 'yuv420p', '-preset', 'medium', '-crf', '16', '-r', metadata['fps_rational'],
         '-video_track_timescale', '90000', cta_video])
    video_only = folder/f'{brand}-raw-video-copy-v1.mp4'
    run(['-v', 'error', '-n', '-i', raw, '-map', '0:v:0', '-c:v', 'copy', '-an', '-video_track_timescale', '90000', video_only])
    concat = folder/'concat-v1.txt'
    for path in [video_only, cta_video]:
        if "'" in str(path):
            raise RuntimeError('Unexpected quote in media path.')
    concat.write_text("\n".join(f"file '{path}'" for path in [video_only, cta_video])+"\n")
    joined = folder/f'{brand}-joined-video-copy-v1.mp4'
    run(['-v', 'error', '-n', '-f', 'concat', '-safe', '0', '-i', concat,
         '-map', '0:v:0', '-c:v', 'copy', '-an', joined])
    candidate = folder/f'{brand}-sample-candidate-v1.mp4'
    run(['-v', 'error', '-n', '-i', joined, '-i', SOURCE,
         '-filter_complex', '[1:a:0]atrim=duration=6,asetpts=PTS-STARTPTS,apad=pad_dur=2,atrim=duration=8[a]',
         '-map', '0:v:0', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
         '-ar', '48000', '-movflags', '+faststart', '-metadata', 'comment='+BRANDS[brand]['url'], candidate])
    after = probe(candidate)
    final_hashes = frame_hashes(candidate)
    if final_hashes[:len(hashes)] != hashes:
        raise RuntimeError('Raw Genjutsu decoded-frame hashes changed after concat. Do not publish this candidate.')
    if len(final_hashes) != len(hashes)+round(2*metadata['fps']):
        raise RuntimeError('Unexpected frame count at concat join.')
    if (after['width'], after['height']) != (metadata['width'], metadata['height']):
        raise RuntimeError('Output dimensions differ from raw output. No resize permitted.')
    if abs(after['duration']-8) > 1/metadata['fps']+.025:
        raise RuntimeError(f'Final duration is not eight seconds: {after["duration"]}')
    audio = audio_check(candidate)
    if digest(raw) != before_hash:
        raise RuntimeError('Raw input changed during finishing.')
    # Publish only after all checks. Hard link refuses to replace an existing file.
    final.hardlink_to(candidate)
    run(['-v', 'error', '-n', '-ss', '7', '-i', final, '-frames:v', '1', folder/f'{brand}-endcard-decoded-v1.png'])
    return {'brand': brand, 'status': 'local_media_checks_passed_human_review_pending',
            'raw_file': str(raw.relative_to(ROOT)), 'raw_sha256': before_hash,
            'final_file': str(final.relative_to(ROOT)), 'final_sha256': digest(final),
            'raw_metadata': metadata, 'final_metadata': after, 'raw_frames': len(hashes),
            'final_frames': len(final_hashes), 'raw_segment_decoded_frame_hashes_unchanged': True,
            'video_encoding': 'Provider frames concat-copied; only new CTA pictures encoded.',
            'audio': audio, 'endcard': sidecar,
            'endcard_png': str(png.relative_to(ROOT)),
            'decoded_endcard_png': str((folder/f'{brand}-endcard-decoded-v1.png').relative_to(ROOT)),
            'raw_input_preserved': True, 'paid_calls': 0, 'sends': 0,
            'human_approval': False, 'visual_garment_qa': 'separate_parent_review_required'}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--brand', choices=BRANDS)
    parser.add_argument('--prepare', action='store_true', help='Prepare CTA only in a separate preview folder.')
    args = parser.parse_args()
    global WORK
    if args.prepare:
        WORK = ROOT/'work/streetwear-demo-v1/cta-preview-v1'
    WORK.mkdir(parents=True, exist_ok=True)
    receipt = {'version': 1, 'created_at': datetime.now(timezone.utc).isoformat(),
               'script': str(Path(__file__).relative_to(ROOT)), 'results': []}
    state_file = ROOT/'work/streetwear-demo-v1/generation-state-v1.json'
    if state_file.exists():
        state = json.loads(state_file.read_text())
        receipt['generation_jobs'] = [{k:j.get(k) for k in ['brandId','taskId','renderId','requestId','status','outputSha256']}
                                      for j in state.get('jobs', [])]
    for brand in [args.brand] if args.brand else BRANDS:
        try:
            receipt['results'].append(finish(brand, args.prepare))
        except Exception as error:
            receipt['results'].append({'brand': brand, 'status': 'blocked_local_postprocessing', 'error': str(error)})
            path = WORK/f'{brand}-failure-receipt-v1.json'
            path.write_text(json.dumps(receipt, indent=2)+'\n')
            print(json.dumps({'error': str(error), 'receipt': str(path)}, indent=2))
            raise
    name = (args.brand+'-' if args.brand else '')+'postprocess-receipt-v1.json'
    path = WORK/name
    if path.exists():
        raise RuntimeError(f'Preserving existing receipt: {path}')
    path.write_text(json.dumps(receipt, indent=2)+'\n')
    print(json.dumps({'receipt': str(path.relative_to(ROOT)), 'results': [{'brand':r['brand'], 'status':r.get('status',r.get('mode'))} for r in receipt['results']]}, indent=2))


if __name__ == '__main__':
    main()
