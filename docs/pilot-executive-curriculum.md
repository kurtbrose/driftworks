# Tactical executive curriculum, version 2

This continues the [two-action executive experiment](pilot-executive.md), whose
first selector matched always-attack. The flight/aiming controllers, weapon
rules, action commitments and combat reward remain unchanged. Changes are in
training data, tactical observations and search/initialization. This is an
offline study; it does not change gameplay, pilot emotions or radio behavior.
It uses the same Ulysses/native-primary, two-craft Euclidean duel harness as
version 1. Other ships, loadouts, curved maps and fleet combat are not covered.

```text
node tools/pilot-training/executive-curriculum.cjs --mode mine --seed 40421 --dataset output/pilot-executive-curriculum/my-dataset.json
node tools/pilot-training/executive-curriculum.cjs --seed 31415 --dataset output/pilot-executive-curriculum/my-dataset.json --out output/pilot-executive-curriculum/my-run
node tests/pilot-training.cjs
```

Node and the repository scripts are sufficient; there is no extra package or
runtime network dependency. Dataset/report paths must be fresh. Checkpoints are
written at validation points so an interrupted run retains its best validated
policy, but automated resume is not implemented. Never substitute an incomplete
checkpoint for a completed test evaluation.

## Separately constructed datasets

Before training, the miner builds separate training, validation and challenge
test pools. Each candidate is a seeded hunted encounter against a rookie or
veteran baseline opponent. It runs sustained attack, then, if attack does not
win, tries one two-second requested break starting at 1, 3, 5 or 7 seconds,
followed by sustained attack. It accepts the case only if a break schedule wins
and improves combat score by more than 0.75. The best of those schedules is
retained as a demonstration. The fixed maneuver envelope can still end a break
early at its separation limit after its minimum commitment.

Each pool contains eight accepted cases, with an audit of all examined cases
and their counterfactual outcomes. Mining stops at eight or fails after 64
candidates. No learned policy participates in pool construction. Splits use
different seed ranges; duplicate encounter keys across splits are rejected.
Additional ordinary training fixtures, including demonstration fixtures, are
also checked against evaluation splits.

The challenge test is explicitly conditioned on break being useful. Its
always-attack win count is therefore zero by construction; a win there alone
does not establish general superiority. Two other test suites are unfiltered:
32 normal baseline-opponent encounters and 32 encounters against unfamiliar
aggressor, passer and FreeSpace-inspired breaker styles. Both retain head-on,
crossing, on-tail and hunted starts. Test fixtures and outcomes never select a
checkpoint. No old version-1 test fixtures or its diagnostic case are reused as
training examples.

## Observations and initialization

The version-2 network still has one tanh output choosing attack/break. It now
has thirteen observations plus a bias, fourteen parameters total. It retains the
original ten observations and adds:

- Age of the current committed maneuver, clipped/scaled over five seconds.
- Whether a break has already occurred in this encounter.
- Time since returning from the last break, clipped/scaled over ten seconds.

These are causal tactical history, not future trajectory, opponent intent,
scenario identity or the demonstration's scheduled break time. They let a
selector distinguish an initial pursuit from re-entry after a break. They do
not impose a new cooldown or a one-break limit; the same fixed action envelope
still applies to all policies.

Training-only counterfactual demonstrations initialize the classifier with
weighted logistic fitting. Only decisions where the executive can actually
change actions are included. Frames during mandatory commitment and forced
break termination are excluded: those are controller constraints, not choices.
This avoids teaching the classifier mainly to keep breaking while it is already
forced to do so. Ordinary attack demonstrations are included as negative
examples. Class weighting prevents the sparse break-entry examples from being
overwhelmed. This initialization uses action labels; the final policy is selected
only by actual combat score, never by classification accuracy.

The demonstration phase can fail to produce a useful policy. Both its candidate
and an all-zero/always-attack candidate receive the same separate validation.
The better one initializes the retained best result, protecting the comparison
from treating more frequent switching as an improvement.

## Combat search and evaluation

Each generation samples three training challenge cases and three fresh ordinary
cases (head-on, crossing and on-tail). It re-evaluates retained parents on that
same suite, then evaluates sixteen mutations. Four top individual candidates
are preserved, and a diagonal search distribution also updates from them. Some
mutations use twice the usual scale. At every fourth generation and the final
generation, individual elites and their mean receive separate validation.
Successful individuals are not discarded merely because their averaged weights
behave poorly across an action threshold.

Validation balances eight independent challenge cases and eight ordinary cases.
The exported checkpoint maximizes their mean unchanged combat reward. Twenty
generations are the default. The report retains every sampled training suite,
the history, demonstration counts and initial validation results. Independent
search seeds may share the fixed benchmark dataset; report each run separately
and do not choose a winner using test performance.

The learned selector is compared with always-attack, always-break and the same
authored switching rule on all three final suites. Scores, wins/losses/timeouts
and actual break counts should be read together. The experiment changes more
than one learning component, so improvement cannot be attributed to curriculum,
memory, initialization or elite retention individually without ablations.

A stronger fixed-timing baseline is fitted separately, before inspecting final
test results. It chooses a single two-second break time from 1, 3, 5 or 7 seconds
by mean combat score on the eight training challenge cases and nine ordinary
training cases. It then always attacks except for that one requested break.
No validation/test cases choose its time. This distinguishes useful conditional
decisions from merely copying a global schedule. Its comparison is stored in a
companion file so the original frozen training reports are retained:

