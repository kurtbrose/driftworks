"""Reduce frozen illustrations to pixel grids without inventing facial shading.

No model inference, source repainting, value binning, or old shared palette.
"""
import argparse
import csv
import hashlib
import io
import itertools
import json
from pathlib import Path
import platform

from painted_lab import ROOT, BG, cv2, np, cv_image
from PIL import Image, ImageDraw, __version__ as pillow_version

IDS=['p001-005','p001-012','p001-079','p006-005','p006-018','p006-047']
SOURCE=ROOT/'results'/'structural-v2'
MATTE=ROOT/'results'/'painted-v2'


def load_inputs():
    faces=[]
    for identifier in IDS:
        path=SOURCE/identifier/'illustration_model-intermediate-512.png'
        with Image.open(path) as image:
            rgb=np.array(image.convert('RGB'))
        with Image.open(MATTE/identifier/'matte.png') as image:
            alpha=np.array(image)>127
        points=np.array(json.loads((SOURCE/identifier/'landmarks.json').read_text())['points68'])
        faces.append(dict(id=identifier,rgb=rgb,alpha=alpha,points=points,
            source_sha256=hashlib.sha256(path.read_bytes()).hexdigest(),
            matte_sha256=hashlib.sha256((MATTE/identifier/'matte.png').read_bytes()).hexdigest(),
            landmarks_sha256=hashlib.sha256((SOURCE/identifier/'landmarks.json').read_bytes()).hexdigest()))
    return faces


def protect_features(points):
    mask=np.zeros((512,512),np.uint8)
    for part in [points[36:42],points[42:48],points[17:22],points[22:27],points[48:60],points[31:36]]:
        cv2.fillConvexPoly(mask,cv2.convexHull(part.astype(np.float32)).astype(np.int32),255)
    # Source landmarks are approximate after illustration inference. This is a
    # generous protection region, not a claim of exact illustrated eyelid parsing.
    mask=cv2.dilate(mask,np.ones((17,17),np.uint8))
    return cv2.GaussianBlur(mask.astype(float)/255,(0,0),3)


def cells(a,n):
    # An intermediate carrier supports a non-divisor grid without cropping.
    # At grid 96 this is 576 samples, then exact 6x6 cells. Divisor grids keep
    # the original samples. Both RGB and masks use the same coordinate mapping.
    extent=int(np.ceil(a.shape[0]/n))*n
    if a.shape[0]!=extent:
        a=cv2.resize(a,(extent,extent),interpolation=cv2.INTER_LINEAR)
    b=extent//n
    if a.ndim==3:
        return a.reshape(n,b,n,b,a.shape[2]).transpose(0,2,1,3,4).reshape(n,n,b*b,a.shape[2])
    return a.reshape(n,b,n,b).transpose(0,2,1,3).reshape(n,n,b*b)


def sample(rgb,alpha,protection,n,method):
    colors=cells(rgb.astype(float),n)
    coverage=cells(alpha.astype(float),n)
    foreground=coverage.mean(axis=2)>=.5
    denominator=coverage.sum(axis=2,keepdims=True)
    area=(colors*coverage[:,:,:,None]).sum(axis=2)/np.maximum(denominator,1)
    protected=cells(protection,n).mean(axis=2)
    if method=='feature':
        gray=rgb.astype(float)@np.array([.2126,.7152,.0722])
        gy,gx=np.gradient(gray)
        edge=np.clip(np.hypot(gx,gy)/32,0,1)
        weights=coverage*(1+2*cells(edge,n)*cells(protection,n))
        target=(colors*weights[:,:,:,None]).sum(axis=2)/np.maximum(weights.sum(axis=2)[:,:,None],1)
        # Representative source color, not a dark-pixel rule or an invented iris.
        distances=np.sum((colors-target[:,:,None,:])**2,axis=3)
        distances[coverage==0]=np.inf
        selected=np.argmin(distances,axis=2)
        yy,xx=np.mgrid[:n,:n]
        medoid=colors[yy,xx,selected]
        area=np.where((protected>.2)[:,:,None],medoid,area)
    elif method!='area':
        raise ValueError('Unknown sampling method')
    area[~foreground]=BG
    return np.uint8(np.clip(np.round(area),0,255)),foreground,protected


def build_palette(faces,count):
    # Balanced deterministic training samples from the six frozen illustrations.
    # A separate palette is not fitted to each portrait. Background gets slot 0.
    samples=[]
    for face in faces:
        colors=face['rgb'][face['alpha']]
        indices=np.linspace(0,len(colors)-1,10000,dtype=int)
        samples.append(colors[indices])
    training=np.concatenate(samples).reshape(200,300,3)
    quantized=Image.fromarray(training).quantize(colors=count-1,method=Image.Quantize.MEDIANCUT,dither=Image.Dither.NONE)
    palette=np.array(quantized.getpalette(),np.uint8).reshape(-1,3)[:count-1]
    return np.r_[np.array(BG,np.uint8)[None],palette]


