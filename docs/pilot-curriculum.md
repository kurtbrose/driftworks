# Offline pilot skill studies

These studies extend [marker control](marker-training.md) with moving-marker
tracking and a separately learned approach/braking skill. They are numerical
training experiments, not gameplay controllers or evidence that learned motor
control beats a conventional controller. No deployment dependencies are added.

## Moving marker

```text
node tools/pilot-training/tracking.cjs --seed 1729 --generations 70 --out output/pilot-tracking/my-run
```

The 7-to-2 tanh network starts from the learned marker weights, adding two
zero-weight inputs for current transverse line-of-sight velocity. All sixteen
weights remain trainable. Inputs otherwise retain local marker direction and
own pitch/yaw rates. There is no intercept solver, authored steering gain or
future trajectory in the policy's observations. The harness alone knows the
future path. Outputs directly command pitch/yaw at 20 Hz with fixed 50% throttle;
production Ulysses physics runs at 120 Hz, including automatic bank.

Scenarios cycle through stationary, circular, reversing and weaving markers at
100 km, with starting bearings up to 150 degrees. Moving markers travel at
0.04-0.22 rad/s; these are attitude-control fixtures, not physically plausible
fighter trajectories at that range. Reversals change velocity instantly while
preserving position. Weaving uses a 0.8 rad/s sinusoid. Velocity observations are
analytic derivatives of those paths; focused tests independently differentiate
the positions to check them. Translation and current own velocity affect the
observed line of sight.

Training uses 32 candidates on eight changing scenarios for 70 generations.
The first fifteen generations restrict initial bearings to 70 degrees. Separate
sixteen-case validation selects the best checkpoint; 64 untouched mixed test
cases and 64 further stationary regression cases are evaluated afterward.
Training episodes last eight seconds, validation/test episodes ten. Tracking
statistics exclude the first three seconds for acquisition but include the
reversal transient. The loss includes integrated angular error, control effort,
command changes and extra terminal angular error. It does not penalize the
nonzero angular speed needed to follow a moving marker.

The zero-new-weight transferred marker policy is the baseline. The comparison
measures the value of training for motion, not superiority over authored flight.
`stableFinalSecond` includes a low angular-speed requirement and is meaningful
for stationary retention; use error/within-one-degree time for moving markers.

## Approach and stop

```text
node tools/pilot-training/arrival.cjs --seed 1729 --generations 60 --out output/pilot-arrival/my-run
```

The original learned marker skill supplies pitch/yaw and is frozen. A separate
4-to-1 tanh network learns throttle from range/400 m, radial closing speed/70 m/s,
forward speed/70 m/s and forward alignment. Its five parameters are sampled from
an initially zero-mean distribution with standard deviation one; no braking
formula, authored throttle scaffold or demonstration is supplied. Throttle
commands use the ordinary -1 to 1 range, including the production slow reverse.
`--tracking` can instead select a moving-marker export, but changing the steering
skill requires a fresh evaluation; the measured run uses the original marker
export. The arrival export embeds the exact steering weights it used.

Starting ranges are 100-400 m, forward speeds 0-35 m/s, bearings 5-110 degrees,
and pitch/yaw rates -0.3 to 0.3 rad/s. Targets remain stationary. Each generation
evaluates 24 throttle networks on four fresh cases. Separate twelve-case
validation selects the checkpoint; 64 untouched cases are used only afterward.
Training episodes last sixteen seconds and evaluation episodes twenty seconds.
The loss penalizes integrated range, command changes and effort, with extra
distance and speed costs in the final four seconds. Success requires staying
within 15 m and below 3 m/s throughout the final two seconds. A zero-weight
throttle network means zero throttle, with the same learned steering.

The approach and tracking skills are parallel follow-ups to marker control,
not a combined moving-target rendezvous controller. There is no collision
avoidance, terrain, weapon use or tactical awareness in either experiment.

## Results on 2026-10-29

One training seed per study, with separate held-out cases:

| Study | Held-out result |
| --- | --- |
| Moving-marker baseline | 2.362 degrees mean tracking error after acquisition |
| Trained moving-marker policy | 0.214 degrees; 97.15% of post-acquisition time within one degree |
| Stationary retention | 64/64 within one degree and below 0.05 rad/s throughout final second |
| Learned arrival | 64/64 within 15 m and below 3 m/s throughout final two seconds |
| Arrival mean terminal bounds | 1.917 m distance; 0.098 m/s speed |

Arrival means average each episode's maximum over the final two seconds, not
just its endpoint. The moving policy's mean errors by path were 0.060 degrees
stationary, 0.135 circular, 0.333 reversing and 0.327 weaving. The worst sampled
post-acquisition error was 5.57 degrees during a reversal: tracking is not
perfect. No second training-seed replication, human visual acceptance, authored
controller performance comparison or runtime integration was performed.

Example exports are `tools/pilot-training/tracking-example.json` and
`arrival-example.json`. Local ignored reports, complete fixtures and sampled
control traces are under `output/pilot-tracking/seed-1729/` and
`output/pilot-arrival/seed-1729/`. Both scripts refuse to replace an existing
report. They use synchronous CPU search, save only at completion and do not
support resume. Reports include source hashes, selected generation and history.
The tracking report was re-evaluated after adding reporting metrics and a
zero-distance guard; its loss matched the original selected policy exactly.

## Recommended production direction

Keep these skills as training-pipeline studies. For the game, investigate a
learned tactical executive over reliable authored flight/aiming controllers.
The existing `training.js` already separates steering, intercept tracking and
mode/goal decisions, offering an initial boundary for that experiment.

Start with one opponent and two executable actions: attack with intercept
aiming, or break to establish separation. Define and verify each maneuver before
training the selector, including acceleration limits, firing constraints and
break completion. Give choices a minimum commitment or explicit termination
condition to avoid rapid switching. Freeze the underlying controllers during a
training comparison. Train against simple opponents, then evaluate unseen
geometries/opponents against a fixed authored switching policy, always-attack
and always-break baselines. Damage, kills and exposure should be measured;
surviving forever or merely switching modes must not earn success.

Only expand to target selection, desired range, boost budgeting and support of
wingmates after the two-action task demonstrates useful behavior. Firing intent
can be tactical, while a low-level gate still checks alignment, range, friendly
obstruction and weapon availability. Perfect intercept under a motion model
does not guarantee a future hit against an opponent that can maneuver.

This executive is a proposed next experiment, not an implemented or trained
feature. These motor studies do not justify continuing an end-to-end pilot as
the primary gameplay architecture or establish runtime savings.
