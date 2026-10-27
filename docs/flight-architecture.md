# Flight architecture

[Architecture overview](architecture.md) · [Script loading](script-loading.md) · [Test groups](testing.md)

### Isolated arcade flight lab

`flightSession` owns manual-flight state. Its `snapshot()` is a borrowed live
view for observers, not a copy or a mutation interface; reacquire it after
reset/combat/world replacement. Browser controls use `setAsteroidDiameter`
(physical metres, 200–4000; false rejects the edit), `setStartPosition` (scene
units; copies the eye, stops velocity, clears contact/fractional time and zeros
the scenery clock), `setOpponentStyle`, `configureHulls`, `acquireTarget`,
`toggleTargetLock` and `nextTarget`. Diameter edits are followed by sortie reset;
style/hull selections apply to the current combat and its subsequent waves.
Opponent style and hull selection belong to the session and survive sortie
reset and combat replacement; replacement combat receives them before spawning.
The composition root updates these settings when UI choices change.
Hull configuration is allowed while paused and
shares the training collision/muzzle rules. Renderers and HUDs observe these
choices rather than selecting simulation geometry.

`advanceScenery` owns writes to the current world's elapsed-seconds field.
Manual frames supply elapsed time; `flightWatch.create` receives a session
adapter with `snapshot` and `advanceScenery`, and advances scenery only by
completed duel ticks. This clock remains separate from manual physics ticks.
`setWorld` is the explicit renderer camera/world replacement boundary. Tests
may still mutate borrowed views to construct simulation fixtures.

`experiments/flight.html` loads the ordinary production script stack with boot
disabled, then a separate flight model and page controller. The model exposes
`Driftworks.arcade` (profiles, create, step, contact); it owns 3D cockpit position,
velocity and an orthonormal attitude basis. SI speeds convert through
`sim.METERS_PER_UNIT`, without tactical time acceleration. Its page controller
uses `scene3d.create(..., {study:true})` and `setSurfaceCamera` to reuse production
geology, with no changes to persistent simulation state or save rules. The
controller caps stalls at 0.1 second and clears input on pause/blur/visibility
changes. The session accumulates elapsed time and executes exact 1/120-second
ticks, matching the duel clock's cadence and rounding tolerance. Fractional time
survives between calls (including pauses and combat toggles); sortie reset and
death discard it. Each completed tick uses the controls and loadout supplied to
the call completing it; input changes are not timestamped or queued. Identical
per-tick inputs reproduce simulation state independently of frame batching;
sampling live input at different frame rates need not produce identical inputs.
Calls completing no ticks preserve the previous contact indication. Browser
presentation/audio clocks still use frame elapsed time. Radial surface sampling stops
contact with 5 m clearance; this is an arcade stop, not a rigid-body collision.
The flight session advances a six-hour +Z asteroid spin in simulation time (pause
freezes it; sortie resets preserve its phase). Rendering, surface crews and the
work light share that phase. Cockpit surface directions and projectile field
samples are inverse-rotated into body coordinates; sampled contact points return
to world coordinates. A craft stopped against terrain follows its rotation and
attitude while contact persists. This remains an arcade surface stop.
Flight surface rigs and crew cache immutable body-space vertex buffers. Rotation
and translation update study actor draw uniforms, without resampling terrain or
rebuilding/uploading those buffers. Radius, excavation or source pose changes
invalidate the attachment cache. Study batches opt into upload reuse with
`staticGeometry`; dynamic actors retain their existing upload behavior.
Both dependency-free test entry points load the extracted retail maneuver data
before the flight model. The profile fields retain table units: seconds for
accel/decel constants and rotation times, m/s for speed vectors. Forward engine
ramping and lateral slip damping are separate; rotational damping and yaw banking
are also applied. See README for engine-power and afterburner assumptions.


Flight collision queries skip detailed terrain outside its enclosing 1.12-radius
sphere; the original per-substep contact sampling remains active near terrain.


The flight lab uses `experiments/skybox.js` for a perspective environment at
infinity: a single full-screen panorama pass and one batch of 3,200 seeded star
points. Both use the cockpit basis and the production 45-degree vertical field
of view. Translation never enters sky projection. The locally vendored ESO
all-sky panorama supplies the Milky Way; sharper procedural points provide
rotation cues at its limited resolution. The opaque background canvas sits
behind the transparent production scene. Other viewers retain their backgrounds.


