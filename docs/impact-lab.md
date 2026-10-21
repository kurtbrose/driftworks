# Orbital impact image study

For the separate complete-disk baseline, open
`experiments/planet-hero-review.html?mission=planet-hero`. It places one generated
planet image with black margins using the existing opaque landmark projection.
Compare 80/110/140 degree card widths, inspect the limb with the flight lens, or
follow the link into a real furball. The source, prompt and limitations are in
`assets/backgrounds/planet-hero-v1/README.md`. The hero viewer now includes a
separate seven-plate overhead impact sequence, with pause, scrub, speed and
pristine-reference controls. It preserves the entire disk outside a local
feather mask. Mission `planet-impact-baked` now uses seven baked 4K spherical
maps in real flight. See [timing and bake notes](impact-timing.md) for the physical
reference and the distinction between illustrative timing and simulation.

Open `experiments/impact-lab.html` from the static server. The standalone study
uses seven native-resolution ImageGen plates in `assets/backgrounds/impact-v1/`:
`master.png`, `flash.png`, four `between-*.png` stages, and `plume.png`.
The four intermediate paintings used the full-frame master and both impact
endpoints as references. The 90-second stage was revised using the 60-second
and final images to avoid overshooting the final plume height. Exact prompts
and built-in tool provenance are in `prompts.json` and `inbetween-prompts.json`.

The compositing follows `experiments/face-blend.js`:
redraw the frozen master, blend edited images in an offscreen layer, then use
`destination-in` with an elliptical radial feather to restrict their ownership.
The stars, sun, horizon and scenery outside the permission region always come
from the master. The image buffers retain native source resolution rather than
the portrait renderer's 512px canvas. The face-specific anatomy guard is not used.
No procedural planet, clouds, stars or impact artwork remains in this study.

Scrub from five seconds before impact to three minutes after; speed options
allow a faster review. Wheel zooms and dragging pans the same composited plate.
The sequence selector compares the new seven-plate animation with the original
three-plate dissolve at the same event time. Jump-to-stage pauses at each painted
keyframe: flash at 0.25 seconds, intermediate stages at 12, 32, 60 and 90 seconds,
then the final plume at 120 seconds. Between frames, only the neighboring pair
is dissolved with smoothstep easing, followed by the same fixed permission mask.
This is a flat plate blending experiment, not a spherical skybox or flight mission.
It does not modify saved worlds. Camera projection onto the flight sky is deferred
until the art and transitions work.

`coverage-study.png` is an ImageGen panoramic extension concept with its prompt
in `coverage-prompt.json`. It is not loaded by the preview: edge/pole continuity,
correct spherical composition and native angular detail have not been verified.
The eventual sky must cover all directions, retaining high-detail hero imagery
rather than stretching this small overview around the entire sphere.

The flash appears quickly, then the four intermediate paintings connect it to
the developed plume over about two minutes. This tests localized blending, not
resolved fluid motion or calibrated impact physics. The paintings are distinct
generated states rather than mathematically interpolated shapes. Feathering
protects distant scenery but cannot remove every geographic change or dissolve
artifact within the edited region. Outpainting remains independent: it can use
the same constant master edges without animated copies of the surrounding sky.

Run `node tests/impact-lab.cjs` for loading and timeline/control regressions.
Image quality, masking, input and transitions require browser inspection.
