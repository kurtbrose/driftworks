# Ohio roadside settlement bake

Farm meshes originate in [Quaternius Farm Buildings](https://quaternius.com/packs/farmbuildings.html),
CC0 1.0. `catalog.json` records the individual prepared GLB source paths and hashes.
Those source models retain their original pack's license and provenance records.
The simple fuel canopy and three pumps are original Driftworks box geometry.

Run `node tools/bake-ohio-roadside.mjs` to rebuild the normalized, material-color
geometry catalog and binary. This is a composed-scene derivative for batching,
not an alternate export of the entire asset pack. It includes no city textures,
normal maps, shader libraries or runtime GLB parsing.

Ohio's mission definition owns placement, scale and yaw in metres/radians.
`flight-scenery.js` samples nine support points and creates an intentionally flat,
solid asphalt platform. Buildings stand level on that deck. Instances are combined
by palette color once per terrain/radius change, with lane/parking markings.
The mission sets `scale: 1/3` about its authored `anchor`, shrinking both model
dimensions and their layout footprint together. The scene rotates with the asteroid. Only
missions containing the `roadside` descriptor load these assets. Geometry is
decorative, like the highway sign; it does not add collision or saved entities.

Run `node tests/ohio-roadside.cjs` to verify source/binary hashes, finite geometry,
bounded triangle/draw counts, flat-platform geometry and default-mission isolation.

Vehicles come from Kenney Car Kit 3.1 (CC0), with selected prepared GLBs and license in ../kenney-car-kit/. A tractor stands by the main barn; two trucks sit by the right-side fuel stop and parking. The small barn placement is removed. Vehicle colors reduce to a six-color palette during baking; the combined scene uses 17,825 triangles and 22 batches.

The tank carries an original SVG Ohio flag decal, based on the state design described at https://codes.ohio.gov/ohio-revised-code/section-5.01. Its curved front-facing mesh is cached with the scene; the mission owns texture and normalized cylindrical placement parameters.
