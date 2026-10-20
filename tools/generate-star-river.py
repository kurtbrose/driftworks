"""Deterministic full-sphere stellar texture; authoring only (NumPy/Pillow)."""
import argparse
import hashlib
from pathlib import Path
import numpy as np
from PIL import Image


def generate(width=8192, seed=76841):
    height=width//2
    rng=np.random.default_rng(seed)
    output=np.zeros((height,width,3),dtype=np.uint8)
    longitude=((np.arange(width,dtype=np.float32)+.5)/width-.5)*2*np.pi
    for row in range(0,height,64):
        theta=(np.arange(row,min(row+64,height),dtype=np.float32)+.5)/height*np.pi
        x=np.sin(theta[:,None])*np.cos(longitude)
        y=np.sin(theta[:,None])*np.sin(longitude)
        z=np.cos(theta[:,None])+longitude*0
        latitude=(.3*x+.15*y+z)/np.sqrt(1.1125)
        warp=.12*np.sin(x*7+y*5)+.07*np.sin(y*13-z*8)
        main=np.exp(-((latitude+warp)/.36)**2)
        branch=np.exp(-((latitude-.46+warp*.8)/.28)**2)
        detail=.5+.21*np.sin(x*17+y*9+np.sin(z*12))+.15*np.sin(y*31-z*19)
        lane=np.exp(-((latitude+.1*np.sin(x*11+y*8))/.065)**2)
        stream=(main*.8+branch*.45)*(.45+detail*.65)*(1-lane*.8)
        shape=x.shape
        density=(.035+stream*.21)*np.sin(theta[:,None])
        stars=rng.random(shape)<density
        flux=(.045+.8*rng.random(shape)**6)*stars
        # Mostly neutral unresolved stars, with restrained warm/cool populations.
        warm=rng.random(shape)
        temperature=np.stack([.83+warm*.17,.9+warm*.05,1.-warm*.3],axis=-1)
        haze=np.array([.006,.007,.01])+stream[...,None]*np.array([.026,.026,.029])
        color=haze+flux[...,None]*temperature
        output[row:row+len(theta)]=np.rint(np.clip(color,0,1)*255).astype(np.uint8)
    return Image.fromarray(output)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--width',type=int,choices=[2048,4096,8192],default=8192)
    parser.add_argument('--seed',type=int,default=76841)
    args=parser.parse_args()
    args.output.parent.mkdir(parents=True,exist_ok=True)
    generate(args.width,args.seed).save(args.output,quality=96,subsampling=0)
    print(f'{args.output}: {args.width} x {args.width//2}; seed {args.seed}; SHA256 {hashlib.sha256(args.output.read_bytes()).hexdigest()}')


if __name__=='__main__':
    main()
