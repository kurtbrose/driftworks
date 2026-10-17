# Combat research laboratory

Open [the combat study page](../experiments/flight-study.html) through the local static server. It runs the existing fixed-step duel in a Web Worker without graphics, audio, or real-time pacing. No simulation data leaves the browser. The flight lab and headless runner share ship physics, guns, damage and AI policies.

## Research questions and stages

1. Screen one-on-one loadouts: can pilots survive long enough to maneuver, acquire openings, and finish fights? Start with the default 80 cases: Ulysses, original Hercules, Horus and Dragon; five initial geometries; perfect plus novice, practiced and expert human simulators; veteran opponent; native cannons; 30-second limit.
2. Select paired shielded/unshielded defenses. Each pair holds pilot, seed, geometry, ships and weapons fixed. Both ships retain their own class hull; both receive their class shields when enabled. Ask whether shields create additional maneuvering time or merely extend unresolved fights.
3. Vary cannons on a small shortlist of ships. Native means each class's default primary; an explicit cannon equips both sides. Equivalent native/explicit setups are deduplicated. Keep physics and opponent behavior fixed while identifying useful starting loadouts.
4. Expand shortlisted matchups to ordered cross-class pairings and multiple human seeds. Swap ship assignments and include all geometries: seat and starting geometry influence results. Anchor pairing uses the first checked ship in displayed order.
5. Watch flagged cases, then fly the shortlist yourself. Only after establishing a baseline should we change opponent maneuver decisions, one behavior at a time, and compare against the same configurations.

The page caps a design at 2,000 duels and each duel at 120 simulated seconds. Begin small; faster-than-real-time does not mean free CPU. Stop terminates the worker and preserves received batches. A partial report is a fixed-order prefix, not a representative random sample.

## Pilots and interpretation

The perfect pilot is a best-effort legal-input stress agent, not an optimal-control proof. It is deterministic without seed-dependent variation, so repeated seeds do not create independent trials. Human simulator seeds vary imperfect observations and controls; these pilots try to succeed and do not deliberately throw fights. They are currently uncalibrated stand-ins, not measured human populations. The opponent retains its existing behavior.

The report groups ship/weapon pair, pilot, opponent skill and defenses across selected geometries and human seeds. It records outcomes, elapsed simulation time, dry intervals, remaining defenses, firing opportunities, range and maneuver changes in per-case JSON. Group rows show completed-kill median, mean observed duration, timeout fraction and longest dry interval.

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
