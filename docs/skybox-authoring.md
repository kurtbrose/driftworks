# Hero sky authoring

The complete-planet experiment uses the existing opaque two-landmark pass with
one black-backed full-disk planet and a separate sun. Missions `planet-hero`,
`planet-hero-80` and `planet-hero-140` retain the ordinary 8v8 furball rules and
vary the planet card width. The planet remains fixed at yaw 90 / pitch -30.
Stars behind its disk are culled once from the point buffer. The dedicated
`planet-hero-review.html` viewer can pass an optional vertical `fov` in degrees
to `flightSkybox.create`; this affects that sky instance only, clamps to 25–150,
and leaves the default 45 degree flight projection unchanged. See the source
and prompt in `assets/backgrounds/planet-hero-v1/` for native-resolution limits.
The sky instance also accepts `setPlanetImage(canvasOrImage)` for this planet
mission family. It updates only the existing planet texture, retaining its
projection, star occlusion and sun. An override submitted before the original
planet finishes loading is retained. The hero review viewer uses this for the
local overhead impact compositor. Mission `planet-impact-baked` instead samples
adjacent offline-baked 4K spherical maps, with three textures resident and a
flight-time clock that freezes on pause/loading. `sky.bakedImpact` selects this
pass while preserving the same landmark placement and disk star occlusion.
See [physical timing and bake notes](impact-timing.md). Other planet missions
continue using the static baseline.

The flight sky has three independent layers: black space, fixed authored hero
features, and crisp stars. Stars keep a fixed CSS-pixel footprint while the camera
turns; ship position never moves the sky. The original procedural choices remain
available in Settings. **G / Hero galaxy**, **H / Hero nebula**, and **I / Hero sun** use the generated image library as three separate compositions.

## Library and layout

`assets/backgrounds/features/` contains the original generated galaxy, blue nebula,
warm sun and secondary filament images. Their prompts and provenance are in `prompts.json` alongside
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
- Use one focal feature per viewing direction, with quiet space between landmarks. The whole sphere may contain several unique landmarks.
- Multiple unique features in a future family must leave at least 10 degrees of
  black space between conservative angular bounds. The helper rejects overlaps.
- A dominant nebula may be large when it owns that region of the sky. The primary
  cloud spans 66 degrees, with a distinct 16-degree filament on the far side. Galaxy
  width is 20 degrees; the sun stamp is 7 degrees including its halo.

The layout is fixed, including the seed. Nothing is randomized when a mission
loads. The authoring tool can resolve additional seeded placements with
`--sprinkle N --seed 42`, then saves all explicit placements in the export recipe. It only uses previously unused assets from the selected family and rejects requests larger than that available library.
For art-directed layouts, edit the JSON placements directly.

## Full-detail flight rendering

The runtime loads the local manifest and its four PNGs once, then draws one or two
textured quads at infinity for the selected family using the same layout. It screen-blends the features
over black before drawing stars. The reused textures occupy about 24 MiB of GPU
storage before renderer overhead, with one feature draw call per unique landmark. The sky canvas
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

## Art review with foreground geometry

Open `experiments/skybox-review.html`, also linked from Flight Settings. It uses
actual textured ship meshes and the flight sky renderer. Compare Dark opening,
Bright cloud rim, Open field, and Secondary landmark; swap models and orbit them.
Background framing is deliberately independent of model orbit for these art tests.

The opening gives the strongest composition: the ship sits in calm black space,
framed by luminous clouds. The bright-rim view is a useful contrast stress test;
fine hull detail competes with cloud texture there. Open space supplies visual
rest. The flight starting direction aligns with the primary nebula's opening.
The far-side filament is a different asset and silhouette, aiding orientation
without repeating the same cloud or mixing a galaxy/sun into the composition.

## Automatic environment lighting

Flight uses a custom WebGL renderer, rather than Three.js PBR materials. The
shared material shader now receives a sky-derived L2 diffuse probe (nine RGB SH
coefficients) and a bounded radiance texture for approximate rough reflections.
The probe applies to hulls, habitat shells, hardware and rock. Emissive materials,
engine effects and diagnostic flat materials retain their existing behavior.
Physical work lamps and their shadows remain additive local illumination.

Prepare the panorama and lighting together:

```sh
python tools/compose-skybox.py assets/backgrounds/hero-layout-v1.json --width 8192 --output assets/backgrounds/hero-composition-v1-8k.jpg --lighting-output assets/backgrounds/sky-lighting-v1.json
python tools/bake-sky-lighting.py --layout assets/backgrounds/hero-layout-v1.json --output assets/backgrounds/sky-lighting-v1.json
python tools/bake-sky-lighting.py --image output/new-sky-8k.jpg --name custom --output output/custom-lighting.json
python tools/test-sky-lighting.py
```

