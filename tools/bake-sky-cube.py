"""Six shared-origin 90-degree perspective captures of inward-facing sky cards.

Reuses compose-skybox's card intersection, bilinear sampling and blend policy.
PNG row zero maps to cube texture t=0 (UNPACK_FLIP_Y_WEBGL=false).
"""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import numpy as np
from PIL import Image

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('composer', Path(__file__).with_name('compose-skybox.py'))
composer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(composer)
# WebGL cube sampling basis: forward, image-right, image-top.
CAMERAS = {
    'px': ([1,0,0], [0,0,-1], [0,1,0]),
    'nx': ([-1,0,0], [0,0,1], [0,1,0]),
    'py': ([0,1,0], [1,0,0], [0,0,-1]),
    'ny': ([0,-1,0], [1,0,0], [0,0,1]),
    'pz': ([0,0,1], [1,0,0], [0,1,0]),
    'nz': ([0,0,-1], [-1,0,0], [0,1,0]),
}

def rays(face, x, y):
    forward, right, up = map(np.asarray, CAMERAS[face])
    value = forward + np.asarray(x)[...,None]*right + np.asarray(y)[...,None]*up
    return value / np.linalg.norm(value, axis=-1, keepdims=True)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('recipe', type=Path)
    parser.add_argument('--size', type=int, choices=[256,512,1024,2048], default=1024)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    layout = json.loads(args.recipe.read_text(encoding='utf-8'))
    composer.validate(layout)
    images = {k:composer.load_asset(args.recipe.parent/v['file']) for k,v in layout['library'].items()}
    args.output.mkdir(parents=True, exist_ok=True)
    manifest = {'version':1, 'projection':'six-perspective-cameras', 'size':args.size,
        'origin':[0,0,0], 'fovDegrees':90, 'aspect':1, 'near':0.01, 'far':10,
        'cardDistance':1, 'worldUp':'+Z', 'flipY':False,
        'color':'display RGB, screen blend, no exposure adaptation',
        'timestamp':0, 'stars':'separate runtime pass', 'faces':{}}
    manifest['sources']={key:{'file':value['file'],'sha256':hashlib.sha256((args.recipe.parent/value['file']).read_bytes()).hexdigest()}
        for key,value in layout['library'].items()}
    for name, (forward, right, up) in CAMERAS.items():
        output = np.zeros((args.size,args.size,3), dtype=np.uint8)
        axis = (np.arange(args.size)+.5)*2/args.size-1
        for start in range(0,args.size,32):
            x,y = np.meshgrid(axis, -axis[start:start+32])
            output[start:start+len(y)] = np.rint(composer.composite(rays(name,x,y),layout,images)*255).astype(np.uint8)
        filename=name+'.png'
        Image.fromarray(output).save(args.output/filename)
        manifest['faces'][name]={'file':filename,'forward':forward,'right':right,'imageTop':up,
            'sha256':hashlib.sha256((args.output/filename).read_bytes()).hexdigest()}
        # Axis diagnostic uses exactly the same cameras and row convention.
        axis64=(np.arange(64)+.5)*2/64-1
        x,y=np.meshgrid(axis64,-axis64)
        Image.fromarray(np.rint((rays(name,x,y)+1)*127.5).astype(np.uint8)).save(args.output/('axis-'+filename))
    manifest['recipeSha256']=hashlib.sha256(args.recipe.read_bytes()).hexdigest()
    (args.output/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8',newline='\n')
    print(f'Six {args.size} x {args.size} perspective faces: {args.output}')

if __name__ == '__main__':
    main()