```text
node tools/pilot-training/executive-timed-baseline.cjs --mode fit --dataset output/pilot-executive-curriculum/my-dataset.json --baseline output/pilot-executive-curriculum/my-fixed-baseline.json
node tools/pilot-training/executive-timed-baseline.cjs --mode evaluate --dataset output/pilot-executive-curriculum/my-dataset.json --baseline output/pilot-executive-curriculum/my-fixed-baseline.json --report output/pilot-executive-curriculum/my-run/report.json
```

Fit once on training cases and reuse the same baseline for every search seed.
The evaluator verifies matching dataset hashes and refuses to overwrite results.

## Evidence and compatibility

The dataset stores its mining source hashes and full audit. Each training run
fingerprints the curriculum/episode code and all headless runtime modules before
training, then refuses to publish a mixed-source report if those files change.
It also verifies the dataset bytes remain unchanged. Checkpoints remain
available for diagnosis if the final consistency check fails.

`champion.json` uses task `tactical-curriculum-v2` with a 13-to-1 architecture.
The prior eleven-parameter executive export remains unchanged and compatible.
The episode harness now accepts a causal policy callback at tactical ticks;
tests verify that neutral version-2 weights execute the same fixed attack
controller and that captured callback decisions reproduce all physical and
tactical results through the existing flight-input replay format. Captures
attach the version-2 policy as metadata. Actual controls and committed requests
remain the authoritative replay stream.

`maneuver-events.json` still contains committed maneuver facts for a possible
future comms adapter. There is no reward for speaking, switching, survival time
or simply choosing break. All comms salience, occupancy, cooldown and stale-line
requirements from the first study still apply.

## Results, 2026-10-29

Dataset seed 40421 produced eight training challenge cases after examining 23,
eight validation cases after 42, and eight challenge test cases after 59. All
mined and ordinary cases were checked for overlap with the previous experiment's
training, validation, tests and diagnostic encounters; none overlapped.

Two independent search seeds, 31415 (primary) and 27182 (replication), each ran
twenty generations with sixteen mutations and six training encounters per
mutation: 1,920 mutation encounters per seed, plus retained-parent, demonstration,
validation and final comparisons. They shared the fixed dataset and test cases;
their test outcomes are not independent draws from a larger population. Both
selected generation 19 by validation, without using test performance. Both
exports are retained rather than choosing one using test results.

Demonstrations supplied 1,069 eligible decision frames, including eight break
entry choices. The demonstration initializer alone scored worse than
always-attack on balanced validation (3.4521 versus 5.3785). Combat search then
found better candidates: primary validation finished at 15/16 wins and 6.9324
mean score, replication at 16/16 and 7.1177. This does not establish that the
demonstration initializer was necessary; components were not separately ablated.

Final wins (all learned, always-attack and fixed-timing results had zero losses;
remaining cases timed out):

| Selector | Break-useful challenge (8) | Unfiltered normal (32) | Unfamiliar styles (32) |
| --- | ---: | ---: | ---: |
| Primary neural policy | 5 | 31 | 16 |
| Replication neural policy | 8 | 32 | 16 |
| Always attack | 0 | 30 | 17 |
| Fixed break at 7 seconds | 4 | 29 | 16 |
| Authored switching | 1 | 10 | 8 |

The fixed-timing choice of seven seconds was made on training cases before the
learned policies' final test results were inspected. Its score was 5.5369 on
challenge, 6.7189 on normal and 3.8891 on unfamiliar styles. Neural primary scores
were 5.8924, 6.9392 and 3.8653; replication scores were 7.2046, 7.0289 and 3.9459.
Always-attack scored 4.1785, 6.8766 and 4.3225. The same fixed baseline results
are reused for both search seeds after verifying identical dataset hashes and
runtime source fingerprints; no duplicate simulation is needed for that reuse.

These results demonstrate useful learned switching on this curriculum, including
gains over a training-fitted global timing rule. The challenge result is
conditioned on break helping and must not be read as a general dogfight win rate.
The normal gains are small samples (one or two additional wins out of 32), and
the sizeable challenge difference between search seeds shows variability.
Neither neural policy improved on always-attack against unfamiliar styles.
The policy is therefore not a robust general pilot or a justified replacement
for current gameplay AI. Longer fights, other ships, curved maps, multiple
contacts, human play and runtime cost were not evaluated.

The next curriculum should include diverse opponent behaviors and hard negative
cases where breaking hurts, with fresh validation/test splits. Keep the same
combat objective and strong baselines. Further decisions such as changing
targets, support requests and boost spending should wait for that broader
two-action comparison.

Both policies use fourteen parameters:

- `tools/pilot-training/executive-curriculum-example.json` — seed 31415.
- `tools/pilot-training/executive-curriculum-replication.json` — seed 27182.

Full local evidence is under `output/pilot-executive-curriculum/`: dataset and
mining audit, fixed-baseline selection, each seed's report/checkpoints, complete
fixtures and case results, canonical replay and maneuver events. The two timed
baseline companions contain the same verified comparison. Mining took about
72 seconds; concurrent search/evaluation took about 1,105 and 1,004 seconds.
Those wall times include other checks and are not runtime performance budgets.

Regression coverage retains a shared validation pursuit that always-attack
times out but both exported neural policies win through at least one committed
break. Tests replay their actual controls and decisions and verify stable break
events. That encounter is now regression evidence, not a fresh holdout for any
future training iteration. No speech or visual acceptance is claimed.
