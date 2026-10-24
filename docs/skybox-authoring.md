# Hero sky authoring

For deterministic offline velocity distortion of an existing panorama, see
[relativistic skybox baking](relativistic-skybox.md).

The impact watch now defaults to mission-triggered cinematic stages. See
[impact cues](impact-cues.md) for the trigger API, manual cue panel, queue/pause
rules, generated land fire/smoke stages and live atmospheric re-entry layer.

The active animation uses the approved orbital planet and six-camera captures;
see [impact cues](impact-cues.md) and the six-camera export section below.
`planet-orbital-cube`, `planet-impact-watch` and `planet-impact-baked` all select
the new nine-stage sequence. The last retains its dogfight; the others are empty.
The review uses the same fixed 45-degree perspective as flight.

The archived complete-planet experiment uses the opaque two-landmark pass with
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
local overhead impact compositor. The archived equirectangular path samples
adjacent offline-baked 4K spherical maps from `baked-v3/`, with three textures resident and a
flight-time clock that freezes on pause/loading. `sky.bakedImpact` selects this
pass while preserving the same landmark placement and disk star occlusion.
Seven registered image stages span ten minutes, with a separate brief live
radiance pulse replacing the painted flash. Local event patches are aligned
before baking, so the original geography is never translated. `planet-impact-watch` provides an empty
flight world without asteroid, mothership, contacts or collision.
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

## Star glare rendering experiment

`experiments/star-glare.html` is a standalone camera-response study, linked from
the lab and factory. A static directional starfield and bright stellar disk are
behind a simple analytically intersected sphere standing in for the asteroid. The same fixed star direction drives surface
lighting. A 97-sample stellar-disk visibility estimate uses the same asteroid
surface function as the fragment shader to gate glare and exposure response.
Drag or arrow keys orbit; shift-drag changes viewing direction; wheel changes
distance. Eclipse, limb, clear-star and sunlit presets aid comparisons.
Bloom/veiling glare and automatic exposure toggle independently. Radiance is
computed above display white and exponentially tone-mapped; this is an illustrative
shader experiment, not a calibrated HDR camera or a floating-point postprocess
pipeline. The star remains at infinity; exposure adapts quickly to brightness
and recovers more slowly in darkness. No lens ghosts are included. This experiment
does not alter flight rendering or the skybox baker.

### Cached HDR environment test

The optional nova mode uses seven 512x256 linear floating-point radiance maps,
generated once on page load. A synthetic bright cap expands over the transition.
The compact and fully expanded endpoints have equal integrated source energy;
intermediate states include an illustrative brightness peak. There is no invented
ambient fill: empty sky texels are zero. These are test inputs, not HDR recovered
from existing PNG/JPEG assets. OES_texture_float is required for this mode.

The dominant bright cap is excluded from nine-coefficient ambient SH. Representing
it entirely in L2 SH produced a false illuminated lobe on back-facing surfaces
and a dark ring; this is a demonstrated limit of the approximation. Broad ambient
lighting can still use SH. In this single-emitter fixture its coefficients are
zero. A cached 256x7 finite-source cosine-integral lookup supplies the emitter's
irradiance instead, with explicit interpolation between angle and stage samples.
The fully unlit side receives zero direct light. Runtime does not integrate the
sky or regenerate this lookup each frame.

A small sphere casts onto the large sphere. Optional 32-direction finite-source
visibility runs in the fragment shader. This is a separate runtime cost and may
show bands. Shadow directions follow the interpolated source radius rather than
the exact mixture of two source maps, so this remains an approximate reference.
Toggle sampled shadows off to isolate cached lighting. The 18-second timeline is
illustrative and can be paused/scrubbed. The fixture uses only simple spheres.

The automatic exposure control remains the directional-star heuristic. This lab
does not implement screen-luminance metering, reflection-map prefiltering, or a
general mesh-shadow pipeline. Those are separate integration decisions. A fully
occluded source suppresses camera glare; occlusion does not dim unrelated sky
pixels. No changes to flight rendering or the skybox baker are implied.

