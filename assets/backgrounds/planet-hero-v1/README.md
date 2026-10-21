# Complete planet hero baseline

`master.png` is a 1254px square full visible hemisphere generated with the built-in
ImageGen tool. The reference and exact prompt are in `provenance.json`. Its whole
atmospheric limb is inside black image margins. It is ordinary flat artwork;
ImageGen was not asked to produce a panorama or cube projection.

Open `experiments/planet-hero-review.html?mission=planet-hero` to compare 80, 110
and 140 degree card widths. The existing opaque two-landmark sky pass places the
planet at yaw 90, pitch -30, with the separate existing sun behind the observer's
left shoulder. A 140 degree review lens exposes the whole disk. Switch to the
ordinary 45 degree flight lens to inspect a close limb view. Stars whose fixed
directions fall behind the disk are excluded once at renderer construction.

`experiments/flight.html?mission=planet-hero` runs the real 8v8 furball with this
static sky. Width variants use mission IDs `planet-hero-80` and `planet-hero-140`.
All share the unchanged training physics and combat rules. Existing missions and
saved sky preferences are unaffected. Translation is ignored by the sky renderer.

The review viewer now plays the overhead impact sequence in `impact-overhead-v1/`.
It contains six full-frame edits of the same master: flash, 12/32/60/90-second
intermediates and a 120-second ejecta endpoint. The root is near the disk center,
viewed from above along the local normal. These images are illustrative stages;
the generation did not exactly enforce requested pixel diameters or physical times.
The edits and master are all 1254px square. The compositor always draws in the
master coordinate system; a mismatched aspect ratio is rejected.

`experiments/planet-impact.js` redraws the frozen master and blends only the
neighboring two frames through one radial permission mask centered at (.488,.472),
radius .125, fully opaque through 72% of its radius. The limb, black margins and
all pixels outside that region remain pristine. The ordinary sky renderer accepts
the resulting canvas through `setPlanetImage`, preserving the same card projection.
Uploads occur at most 30 times per second while playing, and stop on unchanged
paused frames. Switching lenses also uploads the current canvas into that view.
The viewer includes pause, restart, scrubbing, speed, painted-stage selection and
a pristine-reference checkbox. Playback holds at 180 seconds and does not loop.

Flight links still use the static baseline while this animation is reviewed.
There is no cube bake, surface simulation, parallax or generated planet geometry.
No planar/cubemap images are stitched together.
Large cards occupy a large sky angle but still have finite native source detail;
the close flight view can magnify this 1254px source beyond its useful resolution.

The optional `flightSkybox.create(...,{fov})` review setting controls only that
instance's sky projection. It is clamped to 25–150 degrees; ordinary flight keeps
its existing 45 degree lens.

## Baked playable proof

Mission `planet-impact-baked` uses the seven lossless 4K spherical maps in
`baked-v1/`, produced by `tools/bake-planet-impact.py` from the existing plates.
The recipe records placement and mask; no artwork was regenerated for the bake.
See `docs/impact-timing.md` for physical references, timing caveats and the
proposed 30-second through 10-minute art beats. Current playback still ends at
the 120-second painting; it does not claim to model the later stages.

## Research revision 2

`impact-overhead-v2/` contains seven new full-frame edits from the built-in
ImageGen tool. Exact prompts, reference roles and times are in `prompts.json`.
Together with the pristine master they cover 0, .25, 2, 30, 60, 120, 300 and
600 seconds. The tiny initial flash fades promptly, early footprints are smaller,
and the five/ten-minute cloud has ragged steam edges without a clean glowing ring.
The frozen-master permission mask is centered at (.49,.46), radius (.085,.085),
solid through .72 then feathered. `baked-v2/` holds eight matching 4K spherical
maps and the recipe. Both older source plates and `baked-v1/` remain available.

`planet-impact-watch` is a truly empty flight world: no asteroid, mothership,
hostiles, landmarks or invisible terrain collision. It starts stationary facing
the planet; the sky begins five seconds before impact when flight starts.
Settings provide time, speed and restart. `planet-impact-baked` retains the 8v8
dogfight. Current playback uses v2; the v1 notes above describe the earlier study.
