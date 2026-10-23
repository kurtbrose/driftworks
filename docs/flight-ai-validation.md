# Flight AI validation

The flight lab has three AI roles. `experiments/training.js` owns the **opponent AI**, including observation-based gun tracking. `experiments/flight-ai.js` adds initial **perfect** and **human simulator** policies. `experiments/flight-duel.js` evaluates either testing policy in the player seat against one existing opponent in open space. The same simulation powers the lab's watch mode and the command-line evaluator, with no runtime network dependencies.

## Watch a duel

Open `experiments/flight.html` from the local server. In **AI DUEL / WATCH PILOT**, change **Player seat** from manual to Perfect AI or a human simulator flavor. Choose the starting geometry, opponent skill and seed, then press **Play**. Use **Pause**, **Restart duel** or Esc to stop and inspect. **Replay duel** restarts the same deterministic setup after the duel ends. Changing pilot, geometry, opponent skill or seed resets and pauses; camera and playback-speed changes preserve the current duel.

The chase camera displays the testing pilot's ship; cockpit view shows the pilot's sightline and the normal targeting HUD. Slow playback to half or quarter speed to inspect decisions. The live readout shows actual last-tick pitch/yaw, throttle, boost and trigger inputs, plus opponent mode and hull. Normal flight controls cannot steer or fire for the testing pilot, and watch mode never requests pointer lock or sends controller rumble. Select **Fly manually · normal lab** to return to ordinary flight.

Watch bouts run for up to 120 simulated seconds and stop at the first destruction, without another wave. They use the benchmark's open-space fixture and selected retail ship/weapon stats, with class hull and shields for both sides. Defaults match Ulysses against Ulysses; 35 Terran/Vasudan/Shivan profiles and ten bolt weapons are available. See [retail loadouts](retail-flight-loadouts.md) for provenance and adaptation limits. Watch and headless duels use the same swept triangle hull collisions as manual flight. Scenery remains presentation only; terrain avoidance is not part of the open-space benchmark. Use the watch panel's ship, cannon and defense choices; loadout changes reset and pause. Hull choices change both the visible model and collision mesh, and restart the duel. Resolved model IDs are preserved in links and version-4 replays; older replay schemas are rejected. Ordinary handling, bank and combat-scenario controls remain disabled while watching. `experiments/flight-watch.js` adapts this shared simulation to lab snapshots and a presentation-only chase camera; camera changes never alter flight state.

## Run a baseline

From the repository root:

```powershell
node tools/evaluate-flight-ai.cjs --seconds 30
```

This emits JSON for five geometries × three opponent skill levels × four player policies (perfect, novice, practiced, expert): 60 duels. Starts are `headOn`, `crossing`, `tail`, `turning` and `opening`. `turning` is an offset parallel start that lets turning develop; it does not inject an initial turn command. Both ships use the baseline Ulysses profile and Subach weapon. Both receive their selected class hull/shields with symmetric absorption and recharge. The opponent retains its tactical attack decisions; firing uses the tracked solution and selected cannon. CLI options --ship, --opponent-ship, --weapon, --opponent-weapon and --unshielded match the watch settings. No terrain query is installed; fixtures start far from the spherical safety shell.

Select a case and capture its actual player controls:

```powershell
node tools/evaluate-flight-ai.cjs --seconds 30 --start crossing --category human --flavor practiced --skill 1 --seed 29 --record duel.json
node tools/evaluate-flight-ai.cjs --replay duel.json
```

Use `--category perfect` for the stress pilot; flavor is irrelevant for it. `--record` requires one selected case, including a single human flavor if applicable. Output JSON may be redirected to a file. Recording a duel saves metadata and complete player inputs, not screenshots or an executable script. CLI records include normalized source hashes and reject replay on different source content, so an old policy revision cannot silently produce a different result. Retrieve the matching source revision before replaying it. Browser-created records omit those CLI-added hashes and are local diagnostic replays.

The shared browser-native regression suite loads the controller, duel and watch-adapter scripts in `tests/index.html`. Run `npm run check` for types, assets and the full dependency-free suite. Ship and weapon tuning remain unchanged. Opponent aiming follows the tracking contract below.

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

`flightDuel.create(options)` builds one player and one opponent; `advance(seconds)` accumulates elapsed time and executes complete 1/120-second steps. Display-frame batching does not change the trajectory. Each step matches the session's movement → opponent/training update → player gun order. Both sides now receive selected class hull/shields with symmetric absorption and recharge. Both participants use their selected model triangles, and the two policies have different goals; outcomes are not symmetric win probabilities. The old 100-hull/120-shield player versus 90-unshielded-hull opponent setup applies only to the historical baseline below.

The duel stops at the first destruction or configured duration; it never starts another wave. Replay schema 2 stores both ship/weapon choices and the unshielded override alongside category/flavor, seed, policy version, observation contract and cadence. Schema 1 requires its historical source revision and is rejected by the current runtime. The opponent is reproduced by rerunning deterministic `training.step`; opponent controls are not independently recorded. Replays therefore need the matching opponent source as well as the testing pilot and physics source. Player controls may be replayed without rerunning the testing pilot's decision logic.

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

## Batch research page

Use [Combat research](../experiments/flight-study.html) to screen loadouts without rendering, export reports, and open individual configurations paused in the flight lab. See [study design and interpretation](combat-research.md) for matched comparisons, timeout censoring and human playtesting stages. Watch links rerun the current code; preserve the report source revision for reproducibility.


Hull options: CLI `--hull MODEL_ID` and `--opponent-hull MODEL_ID` match watch hull selectors. Defaults resolve the mixed-fleet choices to explicit model IDs. Use `blockout` for the original training mesh. Historical benchmark files retain their older sphere-collision results and must be rerun before comparison with current results.