Nova mode also disables the original point-source camera-glare overlay: applying
a global source-visibility factor to a center glow painted a false bright patch
over the occluder. General HDR bloom would need to spread light from actually
visible bright pixels. The alignment preset cannot fully eclipse an expanded
source larger than the sphere; its visible surrounding sky correctly stays bright.

## Shared HDR skies and camera response

`src/sky-effects.js` now provides camera response to the normal sky renderer;
the star-glare fixture uses its same exposure adaptation function. Normal sky
consumers load it before `experiments/skybox.js`. Broad lighting and reflections
still use the existing precomputed cache; optical sources do not add light a
second time. `assets/backgrounds/sky-camera-sources-v1.json` holds authored
optical-source metadata keyed by sky style (currently Hero Sun / style 9).
Directions are unit sky-space vectors with Z up; radius is angular radians,
strength is an optical tuning value and color is an RGB tint. Star cores include
only their emitting disk, not the source sprite's full glow-card width.

`flightSkybox.create` optionally accepts `sources` and `optics`. The instance
exposes `setCameraSources(array)` (explicit override), `setCameraSources(null)`
(restore authored defaults), `setOccluders([{center,radius}])` and
`setOpticsEnabled(boolean)`. Occluders and the camera eye use the same world
units; the sky direction stays fixed while the eye moves. Flight supplies
conservative asteroid bounding spheres. Hull/cockpit mesh occlusion is not yet
provided. Twenty-five disk samples estimate visibility and the exposed centroid.
No configured source means no overlay allocation and neutral exposure. Disabling
the effect or switching away restores neutral exposure. Sources wider than .12
radians do not get a point-centered bloom approximation.

The `sky-environment` event additionally carries optional camera `exposure`,
which defaults to one for existing callers. Custom geometry shaders apply its
display-space equivalent; native PBR ships apply it before output conversion.
The background uses the same exposure response. This is source-direction-based
camera adaptation plus restrained glare, not screen-space HDR bloom or scene
luminance metering. It runs after foreground rendering as a pointer-transparent
overlay, without a lens-ghost chain. Flight Settings and the sky review expose
an A/B checkbox. `skybox-review.html?sky=9` opens the normal Sun sky with real
ships and has Face the sun / Look away buttons. Model orbit is independent of
the sky framing in this art viewer.

`setEnvironment(cache)` accepts the same immutable precomputed environment used
by scene lighting: nine RGB SH coefficients, a decoded reflection `image`, `map`
identity and 512x256 RGBA `Float32Array` linear `radiance`. The normal background
renderer uploads the floating-point texture once per cache identity and tone-maps
it at display time; values above one survive until then. The scene receives that
same cache for SH and its existing per-renderer PMREM reflections. `null` restores
the authored sky. Validation and float-texture support are checked before changing
the current state. A custom HDR environment must supply its own camera sources;
it does not inherit unrelated optical sources from the previously selected sky.
Treat cache objects/images as immutable: the scene's PMREM cache keys by image
identity. Repeatedly resubmitting the same object does not reupload its texture.

The review's optional cached-HDR preview exercises this shared path using existing
lighting assets; it intentionally displays only their 512x256 resolution. Full
resolution PNG/JPEG sky artwork remains the ordinary default. This is not a new
six-face HDR asset baker, dynamic nova sequencing API, or general mesh-shadow
system. The fixture's finite-source irradiance lookup and sampled sphere shadows
remain experimental; concentrated emitters should not be silently added to low
order ambient SH because of its demonstrated rear-lobe artifact.

Lighting provenance hashes normalize CRLF text to LF for the layout and Python
preprocessors; image bytes remain exact. This keeps Windows bakes verifiable in
Linux CI. The baker writes its JSON with LF line endings.

### Sun effects coverage

Camera effects are now enabled for selectable D / Distant sun and I / Hero sun.
The source catalog also has asset metadata for `features/warm-sun-v1.png`.
Landmark skies derive their optical source direction, radius and gain from the
same authored feature placement, including Ohio, all planet-hero variants and
the inherited baked planet-impact/watch missions. This avoids copying angles
into a separate per-mission table. Invisible source sprites (gain zero) do not
produce glare. Disk diameter is .064 of the card width for this source artwork.

