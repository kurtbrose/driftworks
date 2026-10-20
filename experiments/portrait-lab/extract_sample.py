"""Extract complete, CRC-verified PNG local records from a ranged ZIP fragment.

No archive paths are written. Not a general ZIP extractor: stored/deflated entries
with explicit sizes only. Partial final entries are skipped. Inputs stay ignored.
"""
import argparse
import hashlib
import json
from pathlib import Path
import struct
import zlib
from PIL import Image, ImageDraw
import io


def extract(fragment, output, prefix):
    data=fragment.read_bytes()
    output.mkdir(parents=True,exist_ok=True)
    rows=[]
    pos=0
    while True:
        pos=data.find(b'PK\x03\x04',pos)
        if pos<0 or pos+30>len(data):
            break
        _,version,flags,method,_,_,crc,packed,unpacked,nlen,xlen=struct.unpack_from('<IHHHHHIIIHH',data,pos)
        start=pos+30+nlen+xlen
        filename=data[pos+30:pos+30+nlen].decode('utf-8',errors='replace')
        if flags & 9 or method not in (0,8) or unpacked>10_000_000 or packed>10_000_000:
            pos+=4
            continue
        if start+packed>len(data):
            break
        blob=data[start:start+packed]
        if method==8:
            blob=zlib.decompress(blob,-15)
        if filename.lower().endswith('.png') and len(blob)==unpacked and zlib.crc32(blob)==crc:
            image=Image.open(io.BytesIO(blob))
            image.verify()
            digest=hashlib.sha256(blob).hexdigest()
            identifier=f'{prefix}-{len(rows):03d}'
            (output/f'{identifier}.png').write_bytes(blob)
            rows.append(dict(id=identifier,file=f'{identifier}.png',archive_path=filename,sha256=digest))
        pos=start+packed
    (output/f'{prefix}-extracted.json').write_text(json.dumps(rows,indent=2))
    sheet=Image.new('RGB',(8*144,((len(rows)+7)//8)*164),'#181c24')
    draw=ImageDraw.Draw(sheet)
    for i,row in enumerate(rows):
        x,y=(i%8)*144,(i//8)*164
        with Image.open(output/row['file']) as image:
            sheet.paste(image.convert('RGB').resize((144,144)),(x,y))
        draw.text((x+3,y+146),row['id'],fill='white')
    sheet.save(output/f'{prefix}-curation.png')
    print(f'{len(rows)} complete PNGs extracted')


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('fragment',type=Path)
    p.add_argument('output',type=Path)
    p.add_argument('--prefix',required=True)
    a=p.parse_args()
    extract(a.fragment,a.output,a.prefix)
