# Two-action tactical executive experiment

The [version-2 curriculum study](pilot-executive-curriculum.md) continues this
experiment with useful-break cases, tactical history and retained candidates.

This offline experiment learns **attack versus break**, while authored,
unchanging controllers execute the choice. It uses the production flight,
weapons, shields, damage and triangle-hull collision paths. It adds no gameplay
scripts, deployment dependencies, network services or runtime ML framework.

```text
node tools/pilot-training/executive.cjs --seed 1729 --generations 30 --population 16 --duration 25 --out output/pilot-executive/my-run
node tests/pilot-training.cjs
```

Use a fresh output directory. Reports and replay evidence belong under ignored
`output/`. Training is synchronous CPU work, saves at completion, and has no
resume support. The only disabled runtime work is cosmetic scorch mesh creation;
a focused test compares full episode results with that work enabled.

## Fixed actions and timing

**Attack:** continuously calculate the ordinary constant-velocity projectile
intercept, steer toward it with fixed proportional/angular-rate damping, and
adjust throttle using a fixed 330 m spacing/closure rule. Fire only with a valid
intercept, more than 130 m range and alignment above 0.997. This study has one
hostile, no terrain or friendly traffic. It does not establish firing safety in
a fleet or among obstacles.

**Break:** latch a world-space heading combining away from the target, current
forward and a lateral offset. Follow that heading at full ordinary throttle
without firing. Recomputing the away direction during the break is deliberately
avoided. Boost, roll demand and strafing remain disabled in both actions; the
production automatic yaw bank still applies.

The executive runs at 5 Hz. The conventional controller and physics run at
120 Hz. An attack lasts at least one second; a break lasts at least two seconds.
After that minimum, the selector can request attack again. A break must end at
550 m separation or after five seconds, evaluated at the next tactical tick.
The following attack still has its one-second minimum. These same option limits
apply to every baseline; consequently an always-break selector periodically
executes mandatory attacks rather than remaining in break forever.

Tests verify the commitment/deadline rules, held heading, break firing veto and
an isolated physical separation maneuver. Against a stationary marker initially
300 m ahead, five seconds of the break controller increased range past 450 m.
That demonstrates one executable maneuver, not evasion effectiveness against
every opponent. Attack scoring hits is also checked by the real encounter
probes; it is not an optimal-control proof.

## Policy, information and reward

The network is one tanh output over ten features plus a bias: eleven parameters.
It requests break above 0.2, attack below -0.2, and retains the current choice in
between. Initial parameter distribution means are zero, standard deviations
0.8. There is no authored tactical policy embedded in the weights. Only the
selector weights train; flight controllers and weapons remain fixed.

Features are scaled/clamped range and closure, own forward alignment, observed
opponent forward alignment toward the pilot, intercept alignment, own hull and
shield fractions, current action, time since own damage, and time since either
side last took damage. The policy sees no opponent controller mode, future
inputs, RNG state or future simulation. Opponent-facing is an observed threat
estimate, not knowledge of its intent. There is no target choice in this task.

Reward is four times enemy hull damage fraction, plus half enemy shield damage
fraction, plus three for a kill; subtract twice own hull damage fraction, a
quarter own shield damage fraction, and three for death. Fractions use original
maximum defenses. Cumulative shield and hull credits/penalties are capped at
those maximum defenses, so regeneration cannot produce unlimited reward. There
is no reward for survival duration, time spent breaking, switching modes, shots
fired or radio events. Reward remains a combat proxy and requires inspection.

## Comparison protocol

Every generation samples sixteen networks and evaluates them on four common,
fresh encounters: head-on, crossing, on-tail and hunted, with seeded placement
jitter and rookie/veteran baseline opponents. The top quarter updates a diagonal
cross-entropy search distribution. Separate twelve-case validation, evaluated
every five generations and at the final generation, selects the exported policy.
Historical fitness never competes with a fresh suite.

The selected policy then faces 32 untouched baseline-opponent encounters and
32 further encounters against untrained aggressor, passer and FreeSpace-inspired
breaker styles. Each suite uses matched cases for:

- Learned selector.
- Always-attack selector.
- Always-break selector.
- Authored overshoot/close-range/no-progress switching rule.

