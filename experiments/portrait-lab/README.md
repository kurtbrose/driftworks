# Procedural portrait laboratory

Source-preparation evaluation: [FRONTAL_PRESTEP_REPORT.md](FRONTAL_PRESTEP_REPORT.md)
compares four user-generated frontal photos with their originals through the same
illustration/pixel stages. The existing generations are treated as frozen, reviewed
source assets, not claimed as deterministic conversion. To reproduce the paired
downstream test, run `python evaluate_frontal_prestep.py` from this directory with
the existing structural-model environment. It writes a fresh
`results/frontal-evaluation-v1/` and refuses to overwrite it. No image-generation
service is called by this evaluation.

Latest pixel experiment: [PIXEL_REPORT.md](PIXEL_REPORT.md), with native-size
comparisons under `results/pixel-v2/`. This freezes the promising illustration
branch and compares pixel sampling/cluster cleanup; it does not rerun the model.
Painted and Region Redraw remain rejected negative controls. Feature Smooth remains
an anatomy-preserving comparison, not a recommended illustration style.

## Run pixel reduction of the frozen illustrations

From this directory, with the existing Pillow/NumPy/OpenCV experiment environment:

```
python -m unittest -v test_pixel_lab.py
python pixel_lab.py --grids 64 96 128 --output results/my-pixel-run
```

No PyTorch runtime, model weights or network are needed for this stage. It reads
the six cached illustration images and landmark JSON files from structural-v2,
plus the preserved painted-v2 mattes. A fresh output directory is required. Logical
grids are exported to both 128 and 256 outputs. The palettes are learned jointly
from the frozen illustrations; the old damaging palette is not used. Full RGB is
preserved as a control against new palette-induced bands.

`python audit_pixel.py` verifies the two preserved pixel-v1/pixel-v2 runs and writes
the compact review and combined byte summary to pixel-v2. That audit targets those
saved runs; a newly named run has its own run.json, palettes.json and sizes.csv.
Grid 96 has unequal nearest-neighbor pixel widths at the requested output sizes;
grids 64/128 provide integer-scaled controls.

Latest investigation: [STRUCTURAL_REPORT.md](STRUCTURAL_REPORT.md). **Painted and
Graphic are rejected negative controls**, preserved unchanged; see
[NEGATIVE_EXAMPLES.md](NEGATIVE_EXAMPLES.md). The structural study compares
continuous feature-aware smoothing, explicit 2D region redraw and a deterministic
illustration-model intermediate. It does not continue posterization tuning.

## Run the structural research comparison

This optional branch uses research-only 2D weights. Read the model scope/terms in
STRUCTURAL_REPORT.md before treating any dependency as suitable for production.
With Python 3.12 on the tested Windows CPU setup, from the **repository root**:

```
python -m pip install --target .portrait-lab-runtime/neural -r experiments/portrait-lab/requirements-structural-neural.txt
python experiments/portrait-lab/setup_structural_models.py
python experiments/portrait-lab/structure_lab.py --output experiments/portrait-lab/results/my-structural-run
```

The existing Pillow/NumPy/OpenCV experiment dependencies are also required. The
architecture source and its MIT license are vendored in models/; weights are
downloaded only by explicit setup and verified by SHA-256. Inference uses
weights-only loading, local CPU and deterministic algorithms. No torch.hub remote
code loading, runtime network calls, 3D models or stochastic image-generation
service is used. Model repeatability is tested in this environment, not promised
across hardware and library versions.

The six selected faces, original aligned inputs and masks are read from preserved
painted-v2 outputs. A fresh result directory is required. Full-color 512 intermediates
are retained before 128/256 reduction; the old palette is applied only as a fixed
negative ablation. No threshold search is performed.

From this lab directory run `python -m unittest -v test_structure_lab.py`.
`python audit_structure.py` audits the preserved structural-v2 run, creates the
fixed-palette comparison sheets and verifies negative control hashes. The original
and painted workflows below are historical, reproducible experiment records.

Offline research spike, isolated from the game. No gameplay files, script loading,
assets, or deployment dependencies change. The original converter requires Pillow
and NumPy. The painted follow-up adds OpenCV and checksum-pinned **2D detection and
segmentation** models. Those original/painted branches use no generative image
model. The structural comparison additionally tests a fixed 2D illustration GAN.
No branch uses 3D geometry or hand retouching. WC2 attachments inform visual goals
only; they are not conversion inputs.

## Painted follow-up — rejected historical results

