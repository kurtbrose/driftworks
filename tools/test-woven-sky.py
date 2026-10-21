"""Checks for unique-source, feathered spherical sky baking (NumPy/Pillow)."""
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest
import numpy as np

sys.dont_write_bytecode=True
spec=importlib.util.spec_from_file_location('woven',Path(__file__).with_name('bake-woven-sky.py'))
woven=importlib.util.module_from_spec(spec);spec.loader.exec_module(woven)
RECIPE=Path(__file__).resolve().parents[1]/'assets/backgrounds/woven-stars-v1/recipe.json'


class WovenTests(unittest.TestCase):
    def test_unique_art_and_full_sphere_coverage(self):
        recipe,regions=woven.load_regions(RECIPE)
        self.assertEqual(len(regions),12)
        self.assertEqual(len({r['sha256'] for r in recipe['regions']}),12)
        phi=np.linspace(-np.pi,np.pi,181)
        theta=np.linspace(0,np.pi,91)[:,None]
        rays=np.stack(np.broadcast_arrays(np.sin(theta)*np.cos(phi),np.sin(theta)*np.sin(phi),np.cos(theta)+phi*0),axis=-1)
        colors=woven.project(rays,regions,recipe['radiusDeg'])
        self.assertTrue(np.isfinite(colors).all())
        np.testing.assert_allclose(colors[:,0],colors[:,-1],atol=1e-6)
        np.testing.assert_allclose(colors[0],np.broadcast_to(colors[0,0],colors[0].shape),atol=1e-6)

    def test_repeated_panel_is_rejected(self):
        data=json.loads(RECIPE.read_text())
        # Keep paths valid relative to the temporary recipe.
        for region in data['regions']:region['file']=str((RECIPE.parent/region['file']).resolve())
        data['regions'][1]=dict(data['regions'][0])
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as directory:
            recipe=Path(directory)/'recipe.json';recipe.write_text(json.dumps(data))
            with self.assertRaisesRegex(ValueError,'unique source'):woven.load_regions(recipe)

    def test_real_panorama_keeps_bright_and_quiet_areas(self):
        image=woven.bake(RECIPE,1024)
        values=np.asarray(image,dtype=float).mean(axis=2)
        self.assertEqual(image.size,(1024,512))
        tiles=values.reshape(16,32,32,32).mean(axis=(1,3))
        self.assertGreater(np.percentile(tiles,90),np.percentile(tiles,10)*1.3)


if __name__=='__main__':unittest.main()
