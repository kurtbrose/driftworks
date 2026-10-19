# Quaternius / quaternius-ultimate-spaceships

Original creator: [Quaternius](https://quaternius.com/packs/ultimatespaceships.html). License listed by the creator: [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).
Acquired 2026-10-15. ZIP supplied by the user in assets/ships; moved into this pack-specific source folder. The temporary third-party sample downloads were removed and are not used.

The untouched archive is `source/quaternius_pack.zip`. SHA-256 and acquisition details are in `provenance.json`.
Only OBJ/MTL exports and the preview/license (where supplied) are extracted alongside it. Other formats and all textures remain in the ZIP. No runtime external requests are made.

`meshes.js` is our derived **neutral-material geometry preview**, generated with `python tools/convert-ship-packs.py`. It triangulates polygons, recomputes flat normals, changes axes from source X/Y/Z to right -X / forward +Z / up Y (a handedness-preserving rotation), centers bounding boxes, and scales the furthest vertex to 8.5 metres. It preserves the geometry without decimation; degenerate triangles are omitted. Legacy neutral geometry remains available to geometry utilities. Inspection additionally uses glTF UVs, source normals, and the embedded orange base-color texture; lighting is the viewer’s simple diffuse shader rather than full PBR. Each model stores its original OBJ path and SHA-256.

Flight enemies fit inside the existing 9 m collision sphere. Selecting artwork preserves handling and nominal DPS, but controls muzzle locations, volley size and compensating fire rate; see docs/retail-flight-loadouts.md. The libraries remain separate and model IDs are prefixed with their pack directory.

The ship inspection viewer now defaults to Quaternius Striker with original glTF base-color texture, UVs and normals; both inspection and flight use the original source appearance. The offline converter reads the archived self-contained glTF 2.0 triangle exports and writes inspection vertex data plus local PNGs in `textures/`. This supports these single-mesh exports, not general glTF/GLB, scene transforms, animation, or full PBR. Flight uses the same source textures, UVs and normals, grouping ships by model and texture. Deployment still uses only relative local assets and needs no build.
