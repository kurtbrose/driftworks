# Driftworks

Driftworks is a browser-based hard-SF economic/RTS prototype with planar fleet movement and an optional 3D rendering experiment. This repository state is deliberately small: a static tactical sandbox where a persistent handful of industrial spacecraft can begin doing useful work.

For code changes, start with [AGENTS.md](AGENTS.md), then consult the
[architecture map](docs/architecture.md) and [world-state contract](docs/world-state.md).

## What Works Now

- PixiJS tactical scene using vendored runtime code. An optional whole-scene WebGL geometry prototype at `?renderer=3d` tests a shared perspective orbit camera, depth-tested asteroid volumes, and a meshed tunnel/chamber cutaway. Its ship and platform models are temporary blockouts; the detailed plumes and artwork described below belong to the default Pixi renderer.
- Mothership, one blue cargo ship (Linehorse), two escort craft, and two stored mining platforms. There are no mining ships.
- Single-click selection and drag-box multi-selection.
- Right-click move orders with fixed-step simulation and interpolated rendering.
- One large asteroid occupies the tactical environment, with a slow, randomly clockwise or counterclockwise spin.
- Select the mothership and choose **Deploy mining platform**: Linehorse collects one from storage, matches a rotating site, deploys it, and returns home. Platforms use the former mining-ship artwork and remain attached while extracting ore.
- The asteroid retains its physical size as ore is depleted; older multi-asteroid saves merge remaining ore into one large body.
- Platforms send ballistic ore packets every four tactical seconds. The mothership catches packets inside its 32 m/s relative-speed envelope.
- Mothership processes delivered ore into 1,500t depot sections.
- Canonical physical sizes, masses and thrust drive loaded acceleration and braking. See [physical units](PHYSICAL_UNITS.md) for calibration, conversions and save migration.
- Tug can carry fabricated depot sections from the mothership to the depot site.
- Utility haulers can retrieve persistent drone wrecks for salvage and carry disabled fighters home for repair.
- HUD ore quota, depot progress, construction section stock, and remaining asteroid ore readouts.
- Subtle parallax starfield below the grid.
- Acceleration-driven engine plumes with translucent envelopes, bright cores, and animated internal nodes. Fighters ignite sharply; industrial engines build more steadily. Fine plume detail drops out at distance.
- Visible mining platforms, travelling ore packets, and delivery feedback text.
- Move-order reticles, selection pulses, mothership running lights, and focus-selection camera key with visible focus feedback.
- Debug hostile-raider vignette with industrial target selection, escort range coverage, laser dwell, impacts, destruction fragments, very light final-hit shake, and final-kill slow motion.
- Simple threat director that warns, then sends raiders from beyond the local map once mining/construction activity exposes the operation.
- Offscreen inbound groups develop from faint, ambiguous `POSSIBLE` contacts through `TRACKING`, `RESOLVED` and `LOCAL` edge markers, progressively tightening bearing, source count and ETA before visual acquisition.
- Camera pan with middle mouse or Space + drag, plus mouse-wheel zoom.
- Semantic zoom: default proportions are preserved; small craft stay readable while close inspection reveals their size relative to the mothership and asteroids. Wheel zoom extends to 128×. Through 32×, the asteroid scales geometrically (keeping surface attachments aligned), other large bodies nearly geometrically, and small craft grow modestly on screen. Above 32×, artwork proportions hold steady and everything magnifies together, making craft four times longer at 128× than at 32×. These remain schematic proportions, not a literal physical hull scale. Movement and simulation distances remain unchanged.
- Versioned localStorage save/load of serializable game state.
- Stationary ESO night-sky backgrounds with developer-selectable imagery, pure black, and adjustable brightness.
- Toggleable stress mode that animates thousands of simple sprites.
- Opaque DOM HUD with a thin mission bar, an unobstructed tactical viewport, and a bottom shelf separating fleet, selection, local operations, and contextual commands. Entity count and measured FPS live in its developer menu.
- Prominent in-game mission clock with inline units (00h 00m 00s) and Pause, 1×, 2×, and 4× controls. Simulation, combat, and effects follow the selected speed; camera and selection remain usable while paused. Saves retain elapsed mission time; playback speed is session-only.
- Browser-native simulation tests at `./tests/`; the same suite runs headlessly with `node tests/run.cjs` (optional, no dependencies).
- Asteroid playground at `./tests/asteroid-playground.html`; every refresh creates twenty new seeded specimens using the production painter.

## Propellant, launchers, and mining platforms

- Mobile craft carry propellant mass. Acceleration uses current wet mass; engine velocity changes consume fuel using the rocket equation. Loaded ships have less remaining Δv. Empty ships coast.
- The fleet panel shows remaining Δv in m/s and lets you select craft stored inside the mothership. Selection details include fuel tonnes. New missions begin with Linehorse and both fighters docked internally; docked craft are hidden in the scene.
- Right-click the mothership or use **Return to mothership** in the selected craft's command panel to return deployed craft. Low-fuel craft automatically leave their current assignment when they reach a conservative return reserve. Return guidance allows a nonzero intercept velocity.
- Craft assigned a job emerge from the mothership over one second before normal guidance begins. The mothership catches craft within 44 world units and at up to 32 m/s relative velocity. Docking places craft inside and refills tanks; outbound emergence receives a free launcher impulse up to the same 32 m/s, subject to work-zone guidance and stopping distance.
- When raiders spawn, available docked fighters emerge into a mothership-centered skirmish formation and return inside after the last hostile is destroyed. Manually deployed fighters keep their assignments.
- Select **MSV Hardshell** in the fleet panel or scene, then choose **Deploy mining platform**. The idle blue cargo ship takes a platform and its first five workers to the asteroid. After matching position and velocity it spends fifteen physical minutes on EVA unstrapping, then the released rig finds a nearby free footprint, matches asteroid rotation, deploys its legs, descends from 50 m, and opens its ramps before three physical hours of setup and extraction. Repeat after it returns to deploy the second platform. The cargo ship can carry platform crews as well as its one platform, construction section, or recovered hull.
- Select Linehorse and right-click a deployed platform to retrieve it early. **End mining & recover** stops extraction and assigns the cargo ship to collect each platform in turn. Workers stay through the three-hour packing job, then ride home with the rig; the shuttle remains available for mid-mission shift changes. Dockside refueling and passenger/cargo transfer take five physical minutes. Packets already in flight continue.
- Old saves retire obsolete mining ships and the intermediate Carrier One/Two hulls, preserving their ore in mothership storage. Deployed platforms and in-flight packets persist. Stored platforms, fuel, and recovery progress survive saves.
- Save/Load retain pending deployment and mining/recovery phases. Reset replaces the saved world as well as the live mission. Mining controls remain visible; select the mothership to enable deployment when its cargo ship is available.

