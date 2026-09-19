# Working on Driftworks

Driftworks is a deployable static site: ordinary JavaScript scripts, vendored
PixiJS, no build step or required package manager. Keep that deployment model;
use relative URLs and do not introduce runtime network dependencies.

## Run and verify

- From the repository root, run `python -m http.server 8000`, `serve.bat` on
  Windows, or `./serve.sh` on Unix. Open `http://localhost:8000/`.
- Run the dependency-free suite with `node tests/run.cjs`, or open
  `http://localhost:8000/tests/`. Both execute `tests/tests.js`.
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
| Hostiles, weapons, threat director | `src/game.js`: `updateCombatVignette`, `updateThreatDirector`, `stepDefenderWeapon`; fighter steering/damage in `src/sim.js` |
| Artwork, effects, HUD | `src/game.js`: paint/geometry helpers, `createHud`; `styles.css` |
| Sound and audio preferences | `src/audio.js`; event/telemetry calls in `src/game.js` |
| Script loading or test harness | `index.html`, `tests/index.html`, `tests/run.cjs` |

## Constraints to preserve

- Load scripts in dependency order: propulsion, simulation, audio, game;
  Pixi precedes game boot. APIs live on `window.Driftworks`.
- Keep persistent rules and serializable state in simulation code, SI propulsion
  math in propulsion, and browser resources in game/audio. Existing combat and
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
