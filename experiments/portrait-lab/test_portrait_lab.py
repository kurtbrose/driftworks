"""Mechanical tests use a diagnostic chart, never a surrogate face dataset."""
import hashlib
import io
import unittest
import tempfile
import json
import csv
from pathlib import Path
import numpy as np
from PIL import Image
from portrait_lab import convert, encode, frame, variants, run


class PipelineTests(unittest.TestCase):
    def test_sweep_and_codecs(self):
        yy,xx=np.mgrid[:512,:512]
        chart=Image.fromarray(np.uint8(np.stack([xx/2,yy/2,(xx+yy)/4],axis=-1)))
        settings=list(variants())
        self.assertEqual(len(settings),32)
        self.assertEqual(len({tuple(s.values()) for s in settings}),32)
        for setting in settings+list(variants(['structure'])):
            for size in [128,256]:
                a=convert(chart,{},setting,size)
                b=convert(chart,{},setting,size)
                self.assertEqual(a.tobytes(),b.tobytes())
                self.assertEqual(a.size,(size,size))
                self.assertLessEqual(len(a.getcolors(size*size)),setting['colors'])
                blobs=encode(a)
                for fmt,data in blobs.items():
                    decoded=Image.open(io.BytesIO(data)).convert('RGB')
                    self.assertEqual(decoded.size,a.size)
                    if fmt != 'webp-q85':
                        self.assertEqual(decoded.tobytes(),a.tobytes())

    def test_crop_validation(self):
        with self.assertRaises(ValueError):
            frame(Image.new('RGB',(32,32)),{'crop':[1,0,0,1]})

    def test_manifest_outputs(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).resolve().parent) as temp:
            root=Path(temp)
            # Diagnostic chart only: verifies export plumbing, not artistic quality.
            chart=Image.new('RGB',(128,128),'#b89673')
            chart.save(root/'chart.png')
            manifest=root/'manifest.json'
            manifest.write_text(json.dumps({'portraits':[{'id':'diagnostic','file':'chart.png'}]}))
            output=root/'output'
            run(manifest,output)
            with (output/'sizes.csv').open(encoding='utf-8') as stream:
                rows=list(csv.DictReader(stream))
            self.assertEqual(len(rows),192)
            for row in rows:
                ext='png' if row['format']=='png' else 'webp'
                path=output/row['id']/f"{row['setting']}-{row['size']}.{row['format']}.{ext}"
                self.assertEqual(path.stat().st_size,int(row['bytes']))
            self.assertEqual(len(list(output.glob('sheet-*.png'))),8)
            self.assertEqual(len(list(output.glob('comparison-*.png'))),2)
            info=json.loads((output/'run.json').read_text())
            self.assertEqual(info['inputs'][0]['sha256'],hashlib.sha256((root/'chart.png').read_bytes()).hexdigest())
            with self.assertRaises(ValueError):
                manifest.write_text('{"portraits": []}')
                run(manifest,output)


if __name__=='__main__':
    unittest.main()