Flight guns live in `experiments/guns.js`, independently of tactical combat or
saves. The controller advances cadence, projectiles and short-lived impacts on
the same substeps as flight; pausing freezes them and reset clears them. Bolts
retain their weapon reference across bank changes. Collision uses an enclosing
sphere followed by swept samples at no more than 1 m spacing and bisection
against `scene3d.rockField`. Impacts do not excavate or damage the asteroid. Ship contacts use `shipPackModels.hullHit` with the weapon's head radius in metres: an expanded bounding sphere and triangle bounds reject misses, then a continuous sphere sweep checks faces, edge capsules and vertices. Contact fractions order the nearest impact; decals use the actual hull surface point. Zero-radius ray queries retain exact triangle picking for convergence and inspection. This prevents visible bolt edges overlapping a hull without damage.
`scene3d.setStudyEffects` accepts up to four position/normal triangle batches
and colors; only study scenes draw them. Reused dynamic GPU buffers render
soft additive bolt billboards and flashes through the same camera/depth buffer as terrain.
Two generic barrels fire per volley, independent of the original POF gun mounts.
Their mounts are 3 m left/right, 1.3 m down and 4 m forward of the eye;
normalized firing directions converge at a shared point on the crosshair ray,
retaining the weapon speed. At volley emission, `training.convergencePoint`
selects the nearest living hostile hull surface within weapon range, excluding
surfaces within 1 cm of the eye and terrain-occluded hulls. For a surface less
than 8 m ahead, launch points retract to half its forward distance (normally
4 m) so both shots approach it from behind without backward fire. The gun controller
accepts an optional lazy aim-point callback, called once per volley; a null point
falls back to 300 m forward of the eye. Player sessions, duels and AI craft use
the same query. This does not snap to off-axis targets or predict their motion;
there is no linked-bank or energy simulation yet. Training combat supplies separate health and enemy logic. Existing synthesized audio
honors the main game's sound preferences.

Flight effect batches use their three normal slots as unnormalized UV/opacity
attributes, carried separately into the effect shader. Camera-facing ellipses
project the bolt length onto the view plane and retain a round end-on footprint.
A narrow bright core and fading glow replace crossed opaque rectangles. Depth
testing remains enabled while additive effects disable depth writes; impact
opacity fades with age. Visible bolt length and width scale linearly with distance
from the camera, reaching full size at 30 metres to keep nearby fire from covering
targets. This maintains roughly constant angular size within that range; beyond
it, perspective shrinks the full-size artwork naturally. Weapon dimensions and
ballistics are unchanged.


`experiments/input.js` provides pure controller mapping and deadzone helpers.
The flight page polls `navigator.getGamepads` once per rendered frame and feeds
that snapshot into the flight substeps. Button edges control bank switching and
pause; axes and held fire/boost are continuous. Mouse deltas accumulate once per
frame and become rate demand normalized by frame time, then clear. Pointer lock
is acquired only from Fly's user gesture; success starts flight, while failure
leaves it paused. Pointer-lock loss, Escape, blur, hidden tabs and controller
disconnection clear transient input and pause. Controller/keyboard mode uses an
explicit Fly action without pointer lock. No controller mappings enter world
state or tactical saves. Standard and configurable raw mappings share the same
physical flight/weapon model.


### Flight training combat

`training.stepControlled` owns the common tick sequence used by manual sessions
and evaluation duels: `stepInput` for the controlled craft, `training.step` for
combat/NPCs, then the controlled craft's `flightGuns.step` using shared traces,
terrain queries, convergence and muzzle anchors. It reports shot/impact feedback
and whether combat damaged the controlled craft. An optional read-only observer
runs after combat and before controlled gun damage so duel damage/dry-spell
metrics retain their original sampling boundary. It always finishes the gun
tick after controlled-craft death, suppressing new fire but aging existing bolts.
The helper does not advance clocks or decide termination. Manual sessions retain
asteroid spin, body-frame terrain marks, audio callbacks and post-gun contact;
death skips contact and discards pending time. Duels pass radius zero without
terrain and retain metrics, replay inputs and death/opponent-death/duration stops.

`experiments/flight-collision.js` owns broad-phase indices, padded movement
proxies, projectile candidate caches, grid/tree queries and event scheduling.
It loads after simulation units and before training. It creates no browser
resources and does not depend on training, pilot policy or damage callbacks.
Optional model bounds are read from the shared ship catalog when queried.

Its `query` returns candidate views in participant order plus shooter/faction
metadata. Training still performs exact hull intersections, chart/team checks,
nearest-hit selection, damage, scorches and near-miss callouts. Candidate entries
are read-only to callers. All caches, modes and queues remain in module-owned
WeakMaps rather than serializable combat state.

`training.setCollisionMode`, `collisionBatch`, `collisionChanged` and
`collisionStats` remain compatibility aliases. Batch entry/exit, explicit proxy
movement updates and roster notifications retain their existing timing. Collision
variants continue to share the exhaustive-reference regression and exact real
session comparison in `tests/projectile-broadphase.cjs` and
`tests/collision-events.cjs`.

`experiments/training.js` owns the isolated wave director, pilot decisions,
steering primitives, training health, target IDs, and simple enemy geometry.
The page calls its simulation on the same 1/120 s substeps as player flight.
The wave director spawns three to six craft and assigns no more than two attack
slots. Decisions update every 0.28–0.65 s, with committed break/evade/recover
windows; continuous steering supplies pitch/yaw/roll/throttle/boost to the same
`arcade.step` used by the player. Predictive aim uses target velocity with
pilot-dependent lead and deterministic error. Fire is gated by range, alignment,
attack assignment, and short burst windows. Steering separates nearby enemies
and avoids a conservative asteroid shell. It does not port FreeSpace source.

Projectile sweeps choose the nearest terrain or opposing hull contact
(triangles in flight/duels, explicit spheres in standalone legacy fixtures)
before applying damage. Dead targets cannot take repeated damage or score twice.
Destroyed enemies stop steering/firing but their already-fired bolts expire
normally. Clearing a wave starts a five-second countdown. Common lab shields,
hull and health tuning are separate from retail maneuver profiles. Death stops
the run; pause freezes all combat clocks. Reset creates a fresh training session
and respects the free-flight checkbox. No training state enters tactical saves.

