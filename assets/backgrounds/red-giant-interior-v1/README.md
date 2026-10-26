# Red giant upper envelope, draft v1

An artistic view from inside diffuse stellar gas, with no disk, surface horizon,
external space or point stars. The source currently reads as dense cloud in places;
this is a first direction study rather than a physical radiative-transfer model.

Open `review.html` using the repository's static server. The viewer loads only the
six baked faces and local vendored Three.js. Drag or use the six direction buttons.
Slow turn is optional and respects reduced motion. The optional simple foreground
silhouette is a contrast aid, not a lighting or performance validation.

`source.png` is original built-in imagegen artwork (1536 x 1024).
`prompt.json` records the exact prompt. `prepare.py` extracts six distinct 512px
regions without repainting, and writes the native portable `cube-recipe.json`.
Each region is used once on an inward-facing emissive card. Deliberate overlap
fills the whole envelope, with broad radial alpha windows, screen blending and gain .9. Source region
resolution limits fine detail; this draft intentionally uses 512-square faces.

Rebake from the repository root with Python, Pillow and NumPy:

```sh
python assets/backgrounds/red-giant-interior-v1/prepare.py
python tools/bake-sky-cube.py assets/backgrounds/red-giant-interior-v1/cube-recipe.json --size 512 --output assets/backgrounds/red-giant-interior-v1/cube
```

All six captures use origin zero, 90-degree FOV, timestamp zero and identical
exposure. World up is +Z; yaw 90 is +Y. WebGL face order is px,nx,py,ny,pz,nz.
Upload without flipping Y. Exact bases and hashes are in `cube/manifest.json`;
the six `axis-*.png` images use those same cameras for orientation diagnostics.
No mission selection is changed. This is a static sky at infinity: translation
does not create parallax or simulate movement through gas.

Visual review: the forward browser view was inspected before and after broadening
the source alpha windows; the initial rectangular crop boundaries were removed.
The result is intentionally very soft at flight-scale fields of view. Full edge,
corner, pole and rotating foreground review remains outstanding for this draft.