Tuning is intentionally provisional: engines use a 3,000 m/s effective exhaust velocity; tank capacities are 12 t for fighters and 450 t for the cargo ship. Propellant supply at the mothership is currently unlimited. The launcher/catcher is a gameplay abstraction: mothership recoil, stored launcher energy, structural load limits, gravity and orbital motion remain outside this slice. Propulsion math is isolated in src/propulsion.js; orders and platform lifecycle live in src/sim.js.

## No Build Pipeline

There is intentionally no required Node runtime, npm, package manager, TypeScript, Vite, bundler, transpiler, lockfile, or generated build output. The repository itself is the deployable static artifact.

The root `.nojekyll` file tells GitHub Pages to serve the repository directly,
without running its Markdown and source files through Jekyll. Keep it in the
published root.

All HTML entry points carry content hashes for local scripts, stylesheets and
images. Dynamic skybox manifests, reflection maps, feature images, ship textures,
portraits and the Aegis rig use the checked-in `src/asset-versions.js` map.
After editing browser code or assets, run `node tools/refresh-site-assets.cjs`
(the old `refresh-flight-assets.cjs` command remains an alias). Commit the updated
HTML and asset map together with the changed files. No build step is required.
`npm run check` rejects missing or stale versions and missing local HTML assets.
Local portrait-authoring result archives are excluded from the runtime map.
Configure the host to revalidate HTML (`Cache-Control: no-cache`) so visitors
receive the latest asset URLs. If the CDN ignores query strings in its cache
key, configure it to include them or invalidate affected assets when deploying.

## Run Locally

From the repository root:

```sh
python -m http.server 8000
```

Or use the tiny launcher for your platform:

```sh
serve.bat
./serve.sh
```

Then open:

- Game: http://localhost:8000/
- Tests: http://localhost:8000/tests/
- Asteroid playground: http://localhost:8000/tests/asteroid-playground.html
- 3D asteroid orbit viewer: http://localhost:8000/tests/asteroid-orbit.html (automatic camera orbit, drag/zoom, cutaway, surface walking, re-seeding, composition presets and geology sliders)
- 3D mothership study: http://localhost:8000/tests/mothership-orbit.html (orbit, zoom/pan, preset angles, machinery pause and animation scrubbing; uses the production model)

The game keeps the existing Pixi artwork by default. Open `?renderer=3d` to try
the rough 3D geometry prototype. **Cutaway** focuses the asteroid
and exposes its existing excavation geometry; **Orbit ↻** steps around it.
Hold **Alt** while dragging to orbit continuously, use middle-drag or
Space-drag to pan, and use the wheel to zoom about the cursor. **Top view** resets
the camera angle; **Underside** shows the lower surface. Alt-drag can orbit
through both hemispheres. **Overview** frames the fleet and asteroid together. Left-click
or box-drag selects craft (Shift adds/toggles); right-click issues the existing
context orders on the movement plane or the picked object. Fleet/HUD controls,
pause, saves, and the F/H/J/K controls remain available. Orbit angles are session
state; existing saves retain their planar camera position and zoom.

This first 3D pass demonstrates geometry, depth, and camera interaction. It has
directional shading rather than cast shadows, a fixed-resolution asteroid mesh,
basic combat effects, and placeholder models for the smaller craft. The mothership
preserves the existing rotating habitat, fixed bearing/spine, antenna and side
modules as real 3D surfaces. The asteroid now reuses the
original seeded composition, crater population, surface profile and procedural
material shader. Craters wrap around the complete body, with seamless rock
texture across the sides and poles; broad relief and crater bowls also shape the 3D mesh. The Pixi artwork study pages
continue to use the previous renderer. No additional runtime dependency or build
step is required.

The app uses ordinary scripts, not JavaScript modules. Serving over HTTP is still the recommended path because browser behavior around local files varies, and it matches GitHub Pages or any static host.

Debug controls:

- `F`: ease camera onto the selected ship or fleet and flash a focus reticle.
- `H`: manually add a hostile-raider wave; selected escorts show their coverage circle.
- `J`: disable a selected fighter to try a recovery mission without waiting for combat damage.
- `K`: spawn another friendly fighter near the mothership; repeat to build a larger wing.

Fighter defense controls:

- Select fighters and right-click empty space to defend that point. Two form a staggered wing, three a V, four a diamond, and larger groups a ring. Formations face the ordered destination.
- Wings assemble around a shared moving formation center, then travel together. Cruise speed follows the slowest active member with speed reserved for catching up; the center slows or waits when a wingmate falls behind. Fighters match the center's velocity and correct their slot error, arriving together instead of racing to separate destinations. Disabled or reassigned fighters no longer hold up their old group.
- Slot occupancy is approximate: each fighter has a stable 3–7 unit personal offset and a 6-unit steering deadband. Guidance speed and acceleration vary slightly per fighter within the hull's limits. Near combat, spacing eases to 1.65×, personal offsets widen, and tolerance grows to 30 units; range management takes priority over a gentle preference for the nominal slot. Slots remain assigned until membership changes or a new order, and the wing tightens gradually after threats leave.
- Formations are persistent internal groups with saved membership. When fighters are disabled or reassigned, survivors close into the appropriate smaller shape; empty groups are retired. Ordering the whole wing preserves its identity, while ordering a subset splits it off. New destinations take priority over lingering in the old engagement; local defense resumes on arrival.
- Moving wings ease through course changes up to 60°, with outside fighters taking wider arcs and gentle slot corrections underway. Stopped wings (below 15 units/second) and sharper turns blend rotation, position correction, and acceleration toward the destination without a group-wide pause. Slots are matched to nearby occupants when the shape changes, so reversing a diamond makes the rear fighter the front fighter without swapping their physical positions. Stragglers still catch up, final arrival brakes normally, and combat evasion takes priority over holding the shape.
- Combat steering aims for about 260 units of range (raiders fire at 220; fighters at 280). Fighters account for closing velocity and braking time, compare short-term escape directions against every nearby enemy, and turn along the leash before crossing it. Avoiding incoming fire takes priority over formation occupancy; weapons favor close threats and enemies already under sustained fire.
- Right-click another, unselected friendly ship to escort it in a looser formation. Its position becomes the moving defense anchor.
- Fighters prioritize threats near the anchor, kite and orbit in weapon range, separate from nearby fighters, and return to their formation when threats leave. At the leash boundary they slide sideways instead of retreating farther.
- Selected fighters show weapon range and a faint operating-area circle with a cross at the anchor. The hard-coded group leash is `FIGHTER_LEASH` in `src/sim.js`: currently 700 simulation units, or 2.5 times weapon range. There is no tuning UI yet.
- Defense orders, formation slots, hostile encounters, and director/weapon timers survive saves. Use `K` to build a wing, box-select it, right-click a defense point, then press `H` to try combat.

Construction controls:

- Deliver ore to the mothership until a depot section is ready.
- Select `Linehorse`, then right-click the depot ghost to carry a ready section to the site.
- Once mining or construction is underway, contacts can appear automatically after a warning.

