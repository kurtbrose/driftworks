"""Offline 2D alignment, graph-cut isolation and shared-palette painted planes.

YuNet is used only for face/landmark detection, never image generation.
"""
import argparse
import csv
import hashlib
import io
import itertools
import json
from pathlib import Path
import sys

ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'.deps'))
import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageOps, __version__ as pillow_version
from portrait_lab import convert, frame

MODEL_HASH='8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4'
MATTE_HASH='309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8'
BG=(42,58,68)
# One authored palette for the entire collection: warm skin ramps, cool ink,
# hair/cloth accents, lips, and restrained ivory highlights. Never fitted per face.
PALETTE=[BG,(9,12,21),(23,23,34),(38,34,45),(52,47,58),
 (40,25,27),(61,35,31),(83,46,36),(105,57,40),(128,72,45),(153,89,55),(179,111,69),(205,137,90),
 (68,40,42),(94,53,48),(122,68,56),(149,87,66),(176,108,79),(201,132,98),(223,157,122),(240,185,151),
 (98,63,52),(128,83,62),(157,104,76),(184,128,94),(208,153,117),(229,178,143),(244,204,171),(251,225,195),
 (45,31,28),(69,45,32),(97,61,36),(128,80,40),(162,106,48),(197,140,65),(225,180,97),(244,214,150),
 (38,44,58),(59,67,78),(85,94,104),(119,132,141),(164,178,182),(210,219,209),(244,240,217),
 (65,31,42),(98,40,47),(135,53,53),(172,72,64),(204,102,85),
 (25,48,61),(35,71,83),(51,101,105),(82,136,131),(143,174,155),
 (43,46,70),(59,64,91),(83,90,121),(120,129,155),
 (65,66,43),(96,97,56),(132,130,74),(178,167,108),
 (70,41,28),(116,53,28),(162,74,31),(205,111,45),(232,155,72)]


def cv_image(a):
    return Image.fromarray(np.uint8(np.clip(a,0,255)))


def detection(image):
    model=ROOT/'models'/'face_detection_yunet_2023mar.onnx'
    if hashlib.sha256(model.read_bytes()).hexdigest()!=MODEL_HASH:
        raise ValueError('YuNet model hash mismatch')
    detector=cv2.FaceDetectorYN.create(str(model),'',(512,512),.8,.3,5000)
    _,faces=detector.detect(np.ascontiguousarray(np.asarray(image)[:,:,::-1]))
    if faces is None:
        raise ValueError('No face detected; no silent unaligned fallback')
    face=max(faces,key=lambda f:float(f[2]*f[3]))
    points=face[4:14].reshape(5,2).astype(float)
    eyes=points[:2][np.argsort(points[:2,0])]
    delta=eyes[1]-eyes[0]
    distance=np.linalg.norm(delta)
    if distance<25:
        raise ValueError('Eye separation too small for reliable alignment')
    angle=np.degrees(np.arctan2(delta[1],delta[0]))
    midpoint=eyes.mean(axis=0)
    matrix=cv2.getRotationMatrix2D(tuple(midpoint),float(angle),512*.255/distance)
    matrix[:,2]+=np.array([256,512*.405])-midpoint
    aligned=cv2.warpAffine(np.asarray(image),matrix,(512,512),flags=cv2.INTER_LANCZOS4,borderMode=cv2.BORDER_CONSTANT,borderValue=BG)
    valid=cv2.warpAffine(np.ones((512,512),np.uint8),matrix,(512,512),flags=cv2.INTER_NEAREST)
    aligned_points=np.c_[points,np.ones(5)]@matrix.T
    return aligned,valid,aligned_points,dict(score=float(face[-1]),bbox=face[:4].tolist(),
        source_points=points.tolist(),aligned_points=aligned_points.tolist(),matrix=matrix.tolist(),roll_degrees=float(angle))


