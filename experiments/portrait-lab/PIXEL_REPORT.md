# Pixel reduction of frozen illustrations — 2026-10-19

**The 96-pixel full-color grid is the most useful compromise in this comparison.**
It retains much more facial detail than the 64 grid while making the result more
visibly pixelated. The 128 grid preserves the illustration better but makes a less
pronounced stylistic change. These remain pixel-reduced illustrations, not a claim
of hand-authored WC2 quality. Feature-aware sampling and small-cluster cleanup do
not yet establish a decisive artistic improvement over ordinary sampling.

## Controlled inputs and method

The six 512×512 illustration-model outputs from structural-v2 were frozen. No model
was rerun, no new shading was drawn, and no source photo was reintroduced. Original
and negative results remain unchanged. Source illustrations, mattes and landmark
files are hash-recorded; the full audit verifies they did not change between runs.
Inherited model changes to age, eyes and skin tone, and existing matte/background
errors, remain visible. Pixel processing does not fix them.

Three kinds of processing were compared:

1. **Area sampling:** average foreground colors into each logical pixel. Background
   is excluded from the color average so dark/skin edges do not average with the
   backdrop. Majority coverage determines the stepped silhouette.
2. **Feature-aware representative sampling:** use the same sampling outside facial
   features; within expanded eyelid/brow/lip/nostril regions, choose an actual source
   color near an edge-weighted cell average. This tries to preserve thin drawn
   strokes, not invent pupils or make all eyes darker. The masks use source-photo
   landmarks expanded to accommodate model shape changes; they are approximate.
3. **Small-cluster cleanup:** after optional palette mapping, merge tiny low-contrast
   components into an adjacent palette color. Fixed color-error limits reject
   large contrast changes; protected features and silhouette edges are excluded.
   Changed-pixel masks and counts are saved. This is local cleanup, not facial
   region construction or a claim of hand-designed pixel clusters.

Each is evaluated at logical grids 64, 96 and 128, exported at both 128×128 and
256×256 using nearest-neighbor enlargement. Grids 64 and 128 divide the requested
outputs cleanly. **Grid 96 does not**: nearest enlargement creates alternating
pixel widths. At this stage readability is prioritized over a historically uniform
pixel grid, but the distinction must remain visible in human review. Its sampling
carrier is 576 pixels followed by exact 6×6 cell reduction, without cropping.

Full RGB is the primary control. Two optional **shared palettes learned from the
frozen illustrations**, 128 and 256 colors, are compared. Each uses balanced samples
from all six faces, with a reserved background slot. Palettes are identical across
the two saved runs. No palette is fitted separately to each face. No old palette,
dithering, scalar value bins or synthetic shading patches are used.

Eight configurations per grid combine sampling, full color/shared palettes and
cleanup: **24 settings × six faces × two output sizes = 288 renders**, encoded as
**576 lossless files**. pixel-v1 contains grids 64/128; pixel-v2 adds grid 96. All
settings, sampled intermediates, logical grids, feature masks, cleanup masks,
palettes, contact sheets, codec bytes, versions and tool snapshots are preserved.

## Visual findings

- **64 grid:** clearly blockier, but pupils, lip contours and glasses lose too much
  definition. The neutral woman and older man are especially soft at native size.
  Hair silhouettes and moustache mass survive better than small facial marks.
- **128 grid:** eyes, mouths, glasses and hair remain closest to the illustration.
  It is a useful high-detail candidate, particularly at 256 output with uniform
  2× pixels. At native 128 it can still read as a small smooth digital illustration.
- **96 grid:** a middle ground. The moustached man and glasses remain legible while
  the pixel grid becomes noticeable. Fine eye detail still degrades and unequal
  enlargement widths can make some strokes uneven. This is a candidate to review,
  not a proven winner.
- **Feature sampling:** differences from area sampling are modest. Some line pixels
  become firmer, but there is no convincing across-face advantage. Preserve both;
  do not describe this method as recovering information lost to a coarse grid.
- **128-color shared palette:** the neutral woman's forehead and cheeks acquire
  conspicuous flat patches; the older man's tonal distinctions compress further.
  Reject it as the main delivery candidate. It repeats a known failure mode even
  though its colors were learned from the illustrations rather than hand-authored.
- **256-color shared palette:** much less damaging, and worth retaining as a compact
  option, but fine skin speckle and mild contouring remain. It does not beat the
  full-color candidate purely because its files are smaller.
- **Cluster cleanup:** removes numerous small index components, but the visual
  change is subtle. It does not turn sampling into purposeful WC2-style pixel
  drawing. Preserving delicate features necessarily limits aggressive cleanup.

The full-color candidates avoid *new value-bin/palette islands* because those
operations are absent. They still inherit the illustration's own facial marks,
shadows and interpretation errors. For example, the cheek mark on p006-047 is
already present in the frozen illustration; it was not added by this pixel pass.
The source blue background blob and some cutout fringes are also inherited.

## Actual compression

Median **lossless WebP bytes**, six faces per candidate/output size:

| Candidate | 128×128 | 256×256 |
| --- | ---: | ---: |
| 64 feature, full RGB | 6,597 | 7,491 |
| 96 feature, full RGB | 11,537 | 13,340 |
| 128 feature, full RGB | 16,014 | 20,807 |
| 96 feature, shared 256 + cleanup | 5,327 | 6,576 |
| 128 feature, shared 256 + cleanup | 7,412 | 9,458 |

PNG exports use indexed storage where a shared palette is present, otherwise RGB.
Both codecs are pixel-exact. Per-file PNG/WebP bytes are in each run's sizes.csv;
combined candidate summaries and ranges are in pixel-v2/size-summary.csv. Output
size changes nearest-neighbor repetition, not logical detail, so a 256 asset is not
a separate higher-detail drawing. Compression is not an artistic score.

## Checks and next decision

Four new tests pass: deterministic sampling/palette fitting, grid coverage including
non-divisor grids, exact codec round trips, and cleanup protection of both facial
features and high-contrast dots. The complete output audit verifies all 576 files,
their logical-grid expansion, palette membership, input hashes, and zero cleanup
changes inside protected feature masks. Repository npm run check passed. No
gameplay systems, runtime network access or new model inference were introduced.

Keep **96 full RGB** and **128 full RGB** as the main human-review candidates;
retain shared-256 versions as compression comparisons, not automatic replacements.
Do not resume tuning the failed Painted/Graphic/Region Redraw branches. Further
progress toward authored WC2 pixel work would require better control of contour
placement and meaningful color clusters, or a pixel-style illustration intermediate.
The current result shows a comparatively safe reduction step, not that the remaining
art-direction problem is solved.
