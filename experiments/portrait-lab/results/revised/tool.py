"""Deterministic offline portrait experiments. No models, training or runtime services."""
import argparse
import csv
import hashlib
import io
import itertools
import json
from pathlib import Path
import platform

import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageOps, __version__ as pillow_version

ROOT = Path(__file__).resolve().parent
R = Image.Resampling
BAYER = np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]], dtype=float) / 16 - .46875


def variants(algorithms=None):
    """Full factorial within each family; comparison rows have stable names."""
    for algorithm, colors, grid, dither in itertools.product(
            algorithms or ['baseline', 'cluster', 'contour', 'feature'], [16, 32], [64, 96], [0, 1]):
        yield dict(algorithm=algorithm, colors=colors, grid=grid, dither=dither)


def frame(image, entry):
    image = ImageOps.exif_transpose(image).convert('RGB')
    if 'crop' in entry:
        # Normalized rectangle, same deterministic transform on every run.
        x0, y0, x1, y1 = entry['crop']
        if not (0 <= x0 < x1 <= 1 and 0 <= y0 < y1 <= 1):
            raise ValueError('crop must be an ordered normalized rectangle')
        image = image.crop((round(x0 * image.width), round(y0 * image.height),
                            round(x1 * image.width), round(y1 * image.height)))
    return ImageOps.fit(image, (512, 512), method=R.LANCZOS)


def features(n, entry):
    """Soft masks, not inferred anatomy. Optional source annotations improve alignment."""
    yy, xx = np.mgrid[:n, :n] / n
    mask = np.zeros((n, n))
    # All coordinates refer to the final square crop. Never synthesize facial marks.
    boxes = entry.get('features', [[.24, .34, .46, .48], [.54, .34, .76, .48],
                                  [.40, .44, .60, .65], [.33, .65, .67, .77]])
    for x0, y0, x1, y1 in boxes:
        if not (0 <= x0 < x1 <= 1 and 0 <= y0 < y1 <= 1):
            raise ValueError('feature boxes must be ordered normalized rectangles')
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        mask = np.maximum(mask, np.exp(-2 * (((xx-cx)/((x1-x0)/2))**2 +
                                               ((yy-cy)/((y1-y0)/2))**2)))
    return mask[..., None]


