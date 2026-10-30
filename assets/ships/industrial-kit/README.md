# Industrial family — geometry study 01

Open `studies/industrial-kit.html` through the repository HTTP server. The viewer
assembles six reusable procedural parts and three vessels using vendored Three.js.
Select an individual part or vessel and download an embedded glTF for DCC import.
The editable authoring source is `kit.js`; no generator or runtime service is needed.

Units are metres, +X aft, +Y up, +Z starboard. Part origins sit at their centre;
the structural grid repeats every 12 m. Truss end connections are at X ±6 m.
Cabins are approximately 8 × 4.4 × 5 m; cargo pods 10 × 5 × 5 m, tanks 9.2 m
diameter inside a 12 m cage. Couplers and engine modules share longitudinal X axes.
Named glTF groups preserve each part's placement; colors use linear glTF factors.

This is an intentional standalone modeling review, not a flight-ready asset pack.
The tug, hauler and tanker establish shared proportions and hardware. Surfaces use
simple geometry and flat materials, with no authored wear textures or interiors.
Shared primitive geometries/materials reduce construction allocations; meshes remain
separate to keep parts editable. Runtime batching, collision, LOD and performance
readiness in the actual flight scene remain for integration.