Skies without an authored bright source remain neutral; the older standalone
orbital-impact panorama (style L) has no reliable stellar-source metadata and
does not get an invented light. The effects toggle still provides an A/B control.
HDR overrides continue to require explicit source metadata rather than inheriting
unrelated sources. Local asteroid bounds occlude the glare; detailed hull and
cockpit mesh occlusion and nova area shadows remain separate future integration.

The shared camera bloom uses the star-glare study's tight and broad angular
Gaussian lobes, compressed into a display-space screen overlay. Its footprint
scales with camera focal length, and exposed source fraction controls both
lobes. This is an optical approximation, not general HDR framebuffer bloom.
Camera adaptation uses wall time even when flight supplies frame durations or
pauses simulation. The ship review accepts `?sky=9&mission=ohio`; Face the sun
uses that mission's authored sun bearing for an on/off comparison.
# Six-camera planet export

The `gas-giant` free-flight mission uses the separate jade gas giant cube pair
and shared `gas-giant-weather.js` burst sampler. `sky.gasGiant` selects the jade
shader, drifting light differences, local sun sprite and planet-occluded point
stars. No new textures upload during animation. `emptySpace` removes local
actors; `weaponsDisabled` separately blocks player gun discharge. Both gas and
weapons flags default off for existing missions. See the gas giant asset README
for source coordinates, controls and the distinction between a sky at infinity
and simulated orbital motion.

`tools/bake-sky-cube.py` captures six square 90-degree perspective views from
one origin using the existing card intersection/sampling compositor. This is a
software camera capture, not six independent image generations. Example:

```
python tools/bake-sky-cube.py assets/backgrounds/planet-hero-orbital-v2/cube-recipe.json --size 1024 --output assets/backgrounds/planet-hero-orbital-v2/cube-v1
```

The manifest records camera bases, origin, FOV, row convention, source recipe
hash and all six face hashes. Order is +X,-X,+Y,-Y,+Z,-Z. PNG row zero maps to
texture t=0; upload without flipping Y. Axis diagnostic faces encode world XYZ
as RGB and use the identical cameras. Stars remain a fixed-direction runtime
point pass, with planet occlusion retained. Camera optics remain live.

The `planet-orbital-static` mission loads only those six files through samplerCube;
the original source cards are not loaded at runtime. Its 1024-square faces do
not add detail to the 1254-square master. The review is locked to the 45-degree
flight perspective. Wide lens controls were removed after severe edge stretch
made the planet silhouette misleading during review.

Completion requires six saved faces, a manifest, axis/edge regression checks,
cube-only runtime loading and inspection in flight. A card preview or an
equirectangular export alone does not meet a six-camera skybox request.
`tests/sky-cube.cjs` checks these artifacts, all twelve shared camera edge ray
sequences, and distinct HDR/cube sampler slots.

The animated `planet-orbital-cube` variant uses `sky.cubeStages` plus
`sky.bakedImpact`: two cube samplers blend one pair of six-face captures from
`animation-cube-v1/`. `tools/bake-orbital-impact.py` registers and bakes the nine
stages using this exact camera convention. Each target waits for all six faces.

### Jade moon observation scenes

The jade missions carry `sky.jadeSystem` (see `experiments/types.d.ts`):
planet radius/mass, common plane normal, physical observer position, a proper
rotation frame, and four moon orbital radii/phases/positions in kilometers.
`flight-missions.js` resolves this JSON-safe recipe for `gas-giant` and
`jade-rime`. The sky renderer derives observer ranges, exact sphere angular
radii, normals, depth occlusion and the scaled cube projection from those
values. Do not independently hand-place moon bearings or resize the near
scene's planet. The asset README documents the physical recipe and the limit
of reusing the original painted planet lighting. Both are frozen observation
points, independent of the ship's local flight translation.
