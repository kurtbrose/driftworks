# Working on Driftworks

Driftworks is primarily a **3D space flight and combat simulator**. Flight,
ships, weapons, capital ships and space environments are the default context
for new work. Start with `experiments/flight.html`,
`docs/flight-architecture.md`, `docs/flight-artwork.md` and
`docs/flight-presentation.md`.

The original mining/construction RTS remains at `rts.html`, with legacy Pixi
artwork and an optional 3D tactical renderer. Its planar world, semantic zoom,
selection controls and industrial gameplay are specific to that prototype;
they do not define the flight simulator.

Driftworks is a deployable static site: ordinary JavaScript scripts, vendored
Three.js/WebGL for 3D rendering and PixiJS for legacy pages, no build step or
required package manager. Keep that deployment model;
use relative URLs and do not introduce runtime network dependencies.

## Flight visuals and experiments

- For sky creation, sky rendering, background stars/galaxies, or wormhole sky
  changes, read `docs/skybox-authoring.md` before editing. Apply `$make-skybox`
  (`~/.codex/skills/make-skybox/SKILL.md`) for composition and baking; if the
  skill is unavailable, follow the repository's six-camera bake instructions.
- Treat each space's complete sky as one directional environment. Compose
  galaxies, nebulae, haze and background stars before wormhole optics sample it.
  Missions select environment/link data; they must not introduce another sky
  renderer, a special mouth texture, or post-lensing background overlays.
- Keep sky optics independent of foreground/gameplay optics. The intended
  wormhole presentation uses the established Ellis background calculation with
  readable foreground ships. Thin-shell traversal or foreground rendering does
  not authorize replacing Ellis sky optics. Do not patch sky leaks with local
  galaxy/star masks; fix the shared environment/compositing boundary.
- The existing layered sky and fleet arrival path are legacy migration work,
  not templates for new implementations. See the known gaps in
  `docs/skybox-authoring.md`. Do not claim this contract is enforced by the
  current renderer or that skybox baking proves wormhole integration works.
- Sky integration acceptance requires the actual production scene: fixed-pose
  comparisons against the established Ellis sky, approach/rim/near-throat and
  both-side crossing views, local-background replacement on transmitted rays,
  and foreground readability. Check the complete sky, including stars and
  haze. Headless/source checks alone do not establish visual acceptance.
- Evaluate flight artwork, projectiles and effects in a real 3D scene with
  perspective, world-space trajectories, depth and ship-scale context. Reuse
  the production scene, ship assets and effect paths where practical.
- A standalone 2D canvas, screen-space animation or schematic is not a flight
  visual review. Use one only when the user asks for it or the task explicitly
  concerns a 2D interface; label its limited scope.
- Comparisons against current gameplay must use the current assets/rendering
  and relevant weapon dimensions, colors and settings. Do not substitute an
  invented approximation and call it the current reference.
- For stationary firing comparisons, keep ships, camera position, orientation
  and focal length fixed. Add camera motion only when requested or explicitly
  testing it. Fixed ships can still exchange bursts along real 3D trajectories.

## Scratch work and generated output

- Put disposable scripts, HTML probes, notes, and one-off experiments under
  `/.scratch/<task>/`; put renders, screenshots, captures, and profiling output
  under `/output/<task>/`. Both directories are gitignored. Scratch pages can
  still be served by the local HTTP server using relative URLs to repo assets.
- Do not add scratch files to tracked `studies/`, `experiments/`, `tools/`,
  `tests/`, or `assets/` by default. Promote only reusable tools, intentional
  review pages, regression tests, and final assets needed for the deliverable
  into those directories. Keep temporary evidence in the ignored directories
  unless the user requests it be retained in Git.
- Check `git status --short` before editing and before committing. Stage explicit
  paths for the task; never force-add ignored scratch output or sweep unrelated
  work into a commit.
- Generated deployment files are part of the deliverable: when an asset refresh
  changes `src/asset-versions.js` and HTML cache URLs, review and commit the
  relevant generated updates with the source/assets that require them. Do not
  ignore these tracked files or leave their refresh as unexplained local churn.

## Large 3D assets

