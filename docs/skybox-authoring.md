# Hero sky authoring

The flight sky has three independent layers: black space, fixed authored hero
features, and crisp stars. Stars keep a fixed CSS-pixel footprint while the camera
turns; ship position never moves the sky. The original procedural choices remain
available in Settings. **G / Hero galaxy**, **H / Hero nebula**, and **I / Hero sun** use the generated image library as three separate compositions.

## Library and layout

`assets/backgrounds/features/` contains the original generated galaxy, blue nebula,
and warm sun images. Their prompts and provenance are in `prompts.json` alongside
them. Each feature has black margins; black contributes nothing under screen
blending. Native PNG alpha is also supported. A small black-level subtraction and
3.5% edge feather prevent rectangular seams from imperfect source backgrounds.
Black inside a feature does not erase anything behind it. Use an opaque geometry
layer if real foreground dust occlusion is needed later.

`assets/backgrounds/hero-layout-v1.json` is the portable source of truth. It names
library images and their aspect ratios, then gives each placement an asset ID,
yaw, pitch, roll, angular width in degrees, and gain. Yaw 90 points along +Y;
pitch 90 is +Z. Placements use a tangent-plane projection onto the sphere, so
features cross the panorama seam and poles without being pasted as distorted
rectangles. Widths must be below 160 degrees; larger clouds can use several stamps.

Composition rules:

- Never repeat an asset in a layout.
- Each sky uses one visual family: galaxies, nebulae, or suns. Do not mix them.
- Start with one focal feature and leave the rest as stars and black space.
- Multiple unique features in a future family must leave at least 10 degrees of
  black space between conservative angular bounds. The helper rejects overlaps.
- Keep the initial nebula modest: 26 degrees wide rather than the old 66/82-degree
  clouds. Galaxy width is 20 degrees; the sun stamp is 7 degrees including its halo.

The layout is fixed, including the seed. Nothing is randomized when a mission
loads. The authoring tool can resolve additional seeded placements with
`--sprinkle N --seed 42`, then saves all explicit placements in the export recipe. It only uses previously unused assets from the selected family and rejects requests larger than that available library.
For art-directed layouts, edit the JSON placements directly.

## Full-detail flight rendering

The runtime loads the local manifest and its three PNGs once, then draws one
textured quad at infinity for the selected family using the same layout. It screen-blends the features
over black before drawing stars. The reused textures occupy about 18 MiB of GPU
storage before renderer overhead, with one feature draw call. The sky canvas
resolution is independent of scene resolution and defaults to 150% of display
resolution, capped at three pixels per CSS pixel. Source textures keep their own
detail rather than being reduced to a small area of a global panorama.

An 8K panorama covers 360 degrees: about 23 pixels per degree. A 20-degree galaxy
gets roughly 455 horizontal pixels there, whereas the separate runtime texture
retains all 1,536 source pixels. Exporting 16K does not invent more source detail.
For sharper close views, generate a higher-resolution individual feature or place
it at a smaller angular width; raising screen resolution alone cannot add detail.

## Bake a panorama

The offline helper requires Python with Pillow and NumPy. These are **authoring
dependencies only**; the repository remains deployable as a static site.

```sh
python tools/compose-skybox.py assets/backgrounds/hero-layout-v1.json --width 8192 --output assets/backgrounds/hero-composition-v1-8k.jpg
python tools/compose-skybox.py assets/backgrounds/hero-layout-v1.json --width 4096 --output output/hero-4k.png
python tools/compose-skybox.py assets/backgrounds/hero-layout-v1.json --family nebula --width 8192 --output output/nebula-8k.jpg
python tools/test-compose-skybox.py
```

The helper exports a 2:1 equirectangular image and a sibling `.layout.json`
recipe with portable relative paths. It samples the sphere in small row batches
to bound memory. Output dimensions can be 2048, 4096, 8192, or 16384 pixels wide.
Export includes the hero layer only; stars remain separately rendered so their
size stays steady. Screen blending, orientation, gain, and feathering match the
runtime. The default exposure is one; the in-game brightness slider can alter it.

The supplied `hero-composition-v1-8k.jpg` is an 8192 × 4096 galaxy-family reference bake. It is not loaded alongside the feature textures at runtime.

## Verification

`npm run check` includes feature geometry, selection, family isolation and rendering regression
coverage. The Python tests additionally check seam/pole continuity, black and
native-alpha compositing, screen-blended overlap, deterministic sprinkling and
repeatable panorama baking. Test the flight sky in a browser after changing art,
placement or shaders; the headless suite cannot validate visual quality.
