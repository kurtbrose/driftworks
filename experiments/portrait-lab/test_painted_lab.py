import io
import json
import unittest
import numpy as np
from PIL import Image
from painted_lab import ROOT, PALETTE, EYE_SPAN, EYE_Y, cv2, detection, separate, paint, export
from portrait_lab import frame


class PaintedTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cv2.setNumThreads(1)
        entry=json.loads((ROOT/'manifest.json').read_text())['portraits'][0]
        with Image.open(ROOT/entry['file']) as image:
            cls.source=frame(image,entry)
        cls.aligned,cls.valid,cls.points,cls.record=detection(cls.source)
        cls.alpha=separate(cls.aligned,cls.valid)

    def test_alignment_preserves_geometry(self):
        eyes=self.points[:2][np.argsort(self.points[:2,0])]
        self.assertAlmostEqual(eyes[0,1],eyes[1,1],places=5)
        self.assertAlmostEqual(eyes[:,1].mean(),512*EYE_Y,places=5)
        self.assertAlmostEqual(eyes[1,0]-eyes[0,0],512*EYE_SPAN,places=5)
        matrix=np.array(self.record['matrix'])[:,:2]
        gram=matrix.T@matrix
        np.testing.assert_allclose(gram,np.eye(2)*gram[0,0],atol=1e-8)
        again=detection(self.source)
        np.testing.assert_array_equal(self.aligned,again[0])

    def test_foreground_repeatable(self):
        np.testing.assert_array_equal(self.alpha,separate(self.aligned,self.valid))
        self.assertEqual(self.alpha[0,0],0)
        self.assertEqual(self.alpha[256,256],255)
        self.assertGreater(np.mean(self.alpha>0),.2)

    def test_shared_palette_and_exact_codecs(self):
        allowed=set(PALETTE)
        for style in ['painted','graphic']:
            setting=dict(style=style,grid=128,levels=7)
            a,_=paint(self.aligned,self.alpha,self.points,setting)
            b,_=paint(self.aligned,self.alpha,self.points,setting)
            self.assertEqual(a.tobytes(),b.tobytes())
            self.assertTrue(set(map(tuple,np.asarray(a).reshape(-1,3)))<=allowed)
            for fmt,data in export(a).items():
                with Image.open(io.BytesIO(data)) as decoded:
                    if fmt!='webp-q85':
                        self.assertEqual(decoded.convert('RGB').tobytes(),a.tobytes())


if __name__=='__main__':
    unittest.main()