See [PAINTED_REPORT.md](PAINTED_REPORT.md) and `results/painted-v2/review.png`.
That pass standardizes eye-line/head scale, isolates the subject, uses a single
shared palette and reduces skin to broad value planes with protected features.
The original `initial/` and `revised/` outputs remain unchanged. `painted-v1/`
preserves the intermediate attempt; `painted-preview*` records failed/partial
cutout experiments, not recommended candidates.

From this directory, use Python with these optional offline experiment dependencies:

```
python -m pip install -r requirements-painted.txt
python setup_painted_models.py
python -m unittest -v test_painted_lab.py test_portrait_lab.py
python painted_lab.py --output results/my-painted-run
```

`setup_painted_models.py` explicitly downloads and verifies two pinned models.
Conversion itself never accesses the network. Their provenance/licenses are in
`models/MODELS.md`; weights and local `.deps/` are ignored. The head-size/eye-line
normalization is a 2D similarity transform; it preserves each face's yaw rather
than synthesizing a frontal view. Sources must already be frontal/slight three-quarter.
Missing detections stop the run instead of silently accepting inconsistent framing.
Use a fresh output directory: painted runs refuse to overwrite existing results.

`run.json` records matrices, landmarks, source hashes, model hashes, library
versions, palette and sweep settings. Aligned sources, mattes, smoothed images,
value planes and feature masks are saved per face. PNG and lossless WebP use only
shared-palette colors; quality-85 WebP is a separate lossy delivery experiment.

To regenerate the **preserved final run's** matched controls and audit:

```
python compare_painted_controls.py
python audit_painted.py
```

These two reporting scripts target `results/painted-v2/`; they do not regenerate
portraits. Audit checks each measured file's size and palette and compares every
lossless WebP to its PNG. The matched controls separate alignment, palette-only
reduction and painted shading. The original report below describes the first spike.

## Status

**The study has run on 24 curated synthetic adult faces.** The original gallery
was unreachable. The user's replacement, deepInteligence/25K-synthesized-face,
provided usable images through two bounded public Drive archive downloads.
See REPORT.md for visual findings and limitations. Full results and intermediates
are preserved under `results/`; downloaded originals stay in ignored `inputs/`.

## Run

Use Python 3.11+ with `pip install -r requirements.txt`, then from this directory:

```
python -m unittest -v test_portrait_lab.py
python portrait_lab.py --manifest manifest.json --output results/initial
python portrait_lab.py --algorithms structure --output results/revised
python preview.py
python measure_indexed.py
python summarize.py
```

An empty manifest intentionally fails with an actionable message. Image conversion
is entirely offline. Identical inputs, crop, tool, and dependency versions reproduce
the output; codec byte identity across library/platform versions is not promised.
`run.json` records versions, source SHA-256 hashes, parameters, and tool hash.

## Required collection and manifest

Acquire 24 synthetic adult head-and-shoulders portraits with neutral expressions,
front or slight three-quarter views, unobstructed eyes and mouths, and comparable
head size. Deliberately cover a range of apparent ages, skin tones, face shapes,
hair textures and lengths. Include glasses, beards, wrinkles, dark hair against a
dark background, and uneven lighting as tagged stress cases. Aim for 18 ordinary
inputs plus 6 stress cases. Inspect and reject unsuitable framing before running;
do not quietly count rejected images as tested faces.

Keep original downloads in ignored `inputs/`. The selected replacement source
states CC BY 4.0 in its README: attribute deepintelligence, *Human Faces Dataset
Generated by Stable Diffusion* (2025), and mark outputs as procedural derivatives.
Source: https://github.com/deepInteligence/25K-synthesized-face . License:
https://creativecommons.org/licenses/by/4.0/ . The manifest stores source URL,
acquisition date, source archive path, hash, observable tags and split.

`acquisition.json` records exact Drive IDs, byte ranges and fragment hashes.
Download `bytes=0-33554431` from parts 001 and 006 via Drive's public download,
then run `extract_sample.py FRAGMENT inputs --prefix p001` (or p006). The extractor
reads only complete PNG entries with verified CRC, without writing archive paths.
Run `curate.py` to recreate the frozen selection. These are archive-order samples,
not a random or balanced benchmark. They include many rejected children, closed
eyes and extreme expressions; only the selected 24 are conversion inputs.

Example entry (illustrative filename; not an available input):

```json
{
  "id": "face-001",
  "file": "inputs/face-001.webp",
  "source_url": "https://example.org/exact-source-file.webp",
  "acquired": "2026-10-19",
  "terms_url": "https://thisfacenotexist.com/terms.html",
  "tags": ["glasses", "neutral", "frontal"],
  "crop": [0.0, 0.0, 1.0, 1.0]
}
```

