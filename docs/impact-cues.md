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
| `contact` | Tiny early vapor; a separate brief optical flash at cue start |
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

Built-in ImageGen edits and exact prompts are in
`assets/backgrounds/planet-hero-v1/fire-cues-v1/`. They are based on the registered
aftermath plate. `tools/compose-impact-fire-cues.py` applies separate feathered
permission regions over nearby land, protecting the existing central impact
patch exactly. It produces `7.png` and `8.png` alongside `masks.json`.

Run `tools/bake-planet-impact.py --cinematic` with the existing authoring-only
Pillow/NumPy runtime to create `baked-cues-v1/`. The first seven 4K spherical maps
are copied byte-for-byte from the approved `baked-v3/`; only the two new land
stages are projected. The portable recipe lists stages, not physical timestamps.
These are equirectangular textures using the existing spherical compositor.

Short re-entry streaks are an optional stage-dependent live optical layer in
the planet's fixed direction space. They are deliberately sparse and faint in
daylight, have no world-space collision or near-player trajectories, and continue
moving while a fallout-or-later stage holds. Their local motion clock freezes
with flight pause. The flash remains a separate radiance pulse, not an image
crossfade. Both reset with the cinematic controller.

Settings retains a collapsed **Timed artwork diagnostic** for inspecting the
original seven image stages. `setImpactTime(seconds)` explicitly switches to
that diagnostic mode; **Reset cues** / **Restart impact** returns to mission
control. The older hero review remains a timed comparison and suppresses the
floating cue panel with `create(..., {cueControls: false})`.
