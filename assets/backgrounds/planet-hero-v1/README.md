# Complete planet hero baseline

`master.png` is a 1280px square full visible hemisphere generated with the built-in
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

This baseline has no new impact sequence, cube bake, surface simulation, parallax
or generated planet geometry. No planar/cubemap images are stitched together.
Large cards occupy a large sky angle but still have finite native source detail;
the close flight view can magnify this 1280px source beyond its useful resolution.

The optional `flightSkybox.create(...,{fov})` review setting controls only that
instance's sky projection. It is clamped to 25–150 degrees; ordinary flight keeps
its existing 45 degree lens.
