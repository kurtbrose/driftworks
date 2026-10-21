"""Authoring regression checks for deterministic stellar streams."""
import importlib.util
from pathlib import Path
import sys
import unittest
import numpy as np

sys.dont_write_bytecode=True
spec=importlib.util.spec_from_file_location('river',Path(__file__).with_name('generate-star-river.py'))
river=importlib.util.module_from_spec(spec)
spec.loader.exec_module(river)


class RiverTests(unittest.TestCase):
    def test_seeded_spherical_field(self):
        a=river.generate(512,42)
        b=river.generate(512,42)
        self.assertEqual(a.size,(512,256))
        self.assertEqual(a.tobytes(),b.tobytes())
        self.assertNotEqual(a.tobytes(),river.generate(512,43).tobytes())

    def test_stellar_texture_and_large_scale_lanes(self):
        pixels=np.asarray(river.generate(1024,42),dtype=float).mean(axis=2)
        self.assertGreater((pixels>40).sum(),100)
        bands=pixels.reshape(16,32,32,32).mean(axis=(1,3))
        self.assertGreater(bands.max(),bands.min()*2)
        self.assertLess(pixels.mean(),20)

    def test_empty_pockets_and_resolved_bright_stars(self):
        pixels=np.asarray(river.generate(2048,76841),dtype=float).mean(axis=2)
        tiles=pixels.reshape(32,32,64,32).mean(axis=(1,3))
        self.assertGreater(np.percentile(tiles,90),np.percentile(tiles,10)*5)
        # Resolved stars need bright neighboring pixels, not just isolated noise.
        bright=pixels>100
        neighbors=bright[:-1,:-1]&bright[1:,:-1]&bright[:-1,1:]&bright[1:,1:]
        self.assertGreater(neighbors.sum(),8)


if __name__=='__main__':
    unittest.main()
