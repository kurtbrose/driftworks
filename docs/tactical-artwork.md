# Tactical artwork

[Architecture overview](architecture.md) · [Script loading](script-loading.md) · [Test groups](testing.md)

## Ship and platform painters

`src/ship-art.js` supplies `Driftworks.shipArt`: Pixi craft/platform drawing,
semantic scale, engine plumes, worker presentation and mothership geometry/shaders.
It loads after simulation and shared asteroid geology, before `src/game.js`.
Pixi resources are created only when a scene requests them. The scene owns their
lifetime; painters read world snapshots without changing persistent state.
`Driftworks.game` retains its existing painter and geometry exports as aliases
for viewers and tests. Three asset geometry stays in the existing renderer modules.

`tests/ship-art.cjs` compares drawing commands against a fixture captured before
extraction. It protects craft, zoom, order-line, thruster and platform behavior;
it does not replace browser inspection of the actual render.

## Asteroid artwork

Asteroid artwork in `game.js` uses `asteroidVisualDescription` to derive a stable
four-material bulk composition and a body-local composition field from the
asteroid ID. Every point is a normalized mixture of ice, volatiles, metals and
silicates; there is no generic host rock or deposit overlay. Low- and
medium-frequency fields plus sparse radial blobs bias the local mixture around
the bulk average. High-heterogeneity bodies reach roughly 2.6 log units of broad
variation, enough for regional dominance to differ from the bulk. Heterogeneity
also lowers softmax temperature. Local fractions are clamped away from pure
materials.

The display path is a Pixi fragment shader over a transparent body-sized quad.
It evaluates the continuous composition field per visible screen pixel, so no
mesh or backing-texture resolution appears at inspection zoom. A seeded
pseudo-height field combines the exact `sim.surfaceRadius` silhouette, a rounded
spheroid dome, five broad bulges/basins, low-frequency undulation, crater bowls,
raised rims and fine relief. Finite differences across that field derive the
local normal. The same shader applies diffuse light, limb rolloff and crater
occlusion. Fine texture comes only from the relief response; explicit dot and
line texture marks are not drawn. Relief and material variation use seeded 2D
value noise. Microrelief is a seven-octave asteroid-local fBm hierarchy. Camera
zoom supplies the local-space pixel footprint; each octave fades out before it becomes
subpixel and fades back in as zoom makes it resolvable. Zoom therefore refines
the same seeded surface instead of resampling or replacing it, while unresolved
high-frequency work contributes neither aliasing nor visible crawling.

Crater parameters are packed once into a one-row RGBA8 data texture, using two
16-bit values in raw byte storage uploaded through `Texture.fromBuffer`; canvas
must not intermediate this upload because alpha conversion can corrupt data.
The silhouette fades inward over approximately one screen pixel, using the
camera-derived footprint, so zoom does not enlarge its antialiasing fringe.
The packing uses two
16-bit fixed-point values per texel and four texels per crater. This avoids
fragment-uniform limits while remaining compatible with WebGL implementations
that do not expose floating-point textures. Crater work is a single bounded pass per fragment. A conservative axis-aligned
bound rejects distant craters before ellipse transforms. For contributing
craters, the shader accumulates age-ordered height, analytic height gradients
and occlusion together; finite-difference normal samples evaluate only the cheap
dome, broad relief and microrelief fields. Crater cost is one candidate
test per crater per pixel rather than four relief passes plus an occlusion pass.

Each visual description also derives a `surfaceProfile` by blending the four
material presets according to bulk composition, then applying one independently
seeded history state: fresh, dusty, battered, fractured or rubble-pile. The
profile biases roughness frequency/amplitude, grazing response, pitting,
fractures, crater sharpness, rims and broad lumpiness. Microrelief perturbs the
shared height field and receives an additional restrained grazing-angle contrast
term, keeping frontal faces quiet while revealing texture near the terminator.

Craters are stamped oldest to newest into the same relief field. New bowls erase
older crater relief locally, so surviving rims, concave wall counter-shading and
overlap shadows all follow the combined geometry rather than drawn ellipse
bands. Parabolic bowls and Gaussian raised rims retain their full analytic
slopes, with native surface relief continuing through their floors.
Each body carries a bounded 102–144-impact population: roughly 70% small,
24% medium, 5% large and 1% basin-scale. Older rims soften, basin-scale impacts
are broad and shallow, and independently sampled centers may overlap naturally
or approach the limb so the silhouette clips their geometry. Centers are sampled
uniformly over visible-hemisphere surface area and then projected through the
directional silhouette, rather than sampled uniformly from screen pixels. This
accounts for the larger amount of edge-on terrain compressed near the limb. The
container rotates with the body; `paintAsteroid` inverse-transforms a
fixed world light into a shader uniform every frame without rebuilding geology.
The shader silhouette uses the same directional-radius equation as
`sim.surfaceRadius`, keeping artwork, mining sites and hit testing aligned.
Descriptions contain bounded normalized uniform data and are cached by ID and
radius; no artwork fields are serialized. `tests/asteroid-art.html` displays twenty
fixed seeded examples using the production painter;
`tests/asteroid-playground.html` generates a fresh random panel on every load for
visual exploration without changing the deterministic study or test fixtures.

## Mothership habitat artwork

The optional 3D backend translates the existing 72 x 34 rounded habitat into a
96-segment drum about the ship-local x axis, including rounded shoulders and
closed end caps. The original 38-second spin phase comes from
`game.mothershipHabitatUniforms`. Surface bands, ribs, lamps and the asymmetric
gold-edged service panel use angular coordinates around that actual cylinder;
mesh depth testing hides the far side. The bearing, raised spine, hatches,
antenna, status lamps and side modules are separate fixed meshes preserving
the existing plan-view layout and mechanical palette. They turn with the ship
but do not spin with the habitat. Close inspection derives camera height above
the raised machinery; geometry and presentation height remain outside saves.
The default Pixi implementation below remains unchanged.

The mothership remains a layered schematic. Only its horizontal rotating habitat
uses a fragment shader; the stationary bearing, center spine, antenna, attached
modules, selection brackets and order indicators remain Pixi vector graphics.
The habitat shader evaluates a rounded-box signed-distance silhouette on a small
transparent mesh, with a camera-derived pixel footprint providing a roughly
one-screen-pixel antialiasing transition at every zoom. It also computes the
cylinder normal continuously from the habitat-local vertical coordinate, applies
the same fixed world light used by the asteroid renderer, and generates rotating
bands, lamps, ribs and the service panel procedurally from one spin phase. This
keeps the rounded shoulders and lighting continuous instead of approximating them
with horizontal vector strips. The shader layer sits behind the ordinary bearing
and core layers, and none of its presentation state is serialized.
