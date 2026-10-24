# Runtime portrait review evidence

The PNGs here were captured from the real browser `faceBlend` compositor, with
sixteen labeled 256px stills per character. Companion JSON records bind the
atlas, compositor and captured sheet hashes. They intentionally remain marked
`visual-review-pending`; capture alone cannot approve artwork.

The current inspected examples are Tammy (Ohio 9), Cousin Donnie (Ohio 10), and
Daniel Okafor (civilian 1). The stills show the result after source registration,
including speech and blink over all four expressions. Tammy and Donnie no longer
combine the old upward-shifted emotional faces with neutral-position mouth and
blink patches. Daniel's sheet is retained so his facial artwork can be judged
at readable size rather than hidden by a pixel-copy score.

This is **not** whole-cast approval. Registration fixes translation only.
Ohio speech cycling and mood switching were also spot-checked in the cast
gallery. Final visual acceptance remains separate under
`docs/portrait-authoring.md`; uninspected characters remain unapproved. Regenerate
evidence if their atlas or compositor changes.
