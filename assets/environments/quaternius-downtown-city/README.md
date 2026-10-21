# Downtown City MegaKit — Quaternius, Standard edition

[Original pack](https://quaternius.itch.io/downtown-city-megakit) · **CC0 1.0**.
`LICENSE.txt` is the original supplied license, preserved verbatim.

`models/` contains all **153** supplied glTF 2.0 models, their binary buffers,
and only the 29 image dependencies referenced by those models. Binary buffers
and images are preserved byte-for-byte. Keeping the shared textures separate avoids
duplicating the same large images into every GLB. Load through the existing
vendored `GLTFLoader`; all dependencies resolve locally beside the glTF.

Duplicate FBX exports, promotional previews, HDR environments and unused/source
textures were not extracted. The original ZIP was removed after preparation;
download it again from the source link to reproduce the import.
`provenance.json` records the archive hash and hashes of every retained file,
plus a model catalog with triangle and material counts and original glTF hashes.

The prepared glTF JSON removes the `COLOR_0` attribute binding: this pack uses
vertex colors as custom shader wear masks, which ordinary glTF materials
multiply into the surface color, producing red patches on roads. The original
binary buffers still contain those values; a fresh source download supplies
the original bindings for a future custom wear shader. Geometry, UVs and texture
references are unchanged. This deliberately provides the plain textured baseline.

For the Ohio farm/truck stop, start with `Street_2Lane_noSidewalk` (16 triangles),
`Street_Asphalt_6x6`, `Sidewalk_Straight_3m` (60), `Door_1`, `Prop_Bollard` (190),
and a few low wall/roof modules. This Standard archive does not contain the
Source edition's full example buildings or its custom interior/wear shaders.
Do not assume the marketing page's complete model count applies to this archive.

The original textures are 2K; reuse their materials, load only the sets required
by the scene, and consider a lower-resolution/base-color-only derivative for
distant scenery. No automatic resizing or destructive material conversion was
applied during preparation. Source modular scale and pivots are preserved.
These are available assets, not yet additional gameplay draws.

Reproduce/verify using `tools/prepare-rural-assets.py` and
`node tools/check-rural-assets.mjs`. The offline check loads all geometry through
Three.js and validates original texture references and PNG headers; texture
rendering is checked separately in the browser.

Source credit: **Downtown City MegaKit by Quaternius (CC0)**.
