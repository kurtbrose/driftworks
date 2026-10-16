# Quaternius / quaternius-ultimate-spaceships

Original creator: [Quaternius](https://quaternius.com/packs/ultimatespaceships.html). License listed by the creator: [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).
Acquired 2026-10-15. ZIP supplied by the user in assets/ships; moved into this pack-specific source folder. The temporary third-party sample downloads were removed and are not used.

The untouched archive is `source/quaternius_pack.zip`. SHA-256 and acquisition details are in `provenance.json`.
Only OBJ/MTL exports and the preview/license (where supplied) are extracted alongside it. Other formats and all textures remain in the ZIP. No runtime external requests are made.

`meshes.js` is our derived **neutral-material geometry preview**, generated with `python tools/convert-ship-packs.py`. It triangulates polygons, recomputes flat normals, changes axes from source X/Y/Z to right -X / forward +Z / up Y (a handedness-preserving rotation; this pack faces the opposite source direction from Mehrasaur), centers bounding boxes, and scales the furthest vertex to 8.5 metres. It preserves the geometry without decimation; degenerate triangles are omitted. Source UVs/materials/textures are not rendered in this initial experiment. Thus the preview is not a full reproduction of the source appearance. Each model stores its original OBJ path and SHA-256.

Flight enemies fit inside the existing 9 m collision sphere. Selecting artwork changes no AI, maneuvering, damage, or gun values. The libraries remain separate and model IDs are prefixed with their pack directory.