def lab(a):
    return cv2.cvtColor(np.float32(a)/255,cv2.COLOR_RGB2Lab)


def assign_palette(rgb,foreground,palette):
    values=lab(rgb).reshape(-1,3)
    colors=lab(palette[None])[0]
    indices=np.empty(len(values),np.uint8)
    # Bounded chunks keep the exact nearest-color calculation small.
    for start in range(0,len(values),2048):
        delta=values[start:start+2048,None,:]-colors[None,1:,:]
        indices[start:start+2048]=np.argmin(np.sum(delta*delta,axis=2),axis=1)+1
    indices=indices.reshape(rgb.shape[:2]);indices[~foreground]=0
    return indices


def clean_clusters(indices,sampled,foreground,protected,palette):
    """Merge only tiny low-contrast components outside protected features/outline."""
    result=indices.copy();changes=np.zeros(indices.shape,np.uint8)
    n=indices.shape[0]
    limit=max(2,round(n*n*.0005))
    colors=lab(palette[None])[0]
    original=lab(sampled)
    border=foreground&~cv2.erode(foreground.astype(np.uint8),np.ones((3,3),np.uint8)).astype(bool)
    rejected=protected>.1
    count=0
    for index in np.unique(indices):
        if index==0:
            continue
        number,labels,stats,_=cv2.connectedComponentsWithStats(np.uint8(indices==index),8)
        for component in range(1,number):
            if stats[component,cv2.CC_STAT_AREA]>limit:
                continue
            region=labels==component
            if np.any(region&(border|rejected)):
                continue
            ring=cv2.dilate(region.astype(np.uint8),np.ones((3,3),np.uint8)).astype(bool)&~region
            neighbors=np.unique(indices[ring]);neighbors=neighbors[(neighbors!=index)&(neighbors!=0)]
            if not len(neighbors):
                continue
            target=original[region].mean(axis=0)
            replacement=neighbors[np.argmin(np.sum((colors[neighbors]-target)**2,axis=1))]
            # Fixed, conservative color-error budget. Never merge a dark mole,
            # pupil or line into skin merely because its component is small.
            if np.linalg.norm(colors[replacement]-colors[index])>4:
                continue
            before=np.mean(np.sum((original[region]-colors[index])**2,axis=1))
            after=np.mean(np.sum((original[region]-colors[replacement])**2,axis=1))
            if after-before>6:
                continue
            result[region]=replacement;changes[region]=255;count+=1
    return result,changes,count


def settings(grids=(64,96,128)):
    for grid in grids:
        for sampling in ['area','feature']:
            yield dict(grid=grid,sampling=sampling,colors=0,cleanup=False)
            for colors in [128,256]:
                yield dict(grid=grid,sampling=sampling,colors=colors,cleanup=False)
        for colors in [128,256]:
            yield dict(grid=grid,sampling='feature',colors=colors,cleanup=True)


def label(setting):
    return f"g{setting['grid']}-{setting['sampling']}-{'rgb' if not setting['colors'] else 'c'+str(setting['colors'])}{'-clean' if setting['cleanup'] else ''}"


def encode(image,palette=None):
    png=image
    if palette is not None:
        # Exact lookup, avoiding approximate palette remapping by the encoder.
        mapping={tuple(color):i for i,color in enumerate(palette)}
        data=np.asarray(image)
        values=np.array([mapping[tuple(color)] for color in data.reshape(-1,3)],np.uint8).reshape(data.shape[:2])
        png=Image.fromarray(values).convert('P')
        png.putpalette(palette.reshape(-1).tolist()+[0]*(768-palette.size))
    blobs={}
    for fmt,img,options in [('png',png,dict(optimize=True)),('webp',image,dict(lossless=True,method=6))]:
        buffer=io.BytesIO();img.save(buffer,format=fmt.upper(),**options);raw=buffer.getvalue()
        with Image.open(io.BytesIO(raw)) as decoded:
            assert decoded.convert('RGB').tobytes()==image.tobytes()
        blobs[fmt]=raw
    return blobs


