# Flight AI validation

The flight lab has three AI roles. Existing `experiments/training.js` remains the **opponent AI**, unchanged. `experiments/flight-ai.js` adds initial **perfect** and **human simulator** policies. `experiments/flight-duel.js` evaluates either testing policy in the player seat against one existing opponent in open space. The same simulation powers the lab's watch mode and the command-line evaluator, with no runtime network dependencies.

## Watch a duel

Open `experiments/flight.html` from the local server. In **AI DUEL / WATCH PILOT**, change **Player seat** from manual to Perfect AI or a human simulator flavor. Choose the starting geometry, opponent skill and seed, then press **Play**. Use **Pause**, **Restart duel** or Esc to stop and inspect. **Replay duel** restarts the same deterministic setup after the duel ends. Changing pilot, geometry, opponent skill or seed resets and pauses; camera and playback-speed changes preserve the current duel.

The chase camera displays the testing pilot's ship; cockpit view shows the pilot's sightline and the normal targeting HUD. Slow playback to half or quarter speed to inspect decisions. The live readout shows actual last-tick pitch/yaw, throttle, boost and trigger inputs, plus opponent mode and hull. Normal flight controls cannot steer or fire for the testing pilot, and watch mode never requests pointer lock or sends controller rumble. Select **Fly manually · normal lab** to return to ordinary flight.

Watch bouts run for up to 120 simulated seconds and stop at the first destruction, without another wave. They use the benchmark's open-space fixture and selected retail ship/weapon stats, with class hull and shields for both sides. Defaults match Ulysses against Ulysses; 35 Terran/Vasudan/Shivan profiles and ten bolt weapons are available. See [retail loadouts](retail-flight-loadouts.md) for provenance and adaptation limits. Scenery and imported ship models are presentation only; watch mode does not substitute detailed mesh collisions or terrain avoidance. Use the watch panel's ship, cannon and defense choices; loadout changes reset and pause. Artwork can be changed independently without restarting. Ordinary handling, bank and combat-scenario controls remain disabled while watching. `experiments/flight-watch.js` adapts this shared simulation to lab snapshots and a presentation-only chase camera; camera changes never alter flight state.

## Run a baseline

From the repository root:

```powershell
node tools/evaluate-flight-ai.cjs --seconds 30
```

This emits JSON for five geometries × three opponent skill levels × four player policies (perfect, novice, practiced, expert): 60 duels. Starts are `headOn`, `crossing`, `tail`, `turning` and `opening`. `turning` is an offset parallel start that lets turning develop; it does not inject an initial turn command. Both ships use the baseline Ulysses profile and Subach weapon. Both receive their selected class hull/shields with symmetric absorption and recharge. The opponent retains its attack decisions and fire windows; aiming uses the selected cannon. CLI options --ship, --opponent-ship, --weapon, --opponent-weapon and --unshielded match the watch settings. No terrain query is installed; fixtures start far from the spherical safety shell.

Select a case and capture its actual player controls:

```powershell
node tools/evaluate-flight-ai.cjs --seconds 30 --start crossing --category human --flavor practiced --skill 1 --seed 29 --record duel.json
node tools/evaluate-flight-ai.cjs --replay duel.json
```

Use `--category perfect` for the stress pilot; flavor is irrelevant for it. `--record` requires one selected case, including a single human flavor if applicable. Output JSON may be redirected to a file. Recording a duel saves metadata and complete player inputs, not screenshots or an executable script. CLI records include normalized source hashes and reject replay on different source content, so an old policy revision cannot silently produce a different result. Retrieve the matching source revision before replaying it. Browser-created records omit those CLI-added hashes and are local diagnostic replays.

The shared browser-native regression suite loads the controller, duel and watch-adapter scripts in `tests/index.html`. Run `npm run check` for types, assets and the full dependency-free suite. Gun behavior, ship tuning and opponent behavior remain unchanged.

## Controller contracts

`Driftworks.flightAI.create(category, flavor, seed)` creates a fresh sortie-local pilot. Supported categories are `perfect` and `human`; existing opponent AI stays in its current module. `step(time, own, target, profile, weapon)` reads the own flight state and visible target position/velocity, then returns complete controls. Do not reuse a controller across resets or target changes; create a fresh one to clear observation history and clocks.

The observation contract `visible-position-velocity-v1` supplies exact current own state and world-space target position/velocity in open space. It models an instrument-derived target velocity; it is not a calibrated model of what a real player can estimate. No opponent goals, intentions, hidden timers, HP or future random state are provided. The human policy delays and perturbs its observations internally. The perfect policy uses current observations immediately. Terrain, occlusion, multiple targets and player attention across HUD tasks are outside this first contract.

All policies emit pitch/yaw/roll/side/vertical in [-1, 1], throttle in [0, 1], and Boolean fire/boost. `validate` rejects unknown fields, nonfinite values, out-of-range axes and malformed flags; it does not clamp replay data into validity. The game still integrates those inputs through `arcade.step` and emits fixed-forward bolts through `flightGuns.step`. Controllers cannot mutate the live craft, weapon cooldown or simulation clock. The tests freeze controller observations to catch accidental mutation.

### Perfect AI: bounded search, not optimality

The first policy searches 18 candidate turn/throttle/boost combinations every .1 simulated second. Each candidate uses a private copy of the same flight integrator for eight .05-second prediction steps. It scores forward firing alignment, valid shot opportunities and range, assuming constant target velocity. It executes only the chosen legal controls against the real craft, and checks fire permission from its actual current alignment each simulation tick. There is no aim snap or intentional missed shot.