`scene3d.setStudyActors` submits up to four opaque position/normal triangle
batches through reused dynamic buffers and the production depth test. The
training craft use six triangles each. Soft bolts, hit/death flashes share the
existing study-effects batches; a separate DOM-owned canvas draws contact
brackets, off-screen direction cues and a selected-target intercept pip.
Actor/effect buffers and UI resources stay outside simulation state.


### Flight lab orchestration

All authored `src/**/*.js` and `experiments/**/*.js` scripts run through the
same strict TypeScript/JSDoc check and unchecked-`any` audit. The checker also
compares the configured files with both directories, and rejects scripts that
disable checking, so experiments cannot silently drop out of coverage.
`experiments/types.d.ts` owns lab contracts and augments the shared namespace;
production simulation types do not import the experiment contracts. Its vectors
use scene units for positions and SI metres/seconds for velocity and engine ramps.
`dom.js` supplies typed control lookups for the experiment HTML entry points and
reports missing IDs immediately. Load it before browser adapters, including the
standalone voice and ship previews.

Flight stress approaches a pressure baseline (0.5 for one pursuer, 0.65 for
multiple pursuers), and recovers toward it after damage recovery delays. Missed
shots cannot raise stress above 0.55; damage and severe events can still cause
panic. Safe flight continues to reduce stress toward zero.

Surviving NPCs above critical hull react to actual shield or hull damage with a
`hit` radio fact. Both teams can react; repeated hits coalesce per speaker while
pending, expire after seven seconds, and share a 12-second category cooldown plus
activity repetition penalties. Critical hull retains the existing distress calls.

Flight comms has three layers: `flight-dialogue.js` owns line templates, stable
pilot voices, contact phrasing and line repetition scoring; `flight-comms.js`
owns emotions, combat observations and airtime scheduling; `flight-radio.js`
owns subtitles, channel playback and Web Audio lifecycle. Load them in that
order after training and mumble, before flight boot. The existing
`flightComms` API forwards dialogue helpers and `mount` for compatibility.
Flight mission defaults and overrides are registered in `flight-missions.js`;
Ohio's authored data lives in `mission-ohio.js`. Shared consumers resolve mission
settings rather than branching on Ohio's ID. See [mission format](flight-missions.md)
for inheritance, load order, supported handlers and transient opening progress.
Ohio radio templates resolve named addressees from living contacts at delivery.
Ohio's literal player address uses “bud” or “neighbor” in friendly lines and
“hotshot” in rival taunts. Address substitution preserves `{pilot}` placeholders
so named references to other cast members keep their actual callsigns.
Across missions, player-facing radio categories (contacts, closing warnings,
near misses, shield warnings, streaks and rival taunts) get six times the base
selection weight before activity repetition penalties. Rivals actively targeting
the player can offer a taunt after ten active seconds; in team dogfights, rivals
actively attacking a living wingmate also qualify because those encounters select
NPC opponents. Taunts use a separate 20-second
category cooldown, independent of the ambient timer. Replies and urgent flight
calls retain precedence; occupied radio, pause and death gates still apply.
Ohio distances are displayed in yards (1 yard = 0.9144 m), with speed in miles per
hour (1 mph = 0.44704 m/s); radar projection, contact data, and flight physics retain SI units.
Radio composition converts a copy of numeric range/speed data before spelling
out the numbers. Named Ohio variants are limited to direct social banter,
help requests and actual conversational replies; routine activity reports do
not select an unrelated neighbor simply to insert a name.
Friendly banter and requests exclude the speaker and use their wing; enemy taunts
may name a living opponent. Cover, reassurance, and acknowledgments address the
actual caller/responder in the validated exchange. Named requests still require
real movement or firing toward the threat before a helper can claim cover.
`replyTo` also identifies an explicitly named addressee in Ohio banter or requests.
Ambient Ohio lines use a living pilot's normal voice and portrait. Template keys
retain `{pilot}` for repeat scoring, while history records the transmitted name.
Without an eligible neighbor, the radio keeps its ordinary unnamed variants.

Ohio wardrobe selection is presentation-only: `mission=ohio` chooses the seventeen
local atlases in `assets/portraits/ohio/runtime/` when the portrait panel mounts.
All other sorties use the standard cast. Slot order, voices, seven frame rectangles,
expression masks, speech timing, reduced-motion behavior, and the seventeen-bitmap
cache budget remain shared. The optional `tools/prepare-ohio-portraits.ps1` packs
ImageGen wardrobe masters while copying the original calibrated inner-face pixels
into every expression frame; it feathers only outside that protected face boundary.
Clothing and headwear are frozen across all poses. Generated masters, prompts,
source/output hashes, and a cast preview are retained under `assets/portraits/ohio/`.
`tests/ohio-portraits.cjs` verifies the shipped facial pixels and mission isolation.
Preview every animated Ohio pilot at `experiments/flight-cast.html?mission=ohio`.

Portrait artwork comes from ImageGen sprite sheets. The discarded photo transformation
laboratory and single-face edit auditions have been removed; `experiments/face-blend.js`
and `face-blend-types.d.ts` own the shared sheet compositor and its API.

