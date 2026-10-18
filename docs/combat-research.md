# Combat research laboratory

## Team furball benchmark

The initial diagnostic and target-lock snapshots below predate model-derived gun counts
and used two muzzles per ship. They remain historical evidence; rerun the same
commands to measure current firepower rather than treating those results as a
current baseline.

Run `node tools/evaluate-flight-furballs.cjs --seconds 120 --seeds 5` for matched
2v2, 3v3 and 4v4 shielded/unshielded fights. Optional `--style` selects the live
opponent maneuver policy (default `baseline`). Both wings use the live furball
controller at veteran skill, mirrored Hercules/Ulysses loadouts with native guns,
mixed triangle collision hulls, and the normal shield recharge. Seeds perturb
opening positions and decision timing. This tests ordinary NPC combat, rather
than the separate Perfect/human testing pilot. No player participates, terrain
interferes, or replacement waves spawn; the run stops when a wing is eliminated
or reaches the time limit.

The JSON includes source hashes, individual runs, zero-kill counts, unfinished
rounds, kills per fight, and first-kill times. A first-kill median excludes
zero-kill runs, which are censored at the time limit; always read both together.
Unfinished rounds can still have kills. `longestQuiet` includes the opening and
final interval without kills. The runner checks team sizes, defense setup and
deterministic replay. The captured baseline is
[flight-furballs.json](../tests/benchmarks/flight-furballs.json); results describe
that source revision and setup, not all ship matchups or human enjoyment.

The initial five-opening, 120-second baseline produced zero kills in all five
runs of every size, with or without shields. Every shielded craft retained full
hull. Unshielded mean combined hull remaining was 676.4/860 (2v2),
1028.3/1220 (3v3), and 1420.7/1580 (4v4). These cases show a broader lack of
sustained lethal damage in the baseline NPC policy; shields also prevented all
hull progress. They do not isolate recharge from capacity or establish results
for other policies/loadouts.

### Firing diagnostics

Reproduce the instrumented batch with
`node tools/evaluate-flight-furballs.cjs --seconds 120 --seeds 5 --output tests/benchmarks/flight-furball-diagnostics.json`.
The [captured report](../tests/benchmarks/flight-furball-diagnostics.json) retains
per-pilot times, modes, target occupancy, actual target changes, opportunities,
ordered firing-gate samples, emitted bolts and collided bolts. Tests for the
observer run with `node tests/flight-furball-telemetry.cjs`. Each batch also checks
deterministic replay, gate-time conservation, and unchanged outcomes against the
original baseline when simulation source hashes and case durations match.

Unshielded results across five openings, 120 seconds each:

| Teams | Hits / bolts | Hit rate | In firing range | Controller opportunity | Trigger held | Target switches / pilot-minute | Mean opportunity window |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 2v2 | 68 / 1950 | 3.49% | 83.0% | 26.2% | 7.14% | 6.08 | 1.01 s |
| 3v3 | 71 / 2734 | 2.60% | 85.8% | 24.4% | 6.38% | 9.48 | 0.68 s |
| 4v4 | 59 / 3926 | 1.50% | 85.8% | 25.3% | 6.82% | 9.45 | 0.67 s |

Times use living pilot-seconds, not elapsed fight time. A controller opportunity
requires attack mode, permitted range, valid gun solution and alignment with the
controller's actual goal, before the burst-duty gate. Opportunity windows are
contiguous sampled intervals, including any opening/final partial interval.
The observer samples at the gun-step boundary after steering. Range in the live
trigger uses the slightly earlier pose, so reconstructed gates are approximate
near thresholds; actual trigger time and shot/hit counters are authoritative.
Ordered gates report only the first failure, not independent causal effects.
Hits include any opposing hull; bolts still flying at the cutoff remain in the
shot denominator. Target switches exclude initial acquisition and repeated
selection of the same opponent. Most switches occur between tactical decisions
(238/243, 556/569, 743/756), leaving the old goal until the next decision.

About 38–42% of pilot time is outside attack mode. Misalignment accounts for a
further 29–35% as the first failing gate. The 0.8-of-3-second burst duty closes
roughly 73% of otherwise eligible opportunity time. Independently checking the
shared intercept rather than the navigation goal finds in-range alignment for
only 19.0%, 15.8%, and 15.3% of pilot time. Baseline steering blends only 70% of
the lead displacement at veteran skill and adds a sinusoidal lateral goal error
of up to 16 m; that navigation goal also controls the firing alignment check.
This explains why passing the controller's aim gate need not aim at an intercept.
These observations implicate sparse trigger use and poor shot placement; shorter
windows and more switching correlate with the decline in larger fights. A
matched target-lock or aim-policy ablation is needed to assign causality. No
weapon, shield, flight, or controller tuning was changed for these measurements.

