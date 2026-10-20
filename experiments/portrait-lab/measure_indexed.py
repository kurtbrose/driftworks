"""Supplement preserved RGB PNG/WebP encodings with exact indexed PNG."""
import csv
import io
from pathlib import Path
from PIL import Image

ROOT=Path(__file__).resolve().parent
for run in ['initial','revised']:
    folder=ROOT/'results'/run
    with (folder/'sizes.csv').open(encoding='utf-8') as stream:
        rows=[r for r in csv.DictReader(stream) if r['format']=='png']
    measured=[]
    for row in rows:
        stem=f"{row['setting']}-{row['size']}"
        with Image.open(folder/row['id']/f'{stem}.png.png') as image:
            rgb=image.convert('RGB')
            colors=len(rgb.getcolors(rgb.width*rgb.height))
            indexed=rgb.quantize(colors=colors,method=Image.Quantize.MEDIANCUT,dither=Image.Dither.NONE)
            buffer=io.BytesIO()
            indexed.save(buffer,format='PNG',optimize=True,bits=4 if colors<=16 else 8)
            data=buffer.getvalue()
            with Image.open(io.BytesIO(data)) as decoded:
                assert decoded.convert('RGB').tobytes()==rgb.tobytes()
        (folder/row['id']/f'{stem}.png-indexed.png').write_bytes(data)
        measured.append(dict(row,format='png-indexed',bytes=len(data)))
    with (folder/'indexed-sizes.csv').open('w',newline='',encoding='utf-8') as stream:
        writer=csv.DictWriter(stream,fieldnames=['id','setting','size','format','bytes'])
        writer.writeheader();writer.writerows(measured)
    print(run,len(measured),'exact indexed PNGs')