`flight-portraits.js` adds a presentation-only caller portrait to the radio
adapter. It reuses `face-blend.js` for fixed-master,
inner-face masking and Mumble syllable timing. Load face-blend and portraits
before flight-radio. Lines carry `portraitIndex`, copied from the same stable
craft index used by voices; sixteen distinct pilot portraits cover the sixteen
voice slots in matching masculine/feminine order. Control uses a dedicated silver-haired command portrait (slot 16). The original 4x2 atlas and six localized generated variants
live in `assets/portraits/dogfight/` as preparation sources. Nine additional per-character
4x2 expression sheets live under `cast/`, alongside their imagegen prompts. The optional Windows
tool `tools/prepare-flight-portraits.ps1` applies the eye/mouth calibration offline
and packs seven 256-square poses per character into the checked-in `runtime/`
PNGs. `experiments/flight-cast.html` previews all seventeen identities with speech,
blink and expression layers. Deploying still needs no build step. Source/builder/output hashes and PNG
dimensions are checked by `tests/portrait-assets.cjs` to catch stale exports.

Flight loads only the compact runtime images (about 12 MiB for all seventeen
characters versus about 36 MiB for the preparation sources). Idle-time warm-up fetches and decodes one character at a
time, beginning with Rook (Control loads on demand); a foreground transmission can start its own request
immediately or share the pending request. Up to seventeen compact ImageBitmaps remain
in a fixed cache of about 30 MiB decoded pixels, avoiding first-use popping once
warm-up finishes. No seven-canvas cache is retained per character: the compositor
reads frame rectangles directly from the bitmap. Working canvases belong only to
the active portrait and are disposed on caller changes/clear. Page exit aborts
warm-up and pending fetches, closes cached or late-decoded bitmaps, and a restored
page restarts warm-up. Failed requests can retry. Hair, uniform and background
belong to the frozen neutral master; the shared permission mask is computed once.

The radio adapter passes its actual AudioContext start time and radio speech
offset to portrait playback. Muted/locked-audio messages show a resting expressive
portrait; stop, pause and source completion close the mouth, while reset/channel
clear invalidates pending image loads. Asset failures retain the original radio
glyph and subtitles. Portrait draws are capped at 30 Hz and reduced motion keeps
the face still. Current caller emotions update from the existing comms clock;
fear/panic and high stress select the alarmed face, frustration/moderate stress
select tension, and confident/relieved/reassuring lines select the restrained
smile. Reassurance replies retain their own delivery instead of inheriting the
speaker's baseline fear. Expression and mouth cores render at full opacity to
avoid double lips, with feathering only around the surrounding skin. This module
does not write combat state, introduce emotion rules, or change airtime selection.
Comms may change its own clock, facts, conversations and emotions, but observes
gameplay without writing it. Regression tests pass deeply frozen gameplay views
through contacts, distress, combat events and lifecycle changes, and compare
seeded live sessions with and without comms after every tick, including resets.


`experiments/flight-session.js` owns the lab world fixture and mutable sortie,
combat and gun state. `reset(config)` replaces those three states and optionally
spawns combat; it retains the world, body size and elapsed clock. `setCombat`
replaces only combat, preserving the toggle's existing delayed-spawn behavior.
`snapshot()` returns current references, not a clone; its sortie, guns and combat
are initialized even before the first reset. The browser composition root reads
fresh views per callback or frame, without retaining replaceable session objects;
reset and combat-toggle callers do not synchronize local copies. `advance` executes at most
1/120-second substeps in movement, training, player guns, audio notifications,
and surface-contact order. Death finishes gun/audio processing and stops before
contact. Terrain/hull/surface queries and audio notifications are injected.
The browser loop owns pause, input, elapsed-world time and comms scheduling.
Pause/resume and sortie reset clear the diagnostics adapter's simulation timing
baseline; the first active frame advances zero seconds. Performance intervals
and measurement resets are independent of this simulation baseline. Status text
uses one resolver for death/completion, pause and active-flight/contact states,
so later frame work cannot overwrite a terminal message. The Node suite also
executes `flight.js` in an isolated browser-resource fixture, driving actual UI
callbacks and queued animation frames with real session, diagnostics and duel
implementations (`tests/flight-transitions.cjs`).

Flight-AI validation keeps three policies distinct: existing `training.js`
opponents shape the player experience; `experiments/flight-ai.js` provides a
best-effort perfect stress pilot and delayed-observation human simulators.
Testing pilots return complete validated controls and never mutate live flight
state. They share `arcade.step` and fixed-forward gun physics. The optional
`experiments/flight-duel.js` runs one testing pilot in the player seat against
the existing opponent policy, with fixed 1/120-second steps, no terrain and no respawn.
It is shared by both test entry points, the evaluator and the flight lab's optional
watch mode. `experiments/flight-watch.js` adapts it to fresh lab snapshots, tracks
simulated presentation time and adds a chase camera and player artwork only to
the rendered view. It rereads scenery after camera-driven world replacements;
no observer craft or camera pose enters the simulation. The lab composition root
owns watch controls, pause/reset, speed and cockpit/chase selection. Flight input
is ignored while watching, pointer lock is not requested, and the duel stops on
its terminal result. The dependency-free
`tools/evaluate-flight-ai.cjs` emits measurements and source-pinned input replays.
See [flight AI validation](flight-ai-validation.md) for contracts, baseline,
historical baselines and limits to human/optimal-play claims.

