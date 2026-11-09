# Shared wormhole contracts

`src/wormholes.js` owns the shared link and render-placement boundary. Missions
declare endpoints and bind render owners; they do not assign shader masks to
individual hull materials or separately generated plumes.

## Space links and transitions

A `WormholeLink` has an ID and two mouths, each with a numeric space ID,
position, radius and destination sky preset. The current geometry is a pair of
equal-radius spherical mouths with antipodal gluing in aligned chart frames.
`define` rejects invalid endpoints, self-links and unequal radii. Positions and
radii passed to `cross` must use the same units; mission declarations use metres.

`cross(link, before, after, space)` performs swept entry and preserves overshoot.
It returns the destination space, eye, crossing normal and sky key. `transport`
applies the shared antipodal rotation to velocity and the entire camera frame.
It never infers a destination from the mission name or the sign of a coordinate.
These operations do not mutate persistent state or keep entity pointers.

The Ellis/thin-shell mission family declares `sky.connection`. Flight sessions
use that declaration for ship crossings. Their sky renderer reads both endpoint
sky keys from the same declaration. Its currently loaded sky presets are
`asteroid` and `rime`; unsupported presets fail explicitly. Existing finite-source
optics, collision, weapons and the two-chart renderer retain their calibrated
metric and chart-layout assumptions. This is not yet an arbitrary multi-link
optical compositor or a rotated-chart implementation.

## One render owner

`RenderPlacement` is transient presentation data, shared by reference. It owns
visibility, chart/transit metadata and aperture/plane masking. `bindRig(rig,
placement)` wraps both `geometry` and `effects`; all returned batches inherit
that same owner, including newly generated effects on later frames. Camera
arguments and the rig's other API remain intact. `own` supports grouped or
instanced geometry and its independently generated effect batches.

The fleet capitals use bound rigs. Freighter meshes and engine effects share a
cached convoy placement. `scene3d` resolves placement through the same `place`
function for actors and additive effects, including uniform reset. Unrelated
explosions reset portal masks after the owned-effect pass. Source vertices,
metre scale, materials, collision and simulation ownership remain unchanged.

`mouth` constructs masks centrally; `clear` removes an owner's mask. Direct
mission assignments to `portalClip` or `clipPlane` are prohibited by the
boundary regression. Legacy batch fields remain readable for compatibility.

Fleet mouths register actual connections in the JSON-safe combat `wormholes`
registry through `linkPortal`. The hostile and rescue mouths connect source
space 0 to independent spaces 1 and 2. `flightSim.stepControlled` applies shared
swept traversal after movement and before controlled gunfire; full camera frames
and velocities transfer, and targeting/collision caches invalidate. Formation
gates use the same lifecycle as the visible mouth. Reset creates a fresh registry.

`skyView` derives local sky identity and return apertures from the same endpoints.
Reception uses the existing hero panorama; hostile space uses its rotated warm
variant. A single lazy-loaded local texture is shared by these two presets. Source
hulls/effects are isolated by the renderer's opt-in space filter, and cargo contact
ignores craft in other spaces. The hostile capital is visible directly in its
space. Both mouths have return crossings; the convoy continues in the source
space while the player is away.

Capital emergence and freighter evacuation still use the staged mask adapter.
This change does not provide general recursive geometry views through arbitrary
links, transfer cargo lifecycle into a destination simulation, or trace projectiles
through the new fleet links. The dedicated Ellis/thin-shell optical compositor
retains its existing projectile and finite-hull crossing implementation.

## Automated verification

- `node tests/wormholes.cjs`: 1,000 generated translated/scaled crossings,
  destination identity, overshoot, vector reciprocity, immutable geometry,
  owner inheritance and the source boundary against per-mission mask code.
- `node tests/wormhole-traversal.cjs`: real session crossings into both fleet
  spaces and back, forming-mouth gate, sky identity, frame/speed and reset.
- `node tests/evacuation-capitals.cjs`: actual capital hull/effect ownership,
  staged visibility, firing, stable buffers and replacement-state reset.
- `node tests/flight-skybox.cjs`: endpoint sky presets follow link data.
- `node tools/check-wormhole-placement-browser.cjs`: real production WebGL2
  rendering; 27 oblique/plane/aperture pixel-mask comparisons, hidden owners,
  and a negative control that deliberately detaches an effect. It requires a
  development-only Playwright installation and the local HTTP server. Set
  `DRIFTWORKS_BROWSER_MODULES` if Playwright is outside the repository.

The `wormhole-gpu` CI job runs the GPU check with software Chromium. The static
deployment gains no package-manager requirement or runtime network dependency.
Local screenshots and JSON live under `output/wormhole-placement/`; CI does not
upload those artifacts. A local pass does not establish a remote CI result.

The actual staged fleet was also inspected near 114 seconds, with 266 hull
batches and five effect batches sharing capital owners. A frozen 1600x900,
DPR-1 OFF/ON/ON/OFF sample retained 90 frames after 300 ms warmup per block.
Capital-on scene submission was 185 draws / 1,784,705 triangles with median
presentation CPU 4.0–4.1 ms; capital-off was 50 draws / 1,744,123 triangles and
1.8–2.0 ms. These are final-scene CPU/counter measurements, not a before/after
speedup or GPU budget. Source buffers remain shared and unchanged. Raw samples
and captures are in `output/shared-wormholes/`.

## Formation and closure

`phase(time, lifecycle)` returns a deterministic smooth aperture amount, visibility
and an open-state traversal flag. Schedules use `opensAt` and `closesAt` (the
fully closed deadline), with default three-second opening and two-second closure.
`request(lifecycle, open, time)` reverses from the current amount without a value
jump. With no lifecycle the amount stays one for compatibility.

The staged fleet uses this same amount for its sky aperture, rim, remote capital
visibility and hull/effect masks. A zero-radius remote aperture hides its owner;
clearing a closed aperture must never expose the whole remote ship. Source-side
plane cuts are bounded by the mouth silhouette, so an offscreen mouth cannot
cut unrelated geometry. Effect batching must preserve owner-bearing batches.

The GPU regression also checks closed/opening/closed pixel counts and an offscreen
source mouth. These checks do not prove destination-space continuation for the
staged fleet adapter. The main traversable Ellis compositor retains its existing
steady-open behavior; this formation envelope is currently wired to staged mouths.

## Several mouths in one space

`separate(position, axis, radius, others, clearance)` finds the first clear
position along an approach axis. It unions the forbidden intervals from all
existing same-space mouths; input geometry is unchanged. The staged rescue mouth
uses this constraint with 250 metres of surface clearance from the hostile mouth.

Separated spheres can still overlap in screen projection. The staged sky chooses
the nearest positive sphere entry for each pixel, independently of array order.
`occluded(eye, point, mouths)` performs the corresponding finite sightline check
for rim segments, so the farther rim stops behind the nearer aperture. This
does not add recursive views through multiple wormholes. Local checks include
1,000 generated placements, production rim construction, the fleet mission replay
and a GPU pixel comparison after swapping the near/far sky input order.
