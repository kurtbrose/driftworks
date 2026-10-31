# Pocket carrier: first blockout

Original model reconstructed from the user's carrier screenshots, without the
paywalled source mesh. This is an offline concept review, not a gameplay asset.

- Editable source: `pocket-carrier.blend`; portable export: `pocket-carrier.glb`.
- Authoring coordinates: metres, +Y forward, +Z dorsal. Standard glTF export
  converts these to glTF's Y-up coordinates.
- Overall envelope: approximately 156.8 m long, 108 m wide, 34.5 m tall.
- Ten blue fighter proxies use the training fighter's 17 m length / 14 m span
  from `src/ship-catalog.js`. Two banks of five have 18 m longitudinal pitch.
- Berth centers are at X +/-16 m; the 18 m clear central aisle accommodates
  that fighter envelope. Hangar deck is at Z -3.2 m; overhead beams start at
  Z 8 m. A framed 19 m clear by 8 m clear aft portal serves the central aisle.
- Revised hull encloses the hangar inside continuous armored side volumes,
  with a 9 m deep lower hull and ventral machinery keel. These reserve volume
  for machinery, stores and service circulation; detailed rooms, fuel tanks,
  engine isolation and pressure doors remain to be designed. Side access doors
  and transverse overhead beams establish the intended structural layout.
- This checks static parking space only. Towing, launch/recovery choreography,
  varied catalog craft, maintenance clearance and operational capacity remain
  unresolved. Proxies and canopy blocks are explanatory geometry.

Regenerate with Blender 5.2:

```text
blender --background --python tools/build-pocket-carrier.py
```

Renders go to ignored `output/pocket-carrier/`: hero, top, side, aft, underside,
and roof-off cutaway. The GLB contains the ship and fighter proxies, without
studio lights or camera. The Blend retains the review studio and removable roof
objects. Broad plate armor, engine pods, drive faces, structural belt and hangar
frames establish proportions; detailed equipment and materials are deferred.
The second pass replaces the original full-width aft slot and dark side belt
with a smaller framed portal and continuous deep side hulls. The roof-off
cutaway deliberately removes roof beams and the upper aft header for inspection.

Runtime integration and measured scene performance are not yet evaluated.
