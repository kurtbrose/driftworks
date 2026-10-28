# Flight presentation

[Architecture overview](architecture.md) · [Script loading](script-loading.md) · [Test groups](testing.md)

### Shared model viewer navigation

Load `src/model-viewer.js` before `src/scene3d.js` on inspection pages.
`scene3d.create(..., {study:true, viewer:true})` opts into the shared toolbar;
ordinary gameplay retains its tactical controls. Embedded combat views pass
`{study:true, viewer:false}` so target cameras and flight presentation never mount
inspection UI or collect picking geometry. `Driftworks.modelViewer.create(host, adapter)`
returns `gesture(event, space)`, `isFlying()`, `isPicking()`, `reset()` and `dispose()`.
The optional adapter supplies `pose()`, `fly(pose)`, `orbit(pose, target)`,
`pick(eye, direction)` and `worldUp`. Camera poses contain eye, right/up/back
basis vectors, focus distance and perspective focal length, in scene units.
This also supports Three.js character inspection without a renderer dependency.

Each viewport owns its drag mode and flight state; only the last interacted
viewport receives flight keys. Click to switch Slide/Orbit; right/middle drag or
Space slides, both left and right buttons or Alt orbits. Free flight uses WASD,
Q/E vertical movement, Shift for speed, wheel forward/back, and Escape to return
to orbit with the same eye position. Flight speed defaults from the current
framing distance and is editable in scene units per second. Blur, pointer loss
and hidden tabs clear held inputs. `reset()` releases flight before a model or
preset change; `dispose()` also removes listeners and cancels its animation frame.

Pick focus followed by a surface click, or a double-click, moves the orbit target
to the nearest visible mesh hit while preserving the eye. A miss leaves the
camera unchanged. Scene3d captures lightweight references to the last rendered
triangle batches (excluding lines and effects); picking applies texture strides,
scale, basis, axial spin, rotation and translation from the actual draw calls.
These references are replaced each frame, and triangle conversion happens only
on an explicit pick. Three.js uses its mesh raycaster, including skinned geometry.

`viewer-interaction` lets pages pause automatic orbit without pausing model
animation. `viewer-navigation-start` lets optional page cameras (such as surface
walk) relinquish ownership before focus picking or flight. Pages retain models,
lighting, animation and presets; shared navigation owns focus/flight controls.
The archived surface experiment keeps its frozen renderer fixture.

Flight engine sound uses `audio.setFlightEngine(dt, throttle, boost, active, detail)`
once per rendered manual-flight frame. Optional detail supplies normalized damage,
maneuver and thrust. The reusable `audio.engine.create(context, destination, tuning)`
owns oscillators, turbulence, filters, a compressor and modulation; it exposes
update/tune/stop/dispose. The caller owns the context. No graph enters world state.
The independent tactical `setEngineThrust` noise bed remains available.

`audio.engine.step` applies nonlinear power response and frame-independent spool
inertia; boost has a separate fast envelope and an edge-triggered ignition.
Sine bass, structural harmonics, an air-led turbine with quiet detuned partials
and noise-driven pitch drift, colored exhaust, modulation and
a 32 Hz afterburner layer share one synth in both flight and
`experiments/engine-lab.html`. Cockpit filters the exhaust; exterior opens it up.
Damage increases irregular modulation; maneuvering raises turbine/exhaust load.
Impact sounds also include a 36 Hz thump.

The lab offers eight presets, layer mutes, tuning, A/B capture, a scripted
audition and JSON recipes. Only the explicit Use this mix in flight action saves
`driftworks-engine-tuning-v1`; the flight voice loads it on first activation.
Reload flight to apply later changes. Normalize tuning on import/load; storage
failures fall back to defaults. Lab mutes are audition-only. Stop/blur/visibility
loss silence the lab; pagehide disposes the graph and closes its context.
Pause/reset/focus loss clear flight sound. Contact/death disable it.
Audio does not add controller vibration; existing haptics stay independent.

