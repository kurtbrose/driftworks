"""Authoring-tool regressions; run with the same Python as compose-skybox.py."""
import copy
import importlib.util
from pathlib import Path
import tempfile
import unittest
import sys

import numpy as np
from PIL import Image

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('compose', Path(__file__).with_name('compose-skybox.py'))
compose = importlib.util.module_from_spec(spec)
spec.loader.exec_module(compose)


class SkyboxTests(unittest.TestCase):
    def setUp(self):
        self.feature = dict(asset='test', yaw=90, pitch=0, roll=0, widthDeg=40, gain=1)
        self.layout = dict(version=1, library={'test': dict(file='test.png', aspect=1)}, features=[self.feature])
        self.ray = np.array([[0., 1., 0.]])

    def test_black_and_back_face_are_transparent(self):
        black = {'test': np.zeros((4, 4, 3))}
        self.assertEqual(compose.composite(self.ray, self.layout, black).max(), 0)
        white = {'test': np.ones((4, 4, 3))}
        self.assertEqual(compose.composite(-self.ray, self.layout, white).max(), 0)

    def test_overlap_uses_screen_blend(self):
        self.layout['features'].append(dict(self.feature))
        result = compose.composite(self.ray, self.layout, {'test': np.full((4, 4, 3), .5)})
        np.testing.assert_allclose(result, .75)

    def test_native_alpha_and_black_level(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as root:
            path = Path(root)/'alpha.png'
            Image.new('RGBA', (4, 4), (255, 255, 255, 128)).save(path)
            np.testing.assert_allclose(compose.load_asset(path), 128/255, atol=1e-6)

    def test_seam_and_poles(self):
        self.feature['yaw'] = 180
        rays = np.array([[-1., .001, 0], [-1., -.001, 0]])
        values = compose.composite(rays, self.layout, {'test': np.ones((4, 4, 3))})
        np.testing.assert_allclose(values, 1)
        self.feature['pitch'] = 90
        center, right, up = compose.frame(self.feature)
        np.testing.assert_allclose(np.cross(right, up), center, atol=1e-7)

    def test_sprinkle_is_fixed_by_seed(self):
        a, b = copy.deepcopy(self.layout), copy.deepcopy(self.layout)
        for index in range(12):
            a['library'][str(index)] = dict(file=f'{index}.png',aspect=1)
            b['library'][str(index)] = dict(file=f'{index}.png',aspect=1)
        compose.sprinkle(a, 12, 42)
        compose.sprinkle(b, 12, 42)
        self.assertEqual(a, b)
        compose.validate(a)

    def test_composition_rules(self):
        self.layout['features'].append(dict(self.feature))
        with self.assertRaises(ValueError): compose.validate(self.layout)
        self.layout['features'][1]['asset']='other'
        self.layout['library']['other']=dict(file='other.png',aspect=1)
        with self.assertRaises(ValueError): compose.validate(self.layout)
        self.layout['features'][1]['yaw']=-90
        compose.validate(self.layout)
        with self.assertRaises(ValueError): compose.sprinkle(self.layout,1,42)
        self.layout['library']['other']['family']='nebula'
        self.assertEqual(len(compose.selected_features(self.layout)),1)

    def test_bake_dimensions_repeatability_and_validation(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as root:
            Image.new('RGB', (8, 8), (128, 64, 32)).save(Path(root)/'test.png')
            a = compose.bake(self.layout, Path(root), 128)
            b = compose.bake(self.layout, Path(root), 128)
            self.assertEqual(a.size, (128, 64))
            self.assertEqual(a.tobytes(), b.tobytes())
        self.feature['widthDeg'] = 180
        with self.assertRaises(ValueError):
            compose.validate(self.layout)


if __name__ == '__main__':
    unittest.main()
