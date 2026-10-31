# Portrait authoring, registration and visual acceptance

**A passing test suite is not visual approval.** The first mask correction passed
pixel-copy checks while visibly broken composites remained. Those checks proved
that pixels were copied, not that facial features were in the right places.

## Acceptance gate

Before calling a changed character ready:

1. Open [portrait review](../experiments/portrait-review.html). Select the cast
   and named character. Inspect all sixteen actual runtime composites at **256px
   or larger**: neutral, relieved, frustrated and worried, each at rest, AH, OO
   and blink. Do not review a whole cast as tiny thumbnails.
2. Use **Show labeled contact sheet** and retain its PNG as evidence. Capture
   both source and composite sheets when diagnosing registration. Sheets must
   identify the character and every expression/pose. A raw atlas alone is not
   evidence that runtime compositing works.
3. Examine eye centers, lids and brows; lip corners and mouth center; nose,
   cheeks and chin; and the entire patch boundary. Reject double features,
   old eyebrows above closed lids, displaced mouths, skin seams, moving facial
   scale and changing identity. Compare with the master.
4. Watch the cast gallery through speech, blink and expression transitions.
   Inspect both normal radio size and enlarged stills. If a defect is visible,
   record its character/expression/pose and keep that character unapproved even
   if all mechanical checks pass.
5. Report exactly which characters and combinations were inspected. Approval
   needs retained stills, the atlas hash and compositor version, the checks
   performed, and any remaining defects. Changing source art, registration or
   masks invalidates that approval. Spot checks never approve the whole cast.

The review page deliberately says **visual approval pending**. Its compositing
counter is diagnostic and cannot turn into an artwork approval badge.

For reproducible local evidence, run `python tools/portrait-review-server.py`
and open its printed localhost URL. Its optional capture mode saves the actual
contact-sheet PNG under `docs/portrait-reviews/`, with atlas, compositor and sheet
hashes in a companion JSON record. Every new capture starts as
`visual-review-pending`. This helper uses Python's standard library and is not
part of deployment; ordinary static serving and manual PNG download still work.

## Corrections and current limits

There were two separate issues. Elliptical feature masks retained parts of the
previous expression near their corners. Rectangular opaque cores with feathered
edges improve ownership. More significantly, the packers calibrated neutral and
reused that transform for every independently generated frame. In the expanded
cast, lower-row faces drifted upward: Tammy's facial registration needed about
seven pixels of downward correction; Cousin Donnie's needed up to twelve.
Overlays then mixed facial features from different positions.

`assets/portraits/registration.json` now supplies seven explicit integer offsets
per character, bound to hashes of the original source art. Both source packers
apply them offline; Ohio inherits the corrected dogfight facial pixels. No new
runtime dependency or network request is needed. The master remains unchanged.
The stable-nose fit does **not** guarantee correct eye spacing, mouth shape,
facial scale or seams. Generated proposals still need the acceptance gate above.
Daniel Okafor and the rest of the cast must not be called approved solely because
registration residuals pass.

`tests/portrait-registration.cjs` checks source/registration/helper hashes,
registered exports, stable-nose translation residuals and a negative control for
the previously observed seven-pixel shift. The review page checks small opaque
feature samples and unchanged pixels outside the face guard. Neither test is an
anatomy or visual-quality test.

## Authoring and offline registration

Start with one approved neutral master and record exact cell rectangles and
left-eye, right-eye, nose and mouth landmarks. Author expressions as localized
edits; keep framing, head size and identity fixed. Prompts requesting alignment
are not measured alignment. Check every frame, including row boundaries.

The optional proposal tool uses Python, Pillow and NumPy. Export unregistered
atlases to a scratch directory rather than replacing runtime files:

```powershell
./tools/prepare-flight-portraits.ps1 -Unregistered -OutputDirectory scratch/portraits/dogfight/runtime
./tools/prepare-civilian-portraits.ps1 -Unregistered -OutputDirectory scratch/portraits/civilian-shuttle/runtime
./tools/prepare-civilian-portraits.ps1 -Pool runway-workers -Unregistered -OutputDirectory scratch/portraits/runway-workers/runtime
python tools/probe-portrait-registration.py --input-root scratch/portraits --output scratch/registration-proposal.json
```

The probe refuses registered input to prevent cumulative corrections. It fits
integer translation against a stable nose region and writes proposals plus three
diagnostic source contact sheets. It does not approve or automatically install
them. Compare nose, both eyes and mouth against the master, adjust explicit
offsets if needed, and reject/redraw frames with scale or anatomy changes that
translation cannot repair. Never stretch a face to make a mouth fit.

After reviewing the proposed registration, update the registration JSON and run
the ordinary packers without `-Unregistered`, then `prepare-ohio-portraits.ps1`.
The source-hash gate rejects stale calibration. Never hand-edit runtime PNGs.
Export order remains neutral, AH, OO, blink, smile, angry, afraid, seven 256px
cells. Preserve source art, prompts and provenance hashes.

Run focused portrait tests, the visual acceptance gate, asset-version refresh
and `npm run check`. Report mechanical validation and visual acceptance
separately; unresolved artwork stays unresolved.

## Convoy wardrobe variants

The convoy uses seven mission-specific atlases in `assets/portraits/convoy`.
Slots 0/1 are Lancer Three/Two; 17/18/19/21/22 are Mara, Daniel, Elena,
Ines and Thomas. `portraits.cast: "convoy"` overrides only those radio slots;
Control, raiders and other missions retain their existing casts. Voice and
character IDs stay unchanged. `prompts.json` records individual wardrobe edits;
`roster.json` describes the convoy roles.

Run `./tools/prepare-convoy-portraits.ps1` after changing wardrobe sources or
recalibrating the original dogfight/civilian faces. It retains the calibrated
seven facial poses, freezes clothing across poses, and records source, wardrobe,
builder and output hashes. This mechanical preservation does not waive visual
review. Review the `convoy` pool in `experiments/portrait-review.html` and live
speech in `experiments/civilian-cast.html?category=convoy`; the latter offers
radio and enlarged review sizes.
