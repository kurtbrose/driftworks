# Farm Buildings — Quaternius

[Original pack](https://quaternius.com/packs/farmbuildings.html) · **CC0 1.0**.
The pack page supplies the license evidence; no license file was in the supplied ZIP.

`models/` contains all 13 buildings/props as self-contained glTF 2.0 binaries.
Original Blender files and download archives were removed after conversion.
`provenance.json` catalogs triangles, materials, file sizes and SHA-256 hashes,
including the original archive and removed-source hashes. Source records are
metadata only; only runtime models and the license are retained locally.

Converted with Blender **5.2.2 LTS**, entirely through its background CLI, with
embedded script execution disabled. Only meshes and transform parents are
selected; cameras, lights and animation clips are excluded. Material colors,
normals, pivots and source placement/scale are retained. Legacy viewport diffuse
colors are explicitly mapped to matte Principled materials (roughness 0.85),
because automatic export otherwise loses the old shader colors. glTF is Y-up; inspect
bounding boxes before placing these older assets at a physical gameplay scale.
No compression decoder or runtime network dependency is needed.

Useful Ohio scene pieces: `SmallBarn` (2,176 triangles), `OpenBarn` (1,612),
`Silo` (1,592), `WaterTower` (2,507), `Fence` (188), `Fence2` (324).
`TowerWindmill` is the heaviest at 7,827 triangles. Share geometry/materials when
cloning fences; merge static pieces by material for a cheap distant settlement.
These assets are prepared for use, not yet placed in the flight mission.

To reproduce, download the original pack again into `assets/`, then run:

```powershell
python tools/prepare-rural-assets.py 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe'
node tools/check-rural-assets.mjs
```

Use the existing vendored `GLTFLoader` with relative `models/SmallBarn.glb` URLs.
Source credit: **Farm Buildings Pack by Quaternius (CC0)**.