Flight sound balance is stored separately as `driftworks-flight-mix-v1`.
The engine, weapons, impacts and comms have separate buses under the SFX master.
Flight radio uses `audio.commsChannel()` and shares the game AudioContext;
radio pause/mute/end clear `setCommsActive` without closing that context.
Audible radio ducks engine to 84% and guns to 60% of their selected levels.
Hits duck engine to 30% for 220 ms with a smooth release; impacts/comms retain
priority. Muted radio does not duck. The mix preference can disable ducking.
Gunshot starts are bounded to one per 45 ms to contain stacked volleys.
A final compressor provides shared headroom. Settings / Sound balance provides
persistent per-channel sliders plus an overall SFX control and reset.
The isolated engine lab bypasses flight channel balance for sound design;
its listening level describes the raw synth, before the flight engine trim.

The exhaust roar emphasizes low turbulence: a moving 110-800 Hz band, a
low-pass capped at 1600 Hz, and a broad 9 dB cut centered at 1700 Hz leave room
for speech. Slow filtered-noise modulation adds irregular amplitude and filter
motion independently of the mechanical texture layer; the roar control silences
its modulation too. Radio lowers engine level only 16% to preserve continuity.

Cruise exhaust is led by a filtered, rhythmically modulated low growl. Broadband
roar and turbine air swell with a smoothed acceleration envelope and afterburner,
then settle at steady throttle. Flight supplies normalized positive speed change
per frame as `detail.acceleration`; the isolated lab infers acceleration from
throttle/spool difference. Deceleration does not trigger the surge. This is
audio telemetry only, with no new persistent world fields.

Low engine weight now favors 24-180 Hz colored noise over quiet pitched
remnants. The growl uses a filtered sawtooth for harmonic grit, with slow
noise-driven pitch and amplitude variation on both low layers. Regular flutter
is restrained; the low noise loop spans 7.3 seconds to reduce obvious repetition.
Bass and roar controls also silence their associated roughness and modulation.

Audio modules remain ordinary scripts loaded in this order:
`src/engine-audio.js`, `src/audio-mixer.js`, then `src/audio.js`.
The synth publishes `Driftworks.engineAudio` (presets, tuning persistence,
spool math, graph factory). The mixer publishes `Driftworks.audioMixer.create`
(channel graph, balance persistence, ducking, limiter and settings UI).
`src/audio.js` owns the shared AudioContext, SFX/music, tactical engine bed
and compatibility facade. `audio.engine` is the exact shared synth object;
other public audio methods delegate to the mixer instance as appropriate.
The mixer receives master-volume callbacks and attaches to the context/buses
owned by the facade; it does not create or close a context.
The engine lab loads only the synth and owns its audition context. No game
mixer or SFX module is required there. Both Node and browser test harnesses
load helper modules before the facade. Tuning keys and acoustic parameters
are unchanged by this extraction. Definitions live in `engine-types.d.ts`
and `audio-types.d.ts`.

### Shared study panels

`src/study-viewer.js` provides `Driftworks.studyViewer.createView` for independent study panels: each owns its replacement-world closure, scene, interaction flag and resize fitting. Callers supply the host, world, axis/orbit preset and framing callback, and retain content and render scheduling. Manual interaction suspends automatic fitting until reset. The mining rig and fighter studies share this setup. `referenceFighter(lengthMeters, metersPerRendererUnit, origin, yaw)` reuses the local Spitfire geometry with an explicit physical length; origin is in renderer units. The mining study keeps its existing placement and scale conversion.

The fighter's four panels share immutable static vertex batches; a revision/camera/viewport key redraws only changed panels. Shape edits update all four; crew close-up changes the orbit panel alone. The reference toggle changes geometry and fits untouched views without resetting manually positioned cameras.

Study panel configuration accepts `zoomToTerrain` (default true). The fighter study disables it so wheel zoom preserves the current subject plane instead of refocusing on its background asteroid. Explicit surface focus remains available through the viewer controls; the mining study retains terrain zoom.

### Radio portraits and shared channel noise

