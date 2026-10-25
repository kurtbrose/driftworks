# Test groups

`npm test` or `node tests/run.cjs` runs every group. `npm run check` remains the
complete gate: types, script-list consistency, asset validation and all tests.
The test runner itself needs only Node and its standard library.

Use focused groups while developing:

| Command | Coverage |
| --- | --- |
| `npm run test:simulation` | Orders, propulsion, logistics, formations, saves, population, campaign setup and all JSON scenario replays |
| `npm run test:flight` | Flight physics, AI, weapons, missions, comms behavior, input/HUD, replay and composition transitions |
| `npm run test:rendering` | Render contracts, geology, shaders, sky effects, cameras, viewers, mining geometry and batching |
| `npm run test:assets` | Asset versions, imported catalogs, provenance, textures and source-data contracts |
| `npm run test:artwork` | Characters, portraits, ship studies, livery and artwork generation mechanics |
| `npm run test:audio` | Engine synthesis, mixing, music, speech and radio audio |
| `npm run test:tooling` | Script manifest, test selection, runner isolation and failure handling |

Groups describe the behavior being checked. A flight HUD check belongs to flight;
a generic GPU painter check belongs to rendering. Run multiple affected groups
when changing shared code:

```text
node tests/run.cjs flight rendering
node tests/run.cjs --list flight
```

`--list` shows the exact executable entries and declared setup without running
them. Unknown or empty groups fail rather than producing a successful empty run.
`node tests/scenarios.cjs --all` runs all replay JSON files; explicit JSON paths
still select individual scenarios.

## Registration and isolation

`tests/suites.cjs` owns standalone test membership, argument variants and setup.
Every root-level `.cjs` check must be registered or have a documented helper
exemption. The runner checks this inventory even for a focused run. The gas-giant
mission variants remain separate entries, and scenario JSON files are discovered
on every run.

Each entry runs in a fresh Node process, sequentially. The runner waits for
process exit, including asynchronous assertions, and remembers failures even
when later entries pass. This prevents module caches, globals and `exitCode`
changes from leaking between test files.

Legacy mining tests declare `setup: 'shared'`; their child preloads
`tests/helpers/shared-runtime.cjs` through `preload-shared.cjs`. This installs
the same production scripts and minimal DOM stubs as the original runner, in the
current realm so array prototypes and shared adapter identity remain compatible.
Use the group command or declared preload when running these files directly.
New standalone checks should prefer their own isolated runtime or the actual
session API in `tools/headless.cjs`.

Shared mining clearance math lives in `tests/fixtures/mining-clearance.cjs`.
The ramp, leg and roof checks import those helpers directly, so selecting one
check does not execute the other checks as an import side effect.

## Shared browser and Node tests

The declarations in `tests/tests.js` now carry explicit group labels:

```js
test('simulation', 'descriptive behavior', function () {
  // Existing assertion helpers and local test fixtures are available here.
});
```

`tests/shared-harness.js` owns registration, assertions, filtering and results.
All declarations must precede the final `run()`; late registration and duplicate
names fail. Population tests register through the simulation adapter. The Node
entry `node tests/shared.cjs flight` runs only shared flight assertions;
`npm run test:flight` also runs the standalone flight checks.

Open `http://localhost:8000/tests/` for every shared test, or use its group links
(`?group=flight`, for example). These browser groups do not include the Node-only
standalone checks. The application scripts still load through the shared script
profile, regardless of which assertions are selected.

Rendering contracts and mocked audio do not replace real WebGL, native input,
Web Audio or artwork inspection. Keep the browser checks and visual acceptance
required by the affected subsystem; portrait mechanics do not certify artwork.
