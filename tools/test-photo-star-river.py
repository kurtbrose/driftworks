"""Offline photographic sky projection regressions (Pillow/NumPy)."""
import importlib.util
from pathlib import Path
import sys
import unittest
import numpy as np
from PIL import Image

sys.dont_write_bytecode=True
spec=importlib.util.spec_from_file_location('photo',Path(__file__).with_name('bake-photo-star-river.py'))
photo=importlib.util.module_from_spec(spec)
spec.loader.exec_module(photo)


class PhotoTests(unittest.TestCase):
    def test_panel_borders_never_become_sky_edges(self):
        panel=np.full((128,128,3),20,dtype=np.float32)
        panel[[0,-1],:]=255;panel[:,[0,-1]]=255
        phi=np.linspace(-np.pi,np.pi,97)
        theta=np.linspace(0,np.pi,49)[:,None]
        rays=np.stack(np.broadcast_arrays(np.sin(theta)*np.cos(phi),np.sin(theta)*np.sin(phi),np.cos(theta)+phi*0),axis=-1)
        colors=photo.project(panel,rays,photo.patch_frames())
        np.testing.assert_allclose(colors,20,atol=.001)
        np.testing.assert_allclose(colors[:,0],colors[:,-1],atol=.001)

    def test_constant_panel_has_no_projection_seams(self):
        image=photo.bake(Image.new('RGB',(64,64),(20,30,40)),256)
        self.assertEqual(image.size,(256,128))
        values=np.asarray(image)
        self.assertLessEqual(np.ptp(values.astype(float),axis=(0,1)).max(),1)

    def test_authored_panel_wraps_without_a_dark_seam(self):
        panel=Image.open(Path(__file__).resolve().parents[1]/'assets/backgrounds/star-river-photo-panel-v1.png')
        values=np.asarray(photo.bake(panel,512),dtype=float)
        seam=np.abs(values[:,0]-values[:,-1]).mean()
        ordinary=np.abs(np.diff(values,axis=1)).mean()
        self.assertLess(seam,ordinary*2.5)
        self.assertGreater(values.mean(),1)
        self.assertLess(values.mean(),25)


if __name__=='__main__':
    unittest.main()