def quantize(image, colors, ordered):
    palette = image.quantize(colors=colors, method=Image.Quantize.MEDIANCUT,
                             dither=Image.Dither.NONE)
    if not ordered:
        return palette.convert('RGB')
    a = np.asarray(image).astype(float)
    tile = np.tile(BAYER, ((image.height+3)//4, (image.width+3)//4))[:image.height, :image.width]
    # Ordered perturbation is bounded; unlike error diffusion it does not propagate.
    perturbed = Image.fromarray(np.uint8(np.clip(a + tile[..., None] * 18, 0, 255)))
    return perturbed.quantize(palette=palette, dither=Image.Dither.NONE).convert('RGB')


def convert(image, entry, setting, size, intermediates=None):
    n = setting['grid']
    algorithm = setting['algorithm']
    small = image.resize((n, n), R.LANCZOS)
    if algorithm == 'baseline':
        prepared = small
    elif algorithm == 'cluster':
        # Rank filtering merges photographic speckle before palette clustering.
        prepared = ImageEnhance.Color(small.filter(ImageFilter.MedianFilter(3))).enhance(1.18)
        prepared = ImageEnhance.Contrast(prepared).enhance(1.12)
    elif algorithm == 'contour':
        # Posterized tonal planes plus a local dark-line extraction.
        smooth = small.filter(ImageFilter.GaussianBlur(.8))
        a = np.asarray(smooth).astype(float)
        gray = np.asarray(ImageOps.grayscale(small)).astype(float)
        dark = np.maximum(0, np.asarray(ImageOps.grayscale(smooth)).astype(float) - gray - 5)
        planes = np.round(a / 28) * 28
        prepared = Image.fromarray(np.uint8(np.clip(planes - np.minimum(dark, 22)[..., None], 0, 255)))
    elif algorithm == 'feature':
        # Coarse skin planes, fine original structure at protected regions and edges.
        coarse = image.resize((max(16, n//2),)*2, R.LANCZOS).filter(ImageFilter.MedianFilter(3)).resize((n,n), R.BILINEAR)
        a = np.asarray(small).astype(float)
        base = np.asarray(coarse).astype(float)
        gray = np.asarray(ImageOps.grayscale(small)).astype(float)
        gy, gx = np.gradient(gray)
        edge = np.clip((np.hypot(gx,gy)-12)/40,0,.65)[...,None]
        protection = np.maximum(features(n,entry), edge)
        mixed = base*(1-protection) + a*protection
        prepared = Image.fromarray(np.uint8(np.clip(mixed,0,255)))
        prepared = ImageEnhance.Color(prepared).enhance(1.12)
    elif algorithm == 'structure':
        # Revision after observed pupil loss: recover small high-contrast dark
        # structures everywhere, so protection does not depend on framing priors.
        a=np.asarray(small).astype(float)
        smooth=small.filter(ImageFilter.GaussianBlur(.85))
        base=np.asarray(smooth).astype(float)
        gray=np.asarray(ImageOps.grayscale(small)).astype(float)
        local=np.asarray(ImageOps.grayscale(smooth)).astype(float)
        dark=np.clip((local-gray-2)/10,0,1)[...,None]
        gy,gx=np.gradient(gray)
        edge=np.clip((np.hypot(gx,gy)-8)/26,0,.85)[...,None]
        protect=np.maximum(dark,edge)
        mixed=base*(1-protect)+a*protect
        prepared=Image.fromarray(np.uint8(np.clip(mixed,0,255)))
        # Keep photometric identity; avoid increasing contrast on deep shadows.
        if setting['dither']:
            # Dither only strong textured transitions; skin planes remain clean.
            tile=np.tile(BAYER,((n+3)//4,(n+3)//4))[:n,:n,None]
            prepared=Image.fromarray(np.uint8(np.clip(mixed+tile*12*edge*(1-dark),0,255)))
    else:
        raise ValueError(algorithm)
    result = quantize(prepared, setting['colors'], setting['dither'] if algorithm!='structure' else 0)
    if intermediates is not None:
        intermediates.update(sampled=small, prepared=prepared, palette=result)
    return result.resize((size,size), R.NEAREST)


def name(s):
    return f"{s['algorithm']}-c{s['colors']}-g{s['grid']}-d{s['dither']}"


def encode(image):
    results = {}
    for fmt, options in [('png', dict(optimize=True)), ('webp', dict(lossless=True, method=6)),
                         ('webp-q85', dict(quality=85, method=6))]:
        buffer = io.BytesIO()
        image.save(buffer, format='PNG' if fmt=='png' else 'WEBP', **options)
        results[fmt] = buffer.getvalue()
    return results


def run(manifest_path, output, algorithms=None):
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    if not manifest['portraits']:
        raise ValueError('No photographic inputs. Populate manifest.json; see README.md. No substitute images are used.')
    output.mkdir(parents=True, exist_ok=True)
    settings = list(variants(algorithms))
    families=list(dict.fromkeys(s['algorithm'] for s in settings))
    records, provenance, faces = [], [], []
    seen = set()
    for entry in manifest['portraits']:
        identifier = entry['id']
        if not identifier or any(c not in 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_' for c in identifier) or identifier in seen:
            raise ValueError('IDs must be unique safe filenames')
        seen.add(identifier)
        path = manifest_path.parent / entry['file']
        raw = path.read_bytes()
        digest = hashlib.sha256(raw).hexdigest()
        if entry.get('sha256') and entry['sha256'] != digest:
            raise ValueError(f'Input hash mismatch: {identifier}')
        source = frame(Image.open(io.BytesIO(raw)),entry)
        faces.append((entry,source))
        provenance.append(dict(entry,sha256=digest))
        folder = output / identifier
        folder.mkdir(exist_ok=True)
        source.save(folder/'framed.png')
        for setting, size in itertools.product(settings,[128,256]):
            intermediate = {}
            result = convert(source, entry, setting, size, intermediate)
            stem = f'{name(setting)}-{size}'
            for fmt, data in encode(result).items():
                ext = 'png' if fmt=='png' else 'webp'
                (folder/f'{stem}.{fmt}.{ext}').write_bytes(data)
                records.append(dict(id=identifier,setting=name(setting),size=size,format=fmt,bytes=len(data)))
            if size == 128:
                for stage, image in intermediate.items():
                    image.save(folder/f'{name(setting)}-{stage}.png')
    # One sheet per family and resolution, up to four faces per page; every sweep variant shown.
    for size, family in itertools.product([128,256],families):
        subset = [s for s in settings if s['algorithm']==family]
        for start in range(0,len(faces),4):
            batch = faces[start:start+4]
            cell = size + 12
            sheet = Image.new('RGB', ((len(batch)+1)*cell, (len(subset)+1)*(size+30)), '#181c24')
            draw = ImageDraw.Draw(sheet)
            for col,(entry,source) in enumerate(batch,1):
                sheet.paste(source.resize((size,size),R.LANCZOS),(col*cell,0))
                draw.text((col*cell,size+3),entry['id'],fill='white')
            for row,setting in enumerate(subset,1):
                y=row*(size+30)
                draw.text((4,y+8),name(setting).replace('-','\n'),fill='white')
                for col,(entry,source) in enumerate(batch,1):
                    sheet.paste(convert(source,entry,setting,size),(col*cell,y))
            sheet.save(output/f'sheet-{family}-{size}-{start//4+1}.png')
    with (output/'sizes.csv').open('w',newline='',encoding='utf-8') as f:
        writer=csv.DictWriter(f,fieldnames=['id','setting','size','format','bytes'])
        writer.writeheader(); writer.writerows(records)
    for size in [128,256]:
        for start in range(0,len(faces),6):
            batch=faces[start:start+6]
            sheet=Image.new('RGB',((len(families)+1)*(size+12),len(batch)*(size+30)+24),'#181c24')
            draw=ImageDraw.Draw(sheet)
            for col,label in enumerate(['source']+families):
                draw.text((col*(size+12)+4,4),label,fill='white')
            for row,(entry,source) in enumerate(batch):
                y=24+row*(size+30)
                sheet.paste(source.resize((size,size),R.LANCZOS),(0,y))
                for col,family in enumerate(families,1):
                    setting=dict(algorithm=family,colors=32,grid=96,dither=0)
                    sheet.paste(convert(source,entry,setting,size),(col*(size+12),y))
                draw.text((4,y+size+3),entry['id'],fill='white')
            sheet.save(output/f'comparison-{size}-{start//6+1}.png')
    with (output/'review.csv').open('w',newline='',encoding='utf-8') as f:
        writer=csv.writer(f)
        writer.writerow(['id','setting','size','pupils','eye_asymmetry','mouth_contour','nose','hair_silhouette','skin_noise','identity','preference','notes'])
        for entry,_ in faces:
            for setting,size in itertools.product(settings,[128,256]):
                writer.writerow([entry['id'],name(setting),size]+['']*9)
    (output/'run.json').write_text(json.dumps(dict(inputs=provenance,settings=settings,
        python=platform.python_version(),pillow=pillow_version,numpy=np.__version__,
        tool_sha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest()),indent=2)+'\n')
    print(f'{len(faces)} inputs; {len(records)} measured files; sheets saved to {output}')


if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest',type=Path,default=ROOT/'manifest.json')
    parser.add_argument('--output',type=Path,default=ROOT/'results')
    parser.add_argument('--algorithms',nargs='+',choices=['baseline','cluster','contour','feature','structure'])
    args=parser.parse_args()
    try:
        run(args.manifest.resolve(),args.output.resolve(),args.algorithms)
    except (ValueError,KeyError,FileNotFoundError) as e:
        parser.exit(2,f'{e}\n')
