# Driftworks

Driftworks is a browser-based 2D hard-SF economic/RTS prototype. This repository state is deliberately small: a static tactical sandbox where a persistent handful of industrial spacecraft can begin doing useful work.

For code changes, start with [AGENTS.md](AGENTS.md), then consult the
[architecture map](docs/architecture.md) and [world-state contract](docs/world-state.md).

## What Works Now

- Full-window PixiJS tactical scene using vendored runtime code.
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
- Simple threat director that warns, then sends raiders once mining/construction activity exposes the operation.
- Camera pan with middle mouse or Space + drag, plus mouse-wheel zoom.
- Semantic zoom: default proportions are preserved; small craft stay readable while close inspection reveals their size relative to the mothership and asteroids. Wheel zoom extends to 128×. Through 32×, the asteroid scales geometrically (keeping surface attachments aligned), other large bodies nearly geometrically, and small craft grow modestly on screen. Above 32×, artwork proportions hold steady and everything magnifies together, making craft four times longer at 128× than at 32×. These remain schematic proportions, not a literal physical hull scale. Movement and simulation distances remain unchanged.
- Versioned localStorage save/load of serializable game state.
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
- Select **MSV Hardshell** in the fleet panel or scene, then choose **Deploy mining platform**. The idle blue cargo ship takes a platform and its first five workers to the asteroid. After matching position and velocity it spends fifteen physical minutes on EVA unstrapping, then setup takes three physical hours before extraction starts. Repeat after it returns to deploy the second platform. The cargo ship can carry platform crews as well as its one platform, construction section, or recovered hull.
- Select Linehorse and right-click a deployed platform to retrieve it early. **End mining & recover** stops extraction and assigns the cargo ship to collect each platform in turn. Workers stay through the three-hour packing job, then ride home with the rig; the shuttle remains available for mid-mission shift changes. Platform, ore, people, and recovered-hull deliveries take three physical minutes to unload. Packets already in flight continue.
- Old saves retire obsolete mining ships and the intermediate Carrier One/Two hulls, preserving their ore in mothership storage. Deployed platforms and in-flight packets persist. Stored platforms, fuel, and recovery progress survive saves.
- Save/Load retain pending deployment and mining/recovery phases. Reset replaces the saved world as well as the live mission. Mining controls remain visible; select the mothership to enable deployment when its cargo ship is available.

Tuning is intentionally provisional: engines use a 3,000 m/s effective exhaust velocity; tank capacities are 12 t for fighters and 450 t for the cargo ship. Propellant supply at the mothership is currently unlimited. The launcher/catcher is a gameplay abstraction: mothership recoil, stored launcher energy, structural load limits, gravity and orbital motion remain outside this slice. Propulsion math is isolated in src/propulsion.js; orders and platform lifecycle live in src/sim.js.

## No Build Pipeline

There is intentionally no required Node runtime, npm, package manager, TypeScript, Vite, bundler, transpiler, lockfile, or generated build output. The repository itself is the deployable static artifact.

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