Recovery controls:

- Select `Linehorse` and right-click a faded drone wreck or disabled fighter to retrieve it.
- Select `Linehorse` and choose **Salvage all** to explicitly send it on repeated recovery trips for every available wreck and disabled fighter. This is a player-controlled command; it does not start on its own. Right-click home to send it back and cancel the run.
- The hauler matches the target's position and velocity, spends fifteen physical minutes with an EVA pair securing it, clamps the hull beneath its frame, and returns automatically with acceleration determined by combined mass. One module or recovered hull at a time.
- Wrecks provide 24t ore at the mothership, feeding the existing construction processing chain.
- Platform and depot-section release, and platform or hull pickup, use a fifteen-physical-minute matched rendezvous with visible EVA handling.
- Disabled fighters stay inert and cannot fire. Retrieval starts a six-second repair inside the mothership, followed by a slow six-second launch from its forward end. The restored fighter awaits orders once clear.
- Move orders can redirect a loaded hauler; right-click the mothership to resume delivery.
- Wrecks, carried hulls, damage, repair progress, and active hostile encounters are included in saves.

## Reproduce a gameplay bug

Pause and click **Export scenario** to copy or download the current world as JSON.
Add commands, a tick count, and expected results, then run
`node tests/scenarios.cjs path/to/scenario.json`. Place permanent regressions in
`tests/scenarios/` to include them in `npm run check`.
See [scenario replay](docs/scenarios.md) for the format and examples.
Entire battles run headlessly at 30 Hz; visual effects and audio observe simulation events.

## Deploy

Deploy the repository contents directly as a static site, including to GitHub Pages. All application URLs are relative, so the game can run from a domain root or a repository subpath.

## Vendored Runtime

PixiJS is vendored at `vendor/pixi/pixi.min.js`.

- Version: PixiJS 7.4.2
- Source: `https://cdn.jsdelivr.net/npm/pixi.js@7.4.2/dist/pixi.min.js`
- License: MIT, copied to `vendor/pixi/LICENSE` from the PixiJS 7.4.2 repository tag.

The game does not load code, fonts, art, telemetry, or other runtime resources from the network.

## Browser Assumptions

- Ordinary browser scripts loaded in explicit order.
- Canvas/WebGL support through PixiJS.
- `localStorage`.
- Pointer events.
- `requestAnimationFrame`.

## Next Vertical-Slice Milestone

The next milestone is pressure and consequence: add a simple extraction timer, a director-triggered pirate warning/attack, and persistent damage/cargo/money changes after the mining operation ends.

### People and platform shifts

The mothership starts with 10,000 residents. Select a craft in the fleet and click
a crew name to inspect their location, duty time, and service history. Select the
mothership to inspect workers on deployed platforms. Named people persist in saves.

A small white shuttle automatically carries one pilot and up to five passengers
for mid-mission shift changes. The first platform crew rides to the site in
Linehorse, and the last shift stays to pack and ride home with the rig. Platform
setup and packing each take three physical hours; mining starts only after setup.
Shifts last eight physical hours, with delayed replacements leaving the current
crew working overtime. Shuttle selection is for inspection, not manual flight orders.

Save/Load now preserve the population and tactical mission together; old saves
receive crews automatically. Reset starts a new population and mission.


### Experiments index

Open [the experiments index](experiments/) for the flight lab, both game renderers,
and the artwork viewers. The main game links to it under Menu; the flight lab
also links back to it.

### Arcade flight experiment

Open [the flight lab](experiments/flight.html) from the same static server.

For the Aegis capital-ship sandbox, open [Aegis live batteries](experiments/flight.html?aegis=1).
Fly between allied and red dreadnaughts slowly maneuvering and exchanging heavy
salvos. Their small point-defense turrets engage opposing fighters. Each ship
retains its designed 1,305 m length. W/S adjusts throttle, Space fires, and Esc
pauses. Heavy hull hits produce fighter-style explosions and reduce capital
integrity; coarse collision proxies stop hull crossings. The [kit and rig reference](docs/dreadnaught-kit.md)
describes this prototype's scope and asset generation.
The flight-input selector is visible above Start/Resume. If the browser rejects
mouse capture, mouse mode uses cursor steering: move away from screen center to
turn and return to center to stop turning. Esc or leaving the flight area pauses.
The [mission selector](experiments/missions.html) links to separate flight sorties.
Asteroid patrol places exactly two hostiles near a randomized asteroid; clearing
both completes the mission without spawning another wave. Restart keeps the same
asteroid, while reloading the page generates another.

The flight HUD groups objectives, shield/hull bars, speed/thrust, and weapon status around an open center. Player integrity and the target camera use matching stacked blue shield and green hull meters, with amber damaged hull and red critical hull. Comms subtitles sit above the radar. Animated crew portraits use green phosphor, scanlines and randomized radio interference synchronized with audio, with longer opening/closing squelch and a hard portrait cutoff. The selected target has stacked, fixed screen-size blue shield and green hull bars below its range label (amber when damaged, red at critical hull), dark empty tracks, half-second damage trails, and a brief shield-collapse flash. When offscreen, the selected target has a large filled gold edge arrow and a gold double chevron near the crosshair pointing toward it; other contacts retain small outline arrows. The bearing cues disappear when the target returns inside the HUD view. It has gold corner brackets and an upper-right live model monitor with range and hull; Aim the center crosshair over a ship to select it automatically; empty space retains the last selection. **L** or controller **X / Square** toggles target lock, holding the selection until unlocked or destroyed. **Tab** cycles enemies and unlocks. The pause screen lists keyboard, mouse, controller, and flight-stick controls. The monitor tracks target aspect at 15 FPS. Pilots have recurring callsigns (Rook, Jinx, Viper, and others), shared by comms, spoken references, and target labels; each keeps the same voice across waves. Press **F3** to toggle lab controls and diagnostics; the comms history and independent dialogue-size slider are in that panel. History keeps the latest 12 transmissions for the current page session.
This separate cockpit experiment reuses the production 3D asteroid and background.
Choose from 35 Terran, Vasudan and Shivan fighter/bomber stat profiles, including the original Hercules and Mk II, Horus, Thoth, Mara, Dragon and Basilisk.
The maneuver values are extracted exactly from the installed retail FreeSpace 2
`Root_fs2.vp` / `ships.tbl`; `experiments/retail-profiles.js` records those numeric
fields and the source table hash. Hercules means the original Hercules, not Mk II.

Click **Fly / resume**. W/S raises/lowers throttle, X cuts throttle and brakes,
Shift holds afterburner, arrows pitch/yaw, Q/E roll.
The original four profiles have zero lateral/reverse speeds. Alien profiles preserve their table capabilities, but current pilots and normal controls continue to use forward dogfighting rather than lateral aiming. Captured mouse movement steers. Escape, losing focus, or hiding the tab pauses flight.
Keys 1–4 select profiles and reset the starting pose; changing the dropdown also
resets it. After using a form control, click Fly to return to flight input.
Reset stops the craft facing the asteroid. The diameter control (200–4,000 m)
resets the range to compare scale; it defaults to 2,500 m. Surface contact stops
the craft with a 5 m clearance. Asteroid impacts provide visual feedback without terrain damage or excavation.