### Matched target-lock experiment

Run `node tools/evaluate-flight-furballs.cjs --target-lock --seconds 120 --seeds 5 --output tests/benchmarks/flight-furball-target-lock.json`.
This runs the same five openings at each team size with both defense settings,
pairing the normal timer policy with an experiment-only until-death lock on both
teams. Only the target reconsideration timer is held while the selected opponent
remains alive. Initial selection, selection after a target dies, tactical
decision cadence, aim, flight, fire gates, weapons and defenses use unchanged
live code. This tests sustained commitment, not focus-fire coordination or
immediate re-aiming after a kill.

Initial world hashes must match within each pair, both policies must replay
deterministically, and normal-policy outcomes must match the original baseline
when its simulation source hashes match. The report includes per-case deltas
and pooled hit rates (total collided bolts / total emitted bolts). Tests verify
that locking changes only the valid target's timer and leaves dead, absent or
friendly targets available for replacement by the live selector. The helper
lives only in the Node benchmark; ordinary gameplay targeting is unchanged.

The [matched report](../tests/benchmarks/flight-furball-target-lock.json) contains
60 fights (30 pairs), each capped at 120 seconds:

| Teams | Defenses | Normal hit rate | Locked hit rate | Normal / locked kills, across five fights |
| --- | --- | ---: | ---: | ---: |
| 2v2 | Shields | 3.49% | 4.08% | 0 / 0 |
| 2v2 | Unshielded | 3.49% | 4.08% | 0 / 0 |
| 3v3 | Shields | 2.60% | 4.52% | 0 / 0 |
| 3v3 | Unshielded | 2.60% | 4.56% | 0 / 1 |
| 4v4 | Shields | 1.66% | 1.28% | 0 / 0 |
| 4v4 | Unshielded | 1.50% | 1.42% | 0 / 0 |

All five 3v3 openings improved accuracy with either defense setting. Only two
2v2 openings improved despite the higher pooled hit rate. In 4v4, one shielded
and two unshielded openings improved. The single kill occurred at 91.575 seconds
in unshielded 3v3 seed 5; no wing was eliminated in any run. Locked runs had no
target switches except the replacement after that kill. Opportunity windows
grew in 2v2 (1.01 to 1.77 seconds) and 3v3 (about .68 to .98–.99 seconds), but
not in 4v4. Holding a target helps some setups, particularly 3v3, but is not a
general cure for low lethality. Five seeds are descriptive evidence, not a
statistical guarantee. Further aim or burst-duty experiments should remain
separate matched interventions.

Hits from projectiles still in flight after their shooter dies count toward
accuracy; dead pilots accrue no further opportunity or trigger time. The runner
checks telemetry totals against the actual gun counters as well as replay and
initial-state matching.

### Corrected primary gun-count rerun

The [native-count report](../tests/benchmarks/flight-furball-native-guns.json)
reruns all 60 cases from the target-lock experiment with four Ulysses mounts and
six Hercules mounts, replacing two on both ships. Reproduce with
`node tools/evaluate-flight-furballs.cjs --target-lock --seconds 120 --seeds 5 --output tests/benchmarks/flight-furball-native-guns.json`.
The design, five seeds, opening geometry, weapon types, veteran aim/flight AI,
defenses and target policies match the earlier report. The changed simulation
source hashes are only `retail-profiles.js`, `guns.js`, and `training.js`: numeric
mount import, variable-count muzzle emission and passing each NPC's count.
Extra muzzles use the temporary six-metre rack; this is not a complete retail
bank, missile or energy model.

Kills rose from 1 to 14 across 60 fights. All 30 shielded fights still had zero
kills at the 120-second cutoff. Unshielded results, with five fights per cell:

| Teams | Normal targeting kills: old → new | Normal fights with a kill | Normal first kill, median among killing fights | Target-lock kills: old → new | Locked fights with a kill | Locked first kill, median among killing fights |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 2v2 | 0 → 1 | 1/5 | 109.4 s | 0 → 0 | 0/5 | Not reached |
| 3v3 | 0 → 2 | 2/5 | 73.4 s | 1 → 7 | 4/5 | 53.8 s |
| 4v4 | 0 → 2 | 2/5 | 68.9 s | 0 → 2 | 2/5 | 78.8 s |