def separate_graphcut(aligned,valid):
    n=256
    image=cv2.resize(aligned,(n,n),interpolation=cv2.INTER_AREA)
    yy,xx=np.mgrid[:n,:n]/n
    head=((xx-.5)/.36)**2+((yy-.44)/.43)**2<1
    shoulders=(yy>.75)&(np.abs(xx-.5)<(.24+(yy-.75)*1.1))
    mask=np.full((n,n),cv2.GC_PR_BGD,np.uint8)
    mask[head|shoulders]=cv2.GC_PR_FGD
    core=((xx-.5)/.16)**2+((yy-.53)/.24)**2<1
    mask[core]=cv2.GC_FGD
    # Include crown and inner side hair in foreground seeds. Face-only seeds
    # otherwise classify dark hair as a dark studio background.
    crown=((xx-.5)/.235)**2+((yy-.285)/.245)**2<1
    mask[crown]=cv2.GC_FGD
    mask[(yy>.87)&(np.abs(xx-.5)<.18)]=cv2.GC_FGD
    outside=(xx<.012)|(xx>.988)|(yy<.018)
    mask[outside|(cv2.resize(valid,(n,n),interpolation=cv2.INTER_NEAREST)==0)]=cv2.GC_BGD
    cv2.setRNGSeed(1979)
    cv2.grabCut(image,mask,None,np.zeros((1,65)),np.zeros((1,65)),6,cv2.GC_INIT_WITH_MASK)
    alpha=np.uint8((mask==cv2.GC_FGD)|(mask==cv2.GC_PR_FGD))
    # Keep only the subject component connected to the face seed.
    _,labels=cv2.connectedComponents(alpha)
    selected=np.unique(labels[core&alpha.astype(bool)])
    alpha=np.uint8(np.isin(labels,selected[selected!=0]))*255
    alpha=cv2.morphologyEx(alpha,cv2.MORPH_CLOSE,np.ones((3,3),np.uint8))
    return cv2.resize(alpha,(512,512),interpolation=cv2.INTER_NEAREST)


def separate(aligned,valid):
    model=ROOT/'models'/'u2netp.onnx'
    if hashlib.sha256(model.read_bytes()).hexdigest()!=MATTE_HASH:
        raise ValueError('Foreground model hash mismatch')
    net=cv2.dnn.readNetFromONNX(str(model))
    sample=cv2.resize(aligned,(320,320),interpolation=cv2.INTER_LINEAR).astype(np.float32)
    sample=sample/max(float(sample.max()),1)
    sample=(sample-np.array([.485,.456,.406],np.float32))/np.array([.229,.224,.225],np.float32)
    net.setInput(sample.transpose(2,0,1)[None])
    mask=net.forward(net.getUnconnectedOutLayersNames())[0][0,0]
    mask=(mask-mask.min())/max(float(mask.max()-mask.min()),1e-6)
    mask=cv2.resize(mask,(512,512),interpolation=cv2.INTER_LINEAR)
    # Hard sprite boundary, no photographic background colors on soft fringes.
    return np.uint8((mask>.45)&(valid>0))*255


def gaussian(xx,yy,cx,cy,rx,ry):
    return np.exp(-2*(((xx-cx)/rx)**2+((yy-cy)/ry)**2))


def nearest_palette(a):
    # Perceptual matching, with identical palette and distance for every portrait.
    lab=cv2.cvtColor(np.float32(np.clip(a,0,255)/255),cv2.COLOR_RGB2Lab)
    palette=np.array(PALETTE,np.uint8)
    plab=cv2.cvtColor(palette[None,:,:].astype(np.float32)/255,cv2.COLOR_RGB2Lab)[0]
    indices=np.zeros(a.shape[:2],np.uint8)
    best=np.full(a.shape[:2],np.inf)
    for i,color in enumerate(plab):
        if i==0:
            continue  # Background belongs only to the matte, never to skin/hair.
        delta=lab-color
        distance=delta[:,:,0]**2+ .8*delta[:,:,1]**2+.8*delta[:,:,2]**2
        take=distance<best
        indices[take]=i
        best[take]=distance[take]
    return palette[indices]


