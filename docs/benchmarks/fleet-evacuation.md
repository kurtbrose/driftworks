# Fleet evacuation prototype readiness

## Staged Jade ambush follow-up

The current mission replaces the original opening battle below with a quiet
patrol, a hostile opening, a physical convoy dodge, capital bombardment and delayed
relief. The earlier measurements remain historical, not current timing claims.

The actual armed rig was stepped alongside the real mission through Bastion's
96–126 s arrival window, without moving the enemy fighters into a test firing
range. After keeping Bastion nearer the convoy and fixing premature strike-wing
withdrawal, the seed-29 probe recorded 832 point-defense rounds and 264 confirmed
capital-rig hits. Two successive wings fired 80 cargo-directed fighter rounds
before relief. Only the test pilot's durability was increased; cargo, opponents,
weapons, steering and shields retained their normal rules. These are combat
behavior measurements, not frame-time measurements.

A separate foreground frozen review at roughly 120 s used the real session and
production artwork over Jade, 1920 × 1080 backing, DPR 1.5, 100% render scale.
The review fast-forwards convoy physics without capital scenery fire, then resumes;
it is useful for presentation inspection, not an exact replay of capital casualties.
Camera: about 2.3 km before the rescue mouth and 450 m above it, facing the mouth.
The same camera, actors and effects were frozen for OFF/ON/ON/OFF, with 20 warm-up
and 90 samples per block. No tests or rebuilds were launched by this chat during
sampling; another development chat was active, so background machine load was
not fully controlled.

| Capital actors | CPU submission median / p95 | Frame median / p95 | Draws | Triangles |
| --- | --- | --- | --- | --- |
| OFF | 2.50 / 3.10 ms | 13.30 / 13.50 ms | 60 | 1,752,100 |
| ON | 8.10 / 9.70 ms | 13.30 / 13.50 ms | 325 | 1,832,858 |

The added armed capital/effects submission is about 5.6 ms median in this view.
That is a real cost; refresh-limited cadence does not establish spare live-combat
budget. GPU execution remains unmeasured. Shared immutable hull/turret buffers
remain in use; the focused capital regression checks reuse and replacement-state
reset. Larger fleets should be profiled before adding actors.

Visually inspected the initial Jade patrol, Bastion's cover position and close
underside, including hull crossing the viewport boundary. Original scale,
finishes and articulated geometry were preserved. The shared-wormhole work in
the other chat owns traversal/destination skies and attached-effect placement;
this encounter pass does not claim that integration complete.

Ignored evidence: `output/convoy-ambush/tactics-final.txt`,
`fighter-intent-before.jsonl`, `fighter-intent-after.jsonl`, `capital-abba.txt`,
`bastion-cover.png`, and `bastion-underside.png`. The before probe caught healthy
waves 2 and 3 withdrawing with zero shots; the regression now guards against
that exact failure and against retreat goals too close to satisfy departure.

## Original battle prototype

Two original Aegis capitals replace the convoy's idle reception pair in the
separate `fleet-evacuation` sortie. They retain authored metre scale, materials,
component pivots, hull/shield contacts and projectile damage. Eighteen screen
fighters and two wingmates start active; nine enemy reinforcements are finite.
No new meshes, dependencies, build step, or external runtime resources.

## Capital render comparison

Actual `experiments/flight.html?mission=fleet-evacuation`, production artwork,
Open Void background, 100% render scale, 1326 x 1332 backing pixels, DPR 1.5.
Built-in frozen comparison: OFF / ON / ON / OFF, 20 warm-up and 90 measured
frames per block. Both poses, camera, cargo, fighters and settings fixed;
AI/projectiles frozen. No concurrent tests or asset refresh during these samples.

