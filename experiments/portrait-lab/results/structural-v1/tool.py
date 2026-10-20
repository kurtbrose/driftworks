"""Structural alternatives to posterization. Fixed six-case falsification study.

No 3D geometry. All model inference is local CPU. InsightFace 2D landmark weights
are non-commercial research only; this script is not a production integration.
"""
import argparse
import csv
import hashlib
import io
import json
from pathlib import Path
import sys

ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'.deps-neural'))
sys.path.insert(0,str(ROOT/'models'))
from painted_lab import cv2,np,BG,nearest_palette,cv_image
from PIL import Image,ImageDraw

IDS=['p001-005','p001-012','p001-079','p006-005','p006-018','p006-047']
LM_HASH='f001b856447c413801ef5c42091ed0cd516fcd21f2d6b79635b1e733a7109dbf'
GAN_HASH='06b88a204eb230889444ad868ee5608f4fce5d4ff7b7738acaa4209c2b8fdca7'
# Anatomical contour subset of the 106-point layout, in conventional 68 order.
MAP68=[1,10,12,14,16,3,5,7,0,23,21,19,32,30,28,26,17,
       43,48,49,51,50,102,103,104,105,101,
       72,73,74,86,78,79,80,85,84,
       35,41,42,39,37,36,89,95,96,93,91,90,
       52,64,63,71,67,68,61,58,59,53,56,55,65,66,62,70,69,57,60,54]


def verify(path,digest):
    if hashlib.sha256(path.read_bytes()).hexdigest()!=digest:
        raise ValueError('Model checksum mismatch: '+path.name)


def landmarks(image,record):
    model=ROOT/'models'/'2d106det.onnx';verify(model,LM_HASH)
    x,y,w,h=record['bbox']
    matrix=np.array(record['matrix'])
    corners=np.array([[x,y,1],[x+w,y,1],[x,y+h,1],[x+w,y+h,1]])@matrix.T
    lo,hi=corners.min(axis=0),corners.max(axis=0)
    center=(lo+hi)/2
    scale=192/(max(hi-lo)*1.5)
    crop_matrix=np.array([[scale,0,96-center[0]*scale],[0,scale,96-center[1]*scale]])
    crop=cv2.warpAffine(image,crop_matrix,(192,192),flags=cv2.INTER_LINEAR)
    net=cv2.dnn.readNetFromONNX(str(model))
    # This checkpoint has internal bn_data normalization; RGB 0..255 input.
    net.setInput(cv2.dnn.blobFromImage(crop,1,(192,192),(0,0,0),swapRB=False))
    raw=net.forward().reshape(-1,2)
    if raw.shape!=(106,2) or not np.isfinite(raw).all():
        raise ValueError('Unexpected 2D landmark output')
    xy=(raw+1)*96
    inverse=cv2.invertAffineTransform(crop_matrix)
    full=np.c_[xy,np.ones(106)]@inverse.T
    points=full[MAP68]
    # Fail rather than render a misplaced stencil.
    if not (points[36:42,0].mean()<points[42:48,0].mean() and
            points[8,1]>points[48:60,1].mean()>points[36:48,1].mean()):
        raise ValueError('Landmark topology check failed')
    return points,full


def polygon_mask(shape,points):
    mask=np.zeros(shape,np.uint8)
    cv2.fillPoly(mask,[np.int32(np.round(points))],255)
    return mask.astype(float)/255


def soft(mask,sigma):
    return np.clip(cv2.GaussianBlur(mask,(0,0),sigma),0,1)


