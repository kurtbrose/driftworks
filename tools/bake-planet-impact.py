"""Bake the approved hero-card study to seven ordinary 4K spherical maps.

Reuses compose-skybox's projection and sampler; no artwork is synthesized.
Run with Python containing Pillow and NumPy, from any working directory.
"""
import importlib.util
import json
import sys
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('composer', Path(__file__).with_name('compose-skybox.py'))
composer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(composer)
source = ROOT / 'assets/backgrounds/planet-hero-v1'
target = source / 'baked-v1'
target.mkdir(exist_ok=True)
files = ['master.png'] + ['impact-overhead-v1/' + name + '.png' for name in ['flash', '12', '32', '60', '90', '120']]
master = np.asarray(Image.open(source / files[0]).convert('RGB'), dtype=np.float32)
h, w = master.shape[:2]
y, x = np.mgrid[:h, :w]
radius = np.sqrt(((x + .5 - w*.488)/(w*.125))**2 + ((y + .5 - h*.472)/(h*.125))**2)
mask = (1 - np.clip((radius - .72)/.28, 0, 1))[..., None]
layout = {'version': 1, 'minGapDeg': 0, 'library': {
    'planet': {'file': '../master.png', 'aspect': 1},
    'sun': {'file': '../../features/warm-sun-v1.png', 'aspect': 1}},
    'features': [dict(asset='planet', yaw=90, pitch=-30, roll=0, widthDeg=110, gain=1),
                 dict(asset='sun', yaw=225, pitch=35, roll=0, widthDeg=7, gain=1)]}
# The opaque landmark shader's U runs opposite to compose-skybox's card U.
# Mirror sampling here to preserve the approved runtime view exactly.
sun = composer.load_asset(ROOT / 'assets/backgrounds/features/warm-sun-v1.png')[:, ::-1]
width = 4096
height = width//2
longitude = ((np.arange(width, dtype=np.float32)+.5)/width-.5)*2*np.pi
for index, file in enumerate(files):
    plate = np.asarray(Image.open(source / file).convert('RGB'), dtype=np.float32)
    frozen = np.rint(master*(1-mask)+plate*mask)/255
    images = {'planet': np.maximum(0, (frozen-2/255)/(1-2/255))[:, ::-1], 'sun': sun}
    output = np.zeros((height, width, 3), dtype=np.uint8)
    for start in range(0, height, 32):
        latitude = (np.arange(start, min(start+32, height), dtype=np.float32)+.5)/height*np.pi
        rays = np.stack(np.broadcast_arrays(np.sin(latitude[:, None])*np.cos(longitude),
            np.sin(latitude[:, None])*np.sin(longitude), np.cos(latitude[:, None])+longitude*0), axis=-1)
        output[start:start+len(latitude)] = np.rint(composer.composite(rays, layout, images)*255).astype(np.uint8)
    Image.fromarray(output).save(target / f'{index}.png')
    print(f'Baked {index}: {file}', flush=True)
(target / 'recipe.json').write_text(json.dumps({'projection': 'equirectangular', 'width': width,
    'height': height, 'times': [0, .25, 12, 32, 60, 90, 120], 'sources': files,
    'mask': {'center': [.488, .472], 'radius': [.125, .125], 'solidUntil': .72},
    'layout': layout, 'mirrorSourceU': True, 'timing': 'Illustrative, not a physical simulation'}, indent=2)+'\n')