`tools/import-retail-flight.cjs` reads numeric retail VP tables offline into 35
small-craft profiles and ten bolt weapons. `training.configure` assigns player
class hull/shield maxima; `training.equip` assigns craft class defenses and primary
weapon. Configured spawns use those defenses, and both sides share shield
absorption/spillover, seven-second delay and 12-points/s recovery. Unconfigured
test fixtures retain legacy defaults. `DuelOptions` records both profile/weapon
choices, hull model IDs and a symmetric unshielded override; replay schema 3
rejects legacy defense/collision semantics. Watch controls choose handling and
defense stats independently from the visible/collision hull models. See [retail loadouts](retail-flight-loadouts.md) for unsupported
ETS, quadrant, energy, hardpoint and special-ability behavior.

`experiments/flight-hud.js` mounts the overlay canvas and target camera and owns
radar range, telemetry, instruments and contact/lead markers. `render(view)` takes
fresh session references and presentation/input values each frame; it does not
retain sortie references or control simulation. Both ordinary scripts load before
`flight.js`; the existing radar and target-camera modules remain subordinate.

`experiments/flight-controls.js` mounts keyboard, pointer-lock, mouse and gamepad
input. Flight lab and mission pages mount this same adapter and composition root.
Input mode, mouse sensitivity, and preferred device ID persist across pages in
localStorage, alongside per-device bindings, steering preset and rumble. Device
selection follows the saved ID even if browser gamepad indices change; unavailable
storage or invalid saved mode/sensitivity uses page defaults.
It owns held keys, the virtual stick, device discovery, editable bindings
and controller button edges, using `flightInput` for mapping math. The pause-screen Settings panel selects original, medium-soft, or wide-linear steering; the adapter stores the preset ID in localStorage, tolerates unavailable storage, and centers input while keeping flight paused on changes. `flightInput.stickDemand` accepts an optional response exponent (default 1; softened presets use 1.6). `sample()`
polls devices, dispatches pause/bank actions, then returns merged flight demand;
fresh button presses or above-deadzone stick changes select the active device
across all connected controllers and clear mouse steering without a mode change.
A fresh non-pause button starts/resumes a living ship without pointer lock;
held buttons, axis noise, hidden pages and dead ships do not auto-resume.
the browser loop checks pause after sampling. `view()` exposes only mouse/mode/
stick-range data and `showMouseStick` for HUD rendering. Above-deadzone mapped stick changes hide the guide and clear mouse displacement; captured mouse movement restores it. Unchanged held axes and small axis noise do not reclaim the guide. Pause Settings shows a fixed reference for standard gamepads: right-stick Y changes throttle at up to 0.5/s, with neutral holding the current throttle. Holding LB/L1 on standard pads routes right-stick X/Y to ship-relative side/vertical demand, suppressing right-stick roll and throttle adjustment while preserving left-stick steering and D-pad throttle. Keyboard A/D and R/F combine with that demand. `flight-model.js` normalizes translation demand to a 5 m/s target with a two-second ramp, independent of retail strafe limits; release targets zero. Manual throttle spans -1 to 1, with negative values targeting up to 5 m/s reverse. Absolute joystick throttle remains 0 to 1. Nonstandard joysticks retain device bindings. `clear()` resets held input; `resetButtons()`
is separately called on resume to preserve existing controller edge semantics.
`haptics(dt, feedback)` owns the selected device's dual-rumble actuator. The
composition root derives boost, player-hit, shield-break, fired-volley, and first
surface-contact feedback around each session advance. The adapter mixes short
priority pulses over light sustained boost, refreshes sustained effects at most
every 75 ms, and issues only bounded 110 ms effects. `clear()` also stops rumble;
pause, reset, focus loss, disconnect and device changes therefore cancel effects.
The saved rumble toggle defaults on; missing APIs, thrown errors and rejected
promises do not interrupt flight. Haptics remain browser state, outside saves.
`capture()`/`release()` own browser pointer-lock requests.
If pointer capture is missing or rejected in mouse mode, the adapter resumes
with absolute cursor steering using host bounds and the existing stick response.
`view().uncapturedMouse` identifies this mode; release, Esc, focus loss or leaving
the host clears it. Mouse firing is restricted to the host, and controller
selection remains explicit. The input selector is visible above Start/Resume.
Gameplay and diagnostic
shortcuts call injected actions; the adapter does not access session, HUD, comms
or weapon selectors. The optional environment argument supplies document/window/
navigator for adapter regressions. Load it after `input.js` and before `flight.js`.

