"""Offline Lorentz boost of a Z-up equirectangular sky into six WebGL cube faces.

Authoring dependencies: NumPy, Pillow. No runtime changes or network access.
"""
import argparse
import hashlib
import importlib.util
import json
import math
import os
from pathlib import Path
import sys

import numpy as np
from PIL import Image, ImageDraw

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('cube', Path(__file__).with_name('bake-sky-cube.py'))
cube = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cube)


def inverse_boost(observed, direction, beta):
    """Directions point toward sources, rather than along photon propagation."""
    gamma = 1 / math.sqrt(1-beta*beta)
    mu = observed @ direction
    denominator = 1-beta*mu
    parallel = (mu-beta)/denominator
    transverse = (observed-mu[..., None]*direction)/(gamma*denominator[..., None])
    return transverse+parallel[..., None]*direction, 1/(gamma*denominator)


def linear(rgb):
    return np.where(rgb <= .04045, rgb/12.92, ((rgb+.055)/1.055)**2.4)


def display(rgb):
    rgb = np.maximum(rgb, 0)
    return np.where(rgb <= .0031308, rgb*12.92, 1.055*rgb**(1/2.4)-.055)


def sample(image, rays):
    h, w = image.shape[:2]
    x = (np.arctan2(rays[..., 1], rays[..., 0])/(2*np.pi)+.5)*w-.5
    y = np.arccos(np.clip(rays[..., 2], -1, 1))/np.pi*h-.5
    y = np.clip(y, 0, h-1)
    ix, iy = np.floor(x).astype(int), np.floor(y).astype(int)
    fx, fy = (x-ix)[..., None], (y-iy)[..., None]
    return ((1-fx)*image[iy, ix % w]+fx*image[iy, (ix+1) % w])*(1-fy) + ((1-fx)*image[np.minimum(iy+1,h-1), ix % w]+fx*image[np.minimum(iy+1,h-1), (ix+1) % w])*fy


def spectral_gain(doppler, temperature):
    """Approximate RGB as three monochromatic samples of a modulated blackbody.

    I'_lambda(lambda)=D^5 I_lambda(D*lambda). For a blackbody this is
    B_lambda(lambda,D*T). Original RGB modulates that assumed spectrum.
    This is NOT spectral reconstruction or a colorimetric eye response.
    """
    wavelength = np.array([610., 550., 460.])*1e-9
    exponent = .01438776877/(wavelength*temperature)
    return np.expm1(exponent)/np.expm1(np.minimum(exponent/doppler[..., None], 700))


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('source', type=Path, help='2:1 panorama; yaw=atan2(Y,X), north=+Z')
    p.add_argument('--output', type=Path, required=True)
    p.add_argument('--beta', type=float, default=.99)
    p.add_argument('--direction', type=float, nargs=3, default=[1,0,0])
    p.add_argument('--size', type=int, default=512)
    p.add_argument('--samples', type=int, default=2, help='supersampling per pixel axis')
    p.add_argument('--color', choices=['none','blackbody'], default='blackbody')
    p.add_argument('--temperature', type=float, default=6500)
    p.add_argument('--exposure', type=float, default=0, help='fixed exposure in stops')
    args = p.parse_args()
    direction = np.asarray(args.direction, dtype=float)
    if not (math.isfinite(args.beta) and 0 <= args.beta < 1 and np.all(np.isfinite(direction)) and np.linalg.norm(direction)>0):
        p.error('Require finite 0 <= beta < 1 and a nonzero finite direction')
    if not (16 <= args.size <= 4096 and 1 <= args.samples <= 8 and math.isfinite(args.temperature) and args.temperature>0 and math.isfinite(args.exposure) and abs(args.exposure)<=50):
        p.error('Invalid size, samples, temperature or exposure')
    direction /= np.linalg.norm(direction)
    source = Image.open(args.source).convert('RGB')
    if source.width != 2*source.height:
        p.error('Source must be a 2:1 equirectangular panorama')
    image = linear(np.asarray(source, dtype=np.float32)/255)
    args.output.mkdir(parents=True, exist_ok=False)
    manifest = dict(version=1, beta=args.beta, direction=direction.tolist(),
        source=Path(os.path.relpath(args.source,args.output)).as_posix(),
        sourceSha256=hashlib.sha256(args.source.read_bytes()).hexdigest(),
        size=args.size, samples=args.samples, worldUp='+Z', flipY=False,
        color=args.color, assumedTemperatureK=args.temperature, exposureStops=args.exposure,
        limitations='RGB-modulated blackbody at 610/550/460 nm; no recovered IR/UV, no eye-response integration; LDR clipping; finite source resolution.',
        faces={})
    sheet = Image.new('RGB', (3*320, 2*350))
    draw = ImageDraw.Draw(sheet)
    for face_index, (name, basis) in enumerate(cube.CAMERAS.items()):
        result = np.zeros((args.size,args.size,3), dtype=np.uint8)
        for start in range(0,args.size,16):
            rows = np.arange(start,min(start+16,args.size))
            total = np.zeros((len(rows),args.size,3))
            for sy in range(args.samples):
                for sx in range(args.samples):
                    x = (np.arange(args.size)+(sx+.5)/args.samples)*2/args.size-1
                    y = 1-(rows+(sy+.5)/args.samples)*2/args.size
                    xx, yy = np.meshgrid(x,y)
                    original, doppler = inverse_boost(cube.rays(name,xx,yy),direction,args.beta)
                    rgb = sample(image,original)
                    if args.color == 'blackbody':
                        rgb *= spectral_gain(doppler,args.temperature)
                    total += rgb
            result[start:start+len(rows)] = np.rint(np.clip(display(total/args.samples**2*2**args.exposure),0,1)*255).astype(np.uint8)
        target = args.output/(name+'.png')
        Image.fromarray(result).save(target)
        manifest['faces'][name] = dict(file=target.name,forward=basis[0],right=basis[1],imageTop=basis[2],sha256=hashlib.sha256(target.read_bytes()).hexdigest())
        col, row = face_index%3, face_index//3
        sheet.paste(Image.fromarray(result).resize((320,320)),(col*320,row*350+30))
        draw.text((col*320+8,row*350+8),name+'  '+str(basis[0]),fill='white')
    sheet.save(args.output/'contact-sheet.jpg')
    (args.output/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8',newline='\n')
    print(args.output)


if __name__ == '__main__':
    main()
