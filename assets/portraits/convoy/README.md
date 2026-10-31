# Convoy radio cast

Five independent cargo hauler captains in worn coveralls, utility jackets and
pressure collars, plus two Lancer officers in matching slate/olive flight gear,
raised-visor helmets and collar rank insignia. Existing identities, voice slots,
and calibrated facial animation remain intact. Passenger-shuttle uniforms and
other mission casts are separate.

`prompts.json` retains the seven built-in imagegen edit prompts. Generated
wardrobe masters are in `source/`. The original dogfight/civilian animation
atlases remain their facial sources. Rebuild using
`./tools/prepare-convoy-portraits.ps1`; no deployment build is required.
The sparse atlas numbers match the radio renderer's existing slot identities.
Control and raider slots fall back to the ordinary mission cast.

Review at `experiments/civilian-cast.html?category=convoy`, or select `convoy`
in `experiments/portrait-review.html` for frozen runtime composites.

## Visual review — 2026-10-31

Inspected all seven characters: Lancer Three, Lancer Two, Mara Vale, Daniel
Okafor, Elena Park, Ines Duarte and Thomas Reed. For each, inspected all 16
actual runtime composites at 256px: neutral/relieved/frustrated/worried crossed
with rest/AH/OO/blink (112 stills total). Checked eyes, lids, brows, mouth,
nose, chin and blend boundaries. No doubled features, displaced mouths,
identity shifts or visible wardrobe/face seams observed in those combinations.
Labeled contact sheets are retained under ignored `output/convoy-cast/`, named
`<slot>-composites.png`.

Also inspected each character transmitting in the live cast gallery at review
and radio sizes, including blinking and expression changes. Captures are in the
same output folder. This review applies to these seven wardrobe variants only;
it does not approve unrelated original portrait pools. No unresolved visual
defects were identified in the reviewed combinations.

Compositor SHA-256: `50dea498a8c78d71689de6b8161d4296a670acbe5b739ca52773e20335033377`.
Runtime atlas SHA-256 values reviewed:

- Lancer Three: `7552d9e3291b53b9d7aaa4225a347e87c6aed53c39bde3bc897804bc888dcafb`
- Lancer Two: `ef16a67c01bffbbe2b42b21c63a5f98fef49aabb26191658a4e77e398d3bb705`
- Mara Vale: `ab09e62e22b90ae8945b7e463b2600c5136467e470909c2b00dbef96cab4ae2f`
- Daniel Okafor: `350601c217dfc05b27a51fb24e96404b0bcb4fa73f9da66ffc60b0652399cbe6`
- Elena Park: `54a452054df287d0ebd4526c06812da80cad0bedf1d3f3f5e1baa6183dfa9aad`
- Ines Duarte: `390e270f2eda060059f39a206cfe5b4b11c5a050c6e6beebeaff3477f7029b98`
- Thomas Reed: `455b44688f6d42ee7d1c421a3ebfe35b4fa839215321ea5c14c3ac6aa70c5f54`

Mechanical validation is separate: `tests/convoy-portraits.cjs` verifies source,
wardrobe, builder and output hashes, seven calibrated facial poses, frozen
clothing, convoy-only routing and bitmap cleanup.
