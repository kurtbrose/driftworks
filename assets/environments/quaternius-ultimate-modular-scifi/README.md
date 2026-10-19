# Ultimate Modular Sci-Fi Pack — Quaternius

[Source pack](https://quaternius.com/packs/ultimatemodularscifi.html) ·
[CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/)

Credit: **Ultimate Modular Sci-Fi Pack by Quaternius (CC0 1.0)**.
Credit is voluntary under CC0; retain this record so the origin remains clear.
See `LICENSE.txt` and `provenance.json` for license evidence and file hashes.

## Contents

- `source/FBX/`: all 91 user-supplied FBX files, preserved byte-for-byte,
  including `Walls/` and `Details/`. No upstream license file was supplied.
- `models/`: one self-contained glTF 2.0 binary (`.glb`) per FBX, with the same
  names and subdirectories. Geometry, normals, material colors, node names,
  pivots and transforms are retained by FBX2glTF. Materials are approximations
  of the FBX Phong materials in glTF's metallic/roughness model.
- `provenance.json`: model catalog, source/output SHA-256 hashes, byte counts,
  triangle/material/animation counts, converter version, options and hash.
  Model URLs are relative to this directory.

The files use glTF's Y-up, metre convention, with source scale/placement
converted by the FBX SDK. No individual centering or resizing is applied:
modular pieces retain their shared placement conventions. Inspect dimensions
with `new THREE.Box3().setFromObject(gltf.scene)` before layout; visual asset
scale does not define Driftworks simulation distances. The supplied files have
no animation clips. No external textures or compression decoders are needed.
These are available assets; they are not wired into gameplay.

## Use with the vendored Three.js

Serve the repository normally. In an HTML page in `experiments/`, use:

```html
<script type="importmap">
{"imports":{"three":"../vendor/three/build/three.module.js"}}
</script>
<script type="module">
import { GLTFLoader } from '../vendor/three/examples/jsm/loaders/GLTFLoader.js';
const loader = new GLTFLoader();
const gltf = await loader.loadAsync(
  '../assets/environments/quaternius-ultimate-modular-scifi/models/FloorTile_Basic.glb'
);
// Add to your scene: scene.add(gltf.scene).
// Clone gltf.scene for repeated static pieces; share geometries and materials.
</script>
```

Use lighting with these standard materials. All runtime URLs stay local.

## Reproduce and verify

Obtain [FBX2glTF v0.9.7](https://github.com/facebookincubator/FBX2glTF/releases/tag/v0.9.7)
for your platform, then run from the repository root:

```text
python tools/convert-modular-scifi.py path/to/FBX2glTF
node tools/check-modular-scifi.mjs
npm run check
```

The converter is an offline authoring tool, not a runtime dependency. It is
not redistributed here. Conversion adds source/license metadata to each GLB.
The checker loads every GLB with the vendored GLTFLoader, checks finite geometry
and bounds, triangle indices, embedded resources, and source/output hashes.
