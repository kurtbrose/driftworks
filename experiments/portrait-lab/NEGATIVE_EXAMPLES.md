# Rejected controls

The Painted and Graphic passes are **negative examples**, not recommended styles.
Their skin islands, cheek blobs, forehead spots and contour bands arise from
brightness/value bins and nearest-palette boundaries rather than anatomical
reasoning. The prior positive assessment in PAINTED_REPORT.md is superseded.

All original initial/, revised/, painted-v1/ and painted-v2/ outputs remain intact.
The twelve highlighted Painted/Graphic files for the six structural-study faces
are frozen by SHA-256 in negative-examples.json. audit_structure.py verifies the
Painted control hashes against the source provenance recorded when the experiment
ran. No individual negative portrait has been corrected or regenerated.

Use these cases to reject future pipelines that introduce similar artifacts. Do
not optimize their posterization parameters. structural-v1/ also preserves the
failed rectangular-patch landmark redraw; structural-v2/ fixes that seam while
retaining the failed renderer as an explicit comparison.

The user's Privateer 2 screenshot is a separate visual negative reference: retaining
photographic structure with pixel reduction/overlays does not establish cartoon
illustration. The screenshot has not been used as an input or copied into assets.
