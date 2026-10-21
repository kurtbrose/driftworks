# Concept trio experiment

Three low-poly reconstructions from the concept sheet supplied in chat: V-1 Raptor, B-2 Bulldog and C-3 Halo. This is a manual procedural interpretation, not an automatic image-to-3D reconstruction. Unseen surfaces and the Halo's ambiguous ring connections are inferred. The supplied reference's authorship and license are unknown; these assets make no third-party CC0 claim.

Open `experiments/concept-ships.html` through the repository's static server. Switch between blockout, detail and painted stages; orbit or inspect top, front and side views. The three models also participate in the normal mixed placeholder fleet and can be selected individually in the flight lab. Gameplay handling and combat rules are unchanged.

Each `.gltf` is an actual triangle mesh with embedded geometry, UVs, named materials and a relative reference to `panels.png`. Keep the texture beside the model when importing into Blender or another glTF tool. Models export with Y up; the lab's internal meshes use Z up and +Y forward. Study geometry is expressed in metres and compared with a 1.80 m astronaut; this does not assign physical dimensions to gameplay ships.

`panels.png` is a deterministic 256x256 neutral panel tile with staggered joints, fasteners and fine mottling. UVs stay inside the tile to match the shared viewer's clamped texture sampler. Armor and markings multiply this tile by material colors. Cockpits, vents, barrels and lights use simple materials. The glTF marks light materials emissive; the existing lab renderer shows their base color without a bloom pass.

Rebuild all JSON, glTF and texture assets using `python tools/generate-concept-ships.py` (standard library only). JSON retains per-part stage tags for the lab. Exports contain the final painted stage. All files load locally without external services.

## Geometry refinement

The lab's **Geometry pass** selector compares the preserved `*-initial.json` meshes with the refined meshes at the same camera pose. Downloads always use the refined mesh. The original sheet is available under **Concept reference**; it is supplied reference material, not project-authored art. The generator intentionally does not overwrite the initial snapshots or reference sheet.

Comparison passes add real mesh detail, followed by corrections to the reference proportions:

- Raptor: one closed arrowhead delta shell spanning the centerline through the former wing area to the outer edges. The roof and belly taper continuously outward; there is no separate narrow fuselage, flat wing slab or wing-root step. Flush service panels, cheek louvers and red markings follow the shell surface. The canopy, avionics spine, canted two-tone fins, integrated engine sockets remain distinct fittings. Two short cannons sit inside rounded ports cut directly into the sloping delta skin. Tapered cavity walls descend to dark floors, and the small metal-rimmed muzzles sit more than 15 cm below the surrounding surface. The barrels are pitched through their openings, with their receivers buried inside the hull. The rounded cuts remain part of the closed delta shell. Surface markings split at shell stations and the center crease so they stay above the actual roof.
- Bulldog: wider pod separation; two guns mounted to the inner attachment housings instead of pod end faces; reduced glazing with an opaque armored brow over the rear cockpit. Independent front/rear pod armor, exposed ribbed cores and longitudinal pipes, side armor tiles, recessed lamp sockets, front louvers and rear exhaust sockets.
- Halo: larger curved structures with thick beveled octagonal beam cross-sections instead of flat strips; shorter hull nose within the crescents and one centerline nose gun. Separate armor tiles and thin inset light channels, modeled hinges, swept layered wing braces, shoulder armor, twin rear engine pods and blue dorsal panels.

Raised armor, seams, fasteners and sockets are geometry visible in the detail stage without a texture. The panel tile supplies only finer surface variation. Back surfaces and internal mechanisms are still interpretations; this remains a lightweight model study rather than an exact reconstruction of every illustrated panel.

## Astronaut scale and cockpit fit

The standing scale reference reuses the local [Quaternius astronaut](../../characters/quaternius-astronaut/README.md), sampled by its existing pose loader and uniformly scaled to 1.80 m. **Cockpit fit / seated pilot** removes the opaque canopy shell, makes glazing transparent, and places the existing `fighter-cockpit.js` seated astronaut and chair at the model's authored `pilotSeat`. Frame bands are open rings, so their caps do not block the cabin. The armored Bulldog brow stays visible during this inspection.

The seated pose is already calibrated to a standing 1.80 m astronaut by `tools/bake-fighter-cockpit.mjs`; no limb or body scaling is applied in this lab. Tests check helmet and shoulder envelopes against canopy bounds, alongside the requested gun placement, delta-shell closure and center-to-edge continuity, inset muzzle clearance, flush cavity geometry and clear firing paths through the rounded ports, pod spacing and ring thickness. This is a fit study rather than a full cockpit interior or a collision-certified seating design. Astronauts and chairs are viewer references and are not included in ship glTF exports. Their existing separate source provenance applies.

## Flight pack

`meshes.js` registers the three fighters as the `concept-trio` ship pack. The generator also bakes a material-color atlas for each ship (`*-flight.png`), allowing the normal cached single-texture ship draw path to preserve authored finishes without per-frame material batching. These are local generated assets; no glTF loader or runtime generation is required.

Flight meshes use the same centered 8.5 m comparison radius as the placeholder pack. Gun muzzle and engine nozzle anchors undergo the identical centering and scale transform. This comparison normalization is independent of the metre-scaled astronaut study. The mixed rotation interleaves this pack with Quaternius; mission-specific vehicle packs remain excluded. Headless sessions, study workers, the catalog and browser flight pages load the same pack. Provenance stays separate from the Quaternius CC0 library.
