"""Bake reusable black-backed hero images into a deterministic spherical sky.

Authoring dependencies only: Pillow and NumPy. The deployed game needs neither.
Stars deliberately remain a separate, fixed-pixel runtime layer.
"""
import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import random
import subprocess
import sys

import numpy as np
from PIL import Image


def frame(feature):
    """Gnomonic stamp frame. Yaw 90 points along +Y; pitch 90 is +Z."""
    yaw, pitch, roll = (math.radians(feature.get(key, 0)) for key in ('yaw', 'pitch', 'roll'))
    center = np.array([math.cos(pitch)*math.cos(yaw), math.cos(pitch)*math.sin(yaw), math.sin(pitch)])
    east = np.array([-math.sin(yaw), math.cos(yaw), 0.])
    north = np.cross(center, east)
    right = east*math.cos(roll)+north*math.sin(roll)
    up = north*math.cos(roll)-east*math.sin(roll)
    return center, right, up


def validate(layout):
    if layout.get('version') != 1:
        raise ValueError('Expected layout version 1')
    seen = set()
    seen_files = set()
    for feature in layout['features']:
        asset = layout['library'][feature['asset']]
        source = str(Path(asset['file']))
        if feature['asset'] in seen or source in seen_files:
            raise ValueError('Do not repeat an asset in a sky layout')
        seen.add(feature['asset'])
        seen_files.add(source)
        if not 0 < asset['aspect'] <= 10:
            raise ValueError('Invalid asset aspect')
        if not 0 < feature['widthDeg'] < 160:
            raise ValueError('Feature width must be between 0 and 160 degrees')
        for key in ('yaw', 'pitch', 'roll', 'widthDeg', 'gain'):
            if not math.isfinite(feature[key]):
                raise ValueError(f'Non-finite {key}')
        if not -90 <= feature['pitch'] <= 90 or feature['gain'] < 0:
            raise ValueError('Invalid feature pitch or gain')
    for i, feature in enumerate(layout['features']):
        for other in layout['features'][i+1:]:
            if family(layout, feature) != family(layout, other):
                continue  # Different families are separate skies, never rendered together.
            separation = math.degrees(math.acos(np.clip(np.dot(frame(feature)[0], frame(other)[0]), -1, 1)))
            if separation < radius(layout, feature)+radius(layout, other)+layout.get('minGapDeg', 10):
                raise ValueError('Features need black space between their angular bounds')


def family(layout, feature):
    return layout['library'][feature['asset']].get('family', 'default')


def radius(layout, feature):
    aspect = layout['library'][feature['asset']]['aspect']
    return math.degrees(math.atan(math.tan(math.radians(feature['widthDeg'])/2)*math.sqrt(1+1/aspect**2)))


def selected_features(layout):
    return [feature for feature in layout['features'] if family(layout, feature) == layout.get('family', 'default')]


def sprinkle(layout, count, seed):
    """Resolve randomness once; the exported layout contains explicit placements."""
    rng = random.Random(seed)
    used = {feature['asset'] for feature in layout['features']}
    assets = sorted(key for key, asset in layout['library'].items()
                    if key not in used and asset.get('family', 'default') == layout.get('family', 'default'))
    if count > len(assets):
        raise ValueError('Not enough unique assets in this sky family; add to the library rather than repeat a feature')
    rng.shuffle(assets)
    for _ in range(count):
        asset = assets.pop()
        for attempt in range(1000):
            candidate = dict(asset=asset, yaw=rng.uniform(-180, 180),
                pitch=math.degrees(math.asin(rng.uniform(-1, 1))), roll=rng.uniform(-180, 180),
                widthDeg=rng.uniform(8, 22), gain=rng.uniform(.5, 1))
            layout['features'].append(candidate)
            try:
                validate(layout)
                break
            except ValueError:
                layout['features'].pop()
        else:
            raise ValueError('Could not place another feature with the required black-space margin')
    layout['seed'] = seed


def load_asset(path):
    image = np.asarray(Image.open(path).convert('RGBA'), dtype=np.float32)/255
    # Black is zero contribution. Native alpha is honored too; no double luminance mask.
    rgb = np.maximum(0, (image[:, :, :3] - 2/255)/(1-2/255))
    return rgb * image[:, :, 3:4]


