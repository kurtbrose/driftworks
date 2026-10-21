"""Bake unique imagegen regions into one feathered spherical panorama (offline)."""
import argparse
import hashlib
import json
from pathlib import Path
import numpy as np
from PIL import Image


def load_regions(recipe_path):
    recipe=json.loads(recipe_path.read_text(encoding='utf-8'))
    regions=[];seen=set()
    for item in recipe['regions']:
        path=(recipe_path.parent/item['file']).resolve()
        digest=hashlib.sha256(path.read_bytes()).hexdigest()
        if digest in seen:raise ValueError('Every region must use unique source artwork')
        if digest!=item['sha256']:raise ValueError('Source changed: '+item['file'])
        seen.add(digest)
        srgb=np.asarray(Image.open(path).convert('RGB'),dtype=np.float32)/255
        linear=np.where(srgb<=.04045,srgb/12.92,((srgb+.055)/1.055)**2.4)
        yaw,pitch=np.deg2rad([item['yaw'],item['pitch']])
        center=np.array([np.cos(pitch)*np.cos(yaw),np.cos(pitch)*np.sin(yaw),np.sin(pitch)])
        right=np.array([-np.sin(yaw),np.cos(yaw),0])
        up=np.cross(center,right)
        regions.append((linear,center,right,up))
    return recipe,regions


def sample(image,u,v):
    h,w=image.shape[:2]
    x=np.clip(u,0,1)*(w-1);y=np.clip(v,0,1)*(h-1)
    ix=np.floor(x).astype(int);iy=np.floor(y).astype(int)
    fx=(x-ix)[:,None];fy=(y-iy)[:,None]
    return ((1-fx)*image[iy,ix]+fx*image[iy,np.minimum(ix+1,w-1)])*(1-fy)+((1-fx)*image[np.minimum(iy+1,h-1),ix]+fx*image[np.minimum(iy+1,h-1),np.minimum(ix+1,w-1)])*fy


def project(rays,regions,radius=58):
    color=np.zeros(rays.shape,dtype=np.float32)
    total=np.zeros(rays.shape[:-1],dtype=np.float32)
    angle_limit=np.deg2rad(radius);edge=np.cos(angle_limit)
    for image,center,right,up in regions:
        depth=np.einsum('...k,k->...',rays,center);visible=depth>edge
        if not visible.any():continue
        local=rays[visible]
        angle=np.arccos(np.clip(depth[visible],-1,1))
        angular_scale=angle/np.maximum(np.sin(angle),1e-8)/(angle_limit*1.15)*.5
        # Azimuthal equidistant caps keep radial angular scale constant. A wide
        # gnomonic/tangent projection magnifies the central source texels badly.
        u=.5+np.einsum('...k,k->...',local,right)*angular_scale
        v=.5-np.einsum('...k,k->...',local,up)*angular_scale
        # Raised-cosine alpha, zero slope at each window's center and edge.
        t=(depth[visible]-edge)/(1-edge)
        weight=(.5-.5*np.cos(np.pi*t))**2
        color[visible]+=sample(image,u,v)*weight[:,None];total[visible]+=weight
    if np.any(total<=0):raise ValueError('Layout leaves uncovered sky')
    return color/total[...,None]


def bake(recipe_path,width=8192):
    recipe,regions=load_regions(recipe_path)
    output=np.empty((width//2,width,3),dtype=np.uint8)
    phi=((np.arange(width,dtype=np.float32)+.5)/width-.5)*2*np.pi
    for row in range(0,width//2,32):
        theta=(np.arange(row,min(row+32,width//2),dtype=np.float32)+.5)/(width//2)*np.pi
        x=np.sin(theta[:,None])*np.cos(phi);y=np.sin(theta[:,None])*np.sin(phi);z=np.cos(theta[:,None])+phi*0
        linear=project(np.stack([x,y,z],axis=-1),regions,recipe['radiusDeg'])*recipe['linearGain']
        linear=linear/(1+linear*recipe.get('highlightCompression',0))
        srgb=np.where(linear<=.0031308,linear*12.92,1.055*np.maximum(linear,0)**(1/2.4)-.055)
        output[row:row+len(theta)]=np.rint(np.clip(srgb,0,1)*255).astype('uint8')
    return Image.fromarray(output)


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--recipe',type=Path,required=True)
    parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--width',type=int,default=8192)
    args=parser.parse_args()
    bake(args.recipe,args.width).save(args.output,quality=96,subsampling=0)
    print(args.output,'SHA256',hashlib.sha256(args.output.read_bytes()).hexdigest())