When integrating or substantially revising a large or detailed runtime asset
(capital ship, station, liner, or repeated fleet), use `$optimize-big-asset`
before calling it ready. The personal skill lives at
`~/.codex/skills/optimize-big-asset/SKILL.md`. Include a measured performance
readiness pass in the actual scene; optimize the demonstrated bottleneck while
preserving appearance, metre scale, materials, pivots and gameplay behavior.
If the skill is unavailable, use the performance comparison and optimization
references in `docs/dreadnaught-kit.md` and
`assets/depots/refueling-v1/README.md`. Existing local timings are examples, not
universal budgets. Offline-only render studies do not need runtime optimization.

## Portraits and sprite sheets

Do not call portrait artwork fixed, ready or done based on hashes, pixel-copy
checks, registration scores, or the test suite. Follow `docs/portrait-authoring.md`.
Inspect actual runtime composites at 256px or larger, including all expressions
at rest, AH, OO and blink, and capture labeled stills. Check eyes/brows, mouth,
nose, chin and blend seams, plus transitions in the cast gallery. Record which
characters and combinations were visually inspected and what remains unresolved.
Mechanical checks and visual acceptance are separate. A successful generation
or registration proposal is not visual approval; never claim a whole cast is
approved from a few spot checks.

## Run and verify

- Commit completed work in focused commits after the relevant checks pass. Keep
  unrelated concurrent workspace changes out of each commit.
- From the repository root, run `python -m http.server 8000`, `serve.bat` on
  Windows, or `./serve.sh` on Unix. Open `http://localhost:8000/`.
- During development, run focused tests covering the changed code and affected
  callers instead of rerunning the entire suite after every edit. Run standalone
  checks with `node tests/<relevant-file>.cjs`, or selected scenario replays with
  `node tests/scenarios.cjs tests/scenarios/<relevant-scenario>.json`. Inspect the
  test entry point first: some checks require the shared runner's setup.
- Prefer focused groups such as `npm run test:flight` or
  `node tests/run.cjs simulation rendering` when a change spans several checks.
  See [test groups](docs/testing.md) for membership and explicit legacy setup.
- Validate behavior headlessly before opening the renderer. For flight spawning,
  targeting and callouts, use the real session from `tools/headless.cjs` in Node or
  Codex's JavaScript REPL; see [headless development](docs/headless.md) for setup,
  stepping, live state access and transcripts. Turn useful probes into focused
  regressions. Use browser checks for presentation/input/audio and integration
  that the headless API does not exercise.
- Complete local code tasks with focused checks for the changed behavior and
  affected callers; do not run the full suite or `npm run check` by default,
  including before committing. Run type, script-list or asset checks separately
  when relevant. Use the existing CI `Check` workflow for occasional full-suite
  verification; inspect results for the relevant revision when checking CI.
  Run a full local check only when explicitly requested or when a specific
  unresolved failure requires it. Report what was checked locally and do not
  imply CI passed without inspecting its result. Documentation-only changes
  need a review of the diff, not the full suite.
- Run the dependency-free suite with `node tests/run.cjs`, or open
  `http://localhost:8000/tests/`. Both execute `tests/tests.js`.
- For a captured gameplay bug, follow [scenario replay](docs/scenarios.md).
  Add JSON regressions to `tests/scenarios/`; the Node suite discovers them.
- For behavior changes, add focused regression coverage to that suite. The
  headless runner stubs the DOM and disables boot; it does not exercise rendering,
  real input, or Web Audio. Verify visual/input/audio changes in the browser.

## Find the change location: primary 3D flight simulator