Portrait mouth and blink patches use opaque rectangular cores with feathered
edges; emotional face layers retain radial masks. The inner-face guard still
limits both. See [portrait authoring](portrait-authoring.md) for per-frame
registration and the frozen expression/feature review matrix.
Both source packers apply the seven explicit integer offsets per character in
`assets/portraits/registration.json` after neutral calibration. Source hashes
invalidate stale registration; output manifests bind the offsets and shared
helper. Ohio inherits the corrected facial pixels. Stable-feature residuals
are mechanical diagnostics; visual acceptance requires labeled runtime stills.

Civilian passenger crews are catalogued in `assets/portraits/civilian-shuttle/roster.json`
under `civilian-shuttle-pilot`, with stable character IDs, ages, ranks, suggested
voice slots and six `civilianPortraitIndex` values. A radio `Line` may set that
index (integer 0–5) to use the corresponding civilian atlas regardless of the
mission wardrobe or combat `portraitIndex`. Invalid values retain normal cast
selection. Civilian atlases share the seven calibrated 256px poses, speech clock,
face masks, cancellation rules and bounded bitmap cache. The roster does not
change persistent world state or automatically recast existing missions.
`experiments/civilian-cast.html` previews all six with Mumble audio and moods.

Spaceport ground crew use `assets/portraits/runway-workers/roster.json`, category
`runway-worker`, and `Line.runwayPortraitIndex` (integer 0–5). This selects the
worker atlas before a civilian pilot or ordinary mission portrait. Set one NPC
pool index per line; invalid values fall back to the next normal selection.
The six industrial pressure-suit portraits use the same masks, seven poses,
speech clock and bounded cache. The shared cast preview switches to this pool
with `?category=runway-workers`; existing civilian pilot URLs retain their cast.

Both flight simulators and the comms lab load `mumble.js`, `comms-display.js`, and `face-blend.js` before their portrait/radio controllers. `mumble.radioNoise` creates a channel-noise plan independently of either output; audio transmission and display sampling receive the same object and the same playback clock. Local audio bypasses radio processing. Flight uses effects 0.45 and edgeScale 2.5 (0.4 s opening / 0.6 s closing); original radio timing remains available in the lab. Pilot identity, mood and speech cues remain in their existing owners.

Flight radio prepares a persistent classic Web Worker on audio unlock.
`mumble-worker.js` imports the versioned local `mumble.js`; it renders the existing
22,050 Hz speech and radio filtering, then transfers the PCM buffer and returns
the shared noise plan. Only text analysis, Web Audio playback and portrait
scheduling stay on the main thread. The worker and synthesizer are explicit
dynamic-code entries in the asset version catalog, so changes invalidate both
requests on static hosts, including deployment beneath a path prefix.

Pending preparation occupies the radio channel without consuming the estimated
playback hold or starting portrait speech/ducking. Delivery starts audio and
portrait cues from the current audio clock, including the unchanged radio
lead-in. Pause, reset and mute invalidate the job and terminate a busy worker;
page exit also terminates an idle worker. Late replies and old source completions
cannot take ownership of a newer transmission. Unsupported/failed workers retain
subtitle-only radio for that mount, with no blocking synthesis fallback. A job
that remains pending for ten simulated seconds releases the worker and falls back
to the normal subtitle hold. Other Mumble labs keep their existing direct API.

`commsDisplay.create(canvas)` owns one 256 px treatment buffer. Its `draw` accepts the animated source canvas, shared noise plan, elapsed playback seconds, speech duration and optional palette/scanline/reduced-motion settings. It preserves the lab treatment: green phosphor by default, scanlines, fresh random strip/snow geometry and a visual peak hold of 250 ms at channel edges or 40 ms during speech. It never generates independent noise-event timings. Callers own scheduling and channel cutoff.