These are first-kill times since the opening, not per-target damage-to-death
durations or unconditional TTK medians. Zero-kill fights are censored at 120 s
and excluded from the conditional medians, so read them with the event counts.
Only locked unshielded 3v3 has a majority of cases producing a kill; its
censor-aware median first-kill time across all five openings is 64.1 s.
The previous two-gun locked 3v3 cohort had just one kill, at 91.6 s.

Unshielded pooled hit rates changed from 3.49% to 2.78% (normal 2v2), 2.60% to
2.50% (normal 3v3), and 1.50% to 1.52% (normal 4v4). Locked rates changed from
4.08% to 4.00%, 4.56% to 3.90%, and 1.42% to 1.53%, respectively. More mounts
increased delivered hits and kills without a general improvement in accuracy.
Eleven of 30 unshielded fights had at least one kill; just one fight eliminated
an entire wing (locked 3v3 seed 5). Correcting firepower helps, particularly with
sustained target commitment in 3v3, but does not resolve shielded lethality in
this guns-only NPC setup. Missiles, aim and balance remain unchanged.

Open [the combat study page](../experiments/flight-study.html) through the local static server. It runs the existing fixed-step duel in a Web Worker without graphics, audio, or real-time pacing. No simulation data leaves the browser. The flight lab and headless runner share ship physics, guns, damage and AI policies.

## Research questions and stages

1. Compare opponent personalities under matched conditions. The default 60 cases hold Hercules/native cannon/retail defenses fixed and cross baseline, FreeSpace-inspired pursuit and pursuit + escape, five geometries and four testing pilots against veteran skill. The question is whether each style delivers recognizable pressure and counterplay, not which wins most.
2. Select paired shielded/unshielded defenses. Each pair holds pilot, seed, geometry, ships and weapons fixed. Both ships retain their own class hull; both receive their class shields when enabled. Ask whether shields create additional maneuvering time or merely extend unresolved fights.
3. Vary cannons on a small shortlist of ships. Native means each class's default primary; an explicit cannon equips both sides. Equivalent native/explicit setups are deduplicated. Keep physics and opponent behavior fixed while identifying useful starting loadouts.
4. Expand shortlisted matchups to ordered cross-class pairings and multiple human seeds. Swap ship assignments and include all geometries: seat and starting geometry influence results. Anchor pairing uses the first checked ship in displayed order.
5. Watch flagged cases, then fly the shortlist yourself. Compare each experimental style to the baseline with identical seed, geometry and loadout; candidate cases include a Matched baseline watch link.

The page caps a design at 2,000 duels and each duel at 120 simulated seconds. Begin small; faster-than-real-time does not mean free CPU. Stop terminates the worker and preserves received batches. A partial report is a fixed-order prefix, not a representative random sample.

## Pilots and interpretation

The perfect pilot is a best-effort legal-input stress agent, not an optimal-control proof. It is deterministic without seed-dependent variation, so repeated seeds do not create independent trials. Human simulator seeds vary imperfect observations and controls; these pilots try to succeed and do not deliberately throw fights. They are currently uncalibrated stand-ins, not measured human populations. Baseline retains the existing opponent behavior. Experimental styles are opt-in. The flight lab style selector also applies to manual training waves; baseline remains the initial selection. Watched one-on-one cases retain exact matched configurations; normal manual waves retain their usual varying class/skill setup.

The report groups opponent style, ship/weapon pair, pilot, opponent skill and defenses across selected geometries and human seeds. It records outcomes, elapsed simulation time, dry intervals, remaining defenses, firing opportunities, range and maneuver changes in per-case JSON. Group rows show completed-kill median, mean observed duration, timeout fraction and longest dry interval, plus time-weighted mean range, attack/disengage fraction, firing-solution fraction and rear-cone occupancy. Styles are grouped alphabetically, never ranked by a composite score. Partial reports may have incomplete style blocks.

A timeout is unfinished at the selected limit: do not treat it as a kill at that time. Completed-kill medians exclude timeouts and can therefore look deceptively short. Read them alongside timeout fraction. Matched shield differences compare **capped observed duration**, not uncensored time to kill; the report counts pairs affected by timeouts. No confidence intervals or population-level claims are justified by this initial screening design.

Flagging thresholds are exploratory: kills under three seconds, dry intervals of at least ten seconds, or any timeout. These identify cases to inspect, not automatic balance failures. Watch links open the exact configuration paused in the flight lab; press Play to observe it.

## Reproducibility and limits

