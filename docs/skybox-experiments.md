# Skybox experiment log

## 2026-10-20: River of stars and Woven starlight

The target is the photographic stellar background in the user's asteroid
reference: fine unresolved stars, smoky dust, irregular dense/empty regions,
and occasional larger stars. The user explicitly likes that it is **not uniform**:
there are brighter and less-bright areas. Preserve that contrast when joining
regions. Physical astronomical color accuracy is secondary to the artwork.

### Findings worth preserving

| Experiment | Result / lesson |
| --- | --- |
| Procedural pinpoints and smooth bands | Too regular; density alone did not produce the photographic texture. |
| Procedural clumps with brighter stars | More variety, but still a carpet of bright speckles. An example old crop averaged 23.7/255 versus 9.8/255 in the reference. |
| Dimmer procedural correction | Overshot: an example in-game crop averaged 2/255. Similar overall brightness is useful, but it is not proof of matching texture. |
| Imagegen full-sphere draft, 1774 × 887 | Good whole-image appearance, but too magnified in flight. Native detail must be judged at the camera's angular scale; resizing to 8K does not invent detail. |
| Imagegen local texture panel | Much closer photographic texture. Keep tiny faint stars, smoky grey-blue/grey-brown clouds and dark dust; avoid coarse white dots. |
| Three-axis projection of one panel | Orientation changes resembled box corners. A seamless image alone did not prevent directional distortion. |
| 64 rotated tangent patches of one panel | Smooth sphere, but the human eye recognized the same clumps repeatedly. Rotation, reflection and feathering do not make recognizable artwork unique. Rejected. |
| Two unique adjacent panels with 25% overlap | Promising join. A raised-cosine feather in linear light hid an imperfect match. B used a linear exposure gain of about 0.857. Individual stars were not pixel-aligned; this was reference-guided continuation, not hard-constrained outpainting. |
| K / Woven starlight | Twelve distinct source images, each placed once, with radial feathered overlaps on the sphere. Preserves brighter and quieter areas. J remains the rejected repeated-panel comparison. |

The crop numbers above describe specific sampled regions, not universal scores.
Always compare actual in-game crops and inspect several headings and pitches.
The procedural/three-axis mistakes show why an attractive contact sheet is not
sufficient validation.

### Current reproducible recipe

- Runtime: `assets/backgrounds/star-river-woven-v1-8k.jpg`, 8192 × 4096.
- Layout, placements, source SHA-256 values and blend settings:
  `assets/backgrounds/woven-stars-v1/recipe.json`.
- Built-in imagegen prompts and reference dependencies:
  `assets/backgrounds/woven-stars-v1/prompts.json`.
- The original first panel's prompt is in `star-river-photo-v2.json`; the second
  panel's continuation prompt is in `river-continuation-study-v1/provenance.json`.
- Authoring tool: `tools/bake-woven-sky.py` (NumPy and Pillow, offline only).
- Source images are retained. Generation is nondeterministic: rerunning a prompt
  creates new artwork. Reuse the saved sources and recipe for a deterministic bake;
  use the recorded Python/library versions for byte-level JPEG reproduction.

The twelve regions occupy six equatorial positions plus three upper and three
lower positions. No source is tiled, mirrored, rotated into multiple positions,
or reused. Each source SHA must be unique. The tangent windows have a 58° radius,
raised-cosine alpha squared, and a 15% sampling margin so source borders are never
sampled at full strength. Linear-light weighted blending joins overlaps. One
global linear gain of 0.65 applies to the whole sky; individual panels are not
normalized to equal brightness. North/south poles and longitude wrap are sampled
from spherical directions, with no cube-face boundaries.

```sh
python tools/bake-woven-sky.py --recipe assets/backgrounds/woven-stars-v1/recipe.json --output assets/backgrounds/star-river-woven-v1-8k.jpg
python tools/test-woven-sky.py
python tools/bake-sky-lighting.py --layout assets/backgrounds/hero-layout-v1.json --output assets/backgrounds/sky-lighting-v1.json
node tools/refresh-flight-assets.cjs
node tests/flight-skybox.cjs
npm run check
```

The bake is still one texture draw at runtime, followed by the existing 3,200-star
batch. The twelve source images are authoring inputs, not twelve runtime layers.
Mipmaps are generated once on upload. Native display resolution is the default;
150% supersampling shades 2.25 times as many screen pixels. Source panorama size
and screen supersampling are separate budgets. PMREM is cached once per sky per
renderer, using its own preprocessed HDR lighting source.

### Repeatable visual review

1. Open `experiments/skybox-review.html` and select **Woven starlight**.
2. Check several headings, both poles, and longitude wrap. Look for straight
   borders, box-like folds, bright seams and blurred/ghosted overlap bands.
3. Compare native-pixel crops to the reference, not just full-image thumbnails.
   Check stellar scale, faint haze, rare bright points and quiet gaps separately.
4. Look for recognizable repeated clumps. Hash uniqueness only rejects literal
   duplicate assets; it cannot certify that generated motifs are visually unique.
5. Review with ships in front, original colors and faction paint, and sky lighting
   both enabled and disabled. Finally compare in flight under Settings → Skybox.

Keep the photographic generated structure, unique neighboring regions, broad
edge feathering and irregular brightness. Avoid recurring procedural waves,
reused clumps and global equalization that erases quiet/bright differences.
