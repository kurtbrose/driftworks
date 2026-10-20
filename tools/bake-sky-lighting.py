"""Precompute normalized L2 diffuse SH and compact rough-reflection maps.

Accept a hero layout or any local equirectangular image. No runtime convolution.
"""
import argparse
import importlib.util
import json
import hashlib
from pathlib import Path
import sys

import numpy as np
from PIL import Image

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('compose', Path(__file__).with_name('compose-skybox.py'))
compose = importlib.util.module_from_spec(spec)
spec.loader.exec_module(compose)


def basis(directions):
    x, y, z = np.moveaxis(directions, -1, 0)
    return np.stack([x*0+.282095, .488603*y, .488603*z, .488603*x,
        1.092548*x*y, 1.092548*y*z, .315392*(3*z*z-1), 1.092548*x*z, .546274*(x*x-y*y)], axis=-1)


def derive(image):
    pixels = np.asarray(image.convert('RGB'), dtype=np.float64)/255
    linear = np.where(pixels <= .04045, pixels/12.92, ((pixels+.055)/1.055)**2.4)
    h, w = pixels.shape[:2]
    theta = (np.arange(h)+.5)/h*np.pi
    phi = ((np.arange(w)+.5)/w-.5)*2*np.pi
    rays = np.stack(np.broadcast_arrays(np.sin(theta[:, None])*np.cos(phi),
        np.sin(theta[:, None])*np.sin(phi), np.cos(theta[:, None])+phi*0), axis=-1)
    weights = np.broadcast_to(np.sin(theta[:, None]), (h, w)).copy()
    weights *= 4*np.pi/weights.sum()
    luminance = linear @ [.2126, .7152, .0722]
    # Bound extreme highlights before estimating total energy; sparse skies are
    # normalized by solid angle, not by pixel count or a brightest-pixel light.
    active = luminance[luminance > 1e-6]
    cap = max(.02, float(np.quantile(active, .995))) if len(active) else 1
    linear *= np.minimum(1, cap/np.maximum(luminance, 1e-12))[..., None]
    average = float(((linear @ [.2126, .7152, .0722])*weights).sum()/(4*np.pi))
    gain = .42/max(average, 1e-7) if average > 1e-7 else 0
    radiance = linear*gain
    # A common modest desaturation avoids neon illumination from saturated art.
    radiance = radiance*.75+(radiance @ [.2126, .7152, .0722])[..., None]*.25
    coefficients = np.einsum('hwk,hwc,hw->kc', basis(rays), radiance, weights)
    coefficients *= np.array([1, 2/3, 2/3, 2/3, 1/4, 1/4, 1/4, 1/4, 1/4])[:, None]
    if not gain:
        coefficients[0] = np.ones(3)*(.3/.282095)
    # LDR display encoding for a small reflection texture. SH retains the full
    # normalized low-frequency energy; specular is intentionally bounded.
    encoded = np.clip(radiance, 0, 1)
    encoded = np.where(encoded <= .0031308, encoded*12.92, 1.055*encoded**(1/2.4)-.055)
    reflection = Image.fromarray(np.rint(encoded*255).astype(np.uint8)).resize((512, 256), Image.Resampling.LANCZOS)
    return dict(sh=np.round(coefficients, 8).tolist(), averageLuminance=average,
        normalization=gain, highlightCap=cap), reflection


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--layout', type=Path)
    parser.add_argument('--image', type=Path)
    parser.add_argument('--name', default='custom')
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    if bool(args.layout) == bool(args.image):
        parser.error('Choose exactly one of --layout or --image')
    args.output.parent.mkdir(parents=True, exist_ok=True)
    result = dict(version=1, method='solid-angle L2 cosine-convolved SH; bounded mipmapped radiance', families={},
        processorHash=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        composerHash=hashlib.sha256(Path(__file__).with_name('compose-skybox.py').read_bytes()).hexdigest())
    if args.layout:
        layout = json.loads(args.layout.read_text())
        families = sorted({asset['family'] for asset in layout['library'].values()})
        images = {}
        for family in families:
            layout['family'] = family
            images[family] = compose.bake(layout, args.layout.parent, 1024)
        source = args.layout.read_bytes()+b''.join((args.layout.parent/asset['file']).read_bytes() for asset in layout['library'].values())
        for name, filename in layout.get('extraImages', {}).items():
            image_path=args.layout.parent/filename
            images[name]=Image.open(image_path).convert('RGB').resize((1024,512),Image.Resampling.LANCZOS)
            source+=image_path.read_bytes()
    else:
        source_image = Image.open(args.image)
        if source_image.width != source_image.height*2:
            parser.error('--image must be a 2:1 equirectangular panorama; compose isolated features onto the sphere first')
        images = {args.name: source_image.convert('RGB').resize((1024, 512), Image.Resampling.LANCZOS)}
        source = args.image.read_bytes()
    result['sourceHash'] = hashlib.sha256(source).hexdigest()
    for name, image in images.items():
        data, reflection = derive(image)
        filename = args.output.stem+'-'+name+'.png'
        reflection.save(args.output.parent/filename)
        data['map'] = filename
        result['families'][name] = data
    args.output.write_text(json.dumps(result, indent=2)+'\n')
    print(f'{args.output}: {len(images)} cached environments')


if __name__ == '__main__':
    main()
