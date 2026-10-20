"""Audit all pixel-reduction assets against frozen illustrations and logical grids."""
import csv
import hashlib
import json
import statistics
from collections import defaultdict
from PIL import Image,ImageDraw
from pixel_lab import ROOT,SOURCE,MATTE,IDS,BG,np,protect_features,sample,label

runs=[ROOT/'results'/'pixel-v1',ROOT/'results'/'pixel-v2']
groups=defaultdict(list);total=0;frozen={}
first_palette=None
for folder in runs:
    run=json.loads((folder/'run.json').read_text())
    palettes=json.loads((folder/'palettes.json').read_text())
    if first_palette is None:
        first_palette=palettes
    else:
        assert palettes==first_palette,'Palette changed between spatial-grid runs'
    options={label(s):s for s in run['settings']}
    for record in run['inputs']:
        identifier=record['id']
        for path,field in [(SOURCE/identifier/'illustration_model-intermediate-512.png','source_sha256'),
            (MATTE/identifier/'matte.png','matte_sha256'),(SOURCE/identifier/'landmarks.json','landmarks_sha256')]:
            assert hashlib.sha256(path.read_bytes()).hexdigest()==record[field]
        frozen[identifier]=record['source_sha256']
    with (folder/'sizes.csv').open(encoding='utf-8') as f:
        rows=list(csv.DictReader(f))
    for row in rows:
        setting=options[row['setting']]
        path=folder/row['id']/f"{row['setting']}-{row['size']}.{row['format']}"
        assert path.stat().st_size==int(row['bytes'])
        with Image.open(path) as image:
            decoded=image.convert('RGB')
        size=int(row['size']);assert decoded.size==(size,size)
        with Image.open(folder/row['id']/f"{row['setting']}-logical.png") as image:
            expected=image.convert('RGB').resize((size,size),Image.Resampling.NEAREST)
        assert expected.tobytes()==decoded.tobytes()
        if setting['colors']:
            palette=set(map(tuple,palettes[str(setting['colors'])]))
            assert set(map(tuple,np.unique(np.array(decoded).reshape(-1,3),axis=0)))<=palette
        groups[(row['setting'],size,row['format'])].append(int(row['bytes']))
        total+=1
    for record in run['cleanup']:
        identifier=record['id'];key=record['setting'];setting=options[key]
        with Image.open(SOURCE/identifier/'illustration_model-intermediate-512.png') as image:
            rgb=np.array(image.convert('RGB'))
        with Image.open(MATTE/identifier/'matte.png') as image:
            alpha=np.array(image)>127
        points=np.array(json.loads((SOURCE/identifier/'landmarks.json').read_text())['points68'])
        _,foreground,protected=sample(rgb,alpha,protect_features(points),setting['grid'],'feature')
        with Image.open(folder/identifier/f'{key}-changes.png') as image:
            changed=np.array(image)>0
        assert not np.any(changed&(protected>.1))
        assert int(changed.sum())==record['pixels_changed']
summary=[]
for (setting,size,fmt),values in sorted(groups.items()):
    summary.append(dict(setting=setting,size=size,format=fmt,count=len(values),median_bytes=statistics.median(values),
        min_bytes=min(values),max_bytes=max(values)))
assert total==576 and len(frozen)==6
out=ROOT/'results'/'pixel-v2'
(out/'audit.json').write_text(json.dumps(dict(assets_verified=total,frozen_illustrations=frozen,
    cleanup_protection_verified=True,palettes_identical_between_runs=True,compression=summary),indent=2)+'\n')
with (out/'size-summary.csv').open('w',newline='',encoding='utf-8') as f:
    w=csv.DictWriter(f,fieldnames=list(summary[0]));w.writeheader();w.writerows(summary)
for row in summary:
    if row['format']=='webp' and row['setting'] in ['g64-feature-rgb','g96-feature-rgb','g128-feature-rgb','g96-feature-c256-clean','g128-feature-c256-clean']:
        print(row['setting'],row['size'],row['median_bytes'])
# Compact review at native 128: show the conservative RGB candidate and palette
# option together, rather than presenting only the smallest files.
sheet=Image.new('RGB',(4*132,24+len(IDS)*152),BG);draw=ImageDraw.Draw(sheet)
for col,title in enumerate(['illustration','64 grid RGB','96 grid RGB','128 grid RGB']):
    draw.text((col*132+3,4),title,fill='white')
for row,identifier in enumerate(IDS):
    files=[SOURCE/identifier/'illustration_model-rgb-128.png',
        runs[0]/identifier/'g64-feature-rgb-128.png',runs[1]/identifier/'g96-feature-rgb-128.png',
        runs[0]/identifier/'g128-feature-rgb-128.png']
    for col,path in enumerate(files):
        with Image.open(path) as image:
            sheet.paste(image.convert('RGB'),(col*132,24+row*152))
    draw.text((3,154+row*152),identifier,fill='white')
sheet.save(out/'review.png')
print('Verified',total,'lossless assets and six unchanged illustration inputs')