| View | Capitals | CPU submission median / p95 | Frame median / p95 | Draws | Triangles |
| --- | --- | --- | --- | --- | --- |
| Battle overview | OFF | 1.70 / 2.10 ms | 13.30 / 13.40 ms | 41 | 1,965,346 |
| Battle overview | ON | 4.70 / 5.40 ms | 13.30 / 13.40 ms | 223 | 2,032,474 |
| Bastion underside | OFF | 0.90 / 1.10 ms | 13.30 / 13.40 ms | 3 | 874 |
| Bastion underside | ON | 2.30 / 2.60 ms | 13.30 / 13.40 ms | 79 | 31,922 |

Review cameras are relative to the actual capital positions. Overview looks at
their midpoint from 5 km aft and 1.3 km above; underside is 180 m lateral,
200 m aft and 400 m below Bastion's origin, looking at its center. These controls
set the production camera explicitly before benchmarking.

The pair adds 182 submitted draws and about 3 ms median CPU submission in the
overview. The close view adds 76 draws and about 1.4 ms. Armed articulated mounts
cost more draws than the original idle reception fleet. Existing GPU poses and
shared immutable geometry are retained: the capital regression verifies that
motion and reset keep the same vertex buffers and batch list. No reduction in
appearance or gameplay was applied. These samples establish rendering cost in
these views, not spare live-combat budget. Browser cadence is refresh-limited;
GPU execution is unmeasured. If larger fleets are added, articulated mount
instancing is a measured next candidate rather than raising fighter counts.

## Live effects follow-up

The first live overview observation showed 52 explosions / 134 blast batches,
498 draws, about 43 FPS, 21.4 ms CPU and 11 ms scene submission. Investigation
found that every routine heavy capital hit was flagged as a destruction effect,
keeping its full explosion alive for 5.5 s. Only this new sortie now uses ordinary
0.22 s impact flashes for those hits. Damage, bolts, shield feedback, destroyed
components and actual capital destruction retain their existing behavior.

A subsequent live overview run, same resolution/scale and initial review camera,
showed 58.5 FPS, 17.1 ms mean frame interval, 26.7 ms p95, 14.1 ms CPU and 6.4 ms
scene submission, 350 draws and zero active destruction explosions at the sampled
moment. The lifetime worst interval was 495.9 ms, so this is not a hitch-free
claim. No tests or asset refresh ran during either observation. These live
snapshots are not a matched deterministic A/B: battle age and exact effects differ,
and F3 exposes the rolling statistics by pausing. They identify and verify removal
of the routine-hit explosion load, not an isolated 43-to-59 FPS speedup guarantee.
The strict frozen capital comparison above remains the controlled render evidence.

Visually inspected the normal convoy launch, close moving Bastion underside
with live fighters/projectiles, and capital geometry crossing screen boundaries.
The authored hull, finishes and moving mounts remain visible without observed
large-actor culling holes. This is not exhaustive playtesting or visual approval
of every mission phase; portrait assets were reused without modification.

## Behavior checks and limits

The production fixed-step session's seed-29 crossing finishes at about 330 s,
with individual arrivals beginning around 290 s. The replay gives only its test
pilot extra durability; NPC rules, hulls, weapons, movement and outcomes are
unchanged. It verifies finite waves, live withdrawal steering, no forced cleanup,
extraction target/damage ownership, all-cargo loss, and reset. This unattended
replay is progression coverage, not a difficulty or player-agency acceptance test.

Capital gun stepping remains owned by the existing browser Aegis facade and is
not part of that headless replay. The separate actual-rig test runs both moving
capitals for 20 s: 176 shots, 114 hits, integrity 18,880 / 18,840, zero hangar
launches. It verifies reciprocal real damage, geometry reuse, reset attachment
to the replacement mission state and ceasefire on completion. Losing Bastion
also has a focused emergency-withdrawal regression.

Local ignored evidence: `output/fleet-evacuation/overview-abba.txt`,
`underside-abba.txt`, `bastion-underside.png`, `battle-overview.png`,
`live-impacts.txt`, and `headless-replay.txt`.
The render comparison used Aegis asset `assets/ships/aegis-kit/flight-rig.js`
without modifying its bytes. Mission pacing and live combat frame budget remain
the next playtest concerns; full-scene GPU execution is not established here.
