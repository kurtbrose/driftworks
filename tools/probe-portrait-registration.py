"""Offline registration probe; proposals need visual review, never auto-approval."""
from pathlib import Path
import json
import argparse
import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]

def fit(master, frame):
    # Register stable nose pixels, excluding expressive eyes, lips and cheeks.
    target = np.asarray(master, dtype=np.float32)[123:146, 115:133, :3]
    best = (float('inf'), 1., 0, 0)
    for scale in [1.]:
        transformed = frame.transform((256,256), Image.Transform.AFFINE,
            (1/scale,0,128-128/scale,0,1/scale,128-128/scale), Image.Resampling.BICUBIC)
        pixels = np.asarray(transformed, dtype=np.float32)
        for dy in range(-12,13):
            for dx in range(-10,11):
                patch = pixels[123-dy:146-dy,115-dx:133-dx,:3]
                error = np.mean((patch-target)**2)
                if error < best[0]: best = (float(error),round(float(scale),2),dx,dy)
    return best

if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input-root',type=Path,required=True,help='Directory containing unregistered pool/runtime exports')
    parser.add_argument('--output',type=Path,required=True,help='Proposal JSON; never implies visual acceptance')
    args=parser.parse_args()
    manifests={pool:json.loads((args.input_root/pool/'runtime/manifest.json').read_text(encoding='utf-8-sig')) for pool in ['dogfight','civilian-shuttle','runway-workers']}
    if any(m.get('registrationApplied',True) for m in manifests.values()):
        raise SystemExit('Use fresh -Unregistered exports; refusing to re-fit already registered atlases')
    results={}
    jobs=[(pool,i) for pool,count in [('dogfight',17),('civilian-shuttle',6),('runway-workers',6)] for i in range(count)]
    for pool,index in jobs:
        atlas=Image.open(args.input_root/f'{pool}/runtime/portrait-{index}.png').convert('RGB')
        cells=[atlas.crop((i*256,0,(i+1)*256,256)) for i in range(7)]
        fits=[(0,1,0,0)]+[fit(cells[0],c) for c in cells[1:]]
        results[f'{pool}/{index}']={'offsets':[[f[2],f[3]] for f in fits], 'noseMse':[round(f[0],2) for f in fits]}
        sheet=Image.new('RGB',(7*256,2*280),'#0b1115');draw=ImageDraw.Draw(sheet)
        for i,(cell,(_,s,dx,dy)) in enumerate(zip(cells,fits)):
            corrected=cell.transform((256,256),Image.Transform.AFFINE,(1/s,0,128-(128+dx)/s,0,1/s,128-(128+dy)/s),Image.Resampling.BICUBIC)
            sheet.paste(cell,(i*256,24));sheet.paste(corrected,(i*256,304))
            draw.text((i*256,0),f'original {i}',fill='white');draw.text((i*256,280),f'proposal {s} {dx} {dy}',fill='white')
        if (pool,index) in [('dogfight',9),('dogfight',10),('civilian-shuttle',1)]:
            output=args.output.with_name(f'{pool}-{index}-registration-probe.png');sheet.save(output)
    sources={pool:manifest['sources'] for pool,manifest in manifests.items()}
    args.output.write_text(json.dumps({'version':1,'method':'Integer translation fitted to stable nose pixels; proposals require rendered visual review','sources':sources,'characters':results},indent=2)+'\n',encoding='utf-8',newline='\n')
    print(f'Wrote {len(results)} registration proposals to {args.output}; visual review required')