def anatomical_masks(points,n=512):
    p=points*n/512
    # Forehead extent is a documented geometric extrapolation, not hair parsing.
    brow=p[17:27].copy()
    brow[:,1]-=(p[8,1]-p[27,1])*.42
    upper=brow[np.argsort(brow[:,0])[::-1]]
    face=polygon_mask((n,n),np.r_[p[:17],upper])
    eye=np.zeros((n,n))
    for contour in [p[36:42],p[42:48],p[17:22],p[22:27]]:
        mask=polygon_mask((n,n),cv2.convexHull(contour.astype(np.float32)).reshape(-1,2))
        eye=np.maximum(eye,cv2.dilate(mask,np.ones((9,9),np.uint8)))
    mouth=polygon_mask((n,n),p[48:60])
    mouth=cv2.dilate(mouth,np.ones((9,9),np.uint8))
    nose=polygon_mask((n,n),cv2.convexHull(p[27:36].astype(np.float32)).reshape(-1,2))
    protect=soft(np.maximum.reduce([eye,mouth,nose]),3*n/512)
    return face,protect


def feature_smooth(image,points,alpha):
    face,protect=anatomical_masks(points)
    # Spatial scale, not color thresholds: no quantization, new shadows, bands,
    # or synthetic highlights. Two-scale smoothing only inside the face region.
    base=cv2.GaussianBlur(image.astype(float),(0,0),7)
    fine=cv2.GaussianBlur(image.astype(float),(0,0),.7)
    facial=base*(1-protect[:,:,None])+fine*protect[:,:,None]
    weight=soft(face,5)[:,:,None]
    outside=cv2.GaussianBlur(image.astype(float),(0,0),1.1)
    result=outside*(1-weight)+facial*weight
    result[alpha<128]=BG
    return cv_image(result),dict(face=cv_image(np.repeat(face[:,:,None]*255,3,2)),
        protected=cv_image(np.repeat(protect[:,:,None]*255,3,2)))


def draw_region(canvas,mask,color):
    return canvas*(1-mask[:,:,None])+np.array(color)*mask[:,:,None]


def redraw(image,points,alpha,tags):
    p=points
    face,protect=anatomical_masks(p)
    skin=(face>.8)&(protect<.05)
    # Sample cheeks to select a base skin color. Samples never define boundaries.
    cheekmask=np.zeros((512,512))
    for indices in [[2,3,4,48,31,36],[12,13,14,45,35,54]]:
        cheekmask=np.maximum(cheekmask,polygon_mask((512,512),p[indices]))
    samples=image[skin&(cheekmask>.5)]
    if len(samples)<20:
        raise ValueError('Insufficient skin sample area')
    base=np.median(samples,axis=0)
    canvas=cv2.GaussianBlur(image.astype(float),(0,0),3)
    canvas=draw_region(canvas,soft(face,1),base)
    # Structural planes are anchored to jaw/eye/nose/mouth landmarks. No source
    # brightness isocontours, no forehead spots, no fixed highlight blob.
    left=polygon_mask((512,512),p[[0,1,2,3,4,5,6,7,8,57,48,31,39,36]])
    right=polygon_mask((512,512),p[[16,15,14,13,12,11,10,9,8,57,54,35,42,45]])
    ll=np.mean(image[left>.5]) if np.any(left>.5) else 0
    rr=np.mean(image[right>.5]) if np.any(right>.5) else 0
    shadow=left if ll<rr else right
    canvas=draw_region(canvas,soft(shadow*face,2),base*np.array([.81,.79,.80]))
    nose=polygon_mask((512,512),p[[27,30,33,35,34,32,31]])
    canvas=draw_region(canvas,soft(nose,1.5),base*np.array([.92,.86,.84]))
    ink=np.maximum(base*np.array([.32,.29,.34]),[22,18,24])
    # Eye shapes follow the predicted eyelid contours. The original eye pixels
    # are restored to avoid fabricating pupil locations/iris shapes.
    preserve=np.zeros((512,512))
    for contour in [p[36:42],p[42:48]]:
        mask=polygon_mask((512,512),contour)
        preserve=np.maximum(preserve,cv2.dilate(mask,np.ones((5,5),np.uint8)))
    for ids in [list(range(17,22)),list(range(22,27))]:
        path=np.int32(p[ids])
        source_color=np.median(image[np.clip(path[:,1],0,511),np.clip(path[:,0],0,511)],axis=0)
        cv2.polylines(canvas,[path],False,tuple(map(float,source_color)),4,cv2.LINE_AA)
    lip=polygon_mask((512,512),p[48:60])
    inner=polygon_mask((512,512),p[60:68])
    lip_color=np.median(image[(lip>.5)&(inner<.5)],axis=0)
    canvas=draw_region(canvas,soft(lip,.7),lip_color)
    # Nose/lip lines are actual contour positions, not image intensity bands.
    cv2.polylines(canvas,[np.int32(p[31:36])],False,tuple(map(float,ink*.95)),1,cv2.LINE_AA)
    cv2.polylines(canvas,[np.int32(p[[48,60,61,62,63,64,54]])],False,tuple(map(float,ink)),2,cv2.LINE_AA)
    if 'glasses' in tags:
        for eye in [p[36:42],p[42:48]]:
            lo=eye.min(axis=0)-[17,19];hi=eye.max(axis=0)+[17,19]
            rect=np.array([lo,[hi[0],lo[1]],hi,[lo[0],hi[1]]])
            preserve=np.maximum(preserve,polygon_mask((512,512),rect))
    if any(t in tags for t in ['beard','moustache','facial-hair']):
        beard=polygon_mask((512,512),p[[3,4,5,6,7,8,9,10,11,12,13,54,35,31,48]])
        # Weak input tags protect facial-hair regions; this is not a beard parser.
        preserve=np.maximum(preserve,.85*beard)
    preserve=soft(preserve,1.3)[:,:,None]
    source=cv2.GaussianBlur(image.astype(float),(0,0),.8)
    canvas=canvas*(1-preserve)+source*preserve
    canvas[alpha<128]=BG
    return cv_image(canvas)


