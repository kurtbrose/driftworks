# Structural simplification investigation — 2026-10-19

**Painted and Graphic are rejected negative examples.** Their value boundaries
follow brightness thresholds and palette cells rather than facial anatomy. The
previous assessment overstated progress toward illustration. No posterization
parameters were optimized in this investigation.

## Findings

1. **Feature-aware processing can avoid the reported bands.** The continuous
   feature-smoothing branch does that here, but its result remains an airbrushed
   photograph. Artifact removal and illustrated interpretation are separate goals.
2. **Dense landmarks alone do not provide facial drawing knowledge.** The explicit
   region redraw creates anatomically anchored boundaries instead of brightness
   islands, but looks like a generic stencil with photographic hair/eyes attached.
   This renderer is a failed structural hypothesis, not a proposed art direction.
3. **A learned 2D illustration intermediate is the most promising route tested
   here for coherent drawn features.** It changes the shapes and organization of
   eyes, brows, lips and hair, rather than merely flattening source colors. It also
   changes likeness and apparent skin tone/age cues. It is not WC2-style artwork.
4. **Necessity is not established.** Three implementations on six difficult faces
   cannot rule out a better explicit 2D renderer, semantic face parser or other
   feature-aware method. The evidence supports testing the learned route further;
   it does not justify claiming that non-generative methods are fundamentally
   incapable of illustration.
5. **The final reduction stage remains a separate failure point.** Applying the
   unchanged old shared palette to even the learned illustration reintroduces
   bands, skin islands and blue-gray patches. A good intermediate does not excuse
   destructive quantization afterwards.

## Controlled experiment

The same six source faces selected by the user's failure examples were used:
p001-005, p001-012, p001-079, p006-005, p006-018 and p006-047. These are diagnostic
cases, not a fresh representative or blinded evaluation set. Cached aligned sources
and mattes from painted-v2 are reused, holding framing/background errors constant.
No input photo, landmark or matte was hand-edited. No 3D model or geometry is used.

The 106-point **2D** landmark detector supplies a 68-point anatomical contour subset
for jaw, brows, eyelids, nose and lips. Predictions and labeled overlays are saved.
This is contour localization, not a semantic skin/hair/glasses parser and not an
estimate of facial surface orientation. Forehead extent is a documented geometric
extrapolation. Weak existing input tags protect some glasses/facial-hair regions;
missed or incomplete tags remain a limitation.

| Approach | Mechanism | What it actually tests |
| --- | --- | --- |
| Continuous feature smoothing | Broad spatial smoothing inside the facial contour; retains finer source detail around predicted features; full RGB | Can texture be reduced without inventing tonal boundaries? |
| Explicit region redraw | Samples skin colors, draws a facial fill and jaw/nose regions located by landmarks; restores source eyes and some glasses/facial hair | Are sparse anatomical contours enough to construct useful illustrated planes? |
| Fixed illustration model | Local AnimeGAN-derived Face Portrait v2 feed-forward inference at 512×512 | Does a learned illustration prior organize features better than these image-processing rules? |

There are no new scalar value bins or artificial forehead highlights in any base
branch. Each 512 intermediate is reduced to 128 and 256 with Lanczos, without
palette compression. A **single fixed ablation** applies the old 67-color palette;
it is a negative diagnostic, not a palette search or recommended delivery setting.
PNG and lossless WebP encodings are measured for both treatments.

The first redraw implementation restored rectangular glasses patches; this looked
like a collage. It remains in structural-v1. Structural-v2 instead restores local
dark frame detail inside the same regions. That removes the rectangular seam but
does not solve the renderer's generic face/stencil appearance. Both runs are kept.

## Visual observations

- **Feature smoothing:** false isocontour bands are gone. Eyes and lips remain
  recognizable, but cheeks become airbrushed and wrinkles/age cues soften. Original
  lighting, photographic geometry and hair detail still dominate the result.
- **Region redraw:** forehead and jaw boundaries now come from explicit contours,
  not source brightness, but flat fills erase individual cheek/nose anatomy. Eyes
  look pasted in; generic mouth shapes and weak facial-hair handling harm likeness.
  Landmarks locate features but do not describe their illustrated shading.
- **Illustration model, p001-005:** glasses, eyelids, brows and lips form a coherent
  drawing. Eye size and frame appearance change. The source's blue background blob
  remains because the same flawed matte is used in every branch.
- **Illustration model, p001-012:** drawn eyes/lips read more clearly, but the face
  acquires larger eyes and a lighter, cosmetically styled appearance.