Optional `sha256` enforces source identity. Optional `features` is an array of
normalized `[left,top,right,bottom]` boxes around the two eyes, nose and mouth in
the **final square crop**. These are annotations, not edits. Omit them for the
fixed framing prior used by default. Do not describe that prior as face detection.
The tool applies EXIF orientation, crop, then center-fits a square; inspect saved
`framed.png` before interpreting feature protection. Keep cropping policy consistent.

## Design and sweep

All four families receive the same normalized image:

| Family | Distinct mechanism | Expected weakness to inspect |
| --- | --- | --- |
| baseline | Lanczos sampling then median-cut palette | Photographic texture and weak features |
| cluster | Spatial median rank filtering, color and contrast shaping | Pupils and narrow mouth lines may vanish |
| contour | Discrete tonal planes plus bounded local dark-detail extraction | False contours, wrinkle exaggeration |
| feature | Coarse color planes blended with fine scale using soft feature priors and gradient edges | Misaligned priors; glasses and hair can preserve noise |
| structure (revision) | Local dark-detail and gradient protection over a smoother base, edge-restricted dither | Preserves source texture as well as useful details |

Each crosses palette sizes 16/32, working grids 64/96, and ordered dithering off/on.
That is 32 settings at both 128 and 256 output sizes, 64 images per face.
Working grid size is independent of final size: nearest sampling at export retains
the chosen low-resolution structure. A 96-to-128 enlargement has unequal pixel
widths; compare with the integer-scaled 64-grid candidates for consistency.
All variants use adaptive per-face palettes. Cross-face palette consistency is not
solved by a color-count limit; a shared palette is a proposed follow-up.

No-dither is preserved alongside ordered dither because dither may reintroduce
skin noise. The feature blend was too soft in visual review. The revised structure
family recovers dark detail without assuming eye locations, and restricts dithering
to edges. It improves readability but is still closer to processed photography
than designed WC2-style artwork. `results/initial/tool.py` preserves the original
implementation; `results/revised/tool.py` preserves the revision.

## Outputs and review

- `comparison-*.png`: same faces across all four families at matched settings.
- `sheet-*.png`: labeled full factorial comparisons per family and resolution.
- Per-face sampled, prepared, and palette intermediates, plus normalized source.
- `sizes.csv`: actual encoded bytes for optimized RGB PNG, lossless WebP, and
  quality-85 WebP, each encoded from the same output. Lossy WebP is a delivery
  comparison, not another stylization algorithm; inspect decoded edges for ringing.
- `review.csv`: human review rows, intentionally unscored by the tool.

Review sheets at native size and nearest-neighbor enlargement. Compare every face
to its source. Score disappearing pupils, asymmetrical eyes, lost lip boundary,
flattened nose, silhouette loss, and skin noise (0 absent, 1 mild, 2 severe).
Judge identity and artistic preference separately; do not sum these into a claim
of artistic success. Tag failures by input properties, not just overall favorites.
Keep at least two different promising families and unselected sweep outputs.

If pupils disappear, reduce filtering only in aligned feature regions; if skin
is noisy, suppress dither in low-gradient planes rather than adding global blur.
If contours break, test threshold changes on all faces, including a held-out subset.
Split 18 exploration / 6 held-out faces before tuning. Preserve the original run
and save each revised run to a new directory with the same inputs for comparison.

## Next animation experiment

After human selection of a still-image family, use deterministic **2D** landmark
detection or explicit reusable landmark annotations to define eye and mouth masks.
Test localized piecewise-affine warps and compositing for open/half/closed eyelids
and closed/A/E/O mouth shapes. Freeze the palette, pixel grid, lighting and all
pixels outside those masks across frames. Render a fixed blink/speech sequence;
review identity drift, seam artifacts, glasses occlusion and temporal shimmer.
Compare sprite-frame PNG/WebP bytes with animated lossless WebP bytes. Warping
cannot recover unseen teeth or closed eyelids: treat that as a separate procedural
shape-design study, not a solved consequence of the still converter.

## Sources

- Gallery: https://thisfacenotexist.com/random-face-generator
- Source terms: https://thisfacenotexist.com/terms.html
- Source provenance: https://thisfacenotexist.com/about/

The original gallery's search-index descriptions were accessible; live files were not. The four
attached screenshots remain user-supplied style references. They were not copied
into the repository or treated as source photographs.
