# Pilot learning experiment

This optional offline lab evolves a small neural controller against the real
combat simulation: 120 Hz flight, guns and triangle hull collision. It does
not change gameplay or require a site build, CDN, server service or runtime ML
dependency. Install the separate development dependency once:

```powershell
npm ci --prefix tools/pilot-training --ignore-scripts --no-audit --no-fund
```

Run a combat-focused population, then a population preserving different styles:

```powershell
node tools/pilot-training/train.cjs --mode kill --generations 100 --population 16 --duration 45 --cases 8 --heldout 24 --out .pilot-training/kill-v2
node tools/pilot-training/train.cjs --mode diverse --generations 100 --population 16 --duration 45 --cases 8 --heldout 24 --out .pilot-training/diverse-v2
```

These are sequential CPU jobs. Each generation evaluates the requested number of
mutations and all surviving parents across a fresh common training suite. Runtime depends heavily on
encounter length and how early ships die. Start with `--generations 2
--population 4 --duration 12` for a smoke run, using a different output directory.
There is no assertion that a short run produces strong pilots.

Training skips the cosmetic `addScorch` mesh builder inside its isolated runtime
by default. Collision queries, projectile tracing and damage are unchanged;
focused checks compare all metrics and outcomes with burn geometry enabled.
Pass `--scorches` to retain the production cosmetic work for profiling. This
does not alter the ordinary game scripts or their rendering.

A local paired benchmark on 2026-10-23 evaluated the same eight seeded
15-second-limit scenarios with warmed caches, alternating cosmetic work on/off.
Enabled runs took 5.20-5.34 seconds; skipped runs took 1.81-1.82 seconds, about
2.9x faster. Every result field matched. This measures the current local workload,
not a general JavaScript/Rust comparison. The initial longer mixed-scenario run
started before this switch and retains its original loaded implementation.

Each completed generation atomically replaces `checkpoint.json`. Ctrl+C requests
a stop after the current candidate evaluation; an incomplete generation is
discarded. The process still writes final evaluations and exports before exiting.
Resume with the same mode, population, duration and seed plus `--resume`;
`--generations` then means additional generations. Keep the same source revision
for reproducible resumes. Also preserve `--cases` and `--heldout` on resume.
The default seed is 1729. Version 1 checkpoints are rejected: their reward,
scenario distribution and score semantics differ. Use a new output directory.

## Scenarios and score, version 2

Every default eight-case suite includes head-on, crossing, on the target's tail,
being tailed, 2v1 with an AI wingmate, 1v2, half-hull/half-shield player, and
half-hull/half-shield opponent. Cases change style, skill, heading and relative
position with a seeded RNG each generation. Parents are re-evaluated on exactly
the same new suite as their offspring; historical scores never compete with fresh
scores. Printed training scores therefore need not rise monotonically.

The encounter harness starts with production duel setup and steps
`DW.training.stepControlled` directly so it can continue past the first enemy's
death in group encounters. Added craft use production loadouts, model collisions,
NPC steering and weapons. Both sides obey normal faction targeting. Target
selection for the learner is authored: nearest living hostile, reconsidered every
half-second and after a kill. NPC wingmates are authored AI, not neural teammates.

The score credits damage when it happens, including partial shield damage even
if that shield later regenerates. Per-enemy shield credit is capped at its
starting shield and hull credit at starting hull; existing damage earns nothing.
Only damage caused during the controlled pilot's gun step counts toward its
personal damage and kill reward. Wingmate damage can contribute to team victory
but cannot masquerade as the learner's damage.

Specifically, reward is 4 times enemy hull damage fraction, plus shield damage
fraction, plus 2 times personally killed enemy fraction, plus 0.002 per hit
(capped at 0.1), plus 1 for team victory. Penalties are 1 for player death, half
the player's hull damage fraction and 0.1 times shield damage fraction. Fractions
use full original maximum defenses, summed across hostiles for group cases.
Survival time and shots fired earn no points. These are tunable proxies for
combat effectiveness, not proof against exploitation or measures of fun.

The final survivor population is ranked on a separate fixed validation suite.
The champion and zero-weight baseline then face a third, held-out test suite;
test scores never select a champion. Each defaults to 24 cases, three variants
of every scenario. Scenario seeds are separated by generation and split. Hulls
and loadouts remain the default, so this does not test cross-ship generalization.

## Controller and learning

Architecture: **12 inputs -> 12 tanh hidden nodes -> 5 tanh outputs**, 221 parameters
(884 bytes in float32, larger as exported JSON). Inputs describe lead direction,
range, relative velocity, own angular rates, throttle and intercept validity.
No enemy health, internal goals or future state enter the network. Target
pose/velocity are instantaneous: this is not yet a model of human perception,
attention, memory or crew learning. Own health and other contacts are also absent:
the network cannot explicitly reason about its wounded state, an attacker behind
it or a wingmate. Those scenarios can expose this limitation; they do not solve
it. Expanding the observation is a separate experiment.

The existing aiming equations provide a stable steering scaffold. Outputs adjust
pitch/yaw, throttle, firing tolerance and boost intent, held at 10 Hz. This is a
residual controller, not a network learning flight from scratch or a learned
ten-dial personality. The untrained zero-weight scaffold is the baseline.