def sample_asset(image, u, v):
    height, width = image.shape[:2]
    x = np.clip(u, 0, 1)*(width-1)
    y = np.clip(v, 0, 1)*(height-1)
    x0, y0 = np.floor(x).astype(int), np.floor(y).astype(int)
    x1, y1 = np.minimum(x0+1, width-1), np.minimum(y0+1, height-1)
    fx, fy = (x-x0)[..., None], (y-y0)[..., None]
    color = (image[y0, x0]*(1-fx)+image[y0, x1]*fx)*(1-fy)+(image[y1, x0]*(1-fx)+image[y1, x1]*fx)*fy
    # Explicit margin feather prevents rectangles even for imperfect source black levels.
    edge = np.clip(np.minimum.reduce([u, v, 1-u, 1-v])/.035, 0, 1)
    edge = edge*edge*(3-2*edge)
    return color*edge[..., None]


def composite(rays, layout, images):
    output = np.zeros(rays.shape, dtype=np.float32)
    for feature in selected_features(layout):
        asset = layout['library'][feature['asset']]
        center, right, up = frame(feature)
        depth = rays @ center
        safe_depth = np.maximum(depth, 1e-8)
        extent = math.tan(math.radians(feature['widthDeg'])/2)
        u = .5+(rays @ right)/safe_depth/extent/2
        v = .5-(rays @ up)/safe_depth/extent*asset['aspect']/2
        mask = (depth > 0) & (u >= 0) & (u <= 1) & (v >= 0) & (v <= 1)
        if not np.any(mask):
            continue
        color = np.clip(sample_asset(images[feature['asset']], u[mask], v[mask])*feature['gain'], 0, 1)
        # Screen blend matches the runtime: black is transparent, overlaps do not darken.
        output[mask] = 1-(1-output[mask])*(1-color)
    return output


def bake(layout, root, width):
    validate(layout)
    images = {key: load_asset(root / value['file']) for key, value in layout['library'].items()}
    height = width//2
    output = np.zeros((height, width, 3), dtype=np.uint8)
    longitude = ((np.arange(width, dtype=np.float32)+.5)/width-.5)*2*np.pi
    # Small row batches keep an 8K bake from allocating giant per-feature temporaries.
    for start in range(0, height, 32):
        latitude = (np.arange(start, min(start+32, height), dtype=np.float32)+.5)/height*np.pi
        rays = np.stack(np.broadcast_arrays(np.sin(latitude[:, None])*np.cos(longitude),
            np.sin(latitude[:, None])*np.sin(longitude), np.cos(latitude[:, None])+longitude*0), axis=-1)
        output[start:start+len(latitude)] = np.rint(composite(rays, layout, images)*255).astype(np.uint8)
    return Image.fromarray(output)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('layout', type=Path)
    parser.add_argument('--width', type=int, choices=[2048, 4096, 8192, 16384], default=8192)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--sprinkle', type=int, default=0, help='Add seeded placements to the baked layout')
    parser.add_argument('--seed', type=int)
    parser.add_argument('--family', help='Select a coherent library family, e.g. galaxy, nebula, sun')
    parser.add_argument('--lighting-output', type=Path, help='Also precompute the source layout lighting cache at this path')
    args = parser.parse_args()
    layout = json.loads(args.layout.read_text(encoding='utf-8'))
    if args.family:
        layout['family'] = args.family
    if not selected_features(layout):
        parser.error('No features in the selected family')
    if args.sprinkle < 0 or args.sprinkle > 100:
        parser.error('--sprinkle must be between 0 and 100')
    sprinkle(layout, args.sprinkle, args.seed if args.seed is not None else layout.get('seed', 58319))
    image = bake(layout, args.layout.parent, args.width)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    image.save(args.output, quality=96, subsampling=0)
    # Keep the exported recipe portable with paths relative to its destination.
    for asset in layout['library'].values():
        asset['file'] = Path(os.path.relpath((args.layout.parent/asset['file']).resolve(),args.output.parent.resolve())).as_posix()
    for name, filename in layout.get('extraImages', {}).items():
        layout['extraImages'][name] = Path(os.path.relpath((args.layout.parent/filename).resolve(),args.output.parent.resolve())).as_posix()
    args.output.with_suffix('.layout.json').write_text(json.dumps(layout, indent=2)+'\n', encoding='utf-8')
    if args.lighting_output:
        # Fixed authored layouts bake directly from their runtime source. If
        # sprinkling created a new layout, derive its lighting from that recipe.
        lighting_layout = args.output.with_suffix('.layout.json') if args.sprinkle else args.layout
        subprocess.run([sys.executable, str(Path(__file__).with_name('bake-sky-lighting.py')),
            '--layout', str(lighting_layout), '--output', str(args.lighting_output)], check=True)
    print(f'{args.output}: {image.width} x {image.height}; SHA256 {hashlib.sha256(args.output.read_bytes()).hexdigest()}')


if __name__ == '__main__':
    main()