- **Illustration model, p001-079:** glasses and hair remain identifiable; wrinkle
  strokes are reinterpreted rather than simply preserved. This can change age cues.
- **Illustration model, p006-005/p006-047:** moustache and cheek-mark/beard cues are
  retained better than in the explicit redraw. Facial contours and eyes are still
  reinterpreted, so recognizability is not evidence of exact identity preservation.
- **Illustration model, p006-018:** the head wrap and beard remain, but the skin
  becomes visibly lighter/grayer and some shading is washed out. This is a material
  failure, not a successful case to average away.
- **Palette ablation:** the neutral woman and older man show conspicuous new skin
  patches after palette mapping. That damage is downstream of model inference.

These are visual judgments from the saved comparisons and intermediates, not
automatic artistic scores. No embedding metric was used to certify identity.
The illustration model demonstrates a useful representation change; its anime/
portrait domain and smooth finish differ substantially from the WC2 references.

## Reproducibility, sizes and limits

The fixed checkpoint runs on CPU with one thread, deterministic algorithms and
evaluation mode. It has no prompt, diffusion sampler or random latent input.
Two repeated inferences produced pixel-identical output in the tested environment.
That establishes local repeatability, not bitwise equivalence across hardware,
library upgrades or model versions. It also does not guarantee factual fidelity:
a repeatable model can consistently invent or alter facial detail.

144 encoded files were audited for dimensions, actual bytes and exact PNG/WebP
pixel agreement. Twelve Painted/Graphic negatives were hash-indexed and checked
unchanged; previous outputs were not regenerated. Actual **full-RGB lossless WebP
median bytes**, six faces per cell:

| Method | 128×128 | 256×256 |
| --- | ---: | ---: |
| Feature smoothing | 14,585 | 45,527 |
| Region redraw | 11,523 | 31,412 |
| Illustration model | 16,914 | 56,359 |

Full-color diagnostics cost more bytes than the old limited-palette portraits.
These are not optimized delivery assets. All measurements, including PNG and the
fixed palette ablation, are in results/structural-v2/sizes.csv and audit.json.
512 intermediates, masks, raw unmasked model output, landmarks, source hashes,
model hashes, source snapshots and dependency versions are preserved.

Three new tests pass: landmark repeatability/topology, a smooth-ramp regression
that forbids artificial steps in the continuous branch, and model inference
repeatability. The ramp is a software diagnostic, not a substitute face dataset.
The optional PyTorch runtime lives in ignored .portrait-lab-runtime/neural at the
repository root, outside the application-script tree. An initial type-check failure
from bundled dependency JavaScript was corrected by that isolation; no type-check
coverage was weakened. No gameplay integration was made.

## Models and research scope

Landmarks: InsightFace 2d106det, a 2D-only checkpoint. Its upstream pretrained
weights are restricted to non-commercial research. No 3D checkpoint was downloaded
or loaded. [Upstream model policy](https://github.com/deepinsight/insightface/blob/master/python-package/docs/model_zoo.md).

Illustration: bryandlee's PyTorch Face Portrait v2 checkpoint/architecture. The
wrapper code is MIT, while upstream AnimeGAN publishes non-commercial-use terms.
These research weights are not cleared here for commercial game deployment.
[Checkpoint/architecture](https://github.com/bryandlee/animegan2-pytorch),
[upstream terms](https://github.com/TachibanaYoshino/AnimeGANv2#license).
Hashes and exact setup URLs are in setup_structural_models.py and each run record.
Weights are local ignored research dependencies, not game assets.

The wider distinction between surface smoothing, structural abstraction and texture
is also explicit in [Learning to Cartoonize Using White-Box Cartoon Representations](https://openaccess.thecvf.com/content_CVPR_2020/papers/Wang_Learning_to_Cartoonize_Using_White-Box_Cartoon_Representations_CVPR_2020_paper.pdf).
That paper provides research context; its method was not implemented in this run.

## Next experiment

Continue the illustration-intermediate branch as a **hypothesis**, using a second
appropriately licensed 2D illustration model and all 24 faces before choosing one.
Review age, skin tone, eye shape, lips, glasses, facial hair and hair outline at 512
and 128 before any palette compression. Include the older dark-skinned man as a
required failure case. A parallel explicit alternative worth testing is semantic
face-part parsing plus contour/region rendering, which was not tested here; denser
landmarks should not be confused with that capability.

Once a genuinely acceptable drawn intermediate exists, investigate topology-aware
pixel reduction as its own stage. Do not resume tuning Painted/Graphic thresholds,
reuse the damaging old palette as a default, or claim a model intermediate by
itself has solved the retro-portrait task.