def paint(aligned,alpha,points,setting):
    n=setting['grid']
    source=cv2.resize(aligned,(n,n),interpolation=cv2.INTER_AREA).astype(float)
    yy,xx=np.mgrid[:n,:n]/n
    pts=points/512
    eyes=pts[:2][np.argsort(pts[:2,0])]
    nose=pts[2]
    mouth=pts[3:5].mean(axis=0)
    mouth_width=max(.065,np.linalg.norm(pts[4]-pts[3]))
    protect=np.zeros((n,n))
    for x,y in eyes:
        protect=np.maximum(protect,gaussian(xx,yy,x,y,.085,.032))
    protect=np.maximum(protect,gaussian(xx,yy,*mouth,mouth_width*.8,.032))
    protect=np.maximum(protect,.55*gaussian(xx,yy,*nose,.055,.06))
    # Smooth at image scale before reducing to discrete value planes. Edge-aware
    # bilateral filtering joins cheek/forehead texture without crossing glasses.
    smooth=cv2.resize(aligned,(256,256),interpolation=cv2.INTER_AREA)
    for _ in range(3):
        smooth=cv2.bilateralFilter(smooth,9,42 if setting['style']=='painted' else 62,5)
    smooth=cv2.resize(smooth,(n,n),interpolation=cv2.INTER_AREA).astype(float)
    luminance=source@np.array([.2126,.7152,.0722])
    local=cv2.GaussianBlur(luminance,(0,0),1.1)
    dark=np.clip((local-luminance-3)/18,0,1)*protect
    # Preserve actual fine contours only inside feature regions, not every pore.
    feature_detail=np.clip(.55*protect+.5*dark,0,1)
    mixed=smooth*(1-feature_detail[:,:,None])+source*feature_detail[:,:,None]
    lab=cv2.cvtColor(np.float32(mixed/255),cv2.COLOR_RGB2Lab)
    skin_ellipse=((xx-.5)/.235)**2+((yy-.56)/.32)**2
    ycrcb=cv2.cvtColor(np.uint8(mixed),cv2.COLOR_RGB2YCrCb)
    skin=(skin_ellipse<1)&(ycrcb[:,:,1]>130)&(ycrcb[:,:,2]<137)&(ycrcb[:,:,2]>65)
    # Semantic masks steer existing shading rather than drawing replacement eyes.
    strength=1 if setting['style']=='painted' else 1.65
    shade=np.zeros((n,n))
    for x,y in eyes:
        shade-=5*gaussian(xx,yy,x,y-.025,.095,.045)
        shade+=3*gaussian(xx,yy,x,y+.065,.09,.06)
    shade-=4*gaussian(xx,yy,nose[0]+.05,nose[1],.036,.10)
    shade+=5*gaussian(xx,yy,nose[0]-.018,nose[1]-.015,.029,.09)
    shade-=5*gaussian(xx,yy,.5,mouth[1]+.12,.19,.045)
    face_weight=np.exp(-skin_ellipse)*skin
    light=lab[:,:,0]+shade*strength*face_weight
    levels=setting['levels']
    # Fixed exposure/value boundaries, no per-image histogram equalization.
    light=np.round((light-8)/(84/(levels-1)))*(84/(levels-1))+8
    lab[:,:,0]=np.clip(light,0,100)
    # Warm lit planes, cool shadows; bounded so skin-tone differences survive.
    lab[:,:,1]+=skin*(1.2 if setting['style']=='painted' else 2.2)
    lab[:,:,2]+=skin*2.5
    planes=cv2.cvtColor(lab,cv2.COLOR_Lab2RGB)*255
    # Reintroduce a little unposterized source at protected dark strokes.
    retained=np.clip(.65*protect+.35*dark,0,1)[:,:,None]
    planes=planes*(1-retained)+source*retained
    quantized=nearest_palette(planes)
    # Remove isolated palette speckle only away from identity-critical features.
    median=cv2.medianBlur(quantized,3)
    quantized=np.where((protect<.18)[:,:,None],median,quantized)
    quantized=nearest_palette(quantized)
    mask=cv2.resize(alpha,(n,n),interpolation=cv2.INTER_AREA)>127
    quantized[~mask]=BG
    return cv_image(quantized),dict(smoothed=cv_image(smooth),planes=cv_image(planes),
        features=cv_image(np.repeat((protect*255)[:,:,None],3,axis=2)))


def settings():
    return [dict(style=s,grid=g,levels=l) for s,g,l in itertools.product(['painted','graphic'],[96,128],[5,7])]


def label(s):
    return f"{s['style']}-g{s['grid']}-v{s['levels']}"


def export(image):
    reference=Image.new('P',(1,1))
    reference.putpalette([v for color in PALETTE for v in color]+[0]*(768-len(PALETTE)*3))
    palette=image.quantize(palette=reference,dither=Image.Dither.NONE)
    blobs={}
    for name,img,fmt,options in [('png',palette,'PNG',dict(optimize=True)),
        ('webp',image,'WEBP',dict(lossless=True,method=6)),
        ('webp-q85',image,'WEBP',dict(quality=85,method=6))]:
        buffer=io.BytesIO();img.save(buffer,format=fmt,**options)
        data=buffer.getvalue()
        if name!='webp-q85':
            with Image.open(io.BytesIO(data)) as decoded:
                assert decoded.convert('RGB').tobytes()==image.tobytes()
        blobs[name]=data
    return blobs