The optional `?aegis=1` flight scenario loads a locally baked capital-ship rig
before creating the sortie. `experiments/aegis-flight.js` owns ephemeral turret
angles, projectile banks and collision proxies; it uses `flightGuns.step` and
`training.trace` for the existing projectile and damage rules. The flight
composition root advances the rig only while unpaused and resets it with the
sortie. Presentation receives the rig through `setCapital`, reuses static hull
buffers for both hull and turrets, with shared GPU meshes and per-mount rotation
bases rather than CPU vertex transforms or streaming uploads. Model projectile
queries use a weakly cached triangle hierarchy over immutable source geometry,
with earliest-entry pruning and the existing nearest face/edge/vertex semantics.
World-space poses remain query inputs; the cache contains no craft pointers.
PD passes a 0.25 s
cosmetic scorch interval to `training.trace`, rate-limiting surface projection
through a weak per-craft cache while retaining every damage event. The optional
interval defaults to existing behavior for all ordinary weapons.
Cached `sourceScorchGeometry` batches also retain fighter/wreck surface marks in
model-local space, invalidating on mark identity or hull changes and using GPU
pose transforms each frame. The older `scorchGeometry` posed output remains
available for callers that need world-space vertices. These
experimental objects are outside the tactical world's save contract. See
[the Aegis reference](dreadnaught-kit.md) for axes, units and prototype limits.

`experiments/flight-presentation.js` owns the main study scene, skybox, texture
loading, artwork controls/credits, faction paint and fleet/effect submission.
`appearance()` returns a fresh selection/paint/image snapshot for both `render`
and the HUD. `model(craft,wave,appearance)` is their shared team-aware model
resolver; `hullHit` uses current artwork with the supplied combat wave. Wrecks
join hull/scorch batches, while only living craft emit engine effects. Submission
remains hulls, scorches, surface scenery, gun effects, engines, diagnostic settings, sky, scene
sync, scene render. `pose` forwards the player camera; `renderStats` supplies
scene and sky counters. It does not advance the session or own its world.
Three design 07 (`rampdock`) mining rigs and their source Quaternius EVA crew use geometry anchored
with `scene3d.surfaceFrame`, at 36 m hull length and 1.8 m suit height. The flight and study share
`assets/characters/quaternius-astronaut/poses.js`. Material batches are cached by asteroid
identity, radius, pose and loaded crew poses; they introduce no simulation entities or saved state.

`experiments/flight-diagnostics.js` mounts render/performance controls and owns
frame pacing, elapsed timestamps and rolling measurements via `flightPerformance`.
`beginFrame(t,paused)` returns null for skipped frames, or elapsed/measurement
context; elapsed is capped at .1 seconds while diagnostics retain actual time.
`endFrame` records CPU time after scene and HUD work and reads renderer counters
only when refreshing the overlay (over 250 ms). Control changes and reset clear
pacing and elapsed timestamps as well as measurements. `settings` supplies study
options; toggle actions preserve F3/P behavior. Both modules load before flight
boot; the HUD uses the presentation resolver. Optional browser/clock environments
support focused headless orchestration tests without WebGL.

`scene3d.miningPlatformGeometry(deployment, time, working, variant?)` returns local triangle arrays grouped by paint, with unit normals and foot pads near z=0. Production rendering aligns this artwork to the asteroid slope and batches it into four reusable GPU buffers. Deployment derives from existing platform state; geometry never changes persistent world data. The mining platform study uses the same geometry.

Mining pod silhouette studies use optional `pod`, `anchors`, or `recessed` variants in the comparison viewer. The omitted variant retains production artwork. These are presentation-only alternatives with no new saved state.

The `fabricated` mining study uses a symmetric twelve-edge footprint, twelve vertical side plates, twelve shoulder plates and a flat deck/belly. Eight equal chassis-mounted grippers retain the pod arrangement. The viewer grey-material toggle changes batch color only, preserving lighting and geometry.

Mining platform artwork has no decorative idle machinery animation in either renderer. Cutting teeth remain static structural geometry; only deployment changes the rig pose. Geometry and paint functions retain their legacy time/working arguments for caller compatibility.

The `workboat` study retains the fabricated chassis and grippers, lowers the main deck, and separates a forward-central sealed crew cabin from an open rear hopper and side-mounted service cradle. These functional zones are presentation geometry only; they do not add crew capacity or cargo simulation.

The mining study loads local Quaternius astronauts through `tests/mining-study-crew.js`, samples frozen neutral/interact poses and submits material batches through study actors. Suit height is 1.8 m; the adjustable main-hull length maps its 32 artwork units to 12–36 m, independent of simulation units. Four fixed placements target the workboat study: ground/gripper, mining head, deck and hatch. This does not add population behavior.

`tests/mining-study-context.js` mounts an existing world asteroid through the production mesh/geology renderer and uses its shared surface-height query to place the rig and ground crew. The existing Quaternius Spitfire is a frozen hovering reference. Its assumed 12 m nose-to-tail length shares the study metres/artwork mapping with crew. Both context layers are independently optional; they do not alter game state.

The `drydock` study treats the body as one cargo hold around a central eight-sided lookout tower. Optional fifth `miningPlatformGeometry` argument `panelOpen` (0–1) rotates twelve yellow cover segments about their outer rim hinges; cargo and tower remain fixed. It removes the rear hopper and cutter, retains a short transfer/launch interface and locks study scale to 36 m. This is manual deployment geometry, with no idle animation or new simulation state.

The `rampdock` study aligns eight doors and eight anchor roots to shared perimeter hardpoints. Door rotation is solved to lower their lips to local z=0 at full deployment. Dark stanchions, upper/lower perimeter rings and radial braces remain fixed as a protective cage; this is an artwork datum, not terrain-aware contact solving.

Rampdock doors use two rigid leaves: a vertical wall that seats against the fixed cage, plus an upper roof leaf covering the hold. Opening first unfolds the roof leaf, then lowers the wall to a 25-degree descending ramp; the outer leaf reaches the local ground datum at a steeper angle. Closing reverses that sequence. Plate thickness follows each moving face normal.

