import io
import unittest
from PIL import Image
from pixel_lab import np,cv2,BG,sample,build_palette,assign_palette,clean_clusters,encode,load_inputs,protect_features,settings


class PixelTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cv2.setNumThreads(1)
        cls.faces=load_inputs()
        cls.face=cls.faces[0]
        cls.protect=protect_features(cls.face['points'])

    def test_grid_coverage_and_no_new_rgb_extremes(self):
        rgb=np.full((512,512,3),(120,80,65),np.uint8)
        alpha=np.zeros((512,512),bool);alpha[128:384,128:384]=True
        protect=np.ones((512,512))
        for grid in [64,96,128]:
            for method in ['area','feature']:
                result,foreground,_=sample(rgb,alpha,protect,grid,method)
                self.assertEqual(result.shape,(grid,grid,3))
                self.assertTrue(np.all(result[foreground]==[120,80,65]))
                self.assertTrue(np.all(result[~foreground]==BG))

    def test_shared_palette_and_lossless_encoders(self):
        first=build_palette(self.faces,256)
        second=build_palette(self.faces,256)
        np.testing.assert_array_equal(first,second)
        self.assertEqual(first.shape,(256,3))
        sampled,foreground,_=sample(self.face['rgb'],self.face['alpha'],self.protect,96,'feature')
        index=assign_palette(sampled,foreground,first)
        result=Image.fromarray(first[index])
        for data in encode(result,first).values():
            with Image.open(io.BytesIO(data)) as decoded:
                self.assertEqual(decoded.convert('RGB').tobytes(),result.tobytes())

    def test_cleanup_preserves_features_and_rejects_high_contrast_dots(self):
        palette=np.array([BG,[120,90,70],[121,91,71],[10,10,10]],np.uint8)
        index=np.ones((64,64),np.uint8)
        index[20,20]=2;index[30,30]=2;index[40,40]=3
        protected=np.zeros((64,64));protected[20,20]=1
        foreground=np.ones((64,64),bool)
        result,changes,count=clean_clusters(index,palette[index],foreground,protected,palette)
        self.assertEqual(result[20,20],2)
        self.assertEqual(result[40,40],3)
        self.assertEqual(result[30,30],1)
        self.assertEqual(count,1)
        self.assertEqual(np.count_nonzero(changes),1)

    def test_sampling_repeatable_and_complete_sweep(self):
        a=sample(self.face['rgb'],self.face['alpha'],self.protect,96,'feature')[0]
        b=sample(self.face['rgb'],self.face['alpha'],self.protect,96,'feature')[0]
        np.testing.assert_array_equal(a,b)
        variants=list(settings())
        self.assertEqual(len(variants),24)
        self.assertEqual(len({tuple(v.values()) for v in variants}),24)


if __name__=='__main__':
    unittest.main()