TensorFlow.js CPU tensors generate seeded Gaussian weight mutations; whole duel
outcomes select survivors. This is neuroevolution, not backpropagation. A small
dependency-free forward pass executes the exported weights during rollouts.
Every completed run checks its outputs against TensorFlow.js and benchmarks
100,000 warmed-up inference calls. No tensors are retained across mutations or
reference predictions. Inference timing is local Node timing, not a browser frame
budget and not a measurement of the full perception/steering/combat cost.

`kill` selects hull damage, shield damage and wins, penalizing own damage and
losses. `diverse` uses that same quality score within six niches: close/medium/far
average distance crossed with selective/frequent firing. Those descriptors are
measured behavior, not rewards for being fun or human. Weak or exploitative
policies may occupy niches; inspect them before adopting anything.

## Results and review

The output directory contains:

- `report.json`: baseline/champion scores, wins, losses, personal kills, credited
  hull/shield damage, hit counts, full encounter summaries,
  selection history, archive niches and inference timing/parity.
- `champion.json` and `pilot-N.json`: architecture, observation version and flat
  weights; all niche pilots are exported, not just the combat champion.
- `replay.json`: exact control stream and scenario setup for the champion's first
  held-out encounter. Version 2 training replays use
  `require('./tools/pilot-training/train.cjs').replay(DW, record)`, including group
  and wounded setup. Historical version 1 duel-only exports use
  `DW.flightDuel.replay` instead.
- `checkpoint.json`: complete survivor population and training configuration.

The history records the exact sampled cases for each generation. Reports contain
each test episode's setup kind, damage, kills, hit counts, target changes and
outcome. Full configuration plus the seed reconstructs the test suite.

Inspect a report in PowerShell:

```powershell
$pilotReport = Get-Content .pilot-training/kill-v2/report.json -Raw | ConvertFrom-Json
$pilotReport.benchmark
$pilotReport.baselineHeldout | Select-Object score,wins,losses,kills,hullDamage,shieldDamage,damagingHits
$pilotReport.championHeldout | Select-Object score,wins,losses,kills,hullDamage,shieldDamage,damagingHits
```

This first lab exports replay data but does not add a graphical replay importer
or put neural pilots into normal gameplay. Existing watch links regenerate the
authored controller and cannot display these learned weights. Next experiments
can generalize network shapes and add a two-neural-pilot tournament. Compare
architectures with matched simulation budgets and multiple seeds/opponents;
head-to-head superiority can be cyclic. Player assessment is still needed to
establish whether fighting the pilots is interesting.

Focused dependency-free checks: `node tests/pilot-training.cjs`. To check
TensorFlow parity and tensor retention after installation:

```powershell
node tools/pilot-training/verify.cjs
```

## Historical version 1 measurements

On 2026-10-23, seed 1729, 10 generations of 8 mutations, 30-second encounters:

| Held-out controller | Wins | Losses | Timeouts |
| --- | ---: | ---: | ---: |
| Zero-weight scaffold | 1 | 2 | 3 |
| Evolved combat champion | 1 | 0 | 5 |
| Diversity archive's combat champion | 1 | 0 | 5 |

This is a small feasibility sample, not evidence of general combat superiority.
The champion reduced losses but did not increase kill count. A preceding
three-generation, 12-second smoke run produced six held-out timeouts and zero
kills, illustrating how survival can dominate the reward. The diversity smoke
run retained two firing styles, both at close range; it did not demonstrate an
interesting opponent population.

The combat champion's 221-parameter forward pass measured about 0.86 microseconds
in warmed-up Node execution; the maximum output difference from TensorFlow.js
was below 3e-8. Float32 weight storage is 884 bytes, excluding metadata and
controller code. Browser performance and full scene costs remain unmeasured.
The equal-budget diversity run retained two niches (close-selective and
close-frequent); its highest-scoring pilot had the same held-out outcome counts.
Local ignored artifacts are in `.pilot-training/kill-first/`,
`.pilot-training/diverse-first/` and the two `*-smoke` directories.
These results used fixed duel-only cases and end-state damage scoring. The
current version 2 code deliberately changes those assumptions, so old scores
must not be compared numerically with new scores.

## First mixed-scenario version 2 run

On 2026-10-23, seed 1729, 30 generations of 8 mutations, 30-second encounter
limits, 8 fresh cases per generation and 24 cases per final split:

| Held-out controller | Wins | Losses | Timeouts | Personal kills | Hits |
| --- | ---: | ---: | ---: | ---: | ---: |
| Zero-weight scaffold | 14 | 5 | 5 | 14 | 998 |
| Selected champion | 14 | 5 | 5 | 14 | 998 |

The selected champion's weights were all zero: no evolved candidate beat the
baseline on final validation. Both controllers therefore inflicted the same
credited 2816.49 hull damage and 8195.5 shield damage, with mean score 4.45845.
This run evaluated 240 new candidate networks across 1920 offspring encounters,
plus parent re-evaluations and final validation/test encounters. It establishes
the expanded harness, not successful neural improvement. Local artifacts are in
`.pilot-training/mixed-v2-first/`.

A next diagnostic would vary mutation scale and parameterization: unrestricted
additive pitch/yaw corrections may spoil an already accurate aiming scaffold.
That is an untested explanation, not evidence that evolution or neural policies
cannot improve this task. The current observation's missing health and other
contacts also limits what a policy can learn from disadvantaged scenarios.
