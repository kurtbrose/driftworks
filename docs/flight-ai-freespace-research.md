# Fighter combat AI: FreeSpace Open and Driftworks

Research date: 2026-10-17. Scope: the experimental flight lab, not the strategic combat in `src/combat.js`. This report proposes changes; it does not change gameplay, physics, weapons, balance, or visuals. Expected benefits below are hypotheses from source inspection, not measured playtest results.

Implementation status: the initial validation harness and testing pilots are now available; see [flight AI validation](flight-ai-validation.md) for commands, contracts, baseline results and limitations. Initial opt-in adaptations of recommendations 1 and 2 are implemented as `fso-pursuit` and `fso-breaker`; see [combat research implementation and results](combat-research.md#freespace-technique-experiment). Other recommendations remain proposals. These are adaptations, not copied FreeSpace algorithms or established improvements in enjoyment.

## Executive summary

Improve one opponent before improving a squadron. Driftworks already has most of the machinery needed: a shared arcade flight integrator, fixed forward guns, a projectile intercept solver, discrete pilot decisions, committed maneuver timers, and limited attack slots. An elaborate AI framework is unnecessary.

The highest-value FreeSpace ideas are **geometry-sensitive decisions, closure-aware pursuit, and bounded escape from unproductive turning**. Adapt these principles rather than reproducing FreeSpace's state machine. Its accumulated complexity is not evidence of sophistication or fun. Many branches serve other ship classes, mission scripting, compatibility, or flight modes that Driftworks should not adopt.

The first implementation milestone should change only the one-on-one pursuit/break/recovery loop: hold a useful firing position, recognize a losing turning contest, commit to a short separation, then visibly turn back into the fight. Retain current weapon damage, cadence, firing permissions, and skill settings while evaluating that change. Add richer evasion and skill expression only after the basic duel is enjoyable. Defer squadron tactics until then.

Explicitly reject FreeSpace's near-aim orientation snapping, glide attacks, circle-strafing, and AI-specific physical advantages. Flying the ship must remain the way both humans and AI aim.

These recommendations concern **opponent AI**, one of three AI categories Driftworks must maintain. **Perfect AI** searches for the strongest legal input behavior to stress systems. **Human simulator AI** stands in for a player, trying to succeed but making accidental errors through human-like limitations. These categories have different objectives and acceptance criteria; an ace opponent is not a substitute for either testing category.

## Three maintained AI categories

This distinction governs future implementation and testing. All three categories use the same craft physics, weapon rules, control limits and simulation clock. They differ in policy, observation/decision limitations and success criteria, not physical privileges.

| Category | Purpose | Mistakes and limitations | Success criterion |
| --- | --- | --- | --- |
| **Opponent AI** | Exists to lose to the player and make that experience enjoyable: satisfying pursuit, readable danger, earned victories and different pilot flavors. Losing is the design objective across the intended player experience, not a requirement to throw every engagement. | Can deliberately offer openings, defer a shot, overcommit, or use less effective tactics to shape the experience. Flavor and difficulty control these choices. | Human players enjoy flying against it, can learn and exploit its behavior, and can win at the intended challenge level. Maximum win rate is not the objective. |
| **Perfect AI** | An unattainable ideal approximated by increasingly capable adversarial controllers. Stress-test mechanics and find loopholes using any legal input sequence. | No deliberate concessions or human-like error budget. Computational approximations and policy weaknesses still exist; the label does not establish optimality. | Find stronger strategies, expose dominant inputs and failure cases, and preserve each discovery as a reproducible control replay. Losing to it does not by itself imply opponent AI needs a buff. |
| **Human simulator AI** | Stand in for the player in automated tests, with distinct skill levels, styles and limitations. Always attempts to achieve its stated player objective. | Never deliberately makes mistakes. Mistakes emerge accidentally from delayed/noisy observation, limited attention, imperfect prediction, bounded planning and control execution. | Produces plausible player behavior and error distributions, calibrated against human sessions; helps predict the human experience without replacing playtesting. |

For this research, FreeSpace is an **opponent-AI reference**, not evidence of a perfect controller or a validated human simulator. Its entertaining compromises belong in the opponent category. This classification does not assert that every FreeSpace routine intentionally loses; many routines pursue local combat success, and mission/support AI also exists.

### Legal inputs and the stress-test boundary

Perfect AI may exploit anything a human could physically do through the supported controls, including tactics that violate our preferred dogfighting style. If legal side thrust, rapid control combinations, stop-and-turn behavior or another loophole dominates, the stress tester should find and report it. The opponent repertoire restrictions later in this report must not conceal such discoveries. Finding an exploit does not authorize a physics or balance change in this research task.

All categories must emit the same bounded input/throttle requests available to a player. No direct pose, velocity, angular-rate, health, hitbox, weapon-cooldown or clock edits; no extra simulation steps for one pilot; no impossible input rates or combinations. Evaluate controls at the player input/simulation cadence and record the applicable control interface. Search can use substantial offline computation, but an accepted exploit must replay through the ordinary controls without external state intervention.

Information access must also be explicit. A controller cannot inspect future random outcomes or hidden opponent intentions during a measured run. If a diagnostic perfect-AI experiment uses exact internal state beyond player-observable information, label it a privileged-information bound and separately validate the strategy with a player-available observation contract. Legal actuation alone does not establish that the full policy is human-achievable. Any omniscient harness may observe for scoring; that does not grant its observations to the pilot.

### Accidental error versus deliberate concession

A human simulator can misjudge a crossing target because its last observation is old, its velocity estimate is wrong, or its practiced control policy overshoots. It must choose what it believes is the best action for its objective given those limitations. It must not see a good shot and randomly refuse it to give the opponent a chance, select a known-worse maneuver to meet a loss quota, or inject a scheduled tactical blunder. Randomness may model uncertain perception or motor execution; it must not become an arbitrary chance to choose failure.

For example, a novice simulator may consistently underestimate closure because of a limited estimator, then attempt to recover after noticing an overshoot. An opponent novice may intentionally remain overcommitted for a readable player opening. Similar trajectories can have different causes; keep these policies and their tests separate. Human simulator flavors can differ in reaction, attention, prediction, learned tactics, risk preference and control proficiency, without assuming that a human optimizes a perfect combat model.

### Maintenance without an AI framework

Share geometry math, intercept math, maneuver execution where appropriate, observation data formats, input validation, replay and physical integration. Keep category objectives and policy settings explicit and independently testable. Do not create one difficulty slider that silently turns opponent concessions into simulated human limitations, or call an opponent preset with zero aim error “perfect.” A simple category selector plus small policy functions is enough initially; separate modules only when actual implementation size warrants them.

The current `training.js` enemies are opponent AI. The scripted player controller in the wave-clearance test is a functional test driver, not an established human simulator or perfect AI. Straight-flight and fixed-turn scripts remain useful diagnostic fixtures, but must not be presented as representative human players. Both additional categories have initial separate implementations in `flight-ai.js`; their limitations and remaining calibration work are documented in the validation guide.

The testing roles are complementary:

- **Opponent vs human simulator:** primary automated approximation of the intended experience, across player flavors. Real human playtesting remains the quality gate.
- **Perfect vs opponent:** exposes exploitable opponent behavior and measures robustness, without requiring entertaining opponents to match perfect play.
- **Perfect vs perfect / scripted fixtures:** stresses mechanics, stability and dominant strategies. A stalemate here may reveal a system issue rather than an opponent-policy problem.
- **Human simulator vs human simulator or recorded human sessions:** checks behavioral plausibility and calibration. No forced win/loss targets.

Record category, policy version, flavor, observation contract, seed, craft profile and control cadence with every evaluation. Freeze simulator/perfect baselines when comparing opponent revisions so changing both sides cannot manufacture an improvement. Keep exploit discovery and entertainment scoring separate.

## Evidence and provenance

FreeSpace Open source was inspected at commit [`c28032a2afa99b508aaafe96ec075b4ec4a54b1c`](https://github.com/scp-fs2open/fs2open.github.com/commit/c28032a2afa99b508aaafe96ec075b4ec4a54b1c). All FSO references below are pinned to that revision:

- [F: `code/ai/aicode.cpp`](https://github.com/scp-fs2open/fs2open.github.com/blob/c28032a2afa99b508aaafe96ec075b4ec4a54b1c/code/ai/aicode.cpp): fighter chase, prediction, acceleration, evasion, firing, attacker limits.
- [H: `code/ai/ai.h`](https://github.com/scp-fs2open/fs2open.github.com/blob/c28032a2afa99b508aaafe96ec075b4ec4a54b1c/code/ai/ai.h): modes, submodes, per-pilot state and tunables.
- [P: `code/ai/ai_profiles.cpp`](https://github.com/scp-fs2open/fs2open.github.com/blob/c28032a2afa99b508aaafe96ec075b4ec4a54b1c/code/ai/ai_profiles.cpp): `parse_ai_profiles_tbl`, profile reset/defaults and optional behavior flags.
- [B: `code/ai/aibig.cpp`](https://github.com/scp-fs2open/fs2open.github.com/blob/c28032a2afa99b508aaafe96ec075b4ec4a54b1c/code/ai/aibig.cpp): inspected to establish the separate large-target path; capital-ship strafing is outside this recommendation.
- [E: early `aicode.cpp`, 2005-03-25](https://github.com/scp-fs2open/fs2open.github.com/blob/36db6a4931b6348f921031df7b556b687b3a3b4a/code/ai/aicode.cpp): the earliest commit under the current file path, described as an AI code move. It already includes Open changes and is **not an untouched 1999 source release**.

Driftworks references are repository-relative links to the inspected working tree, based on HEAD `8e28bf462e37e9e0f3f8df99b07ee92689110686`. Existing unrelated worktree edits were left alone. Principal files: [training.js](../experiments/training.js), [flight-model.js](../experiments/flight-model.js), [guns.js](../experiments/guns.js), [flight-session.js](../experiments/flight-session.js), [retail-profiles.js](../experiments/retail-profiles.js), [retail-weapons.js](../experiments/retail-weapons.js), [types.d.ts](../experiments/types.d.ts), and [tests.js](../tests/tests.js).

Historical confidence:

| Behavior | Evidence and confidence |
| --- | --- |
| Attack/evade/brake/get-behind/get-away submodes | Present in E; comments on evasion and behind-positioning date to 1997–98 in F. Strong evidence of legacy design, without claiming every modern condition is original. |
| Break endless circles after time without a hit | E's `ai_chase` already has the six-second no-hit/close-range/poor-facing branch and `SM_GET_AWAY`. Legacy mechanism, subsequently extended. |
| Intercept calculation, acquisition-dependent aim error, orientation snapping, attacker limits | Present in E. Modern versions have additional switches and fixes. |
| Optional proximity-plus-mutual-no-hit stalemate detector | Present in F with SUSHI annotation; absent from E under its current identifiers. Later addition relative to the 2005 snapshot. |
| Glide attack, circle-strafe, separate delayed aim sampling | Present in F; corresponding identifiers absent from E. Later Open additions relative to that snapshot; exact introduction dates not established. |
| Modern profile flags | Treat as configurable Open behavior, not universal FreeSpace behavior. P's reset initializes circle-strafe, glide attack, and stalemate thresholds to zero; table/profile loading can change these. |

This is source analysis, not a runtime FreeSpace comparison. Mission profiles, ship tables, difficulty and compatibility flags can produce substantially different combat. Dated comments and a 2005 comparison narrow provenance but do not prove an exact retail implementation for every branch.

## Side-by-side implementation

| Concern | What FreeSpace actually does | What Driftworks currently does |
| --- | --- | --- |
| Pursuit and gun lead | F `ai_chase` initially uses target position when recently acquired or poorly faced, otherwise computes lead; `set_predicted_enemy_pos` uses weapon speed and `compute_collision_time`, acquisition time and error. `compute_time_to_enemy` separately expresses a ship-speed versus laser-speed prediction distinction; it should not be mistaken for proof of a full modern fighter pursuit planner. | `training.intercept` solves constant-speed projectile intercept using target world velocity. `decide` uses that point for flight steering, scales lead by skill (.25/.7/1), and caps the predicted point's horizon at two seconds. There is no distinct ship-interception goal. |
| Maintain position | F `attack_set_accel` considers distance, speed ratio, both facing dots, target speed, optimum range and afterburner conditions. It sometimes matches speed or stops. | `decide`: .72 throttle for attack inside 450 m, .65 for recovery, otherwise 1. Boost only beyond 1,200 m when well aligned. No measured closure feedback. |
| Maneuver selection | F `ai_chase` compares own facing, opponent facing, range, time, recent hits and health, then dispatches explicit submodes. | `decide`: distance below 140 m causes break; HP below 45 plus damage within three seconds causes evade; timers lead to recovery then attack/reposition. No opponent-facing test or sustained-progress test. |
| Break and re-entry | F `ai_chase_ga` steers away with a changing perturbation; `SM_GET_AWAY` holds at least two seconds and exits by distance, opposing facing, or five seconds. | Break/evade recomputes an away goal plus own-right offset each decision. Recovery projects 220 m along current forward every decision for 1.1 seconds. No explicit re-entry geometry. |
| Evasion | F `evade_ship` selects side/behind goals based on threat-facing geometry and preserves a previous goal between some decisions. `ai_chase_es` adds time-varying squiggles. Weapon-threat evasion also exists. | Damage/range triggers; index picks lateral sign, and `step` adds sinusoidal roll while evading. Roll changes orientation but does not by itself guarantee displacement out of a firing line. |
| Skill and mistakes | F `ai_set_positions`, `ai_update_aim`, `set_predicted_enemy_pos` separate some perception/aim timing, acquisition and correlated aim error; `ai_info` includes accuracy, evasion, courage and patience. Some difficulty handling also changes physical turn limits. | Rookie/Veteran/Ace decisions every .65/.42/.28 s, lateral sinusoidal aim offsets of 32/16/6 m, partial lead and different break duration. Target point stays fixed between decisions, although steering executes every step. |
| Fire control | F `ai_chase` uses angular target size and accuracy, range logic and acquisition time; `ai_fire_primary_weapon` has optional exact line of sight and also directly snaps orientation within three degrees. | `step` requires attack mode, attack permission, 130–760 m, dot > .996 toward stored `e.goal`, and a phase-based .8-second window per three seconds. `guns.step` emits both bolts straight forward; no shooter-velocity inheritance. |
| Multiple fighters | F `find_enemy`/`get_nearest_objnum` consider attacker counts; `ai_maybe_limit_attackers` limits attacks on the player and can remove the farthest attacker. | Training rotates up to two slots; nonactive pilots orbit reposition goals. Furball bypasses slots, chooses among nearby enemies and holds targets for 2.5–3.9 seconds. |
| Physics and safety | F `ai_turn_towards_vector` integrates toward orientation with limits, but includes team/difficulty scaling and other exceptions. | AI and player call `arcade.step`. AI separation and terrain prediction alter goals. However, AI's post-step spherical safety shell directly projects position outward, whereas player terrain contact uses `arcade.contact`. Thus movement integration is shared, but terrain handling is not identical. |

Two details matter when designing changes. First, `intercept.time` remains the uncapped solved time while its point uses a capped time; validity and lifetime checks must not silently treat these as the same. Second, the firing check uses stored `e.goal`, while terrain and craft avoidance can alter the actual steering goal locally. A useful future aim solution should have its own meaning, independently of a navigation goal.

## Prioritized improvements

Ranking is expected gameplay benefit relative to implementation and tuning cost, not certainty. Costs are relative: small means a few helpers/state fields and focused tests; medium adds another feedback loop or maneuver requiring substantial tuning. None requires a behavior tree, planner framework, runtime dependency, or physics change.

### 1. Closure-aware pursuit and a bounded break/re-entry loop

**Benefit/cost: highest; medium overall, deliberately narrow first milestone.**

**FreeSpace evidence:** F `attack_set_accel`, `ai_chase`, `ai_chase_ga`, and `SM_GET_AWAY` transitions; E establishes that the basic anti-circling idea predates the newer optional detector. Borrow facing, progress and bounded commitment, not its exact thresholds or random branch tree.

**Current alternative:** fixed throttle bands; break below 140 m regardless of whether a productive tail chase is occurring; no detector for a circling duel at larger range. A retreat waypoint expressed in the continuously rotating own-right basis can also keep moving around the ship rather than producing clear separation.

**Proposed fit:** keep `decide` as tactical selection and `steer` as execution. Add a compact engagement measurement helper, closure-aware throttle demand, a no-progress timer, and a break direction latched on entry. Retain the existing attack/break/recover names initially. Recovery becomes a committed re-entry turn once safe separation is reached. Use differing entry/exit thresholds, minimum commitment, maximum duration and a re-break cooldown. A good tail firing solution suppresses an ordinary range-only break; immediate collision risk still takes precedence.

**Why it may help:** gives the opponent something legible to do other than chase the same lead point around a circle. Speed control can lengthen earned firing windows without raising damage or aim accuracy. Breaking exposes a target for the human to chase and creates a new merge.

**Risks:** speed matching can become stationary turret combat; two identical pilots can retreat in synchrony; a timer can reset fights that were about to become interesting. Keep a forward throttle floor, stagger deterministic decisions, and measure angular opportunity as well as hits. Start with the existing allowable throttle range rather than inventing reverse thrust. Do not transplant FreeSpace's stopping branch.

**Test:** equal-profile duels from head-on, crossing, tail and mirrored turning starts. Verify a productive tail chase persists, an unproductive close turn eventually separates, separation ends within its deadline, and re-entry creates another opportunity. Compare stall duration and player chaseability, not just AI win rate.

### 2. Separate navigation goals from gun solutions; smooth pursuit transitions

**Benefit/cost: high; small to medium.**

**FreeSpace evidence:** F `ai_chase` distinguishes raw/perceived target, predicted target and facing, and `set_predicted_enemy_pos` accounts for acquisition and gun origin. `get_behind_ship` instead steers toward a point behind the target. FreeSpace does not cleanly separate every responsibility; this proposal is a small adaptation, not a claim that it already implements the exact design below.

**Current alternative:** one skill-offset projectile lead point serves as navigation target and firing alignment reference. Reposition and avoidance overwrite or bypass that meaning.

**Proposed fit:** calculate a gun solution with explicit validity, intercept time and aim point. Keep fixed muzzle directions in `guns.step`. Outside a useful firing geometry, use a short, bounded target-motion pursuit goal; inside it, smoothly approach the gun lead point. Near overshoot, lag toward a modest point behind the opponent instead of cutting ever farther ahead. Do not solve a lengthy optimal intercept trajectory. Bound prediction using current speeds and the existing two-second horizon initially.

**Why it may help:** less overshoot and fewer attempts to fly through a bullet-intercept point while maneuvering across the target's path. It also makes subsequent firing decisions refer to an actual weapon solution.

**Risks:** excessive lag recreates endless tail chasing; overprediction chases an imaginary target. Blend continuously, bound offsets, and use the progress escape from recommendation 1. Never add inherited shooter velocity unless projectile physics actually uses it; current Driftworks bolts do not.

**Test:** stationary, lateral, receding and accelerating targets; no positive root, linear/degenerate cases and intercept beyond weapon lifetime. Check muzzle offsets at short distance. Record overshoots and uninterrupted aim windows. Keep the existing firing gate in the first milestone so this does not also become a firepower change.

### 3. Threat-conditioned committed defensive turns

**Benefit/cost: high; medium, after the duel loop.**

**FreeSpace evidence:** F `compute_dots`, `evade_ship`, `get_behind_ship`, `ai_chase_eb`; `ai_chase` exits defenses when geometry improves or time expires. Some routines use time-varying squiggles and zero acceleration; those are not recommendations.

**Current alternative:** damage at low HP triggers generic evasion, and side is chosen by index. A healthy pilot under a strong rear threat need not defend. The extra roll is periodic rather than a deliberate defensive displacement.

**Proposed fit:** select one break plane away from the opponent's current firing line using relative position and both forward axes. Hold the plane through the maneuver; permit safety interruption. Re-engage once threat-facing decreases. Add a restrained overshoot reversal only when the opponent is behind, closing quickly, and a forward-moving turn can exploit the pass. Use ordinary pitch/yaw/roll/throttle controls throughout.

**Why it may help:** defenses become reactions the player can understand and counter. A successful chase can force an opponent defensive without forcing it to oscillate forever.

**Risks:** reacting to perfect projectile knowledge feels psychic; repeated reversals remove firing opportunities. Start with facing plus recent damage and pilot reaction delay, not omniscient bolt dodges. Require cooldown and a fresh threat before repeating. Reversal is optional until tests show a distinct benefit.

**Test:** tail threat versus harmless nearby crossing target, delayed reaction, stable break-side choice, sustained forward motion and bounded defense occupancy. Human tests must establish that a pursuer can anticipate and follow the break.

### 4. Pilot skill through observation, commitment and recoverable mistakes

**Benefit/cost: moderate to high; small to medium after stable maneuvers.**

**FreeSpace evidence:** F `ai_set_positions`, `ai_update_aim`, `set_predicted_enemy_pos` and H's accuracy/evasion/courage/patience. Aim error changes slowly and reduces with sustained acquisition. P makes several delays configurable. Prediction and aiming are separate enough that delayed navigation knowledge does not necessarily mean equally delayed aim.

**Current alternative:** skill changes decision interval, lead fraction, sinusoidal lateral offset and break duration. Permanent quarter-lead makes a rookie systematically wrong against transverse motion, rather than occasionally late or careless.

**Proposed fit:** retain three presets. Use delayed samples of observed position/velocity, bounded extrapolation between samples, slowly changing seeded bias, acquisition settling time, and occasional overcommitted maneuvers. Rookie reacts later and recovers later; ace judges earlier and wastes less motion. Separate tactical reevaluation timing from continuously executing the current maneuver. Reuse the existing decision timer before adding another clock; introduce separate observation state only if testing shows its value.

These are opponent presets. Any deliberately chosen overcommitment or offered opening must stay in the opponent policy. A human simulator may reuse delayed observation and limited prediction, but its overcommitment must follow from its estimates and decision limitations, not an instruction to make a mistake. Perfect AI has no obligation to retain either preset's concessions.

**Why it may help:** the player can exploit visible errors, while a novice still sometimes earns a good shot. Pilot identity comes from choices, not changed ship capability.

**Risks:** stacked delays and errors can make novices helpless; perfect aces can become exhausting. Change one dimension at a time. Keep minimum reaction time and finite mistakes for all levels. Do not change turn rate, damping, acceleration, weapons or hitboxes by skill.

**Test:** seeded repeatability, skill presets on identical craft, controlled target reversals, steady-target acquisition and recovery from an overshoot. Compare reaction/aim-window distributions rather than requiring aces to win every seed. Blind human identification of the skill difference is more useful than raw accuracy alone.

### 5. Solution-aware bursts that leave fair openings

**Benefit/cost: moderate; small, but balance-sensitive and deferred.**

**FreeSpace evidence:** F `ai_chase` gates fire using angle, apparent target size and range; `ai_fire_primary_weapon` includes optional exact line-of-sight and ballistic burst logic. The latter is weapon-specific and should not be copied wholesale for Driftworks energy guns.

**Current alternative:** narrow angular threshold plus a fixed global-time phase can suppress a well-earned solution until its window has passed. `trace` correctly resolves actual obstructions, but permission to shoot does not itself test a clear target line.

**Proposed fit:** later, start a bounded burst when a valid solution is acquired, interrupt on lost solution/obstruction, then respect a pilot rest interval. Use existing weapon cooldown unchanged. Account for muzzle geometry, target angular size and time to impact; keep the aim itself physical. Preserve an aggregate fire-duty budget when comparing to current behavior.

**Why it may help:** AI visibly shoots when its nose is on target and pauses for a reason the player can learn.

**Risks:** better shot timing alone raises effective damage and can obscure whether maneuvering improved. Evaluate separately, with no damage/cadence change. Do not loosen alignment or hide missed aim with gun convergence or rotation snapping.

**Test:** controlled acquisition just outside the old time window, blocked solution, short angular crossing, and repeated reacquisition. Measure bursts, hits on opposing craft and incoming damage together; `guns.hits` also counts obstruction impacts and is not sufficient as an accuracy metric.

### 6. Opportunity-based attack-slot handoff

**Benefit/cost: moderate; medium; strictly after satisfying duels.**

**FreeSpace evidence:** F `num_ships_attacking`, `find_enemy`, `get_nearest_objnum`, `ai_maybe_limit_attackers`, `remove_farthest_attacker`. These limit pressure; they do not demonstrate a sophisticated cooperative fighter planner.

**Current alternative:** training already caps two committed attackers, rotating by time; furball has target commitment but no equivalent player-pressure cap in its normal attack permission path.

**Proposed fit:** retain the cap; hand off an expired or unproductive slot to a nearby pilot with a plausible approach, with minimum ownership and staggered acquisition. Nonowners fly useful transit/reposition legs, not a tighter firing orbit. Apply player-pressure policy explicitly if furball begins assigning fighters to the player more often. Shared facts can remain a small list of target IDs and slot owners.

**Why it may help:** a readable sequence of threats and openings without every opponent shooting simultaneously.

**Risks:** perfectly coordinated alternating attacks can be more oppressive than a swarm; nonowners can look idle or visibly queued. Limit incoming burst overlap, leave deliberate breathing room, and avoid coordinated surround geometry. No squadron framework in the first milestone.

**Test:** one, two, four and eight opponents, slot-owner death/loss, no target-switch chatter and no synchronized bursts. Compare simultaneous threats and time without respite, then human-test perceived fairness.

## Proposed maneuver repertoire and decision criteria

Use a small ordered decision list, not independent random rolls. A tactical decision selects a maneuver and its held parameters; execution converts them to bounded controls; `arcade.step` remains the sole free-flight movement integrator. All quantities below are derived from observed state when observation delays are enabled.

Let `r = targetPosition - ownPosition` in meters, `n = normalize(r)`, `vRel = targetVelocity - ownVelocity` in m/s, and forward be `-pose.back`:

- Own facing `A = dot(ownForward, n)`; threat facing `T = dot(targetForward, -n)`.
- Closure `C = -dot(vRel, n)`: positive means approaching. Guard zero range.
- Closest-approach time `tc = clamp(-dot(r,vRel)/dot(vRel,vRel), 0, horizon)` and miss distance `|r + tc*vRel|`, with a relative-speed epsilon. A close projected pass is not automatically a firing threat.
- Opportunity: valid weapon intercept, range/lifetime, aim error and continuous time near a solution. Track how long neither pilot has useful opportunities or lands damage while remaining nearby. Do not call every missed burst a stalemate.

| Priority / maneuver | Entry | Execution and exit |
| --- | --- | --- |
| 0. Safety avoidance | Projected terrain or craft collision within a conservative horizon | Steering override, ordinary controls; release only once projected path clears. Track emergency shell corrections separately. Safety can interrupt any commitment. |
| 1. Defensive break (later stage) | Sustained rear/side threat, high T and poor A after reaction delay; or recent damage plus threat geometry | Latch one turn plane, fly forward through it; exit on reduced threat or deadline, then cooldown. |
| 2. Separate | Nearby, prolonged low opportunity, no useful shot developing; or imminent overshoot that throttle cannot manage | Latch a clear forward/oblique escape direction, build separation; minimum hold, geometry exit, maximum duration. Do not continuously chase a rotating own-right offset. |
| 3. Re-entry / reversal | Separation complete or attacker has passed with useful spacing | Commit turn direction toward a bounded reacquisition point, then return to pursuit when nose/closure permit. Never stop and spin to shoot backward. |
| 4. Pursue / firing pass | Otherwise, target available | Smooth pursuit-to-lead blend and closure-aware throttle. Maintain tail opportunity; use modest lag if about to overshoot. Ordinary flight, no translational aiming. |
| 5. Reposition (group stage) | No attack slot | Fly a transit leg with space to rejoin; no firing orbit, no continuous lateral strafe around the player. |

For initial tuning, investigate a no-progress interval around 6–10 seconds and separation commitments around 1.5–3 seconds with an absolute deadline around five seconds. These are experiment starting ranges inspired by FSO's bounded states, not approved constants. Measure Driftworks turn time, speed and firing opportunities before selecting distances. Do not import FreeSpace's meter thresholds merely because some ship/weapon profiles came from retail data.

## Ideas not to adopt

| Idea | Source and reason to reject |
| --- | --- |
| Near-target orientation snapping | F `ai_fire_primary_weapon` directly rebuilds orientation within three degrees; also present in E. It bypasses maneuver execution and can interfere with collision avoidance, which a modern compatibility fix explicitly addresses. Violates identical physical aiming. |
| Circle-strafe | H `AIS_CHASE_CIRCLESTRAFE`; F `attack_set_accel` maintains range with forward/reverse motion and `do_random_sidethrust`. Encourages orbital gun platforms and lateral aiming. |
| Glide attack | H `AIS_CHASE_GLIDEATTACK`; F sets `PF_GLIDING`, retaining movement direction while turning to fire. Conflicts with continuous forward dogfighting. |
| Difficulty/team turn-rate scaling | F `ai_turn_towards_vector` scales limits for enemies using `ai_turn_time_scale`. Skill must change controls and judgment, not physical capability. |
| Stopping to shoot or prolonged brake evasion | F `attack_set_accel` can command zero acceleration against a slow target; `ai_chase_eb` commands zero acceleration. Avoid stationary exchanges and repeated brake traps. A brief throttle reduction is acceptable only while sustaining forward maneuvering. |
| Squiggle and perpetual random turning | F `ai_chase_es`, `ai_chase_ct`, changing random component in `ai_chase_ga`. These may reduce hits without producing interesting positional choices. Reject rapid direction resampling and timer-driven oscillation; require commitment and measurable purpose. |
| Literal port of the mode tree | H includes modes for docking, guards, big ships, stealth and other systems. Even `AIM_GET_BEHIND` is marked unimplemented although the chase submode exists. More names do not imply more useful fighter behaviors. |
| Literal fixed behind-point tracking | F `get_behind_ship` aims 100 units behind the target. Useful geometry cue, but pursuing that point forever can replace one turning stalemate with another. Bound its use. |
| Copying numerical heuristics and compatibility fixes as a package | F mixes legacy heuristics, profile flags and weapon-specific exceptions. For example, `SM_GET_AWAY` exit sets acquisition time to two seconds, while the newer stalemate branch updates a hit timestamp to suppress recurrence. Use explicit maneuver cooldowns rather than redefining hit telemetry. |
| More fighters as the first improvement | Existing furball casualty tests demonstrate activity, not a satisfying duel. Additional simultaneous threats can conceal weak pursuit and reduce fairness. |

## Incremental implementation stages

1. **Establish a duel baseline and category contracts.** Add a deterministic one-opponent fixture in the existing dependency-free harness; prevent wave respawn during evaluation. Define category, observation and legal-input contracts, and a shared control replay/validator. Fix profile, skill and weapon; cover head-on, crossing, tail, mutual turn and unequal-speed starts in open space. Record controls, transitions, range/closure, opportunities, hits and timeouts. Start with clearly labeled scripted player drivers; implement an initial human simulator with limited observation/control and a separate best-effort perfect stress controller incrementally. Neither needs to be comprehensive before the first duel milestone, but neither may be replaced by an opponent difficulty preset. No tuning or physics changes. Keep browser comparison at `experiments/flight.html` for the eventual implementation.
2. **First gameplay milestone: one satisfying duel loop.** Implement recommendation 1 only, with small engagement measurements and latched break parameters. Preserve existing gun gating and skill presets. Limit state additions to progress/commitment/cooldown and held direction. Compare baseline and candidate on identical starts. Reject the change if it merely extends retreat time or increases lethality without making chase and re-entry readable. Stop here for human evaluation before expanding.
3. **Improve the firing pass.** Separate aim/navigation and add bounded pursuit/lag blending from recommendation 2. Add simple rate-aware steering damping only if logs show control overshoot: use existing `pose.rates` to moderate control demand, never edit rates directly. Evaluate independently from firing changes.
4. **Add defensive variety and skill.** One threat-conditioned break, then an optional reversal, then observation/error presets, one at a time. No acrobatics inventory. An unhelpful maneuver should be removed rather than justified by variety.
5. **Evaluate burst timing separately.** Recommendation 5 is an AI combat-balance change even if weapon numbers stay constant; compare duty budget and incoming pressure explicitly.
6. **Only then test group pressure.** Opportunity-based slot handoff with the existing cap, then a modest multi-fighter scenario. Do not begin with an eight-opponent benchmark as the quality target.

Implementation locations: keep tactical geometry/selection and small execution helpers in `experiments/training.js` initially; extend `Craft` in `experiments/types.d.ts` when adding state; preserve `flight-model.js` and `guns.js` physics. Update the flight-lab section of `docs/architecture.md` when interfaces actually change. Mode names are also observed by communications code, so changes must preserve or deliberately adapt that contract. Do not add tactical state to the main persistent world for an isolated lab experiment.

The terrain safety-shell projection is a pre-existing exception to physical parity, not a maneuver technique. Open-space duel tests isolate it. A later separate safety task should align collision handling for both pilot types; do not quietly remove or weaken collision protection during pursuit work.

## Automated tests and combat-quality indicators

Use `tests/tests.js`, executed by `node tests/run.cjs` and `tests/index.html`; the flight modules are already loaded there. Main-world scenario JSON is appropriate for captured world bugs, but does not by itself replay the separate mutable flight-lab combat state. Define explicit duel fixtures rather than claiming the existing scenario format already does so.

Existing coverage worth preserving includes local steering/flight limits, intercept lead, maximum two training attackers, autonomous furball shots/casualties, player-model wave clearance, swept projectile obstruction, and fixed flight-session substep ordering. These protect functionality, but none establishes enjoyable one-on-one pursuit.

Add focused tests with each implemented behavior:

- Geometry signs and units for head-on, crossing, tail, opening range and coincident/zero-relative-speed cases; all outputs finite.
- Identical initial pose/profile/control stream through `arcade.step` yields identical human/AI free-flight trajectory. Log and replay AI inputs; forbid direct pose/velocity/basis/rate writes in ordinary maneuvers. Terrain projection/contact must be accounted for separately.
- A good tail firing solution does not break simply because range crosses an arbitrary proximity boundary; collision-risk starts still avoid.
- Prolonged poor-angle engagement requests separation, holds its chosen side, exits by the deadline and cannot immediately retrigger. Improved opportunity resets/decays progress failure without inventing hits.
- Maneuver commitment survives ordinary decisions; safety can interrupt; hysteresis prevents chatter at thresholds. Target loss/death clears target-specific timers and cached observations.
- Intercept validity/lifetime and current non-inherited bolt velocity; no rotation to a fire solution, no side/vertical thrust for combat aiming.
- Same seed and timestep reproduce choices. Run real simulated time through 1/120-second substeps, as `flightSession.advance` does; also compare display-frame batching and shorter substeps with tolerances. A direct .1-second `arcade.step` call clamps to .05 and is not a valid .1-second benchmark.
- Later stages: delayed observation, bounded correlated bias, burst/rest limits, attack-slot ownership and simultaneous-pressure limits.

Run a fixed evaluation matrix, for example five starting geometries × three opponent skills × ten deterministic seed/phase variants × 120 simulated seconds, repeated for each maintained human simulator flavor. Until simulators exist, report scripted drivers as diagnostic coverage only. Use identical profiles first, then mixed profiles; compare both mirrored starts and diagnostic scripts (steady turn, straight flight, delayed break, throttle change). Run perfect-AI stress cases as a separate suite, including discovered exploit replays. AI self-play alone rewards shared weaknesses. Freeze weapons, health, collision queries, player-policy versions and start spacing across opponent variants.

Category-specific regression coverage must include legal input replay for all three; proof that opponent-only concessions cannot leak into perfect or human-simulator policies; simulator responses to stale/noisy observations without consulting hidden ground truth; and reproducible stress strategies through the player control path. For a simulator, inspect the cause of a mistake as well as its visible trajectory. An intentionally missed shot does not become human-like merely because its frequency matches a recording. Calibrate reaction times, aim correction, overshoots and recovery against human traces, and report uncertainty until those traces exist.

| Indicator | Measurement and interpretation |
| --- | --- |
| Time to first useful opportunity | Valid intercept within range/lifetime and a documented alignment tolerance held for a short duration. Measure for both pilots; distinguish opportunity from burst permission. |
| Firing-window continuity | Distribution of uninterrupted opportunity lengths, not only fraction of time facing generally toward the target. Longer is useful until it becomes an unavoidable firing lock. |
| Unproductive close time | Longest and total nearby interval with neither damage nor useful opportunity. Report timeouts separately so unresolved duels are not dropped from averages. |
| Re-engagement time | From break entry to separation, and from separation to next opportunity. Exposes endless retreats and symmetric runaway. |
| Overshoot and maneuver chatter | Count close passes with target crossing from front to rear, mode changes/minute, and turn-sign reversals outside intended maneuvers. Overshoot is not always a mistake; inspect context. |
| Defense cost | Fraction of time defensive or retreating, maximum continuous defense, and resulting opponent opportunities. Invulnerability through evasion is a failure. |
| Motion and parity | Forward speed/throttle distribution, boost occupancy, peak rates, lateral controls, and all emergency corrections. No added zero-speed gun-platform behavior or physical shortcuts. |
| Combat pressure | Opposing-hull hits per emitted bolt, damage per active minute, burst overlap, simultaneous attackers and longest period without respite. Exclude terrain impacts from hit accuracy. |
| Duel outcomes | Time-to-kill distribution, wins by start/skill and unresolved count. Faster kills and higher AI win rate are not standalone quality improvements. |
| Cost | AI update CPU cost at fixed count and timestep, separately from rendering. A small fighter count should not require a new scheduling system. |

Before tuning, capture the baseline distribution and choose acceptance thresholds. A reasonable **provisional** gate for milestone 1 is at least a 25% reduction in the upper-tail unproductive-close interval across the fixed matrix, no increase in unresolved duels or prolonged retreats, no parity violation, and no reduction in the human's usable chase windows. This is a proposed experiment criterion, not an observed result or a guarantee. Report per-geometry regressions even if the aggregate improves. Do not enforce a lower time-to-kill as the success criterion.

For every implementation stage run `npm run check`. Browser verification is additionally required for actual feel, input, visual readability and audio integration; headless tests do not cover these. This research-only task needs no new gameplay tests or browser claim.

## Questions requiring human playtesting

- Is a lone opponent enjoyable to follow through a break and re-merge, or does it merely run away? Can the player predict the turn without finding it mechanical?
- Does closure control give the player time to aim while preserving movement? Does either pilot settle into an easy stationary exchange?
- When a turning contest ends, does the change feel like a pilot decision rather than an arbitrary reset? Are mirrored opponents synchronizing retreats?
- Are defensive turns readable and punishable? Does a reversal create a new positional decision, or simply deny the shot the player earned?
- Can people distinguish rookie/veteran/ace from timing and mistakes on identical craft? Does the ace still offer openings?
- Do human simulator flavors reproduce actual player reaction, attention and recovery patterns without scheduled blunders? Which observations and control limitations need calibration from human recordings?
- Which perfect-AI discoveries expose legal mechanics that undermine the desired flight style, and which merely exploit intentional opponent openings? Keep those decisions separate from tuning the opponent to beat the stress tester.
- Does burst timing communicate danger without making every acquisition immediately damaging? How long should a human be allowed to maintain an earned solution?
- Once duels pass, does slot handoff create breathing room or a relentless conveyor of attackers? Are waiting pilots visibly flying plausible paths?
- How much of near-terrain difficulty comes from AI decisions versus the existing asymmetric safety handling? Keep this separate from the open-space verdict.

Choose the smallest behavior change that wins these comparisons. FreeSpace is a source of tested ideas and instructive compromises, not a target feature count.
