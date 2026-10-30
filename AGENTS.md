# Working on Driftworks

Driftworks is a deployable static site: ordinary JavaScript scripts, vendored
PixiJS, no build step or required package manager. Keep that deployment model;
use relative URLs and do not introduce runtime network dependencies.

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
- Run `npm run check` once before considering a code task complete. It performs
  type checking, asset validation, and the dependency-free test suite. Repeat it
  only when subsequent changes, failures, or unresolved concerns justify it.
  Documentation-only changes need a review of the diff, not the full suite.
- Run the dependency-free suite with `node tests/run.cjs`, or open
  `http://localhost:8000/tests/`. Both execute `tests/tests.js`.
- For a captured gameplay bug, follow [scenario replay](docs/scenarios.md).
  Add JSON regressions to `tests/scenarios/`; the Node suite discovers them.
- For behavior changes, add focused regression coverage to that suite. The
  headless runner stubs the DOM and disables boot; it does not exercise Pixi,
  real input, or Web Audio. Verify visual/input/audio changes in the browser.

## Find the change location

| Change | Inspect first |
| --- | --- |
| Orders, movement, formations, mining, construction, recovery | `src/sim.js`: order issuers and `stepWorld` subsystem calls |
| Fuel, delta-v, launcher/catcher envelope | `src/propulsion.js`; conversions and payload mass in `src/sim.js` |
| Save compatibility or new persistent fields | `src/sim.js`: constructors, `normalizeWorld`, `stepWorld`, serialization; `docs/world-state.md` |
| Selection, right-click behavior, camera, zoom | `src/game.js`: `createScene`, `issueVisualContextOrder`, coordinate helpers; also `sim.issueContextOrder` |
| Flight collision, combat and stepping | `src/flight-collision.js`: spatial queries and exact hits; `src/flight-combat.js`: tracing, shields and damage; `src/flight-sim.js`: craft lifecycle and stepping |
| Hostiles, weapons, threat director | `src/combat.js`; update ordering in `src/sim.js`; event-driven effects in `src/game.js` |
| Craft/platform artwork | `src/ship-art.js`: Pixi painters, semantic scale, thrusters and platform presentation |
| Terrain, excavation, surface contacts | `src/asteroid-terrain.js`: CPU fields, meshes, fitting and derived caches |
| Scene effects, asteroid painting | `src/game.js`: scene lifecycle and effect helpers; geology in `src/asteroid-art.js` |
| DOM HUD, fleet/readouts, control availability | `src/hud.js`; `styles.css` |
| Sound and audio preferences | `src/audio.js`; event/telemetry calls in `src/game.js` |
| Script loading or test harness | `index.html`, `rts.html`, `tests/index.html`, `tests/run.cjs` |

## Constraints to preserve

- Write text files with LF line endings, including files generated by scripts.
  Preserve original asset bytes where `.gitattributes` marks files `-text`.
- Load scripts in dependency order: propulsion, combat, simulation, audio, HUD, game;
  Pixi precedes game boot; `ship-art.js` follows simulation/geology and precedes game.
  `asteroid-terrain.js` follows simulation, geology and mining geometry, before `scene3d.js`.
  APIs live on `window.Driftworks`.
- Keep persistent rules and serializable state in simulation code, SI propulsion
  math in propulsion, and browser resources in game/HUD/audio. Existing combat and
  camera exceptions are documented in [architecture](docs/architecture.md).
- Treat public world transitions as returning a replacement world. Keep world
  data JSON-safe; use IDs, never object pointers, for entity relationships.
- Follow [world-state](docs/world-state.md) for formation, payload, and lifecycle
  ownership. Adding a top-level field requires updating `stepWorld`'s explicit
  reconstruction as well as initialization and migration.
- Preserve existing saves. Normalization is compatibility repair, not complete
  schema validation; test old-save defaults and repeated loading when changing it.
- Keep physical conversions explicit; use [physical units](PHYSICAL_UNITS.md)
  for calibration. Semantic artwork scale must not change simulation distances.

Update the relevant reference when changing an interface or invariant. The
README explains play and controls; these documents explain where code belongs.
