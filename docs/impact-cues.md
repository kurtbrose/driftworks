# Cinematic impact cues

The impact is now driven by mission cues, not a physical time schedule.
Open `experiments/flight.html?mission=planet-impact-watch` for empty free flight.
The always-visible **Mission sky cues** panel simulates mission triggers: choose
a target and blend duration, then trigger it, or use **Next cue**. Each resulting
stage holds indefinitely. Escape pauses transitions and re-entry motion.

## Mission integration

The sky instance exposes `cueImpact(stage, seconds = 8)`, `resetImpact()` and
`getImpactState()`. A mission can dispatch a DOM event on its flight viewer,
without needing access to the presentation's private renderer:

```js
const viewer = document.getElementById('viewer');
viewer.dispatchEvent(new CustomEvent('impact-cue', {
    detail: {stage: 'contact', seconds: 2}
}));
// Later, on another mission trigger:
viewer.dispatchEvent(new CustomEvent('impact-cue', {
    detail: {stage: 'fires', seconds: 12}
}));
// To reset the whole cinematic:
viewer.dispatchEvent(new CustomEvent('impact-reset'));
```

Stage IDs, in default order:

| ID | Artwork / motion |
| --- | --- |
| `before` | Pristine planet |
| `contact` | Unchanged baseline; a separate brief optical flash at cue start |
| `ejecta` | Young hot ejecta |
| `plume` | Growing overhead plume |
| `cooling` | Cooling opaque cap |
| `fallout` | Later steam cloud; subtle atmospheric re-entry streaks begin |
| `aftermath` | Persistent regional aftermath |
| `fires` | Separate small land fires and smoke patches |
| `smoke` | Broader patchy smoke over those land regions |

Any named target can be triggered directly. Overlapping cues queue in order
(maximum 16 pending commands); repeated active/latest-queued targets are
idempotent. `cueImpact` returns false when the queue is full and throws for an
unknown stage or a duration outside 0–120 seconds. Zero-duration cues still wait
for target artwork. A cue arriving during pause begins visually on resume.
An active transition freezes while its images load; time spent loading does not
skip artwork or the contact flash. Completing a transition never advances to
another stage without a cue. A large frame step completes at most the active
transition; it does not consume the next queued cue's blend duration.

The controller is available without DOM/GPU resources through
`flightSkybox.createImpactCues()` for focused tests. Its snapshot reports
`from`, `to`, eased `blend`, held `stage`, `transitioning`, `queued` and `flashAge`.
This is presentation state, not persistent simulation data. No gameplay win,
radio or combat triggers have been invented for the watch map; the panel is the
manual trigger source until an authored mission supplies its actual conditions.

## Artwork and bake

The active sequence uses the approved `planet-hero-orbital-v2/master.png`.
Built-in ImageGen edits and exact prompts are in that folder's `impact-art-v1/`.
`tools/bake-orbital-impact.py` registers the central event at UV (.49,.46), freezes
all pixels outside the local event masks, then composites the fire/smoke regions
over the completed aftermath while protecting its central patch exactly.
Registration errors are recorded in `impact-registered-v1/registration.json`.

Run that tool with the authoring-only Pillow/NumPy runtime. It calls
`tools/bake-sky-cube.py` for every stage, producing nine sets of six 1024-square
90-degree shared-origin camera captures in `animation-cube-v1/`. Each stage has
a manifest with camera bases and hashes. The first two stages are identical
images: contact brightness is live optical radiance only. The runtime blends
two cube samplers and retains at most three stage cubes (about 72 MiB RGBA).
All six faces must load before a transition advances.

The review at `planet-hero-review.html?mission=planet-orbital-cube` and the empty
flight mission use the same cue controls and fixed 45-degree lens. Existing
`planet-impact-watch` and `planet-impact-baked` bookmarks now select this sequence;
the latter retains the dogfight. The old `planet-hero-v1` artwork and
equirectangular bakes remain archived for provenance and format regressions,
but are not used by those active missions.

Short re-entry streaks are an optional stage-dependent live optical layer in
the planet's fixed direction space. They are deliberately sparse and faint in
daylight, have no world-space collision or near-player trajectories, and continue
moving while a fallout-or-later stage holds. Their local motion clock freezes
with flight pause. The flash remains a separate radiance pulse, not an image
crossfade. Both reset with the cinematic controller.

Settings retains a collapsed **Timed artwork diagnostic** for inspecting the
first seven stages. `setImpactTime(seconds)` explicitly switches to that mode;
**Reset cues** / **Restart impact** returns to mission control. Hiding cue UI
with `create(..., {cueControls: false})` does not disable mission DOM events.
