"""Deterministic full-sphere stellar texture; authoring only (NumPy/Pillow)."""
import argparse
import hashlib
from pathlib import Path
import numpy as np
from PIL import Image, ImageFilter


def generate(width=8192, seed=76841):
    height=width//2
    rng=np.random.default_rng(seed)
    structure_rng=np.random.default_rng(seed+1)
    # Randomly oriented waves on the sphere avoid a repeating grid or a panorama seam.
    waves=[]
    for frequency, amplitude in [(4,.85),(9,.6),(19,.32),(43,.16)]:
        directions=structure_rng.normal(size=(9,3))
        directions/=np.linalg.norm(directions,axis=1)[:,None]
        waves.extend((direction*frequency,structure_rng.uniform(0,2*np.pi),amplitude/3)
                     for direction in directions)
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
        clouds=sum(amplitude*np.sin(x*d[0]+y*d[1]+z*d[2]+phase)
                   for d,phase,amplitude in waves)
        lane=np.exp(-((latitude+.1*np.sin(x*11+y*8))/.065)**2)
        clumps=np.clip(.2+np.exp(clouds*1.35)*.6,0,2)
        stream=(.18+main*.65+branch*.35)*clumps*(1-lane*.7)
        shape=x.shape
        density=np.clip(.045+stream*.22,0,.45)*np.sin(theta[:,None])
        stars=rng.random(shape)<density
        # Most of the stellar population is barely resolved photographic grain,
        # not a carpet of equally legible white pinpoints.
        flux=(.009+.17*rng.random(shape)**10)*stars
        # Mostly neutral unresolved stars, with restrained warm/cool populations.
        warm=rng.random(shape)
        temperature=np.stack([.83+warm*.17,.9+warm*.05,1.-warm*.3],axis=-1)
        haze=np.array([.001,.002,.003])+stream[...,None]*np.array([.004,.004,.005])
        color=haze+flux[...,None]*temperature
        output[row:row+len(theta)]=np.rint(np.clip(color,0,1)*255).astype(np.uint8)
    field=Image.fromarray(output)
    softened=field.filter(ImageFilter.GaussianBlur(max(.15,width/8192*.65)))
    output=np.asarray(Image.blend(field,softened,.75)).copy()
    # A sparse second population has resolved cores and broad, very faint halos.
    # Draw in angular coordinates so these stars stay round away from the equator.
    bright_rng=np.random.default_rng(seed+2)
    for i in range(180):
        u=bright_rng.random()*width
        latitude=np.arcsin(bright_rng.uniform(-1,1))
        v=(.5-latitude/np.pi)*height
        large=i<24
        sigma=width/8192*bright_rng.uniform(1.6,3.8) if large else width/8192*bright_rng.uniform(.5,1.2)
        sigma=max(.32,sigma)
        halo=sigma*(6 if large else 3)
        stretch=1/max(.06,np.cos(latitude))
        radius=int(np.ceil(halo*3))
        xs=np.arange(int(u-radius*stretch),int(u+radius*stretch)+1)
        ys=np.arange(max(0,int(v-radius)),min(height,int(v+radius)+1))
        r2=((xs[None,:]-u)/stretch)**2+(ys[:,None]-v)**2
        profile=1.9*np.exp(-r2/(2*sigma*sigma))
        profile+=(.12 if large else .035)*np.exp(-r2/(2*halo*halo))
        tint=np.array([.68,.82,1.]) if bright_rng.random()<.65 else np.array([1.,.72,.43])
        patch=output[ys[:,None],xs[None,:]%width].astype(float)/255
        patch=1-(1-patch)*np.exp(-profile[...,None]*tint)
        output[ys[:,None],xs[None,:]%width]=np.rint(patch*255).astype(np.uint8)
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
