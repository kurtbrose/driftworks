# Concept trio experiment

Three low-poly reconstructions from the concept sheet supplied in chat: V-1 Raptor, B-2 Bulldog and C-3 Halo. This is a manual procedural interpretation, not an automatic image-to-3D reconstruction. Unseen surfaces and the Halo's ambiguous ring connections are inferred. The supplied reference's authorship and license are unknown; these assets make no third-party CC0 claim.

Open `experiments/concept-ships.html` through the repository's static server. Switch between blockout, detail and painted stages; orbit or inspect top, front and side views. Gameplay ships are unchanged.

Each `.gltf` is an actual triangle mesh with embedded geometry, UVs, named materials and a relative reference to `panels.png`. Keep the texture beside the model when importing into Blender or another glTF tool. Models export with Y up; the lab's internal meshes use Z up and +Y forward. Study geometry is expressed in metres and compared with a 1.80 m astronaut; this does not assign physical dimensions to gameplay ships.

`panels.png` is a deterministic 256×256 neutral panel tile with staggered joints, fasteners and fine mottling. UVs stay inside the tile to match the shared viewer's clamped texture sampler. Armor and markings multiply this tile by material colors. Cockpits, vents, barrels and lights use simple materials. The glTF marks light materials emissive; the existing lab renderer shows their base color without a bloom pass.

Rebuild all JSON, glTF and texture assets using `python tools/generate-concept-ships.py` (standard library only). JSON retains per-part stage tags for the lab. Exports contain the final painted stage. All files load locally without external services.

## Geometry refinement

The lab's **Geometry pass** selector compares the preserved `*-initial.json` meshes with the refined meshes at the same camera pose. Downloads always use the refined mesh. The original sheet is available under **Concept reference**; it is supplied reference material, not project-authored art. The generator intentionally does not overwrite the initial snapshots or reference sheet.

Comparison passes add real mesh detail, followed by corrections to the reference proportions:

- Raptor: broad deep wedge fuselage with sloping cheek armor; separately inset wing plates, reinforced leading edges, access hatches, framed canopy, raised avionics spine, canted two-tone fins, inlet/exhaust sockets, gun collars and rear stabilizers. Wing paint follows the top plates; the nose stripe follows the hull slope.
- Bulldog: wider pod separation; two guns mounted to the inner attachment housings instead of pod end faces; reduced glazing with an opaque armored brow over the rear cockpit. Independent front/rear pod armor, exposed ribbed cores and longitudinal pipes, side armor tiles, recessed lamp sockets, front louvers and rear exhaust sockets.
- Halo: larger curved structures with thick beveled octagonal beam cross-sections instead of flat strips; shorter hull nose within the crescents and one centerline nose gun. Separate armor tiles and thin inset light channels, modeled hinges, swept layered wing braces, shoulder armor, twin rear engine pods and blue dorsal panels.

Raised armor, seams, fasteners and sockets are geometry visible in the detail stage without a texture. The panel tile supplies only finer surface variation. Back surfaces and internal mechanisms are still interpretations; this remains a lightweight model study rather than an exact reconstruction of every illustrated panel.

## Astronaut scale and cockpit fit

The standing scale reference reuses the local [Quaternius astronaut](../../characters/quaternius-astronaut/README.md), sampled by its existing pose loader and uniformly scaled to 1.80 m. **Cockpit fit / seated pilot** removes the opaque canopy shell, makes glazing transparent, and places the existing `fighter-cockpit.js` seated astronaut and chair at the model's authored `pilotSeat`. Frame bands are open rings, so their caps do not block the cabin. The armored Bulldog brow stays visible during this inspection.

The seated pose is already calibrated to a standing 1.80 m astronaut by `tools/bake-fighter-cockpit.mjs`; no limb or body scaling is applied in this lab. Tests check helmet and shoulder envelopes against canopy bounds, alongside the requested gun placement, fuselage depth, pod spacing and ring thickness. This is a fit study rather than a full cockpit interior or a collision-certified seating design. Astronauts and chairs are viewer references and are not included in ship glTF exports. Their existing separate source provenance applies.
