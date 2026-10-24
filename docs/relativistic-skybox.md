# Offline relativistic skybox experiment

`tools/boost-skybox.py` transforms a 2:1 equirectangular sky into six PNG cube
faces, with a manifest and labeled contact sheet. Python NumPy and Pillow are
authoring dependencies only. It reuses `bake-sky-cube.py` camera conventions.
Source panorama: longitude `atan2(Y,X)`, latitude toward +Z, row zero north.
Cube faces use the existing WebGL bases, with no vertical upload flip.

```sh
python tools/boost-skybox.py assets/backgrounds/star-river-photo-v3-8k.jpg --output output/my-boost --beta .99 --direction 1 0 0 --size 1024 --samples 2
python tools/test-boost-skybox.py
```

Output directories must be new; originals are preserved. Direction is normalized.
Each output sample is inverse-aberrated into the original sky, sampled bilinearly
in linear RGB, accumulated with supersampling, and converted back to sRGB.
At observed direction cosine mu, Doppler factor is `1/[gamma*(1-beta*mu)]`.
Geometry is an exact special-relativistic angular transformation for distant,
stationary scenery. This assumes one shared source rest frame, with no parallax.

`--color none` isolates aberration. Default `blackbody` assumes every input RGB
pixel modulates a 6500 K blackbody sampled at 610/550/460 nm. It multiplies each
channel by `B_lambda(lambda,D*T)/B_lambda(lambda,T)`, incorporating monochromatic
Doppler intensity changes. There is no extra D^4 multiplier: that applies to
bolometric radiance, not these monochromatic channel estimates. `--temperature`
changes this assumption; `--exposure` is a shared fixed exposure in stops.
This is an illustrative RGB approximation, not recovered spectroscopy or a
colorimetric human-eye simulation. It cannot infer missing IR/UV or HDR radiance.
Extreme velocities clip highlights and lose faint stars in 8-bit output.
Finite panorama resolution also limits rear-sky detail; supersampling reduces
aliasing but cannot recover unresolved stars. No artificial star streaks are added.

The first experiment is `output/relativistic-sky-v1/`, with original, geometry,
and shifted variants at 512 pixels per face, 2x2 samples, beta=.99 along +X.
Serve the repository and open `/output/relativistic-sky-v1/review.html` for an
inside-cube comparison using the vendored Three renderer. Drag to look, use
Forward/Rear/Side, and select variants. Nothing changes mission sky selections.
Manifests retain source hash, relative path, physical and sampling parameters,
face bases and image hashes. No timestamps or randomness affect the bake.

Physics reference: [image-based relativistic rendering](https://diglib.eg.org/server/api/core/bitstreams/ccf8809b-960c-491f-bbcc-f191db0f3bc5/content).

Initial visual inspection: labeled six-face shifted contact sheet and forward
inside-cube browser view. Corrected the preview's Three background X reflection
by using an explicit samplerCube shader with the exported world directions.
Full manual inspection of every edge/corner and high-resolution acceptance remain
open; this is an experimental bake rather than an approved mission asset.
