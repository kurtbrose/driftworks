# Driftworks original models

These are original procedural Driftworks designs, separate from third-party ship packs.

## Asteroid mining rig

Catalog ID: `driftworks:mining-rig`. Author: Driftworks project.

The canonical geometry is `src/scene3d.js` (`miningPlatformGeometry`). Catalog metadata and comparison geometry live in `src/ship-models.js`. No imported mesh, texture, or third-party model is used for the rig itself. Astronaut and fighter scale references in the design study retain their separate source credits.

The current rig has a 36 m main hull, eight independent anchoring legs, a suspended two-level control pod, fixed black infill and yellow two-stage bay doors. Earlier blockouts have been retired. Use `tests/mining-platform-orbit.html` for interior, terrain-fitting and ramp-deployment inspection. The catalog normalizes it to the shared 17 m comparison sphere; that display scale does not redefine the rig's physical dimensions.

This entry inherits the repository's licensing; it does not claim the imported packs' CC0 provenance.
