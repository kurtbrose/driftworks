"""Separate framing/palette gains from the painted shading change."""
import json
import numpy as np
from PIL import Image,ImageDraw
from painted_lab import ROOT,BG,nearest_palette,cv_image
from portrait_lab import convert

folder=ROOT/'results'/'painted-v2'
entries=json.loads((ROOT/'manifest.json').read_text())['portraits']
for start in range(0,len(entries),6):
    batch=entries[start:start+6]
    sheet=Image.new('RGB',(5*132,24+len(batch)*152),BG);draw=ImageDraw.Draw(sheet)
    for col,title in enumerate(['aligned source','aligned Structure','shared palette only','painted','graphic']):
        draw.text((col*132+3,4),title,fill='white')
    for row,entry in enumerate(batch):
        path=folder/entry['id']
        with Image.open(path/'aligned.png') as im:
            aligned=im.convert('RGB')
        with Image.open(path/'matte.png') as im:
            mask=np.asarray(im.resize((128,128),Image.Resampling.NEAREST))>127
        with Image.open(path/'isolated.png') as im:
            isolated=im.convert('RGB').resize((128,128))
        structure=convert(aligned,entry,dict(algorithm='structure',grid=128,colors=32,dither=0),128)
        array=np.array(structure);array[~mask]=BG;structure=cv_image(array)
        palette=nearest_palette(np.array(aligned.resize((128,128),Image.Resampling.LANCZOS)))
        palette[~mask]=BG
        outputs=[isolated,structure,cv_image(palette)]
        for name in ['painted-g128-v7','graphic-g128-v5']:
            with Image.open(path/f'{name}-128.png.png') as image:
                outputs.append(image.convert('RGB'))
        for col,image in enumerate(outputs):
            sheet.paste(image,(col*132,24+row*152))
        draw.text((3,154+row*152),entry['id'],fill='white')
    sheet.save(folder/f'controls-{start//6+1}.png')
print('Wrote four matched-framing control sheets')