Download JSON for canonical per-case options, results, design, AI version, fixed cadence and source SHA-256 fingerprints where browser Web Crypto is available. Markdown provides a readable summary plus every case's options. Preserve the corresponding source revision: a Watch link reruns current code and is not an archived input replay. Existing CLI duel recordings remain available for input-level replay; see [AI validation](flight-ai-validation.md).

Imported FreeSpace values are starting points, not a reproduction of retail balance. Current experiments use pooled shields and shared regeneration rules, model-derived primary counts with temporary muzzle positions, unlimited fuel/weapon energy, and no missile or subsystem simulation. The model deliberately preserves Driftworks' continuous arcade flight. Ship art is independent of these numeric profiles. See [loadout provenance and adaptations](retail-flight-loadouts.md).

## Human playtesting questions

- Is there enough time to understand a threat and react after taking damage?
- Are opponents satisfying to chase, and do their openings feel earned?
- Does extra durability create reversals and recovery, or repeated turning contests?
- Do class differences feel meaningful without making some fights tedious or inevitable?
- Do simulator failure patterns resemble actual player errors?

Keep observations beside seeds and case IDs. Win rate and kill time can identify extremes; neither measures enjoyment. Establish satisfying single-opponent combat before researching squadron pressure.

## Implementation boundaries and checks

`flight-study.js` plans bounded experiments and aggregates results; `flight-study-worker.js` runs the shared duel; `flight-study-page.js` owns browser controls and downloads. The page adds no gameplay behavior, balance changes, rendering dependency or build step. `flight-duel.js` validates Watch query options before the flight lab starts a configured duel.

Regression coverage checks deterministic trial deduplication, equivalent weapon deduplication, censored duration reporting, matched shield comparisons and Watch configuration round trips. Browser verification covers worker execution, report rendering, cancellation, exports and opening a case in the flight lab. Run `npm run check` after changes.

## Experimental opponent repertoire

| Style | Intended pattern | Deliberate opening / risk | Watch for |
| --- | --- | --- | --- |
| Baseline | Existing lead pursuit, close breaks and recovery | Existing predictable attack bursts | Reference for every matched case |
| Aggressor | Direct pressure, reduced lead, high throttle; late 95 m break | Overcommitment and overshoots | Sustained close pressure without repeated collisions |
| Interceptor | Bounded future-position steering outside 350 m, gun lead close in | Target reversals can defeat the prediction | Cutting across turns versus chasing stale predictions |
| Passer | Full-throttle attacks; start extending below 280 m, hold exit for 3.8 s | Exposed during extension; may yield poor attack angles | Clear attack/exit/return rhythm versus long empty travel |

These are initial prototypes, not imported FreeSpace implementations or proven fun opponents. All retain the same skill-dependent decision cadence and existing attack-only firing window. Break headings are held rather than re-aimed away every decision; an attack commitment separates exits to limit oscillation. Goal selection stays in tactical code, shared steering executes it, and shared arcade physics moves the craft. No strafe or coast command is added. Existing collision-shell behavior remains unchanged.

Behavior metrics use observed time: attack is the attack mode; disengage includes break/recover/evade; gun opening is an in-range forward firing solution independent of whether the trigger window is open; rear occupancy is behind the testing pilot within a roughly 98-degree rear cone, irrespective of range. Mean range includes all observed distances. These are descriptors, not desired maxima. Interceptor and aggressor may still converge on similar patterns: if watching confirms that, revise the geometry rules rather than inventing a scoring reward.

Use `node tools/evaluate-flight-ai.cjs --style passer` for CLI evaluation. Watch query links and canonical replay options carry `opponentStyle`; absent fields in older options default to baseline. Source hashes distinguish policy revisions. Tests cover replay determinism for each style, matched study setup, style validation and a fixed-heading pass-fighter exit.

### Initial screen observation

An initial browser screen (Hercules mirror, native guns, retail shields, veteran, five geometries, one seed, four testing pilots, 30-second cap) showed distinct mode budgets: aggressor about 61-62% attack; passer about 39-40% attack and 60-61% disengagement. It also exposed a failure worth watching: all 20 aggressor cases timed out, with mean range near 96-108 m, often inside the existing 130 m minimum firing range. That is an undesirable close-engagement trap, not evidence that the aggressor is a better opponent. Interceptor also remained close (about 97-101 m). These prototypes need geometry/spacing iteration and human observation before promotion. Longer timeouts or higher durability are not the prescribed fix. Passer shows a different duty cycle but its intended fast-pass rhythm still needs visual confirmation and playtesting.