The authored rule is a small fixed comparison, not the full production
FreeSpace-inspired policy. Always-attack is an essential strong baseline:
improving on a poor switching rule is insufficient evidence of useful learning.
Test outcomes never select a checkpoint. Report score, kills/deaths, damage,
exposure, timeouts and action occupancy together; avoid treating survival or
frequent switching as combat quality. This is one ship/loadout and one training
seed, without a claim of general superiority or player enjoyment.

## Replay and eventual comms

`report.json` stores configuration, source fingerprints captured before training,
weights, selection history, exact test fixtures and per-case results.
`champion.json` exports only the tactical network. `replay.json` records ordinary
flight inputs at 120 Hz and requested/committed tactical choices at 5 Hz. Replay
uses the same seeded scenario constructor and real combat path. Focused tests
verify deterministic replay and reject truncated streams.

`maneuverEvents(decisions, actorId, targetId)` converts a decision log into
`maneuver-started` and `maneuver-ended` facts. It emits on committed action
changes, not every inference. Events include IDs, time, mode and termination
source: selector, separation limit, duration limit or initial state. They do not
claim to explain why a neural network made a choice. The CLI saves the selected
replay's `maneuver-events.json` alongside its controls.

These events are suitable inputs to a future comms adapter, not direct speech
commands. That adapter should decide salience, cooldowns, radio occupancy and
whether queued lines still describe the current action. It should usually skip
routine cycles and initial attack. Break alone does not imply fear or a request
for help. Coordination and support requests need explicit intent and relevant
participants before lines such as “cover me” are justified. Minimum maneuver
commitment helps stability but does not guarantee a line remains true until
playback; queued lines still need revalidation.

No production comms, emotions, pilot personalities or radio eligibility rules
are changed by this experiment.

## First run: 2026-10-29

Seed 1729, thirty generations of sixteen candidates, four fresh 25-second-limit
training encounters per candidate: 1,920 candidate encounters plus validation
and matched final comparisons. The run took about 585 seconds while other
checks ran. One training seed was evaluated. Validation selected generation zero;
later generations did not improve its score. The selected policy made no
committed breaks in either test suite and matched always-attack case for case.

| Selector | Held-out baseline opponents: W/L/T | Unfamiliar styles: W/L/T |
| --- | --- | --- |
| Learned | 28 / 0 / 4 | 18 / 0 / 14 |
| Always attack | 28 / 0 / 4 | 18 / 0 / 14 |
| Always break | 0 / 32 / 0 | 0 / 2 / 30 |
| Authored switching | 11 / 0 / 21 | 8 / 0 / 24 |

Mean learned/always-attack score was 6.6551 on held-out baseline opponents and
4.3969 against unfamiliar styles. The weak authored rule does not justify a
claim of learned improvement. This is a working executive training harness,
not evidence of better tactics or a production-ready AI.

After selection/testing, a separate diagnostic examined the timed-out hunted
case from the original validation suite. One two-second requested break starting
at 1, 3, 5 or 7 seconds, followed by sustained attack, changed it into a win.
The 5-second schedule scored 7.5 with no hull loss. Later schedules often still
timed out. This hindsight sweep is not a learned policy, a test-set selection or
a general tactical rule. It demonstrates that the fixed break can help in at
least one combat encounter; the first search failed to learn that timing.

The next training iteration should emphasize training encounters where timely
separation helps, retaining ordinary attack cases and fresh validation/test
splits. Keep combat outcomes as the objective; do not award points merely for
breaking, speaking, switching or surviving. More network capacity or training
time alone is not justified by this result. Possible sampling, search and
observation limitations have not been separated by ablations.

The experimental export is `tools/pilot-training/executive-example.json`.
Full reports are local in `output/pilot-executive/seed-1729/`, including the
validation break probe. Selected-policy results were re-evaluated after replay
serialization/decision-stream fixes and event extraction were added; all 32
held-out rows matched exactly. The original executed training source is retained
in `.scratch/pilot-executive/training-source-v1.cjs`, with its SHA-256 matching
the report. The report also records the final export source hash. Learned,
always-break and authored replay/event examples are saved separately; baseline
events must not be attributed to the learned policy. Its selected replay only
contains the initial attack event, which a future comms layer should normally
leave silent.