Rampdock tower roof hardware is a static shuttle docking blockout: a marked rectangular pad, octagonal airlock collar with recessed split hatch, and four raised alignment/clamp hardpoints. It remains attached to the tower independently of cargo-door deployment; no docking gameplay is implied.

Rampdock material grammar: yellow is outward-facing transit armor (including the tower docking roof); grey is the hold/work deck and the inward-facing door skins that become deployed ramp surfaces. Dark material identifies fixed cage/chassis and recesses. Door edges remain yellow so their motion stays readable. Docking collar/hatch hardware stays metallic within the yellow roof.

Rampdock lookout glazing uses a flared two-band cab profile: the lower faceted window cheeks face outward/down toward the worksite, while the upper horizontal band provides forward/side visibility. Yellow sills, corner posts and a roof brow frame both bands. The cabin remains sealed; there is no glass floor or underside blister, and docking-roof geometry is retained.

The drydock tower main egress is in its lower core at cargo-deck level (deck z=4.5, shallow threshold top z=4.8), with the access-study astronaut on that threshold. The lookout glazing and roof shuttle hatch are separate upper-level interfaces.

Rampdock medium door hardware shares the existing two-stage transforms: root knuckles and clevis cradles sit on the lower cage ring; fold-axis barrels move with the lower leaf; a telescoping jack spans a fixed frame pivot and moving panel pivot. Fixed stop blocks/closure receivers and moving registration tabs suggest load stops and captured closure. This remains visual articulation, with no actuator dynamics or independent latch simulation.

Door hinge refinement uses three discrete short pins per axis, with frame clevis ears, visible retaining caps and articulated panel lugs. Compact jack barrels/rods suggest controlled low-gravity deployment rather than Earth-weight lifting; fixed cage stops and receivers remain the securing structure. Geometry proportions are visual, not load-rated engineering dimensions.

The rampdock cage retains its original member centerlines and hardpoints, using rectangular box sections about 30–32% narrower in plan than the first square-bar pass. Lower perimeter members retain more depth, while radial cargo braces are lighter. Hinge hardware, leg geometry and panel motion are unchanged by this section-only study.

Cargo deck top (z=4.5) and belly (z=4.15) are separate surfaces with closed rim faces. The broad chassis top sits inside that slab at z=4.25. Do not put dark opposite faces or chassis caps directly on the grey deck plane: this causes angle-dependent depth flicker.

The sorting/transfer tray top is below deck at z=4.3; the tower core and cargo-load undersides penetrate their support surfaces slightly instead of ending exactly on them. The depth regression checks smaller overlapping faces too, not just full-width floor/chassis faces.

### Aegis hangar departures

The kit bake owns mixed hull layout and conservative through-hangar apertures.
The Aegis rig subtracts those apertures from its coarse hull boxes, and owns the
bounded reinforcement schedule and initial departure poses. The flight
composition opts its encounter into `Combat.hangarSupport` when resetting the
rig. Training stages allies during supported waves rather than spawning them in
open space, and does not declare an allied defeat while the carrier can replace
them. An optional `Craft.hangarLaunch.remaining` holds straight departure until
clear, then ordinary AI resumes. These fields belong to the experiment combat,
not the persistent Driftworks world. Normal flight and missions omit the flag
and retain their existing lifecycle.

### Aegis capital engagement

`aegisFlight.createBattle()` composes two runtime rigs with independent team,
position, heading, velocity, weapons and integrity. This experiment state does
not enter persistent world saves. Bounded patrol motion updates both poses
before weapon stepping; all hull queries and mount directions transform between
local meters and scene space. Heavy rounds use swept opposing-hull contacts and
reduce integrity once per contact; PD keeps the ordinary faction-aware fighter
damage resolver. Both rigs share immutable vertex buffers while keeping mutable
bases, origins and weapons separate. The original no-options `create()` stays
stationary for benchmarks and tests.

Ohio flight music uses `audio.createOhioMusic()` and local media in `assets/audio/ohio/`. The DJ waits until the opening radio exchange has finished (`combat.openingStep` advances beyond the opening line count only when the channel is no longer busy). Pause/resume before that point keeps the DJ waiting. The announcer plays once at 1.25x with pitch preservation; its final three playback seconds fade into the looping instrumental. The instrumental holds its selected level for ten playback seconds from track start, then fades exponentially over twenty seconds to 30% of that level (about -10.5 dB), retaining the quiet level across loops and pauses. Flight holds comms updates while `isAnnouncing()` is true, releasing chatter after the announcer ends, including its crossfade tail. Flight owns resume/pause and frame updates; pagehide also pauses both elements. A separately remembered Ohio radio/music slider defaults to 65%, independent of the tactical synth music preference and flight SFX mix. Restarting a sortie in the same page retains music position; reloading replays the intro.

`tools/trim-ohio-intro.py` derives `radio-intro.wav` from the preserved `radio-intro-source.wav`, shortening only sustained quiet gaps. Longer pauses retain 350 ms for emphasis; shorter gaps retain 160 ms. A 5 ms blend at each cut avoids clicks.

