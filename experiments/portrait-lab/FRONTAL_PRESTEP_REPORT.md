# Generative photographic normalization as source preparation

**Worth keeping as an optional, reviewed pre-step before illustration.** The four
existing frontal edits produce more consistent downstream portraits, not just
cleaner source photographs. They do not establish that exact frontal pose is always
artistically preferable or that identity has been preserved without change.

## Paired test

Compared p001-006, p001-057, p006-042 and p006-064 against their original photos.
No new image-generation calls were made. The existing edits and their shared
prompt remain in results/imagegen-frontal-v1. All four files are 1254×1254 PNGs
with real alpha, including alpha values 0 and 255 on a full-image inspection.
Presence of alpha does not by itself certify clean hair fringes or opaque subjects.

Both branches use the existing eye-based framing normalization, the same fixed
Face Portrait v2 checkpoint, and the same 96-grid feature sampler exported at 128.
Generated images use their supplied alpha, warped with the alignment transform;
originals use the existing cached matte. No new segmentation is imposed on the
generated cutouts. Eight illustration inferences and sixteen lossless PNG/WebP
pixel exports are preserved in results/frontal-evaluation-v1, with input hashes,
alignment matrices and codec measurements. Export decoding was checked pixel-exact.

This compares the **combined** change in pose, lighting, background, expression
and generated details. It does not isolate which individual change helped. Both
branches already receive comparable eye scale/height from deterministic alignment.
The result therefore is not merely a benefit from resizing one branch better.

## Observations

- The frontal versions have consistent gaze, more comparable shoulders, and
  better visibility of both eyes and both sides of the face at small sizes.
- More even input lighting gives the illustration stage less severe asymmetrical
  source shading to reinterpret. The p001-057 pair makes this particularly clear.
- Supplied cutout alpha removes scene clutter before model inference and avoids
  several errors seen in our automatic matte experiments. It still needs checking
  over the intended comms background, especially around fine hair.
- Glasses, moustache, distinctive hair and earrings broadly survive, but facial
  widths, eyes, hair volume, clothing and other details change. The hidden side
  of a turned face has been plausibly reconstructed, not recovered as ground truth.
- The illustration model then makes its own changes. Stacking generative stages
  can compound likeness/age/skin-tone drift even when each result looks attractive.
- Several original three-quarter illustrations retain more character. The WC
  references themselves include slight three-quarter poses; frontal pose is a
  production/animation convenience, not an inherent requirement of that art style.

The saved generation prompt explicitly permitted approximate identity and said
exact detail preservation was not essential. That is a valid exploratory choice,
but these outputs are not a strict test of identity-preserving frontalization.
Use a stricter preservation brief and source/output review if character continuity
matters. A single instruction cannot substitute for that review.

## Where this belongs

Use the photographic phase as a clean separation of responsibilities:

1. Curate/generate a canonical photorealistic character reference: chosen pose,
   neutral expression, complete hair silhouette, stable age/skin tone, simple
   lighting and clean alpha. Pose may be frontal or a deliberately consistent
   slight three-quarter view.
2. Review and accept that image as the character's reference. Keep the original,
   edit prompt, model/settings when available, source/output IDs and output hash.
3. Apply deterministic framing, the frozen illustration stage, and the pixel
   reduction. Compare each downstream result back to the accepted reference.

Separating normalization from illustration makes each failure easier to diagnose.
It does not imply two generative passes are always better than a single canonical
illustration pass; that would be another controlled comparison.

## Reproducibility and recommendation

This changes the original fully procedural experiment boundary. Manual/cloud image
generation is **curated source creation**, not part of the deterministic converter.
Recording a prompt is not proof that regeneration will produce the same pixels.
Freeze and hash the accepted outputs; do not regenerate them on every conversion.
The downstream process can remain reproducible from those frozen inputs.

For fictional characters, where approximate resemblance is acceptable, the reduction
in input variability looks worthwhile. For exact likeness preservation, automatic
frontalization should remain optional and subject to stricter review. These four
examples support a useful preparation workflow, not a general reliability claim
about image models or a completed solution to WC2-style pixel art.
