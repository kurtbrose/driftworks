# Painted follow-up — 2026-10-19

This pass is visibly less photographic than Structure: skin has larger value
regions, backgrounds are mostly flat, and the collection shares a warm-skin/cool-ink
palette. **It is still an experiment, not a claim of hand-painted WC2 quality.**
Keep both `painted-g128-v7` and `graphic-g128-v5` for review: the former retains
more facial nuance; the latter makes the move toward graphic retro artwork clearer.

## What changed

All 24 existing inputs were retained without individual edits. YuNet finds five
2D landmarks; an eye-based similarity transform fixes eye separation to 22.5% of
the canvas and eye height to 44%, without changing facial proportions. This fixes
the distant face in p001-012 and makes head size consistent. Eye-line roll is
normalized; yaw and expression remain source-dependent. A frontalization warp
would require inventing unseen features or changing identity, so it was not used.
Original crops, prior outputs and source manifest remain unchanged.

A local human-segmentation model replaces photographic backgrounds with muted
blue-gray. Initial graph-cut masks lost dark hair; the compact U2Net mask also
lost long hair and a cap. Those failures remain in the preview/v1 directories.
The larger human-specific mask restores those shapes, notably p001-012/p006-021.
The crop was also relaxed to leave more room above the head. Source-truncated
hair cannot be restored.

One authored shared palette is used for **every face**, with warm skin ramps,
cool shadows, hair colors, lip accents and ivory highlights. It is not recomputed
from any portrait. Background color is reserved exclusively for the matte. Darker
and lighter skin still differ; no per-face histogram equalization is used.

Repeated bilateral filtering suppresses photographic pores and small highlights
while retaining large boundaries. Fixed five/seven-level luminance planes create
painted regions. Landmark-relative masks strengthen brow/eye-socket shadows,
cheek highlights, nose-side shadow/ridge light and jaw shadow. These are approximate
2D regions, not inferred 3D anatomy. Source detail is selectively retained around
eyes, lips, nose and glasses; fine texture elsewhere is strongly reduced. Dither
is disabled. Isolated palette speckle is smoothed away from protected features.

## Experiment and review

Eight settings cross painted/graphic shading, 96/128 working grids, and five/seven
value levels, with both 128×128 and 256×256 output: **384 rendered portraits and
1,152 encoded files**. Four comparison sheets show source, old Structure, isolated
aligned source and two final candidates. Four full sweeps preserve every setting.
Four additional matched-framing control sheets compare aligned Structure,
shared-palette-only reduction and painted shading. They show that alignment and
palette alone still preserve photographic texture; broader value planes make a
separate visible contribution.

Visual observations from all four comparison pages and the first full sweep:

- Eye/mouth placement and scale are substantially more consistent. p001-012 is
  now readable rather than a tiny face inside a large crop.
- Glasses remain recognizable on p001-005/p001-006/p006-060. Moustache shapes
  survive on p006-005/p006-042. Beard mass and hair outline remain on p006-047.
- Five levels gives bolder painted shapes, but can flatten the nose and cheeks.
  Seven levels retains more nuance. The 128 working grid preserves fine eye and
  mouth contours better and scales cleanly to both requested sizes.
- Strong directional lighting remains difficult: p006-059 has large dark areas;
  the graphic version can make eyes look hollow. Approximate nose lighting can
  disagree with the original lighting. No symmetry or invented pupils hide this.
- Simplification removes freckles and some wrinkles. On p001-058/p006-063 that
  reduces distinctive age/texture cues even when the main face shape survives.
- Segmentation remains imperfect: p001-005 retains a bright blue background blob;
  p001-056 retains some vegetation-colored edge pixels. Some hair edges and
  headphones acquire halos or small holes. No manual matte repair was applied.
- Skin can look like cut-paper patches or a posterization filter rather than
  carefully drawn planes. Shared colors improve consistency but do not by
  themselves establish an illustrated art style.

These are qualitative observations, not numerical artistic scores. The six
previously held-out inputs were included in this exploratory follow-up's visual
review, so that split is no longer an untouched final evaluation set.

## Compression and checks

Median actual bytes, 192 assets per resolution/format across the eight settings:

| Output | Indexed PNG | Lossless WebP | Quality-85 WebP |
| --- | ---: | ---: | ---: |
| 128×128 | 2,941 | 1,975 | 2,895 |
| 256×256 | 3,660.5 | 2,426 | 5,718 |

`results/painted-v2/sizes.csv` stores every measurement; `audit.json` contains
summaries and alignment checks. Every lossless decoded file uses only colors from
the shared palette; WebP pixels match the corresponding PNG. Lossy WebP may add
colors and artifacts and remains a delivery comparison only. These medians pool
different settings and framing from the earlier spike, so they are not a controlled
compression-speed or quality win over Structure.

All six Python tests passed, covering deterministic alignment/mattes, geometric
proportion preservation, fixed palette, codecs and the original converter. A
full output audit verified 1,152 files. `npm run check` passed. No gameplay code,
site dependencies, runtime network access or production portrait integration was
added. Conversion requires optional OpenCV and local pinned 2D models; setup is
explicit and separate from conversion.

## Next useful decision

Review painted versus graphic at native size. Further progress should target
topology of facial shading regions and matte quality, not simply fewer colors or
more contrast. A next controlled pass could merge adjacent skin regions by area
while protecting eyelid/lip contours, and compare source-adaptive nose lighting
with the fixed lighting masks. Retain this pass as the control. Do not begin blink
or mouth-shape animation until those still-image choices are stable.