Audible Ohio soundtrack playback calls the mixer's transient `setMusicActive` gate to reduce only the flight engine by 3 dB. Pausing or setting the Ohio music slider to zero restores the engine. This multiplier composes with comms/impact ducking without changing the saved engine slider or other missions.


### Cinematic bridge demo

`flight.html?mission=cinematic&bridgeGrid=0&bridgeOutline=0` runs the existing
Ellis optics and chart transport with two armed Aegis rigs on opposite charts.
The destination uses the `gas-giant` observer/frame, rather than the nearby gray
moon preset `jade-rime`. The terrestrial hero panorama is bound separately from the close Jade gas-giant cube; both
backgrounds pass through the same Ellis sky lens. Capital geometry retains chart
IDs and shared immutable local meshes. Both hulls circle their respective mouths
at 675 m radius in opposite directions (0.006 rad/s, about 4 m/s), keeping
their long broadsides inward. Main batteries engage when their radial directions
differ by more than 104.5 degrees; the same-side interval masks new main-battery
fire. Existing rounds finish their trajectories and fighter/point-defense combat
continues. Bridge batteries may depress up to 0.2 rad toward the lens; the
existing hull obstruction query still rejects blocked barrels. Heavy guns
predict target motion in its destination chart before solving their optical
firing route; projectile segments test only capital hulls in the segment's
chart. The capital aim cache refreshes at 120 ms intervals staggered across
mounts, rather than solving all 24 routes every frame. Destruction does not stop
already-fired optical rounds.

Both hangars launch up to eight living fighters per faction, replacing losses
with three seconds between launches. After the short straight bay departure,
fighters use the existing `fso-breaker` pursuit AI at skill 2. Cinematic target
selection permits opponents in the other chart and prefers local opponents when
available. A fighter with a remote opponent navigates through the physical
mouth, then resumes ordinary dogfight decisions, lead, guns, hull collision and
damage. There are no battle zones or formation tethers. Empty-space missions
skip asteroid avoidance shells. The cinematic encounter does not end when one
wing is temporarily wiped out, and the camera does not periodically reset
combat.

`flightWatch.cinema(rig)` owns only presentation time, subject selection and
camera poses: six ten-second shots plus a 24-second full orbit of the mouth,
with C to cut early. The orbit translates the eye around the physical mouth at
1,050 m horizontal radius with a gentle elevation change, keeping the lens
centre framed. The fighter shot uses an independent inertial camera with
acceleration capped at 22 m/s², speed at 240 m/s and damped aim limited to 0.35
rad/s. It keeps a world-up horizon. Subject death or chart transit causes a
deliberate cut instead of a camera warp. The stationary session observer stays
separate from the camera; Escape pauses simulation and the camera clock. This
remains a prototype director: pursuit shots can face empty space and cuts are
timed rather than selected by combat salience.

`tests/cinematic-demo.cjs` uses the real headless flight session to exercise
capital damage across the bridge, fighter firing, hangar replacement and camera
chart ownership. `tools/benchmark-cinematic.cjs` compares capital simulation and
geometry preparation with and without the optical aim cache. See [cinematic
performance observations](benchmarks/cinematic-2026-10-26.md).

The pause menu's Settings panel exposes “Stretch ships through the wormhole”
only on wormhole missions. It starts from `bridgeShips=warped` (otherwise rigid)
and changes live through `flightPresentation.setShipStretching`,
`scene3d.setStudyShipStretching` and `EllisRenderPass.setShipStretching`.
The change preserves simulation and actor meshes, invalidates optical history,
and survives render-pass recreation. It is a session setting. Both gameplay and
the object experiment use finite-source ship images: rigid when off and a local
affine patch when on. The optical center agrees with the HUD primary path; ships
are excluded from ordinary geometry and mouth captures to avoid duplicate images
and the full compositor's different near-field policy. Full ray-search geometry
remains available through the study's explicit mode. Far-side aperture clipping
continues to apply to ship images. If the local Jacobian is unusable, the live
mode keeps a rigid image at the optical center rather than reverting to ordinary
perspective.

The wormhole pause menu's Renderer diagnostics offers “Benchmark rigid / stretched
ships”. It freezes the current simulation, camera, appearance and render settings,
then runs rigid/stretch/stretch/rigid blocks with 20 warm-up and 90 measured frames
per block. It restores the original mode and control disabled states even after
an interruption. Hidden/resized viewports invalidate the run. The displayed CPU
and frame median/p95 are distinct from asynchronous WebGL2 scene GPU elapsed time.
Queries wrap only `scene.render`, after the separate sky render. Unsupported,
disjoint/context-lost or insufficient GPU samples report unavailable; timers never
block waiting for results. The scene timer includes the wormhole compositor and
excludes separate sky draws; it is not a whole-frame GPU timer. GPU adapter,
viewport/DPR/backing dimensions and sample coverage accompany the results.
The benchmark bypasses the normal frame cap and follows browser rAF pacing.

Initial [RTX 3070 Ti result](benchmarks/ellis-rigid-stretch-2026-10-27.txt):
at 1920x1080 scene backing resolution in the frozen starting encounter, rigid
versus stretched CPU medians were 1.40/1.70 ms and scene GPU medians 3.12/3.13 ms,
with 180/180 valid GPU samples per mode. This one pose does not establish
performance near the throat or at a larger window resolution.