`flightPortraits` retains its fixed seventeen-atlas cache and uses one reusable animated source canvas plus the display buffer. `play` receives the noise plan alongside the audio context, start time and speech offset. Pause, mute and cancellation hide the portrait immediately and invalidate pending portrait loads; the playback clock also detects completion before a delayed `onended` callback. Natural playback completion closes the mouth and begins a 0.5 s visual sign-off: the portrait's static increases monotonically along a newly randomized progression for each sign-off, using coarse grain to obscure the face. Positive random timing and severity increments define the progression, sampled by sign-off progress even when the speech clock has stopped; horizontal displacement gets only a modest boost, then the panel hides. Subtitles, speaker labels and controls are player-facing UI and stay clean and readable throughout; no radio effects are applied to the panel. Cancellation hides it immediately. The audio clock drives the sign-off, with a simulation-clock fallback when no audio clock is available. Subtitle-only fallback uses the estimated transmission duration. The bounded comms history remains available independently. No audio context is created or closed by the portrait renderer.


### Static study actor visibility and projectile damage reporting

`scene3d.studyBatchVisible` conservatively tests an immutable batch's cached
source box against study-camera clip planes, using the same model basis, scale
and rotation as the vertex shader. The study actor pass skips invisible static
batches before upload/draw; retained batch ownership still controls buffer
lifetime. It does not cull simulation, shadows, dynamic effects or model-viewer
picking. Bounds depend on immutable vertex data, matching `staticGeometry`'s
existing upload-once contract. `setStudyEffects` retains the complete submitted
batch-list snapshot; it must not truncate to the original five fighter/engine
batches, because capital-ship projectiles and impacts follow those batches.

`training.trace` retains its impact-point return value. Its optional final
`onDamage` callback runs once when the chosen victim actually loses shield or
hull health; it reports neither terrain contact nor zero damage. Aegis confirmed
hit accounting uses this callback, avoiding whole-fleet health totals per trace.
Projectile queries use padded ship proxies in an incrementally maintained 128 m
3D grid. Each proxy encloses the source-mesh sphere plus a 32 m movement cushion;
rotation cannot escape this sphere. A ship only changes spatial buckets when its
actual bound leaves the proxy. Proxies covering more than 512 cells have a global
fallback list; long queries scan occupied buckets instead of enumerating empty
space. Candidates retain participant order for equal-distance hits. Source meshes
are immutable; `shipPackModels.hullRadius(model)` returns their cached metre-space
sphere radius.

The three shipped `assets/ships/*/meshes.js` packs append generated `hullIndex`
metadata: version, vertex count, vertex SHA-256, radius and the complete median-split
triangle tree. `node tools/bake-hull-indices.cjs` rebuilds it after an authoring
export; `--check` is included in `npm run check:assets`. Original mesh/script
content precedes the generated suffix. Bounds preserve signed zero and original
double precision. The runtime adopts the tree on first query rather than sorting
triangles during combat. Models without compatible baked metadata retain the
runtime builder (including tiny procedural/test hulls). Vertex content is
immutable; build-time fingerprints detect stale same-size edits without hashing
the full mesh in the flight loop. This adds no runtime fetch or deployment build.

Impact scorches retain the original five-layer, fourteen-plane clipping result.
Plane directions and limits are computed once per impact; clipping alternates
between two reusable Float64 polygon buffers. Only finished numeric layers escape
to craft state. The convex input and fourteen planes bound output to seventeen
vertices (scratch capacity is sixty-four). Synchronous projection does not nest.
Output triangle order and all existing hit, damage, mark-retention and draw rules
are unchanged. See [hull preparation measurements](benchmarks/hull-preparation-2026-10-23.md).

The default `grid-events` mode caches candidates for a projectile corridor up to
250 ms ahead, bounded by remaining bolt lifetime. Corridors include the current
segment and future straight-line travel, expanded by the larger of the 30 m
near-miss radius and bolt radius. A second spatial index holds these corridors.
When a ship leaves its padded proxy, its new envelope queries this reverse index
and wakes overlapping corridors; motion inside the proxy needs no invalidation.
A min-heap expires corridors at their refresh deadlines. Superseded events are
marked inactive and discarded lazily; periodic compaction bounds stale entries.
A state epoch invalidates candidate caches on roster, order, shape, team or
alive-state changes. Changed paths must remain inside their certified corridor
or query again. This schedules conservative refreshes, not exact impact times.

