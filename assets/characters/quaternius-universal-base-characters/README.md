# Quaternius Universal Base Characters — Standard

Downloaded from [the official creator page](https://quaternius.itch.io/universal-base-characters)
on 2026-10-23. CC0-1.0; see `original/License_Standard.txt`.
The complete 122 MB ZIP remains in the local Downloads folder; its name and
SHA-256 are recorded in `provenance.json`.

This repository preserves an unmodified subset: the Godot/UE male and female
Superhero full-body glTF exports and their supplied textures, eight origin-zero
glTF hair/eyebrow pieces and their textures, and the license. Source assets total
about 45 MiB; this is authoring input, not a proposed runtime download budget.

Both bodies have a Head bone and separate eye/eyebrow mesh objects, but the head
surface belongs to the body mesh. Extracting a head requires a derived asset;
it is not already a standalone head GLB. Neither body export contains animations.
Use source materials and authored UVs as the first visual baseline before adapting
portrait identities. These are the free Superhero proportions, not the Regular or
Teen bodies advertised for the complete pack.

## Export filename issues

The source glTF files reference `T_Eye_Normal_png.png`, while the supplied texture
is `T_Eye_Normal.png`. The male export also references `T_Hair_1_Normal_png.png`,
while the supplied texture is `T_Hair_1_Normal.png`. Keep originals untouched;
a future runtime derivation should resolve these aliases explicitly.

Acquisition validation: source bytes were copied directly from the downloaded ZIP;
`provenance.json` records a SHA-256 and byte length for each retained file.
The existing character catalog and crew-deck scene have not been switched to this
pack yet. Inspect and derive one head first, checking front, three-quarter and
profile views with its original textures.
