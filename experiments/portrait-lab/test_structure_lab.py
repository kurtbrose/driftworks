import json
import unittest
from PIL import Image
from structure_lab import ROOT,cv2,np,landmarks,feature_smooth,illustration_model,illustrate


class StructuralTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cv2.setNumThreads(1)
        cache=ROOT/'results'/'painted-v2'
        cls.record=json.loads((cache/'run.json').read_text())['records'][0]
        with Image.open(cache/'p001-005'/'aligned.png') as image:
            cls.source=np.array(image.convert('RGB'))
        with Image.open(cache/'p001-005'/'matte.png') as image:
            cls.alpha=np.array(image)
        cls.points,_=landmarks(cls.source,cls.record)

    def test_landmarks_repeat_and_topology(self):
        points,dense=landmarks(self.source,self.record)
        np.testing.assert_array_equal(points,self.points)
        self.assertEqual(dense.shape,(106,2))
        self.assertTrue(np.all((points>=0)&(points<512)))
        self.assertLess(points[36:42,0].mean(),points[42:48,0].mean())
        self.assertGreater(points[8,1],points[48:60,1].mean())

    def test_smooth_ramp_does_not_gain_steps(self):
        # Prevent a future "simplification" from putting posterization back into
        # the continuous feature-aware branch. This is not an artistic metric.
        ramp=np.repeat(np.linspace(45,220,512)[None,:,None],512,axis=0)
        ramp=np.repeat(ramp,3,axis=2).astype(np.uint8)
        result,_=feature_smooth(ramp,self.points,np.full((512,512),255,np.uint8))
        a=np.asarray(result).astype(float)
        self.assertLessEqual(np.max(np.abs(np.diff(a[20:-20,20:-20],axis=1))),2)
        self.assertGreater(len(np.unique(a[256,:,0])),128)

    def test_illustration_cpu_repeatability(self):
        generator=illustration_model()
        a=illustrate(generator,self.source)
        b=illustrate(generator,self.source)
        self.assertEqual(a.size,(512,512))
        self.assertEqual(a.tobytes(),b.tobytes())


if __name__=='__main__':
    unittest.main()
