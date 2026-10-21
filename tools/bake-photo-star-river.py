"""Offline spherical projection of an imagegen stellar texture panel (NumPy/Pillow)."""
import argparse
from pathlib import Path
import numpy as np
from PIL import Image


def sample(tile,u,v):
    h,w=tile.shape[:2]
    x=(u%1)*w;y=(v%1)*h
    ix=np.floor(x).astype(int);iy=np.floor(y).astype(int)
    fx=(x-ix)[...,None];fy=(y-iy)[...,None]
    return ((1-fx)*tile[iy%h,ix%w]+fx*tile[iy%h,(ix+1)%w])*(1-fy)+((1-fx)*tile[(iy+1)%h,ix%w]+fx*tile[(iy+1)%h,(ix+1)%w])*fy


def patch_frames():
    rng=np.random.default_rng(97342)
    frames=[]
    for i in range(64):
        z=1-2*(i+.5)/64
        phi=i*np.pi*(3-np.sqrt(5))
        center=np.array([np.sqrt(1-z*z)*np.cos(phi),np.sqrt(1-z*z)*np.sin(phi),z])
        east=np.array([-np.sin(phi),np.cos(phi),0])
        north=np.cross(center,east)
        roll=rng.uniform(0,2*np.pi)
        right=east*np.cos(roll)+north*np.sin(roll)
        up=north*np.cos(roll)-east*np.sin(roll)
        frames.append((center,right,up,rng.uniform(.44,.56,2)))
    return frames


def project(tile,rays,frames):
    color=np.zeros(rays.shape,dtype=np.float32)
    total=np.zeros(rays.shape[:-1],dtype=np.float32)
    edge=np.cos(np.deg2rad(34))
    extent=np.tan(np.deg2rad(34))*1.2
    for center,right,up,offset in frames:
        depth=np.einsum('...k,k->...',rays,center)
        visible=depth>edge
        if not visible.any():continue
        local=rays[visible]
        u=offset[0]+np.einsum('...k,k->...',local,right)/depth[visible]/extent*.5
        v=offset[1]+np.einsum('...k,k->...',local,up)/depth[visible]/extent*.5
        weight=((depth[visible]-edge)/(1-edge))**3
        color[visible]+=sample(tile,u,v)*weight[:,None]
        total[visible]+=weight
    if np.any(total<=0):raise ValueError('Spherical patch coverage has a hole')
    return color/total[...,None]


def bake(source,width=8192):
    tile=np.asarray(source.convert('RGB'),dtype=np.float32)/255
    result=np.empty((width//2,width,3),dtype=np.uint8)
    phi=((np.arange(width,dtype=np.float32)+.5)/width-.5)*2*np.pi
    frames=patch_frames()
    for start in range(0,width//2,32):
        theta=(np.arange(start,min(start+32,width//2),dtype=np.float32)+.5)/(width//2)*np.pi
        x=np.sin(theta[:,None])*np.cos(phi);y=np.sin(theta[:,None])*np.sin(phi)
        z=np.cos(theta[:,None])+phi*0
        # Independent tangent patches feather radially, never along cube faces.
        # Each panel is only sampled inside its border, so tile edges cannot form
        # meridians or folded corners in the final equirectangular panorama.
        color=project(tile,np.stack([x,y,z],axis=-1),frames)
        color*=.72
        result[start:start+len(theta)]=np.rint(np.clip(color,0,1)*255).astype(np.uint8)
    return Image.fromarray(result)


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source',type=Path,required=True)
    parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args()
    bake(Image.open(args.source)).save(args.output,quality=96,subsampling=0)
    print(args.output)