| Change | Inspect first |
| --- | --- |
| Flight session and browser orchestration | `experiments/flight.js`; `docs/flight-architecture.md` |
| 3D scene, camera and rendering | `src/scene3d.js`, `src/model-viewer.js`; `docs/rendering-reference.md` |
| Flight presentation, HUD and input | `experiments/flight-presentation.js`, `experiments/flight-hud.js`, `experiments/flight-controls.js`; `docs/flight-presentation.md` |
| Flight projectiles and weapon appearance | `experiments/guns.js`, `experiments/retail-weapons.js`, effect materials in `src/scene3d.js`; `docs/flight-artwork.md` |
| Flight collision, combat and stepping | `src/flight-collision.js`, `src/flight-combat.js`, `src/flight-sim.js`; opponent policies in `src/flight-opponent.js`, mission gates in `src/flight-mission-runtime.js` |
| Flight ship catalog/art/hulls | `src/ship-catalog.js`, `src/ship-render.js`, `src/ship-assets.js`, `src/ship-hulls.js`; legacy facade in `experiments/ship-packs.js` |
| Capital flight runtime | `src/aegis-sim.js`, `src/aegis-visual.js`, `src/aegis-battle.js`; composition in `experiments/aegis-flight.js` |
| Script loading and test harness | `tools/script-manifest.cjs`; `docs/script-loading.md`, `docs/testing.md` |

## Find the change location: legacy tactical RTS

| Change | Inspect first |
| --- | --- |
| Orders, movement, formations, mining, construction, recovery | `src/sim.js`: order issuers and `stepWorld` subsystem calls |
| Fuel, delta-v, launcher/catcher envelope | `src/propulsion.js`; conversions and payload mass in `src/sim.js` |
| Save compatibility or new persistent fields | `src/sim.js`: constructors, `normalizeWorld`, `stepWorld`, serialization; `docs/world-state.md` |
| Selection, right-click behavior, camera, zoom | `src/tactical/input3d.js` for 3D gestures, `src/tactical/picking.js` for artwork hits, `src/game.js` for Pixi input; shared command priorities in `sim.issuePickedContextOrder` |
| Hostiles, weapons, threat director | `src/combat.js`; update ordering in `src/sim.js`; event-driven effects in `src/game.js` |
| Craft/platform artwork | `src/ship-art.js`: Pixi painters, semantic scale, thrusters and platform presentation |
| Terrain, excavation, surface contacts | `src/asteroid-terrain.js`: CPU fields, meshes, fitting and derived caches |
| Scene effects, asteroid painting | `src/game.js`: scene lifecycle and effect helpers; geology in `src/asteroid-art.js` |
| DOM HUD, fleet/readouts, control availability | `src/hud.js`; `styles.css` |
| Sound and audio preferences | `src/audio.js`; Ohio programming/gates in `src/ohio-soundtrack.js`; event/telemetry calls in `src/game.js` |
| Script loading or test harness | `index.html`, `rts.html`, `tests/index.html`, `tests/run.cjs` |

## Constraints to preserve

- Write text files with LF line endings, including files generated by scripts.
  Preserve original asset bytes where `.gitattributes` marks files `-text`.
- Use the appropriate profile in `tools/script-manifest.cjs` for dependency order;
  see [script loading](docs/script-loading.md). For the legacy tactical entry point:
  propulsion, combat, simulation, audio, HUD, game;
  Pixi precedes game boot; `ship-art.js` follows simulation/geology and precedes game.
  `asteroid-terrain.js` follows simulation, geology and mining geometry, before `scene3d.js`.
  APIs live on `window.Driftworks`.
- Keep persistent rules and serializable state in simulation code, SI propulsion
  math in propulsion, and browser resources in game/HUD/audio. Existing combat and
  camera exceptions are documented in [architecture](docs/architecture.md).
- For the tactical `src/sim.js` world, public transitions return a replacement
  world. Flight sessions have their own ownership and stepping contracts in
  [flight architecture](docs/flight-architecture.md). Keep persistent world
  data JSON-safe; use IDs, never object pointers, for entity relationships.
- Follow the tactical [world-state](docs/world-state.md) contract for formation, payload, and lifecycle
  ownership. Adding a top-level field requires updating `stepWorld`'s explicit
  reconstruction as well as initialization and migration.
- Preserve existing saves. Normalization is compatibility repair, not complete
  schema validation; test old-save defaults and repeated loading when changing it.
- Keep physical conversions explicit; use [physical units](PHYSICAL_UNITS.md)
  for calibration. Semantic artwork scale must not change simulation distances.

Update the relevant reference when changing an interface or invariant. The
README explains play and controls; these documents explain where code belongs.
