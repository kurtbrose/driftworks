# From-scratch marker control

This offline experiment asks whether a neural network can learn to turn a
Hercules toward a stationary marker and settle smoothly. It uses the production
`DW.arcade.step` integrator at 120 Hz, including automatic bank during yaw.
It does not change gameplay, ship physics or deployment dependencies.

Run from the repository root with Node; no installation is needed:

```text
node tools/pilot-training/marker.cjs --seed 1729 --generations 70 --out output/marker-training/my-run
```

Use a fresh output directory. `report.json` contains the configuration, training
history, selected weights, baseline, all held-out results and 20 Hz control
traces. `champion.json` is the standalone policy export. Training is synchronous
CPU work and only writes results after completion; there is no resume support.
Outputs belong under ignored `output/`, not in deployment assets.

## Task and policy

The marker is fixed 100 km from the initial ship position. Initial bearings range
from 5 to 150 degrees off the nose with random azimuth and initial pitch/yaw
rates between -0.3 and 0.3 rad/s. Throttle is fixed at 50%; boost, strafing and
roll demand are zero. Translation remains active, so the bearing changes slightly
as the ship flies. The deliberately distant marker isolates pointing from
arrival and overshoot. This is one ship profile in empty Euclidean space.

Five observations enter a single fully connected layer: marker direction along
local right, up and forward, plus own pitch and yaw angular rates in rad/s.
Two tanh outputs directly command pitch and yaw, held at 20 Hz. There are twelve
learned parameters including biases. There are no aiming equations, lead solver,
authored turn gains, demonstration labels or residual control layer. A zero-weight
policy commands zero pitch and yaw regardless of marker position.

The small architecture is intentional: it tests whether learning can discover
directional steering and damping before adding network capacity or combat.
It cannot represent arbitrary tactical behavior or memory.

Training uses a diagonal cross-entropy search: sample 32 random networks, retain
the best quarter on six common scenarios, update the parameter distribution and
repeat. Initial parameter means are zero, standard deviations 0.7; no controller
weights are supplied. The first twenty generations use bearings up to 70 degrees,
then up to 150 degrees. Cases change each generation. A separate sixteen-case
validation suite selects a checkpoint every five generations and at the end;
only then does the policy face 64 untouched test cases for eight seconds each.
Training episodes last six seconds. This is population-based optimization, not
gradient descent or PPO.

The loss integrates squared angular error, angular speed and control effort,
plus squared command changes. The final two seconds additionally penalize
absolute angular error and angular speed to favor settling. See the source for
the exact coefficients. There is no reward for survival or shooting.

## Reading the measurements

`finalSecondErrorDegrees` and `finalSecondRate` average the last second of each
episode. The latter includes pitch/yaw angular speed, not automatic roll.
`settledAt` records the first continuous half-second within one degree and below
0.05 rad/s pitch/yaw speed. That is an acquisition measure; a policy could drift
afterward. `stableFinalSecond` instead counts cases that stay within both limits
throughout their entire last second. Maximum terminal errors and rates are also
reported. `controlVariationPerSecond` sums absolute pitch/yaw command changes,
including the initial command from neutral, per simulated second; some variation
is necessary to turn and brake. Inspect the saved traces as well as aggregate
scores. Zero control has low variation but fails the pointing task.

The test suite checks determinism, seeded scenarios, direct learned control and
the 20/120 Hz cadence through `node tests/pilot-training.cjs`. Numerical success
on this task does not establish a visually satisfying combat pilot, cross-ship
generalization, collision avoidance, close-marker behavior or exactly rearward
recovery. Those require separate tasks and evaluations.

## Measured results (2026-10-28)

Two independent 70-generation runs, 32 candidates per generation, used the
settling objective described above. Each evaluated 2,240 sampled networks on
13,440 training episodes, plus validation and test episodes. Each seed has its
own untouched 64-case test suite. The zero-weight baseline is no steering, not
the existing authored pilot.

| Training seed | No-steering final error | Learned final error | Stable final second |
| --- | ---: | ---: | ---: |
| 1729 | 74.79 degrees | 0.262 degrees | 64/64 |
| 2718 | 83.98 degrees | 0.175 degrees | 64/64 |

For seed 1729 the worst case's mean final-second error was 0.263 degrees;
mean terminal pitch/yaw speed was 0.0000156 rad/s, and median first settling
time was 2.77 seconds. Thus these cases settled, rather than repeatedly passing
through the marker at speed. Wall times were about three minutes per run on
this machine with other checks running; these are not isolated throughput
benchmarks. The source has no new runtime or training package dependency.
Sampled traces show transient overshoot and damped corrections during the turn;
this is successful settling, not an optimality claim or a claim of zero oscillation.

The first run's export is retained at
`tools/pilot-training/marker-example.json`, chosen as the initial demonstration
rather than by comparing the two test scores. The regression evaluates it on
eight additional seeded cases. Full local reports and sampled control traces
are under `output/marker-training/settling-1729/` and `settling-2718/`.

An earlier acquisition-focused objective also learned pointing, but seed 1729
finished with a 1.06-degree average error and only 13/64 cases ever meeting the
settling criterion. Strengthening terminal error/rate costs fixed this specific
shortcoming in the two subsequent runs. Earlier reports are retained locally
under `output/marker-training/seed-1729/` and `seed-2718/`; their loss values
are not comparable to the settling objective. This is evidence that task/reward
design matters even in this small problem, not proof that combat will scale
automatically. No browser or human visual acceptance is claimed.
