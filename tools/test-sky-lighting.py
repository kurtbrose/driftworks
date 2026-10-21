"""Numerical tests for the offline lighting pipeline (Pillow/NumPy only)."""
import importlib.util
from pathlib import Path
import sys
import unittest
import tempfile
import numpy as np
from PIL import Image

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('lighting', Path(__file__).with_name('bake-sky-lighting.py'))
lighting = importlib.util.module_from_spec(spec)
spec.loader.exec_module(lighting)


class LightingTests(unittest.TestCase):
    def test_hdr_probe_keeps_sparse_highlight_energy(self):
        pixels=np.zeros((64,128,3),dtype=np.uint8)
        pixels[25:35,55:65]=[255,190,90]
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as folder:
            path=Path(folder)/'probe.bin'
            lighting.derive(Image.fromarray(pixels),path)
            hdr=np.fromfile(path,dtype='<f4').reshape(256,512,4)
        self.assertTrue(np.isfinite(hdr).all())
        self.assertGreater(hdr[...,:3].max(),1)
        np.testing.assert_array_equal(hdr[...,3],1)
        weights=np.sin((np.arange(256)+.5)/256*np.pi)[:,None]
        average=((hdr[...,:3]@[.2126,.7152,.0722])*weights).sum()/(weights.sum()*512)
        self.assertAlmostEqual(average,.42,delta=.005)

    def test_constant_sky_is_direction_independent(self):
        probe, image = lighting.derive(Image.new('RGB', (128, 64), (128, 128, 128)))
        directions = np.array([[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]])
        diffuse = lighting.basis(directions) @ np.array(probe['sh'])
        np.testing.assert_allclose(diffuse, .42, atol=.001)
        self.assertEqual(image.size, (512,256))

    def test_normalization_ignores_art_exposure(self):
        a, _ = lighting.derive(Image.new('RGB', (128,64), (32,32,32)))
        b, _ = lighting.derive(Image.new('RGB', (128,64), (220,220,220)))
        np.testing.assert_allclose(a['sh'], b['sh'], atol=1e-6)

    def test_direction_and_color_survive_projection(self):
        pixels = np.zeros((64,128,3),dtype=np.uint8)
        pixels[:,64:128] = [80,140,240]  # +Y hemisphere in the shared atan convention.
        probe, _ = lighting.derive(Image.fromarray(pixels))
        diffuse = lighting.basis(np.array([[0,1,0],[0,-1,0]])) @ np.array(probe['sh'])
        self.assertGreater(diffuse[0,2],diffuse[1,2]+.5)
        self.assertGreater(diffuse[0,2],diffuse[0,0])

    def test_black_sky_and_extreme_highlight_stay_finite(self):
        black, _ = lighting.derive(Image.new('RGB',(128,64)))
        self.assertTrue(np.isfinite(black['sh']).all())
        self.assertEqual(black['normalization'],0)
        pixels=np.ones((64,128,3),dtype=np.uint8)*4
        pixels[20,30]=255
        probe,_=lighting.derive(Image.fromarray(pixels))
        self.assertTrue(np.isfinite(probe['sh']).all())
        self.assertLessEqual(probe['highlightCap'],1)


if __name__ == '__main__':
    unittest.main()