## FreeSpace technique experiment

The first source-backed implementation adapts [recommendations 1 and 2](flight-ai-freespace-research.md#prioritized-improvements). Source provenance remains the pinned FreeSpace Open revision in that report: `aicode.cpp` functions `attack_set_accel`, `ai_chase`, `ai_chase_ga`, `set_predicted_enemy_pos` and the `SM_GET_AWAY` transition. Basic chase/escape behavior is documented in the older snapshot; this experiment does not implement the later optional proximity detector or claim to reproduce retail FreeSpace behavior.

- **fso-pursuit:** compute relative closure and facing; use a bounded ship-motion navigation goal blended toward projectile lead near a useful firing geometry. Keep a distinct gun-solution target so navigation lag never authorizes firing at a navigation waypoint. Throttle matches projected target speed plus range correction, with a .45 forward floor; use bounded overshoot escapes instead of stopping or reversing. Productive aligned pursuit suppresses ordinary close-range escape. The .45 floor, 330 m desired range and other thresholds are Driftworks hypotheses, not FreeSpace constants.
- **fso-breaker:** the same pursuit policy, plus a seven-second nearby no-progress detector. A sustained .25-second firing opportunity or damage to either participant resets progress; mode changes alone do not. After cooldown, a stagnant fight commits to one latched forward/away/oblique escape point, holds for at least two seconds, and ends after reaching 550 m or at the first tactical decision after its five-second deadline. Overshoot exits have a three-second deadline (also evaluated at tactical cadence) and 450 m exit after 1.5 seconds. A held reacquisition point guides a bounded re-entry (at least .6 seconds before facing exit, at most 2.5 seconds), then normal pursuit resumes. Re-entry starts a six-second re-break cooldown. Safety steering can override any maneuver.

Both variants preserve skill decision cadence and the existing range/alignment/attack-only trigger duty window. They change effective shot placement through maneuvering and the separate valid gun target, so outcomes are not a pure speed-control ablation against baseline. Comparing the two new variants isolates the additional no-progress escape. Gun directions, damage, weapon cooldown, shields and flight integration are unchanged. Delayed observations, skill redesign, reactive bullet dodges and squadron tactics are deferred.

The study defaults to 60 matched cases: three policies, five geometries, four testing pilots, veteran skill, Hercules mirror/native guns/retail defenses, seed 1, 30-second limit. Candidate links offer Matched baseline; breaker cases also offer **Without no-progress escape**, retaining every other option. The table and JSON include no-progress escapes / all separations. Counts record entries, not successful resets; inspect whether the exit actually produces another opening. Flight-lab readouts show policy, mode and entry counts. Select a style under Starting setup, then choose Fly manually to try it in ordinary training waves.

Initial results are preserved with source fingerprints in [the matched benchmark](../tests/benchmarks/flight-fso-techniques.json):

| Policy | Timeouts / 20 | Time-weighted mean range | Attack time | No-progress escapes | Cases with >=10 s dry interval |
| --- | ---: | ---: | ---: | ---: | ---: |
| Baseline | 13 | 157 m | 30% | 0 | 5 |
| Pursuit | 15 | 113 m | 43% | 0 | 14 |
| Pursuit + escape | 13 | 118 m | 40% | 18 | 11 |

This is mixed evidence: adding escape to the same pursuit policy reduced some dry/unfinished cases, but neither variant establishes an improvement over baseline. Both still spend too long close to the 130 m minimum firing range. Keep them experimental. Watch matched crossing and turning cases, ask whether the break is readable and chaseable and whether return legs create fresh openings; then fly each style manually. Do not interpret survival, repeated escape entries, or fewer timeouts as enjoyment. The next spacing experiment should examine closure, delayed reaction, turn geometry and the forward speed floor, holding guns/defenses fixed.

Focused regressions cover closing versus receding throttle response, productive pursuit retention, a latched no-progress escape and deadline/cooldown, both variants' input replay determinism, and Watch links. No physics advantage or new movement integrator is introduced. The benchmark is a descriptive snapshot, not an acceptance threshold or forced win-rate test.

Study workers fetch dependencies once and execute the exact text they fingerprint, avoiding classic-worker import-cache drift. All 60 final browser summaries agree with the Node benchmark under matching source hashes, with 1e-8 absolute / 1e-10 relative numerical tolerance for cross-runtime floating-point differences. A worker regression verifies snapshot execution, import ordering, source hashes and temporary URL cleanup. Re-run after source changes; reports remain snapshots of their captured revision.
