"""Focused physics and projection checks; run with NumPy and Pillow."""
import importlib.util
from pathlib import Path
import numpy as np

spec = importlib.util.spec_from_file_location('boost',Path(__file__).with_name('boost-skybox.py'))
b = importlib.util.module_from_spec(spec)
spec.loader.exec_module(b)
d = np.array([1.,0,0])
rng = np.random.default_rng(42)
rays = rng.normal(size=(1000,3))
rays /= np.linalg.norm(rays,axis=1,keepdims=True)
identity, factor = b.inverse_boost(rays,d,0)
np.testing.assert_allclose(identity,rays,atol=1e-14)
np.testing.assert_allclose(factor,1)
boosted, _ = b.inverse_boost(rays,d,.99)
restored, _ = b.inverse_boost(boosted,-d,.99)
np.testing.assert_allclose(restored,rays,atol=1e-12)
np.testing.assert_allclose(np.linalg.norm(boosted,axis=1),1,atol=1e-13)
_, factors = b.inverse_boost(np.array([d,-d]),d,.99)
np.testing.assert_allclose(factors,[np.sqrt(199),1/np.sqrt(199)])
side, _ = b.inverse_boost(np.array([[.99,np.sqrt(1-.99**2),0]]),d,.99)
np.testing.assert_allclose(side,[[0,1,0]],atol=1e-13)
np.testing.assert_allclose(b.spectral_gain(np.ones(3),6500),1)
# Panorama pixel centers and horizontal seam interpolation.
image = np.arange(24,dtype=float).reshape(2,4,3)
np.testing.assert_allclose(b.sample(image,np.array([[-.5,-.5,2**-.5]])),image[0:1,0],atol=1e-12)
print('Boost identity, inverse, unit directions, Doppler extrema, side aberration, color identity, sampling passed')
