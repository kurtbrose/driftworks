# Mission workshop

Run the usual static server from the repository root (`python -m http.server
8000`), then open <http://localhost:8000/tools/mission-workshop/>. No build,
package installation, account or runtime network service is needed.

Choose character, mission and scene. All characters shows the full exchange in
script order. Edit a line, add its performance intention, record several takes,
then choose one. Scene playback uses current chosen takes in scene order,
including other characters even when the list is filtered; it reports skipped
lines. This is a read-through, not a simulation of runtime radio timing.

The first catalog includes all 19 evacuation Cycle A lines and 19 fixed convoy
lines (rendezvous, conversations, distress and fixed Control cues). Conditional
reports assembled from runtime values remain source references, not recordable
templates. The wingman reply is runtime-selected, not a fixed named character.
Generic chatter begins as an empty draft area; the existing generic combat
tables are not imported yet. New characters, scenes and lines can be drafted.

## Recording and storage

Use localhost or HTTPS in a browser with MediaRecorder and microphone support.
Enable the microphone, choose the input, and optionally monitor through wired
headphones. Choose an external voice converter's virtual microphone to capture
converted speech. The workshop records that one input; simultaneous clean and
converted tracks and built-in AI conversion are not implemented. The peak meter
flags near-full-scale input; it does not judge acting quality. Takes preserve
their spoken text and direction. Text changes mark old takes stale; stale takes
remain playable but are excluded from scene playback.

Audio uses the browser's supported compressed recording format (typically
WebM/Opus); downloads retain the actual format. There is no WAV conversion,
waveform trimming or audio processing in this first version.

Edits and audio blobs are saved together in IndexedDB, local to the browser
profile and exact origin (including port). Use one workshop tab at a time.
Back up session + audio exports a JSON file containing all recordings; Restore
backup validates it and asks before replacing the local session. Individual
takes can also be downloaded. Storage failures are shown explicitly. Browser
storage is not a substitute for backups. Large sessions can make JSON backups
memory-intensive; export individual takes regularly.

## Source revisions

The checked-in catalog is generated from the two existing mission scripts:

```
node tools/mission-workshop/catalog.cjs
node tools/mission-workshop/catalog.cjs --check
```

Refresh after mission source changes, then reload the workshop. Old local edits
retain their original text and source hash, so conflicts cannot silently apply.
Source references show when a draft was based on an older source file.

Export script revisions produces a reviewable JSON file without audio. To apply
text edits to existing authored lines from the repository root:

```
node tools/mission-workshop/catalog.cjs --apply path/to/driftworks-script-revisions.json
```

The helper validates all IDs, original text and normalized source hashes before
writing. It replaces only the specific string literals and regenerates the
catalog. It refuses conflicts and duplicate IDs. New lines/scenes/characters,
directions, trigger changes and plot notes are included under `workshop` for
manual review and integration; they do not change runtime mission logic.
Inspect the diff, run relevant mission regressions and refresh deployment asset
versions before committing a runtime script revision. Recordings are not wired
into gameplay automatically.

The helper evaluates only trusted, checked-in literal arrays while extracting
the catalog. Imported session and revision data is never evaluated as code.
