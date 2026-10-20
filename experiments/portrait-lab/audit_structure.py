"""Audit saved structural comparisons, frozen negatives and fixed palette ablation."""
import csv
import hashlib
import json
import statistics
from collections import defaultdict
from PIL import Image,ImageDraw
from structure_lab import ROOT,IDS,BG

folder=ROOT/'results'/'structural-v2'
run=json.loads((folder/'run.json').read_text())
negatives=[]
for entry in run['inputs']:
    identifier=entry['id']
    base=ROOT/'results'/'painted-v2'/identifier
    assert hashlib.sha256((base/'aligned.png').read_bytes()).hexdigest()==entry['aligned_sha256']
    assert hashlib.sha256((base/'painted-g128-v7-128.png.png').read_bytes()).hexdigest()==entry['negative_sha256']
    for style in ['painted-g128-v7','graphic-g128-v5']:
        path=base/f'{style}-128.png.png'
        negatives.append(dict(id=identifier,file=path.relative_to(ROOT).as_posix(),
            sha256=hashlib.sha256(path.read_bytes()).hexdigest(),status='rejected negative control',
            reason='Arbitrary value boundaries, skin islands and contours not explained by anatomy.'))
(ROOT/'negative-examples.json').write_text(json.dumps(negatives,indent=2)+'\n')
with (folder/'sizes.csv').open(encoding='utf-8') as f:
    rows=list(csv.DictReader(f))
assert len(rows)==144
groups=defaultdict(list)
for row in rows:
    stem=f"{row['method']}-{row['treatment']}-{row['size']}"
    path=folder/row['id']/f"{stem}.{row['format']}"
    assert path.stat().st_size==int(row['bytes'])
    with Image.open(path) as im:
        decoded=im.convert('RGB')
        assert decoded.size==(int(row['size']),int(row['size']))
        if row['format']=='webp':
            with Image.open(path.with_suffix('.png')) as png:
                assert png.convert('RGB').tobytes()==decoded.tobytes()
    groups[(row['method'],row['treatment'],int(row['size']),row['format'])].append(int(row['bytes']))
summary=[]
for (method,treatment,size,fmt),values in sorted(groups.items()):
    summary.append(dict(method=method,treatment=treatment,size=size,format=fmt,count=len(values),
        median_bytes=statistics.median(values),min_bytes=min(values),max_bytes=max(values)))
(folder/'audit.json').write_text(json.dumps(dict(verified_files=len(rows),frozen_negative_files=len(negatives),
    compression=summary),indent=2)+'\n')
for method in ['feature_smooth','region_redraw','illustration_model']:
    sheet=Image.new('RGB',(3*132,24+len(IDS)*152),BG);draw=ImageDraw.Draw(sheet)
    for col,title in enumerate(['source','full color','OLD palette control']):
        draw.text((col*132+3,4),title,fill='white')
    for row,identifier in enumerate(IDS):
        files=[ROOT/'results'/'painted-v2'/identifier/'isolated.png',
            folder/identifier/f'{method}-rgb-128.png',folder/identifier/f'{method}-palette-control-128.png']
        for col,path in enumerate(files):
            with Image.open(path) as image:
                sheet.paste(image.convert('RGB').resize((128,128),Image.Resampling.LANCZOS if col==0 else Image.Resampling.NEAREST),(col*132,24+row*152))
        draw.text((3,154+row*152),identifier,fill='white')
    sheet.save(folder/f'palette-ablation-{method}.png')
print('Verified 144 assets and 12 frozen negatives')
for row in summary:
    if row['format']=='webp' and row['treatment']=='rgb':
        print(row['method'],row['size'],row['median_bytes'])