`experiments/retail-profiles.js` preserves max velocity vectors, rear velocity,
rotation times (pitch/yaw/roll seconds per revolution), forward and slide accel/
decel time constants, damping, rotational damping, afterburner velocity/accel,
and engine-overclock speed. Normal flight uses standard engine power; overclock
is recorded but there is no energy-transfer control yet. Afterburner is unlimited
for handling tests; fuel capacity and recharge are outside this experiment.

The flight model uses exponential engine ramps, rotational damping and lateral
slip damping, including automatic bank with yaw. These are time constants, not
constant m/s² accelerations. It reproduces the ordinary-flight response equations;
it is not a complete port of FreeSpace's input, collision, or energy systems.
Distance uses the existing meters-per-unit conversion with real elapsed seconds,
independent of the tactical simulation clock. The lab never loads or writes saves.

The numerical data comes from the local retail installation; response semantics
were checked against the [FS Open physics implementation](https://github.com/scp-fs2open/fs2open.github.com/blob/master/code/physics/physics.cpp).
No FreeSpace artwork or audio is imported.

The flight lab sky is an environment at infinity using the local ESO Milky Way
panorama and seeded stars. It follows pitch, yaw and roll with the same perspective
as the asteroid, providing orientation cues even when the asteroid is off screen.
Translation leaves the sky fixed in world directions.


Hold Space or right mouse to fire the selected primary bank; G switches banks.
The primary-bank selector follows each ship's retail default weapon order:
Ulysses/Hercules use Subach HL-7 then Prometheus R, Myrmidon reverses that order,
and Medusa uses Prometheus R. Both weapons travel at 450 m/s for 2 seconds
(900 m); fire intervals are 0.20 s and 0.45 s. Numeric weapon fields, including
bolt length/radii, damage factors and energy cost, are extracted directly into
`experiments/retail-weapons.js` with the retail table hash. Damage factors are used by training combat;
weapon energy remains unlimited. The expanded catalog has ten bolt weapons; the selector starts with the ship's first supported retail primary, then offers sandbox overrides. Both sides now receive their own class hull/shield capacity, with symmetric pooled shields and Driftworks recharge rules. See [retail loadouts](docs/retail-flight-loadouts.md) for exact provenance and adaptation limits.
In normal flight, the allied/enemy hull selectors change both the displayed model and its triangle collision hull, including new waves. AI watch and headless tests use the same triangle collision rules. Watch hull changes restart the duel; replays and study links record the model IDs.

Each ship fires from the visible model's reviewed muzzle locations. Volley size follows those sockets, and fire rate scales to preserve the imported loadout's sustained DPS (six retail guns moved to two muzzles fire three times as often). Muzzles converge on the nearest hostile hull under the crosshair within weapon range, falling back to 300 m ahead when aiming into empty space. At point-blank range the launch positions retract behind the aimed surface. Both player and AI craft share these rules.
Bolts use fixed world speed (retail non-additive velocity), never hitscan, and
swept terrain contact. Sounds reuse Driftworks' synthesized gun/impact effects.

The flight range also parks the production mothership 900 m east and 1,800 m
north of the asteroid center (about 2 km separation). Its habitat animates while
flight is active; the HUD reports distance to its center. It is a visual fly-around
landmark in this prototype, without a ship collider or damage model.


Flight input defaults to **Captured mouse + keyboard**. Click Fly to capture the
pointer; move the mouse to steer and hold either mouse button to fire. Escape
pauses and releases the pointer. Capture loss, blur and hiding the tab also pause.
The configuration panel hides while captured. Mouse sensitivity is adjustable;
turn rates still obey each ship's maneuvering limits. If capture is unavailable,
select **Controller / keyboard** to fly without capturing the pointer.

The **Gamepad / joystick setup** section detects devices exposed by the browser's
Gamepad API; press a device button if it hasn't appeared. Standard gamepads use
left-stick pitch/yaw, right-stick X roll, D-pad up/down throttle, RT fire, A boost,
Y switch bank and Start pause. Nonstandard joysticks default to axes 0/1 for
yaw/pitch, axis 2 roll and axis 3 throttle, with buttons 0/1/2/7 for fire/boost/
bank/pause. Select the device and remap any axis/button, invert axes and adjust
the deadzone using live values. Axis throttle is absolute; choose None to use
keyboard/D-pad throttle instead. Mappings are session-local. Resume requires the
Fly button; controllers cannot silently resume a paused game. Losing the active
device pauses. Hardware support depends on what the browser exposes.

Pointer capture was rejected by the Codex in-app browser during automated
verification. If it also refuses your click, open this same local page in a
browser that supports pointer lock, or use Controller / keyboard mode.


### Flight training arcade

The bottom-center radar follows your ship's heading and roll: forward is up,
aft is down, and vertical stems show contacts above or below your flight plane.
Red dots are hostiles, green dots are allies, and a gold ring marks the Tab-selected
target. Gray and blue squares mark the asteroid and mothership centers.
Press **V** to cycle the spherical detection range through 1, 2.5, 5 (default),
and 10 km. Contacts outside that range disappear; the radar also works in free flight.

The flight lab now starts training waves three seconds after flight resumes.
Wave 1 contains three simple orange fighters; later waves grow to a maximum of
six. Destroy the wave and the next arrives after five seconds. **Tab** cycles
targets. Brackets identify enemies; the dashed cyan circle is a projectile lead
cue. Off-screen chevrons point toward contacts (sensor markers can show through
terrain). Shield/hull and kills appear at the top left. Escape pauses everything
and restores the configuration panel. **Restart training** resets the run; turn
off **Training waves** for the original free-flight range. Reset, changing ship
profiles, and changing asteroid diameter also restart the range.

Training uses common player shields (120), hull (100), and enemy hull (90), not
retail ship durability. Shields recover after seven seconds without a hit; hull
damage persists. Player destruction ends the run until Restart. Weapon damage
and shield/armor factors use the extracted retail weapon values. Enemy bolts
and player bolts use the same swept triangle hull hits and ballistic timing in
the flight lab. Standalone legacy training fixtures retain sphere hit shapes. Asteroid terrain blocks shots; the mothership remains
scenery without collision or damage. No friendly fire or ramming damage yet.

At most two enemies hold attack slots. The others reposition; pilots commit to
attack runs, break away at close range, recover, and evade when damaged. Rookie,
veteran and ace pilots differ in decision interval and target prediction, rather
than hull inflation. All use the existing retail flight profiles and ordinary
flight controls; enemy steering also avoids the asteroid and nearby craft.
This is an independent, deliberately forgiving AI starting point inspired by
[FreeSpace's combat behavior inventory](https://github.com/scp-fs2open/fs2open.github.com/blob/master/code/ai/aicode.cpp)
and [Reynolds' steering behaviors](https://www.red3d.com/cwr/steer/), not an exact
port of FreeSpace AI or its difficulty tables. Pilot labels describe these lab
profiles. There are no external runtime dependencies or tactical-save changes.


### Flight renderer profiling

Open **Renderer diagnostics** in the flight lab. **P** toggles the debug overlay:
rolling FPS/frame time and p95 (120 samples), worst interval since reset, CPU work,
scene submission time, draw calls, submitted triangles, unique drawn GPU meshes,
material variants, actual WebGL dimensions and effective pixel ratio. Sky draws
and points are included. Materials are finish/color variants in the custom
renderer, not separate shader programs. GPU execution time is not measured;
CPU submission can stay cheap while fragment work keeps the GPU busy.

In the Aegis encounter, F3 > **Benchmark Aegis on / off** compares rendering of
the same frozen scene with and without the capital ship. Flight stays paused
afterwards. For the scripted CPU comparison and measurement limits, see
[Aegis benchmarks](docs/dreadnaught-kit.md#repeatable-performance-comparison).

Flight is capped at 60 FPS by default (30 and uncapped comparison options exist).
Paused rendering is capped at 15 FPS. The cap only schedules frames; flight,
weapons and AI continue to use real elapsed time with their existing substeps.
Long frame intervals are measured before the simulation's 0.1 s stall clamp.

For a controlled comparison, turn training waves off, hold a fixed viewpoint,
and use Reset measurements after warm-up. Compare Production artwork against:
Empty space (scene and sky draws disabled), Simple boxes (asteroid/mothership
geometry), Flat unlit materials (procedural fragment shading bypassed), 50%
resolution (half width/height, approximately one quarter of the pixels), and the
mothership/enemy-model visibility switches. These switches change drawing,
not gameplay or collision. Sky and scene use the same resolution multiplier.
There are no dynamic shadow passes in this renderer.

An initial local-browser sample at 1598 x 1191 showed 12 draws / 156,562 submitted
triangles, including the sky. Hiding the mothership reduced that to 3 draws /
125,670 triangles. Simple boxes submitted 4 draws / 26 triangles; Empty space
submitted zero. These are one-view counts, not GPU timings or universal budgets.
A close-surface sample submitted 31 draws / 195,622 triangles and ran near the
60 FPS cap; flat shading also reached the cap. These samples do not establish a
GPU bottleneck. A GPU trace or comparisons on the affected hardware are needed
before deciding to simplify models or shaders.

The [ship pack inspection](experiments/ship-packs.html) shows the Quaternius ship library; choose imported enemy artwork in the paused flight lab. The viewer and flight lab use original Quaternius textures, with original archives, licenses and provenance under `assets/ships/`.

The [character and animation viewer](experiments/characters.html) inspects the Quaternius Astronaut and Standard Universal Animation Libraries 1 and 2. Choose a model and animation, pause or scrub playback, adjust speed, and toggle its skeleton. All six glTF/GLB exports load locally with original materials and rigs. Authoring formats, license evidence, and SHA-256 provenance are under `assets/characters/`; see its README for rebuilding the catalog. The astronaut includes 24 animations and reversible suit/trim color swaps with four crew palettes plus custom colors. The body selector offers balanced and short feminine silhouettes, short/sturdy, tall, slight and broad builds, combinable with every palette. Continuous sliders control height, hips, waist/belly width, shoulders, torso depth and chest volume. Stress presets push pronounced feminine, short (60%), tall (145%) and heavy silhouettes beyond typical proportions. Crew mode defaults to conservative limits on each control plus coupled waist/hip, shoulder/hip and combined chest/depth changes. Its height range is 70–130% of the source; this scales the whole person and suit, rather than changing limb ratios. A pronounced feminine and a fuller build are included for visual review. Stress mode retains the wide ranges and extreme presets separately. Random crew samples correlated continuous values within the crew guardrails; Random extremes samples the full slider ranges. These are artistic ranges, not anthropometric percentiles. Reset view refits the current shape; the camera stays fixed during edits for size comparison. These are reversible rest-mesh edits with unchanged skin weights, joint positions and source clips; height uniformly scales an outer group containing both mesh and rig. Helmet, boots and wrists keep their source shape. Inspect motion with the skeleton toggle and clip scrubber before adopting a variant; these are viewer prototypes, not exported GLBs. Library root-motion variants are preserved; applying library clips to other rigs requires retargeting. These assets are available for inspection and future use, with no gameplay changes.

Flight lab starts paused with a centered Start flight button; Esc brings back Resume flight. You begin at full cruise above the asteroid, facing the already assembled combat wings. W/S adjusts throttle and X stops. Flight lab defaults to a green allied wing versus a red enemy wing (8 vs 8). Select each wing's imported artwork while paused. Pilots dogfight each other; your shots spare allies, and Tab targets enemies. A defeated wing starts a new round after five seconds. Use Combat scenario to return to solo training.

To watch the testing AIs, use **AI DUEL / WATCH PILOT** in the flight lab. Select Perfect AI or a human simulator flavor, choose a starting geometry, opponent skill and seed, and press Play. Chase/cockpit cameras, half/quarter-speed playback, pause and deterministic restart let you inspect the actual control inputs without steering the ship yourself. These are one-on-one open-space benchmark duels with selectable retail ship/weapon stats, class shields for both pilots, and selected ship models whose triangle hulls are used for collision. Changing a hull restarts the duel. The existing opponent maneuver policy is retained. Select Fly manually to return to ordinary flight. See [flight AI validation](docs/flight-ai-validation.md) for the testing policies and limitations.

### Mumble voice lab

Open `experiments/mumble.html` from the local server for a standalone procedural
voice preview. Enter speaks the line; Shift+Enter inserts a newline. Choose a
character and delivery, then adjust pitch, resonance, speaking rate, expression,
rasp, slow voice tremor, breathiness, volume, seed, and enunciation. Lower enunciation
(default 0.35, labeled Sound retention) drops interior syllables and consonant
attacks, keeping a sparse first/last vowel signature. Skipped sounds take no
audio time. Short word-level timing budgets keep long words from dragging. Raise it to 1 for full articulation. Stop interrupts playback.
The chosen voice is now the default: popping vowel groups with compact word
rhythm. Vowel groups retain spelling cues (oo, ee, ou, etc.), voiced bursts stop
within 75 ms, word timing varies, and function words pass quickly. Commas use
40% of their original pause; sentence-ending punctuation keeps its original pause.
The A/B selector has been removed. Vowel test line inserts a comparison phrase.
`analyze` defaults `compactWords` to true and `pauseScale` to 1. `render` defaults
to the chosen `vowel-groups` style. Legacy `original` and `flowing` styles remain
available explicitly through render options for development comparisons.
Rendering does not mutate the plan.
Controls apply on the next playback; text is limited to 600 characters.

`experiments/mumble.js` exposes `window.Driftworks.mumble`: `analyze(text, options)`
returns JSON-safe syllable/pause events with seconds-based `start`/`duration` and
UTF-16 `from`/`to` reveal offsets (including skipped text), plus `sourceFrom`/
`sourceTo` offsets identifying the syllable actually voiced; `render(plan, sampleRate = 22050)` returns mono
Float32 PCM. Both are deterministic for the same input and settings. Analysis
uses approximate Latin vowel groups, with a fallback for other scripts, rather
than pronunciation rules. The renderer uses moving harmonic vowel formants, consonant closures, noisy
consonant attacks, and punctuation-shaped pitch and pauses. Questions rise, statements settle gently,
and exclamations keep an energetic finish. Phrase-wide pitch arcs rise and fall
across words; each syllable carries a three-point `pitchCurve` in Hz that the
renderer interpolates continuously, with punctuation starting a fresh gesture. The preview owns
Web Audio playback and text/mouth synchronization. No assets, network services,
AudioWorklet, build step, or game audio changes are needed.

The flight lab pause screen has a Settings button with three remembered mouse steering presets: Original · linear (160 px maximum radius, original linear response), Medium · softened (the default: 240 px maximum radius, power-1.6 response), and Wide · linear. Switching presets centers the stick and keeps flight paused. Flight lab mouse steering uses a persistent virtual joystick: displacement from screen center sets pitch/yaw demand, with a radial deadzone and limit. With the Wide · linear preset, full travel uses a radius of 45% of the shorter viewport dimension, scaled by the sensitivity slider. The circle and stick indicator extend behind the HUD panels; the center-to-stick line shows steering direction even when a panel obscures the dot. Beyond the 8% radial deadzone, turn demand increases linearly to full authority at the edge, with equal response increments throughout the outer travel. The stick holds when the mouse stops moving. Move back to center or press C to neutralize; pause, reset, or resume also centers it. Esc pauses and releases capture. The HUD shows stick position and travel. Moving a mapped controller stick hides the mouse guide and centers the stored mouse offset; moving the captured mouse shows it again. Controller noise inside the deadzone and unchanged held sticks do not take the guide back. Under pause Settings → Controller, standard dual-stick controllers show a fixed layout: left stick pitch/yaw, right stick horizontal roll, right stick up/down increase/decrease throttle, neutral holds throttle. Full deflection traverses the throttle range in two seconds; partial deflection changes it more slowly. D-pad up/down also adjusts throttle. Other joysticks retain device bindings.

Mumble presets include Scout, Veteran, Navigator, warm/bright women, baritone man,
Child, Old woman, Old man, Pirate, Ship computer, and Alien. Each combines pitch,
vocal resonance, texture, and pace. Older voices add a continuous 2 Hz pitch tremor
(`tremor`, 0–1, default 0); it follows utterance time rather than restarting on each
syllable. All presets keep the chosen popping synthesis and compact word rhythm.

Transmission selects Local (default, clean playback) or Radio (band-limited voice,
faint static, 160 ms opening crackle/carrier and 240 ms closing carrier/latch). This is independent
of character presets. `transmit(pcm, sampleRate,
{mode: "radio", volume, seed, effects})` returns `{samples, speechOffset, duration}` without
mutating speech PCM. The preview offsets subtitles/mouth timing by `speechOffset`;
Stop cancels the entire transmission. Effects follow volume, including mute.

Radio effects level adjusts static and squelch independently of voice (0–1,
default 0.65). Zero disables the noise effects while retaining radio filtering.

Test radio effects only plays the opening burst, half a second of static, and the
closing burst without speech, at the current voice volume and radio effects level.
Radio noise is concentrated in the midrange with a short chirping squelch.

The radio carrier hangs for 120 ms after speech before the closing latch, then
switches off with a 3 ms edge ramp. Opening and closing latches use keyed 28 ms
noise crackles and short mechanical contact clicks, not vocal swells or vowel
formants. A steady carrier is stronger during the bookends.

For radio, the preview supplies `speechDuration` to `transmit` at the end of the
last voiced burst, excluding trailing punctuation silence. Closing static starts
immediately there; pauses inside the line remain intact. Local timing is unchanged.

The flight lab has a lower-left comms panel with control chatter, wingmate calls,
and hostile taunts using local mumble voices and radio effects. Lines begin after
four active flight seconds, then ambient chatter is spaced 18-30 seconds apart.
AI maneuver changes, firing runs, and target switches trigger short pilot
callouts. Clear-channel gaps vary from roughly one to four seconds; distress
takes priority, speakers take turns, and each pilot has a ten-second cooldown. Pause stops
speech; **Voice on/off** mutes speech while keeping subtitles.

Comms favors a varied account of the fight: activity types get airtime before
pilots are chosen, and recently repeated activities get less weight and longer
cooldowns. Attack and firing share a budget so shooting cannot crowd out the
other maneuvers just because more pilots are doing it.

Pilots can answer cover requests: a wingmate engaging the caller's attacker
may reply with a covering call. Replies require actual fire or movement toward
that attacker; requests expire when the threat changes or after 14 flight seconds.

The fight radio also reacts to wing losses, credited kills, near misses, player
shield depletion, badly damaged hulls, shaken pursuit, missed firing passes,
rapid player kills, changing odds, and remaining hostiles. Calls can include
pilot numbers, live counts, and relative closing speeds in meters per second.
Numbers are expanded into spoken words before whole-sentence mumble synthesis.
AI fighters have hull health only: their damage calls do not claim shields.

Contact reports call out newly acquired hostiles using your ship's facing:
clock directions, ahead/behind, left/right, high/low, and rounded meter ranges.
Position reports have a separate airtime limit and refresh their geometry before
speaking. Later updates require a changed sector or range after 30 seconds.

A transmitting pilot gets a white ring around their radar blip and on-screen
ship marker (or off-screen direction arrow). The ring follows the transmission,
including muted subtitle calls, and clears on pause or reset.

Radio line selection remembers the last 24 transmissions across all pilots,
favoring unheard wording and then older, less-repeated lines. Template history
also counts: changing a pilot number or range does not make a repeated phrase new.

The ship inspection viewer now defaults to Quaternius Striker with original glTF base-color texture, UVs and normals; both inspection and flight use the original source appearance. The offline converter reads the archived self-contained glTF 2.0 triangle exports and writes inspection vertex data plus local PNGs in `textures/`. This supports these single-mesh exports, not general glTF/GLB, scene transforms, animation, or full PBR. Flight uses the same source textures, UVs and normals, grouping ships by model and texture. Deployment still uses only relative local assets and needs no build.

Voice lab timbre controls: `formant1/2/3` independently scale vowel resonances
(0.7–1.3, default 1). `brightness` tilts harmonic energy (0–1, default 0.5);
Rendered utterances receive one fixed RMS gain (target 0.12 times volume),
with peak headroom capped at 0.95 times volume. This matches levels across voice
textures while preserving within-line dynamics and the volume control.
`nasality` adds a 300 Hz pole and 1100 Hz notch; `creak` alternates glottal
pulse strength; `clipping` shortens audible bursts without changing reveal timing.
These last three range from 0–1 and default to 0. `contour` (0–1, default 0.5)
scales phrase gestures; zero expression and zero contour give a flat pitch curve.
The three Study presets share a 150 Hz fundamental: dark smooth, nasal clipped,
and raspy creak. Compare the same line and seed in Local, then Radio, to judge
perceptual separation. Presets are starting points for listening, not validated
speaker identities. Old serialized plans receive neutral defaults when rendered.

Furball radio assigns 16 curated adult pilot voices by craft index, with four
masculine and four feminine voices in each wing. Pitch, independent formants,
brightness, nasality, rasp, breath, creak, pace, and contour vary across the cast;
no child or elderly presets are used. Voice settings and synthesis seed remain
stable across lines and rounds. Emotion modifies delivery over that identity,
and output level matching applies to the whole cast. Control retains a separate
steady voice. `flightComms.pilotVoice(craft)` returns a fresh settings object;
radio lines carry `voiceSettings` and the matching stable `seed` for playback.

Radio latches vary in duration, irregular crackle segments, strength, and click frequency.
The radio-only lab test runs for six seconds; repeat it to compare clean and noisy takes.
Occasional 25-120 ms static bursts interrupt transmissions (60% of takes have no bursts; the remainder
use exponential random gaps averaging about 2.2 seconds). Radio effects level controls both; clean Local
playback is unaffected. Each preview take and furball transmission uses a separate
radio seed from the stable voice seed. `transmit` remains deterministic for a
fixed seed; `staticBursts: false` disables intermittent bursts for comparisons.
Bookend timing and subtitle offsets remain fixed.

- 3D mining platform study: http://localhost:8000/tests/mining-platform-orbit.html (four simultaneous pod views: fixed side/front/top and interactive raised orbit; terrain-fitted anchors and ramps; **Play landing - 50 m** finds a safe nearby site, matches slow asteroid rotation, translates, unfolds legs, descends to contact, then opens ground-limited ramps. Gameplay uses the same terrain solver and fitted rig geometry in both renderers. Pause/resume, replay, or return to Manual study).

- Excavation geometry study: http://localhost:8000/tests/excavation-study.html (entrance, tunnel and irregular chamber; inspect the intact roof or cutaway and adjust chamber size in meters).
- Production mining contact regression: http://localhost:8000/tests/mining-platform-gameplay.html (actual world platforms; scrub landing time, rotate the asteroid, orbit and zoom; append `?renderer=2d` to check the Pixi projection).

### Flight joystick controls

In `experiments/flight.html`, open **Settings > Joystick / controller** and select your device. Choose **Joystick / controller / keyboard** for stick steering. Thrustmaster and generic USB sticks default to pull-back pitch, lateral roll, twist yaw, and absolute throttle. Trigger fires; zero-based buttons 1, 2, and 7 boost, change weapon bank, and pause. Remap axes and buttons using the live readout to identify twist and throttle on your hardware; inversion and deadzone are adjustable. Bindings are saved per device in localStorage. Standard gamepads retain their existing layout. Press a device button to expose it to the browser; disconnection pauses flight.

Controller rumble can be toggled in the same settings panel (remembered locally). Supported gamepads provide light afterburner vibration, brief weapon recoil, incoming-hit jolts, stronger shield-break pulses, and surface-contact bumps. Effects stop on pause, focus loss, reset, device changes, or disconnect; unsupported haptics are ignored.

The [combat research page](experiments/flight-study.html) runs batches of headless fighter duels and generates downloadable reports. See [combat study design](docs/combat-research.md) for interpretation and limits.


### Tether greybox flight study

Open `experiments/flight.html?tether=100&start=hub` (also linked from the experiments index). Choose 100, 50, 20, 10 or 2 km full tip-to-tip span and a hub, tip or overview start. Existing flight controls and real-second flight speeds apply. The greyboxes use a 4 m cable, 100 m hub and 40 m tip blocks with open catcher frames. They default to 1 g tip acceleration, selectable up to 2 g or 3 g; this is a visual scale study, without tether collisions, capture physics, orbital dynamics or engineering sizing. The readout shows hub distance, tip speed, tip acceleration, rotation period and a straight full-span transit estimate at current speed, excluding acceleration. Thin cables can disappear below a pixel at long distances.

Operational spin assumes a symmetric hub at midspan: radius = span / 2, tip speed = sqrt(loadG * 9.80665 * radius), angular speed = tip speed / radius, and period = 2 pi / angular speed. The study defaults to 1 g tip acceleration, with 2 g and 3 g options (`spin=1g`, `spin=2g`, `spin=3g`). Old or invalid spin parameters fall back to 1 g. No material, taper, payload mass or safety-factor feasibility is calculated. Tether resets zero the local flight clock so tip starts align at phase zero; pausing freezes rotation. Rotation uses the real flight elapsed clock even with combat disabled.

### Fleet greybox bench

Open `experiments/fleet-greybox.html` to develop the fighter, six-fighter pocket carrier, and patrol ship together. Inspect the fleet at relative scale or focus on one hull; breadth, armor depth, engine spread and identification stripes apply across the family. The carrier shows full-size embarked fighters in an open bay. These are provisional visual studies, separate from gameplay ship definitions; dimensions and bay layout do not establish docking or combat rules.

Preview target shield/hull bars without flying at [target status preview](experiments/target-status.html), with actual-size and enlarged views, backdrop controls, and damage/collapse buttons.

Engine sound tuning: open [Engine sound lab](experiments/engine-lab.html) for eight procedural voices, cockpit/exterior listening, layer controls, A/B mixes, JSON recipes, and a repeatable flight audition. Use **Use this mix in flight**, then reload flight to apply the locally saved mix. Audio tuning adds no controller vibration.

Flight **Settings / Sound balance** offers engine, weapons, impacts, comms and overall effects levels. Comms briefly lower engine/guns; hits briefly lower the engine. Disable **Prioritize comms and impacts** for a fixed mix. Levels are remembered locally.

### Barracuda fighter greybox

Open `experiments/fighter-greybox.html` for the provisional Barracuda: a snug side-by-side cockpit on the fuselage centerline, gently tapered, full aft body and three integrated engines in an equilateral rear triangle. Its full-height rear connection, raised cannon within a low cockpit center console and smooth exterior keep the profile compact for narrow hatches. The readout reports the actual complete length, beam and height (11.7 by 2.3 by 2.2 m at defaults); a particular hatch fit is not simulated. The earlier fleet bench remains an independent idea study.

The faceted wraparound canopy has roof and rear-quarter glazing, thin bows, a sloped windscreen and low nose windows. Two seated astronauts in local placeholder chairs retain their physical size as the hull changes. Seat spacing is 1.1 m and the default canopy is roughly 2.0 by 2.2 m. Minimum cockpit breadth preserves chair clearance.

Side, front, top and orbit panels have independent cameras, Reset views and a toggleable 12 m Spitfire reference shared with the mining rig study. Crew close-up targets the orbit panel; shape controls update all four.

The Barracuda study also offers independently toggleable starfield skybox and asteroid surface context. Each skybox follows its panel camera; both comparison hull centerlines are placed 5 m above the asteroid's highest terrain point, preserving their physical scale. Turning the asteroid on or off resets views to the new reference height.

Fighter-study wheel zoom preserves the current subject plane even with the asteroid enabled. Use Pick focus or double-click a surface to deliberately change the focus target. Reset views restores the hull comparison.

Barracuda's rear engine pack has two nozzles above and one below. Engine triangle spacing varies the equilateral layout without stretching it with the hull sliders. The lower engine sits forward of the upper pair (about 1.4 m in shortened A), with enlarged housings separated by a 4 cm nominal gap. The default pack keeps the compact study envelope; Rear / engines gives a direct inspection view. Carrier hatch dimensions remain provisional.

Open `experiments/fighter-variants.html` to compare Barracuda A-E at a shared camera scale: baseline, half-length wide body, oversized aft engine block, short four-engine body, and twin longitudinal hulls. All five ships occupy one shared scene with one renderer and camera. Top, front and three-quarter buttons frame the whole lineup without reloading; each variant also opens in the full four-view study.

Variant A now shortens the original overall length by 25% through the aft hull, retains human-scale crew with seat backs 2 cm ahead of the rear cockpit bulkhead, and uses a wider, blunter glazed nose. B-E remain alternative studies of the original proportions.

Open [Comms channel lab](experiments/comms-lab.html) to audition the eight crew portraits with animated mouths, local Mumble radio speech, phosphor tint and scanlines. Transmit line starts one synchronized transmission; radio effects apply to the next line. A shared radio noise plan drives audio squelch/static and visual interference, followed by a hard picture/audio cutoff. Stop cancels playback; mute leaves the picture moving. Reduced-motion preference suppresses mouth/blink and animated interference. Both flight simulators use this treatment by default: green phosphor, scanlines, random displaced strips, 0.4 s acquisition and 0.6 s closing, then a half-second visual linger lets you finish reading while portrait static sputters between fine snow, coarse grain and broken streaks, with brief recoveries before obscuring the face and disappearing. Subtitles and panel UI stay clean throughout. The lab retains palette and original-timing comparisons.

`mumble.radioNoise(speechSamples, sampleRate, options)` builds the existing radio noise pattern independently of audio. Pass that same object to `mumble.transmit(samples, rate, {mode: 'radio', noise: pattern, seed})` and sample `mumble.radioNoiseAt(pattern, elapsed).strength` for visual interference. The plan preserves the original gate delays, crackle steps and occasional burst distribution; the seed for audio hiss remains in transmission options. `elapsed` is audio playback time relative to transmission start; mouth timing additionally subtracts `speechOffset`. The lab defaults to 2.5 times the original radio edge timing (0.4 s acquisition / 0.6 s closing), selectable against original flight timing. `edgeScale` stretches only opening/closing latch timing, preserving the original random draws and middle-burst distribution. The display holds edge noise peaks for 250 ms (40 ms during speech) so short latch steps have time to read; horizontal displacement remains restrained, with a modest boost. Visual strip positions and snow use fresh random samples, and each transmission gets a random radio seed. Outside the pattern duration the channel is closed. Local/clean audio ignores radio noise. Flight and the lab default to effects at 0.45 and edgeScale at 2.5.

Flight maneuvering thrusters: **A/D** push left/right and **R/F** push up/down in ship coordinates. On standard controllers, hold **LB / L1** and move the **right stick** to translate; the left stick keeps steering. While held, the right stick leaves roll and throttle unchanged; D-pad throttle remains available. Translation targets 5 m/s at full input (including diagonals), with a gentle two-second response and automatic braking on release. Reduce throttle below zero with S, right-stick down, or D-pad down for reverse, from 0 to 5 m/s; X returns throttle to zero. Positive throttle and boost retain their normal speeds. Absolute flight-stick throttle retains its 0�100% range. The HUD shows REV while reverse is selected.

Flight experiment skyboxes: Settings > Skybox selects the original ESO panorama or six procedural full-sphere directions (Open void, Galactic horizon, Dark dust, Distant sun, Cold veil, Island universes). Selection is remembered locally. Skies rotate with the cockpit and ignore translation; stars use fixed CSS-pixel point sizes on a separately supersampled sky canvas, independent of scene render resolution. Procedural options contain no baked stars or image grain. Layered directional noise, dust lanes and spiral galaxy structure use an explicit display transfer to retain faint detail. Settings includes sky brightness and independent native/150%/200% sky resolution (150% default, capped at 3 pixels per CSS pixel). Star footprints stay fixed across these choices.

The flight sky also offers **G / Hero galaxy**, **H / Hero nebula**, and **I / Hero sun**: generated galaxy, nebula and sun features in separate, fixed spherical compositions with separate crisp stars. See [skybox authoring](docs/skybox-authoring.md) for the reusable library, seeded placement helper and 4K/8K panorama export.

Ohio sortie: choose Ohio from experiments/missions.html or open experiments/flight.html?mission=ohio. A locally bundled realistic Ohio planet and sixteen recurring Ohio callsigns accompany an 8 vs 8 battle. Weapons and NPC movement wait for the opening radio exchange (including muted subtitles); pause freezes the reveal and restart replays it. Later rounds retain the cast and use Midwest combat chatter. A fixed sun at yaw 225 / elevation 30 degrees sits behind the left shoulder, consistent with the planet artwork lighting; background image UVs preserve the original east/west orientation.

Authored hero skies automatically illuminate the shared 3D materials from precomputed diffuse SH and rough environment reflections. The sky review includes a **Sky-derived lighting** A/B checkbox. Lighting normalization, cache preparation, and current renderer limits are documented in [skybox authoring](docs/skybox-authoring.md).

Ohio teams are Ford Folks (allies) versus Chevy Crew (opponents). The pilots and Control have their own winter wardrobes: trapper hats with earflaps, baseball caps, flannel, work jackets, scarves and quilted vests. Their original faces, seven animated expression poses, and voices are preserved. Preview the whole animated cast at experiments/flight-cast.html?mission=ohio.

**J / River of stars** adds an 8K, densely textured stellar sky with flowing concentrations, dark lanes and a separate crisp point-star foreground. Choose it under Flight Settings > Skybox or in the 3D sky review. The generator uses a fixed seed; it does not randomize between missions.