The baker integrates the sphere using solid-angle weights, converts sRGB to
linear light, limits extreme highlights, normalizes mean energy, and slightly
desaturates the illumination with the same policy for every sky. It then applies
the cosine-kernel factors for diffuse irradiance. Black environments get a finite
neutral fallback. There are no per-family intensity presets or placed key lights.
A common readability floor and display transfer adapt the result to the existing
display-referred material pipeline. The sky brightness slider remains an art
exposure control; it does not undo the lighting normalization.

`sky-lighting-v1.json` and its four 512 × 256 PNGs are precomputed and locally
served. They are shared across sky instances; each GL context uploads a reflection
map and creates its inexpensive mip chain once, then reuses it. No spherical
integration or diffuse convolution happens during flight. The source hash in the
dependency-free suite rejects stale caches after art or placement changes.

The sky renderer publishes its cached probe and viewing basis to the host. The
3D renderer receives it automatically and transforms normals/reflection rays into
the same sky coordinates. Missions and individual materials do not pick lights.
This also aligns illumination in the review page, where sky framing can be moved
independently of the model camera. Its **Sky-derived lighting** checkbox provides
an A/B comparison. Looking toward the large nebula backlights the ship; looking
away lets its colored illumination reach the visible hull faces.

Current coverage is the three authored hero families and River of stars. Legacy procedural/photo
comparison choices retain their original lighting. The `--image` input accepts
other 2:1 LDR equirectangular panoramas for the same preprocessing path. Reflection
filtering for the custom rock, mining and procedural materials uses conventional
mipmaps with a finish-based bias. Source-textured ships use the native PBR path below. Animated
environments and interpolation between cached probes are future extensions.

