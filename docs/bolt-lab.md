# 3D bolt range

## Experimental projectile visuals in gameplay

In the actual flight game, open **F3 / Flight lab & diagnostics / Experimental
projectile visuals**. Choose current flight bolts, plasma with sharp multiples,
plasma with overlapping exposures, or a bare plasma ball. Radius is in metres;
exposure covers 50%, 80% or 100% of the last rendered simulation interval.
Additional modes put the bright exposure at the real bolt position with faded
samples fore and aft, either discrete or overlapping. Forward samples are a
visual prediction capped at the weapon lifetime; rear samples are clipped at
launch. Leading-edge-only draws a narrow glowing forward hemisphere without a
filled center, oriented by projected travel. Viewed straight along the axis,
it becomes a hollow ring. These can be switched live like the earlier modes.

Changes apply immediately to player, fighter and capital guns. Preferences are
session-only and default to the current production bolts. The former
`studies/plasma-motion.html` comparison now links to the actual battle.

Capital muzzle illumination and heavy impact hull illumination are standard in
all modes, including Current. Barrel heat glow has been removed from the
experimental controls.

Only gun artwork changes. The production scene, HUD, skybox, input, AI, shot
positions, collision, damage and weapon timing retain their existing ownership.
The current mode uses the original tracer geometry. Experimental modes place
round camera-facing quads along the real shot path, clipped at launch. Sharp
multiples cap at five samples; overlapping exposures cap at 24. Tail brightness
stays fixed as sample count changes. Perspective and the scene depth test apply
to every sample. Optical and curved-space shots sample the corresponding reverse
ray/geodesic for their exposure positions. Pausing retains the last exposure
interval; resetting the simulation clock resets it to the default interval.

`node tests/projectile-visuals.cjs` checks production gun geometry, sample caps,
trajectory adherence, launch clipping, energy budgets and unchanged gun state.
Use gameplay to judge motion and visual readability; these experiments are not
visual acceptance for the production weapon set.

## Atlas bolt range

Serve the repository and open `experiments/bolt-lab.html`. This standalone
Three.js study uses the vendored runtime, relative assets and no build step.
It does not replace production flight weapons.

The default dogfight mixes twin outbound guns, incoming near misses and crossing
fire. Separate patterns isolate each direction. Crossfire emits at 0.4, 1 and
1.8 times the selected engagement distance. Bolts have metre-space positions and
constant world-space velocities; a 70-degree perspective camera handles size,
parallax, near-plane clipping and depth testing against opaque fighter silhouettes.
Sprites face the camera because the depicted plasma is spherical. Turning the
camera never redirects an existing shot. The camera can bank and translate, and
pointer movement changes viewing direction. Fighter silhouettes are 12 m wide.
This is a scripted visual rehearsal, not production AI or a damage simulation.

Select one plasma style or all four within the same 3D scene. Engagement range,
world size (6 m full sprite quad at 1x), velocity (650/1100/1800 m/s), playback,
static variant and alpha/additive compositing are adjustable. Hold click or
Space to fire; P pauses, Fire burst queues six volleys, Clear removes live bolts.
Switching patterns clears old shots. Hidden tabs pause the rig.

Flight-aligned length replaces the earlier shutter-blur experiment. The default
body length is `max(sprite diameter, speed * simulation frame interval * 4)`.
Six-, eight-, ten- and twelve-frame lengths allow stronger elongation; one-frame, two-frame
and compact modes provide comparisons. The interval uses actual render timing
(up to the same 50 ms simulation cap), scales with playback and freezes on pause.
The body lies along the shot's fixed world velocity. Its camera-facing artwork
foreshortens with that direction, becoming round head-on and elongated side-on.
Camera rotation does not contribute to length. A center shift along the 3D flight
axis keeps the extension behind the projectile. Both axial endpoints are projected
with perspective before computing the billboard orientation: using only the view
velocity's X/Y components incorrectly made off-axis, depth-changing shots slide
diagonally across their own stretch. Axial segments are clipped against the near
plane before perspective division. Regression tests compare the displayed axis
with independently projected successive flight positions, including a rotated
camera. This is a flight-aligned billboard
approximation, rather than a volumetric mesh or full-scene motion blur.

Each shot picks one of four atlas variants at birth and retains it. There is no
internal flipbook animation. Camera banking defaults off. The footer reports
measured render fps, milliseconds per frame and travel distance per frame.
The isolated-pulse cadence separates volleys by 1.6 seconds to distinguish an
individual projectile from a stream of separate shots.

`assets/bolts/plasma-balls-v2.png` was generated with the built-in ImageGen tool
using actual transparency. Four rows hold cyan confinement, green pulse, red
laser pulse and amber plasma; each has four alternative static appearances.
The generated alpha is preserved. The shader feathers the outer cell boundary
to avoid cross-cell halo seams. The exact generation prompt is saved in
`assets/bolts/plasma-balls-v2-prompt.txt`: compact symmetric magnetically confined
plasma balls, dense cores, subtle internal changes, no flame tails or lightning.
The earlier directional atlas is retained as a discarded experiment and is not
loaded by the 3D rig.

Validation: `node tests/bolt-lab.cjs` covers the camera basis, fixed ballistic
velocity under camera turns, zero-delta pause and crossing depth at three ranges.
Browser checks separately inspect the actual 3D composition. This is an art
experiment, not production performance or full gameplay acceptance.

Visual review for v2: cyan in the mixed dogfight, green outbound twin-gun fire,
red incoming near misses, and all four rows in three-depth crossfire at quarter
speed. The browser reported no renderer errors. This checks composition and
direction-independent silhouettes; detailed acceptance of every generated
animation frame and final production weapon sizing remains open.

Flight-aligned revision: browser-inspected four-color crossing fire at all three
depths with a measured 75 fps, and checked the axial head-on view separately.
Headless tests cover travel-based length at 30/60/75/144 fps, compact/two-frame
modes and head-on/side-on foreshortening. The browser reported no renderer errors.
