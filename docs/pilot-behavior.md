# Reproducible pilot behavior baseline

Run real AI-versus-AI combat, stress observation and radio scheduling without a
renderer. No installation or runtime dependencies are required.

```powershell
New-Item -ItemType Directory -Force output/pilot-behavior | Out-Null
node tools/pilot-behavior.cjs --seconds 120 --seed 29 --count 16 --layout stock --output output/pilot-behavior/stock-29.json
node tools/pilot-behavior.cjs --seconds 120 --seed 29 --count 16 --layout dense --output output/pilot-behavior/dense-29.json
node tests/pilot-behavior.cjs
```

The fixture reuses `tools/stress-flight.cjs`: stock furball spawning or the same
compact, opposing-team setup used for flight profiling. After spawning, the
unarmed player is parked 100 km away on each axis. NPCs retain ordinary health,
target selection, steering, weapons, damage, death and round progression. The
player receives no immunity; an early player death is reported. This is an
observer encounter, not a replay of an actively fighting human player.

The production headless driver advances the real session at 120 Hz. The report
samples living pilots at 10 Hz: health, shields, target, maneuver mode, pursuer
count, stress, mood and cumulative gun counters. It includes per-pilot integrated
durations, target switches, complete spoken transcripts, event-category counts,
source hashes and a deterministic report digest. Histories include replacement
IDs across rounds. Death/removal between samples can lose a final fraction of a
second of activity or gun counters; this is sampled telemetry, not an event ledger.

`helpCalls` is a text heuristic (including "help me" and "can't shake"), separate
from the actual radio event categories. Inspect the transcript when changing
dialogue vocabulary. A frightened pilot can say something other than a help
request; fear occupancy and help-call share measure different things.

On 2026-10-29, 120-second runs with 16 pilots and seed 29 produced:

| Layout | Shots | Hits | Radio lines | Distinct event categories | Help requests |
| --- | ---: | ---: | ---: | ---: | ---: |
| Stock | 1258 | 857 | 25 | 10 | 0 |
| Dense | 1179 | 857 | 25 | 8 | 1 |

Living-pilot time averaged stress 0.243 (stock) and 0.269 (dense); afraid or
panicked states occupied about 34% and 37% respectively. The dense transcript
included attack, damage, taunts, near misses, relief, reassurance, acknowledgments
and "Help me!". This provides a varied baseline despite substantial fear. It does
not establish that every mission avoids repetitive chatter.

The regression compares two short runs exactly, then checks that the dense
two-minute baseline includes actual panic, at least six radio categories, and
less than half help requests. These broad bounds preserve the desired behavior
without requiring exact wording or counts. Baseline changes should be reviewed
against the timeline rather than automatically blessed.

Limits: the radio models muted speech duration, not real audio callbacks. Optional
capital rigs are absent. Stock/dense layouts are controlled fixtures, and changing
the seed does not guarantee different NPC starting geometry. No browser parity
claim is made for this fixture yet. Future goals and emotional feedback should
use these same production systems, extending the shared setup when a gameplay
mismatch is found instead of inventing separate emotional or combat simulations.