References: [Three.js diffuse light probes](https://threejs.org/docs/pages/LightProbe.html)
and [PMREM filtering](https://archive.threejs.org/docs/api/en/extras/PMREMGenerator.html).

## River of stars

**J / River of stars** explores a denser photographic style: unresolved stellar
texture across the sphere, broad flowing concentrations, warmer stellar populations
and dark dust lanes. Irregular concentrations at several angular scales create
dense knots and nearly empty pockets; a sparse population of larger blue and amber
stars adds bright cores and soft halos. It uses an independently seeded, offline-generated 8192 × 4096
panorama beneath the existing crisp point stars. Its structure rotates with the
camera and is identical on every load. No hero galaxy or nebula is layered over it.

```sh
python tools/generate-star-river.py --output assets/backgrounds/star-river-v1-8k.jpg
python tools/bake-sky-lighting.py --layout assets/backgrounds/hero-layout-v1.json --output assets/backgrounds/sky-lighting-v1.json
python tools/test-star-river.py
```

The fixed seed is 76841. The authoring layout's `extraImages.river` registers the
panorama with the same lighting preparation and cache validation used by the hero
families. The new style adds one textured background draw, followed by the existing
point-star draw. The source is about 8 MB compressed; an 8K texture can use roughly
128 MiB of GPU memory. It loads lazily when selected. Devices limited to 4096-pixel
textures automatically receive a 4K resize, leaving point-star sharpness unchanged.
The review page also offers this style for comparison with real ship geometry.

### Ohio compact background pass

The Ohio mission keeps its planet and sun as two local 1254-square source images.
The opaque sky shader samples them directly using the same tangent-plane projection,
geographic UV orientation, source black-level correction, edge feather, gain and
exposure as the original hero quads. It combines their screen-blend result in that
single draw; the unchanged point-star pass follows. No Ohio hero geometry or
blended landmark draws are submitted. Total sky draws are two, including stars.
The unused Milky Way panorama is not loaded in Ohio mode.

Each image initially has a complete black 1x1 texture, so loading or failure of one
source leaves the other source and the stars usable. The planet/sun use texture
units 2 and 3; panorama and noise retain units 0 and 1 for the other sky styles.
Image resolution and the existing NPOT linear filtering stay unchanged. No large
equirectangular bake, runtime resampling, or duplicate GPU image copy is required.

`tests/flight-skybox.cjs` checks projection agreement, original sun bearing, sampler
assignments, only two image requests, the absence of landmark geometry, and the
single opaque background plus point-star draw contract. Browser before/after
readbacks of planet, sun, edge and opposite views differed by at most one 8-bit
channel level. Desktop timing is not evidence of a speedup on another GPU; compare
on the affected MacBook before treating the reported slowdown as resolved.


### Native PBR for source-textured ships

Source-textured Quaternius ships use Three.js `MeshStandardMaterial` when a sky
lighting probe is active. The eleven archived glTF exports all specify
`metallicFactor: 0`, implicit `roughnessFactor: 1`, and double-sided surfaces.
The imported source color PNGs, UVs and smooth normals are retained; the color
textures are decoded as sRGB. Faction paint remains optional and affects the
orange regions only. The sky review page defaults to original colors and offers
an **Apply faction paint** checkbox.

A normalized 512 × 256 linear HDR RGBA float32 probe feeds `PMREMGenerator` once per
sky per renderer. Generated targets are retained for sky reselection; the 8K
visible sky is independent. The offline bake preserves unclipped normalized energy in little-endian
`.rgba32f.bin` files (2 MiB per sky), while retaining bounded PNGs and SH for
custom materials. The shared loader validates the float payload dimensions. Native
PBR receives diffuse and roughness-filtered specular environment illumination.
A shared ambient readability floor and environment intensity apply to every sky,
with no mission-specific lights. Panorama axes are converted explicitly to
Three's environment coordinates. Native ships use the same camera projection
and model placement as custom batches.

Asteroid geology, mining lighting and procedural hull shaders are unchanged.
They continue to consume the existing SH/reflection cache. Shadows, unlit effects,
legacy skies and the lighting-off comparison retain the custom path.


River's faint stellar population is baked as softly blended, mostly unresolved
photographic texture, with restrained density variations and a few resolved halo
stars. Bright pinpoints do not dominate its clouds. The 8K panorama is one
fullscreen textured draw; the shared 3,200-star layer is one additional batched
draw, not individual scene objects. The texture receives mipmaps once on upload.
Sky rendering now defaults to native display resolution; 150% and 200%
supersampling remain optional. Source texture resolution is independent of this
screen pixel budget; 150% costs 2.25 times native pixel shading work.


### Photographic River art direction

The active J sky uses `star-river-photo-v3-8k.jpg`. Its stellar texture comes from
`star-river-photo-panel-v1.png`, created with built-in imagegen using the user's
asteroid screenshot as a background-only style reference. The prompt and source
provenance are in `assets/backgrounds/star-river-photo-v2.json`.

A first generated full-sphere draft (1774 × 887) looked good as a whole image but
failed the in-game crop comparison: its stars were too large. The square panel
instead contains local photographic detail. `tools/bake-photo-star-river.py`
projects that panel through 64 independently rotated tangent patches,
feathered with radial windows around the sphere. This replaces the earlier
three-axis bake, whose orientation transitions looked like box corners. Panels
are sampled strictly inside their borders; no tile edge reaches the sky.
The panel has no large landmark stars; unique prominent points remain in the
existing batched star layer. This is deterministic offline texture compositing,
not runtime generation or individual star objects. It does not create native
8K imagegen detail: the 8K bake preserves the local panel's angular detail.

```sh
python tools/bake-photo-star-river.py --source assets/backgrounds/star-river-photo-panel-v1.png --output assets/backgrounds/star-river-photo-v3-8k.jpg
python tools/bake-sky-lighting.py --layout assets/backgrounds/hero-layout-v1.json --output assets/backgrounds/sky-lighting-v1.json
```

The procedural generator remains as an archived experiment. J uses the generated
photographic texture and derives its lighting from that same active asset.


## Woven starlight / K

K uses twelve distinct imagegen source regions, each once, with offline radial
feathering into one 8K panorama. It has an independent HDR lighting cache.
See [the experiment log](skybox-experiments.md) for prompts, source hashes, exact
bake commands, failed approaches and the brightness/texture decisions to preserve.

## Skybox factory

Open `experiments/skybox-factory.html` from the lab homepage to browse the sun
sprite library. Four generated variants live in
`assets/backgrounds/skybox-factory/suns/`, with exact prompts in `prompts.json`.
The original warm sun is also linked for comparison. These black-backed PNGs
are source assets for screen blending; their angular widths include the halo.
To use one in an authored sky, add its relative path and aspect ratio to the
layout library with family `sun`, then add a unique placement as described above.
The gallery does not change existing mission layouts or lighting caches.

The factory now includes a Canvas 2D optical-treatment bench in
`experiments/skybox-factory.js`: original baseline, six glare treatments, visible
continuum and a warm instrument study. Disk silhouettes and star positions stay
fixed. Deterministic low-frequency brightness changes affect bloom and fixed
surface patches; this is artistic time compression, not a physical solar model.
Pause, motion amplitude, exposure, disk size and view offset are shared across
previews. Reduced-motion preference starts paused; hidden tabs freeze elapsed
time. Frame downloads render a clean 1024px black-backed sprite without preview stars.
The bench is independent of flight rendering and does not modify skybox shaders.
