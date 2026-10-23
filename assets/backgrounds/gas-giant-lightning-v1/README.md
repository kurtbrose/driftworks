# Gas giant / independent lightning v1

Whole fictional gas giant hemisphere with Jovian zonal banding. `dark.png` and
`lit.png` are original square ImageGen plates, retained unchanged. Exact prompts
and provenance are in `prompts.json`. The earlier close cloudscape was rejected.

Open `../../../experiments/gas-giant-lab.html` through the local server.
Eight independent seeded burst envelopes extract the positive light difference
between the illuminated and dark cubemaps through elliptical source permissions.
Each new burst moves that difference by up to .036 horizontally and .021 vertically
in source UVs. Position stays fixed while the burst is visible; the next burst
relocates within its local neighborhood. This is deliberately bounded to retain
the source cloud perspective. Only emission moves: the dark cube always owns the
surface bands, limb and day-side geography. Feathering starts at 48% radius.
Original source permissions do not overlap; any drifting outer feathers combine
with a maximum rather than additive doubling. Multiple cells can flash together.

Both recipes use Z-up, yaw 90 (+Y), pitch/roll zero, width 110 degrees, gain one,
square aspect, display RGB. Card distance is one. Each state is baked at timestamp
zero to six 1024-square faces using `tools/bake-sky-cube.py`; each manifest records
camera orientation, image row direction and hashes. Source margins are black;
this study has no star pass, so there are no stars showing through the planet.

Rebake each recipe with the existing Python baker, `--size 1024 --output` its
matching `dark-cube` or `lit-cube` directory. Python requires NumPy and Pillow for
authoring only. Runtime uses WebGL and twelve local PNGs; no network dependency.
The review samples a fixed dark cubemap plus the two source cubemaps only inside
active light permissions; it does not upload or repaint textures per frame.
Pause, unlit, original all-lit positions, activity,
whole-hemisphere framing and reduced-motion initial pause are available.
Unchanged paused, hidden and static-comparison frames skip GPU draws; camera,
resize and manual burst changes still redraw. No depth/stencil buffer is requested.
The twelve runtime PNGs total 3,127,337 bytes; 1024-square RGB cube storage is
36 MiB, or 48 MiB if the driver stores RGB as RGBA, excluding canvas buffers.
GPU frame time has not been benchmarked. Resource lifecycle regressions exercise
the real preview with a stub renderer: twelve startup uploads, zero animation
uploads, and pause/static/hidden draw suppression with correct resumption.

This is an isolated skybox animation experiment; flight mission choices are
unchanged. The source hemisphere is intentionally complete even when a closer
field of view crops it. Perspective views away from the card center can stretch
its silhouette as expected for a tangent-plane astronomical sprite.

Run `node tests/gas-giant-weather.cjs` for source mask separation, concurrent bursts,
reproducibility, drift bounds, stable visible bursts and baked-face checks. The shared cube regression checks the
baker's twelve edge ray pairs and camera conventions.