def run(output,grids=(64,96,128)):
    if output.exists():
        raise ValueError('Use a new output directory; previous runs are controls')
    cv2.setNumThreads(1)
    faces=load_inputs();palettes={n:build_palette(faces,n) for n in [128,256]}
    output.mkdir(parents=True)
    palette_data={str(n):p.tolist() for n,p in palettes.items()}
    (output/'palettes.json').write_text(json.dumps(palette_data,indent=2)+'\n')
    records=[];sizes=[];outputs={};cleanup_records=[]
    for face in faces:
        folder=output/face['id'];folder.mkdir()
        protection=protect_features(face['points'])
        cv_image(np.repeat(protection[:,:,None]*255,3,axis=2)).save(folder/'feature-mask.png')
        for setting in settings(grids):
            key=label(setting);n=setting['grid']
            sampled,foreground,protected=sample(face['rgb'],face['alpha'],protection,n,setting['sampling'])
            cv_image(sampled).save(folder/f'{key}-sampled.png')
            palette=palettes.get(setting['colors'])
            if palette is None:
                result=sampled
            else:
                indices=assign_palette(sampled,foreground,palette)
                if setting['cleanup']:
                    indices,changes,count=clean_clusters(indices,sampled,foreground,protected,palette)
                    Image.fromarray(changes).save(folder/f'{key}-changes.png')
                    cleanup_records.append(dict(id=face['id'],setting=key,components_merged=count,pixels_changed=int(np.count_nonzero(changes))))
                result=palette[indices]
            logical=cv_image(result);logical.save(folder/f'{key}-logical.png')
            for size in [128,256]:
                image=logical.resize((size,size),Image.Resampling.NEAREST)
                for fmt,blob in encode(image,palette).items():
                    path=folder/f'{key}-{size}.{fmt}';path.write_bytes(blob)
                    sizes.append(dict(id=face['id'],setting=key,grid=n,size=size,format=fmt,bytes=len(blob)))
            outputs[(face['id'],key)]=logical
        records.append({k:face[k] for k in ['id','source_sha256','matte_sha256','landmarks_sha256']})
        print(face['id'],flush=True)
    for grid,size in itertools.product(grids,[128,256]):
        keys=[f'g{grid}-area-rgb',f'g{grid}-feature-rgb',f'g{grid}-feature-c256-clean',f'g{grid}-feature-c128-clean']
        titles=['frozen illustration',f'area {grid} RGB',f'feature {grid} RGB',f'clusters {grid}/256',f'clusters {grid}/128']
        sheet=Image.new('RGB',(5*(size+8),24+len(faces)*(size+22)),BG);draw=ImageDraw.Draw(sheet)
        for col,title in enumerate(titles):
            draw.text((col*(size+8)+3,4),title,fill='white')
        for row,face in enumerate(faces):
            reference=cv_image(face['rgb']).resize((size,size),Image.Resampling.LANCZOS)
            images=[reference]+[outputs[(face['id'],k)].resize((size,size),Image.Resampling.NEAREST) for k in keys]
            for col,image in enumerate(images):
                sheet.paste(image,(col*(size+8),24+row*(size+22)))
            draw.text((3,26+row*(size+22)+size),face['id'],fill='white')
        sheet.save(output/f'comparison-grid{grid}-at{size}.png')
    for face in faces:
        options=list(settings(grids));size=128
        sheet=Image.new('RGB',(4*160,int(np.ceil(len(options)/4))*156),BG);draw=ImageDraw.Draw(sheet)
        for i,setting in enumerate(options):
            x,y=(i%4)*160,(i//4)*156
            sheet.paste(outputs[(face['id'],label(setting))].resize((size,size),Image.Resampling.NEAREST),(x,y))
            draw.text((x+2,y+130),label(setting),fill='white')
        sheet.save(output/f'sweep-{face["id"]}.png')
    with (output/'sizes.csv').open('w',newline='',encoding='utf-8') as f:
        w=csv.DictWriter(f,fieldnames=['id','setting','grid','size','format','bytes']);w.writeheader();w.writerows(sizes)
    (output/'run.json').write_text(json.dumps(dict(inputs=records,settings=list(settings(grids)),
        source_run='results/structural-v2',model_inference=False,old_palette_used=False,
        python=platform.python_version(),opencv=cv2.__version__,numpy=np.__version__,pillow=pillow_version,
        tool_sha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        palette_sha256=hashlib.sha256((output/'palettes.json').read_bytes()).hexdigest(),
        cleanup=cleanup_records,cleanup_policy=dict(max_component_fraction=.0005,max_component_delta_lab=4,max_squared_error_increase=6)),indent=2)+'\n')
    print('Completed',len(sizes),'lossless assets')


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',type=Path,default=ROOT/'results'/'pixel-v1')
    parser.add_argument('--grids',type=int,nargs='+',choices=[64,96,128],default=[64,96,128])
    args=parser.parse_args();run(args.output,args.grids)
