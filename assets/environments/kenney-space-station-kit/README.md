# Space Station Kit by Kenney

Version 1.0, downloaded on 2026-10-18 from the
[official listing](https://kenney.nl/assets/space-station-kit).
Licensed under [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).
Credit to Kenney is appreciated but not required by the included license.

The untouched archive is `source/kenney_space-station-kit.zip`.
`provenance.json` records the source, direct download URL, acquisition date,
byte count, and SHA-256. `License.txt` is extracted unchanged from the archive.

The archive contains 97 models in each of GLB, FBX, and OBJ/MTL formats,
plus textures and previews. These are available as placeholder environment
assets; models remain in the archive and are not integrated into the game.
Any future runtime assets should be extracted locally and referenced with
relative URLs.

The fighter cockpit study uses the unmodified `models/chair-armrest-headrest.glb`, extracted from `Models/GLB format/chair-armrest-headrest.glb` in the source archive. `tools/bake-fighter-cockpit.mjs` converts this chair to local vertex batches with neutral grey placeholder materials; the study places it at 1.6 times its source scale.