`training.collisionBatch(combat, work)` runs a synchronous callback, observing poses once at the boundary,
then reuses proxies across traces. The fighter update notifies each moved craft
before its guns run; controlled guns and Aegis mount loops also use batches.
Custom batched callers must call `collisionChanged(combat, craft)` after moving a
craft, or `collisionChanged(combat)` after arbitrary roster/state edits. Nested
batches share the outer observation and always release management in `finally`.
Public unbatched `trace` calls still observe every pose, preserving compatibility
with direct mutation, including same-time teleports. Terrain queries and precise
nearby hull sweeps retain per-segment timing, including the final lifetime segment.
Damage-only legacy bolts without ballistic metadata use immediate queries.
There is no delayed damage or unchecked path interval.

Development APIs `setCollisionMode(combat, mode)` and `collisionStats(combat)`
allow matched comparisons of `legacy`, `grid`, `tree`, `grid-events`, and
`tree-events`. The tree variants use incrementally refitted balanced binary AABB
trees. The legacy mode retains the prior center-cell hash and global movement
clearance certificate. All index, corridor and queue state lives in WeakMaps,
outside serialized combat data. Hull sweeps retain near-first traversal with
scratch storage, without sorting candidate leaves or allocating padded triangle
vertices per query. See [scheduling measurements](benchmarks/collision-scheduling-2026-10-23.md).
The fixed-scene browser and scripted CPU benchmarks are described in
[dreadnaught kit](dreadnaught-kit.md#repeatable-performance-comparison).

### Static asset versions

`tools/refresh-site-assets.cjs` versions local HTML resources and generates the
checked-in `src/asset-versions.js` URL map. It loads before application scripts;
`window.Driftworks.assetUrl(value, base?)` resolves document-relative or manifest-relative
resources within the deployment root and appends a content hash, preserving other
query parameters and fragments. External URLs pass through. Skybox JSON and its
images are versioned independently; changing an image invalidates the map and all
HTML references to it. Text hashes normalize CRLF to LF; binary hashes do not.
Refresh and commit versions after edits; `npm run check` validates without writing.
HTML still needs host revalidation to discover a new deployment.


### GPU flight HUD

`experiments/gpu-ui.js` provides a small immediate-mode UI renderer over the
vendored Three.js WebGL2 renderer. Load it before `flight-hud.js`. Its typed
painter subset is in `gpu-ui-types.d.ts`; Canvas 2D implementations can still
exercise shared radar/target paint helpers in tests. This is a UI painter, not
an implementation of the full Canvas API: current paths are convex, transforms
are translation/rotation, and dashed rings support the lead indicator.

The reusable components are analytic rounded panels, rectangles/meters,
capsule lines, rings, convex markers, distance-field glyphs and image tiles.
One interleaved vertex batch preserves painter order, with depth writes disabled
and straight-alpha blending. GLSL3 fragment derivatives control edge coverage at
native device pixel ratio. A one-time local monospace glyph raster is converted
to a signed-distance atlas; visible text is composed and shaded by the GPU,
without per-frame text canvases or DOM screenshots. Geometry storage and the
font atlas are reused; image sources are cached and GPU resources are disposed
on non-BFCache page exit. There are no runtime network dependencies.

`flight-hud.js` owns responsive instrument layout and projects session contacts;
`radar.js` retains the shared contact projection and painter. The virtual joystick
outer ring must use the input adapter's full `stickRange`; its inner ring is 8%
of that range and its cursor uses the same displacement scale. The central
reticle retains its original 42 CSS-pixel diameter, independent of device pixel
ratio. Renderer changes must preserve these dimensions. The target camera
returns whether it rendered a new frame so its GPU texture is uploaded only at
its 15 FPS cadence, preserving the previous image between frames. Existing
portrait canvases supply animated image tiles; the HUD does not change portrait
or radio timing. Offscreen DOM text/meters retain accessible semantics and the
existing presentation producers, while configuration controls live in the pause
menu. F3/P pause before opening diagnostics. No persistent simulation state or
flight targeting rules move into the renderer.

### Shared touch controls and asset versions

`flightControls.mount` owns the touch input option and creates the joystick/action
component once. Flight pages supply the standard input selector and load the shared
`flight-controls.js` and `flight-hud.css`; they must not duplicate touch markup or
phone detection. The existing shared HUD chooses its simplified layout from the
`touch-flight` body class. Input behavior stays in controls, appearance in shared CSS.

`tools/refresh-site-assets.cjs` versions static script/style/import references in
their HTML callers. The runtime `asset-versions.js` catalog covers dynamic resources
(images, data, audio and scripts under `assets/`), excluding ordinary application
JS/CSS. Thus an input-code edit updates only pages that load that code, rather than
invalidating the catalog on every page. Dynamic application-code loading must add
an explicit versioning strategy; asset scripts remain supported through `assetUrl`.

The radar draw helper accepts an optional `compact` flag for a 44px-radius mobile
instrument. Mobile comms use the existing animated portrait texture at 52px.
Touch Start/Resume requests document fullscreen from its user gesture; the shared
Full screen control provides a retry/exit action without coupling HUD scale to hit targets.

The experimental `ellis` sortie connects the asteroid and Rime skies with a
a shared normalized Ellis-integral lookup. `ellis-optics.js` supplies the sky
and finite-distance ray mapping; `ellis-renderer.js` owns color/depth atlas and
primary render targets, plus a separate full-resolution color/depth layer for
local additive gun/engine effects. That layer is opaque-depth tested and clipped
before the throat; distant transparent transport remains approximate.
`scene3d.setStudyBridge` is an opt-in presentation pass:
it reuses submitted buffers, restores raw view uniforms and native matrices after
capture, and counts capture submissions in render statistics. Other sorties keep
the original one-pass renderer. Antipodal traversal transports position residuals,
ship bases, velocities and projectile directions through the same proper chart
rotation; outward optical rays remain curved after emergence. No additional state
is persisted. Chart, depth-shell
and combat limitations are documented in [Ellis bridge playtest](ellis-bridge.md).


Ellis presentation experiments are opt-in: `bridgeGeometry=adaptive` adds a
half-resolution hit-coordinate pass, full-resolution reconstruction, and a
separate masked refinement pass; the default remains the full geometry tracer.
`bridgeAngle` limits only the searched geometry path prefix, using angular travel
returned by the shared GLSL `ellisPointPhase`. It does not limit the sky or alter
simulation/collision. Neither experiment is visually accepted yet; see the
validation status in [Ellis bridge playtest](ellis-bridge.md).

Ellis flight uses explicit pose/projectile/effect/batch `region` ownership (missing
means 0). The 12 km chart translation is storage only. Each capture and the direct
pass filter by region; radar/targeting, AI and damage never compare contacts across
regions as ordinary Euclidean neighbors. Traversal transfers ownership with the
pose. See [region ownership](ellis-bridge.md#region-ownership) for limits.

The opt-in `bridgeTemporal=1` Ellis experiment uses two packed hit maps and
rotation-only history reprojection. Flight presentation supplies an explicit
geometry revision via `setStudyBridgeRevision`; absent/changing revisions forbid
reuse. History age is bounded to one frame. Translation, region/projection/size
changes and GPU context loss/restoration invalidate history. Restoring the GPU
also forces all radial capture faces to refill. See the
[temporal experiment report](benchmarks/ellis-temporal-2026-10-24.md).

### Predicted trajectory guide

The default is **Three lanes above & below**: four dashed dividers on each of two road surfaces, offset 6 m above/below the eye at the default 24 m lane width. Lateral offsets are -36, -12, +12 and +36 m, defining three equal lanes on each surface. Every prediction sample transports the whole cross-section with the future craft orientation, so steering curves the paint and roll twists both surfaces together. Dash spacing remains 8 m painted / 12 m gap, phase advances with actual travel, and the protected aiming area stays clear. Width controls lane width; road height is one quarter of that width (minimum 3 m).


Flight lab Settings / Trajectory guide also offers Double brackets. Each
60 m path station has inner angled bars and an independent outer set
exactly twice as wide and tall. Outer strokes are slightly quieter (80% of
inner opacity, 2-pixel pale cyan versus 2.5-pixel cyan). Every segment is
clipped independently: the outer set is not suppressed when the inner set
leaves the viewport. A regression places the whole inner frame off screen
while retaining a visible outer edge, checking the steep-turn use case.
Only the diagonal corner stroke remains: no horizontal/vertical bent hooks.
Stations are one third as frequent as the original 20 m frames. Both sets
retain open centres, angular fading, dark contrast outlines and
the protected aiming circle. `paintFlightBrackets` consumes the same fine
prediction and metre phase as the road treatment. Captures:
`output/flight-double-brackets-straight.jpg` and
`output/flight-double-brackets-turn.jpg`.

The Lane markers style remains available for comparison. It draws only two
dashed road edges below and beside the ship. There are no hoops, overhead rails or
crossbars. Default settings: four seconds ahead, 24 m between edges,
road plane 6 m below the ship, and 85% maximum line opacity. The controls
adjust the horizon, lane spacing and brightness, or turn the guide off.
The road plane follows each future craft frame, so steering bends the
paint and roll twists it. An explicit empty circle around the aiming point
keeps the guide out of the crosshairs even when a turn curves across them.

`flightHud.predictFlightPath(craft, demand, horizon)` copies the movement
arrays and runs the production `training.stepInput` at 1/120 s. It returns
`FlightPathSample[]` with relative seconds, cumulative physical distance
in metres, and a future pose at every tick, including the starting pose.
The real craft, guns and profile are never edited. This includes existing
velocity, lateral damping, angular rates, throttle, boost, pitch, yaw and
roll, but does not predict combat, scenery motion or collision avoidance.

`paintFlightLanes(ctx, width, height, camera, units, path, spacing, opacity,
phase)` offsets each future pose along its right vector by half the lane
spacing, and down by one quarter of the spacing (at least 3 m). Paint is
8 m long with a 12 m gap, measured along the predicted road centre. The
HUD's private travel counter advances with actual camera displacement;
its metre phase is captured with each cached prediction so dashes approach
and pass the ship at a speed-dependent cadence. This phase is not saved
and resets when the combat world is replaced or its clock rewinds.

Each individual dash is a polyline through the fine physics samples.
Only interval endpoints are interpolated; a turning dash is not a single
straight chord between coarse future hoops. The two edges have common
paint intervals and constant physical separation in the future craft frame.
Near-plane and viewport clipping precede perspective division. A circle
with radius `clamp(0.075 * viewportHeight, 40, 72) + 3` CSS pixels removes
road strokes around the aiming point; a further 36-pixel transition fades
paint into that opening. Angular fading also quiets off-axis marks. Bright
cyan 2.5-pixel strokes and a dark 5.5-pixel backing retain terrain contrast.

Forecasts cache for up to 0.1 simulated seconds; changing held inputs can
refresh at up to 20 Hz. Projection follows the camera every rendered frame.
Paused settings and replacement combat objects invalidate the cache. The
guide is for ordinary manual cockpit flight: AI observers, chase cameras,
non-Euclidean missions and dead pilots suppress it. Horizon is capped at
eight seconds. No browser resources or guide data enter simulation saves.

Focused checks compare fine forecasts against independently advanced real
sessions for straight flight, yaw, pitch/roll, combined turning/roll with
boost, strafing, braking and throttle changes. Drawing checks independently
unproject the straight road to verify 8/12 m paint and physical separation,
check both sides lie below the eye line, prove all curved strokes clear
the aiming circle, and detect curvature within individual dash polylines.
HUD demand plumbing, disabled/observer states, clipping and immutability
are checked separately.

A local Node probe (10 warm-ups, 40 samples, four-second combined turn/roll
forecast, stubbed painter) measured forecast median/p95 7.42/10.98 ms and
road projection 1.52/2.70 ms. These exclude actual GPU HUD submission and
browser frame cadence; they are not frame budgets. Browser review captures
are `output/flight-lanes-straight.jpg` and `output/flight-lanes-turn.jpg`.
