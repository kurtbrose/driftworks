# Combat research laboratory

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

Imported FreeSpace values are starting points, not a reproduction of retail balance. Current experiments use pooled shields and shared regeneration rules, twin fixed forward guns, unlimited fuel/weapon energy, and no missile or subsystem simulation. The model deliberately preserves Driftworks' continuous arcade flight. Ship art is independent of these numeric profiles. See [loadout provenance and adaptations](retail-flight-loadouts.md).

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