def run(output,limit=None):
    if output.exists():
        raise ValueError('Use a new output directory to preserve previous runs')
    cv2.setNumThreads(1)
    entries=json.loads((ROOT/'manifest.json').read_text())['portraits'][:limit]
    output.mkdir(parents=True)
    palette_file=ROOT/'palette-painted.json'
    palette_file.write_text(json.dumps(dict(name='comms-painted-v1',colors=PALETTE),indent=2)+'\n')
    faces=[];measurements=[];records=[]
    for entry in entries:
        path=ROOT/entry['file']
        if hashlib.sha256(path.read_bytes()).hexdigest()!=entry['sha256']:
            raise ValueError('Source hash mismatch: '+entry['id'])
        with Image.open(path) as image:
            original=frame(image,entry)
        aligned,valid,points,record=detection(original)
        alpha=separate(aligned,valid)
        folder=output/entry['id'];folder.mkdir()
        cv_image(aligned).save(folder/'aligned.png')
        Image.fromarray(alpha).save(folder/'matte.png')
        isolated=aligned.copy();isolated[alpha<128]=BG
        cv_image(isolated).save(folder/'isolated.png')
        outputs={}
        for setting in settings():
            result,stages=paint(aligned,alpha,points,setting)
            outputs[label(setting)]=result
            for stage,image in stages.items():
                image.save(folder/f'{label(setting)}-{stage}.png')
            for size in [128,256]:
                rendered=result.resize((size,size),Image.Resampling.NEAREST)
                for fmt,data in export(rendered).items():
                    extension='png' if fmt=='png' else 'webp'
                    file=f'{label(setting)}-{size}.{fmt}.{extension}'
                    (folder/file).write_bytes(data)
                    measurements.append(dict(id=entry['id'],setting=label(setting),size=size,format=fmt,bytes=len(data)))
        record.update(id=entry['id'],input_sha256=entry['sha256'],foreground_fraction=float(np.mean(alpha>127)))
        records.append(record)
        faces.append((entry,original,cv_image(isolated),outputs))
        print(entry['id'],flush=True)
    for start in range(0,len(faces),6):
        batch=faces[start:start+6]
        columns=['source','previous Structure','aligned source','painted g128 v7','graphic g128 v5']
        sheet=Image.new('RGB',(5*164,len(batch)*184+28),BG);draw=ImageDraw.Draw(sheet)
        for col,title in enumerate(columns):
            draw.text((col*164+3,5),title,fill='white')
        for row,(entry,original,isolated,outputs) in enumerate(batch):
            previous=convert(original,entry,dict(algorithm='structure',colors=32,grid=96,dither=0),128)
            candidates=[original,previous,isolated,outputs['painted-g128-v7'],outputs['graphic-g128-v5']]
            for col,img in enumerate(candidates):
                sheet.paste(img.resize((160,160),Image.Resampling.NEAREST if col in [1,3,4] else Image.Resampling.LANCZOS),(col*164,28+row*184))
            draw.text((4,190+row*184),entry['id'],fill='white')
        sheet.save(output/f'comparison-{start//6+1}.png')
        # Full parameter sweep at native 128 pixels; same faces down each column.
        sheet=Image.new('RGB',(len(batch)*132+132,9*152),BG);draw=ImageDraw.Draw(sheet)
        for col,(entry,_,isolated,_) in enumerate(batch,1):
            sheet.paste(isolated.resize((128,128)),(col*132,0));draw.text((col*132,130),entry['id'],fill='white')
        for row,setting in enumerate(settings(),1):
            draw.text((4,row*152+4),label(setting).replace('-','\n'),fill='white')
            for col,(_,_,_,outputs) in enumerate(batch,1):
                sheet.paste(outputs[label(setting)].resize((128,128),Image.Resampling.NEAREST),(col*132,row*152))
        sheet.save(output/f'sweep-{start//6+1}.png')
    with (output/'sizes.csv').open('w',newline='',encoding='utf-8') as f:
        w=csv.DictWriter(f,fieldnames=['id','setting','size','format','bytes']);w.writeheader();w.writerows(measurements)
    (output/'run.json').write_text(json.dumps(dict(records=records,settings=settings(),palette=PALETTE,
        model_sha256=MODEL_HASH,matte_model_sha256=MATTE_HASH,tool_sha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        versions=dict(opencv=cv2.__version__,numpy=np.__version__,pillow=pillow_version),seed=1979),indent=2)+'\n')
    print('Completed',len(faces),'faces;',len(measurements),'encoded assets')


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',type=Path,default=ROOT/'results'/'painted-v1')
    parser.add_argument('--limit',type=int)
    args=parser.parse_args()
    run(args.output,args.limit)
