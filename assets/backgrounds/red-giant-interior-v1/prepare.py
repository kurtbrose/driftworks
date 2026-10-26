"""Extract six unique source regions and retain an editable card recipe."""
import json
from pathlib import Path
from PIL import Image
import numpy as np

root = Path(__file__).parent
source = Image.open(root / 'source.png').convert('RGB')
width, height = source.size
recipe = {'version': 1, 'seed': 20261025, 'family': 'stellar-envelope',
          'minGapDeg': -180, 'library': {}, 'features': [],
          'notes': 'Deliberately overlapping diffuse gas cards; Z up, yaw 90 = +Y. Screen blend, exposure one, frozen timestamp zero. No point stars.'}
placements = [(90, 0, 0), (180, 0, 13), (270, 0, -17), (0, 0, 7), (0, 90, 23), (0, -90, -11)]
for index, (yaw, pitch, roll) in enumerate(placements):
    col, row = index % 3, index // 3
    bounds = (col * width // 3, row * height // 2, (col + 1) * width // 3, (row + 1) * height // 2)
    image = source.crop(bounds).convert('RGBA')
    # Broad radial emission windows hide source crop rectangles before projection.
    yy, xx = np.mgrid[-1:1:complex(image.height), -1:1:complex(image.width)]
    radius = np.sqrt(xx * xx + yy * yy)
    fade = np.clip((1.12 - radius) / .9, 0, 1)
    fade = fade * fade * (3 - 2 * fade)
    image.putalpha(Image.fromarray(np.rint(fade * 255).astype('uint8')))
    name = f'gas-region-{index + 1}'
    image.save(root / (name + '.png'))
    recipe['library'][name] = {'file': name + '.png', 'aspect': image.width / image.height,
                             'family': 'stellar-envelope', 'sourceBounds': list(bounds)}
    recipe['features'].append({'asset': name, 'yaw': yaw, 'pitch': pitch, 'roll': roll,
                               'widthDeg': 142, 'gain': 0.9})
(root / 'cube-recipe.json').write_text(json.dumps(recipe, indent=2) + '\n', encoding='utf-8', newline='\n')
