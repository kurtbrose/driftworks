"""Feather generated fire/smoke edits onto the fixed registered aftermath."""
from pathlib import Path
import json
import numpy as np
from PIL import Image

root = Path(__file__).resolve().parents[1]/'assets/backgrounds/planet-hero-v1'
base = np.asarray(Image.open(root/'registered-v3/6.png').convert('RGB'), dtype=np.float32)
h, w = base.shape[:2]
y, x = np.mgrid[:h, :w]
regions = [(.38,.51,.043),(.38,.46,.035),(.42,.43,.04),(.56,.46,.035),(.62,.38,.055)]
mask = np.zeros((h, w), dtype=np.float32)
for cx, cy, radius in regions:
    distance = np.hypot(x/w-cx, y/h-cy)/radius
    mask = np.maximum(mask, 1-np.clip((distance-.65)/.35, 0, 1))
# The established impact patch is immutable through both new land stages.
protected = np.hypot(x/w-.49, y/h-.46)
mask *= np.clip((protected-.065)/.012, 0, 1)
for index, name in [(7,'fires'),(8,'smoke')]:
    art = Image.open(root/f'fire-cues-v1/{name}.png').convert('RGB')
    assert art.size == (w,h)
    source = np.asarray(art, dtype=np.float32)
    result = np.rint(base*(1-mask[..., None])+source*mask[..., None]).astype(np.uint8)
    assert np.array_equal(result[protected < .065], base.astype(np.uint8)[protected < .065])
    assert np.array_equal(result[mask == 0], base.astype(np.uint8)[mask == 0])
    Image.fromarray(result).save(root/f'fire-cues-v1/{index}.png')
(root/'fire-cues-v1/masks.json').write_text(json.dumps(dict(regions=regions,
    protectedImpact=dict(center=[.49,.46],radius=.065,feather=.012),base='../registered-v3/6.png'),indent=2)+'\n', newline='\n')
