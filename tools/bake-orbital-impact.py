"""Register ImageGen event patches on the approved planet, then capture 9 x 6 faces."""
from pathlib import Path
import json
import subprocess
import sys
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
root = ROOT/'assets/backgrounds/planet-hero-orbital-v2'
target = root/'impact-registered-v1'
target.mkdir(exist_ok=True)
master = np.asarray(Image.open(root/'master.png').convert('RGB'), dtype=np.float32)
h,w = master.shape[:2]
y,x = np.mgrid[:h,:w]
cx,cy = w*.49,h*.46
roi = (x-cx)**2+(y-cy)**2 < 100**2

def center(image):
    delta = image-master
    # Track the luminous root, not the centroid of a large warm brown cloud.
    # Brightness weighting excludes cool/dark ejecta even when it is asymmetric.
    weight = (np.maximum(0,image[:,:,0]-180).astype(np.float64)**4
        * np.maximum(0,image[:,:,0]-image[:,:,2]-20)**2
        * (delta[:,:,0]-delta[:,:,2]>25)*roi)
    if weight.sum() <= 0:
        raise ValueError('Missing warm registration core')
    return float((weight*x).sum()/weight.sum()),float((weight*y).sum()/weight.sum())

def translate(image,dx,dy):
    sx,sy = np.clip(x-dx,0,w-1),np.clip(y-dy,0,h-1)
    ix,iy = sx.astype(int),sy.astype(int)
    fx,fy = (sx-ix)[...,None],(sy-iy)[...,None]
    jx,jy = np.minimum(ix+1,w-1),np.minimum(iy+1,h-1)
    return ((image[iy,ix]*(1-fx)+image[iy,jx]*fx)*(1-fy)+(image[jy,ix]*(1-fx)+image[jy,jx]*fx)*fy)

records=[]
for i in [0,1]:
    Image.fromarray(master.astype(np.uint8)).save(target/f'{i}.png')
for index,radius in [(2,30),(3,42),(4,45),(5,60),(6,75)]:
    plate=np.asarray(Image.open(root/f'impact-art-v1/{index}.png').convert('RGB'),dtype=np.float32)
    assert plate.shape==master.shape
    sx,sy=center(plate)
    dx,dy=cx-sx,cy-sy
    radial=np.hypot(x-cx,y-cy)/radius
    mask=(1-np.clip((radial-.72)/.28,0,1))[...,None]
    for _ in range(24):
        result=np.rint(np.clip(master*(1-mask)+translate(plate,dx,dy)*mask,0,255))
        ax,ay=center(result)
        if np.hypot(ax-cx,ay-cy)<.1:
            break
        dx+=cx-ax;dy+=cy-ay
    result=result.astype(np.uint8)
    ax,ay=center(result.astype(np.float32));error=float(np.hypot(ax-cx,ay-cy))
    assert error<.5,(index,error)
    assert np.array_equal(result[radial>=1],master.astype(np.uint8)[radial>=1])
    Image.fromarray(result).save(target/f'{index}.png')
    records.append(dict(stage=index,radius=radius,shift=[dx,dy],center=[ax,ay],errorPixels=error))
    print('Registered',index,'error',round(error,3),flush=True)

aftermath=np.asarray(Image.open(target/'6.png').convert('RGB'),dtype=np.float32)
regions=[(.48,.34,.04),(.57,.32,.04),(.68,.40,.035),(.58,.64,.05),(.28,.31,.035)]
mask=np.zeros((h,w),dtype=np.float32)
for u,v,r in regions:
    radial=np.hypot(x/w-u,y/h-v)/r
    mask=np.maximum(mask,1-np.clip((radial-.65)/.35,0,1))
protected=np.hypot(x/w-.49,y/h-.46)
mask*=np.clip((protected-.065)/.012,0,1)
for index in [7,8]:
    plate=np.asarray(Image.open(root/f'impact-art-v1/{index}.png').convert('RGB'),dtype=np.float32)
    result=np.rint(aftermath*(1-mask[...,None])+plate*mask[...,None]).astype(np.uint8)
    assert np.array_equal(result[protected<.065],aftermath.astype(np.uint8)[protected<.065])
    assert np.array_equal(result[mask==0],aftermath.astype(np.uint8)[mask==0])
    Image.fromarray(result).save(target/f'{index}.png')
(target/'registration.json').write_text(json.dumps(dict(center=[cx,cy],uv=[.49,.46],frames=records,
    fireRegions=regions,contact='Identical to baseline; live optical flash only',
    immutable='All pixels outside local feather masks; circular limb unchanged'),indent=2)+'\n',encoding='utf-8',newline='\n')
base=json.loads((root/'cube-recipe.json').read_text())
for index in range(9):
    recipe=json.loads(json.dumps(base))
    recipe['library']['planet']['file']=f'impact-registered-v1/{index}.png'
    file=root/f'impact-recipe-{index}.json'
    file.write_text(json.dumps(recipe,indent=2)+'\n',encoding='utf-8',newline='\n')
    subprocess.run([sys.executable,str(ROOT/'tools/bake-sky-cube.py'),str(file),'--size','1024',
        '--output',str(root/f'animation-cube-v1/{index}')],check=True)
