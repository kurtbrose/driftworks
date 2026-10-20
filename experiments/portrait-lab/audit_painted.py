"""Verify every final lossless asset and record measured compression summaries."""
import csv
import hashlib
import json
from collections import defaultdict
from pathlib import Path
import statistics
import numpy as np
from PIL import Image,ImageDraw
from painted_lab import ROOT,PALETTE

folder=ROOT/'results'/'painted-v2'
with (folder/'sizes.csv').open(encoding='utf-8') as stream:
    rows=list(csv.DictReader(stream))
groups=defaultdict(list)
allowed=set(PALETTE)
for row in rows:
    fmt=row['format'];extension='png' if fmt=='png' else 'webp'
    path=folder/row['id']/f"{row['setting']}-{row['size']}.{fmt}.{extension}"
    assert path.stat().st_size==int(row['bytes'])
    with Image.open(path) as image:
        a=np.asarray(image.convert('RGB'))
    assert a.shape==(int(row['size']),int(row['size']),3)
    if fmt!='webp-q85':
        assert set(map(tuple,np.unique(a.reshape(-1,3),axis=0)))<=allowed
    if fmt=='webp':
        with Image.open(path.with_name(f"{row['setting']}-{row['size']}.png.png")) as png:
            assert np.array_equal(np.asarray(png.convert('RGB')),a)
    groups[(row['size'],fmt)].append(int(row['bytes']))
summary=[]
for (size,fmt),values in sorted(groups.items()):
    summary.append(dict(size=int(size),format=fmt,count=len(values),median_bytes=statistics.median(values),
        min_bytes=min(values),max_bytes=max(values),total_bytes=sum(values)))
run=json.loads((folder/'run.json').read_text())
eyes=[]
for record in run['records']:
    p=np.array(record['aligned_points'])[:2]
    eyes.append(dict(id=record['id'],eye_span=float(np.linalg.norm(p[0]-p[1])),eye_y=float(p[:,1].mean()),roll_after=float(p[0,1]-p[1,1])))
assert len(run['records'])==24 and len(rows)==1152
(folder/'audit.json').write_text(json.dumps(dict(assets_verified=len(rows),compression=summary,alignment=eyes),indent=2)+'\n')
print(json.dumps(summary,indent=2))
# Compact matched preview, including glasses, a scale challenge, facial hair,
# darker skin, and a case with a known background artifact.
chosen=['p001-005','p001-012','p001-079','p006-005','p006-018','p006-047']
sheet=Image.new('RGB',(4*132,24+len(chosen)*152),(42,58,68));draw=ImageDraw.Draw(sheet)
for col,title in enumerate(['old Structure','aligned source','painted','graphic']):
    draw.text((col*132+3,4),title,fill='white')
for row,identifier in enumerate(chosen):
    files=[ROOT/'results'/'revised'/identifier/'structure-c32-g96-d0-128.png.png',
           folder/identifier/'isolated.png',folder/identifier/'painted-g128-v7-128.png.png',
           folder/identifier/'graphic-g128-v5-128.png.png']
    for col,path in enumerate(files):
        with Image.open(path) as image:
            sheet.paste(image.convert('RGB').resize((128,128),Image.Resampling.LANCZOS if col==1 else Image.Resampling.NEAREST),(col*132,24+row*152))
    draw.text((3,154+row*152),identifier,fill='white')
sheet.save(folder/'review.png')
palette=Image.new('RGB',(12*48,((len(PALETTE)+11)//12)*48))
draw=ImageDraw.Draw(palette)
for i,color in enumerate(PALETTE):
    x,y=i%12*48,i//12*48
    draw.rectangle((x,y,x+47,y+47),fill=color)
    draw.text((x+2,y+2),str(i),fill='white' if sum(color)<400 else 'black')
palette.save(folder/'palette.png')
print('Verified',len(rows),'assets; wrote review.png and audit.json')
