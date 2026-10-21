"""Register local signed image differences; never move the frozen geography."""
from pathlib import Path
import json
import numpy as np
from PIL import Image

root = Path(__file__).resolve().parents[1] / 'assets/backgrounds/planet-hero-v1'
target = root / 'registered-v3'
target.mkdir(exist_ok=True)
master = np.asarray(Image.open(root/'master.png').convert('RGB'), dtype=np.float32)
h, w = master.shape[:2]
y, x = np.mgrid[:h, :w]
cx, cy = w*.49, h*.46
roi = (x-cx)**2+(y-cy)**2 < 65**2

def center(delta):
    weight = np.maximum(0, delta[:, :, 0]-delta[:, :, 2]-30)**2*roi
    return float((weight*x).sum()/weight.sum()), float((weight*y).sum()/weight.sum())

def translate(delta, dx, dy):
    sx, sy = np.clip(x-dx, 0, w-1), np.clip(y-dy, 0, h-1)
    ix, iy = sx.astype(int), sy.astype(int)
    fx, fy = (sx-ix)[..., None], (sy-iy)[..., None]
    jx, jy = np.minimum(ix+1, w-1), np.minimum(iy+1, h-1)
    return ((delta[iy, ix]*(1-fx)+delta[iy, jx]*fx)*(1-fy)
            +(delta[jy, ix]*(1-fx)+delta[jy, jx]*fx)*fy)

Image.fromarray(master.astype(np.uint8)).save(target/'0.png')
frames = []
for index, (time, radius) in enumerate([(2, 18), (30, 42), (60, 56), (120, 60), (300, 74), (600, 90)], 1):
    delta = np.asarray(Image.open(root/f'impact-overhead-v2/{time}.png').convert('RGB'), dtype=np.float32)-master
    source_center = center(delta)
    dx, dy = cx-source_center[0], cy-source_center[1]
    # Shift only signed event differences, not the underlying planet pixels.
    radial = np.sqrt((x-cx)**2+(y-cy)**2)/radius
    mask = (1-np.clip((radial-.72)/.28, 0, 1))[..., None]
    for _ in range(10):
        registered = translate(delta, dx, dy)*mask
        measured = center(np.clip(np.rint(master+registered), 0, 255)-master)
        dx += cx-measured[0]
        dy += cy-measured[1]
    final = np.clip(np.rint(master+translate(delta, dx, dy)*mask), 0, 255).astype(np.uint8)
    actual = center(final.astype(np.float32)-master)
    error = float(np.hypot(actual[0]-cx, actual[1]-cy))
    assert error < .5, (time, error)
    assert np.array_equal(final[radial >= 1], master.astype(np.uint8)[radial >= 1])
    Image.fromarray(final).save(target/f'{index}.png')
    frames.append(dict(time=time, source=f'../impact-overhead-v2/{time}.png', file=f'{index}.png',
        sourceCenter=source_center, shift=[dx, dy], radiusPixels=radius,
        registeredCenter=actual, errorPixels=error))
    print(time, 'center error', round(error, 3), 'pixels', flush=True)
(target/'registration.json').write_text(json.dumps(dict(method='Signed local RGB difference registration; warm-difference centroid; frozen master',
    center=[cx, cy], uv=[.49, .46], times=[0, 2, 30, 60, 120, 300, 600],
    flash='No painted flash in playback; live radiance pulse only', frames=frames), indent=2)+'\n')
