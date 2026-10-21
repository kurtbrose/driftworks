# Planet impact: physical reference and playable study

The current artwork is a successful composition test, not a calibrated impact
simulation. The flight proof is `experiments/flight.html?mission=planet-impact-baked`;
For an actually empty map without the training asteroid, mothership or hostiles,
use `experiments/flight.html?mission=planet-impact-watch`. The same maps can be scrubbed in
`experiments/planet-hero-review.html?mission=planet-impact-baked`.

## Reference assumptions

Use an Earth-sized terrestrial world and a roughly Chicxulub-class rocky impactor
(order 10 km across), striking ocean near continental crust. Water depth,
velocity, angle, atmosphere and target geology must be chosen before specifying
precise blast arrival times. A deep-ocean impact is not identical to Chicxulub.

Distance reduces angular motion, not elapsed physical time. The flash remains
fast. Light-travel delay across this scene does not turn seconds into minutes.
An atmospheric pressure front, visible condensation, ballistic ejecta and a
tsunami are distinct phenomena; they need not share one expanding ring.

## Proposed art beats (interpretation, not computed timestamps)

| After contact | What to show from overhead |
| --- | --- |
| 30 seconds | Initial flash has declined; hot vapor and an expanding ejecta curtain obscure the excavation. A compact, bright center, irregular surrounding material. |
| 1 minute | Growing vapor/ejecta footprint; declining white heat. Surface excavation and collapse continue below the obscuring cloud. |
| 2 minutes | An increasingly opaque cap, hot gaps rather than a uniformly glowing disk. Falling debris and outward-moving material; no intact asteroid. |
| 5 minutes | A broader, less tidy ejecta/steam cloud. The initial sharp condensation feature should have broken up or become faint; exact lifetime depends on atmospheric conditions. |
| 10 minutes | Persistent regional aftermath, suspended material and obscured surface. No return to pristine clouds. Ocean disturbances continue separately; avoid a glowing global wave. |

The timing anchors come from LPI's [Chicxulub hydrocode description](https://www.lpi.usra.edu/science/kring/Chicxulub/discovery/):
maximum cavity depth at 20 s, maximum volume at 55 s, central uplift above the
original surface at about 2 min, maximum uplift at about 3 min, and crater
formation complete around 8 min. These are processes underneath the plume,
not promises of visible surface detail.

LPI describes a [thermal pulse lasting a few minutes and regional debris arriving within minutes](https://www.lpi.usra.edu/science/kring/Chicxulub/regional-effects/).
That does not mean the initial optical flash stays white for minutes, nor that a
visible cloud ring directly measures the pressure front. There is no defensible
single ring speed or fade time from these paintings alone.

## Scale correction in revision 2

The original v1 affected area was roughly 100 source pixels in radius versus a planet
radius near 550 pixels. For an Earth-radius world, a near-center orthographic
estimate `6371 * asin(100/550)` gives about 1,160 km. This is an approximate
art-scale check, not a reconstruction of the generated planet's camera.
The original early labels therefore implied a very large disturbance very quickly.
Revision 2 uses seven new ImageGen edits with deliberately smaller physical
footprints, a brief flash, and new 5/10-minute artwork. These remain artistic
interpretations of the research, not quantitative hydrodynamic output.

Keep the plume top-down and irregular, let the bright core cool, and make any
condensation rim patchy and transient. Expansion should move a front; a crossfade
between differently sized rings can otherwise expose two rings simultaneously.
Revision 2 has eight stages: pristine, 0.25 s optical flash, 2 s faded flash,
30 s, 60 s, 120 s, 300 s and 600 s. The distinct two-second frame prevents a
white flash from lingering through the long blend to the thirty-second image.
The ten-minute painting remains as a persistent aftermath. Original v1 plates
and bakes are retained for comparison.

## Bake and runtime

`tools/bake-planet-impact.py` reuses `tools/compose-skybox.py` with Pillow/NumPy
offline. It applies the review's frozen-master mask before projection and writes
eight lossless 4096×2048 equirectangular maps plus a recipe under
`assets/backgrounds/planet-hero-v1/baked-v2/`. These are ordinary spherical sky
textures, not AI-generated cube faces. Runtime requires no Python or network.

The baked projection matches the opaque landmark renderer's horizontal UV
orientation explicitly. Planet and sun are baked together; the existing fixed
star layer retains disk occlusion. All untouched pixels are identical between
maps. Playback uses two texture samples and adjacent smoothstep crossfades;
only three maps are resident (up to about 96 MiB if stored RGBA), with one
prefetched. A 4096px texture limit is required. This is a desktop visual proof.
The clock starts five seconds before contact, advances with active flight time,
and freezes on pause/loading. Settings contain a scrubber, 1×/5×/20× playback speed and restart button.
The Missions page links both quiet free flight and the ordinary 8v8 dogfight.
