# Freighter components in flight missions

Convoy and fleet evacuation freighters own JSON-safe `ship.modules` state.
`src/freighter-sim.js` initializes missing state for older sessions and steps it
through `convoyMission`. Component health, damage variants, surface marks,
punctures and detached body poses belong to the entity. Geometry, textures,
collision indices and GPU buffers are shared or cached outside that state.

`tools/export-convoy-flight.cjs` exports component ranges, triangle ownership,
static fitting bounds and engine mouth associations alongside the existing
batched freighter assets. `shipHulls.hullHit` accepts an optional seventh argument,
a triangle-offset predicate, and reports `triangleOffset` on a hit. Mission
projectiles use this to exclude removed or replaced surfaces, then test damaged
geometry. Hull damage and mission destruction/scoring keep their existing rules.

Containers, tanks, drives, RCS and command units have independent integrity.
Containers acquire one of three panel deformations at 30% integrity. Damage adds
at most 400 triangles per container, retaining the original atlas and hardware.
Scorch anchors follow attached and detached surfaces. Punctured tanks emit bounded
sprite gas; destroyed drives stop their matching engine exhaust.

Detached modules receive a sustained outward, off-center spring impulse and
inherit the moving ship's velocity. Lightweight contacts against nearby hull
fittings, modules and debris preserve tumble and prevent interpenetration.
Debris uses the shared flight broad phase and wormhole travel. Limits are twelve
detached bodies for eighteen seconds, 128 vent particles, eight visible leak
sources, four marks per component and 24 per ship. Drive loss does not yet change
route guidance, and punctures do not consume gameplay fuel.

`experiments/freighter-flight.js` adapts the entity to the production renderer.
Intact ships retain the existing instance path. Changed hull buffers rebuild only
when geometry revisions change; loose parts move through transforms. The study
at `studies/freighter-modules.html` remains an authoring and effect review range.

Focused checks: `node tests/freighter-missions.cjs`,
`node tests/convoy-collision.cjs`, `node tests/freighter-damage.cjs` and
`node tests/check-types.cjs`. With optional development Playwright available via
`DRIFTWORKS_BROWSER_MODULES`, run
`node tools/check-freighter-missions-browser.cjs` against the local HTTP server.
It exercises both actual mission scenes, projectile damage, detachment, tank
venting, engine exhaust and fixed-camera intact/damaged ABBA rendering. Captures
and timings go to ignored `output/freighter-integration/`. Headless captures mask
the existing HUD overlays; scene geometry and sky remain active. Timings report
CPU submission and browser cadence, not GPU execution or a whole-game budget.