## Opponent gun tracking

All opponent styles sample target positions every 240/140/80 ms (rookie/veteran/ace).
World-space position differences estimate motion independently of the shooter's
movement. Velocity estimates converge exponentially with 650/320/140 ms response
times; between observations the last estimate is extrapolated. Acquisition starts
with zero estimated velocity and resets on a new target or clock rewind. Gun aiming
never reads target velocity; navigation may still use instrument velocity.
Constant motion becomes predictable, while changes in motion stale the solution.
There is no sinusoidal aim displacement, lead multiplier, hit roll or fixed burst
schedule. Attack steering follows the acquired gun solution; break/recovery and
safety steering retain priority. Fire requires a positive intercept within the
shorter of two seconds and bolt lifetime, existing attack-slot/range constraints,
and alignment within atan(5 m / range). This nominal five-meter aiming tolerance
is a firing criterion, not a hit guarantee: real muzzles, trajectories and hulls
still resolve hits. These skill constants are provisional, not human calibration.

`node tests/flight-aim-tracking.cjs` isolates perception using the real headless
runtime with flight/projectile integration frozen: it checks stationary and linear
convergence, curved motion, reversal recovery, skill differences and determinism.
It does not measure combat hit rates. Historical benchmarks above predate this
opponent change and remain historical evidence.

## Flight incentives and predictable-flight audit

Run `node tests/flight-evasion.cjs` for a focused end-to-end regression. It uses
legal, unarmed pilot inputs in the shared duel runtime, with real opponent
steering, flight integration, muzzle emission, swept triangle hull hits and death.
Nothing is frozen and neither craft is moved directly during the trial. Matched
cases share initial state, ship, weapon, defenses, opponent and duration. The
stationary policy decelerates using throttle zero; straight, circle and jink
policies use the same .8 throttle. Jinks are predetermined changes in pitch/yaw
without observing the enemy's trigger, tracking solution or intentions.

Across head-on, crossing and tail starts against a veteran baseline opponent,
stationary and straight pilots must take substantial damage and die within the
20-second trial. Jinks must take less than half that damage and survive at least
three seconds longer while remaining within 800 m. These deliberately broad
thresholds protect an observed gameplay consequence; they do not define hit rolls
or prescribe opponent decisions. Deterministic repeat coverage reuses legal
inputs. Reduced firing due to tracking/steering is part of the measured benefit.

For a wider diagnostic run, use:

```powershell
node tools/evaluate-flight-evasion.cjs --full > output/flight-evasion.json
node tools/evaluate-flight-evasion.cjs --full --audit
```

The second command exits nonzero when it finds unpunished stationary cases.
Constant circling is accepted evasion: it continually changes velocity, even
though the turn input is held constant. Circle damage remains a measurement,
not an acceptance requirement.
These are unmet design goals, not passing regressions or instructions to force
a hit. The ordinary suite reports findings without requiring loopholes to persist.
The JSON includes normalized source hashes, damage, first damage time, damage
steps, shots, range, survival duration and outcome. Damage steps are not individual
bolt hits; shielded runs report net per-step loss after recharge. CLI fixtures are
unshielded Ulysses/Subach with blockout triangle hulls. Survival is censored at
20 seconds and damage at death, so compare both rather than treating survivors'
end time as an eventual time to death. Circle is a constant .45 yaw demand;
jinks change direction every .85 seconds. This is a counterexample search, not
human skill calibration. It does not test shooting, terrain, objectives or a
pilot maintaining offensive opportunities.

[Initial 216-case audit](../tests/benchmarks/flight-evasion-2026-10-22.json)
uses three starts, three skills, three opponent styles and jink phases 1 and 7.
The phase repeats other policies exactly; those repetitions are matched controls,
not independent samples. Each style has 18 rows per policy:

| Style | Stationary deaths | Straight deaths | Circle deaths | Jink deaths | Mean jink damage |
| --- | ---: | ---: | ---: | ---: | ---: |
| baseline | 18/18 | 18/18 | 0/18 | 0/18 | 6.75 |
| fso-pursuit | 12/18 | 18/18 | 0/18 | 0/18 | 12 |
| fso-breaker | 12/18 | 18/18 | 0/18 | 0/18 | 12 |

All circle rows took zero damage. Both FreeSpace styles' stationary tail starts
also took zero damage at every skill, with almost no shooting at short range.
The harness's `tail` start places the enemy ahead of the pilot, facing the same
direction. The circle finding in that historical report was subsequently reclassified as
acceptable evasion. The stationary cases were a pursuit/range-control failure.
Preserve the results when changing AI; do not fix them by detecting policy names
or assigning damage.

### Stationary-target breakaway repair

FreeSpace overshoot escapes now bias their latched direction away from the target,
including when the fighter starts pointed toward it. Their maximum commitment
is six seconds rather than three; existing early separation exits and cooldowns
still apply. No-progress escapes retain their five-second deadline. This gives
the ordinary turn/flight integrator time to open range before re-entry. The
close-range navigation spacing offset fades out with the gun-lead blend so it
cannot continuously steer an attacking fighter off its firing solution. The
positive throttle floor and actual ballistic firing/hit rules are unchanged.

The focused regression now requires both FreeSpace styles at all three skills
to destroy the stationary pilot in the previously failing tail fixture within
20 seconds, through emitted projectiles and real hull collisions. It also
checks that a damage-free constant circle is not an audit failure.

[Post-repair 216-case audit](../tests/benchmarks/flight-evasion-stationary-fix-2026-10-22.json)
records the same fixtures under the revised maneuvering rules. The original
report remains historical, including its obsolete circle-failure classification.
