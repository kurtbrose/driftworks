# Reproducing gameplay bugs

Pause near the problem and click **Export scenario**. Copy the displayed JSON
or click **Download JSON** to save `driftworks-scenario.json`, containing the current world (including combat),
a default run length of 300 ticks, and empty command/assertion lists. Exporting
does not change the live world or overwrite the browser save.

Give the capture a descriptive `name`, choose `ticks`, and add the expected
result to `assertions`. A capture begins at tick zero regardless of its saved
`elapsedSeconds`: `ticks: 2400` advances it by 80 tactical seconds at 30 Hz.
Capture before the failure when possible; this is a snapshot, not a recording
of commands issued before export. Add subsequent commands explicitly.

Run a single capture from the repository root:

```sh
node tests/scenarios.cjs path/to/driftworks-scenario.json
```

A failing assertion exits nonzero and prints the scenario file, property,
expected value, and actual value. Captures without assertions deliberately fail
so an unchecked snapshot cannot accidentally become a passing regression.
Once it represents the bug, put the JSON in `tests/scenarios/`; `npm test` and
`npm run check` discover all JSON files in that directory automatically. The
browser test page runs the shared scenario-helper tests; file discovery is
specific to the Node runner.

For a fresh mission, use `seed` instead of `world`:

```json
{
  "version": 1,
  "name": "tug-arrival",
  "seed": 12345,
  "ticks": 2400,
  "commands": [
    { "tick": 0, "action": "select", "args": [["tug-01"]] },
    { "tick": 0, "action": "move", "args": [{ "x": 200, "y": 120 }] }
  ],
  "assertions": [
    { "path": "ships.tug-01.position.x", "op": "near", "value": 200, "tolerance": 2 },
    { "path": "ships.tug-01.position.y", "op": "near", "value": 120, "tolerance": 2 }
  ]
}
```

`seed` is an unsigned 32-bit integer (default 1729). It controls initial asteroid
spin and the director's saved random sequence. `world` uses the same normalization
as save loading. To reuse an older save envelope, copy its `world` property into
the scenario. Neither scenario execution nor assertions mutate the input.

Commands run **before** the step with their zero-based `tick`, in list order
when several share a tick. Valid ticks are 0 through `ticks - 1`. Each `args`
array contains the arguments after `world` for the corresponding simulation API:

| Action | Arguments |
| --- | --- |
| `select` | Array of ship IDs (nested inside `args`) |
| `move`, `context` | `{ x, y }` |
| `defend` | `{ x, y }`, optional guarded ship ID |
| `mine` | Asteroid ID |
| `recover` | `{ kind: "ship" or "wreck", id }` |
| `recoverPlatform` | Platform ID |
| `damageFighter` | Ship ID, damage amount |
| `return`, `build`, `endMining`, `spawnFighter`, `spawnHostileWave` | Empty array |

Assertions inspect the final world. Dot paths use IDs for entity arrays (such
as `ships.escort-01.disabled`, `combat.drones.drone-1.fireCooldown`) and `length`
for counts. Numeric array indices also work. Operators are `equal` (JSON value
equality), `near` (finite numeric value and nonnegative `tolerance`), `min`, and
`max`. Missing paths and unknown operators fail. For more complex expectations
such as formation-slot geometry, call `Driftworks.scenario.run(scenario)` in a
shared `tests/tests.js` test and assert against the returned world with ordinary
JavaScript.

Combat needs no renderer or externally scripted hostile positions. The director,
hostiles, firing cadence, damage, disablement and salvage all advance in
`sim.stepWorld`. See `battle-consequences.json` for a complete battle fixture.
Pixi effects, audio, real input and camera animation still require browser checks.
Reproducibility is for the same simulation version, seed/snapshot and commands;
an intentional gameplay change may require reviewing a fixture's expectations.

Population-aware gameplay exports include an optional `session` checkpoint as well
as `world`. When present, replay advances the session coordinator for crew dispatch
and staffing; existing tactical-only fixtures remain unchanged. Assertions still
address the final tactical world, including manifests and platform worker IDs.
