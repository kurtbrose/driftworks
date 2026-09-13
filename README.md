# Driftworks

Driftworks is a browser-based 2D hard-SF economic/RTS prototype. This repository state is deliberately small: a static tactical sandbox where a persistent handful of industrial spacecraft can begin doing useful work.

## What Works Now

- Full-window PixiJS tactical scene using vendored runtime code.
- Geometric placeholder mothership, miners, tug, and two escort craft.
- Single-click selection and drag-box multi-selection.
- Right-click move orders with fixed-step simulation and interpolated rendering.
- One large asteroid occupies the tactical environment, with a slow, randomly clockwise or counterclockwise spin.
- Right-click its surface with selected miners: they choose a site, match surface motion, land, and rotate with the body while extracting ore.
- The asteroid retains its physical size as ore is depleted; older multi-asteroid saves merge remaining ore into one large body.
- Miners automatically return full cargo to the mothership and deposit it into storage.
- Mothership processes delivered ore into 1,500t depot sections.
- Canonical physical sizes, masses and thrust drive loaded acceleration and braking. See [physical units](PHYSICAL_UNITS.md) for calibration, conversions and save migration.
- Tug can carry fabricated depot sections from the mothership to the depot site.
- Utility haulers can retrieve persistent drone wrecks for salvage and carry disabled fighters home for repair.
- HUD ore quota, depot progress, construction section stock, and remaining asteroid ore readouts.
- Subtle parallax starfield below the grid.
- Acceleration-driven engine plumes with translucent envelopes, bright cores, and animated internal nodes. Fighters ignite sharply; industrial engines build more steadily. Fine plume detail drops out at distance.
- Mining motes and delivery feedback text.
- Move-order reticles, selection pulses, mothership running lights, and focus-selection camera key with visible focus feedback.
- Debug hostile-raider vignette with industrial target selection, escort range coverage, laser dwell, impacts, destruction fragments, very light final-hit shake, and final-kill slow motion.
- Simple threat director that warns, then sends raiders once mining/construction activity exposes the operation.
- Camera pan with middle mouse or Space + drag, plus mouse-wheel zoom.
- Semantic zoom: default proportions are preserved; small craft stay readable while close inspection reveals their size relative to the mothership and asteroids. Wheel zoom extends to 128×. Through 32×, the asteroid scales geometrically (keeping surface attachments aligned), other large bodies nearly geometrically, and small craft grow modestly on screen. Above 32×, artwork proportions hold steady and everything magnifies together, making craft four times longer at 128× than at 32×. These remain schematic proportions, not a literal physical hull scale. Movement and simulation distances remain unchanged.
- Versioned localStorage save/load of serializable game state.
- Toggleable stress mode that animates thousands of simple sprites.
- DOM HUD with selected ships, simulation time, entity count, and measured FPS.
- Browser-native simulation tests at `./tests/`.

## No Build Pipeline

There is intentionally no Node, npm, package manager, TypeScript, Vite, bundler, transpiler, lockfile, or generated build output. The repository itself is the deployable static artifact.

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

The app uses ordinary scripts, not JavaScript modules. Serving over HTTP is still the recommended path because browser behavior around local files varies, and it matches GitHub Pages or any static host.

Debug controls:

- `F`: ease camera onto the selected ship or fleet and flash a focus reticle.
- `H`: manually spawn a short hostile-raider vignette; selected escorts show their coverage circle.
- `J`: disable a selected fighter to try a recovery mission without waiting for combat damage.
- `K`: spawn another friendly fighter near the mothership; repeat to build a larger wing.

Fighter defense controls:

- Select fighters and right-click empty space to defend that point. Two form a staggered wing, three a V, four a diamond, and larger groups a ring. Formations face the ordered destination.
- Wings assemble around a shared moving formation center, then travel together. Cruise speed follows the slowest active member with speed reserved for catching up; the center slows or waits when a wingmate falls behind. Fighters match the center's velocity and correct their slot error, arriving together instead of racing to separate destinations. Disabled or reassigned fighters no longer hold up their old group.
- Slot occupancy is approximate: each fighter has a stable 3–7 unit personal offset and a 6-unit steering deadband. Guidance speed and acceleration vary slightly per fighter within the hull's limits. Near combat, spacing eases to 1.65×, personal offsets widen, and tolerance grows to 30 units; range management takes priority over a gentle preference for the nominal slot. Slots remain assigned until a new order, and the wing tightens gradually after threats leave.
- Right-click another, unselected friendly ship to escort it in a looser formation. Its position becomes the moving defense anchor.
- Fighters prioritize threats near the anchor, kite and orbit in weapon range, separate from nearby fighters, and return to their formation when threats leave. At the leash boundary they slide sideways instead of retreating farther.
- Selected fighters show weapon range and a faint operating-area circle with a cross at the anchor. The hard-coded group leash is `FIGHTER_LEASH` in `src/sim.js`: currently 700 simulation units, or 2.5 times weapon range. There is no tuning UI yet.
- Defense orders and formation slots survive saves; hostile encounters remain transient. Use `K` to build a wing, box-select it, right-click a defense point, then press `H` to try combat.

Construction controls:

- Deliver ore to the mothership until a depot section is ready.
- Select `Linehorse`, then right-click the depot ghost to carry a ready section to the site.
- Once mining or construction is underway, contacts can appear automatically after a warning.

Recovery controls:

- Select `Linehorse` and right-click a faded drone wreck or disabled fighter to retrieve it.
- The hauler approaches, clamps the hull beneath its frame, and returns automatically with acceleration determined by combined mass. One module or recovered hull at a time.
- Wrecks provide 24t ore at the mothership, feeding the existing construction processing chain.
- Disabled fighters stay inert and cannot fire. Retrieval starts a six-second repair inside the mothership, followed by a slow six-second launch from its forward end. The restored fighter awaits orders once clear.
- Move orders can redirect a loaded hauler; right-click the mothership to resume delivery.
- Wrecks, carried hulls, damage, and repair progress are included in saves. Active hostile encounters remain transient.

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