def illustration_model():
    import torch
    from animegan_model import Generator
    torch.set_num_threads(1)
    torch.use_deterministic_algorithms(True)
    torch.manual_seed(1979)
    path=ROOT/'models'/'face_paint_512_v2.pt';verify(path,GAN_HASH)
    generator=Generator().eval()
    generator.load_state_dict(torch.load(path,map_location='cpu',weights_only=True))
    return generator


def illustrate(generator,image):
    import torch
    tensor=torch.from_numpy(np.array(image).transpose(2,0,1).copy()).float()[None]/127.5-1
    with torch.inference_mode():
        out=generator(tensor)[0].permute(1,2,0).numpy()
    return cv_image((out*.5+.5).clip(0,1)*255)


def export(image,fmt):
    buffer=io.BytesIO()
    image.save(buffer,format='PNG' if fmt=='png' else 'WEBP',**(dict(optimize=True) if fmt=='png' else dict(lossless=True,method=6)))
    data=buffer.getvalue()
    with Image.open(io.BytesIO(data)) as decoded:
        assert decoded.convert('RGB').tobytes()==image.tobytes()
    return data


def run(output):
    if output.exists():
        raise ValueError('New output directory required; negative controls are preserved')
    cv2.setNumThreads(1)
    output.mkdir(parents=True)
    entries={e['id']:e for e in json.loads((ROOT/'manifest.json').read_text())['portraits']}
    cache=ROOT/'results'/'painted-v2'
    records={r['id']:r for r in json.loads((cache/'run.json').read_text())['records']}
    generator=illustration_model()
    faces=[];sizes=[];provenance=[]
    for identifier in IDS:
        entry=entries[identifier];folder=output/identifier;folder.mkdir()
        with Image.open(cache/identifier/'aligned.png') as im:
            source=np.array(im.convert('RGB'))
        with Image.open(cache/identifier/'matte.png') as im:
            alpha=np.array(im)
        points,dense=landmarks(source,records[identifier])
        (folder/'landmarks.json').write_text(json.dumps(dict(points68=points.tolist(),points106=dense.tolist()),indent=2))
        debug=cv_image(source);draw=ImageDraw.Draw(debug)
        for i,(x,y) in enumerate(points):
            draw.ellipse((x-2,y-2,x+2,y+2),fill='cyan');draw.text((x+2,y),str(i),fill='yellow')
        debug.save(folder/'landmarks.png')
        feature,stages=feature_smooth(source,points,alpha)
        vector=redraw(source,points,alpha,entry['tags'])
        neural=illustrate(generator,source)
        neural.save(folder/'model-unmasked-512.png')
        neural_array=np.array(neural);neural_array[alpha<128]=BG;neural=cv_image(neural_array)
        for name,image in stages.items():
            image.save(folder/f'mask-{name}.png')
        results=dict(feature_smooth=feature,region_redraw=vector,illustration_model=neural)
        for method,image in results.items():
            image.save(folder/f'{method}-intermediate-512.png')
            for size in [128,256]:
                rendered=image.resize((size,size),Image.Resampling.LANCZOS)
                # Diagnostic only: the OLD palette can reintroduce banding.
                # This is a fixed ablation, not another posterization sweep.
                pal=cv_image(nearest_palette(np.array(rendered)))
                mask=cv2.resize(alpha,(size,size),interpolation=cv2.INTER_NEAREST)>127
                a=np.array(pal);a[~mask]=BG;pal=cv_image(a)
                for treatment,img in [('rgb',rendered),('palette-control',pal)]:
                    for fmt in ['png','webp']:
                        data=export(img,fmt)
                        filename=f'{method}-{treatment}-{size}.{fmt}'
                        (folder/filename).write_bytes(data)
                        sizes.append(dict(id=identifier,method=method,treatment=treatment,size=size,format=fmt,bytes=len(data)))
        isolated=source.copy();isolated[alpha<128]=BG
        with Image.open(cache/identifier/'painted-g128-v7-128.png.png') as im:
            negative=im.convert('RGB')
        faces.append((identifier,cv_image(isolated),negative,results))
        provenance.append(dict(id=identifier,input_sha256=entry['sha256'],aligned_sha256=hashlib.sha256((cache/identifier/'aligned.png').read_bytes()).hexdigest(),negative_sha256=hashlib.sha256((cache/identifier/'painted-g128-v7-128.png.png').read_bytes()).hexdigest()))
        print(identifier,flush=True)
    for size in [128,256]:
        sheet=Image.new('RGB',(5*(size+8),24+len(faces)*(size+22)),BG);draw=ImageDraw.Draw(sheet)
        for col,title in enumerate(['source','NEGATIVE painted','feature smooth','region redraw','illustration model']):
            draw.text((col*(size+8)+3,4),title,fill='white')
        for row,(identifier,source,negative,results) in enumerate(faces):
            images=[source,negative]+list(results.values())
            for col,image in enumerate(images):
                sheet.paste(image.resize((size,size),Image.Resampling.NEAREST if col==1 else Image.Resampling.LANCZOS),(col*(size+8),24+row*(size+22)))
            draw.text((3,24+row*(size+22)+size+2),identifier,fill='white')
        sheet.save(output/f'comparison-{size}.png')
    with (output/'sizes.csv').open('w',newline='',encoding='utf-8') as f:
        w=csv.DictWriter(f,fieldnames=['id','method','treatment','size','format','bytes']);w.writeheader();w.writerows(sizes)
    import torch
    (output/'run.json').write_text(json.dumps(dict(inputs=provenance,models=dict(landmark=LM_HASH,illustration=GAN_HASH),
        tool_sha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        architecture_sha256=hashlib.sha256((ROOT/'models'/'animegan_model.py').read_bytes()).hexdigest(),
        opencv=cv2.__version__,numpy=np.__version__,torch=torch.__version__,
        settings=dict(skin_blur_sigma=7,spatial_detail_sigma=.7,model_input=512,model_cpu_threads=1,
            model_deterministic=True,model_seed=1979,palette_control='unchanged painted-v2 67-color palette',
            no_posterization=True)),indent=2)+'\n')
    print('Completed',len(sizes),'encoded files')


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--output',type=Path,default=ROOT/'results'/'structural-v1')
    args=p.parse_args();run(args.output)