This is a strong initial stress baseline, not a global optimizer or an exhaustive exploit detector. It currently searches steering gain, zero/partial/full throttle and boost, rather than the full independent axis space; roll and translational axes are zero. Both current retail fighter profiles have zero lateral maximum velocity. Future stress work should expand the candidate repertoire when it finds useful adversarial strategies. Opponent-only style restrictions must not filter that future search: a legal dominant tactic should be recorded even if it is unattractive to fight against. Preserve discoveries as input replays.

Prediction uses the same integrator on copies but a coarser timestep than real execution, and ignores opponent acceleration, decisions, incoming bolts and gun cooldown in its score. These are known limits to improve against fixed baselines. More wins alone would not prove optimality.

### Human simulator: attempts success with an imperfect model

The three initial flavors vary reaction delay, observation interval, position/velocity estimation noise, steering response/damping and estimated lead. Observations arrive after a reaction delay; the controller extrapolates the last available estimate instead of consulting current target truth between arrivals. Estimate noise is seeded and persists through that observation's lifetime. The novice's underestimated lead represents a crude predictor, not a chance to intentionally throw away a shot. There is no scheduled miss, loss quota, opponent burst window, or tactical branch that knowingly chooses failure.

Every tick, the pilot aims from its current belief, manages throttle by estimated range and shoots when it believes a valid solution is aligned. Human error emerges from stale/noisy estimates and limited prediction/control, not from sampling a bad action. Different seeds reproduce different perception errors. These flavors have **not been calibrated against human recordings**; names are provisional skill hypotheses, not evidence that an expert human would fly this way. Attention limits, tactical styles and motor execution uncertainty remain future work.

## Duel and replay semantics

`flightDuel.create(options)` builds one player and one opponent; `advance(seconds)` accumulates elapsed time and executes complete 1/120-second steps. Display-frame batching does not change the trajectory. Each step matches the session's movement → opponent/training update → player gun order. Both sides now receive selected class hull/shields with symmetric absorption and recharge. Existing player/opponent hit spheres still differ, and the two policies have different goals; outcomes are not symmetric win probabilities. The old 100-hull/120-shield player versus 90-unshielded-hull opponent setup applies only to the historical baseline below.

The duel stops at the first destruction or configured duration; it never starts another wave. Replay schema 2 stores both ship/weapon choices and the unshielded override alongside category/flavor, seed, policy version, observation contract and cadence. Schema 1 requires its historical source revision and is rejected by the current runtime. The opponent is reproduced by rerunning unchanged deterministic `training.step`; opponent controls are not independently recorded. Replays therefore need the matching opponent source as well as the testing pilot and physics source. Player controls may be replayed without rerunning the testing pilot's decision logic.

The harness exposes state for test assertions, but controllers only receive the documented observation. Tests or analysis must not mutate that state during a measured duel. The harness is currently specific to player-testing-policy versus existing opponent; symmetric perfect-vs-perfect and simulator-vs-simulator bouts require a later adapter and a separately labeled damage model.

## Measurements and first baseline

The result includes outcome, simulated duration, remaining health, emitted bolts, minimum/maximum range, opponent mode changes, cumulative useful opportunity for each pilot and longest dry close engagement. An opportunity means a positive intercept within the current two-second prediction/weapon lifetime horizon and dot > .996. It is a geometric diagnostic, not a guarantee that a bolt will hit; it does not check muzzle offset, occlusion, decision delay or burst permission. Dry time means range below 800 m with neither opportunity nor damage. It does not distinguish a turning stalemate from every other unproductive close encounter yet.

`playerDamageSteps` and `opponentDamageSteps` count fixed steps with damage, not individual bolt hits; two same-step hits count once. Shots are emitted bolts, two per volley. Opportunity totals include the terminal step. No graphics, sound or performance claim is derived from this harness.

[Initial 30-second baseline](../tests/benchmarks/flight-ai-baseline-2026-10-17.json), seed 1, policy `flight-ai-1`:

This historical baseline predates promotion of `tests/flight-duel.js` to the shared runtime module `experiments/flight-duel.js`. All 60 result rows were compared and remained identical after that promotion; the original source-hash metadata is retained as evidence of the original capture.

| Player policy | Duels | Wins | Losses | Timeouts | Longest dry interval |
| --- | ---: | ---: | ---: | ---: | ---: |
| Perfect search | 15 | 15 | 0 | 0 | 0.82 s |
| Human novice | 15 | 10 | 0 | 5 | 9.78 s |
| Human practiced | 15 | 15 | 0 | 0 | 7.48 s |
| Human expert | 15 | 15 | 0 | 0 | 5.57 s |

These numbers expose room for improvement in the evaluation setup as well as opponent behavior. The shielded player seat and generous continuous target telemetry matter. A high player win rate fits the opponent's broad purpose, but does not establish satisfying pursuit, credible human behavior or a useful difficulty curve. Add more seeds, real-player calibration and a wider geometry/speed matrix before setting acceptance thresholds. Preserve this baseline when implementing opponent changes.

Regression coverage checks legal input rejection, frozen observations, deterministic human sampling and reaction latency, immediate stress-pilot fire without opponent concessions, shared-physics input replay, frame-batching invariance, no respawn after destruction, and finite bounded behavior across all starts/flavors. Future stages should add captured human trajectories, independent-axis stress candidates, symmetric duels, target changes and richer opportunity/overshoot metrics. The [research plan](flight-ai-freespace-research.md) remains the design reference for later opponent improvements.
