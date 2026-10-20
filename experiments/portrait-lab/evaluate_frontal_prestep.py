"""Paired downstream evaluation of four existing user-generated frontal photos.

No new manual/generative edits are requested. Uses the frozen illustration model
and existing pixel sampler; all previous outputs remain intact.
"""
import csv
import hashlib
import json
from pathlib import Path
from PIL import Image,ImageDraw,ImageOps
from structure_lab import ROOT,cv2,np,illustration_model,illustrate,landmarks
from painted_lab import BG,detection,cv_image
from pixel_lab import protect_features,sample,encode

IDS=['p001-006','p001-057','p006-042','p006-064']
SOURCE=ROOT/'results'/'imagegen-frontal-v1'
OUTPUT=ROOT/'results'/'frontal-evaluation-v1'


def main():
    if OUTPUT.exists():
        raise ValueError('Evaluation output exists; preserve previous comparisons')
    cv2.setNumThreads(1)
    OUTPUT.mkdir()
    records={r['id']:r for r in json.loads((ROOT/'results'/'painted-v2'/'run.json').read_text())['records']}
    generator=illustration_model()
    rows=[];provenance=[];panels=[]
    for identifier in IDS:
        folder=OUTPUT/identifier;folder.mkdir()
        base=ROOT/'results'/'painted-v2'/identifier
        with Image.open(base/'aligned.png') as image:
            original=np.array(image.convert('RGB'))
        with Image.open(base/'matte.png') as image:
            original_alpha=np.array(image)
        with Image.open(SOURCE/f'{identifier}.png') as image:
            rgba=ImageOps.exif_transpose(image).convert('RGBA').resize((512,512),Image.Resampling.LANCZOS)
        # Respect supplied alpha. Never interpret hidden transparent RGB as a
        # background color and never force a new segmentation on these edits.
        composite=Image.new('RGBA',rgba.size,BG+(255,));composite.alpha_composite(rgba)
        generated,valid,_,record=detection(composite.convert('RGB'))
        generated_alpha=cv2.warpAffine(np.array(rgba.getchannel('A')),np.array(record['matrix']),
            (512,512),flags=cv2.INTER_LINEAR,borderValue=0)
        generated_alpha[valid==0]=0
        outputs={}
        for route,photo,alpha,landmark_record in [('original',original,original_alpha,records[identifier]),
            ('frontal',generated,generated_alpha,record)]:
            points,_=landmarks(photo,landmark_record)
            photo_image=cv_image(photo)
            photo_image.save(folder/f'{route}-aligned-512.png')
            Image.fromarray(alpha).save(folder/f'{route}-alpha.png')
            model_output=illustrate(generator,photo)
            model_output.save(folder/f'{route}-illustration-unmasked-512.png')
            a=np.array(model_output);a[alpha<128]=BG
            isolated=cv_image(a);isolated.save(folder/f'{route}-illustration-512.png')
            logical,_,_=sample(a,alpha>127,protect_features(points),96,'feature')
            pixel=cv_image(logical).resize((128,128),Image.Resampling.NEAREST)
            for fmt,data in encode(pixel).items():
                (folder/f'{route}-pixel96-at128.{fmt}').write_bytes(data)
                rows.append(dict(id=identifier,route=route,format=fmt,bytes=len(data)))
            photo_copy=photo.copy();photo_copy[alpha<128]=BG
            outputs[route]=[cv_image(photo_copy).resize((128,128),Image.Resampling.LANCZOS),
                isolated.resize((128,128),Image.Resampling.LANCZOS),pixel]
        panels.append((identifier,[outputs['original'][0],outputs['frontal'][0],outputs['original'][1],
            outputs['frontal'][1],outputs['original'][2],outputs['frontal'][2]]))
        provenance.append(dict(id=identifier,original_aligned_sha256=hashlib.sha256((base/'aligned.png').read_bytes()).hexdigest(),
            generated_source_sha256=hashlib.sha256((SOURCE/f'{identifier}.png').read_bytes()).hexdigest(),
            generated_alignment=record))
        print(identifier,flush=True)
    sheet=Image.new('RGB',(6*136,24+len(IDS)*154),BG);draw=ImageDraw.Draw(sheet)
    for col,title in enumerate(['original photo','frontal photo','original illustrated','frontal illustrated','original pixel96','frontal pixel96']):
        draw.text((col*136+3,4),title,fill='white')
    for row,(identifier,images) in enumerate(panels):
        for col,image in enumerate(images):
            sheet.paste(image,(col*136,24+row*154))
        draw.text((3,154+row*154),identifier,fill='white')
    sheet.save(OUTPUT/'comparison.png')
    with (OUTPUT/'sizes.csv').open('w',newline='',encoding='utf-8') as f:
        writer=csv.DictWriter(f,fieldnames=['id','route','format','bytes']);writer.writeheader();writer.writerows(rows)
    (OUTPUT/'run.json').write_text(json.dumps(dict(inputs=provenance,
        generation_stage='Existing user-approved manual edits; not rerun and not claimed deterministic',
        downstream_model='Same pinned Face Portrait v2 as structural-v2',
        pixel_stage=dict(grid=96,sampling='feature',palette=False,output=128),
        tool_sha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest()),indent=2)+'\n')
    print('Wrote comparison.png; 8 illustration inferences and 16 lossless exports')


if __name__=='__main__':
    main()
