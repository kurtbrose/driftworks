"""Compact, native-size visual review of representative preserved candidates."""
import json
from pathlib import Path
from PIL import Image,ImageDraw
from portrait_lab import frame,convert

ROOT=Path(__file__).resolve().parent
entries=json.loads((ROOT/'manifest.json').read_text())['portraits']
chosen=['p001-005','p001-012','p001-058','p001-079','p006-018','p006-047','p006-060','p006-064']
sheet=Image.new('RGB',(6*132,24+len(chosen)*152),'#181c24')
draw=ImageDraw.Draw(sheet)
for col,label in enumerate(['source','baseline','cluster','contour','feature','structure']):
    draw.text((col*132+4,4),label,fill='white')
for row,identifier in enumerate(chosen):
    entry=next(e for e in entries if e['id']==identifier)
    with Image.open(ROOT/entry['file']) as image:
        source=frame(image,entry)
    y=24+row*152
    sheet.paste(source.resize((128,128)),(0,y))
    for col,family in enumerate(['baseline','cluster','contour','feature','structure'],1):
        setting=dict(algorithm=family,colors=32,grid=96,dither=0)
        result=convert(source,entry,setting,128)
        sheet.paste(result,(col*132,y))
    draw.text((4,y+130),identifier,fill='white')
path=ROOT/'results'/'review-revised96.png'
path.parent.mkdir(parents=True,exist_ok=True)
sheet.save(path)
print(path)
