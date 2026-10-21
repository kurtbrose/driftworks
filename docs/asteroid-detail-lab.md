# Asteroid detail lab

Open `http://localhost:8000/tests/asteroid-detail-lab.html` after starting the static server. The experiments index links to it. This lab uses the production `scene3d` renderer and geology without changing the draw-detail implementation.

Use the fixed seed and viewport for comparable runs. Bounce looks down while repeatedly varying altitude; sideways flight moves along a repeating arc; approach moves logarithmically between 2 m and three asteroid radii above a fixed site. The site faces the existing directional sun. Pitch controls bounce/flight; approach always faces the ground. Scrub pauses motion. Clean view changes viewport size and is for visual inspection, not comparisons with sidebar runs.

Record runs one warm-up cycle and two measured cycles, then pauses. JSON exports include settings, viewport/DPR, renderer identity, per-frame altitude/phase, reference crossings, triangles, draw calls and timing summaries. Recordings cancel on settings, visibility, or viewport changes. A cancelled run can be exported as incomplete. Restart resets motion, not renderer resources: there is no cold-cache test until a detail cache exists.

Frame intervals measure delivered animation cadence, including browser scheduling and display refresh. CPU time covers camera setup, scene sync and render submission, not GPU completion. Optional WebGL2 disjoint timer queries measure rendering asynchronously; unsupported or disjoint results are absent, never reported as zero. Pending queries are bounded. No synchronous readback or GPU finish is used. Trace redraw is throttled to four times per second. GPU samples may arrive shortly after recording finishes; let the page settle before exporting.

White dots mark crossings of reference altitudes (4, 16, 64, 256 m), not actual renderer LOD boundaries. No cache hits, bake events or memory figures are invented. Add real event instrumentation when those systems exist. Compare implementations in separate runs, retaining the same seed, camera settings and physical canvas resolution. Inspect orbit, approach, close feet and grazing views for seams, shimmer, color shifts and lost detail.

Focused checks: `node tests/asteroid-detail-lab.cjs`. Browser verification is required for camera presentation, timing availability, and controls. Model tests run in the shared suite.
