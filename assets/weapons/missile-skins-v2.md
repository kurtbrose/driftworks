# Missile skins v2

Four independently generated albedo designs packed into one 1024×512 atlas.
The original ivory/orange skin occupies cell 0; the other three are new
built-in ImageGen outputs. No reference image or FreeSpace asset was supplied.

| Cell (row-major) | Design | Reviewed example |
| --- | --- | --- |
| 0, top left | Ivory metal / orange band | Rockeye |
| 1, top right | Ochre hazard / black chevrons | Swarmer |
| 2, bottom left | Blue-white ceramic / red service mark | Tempest |
| 3, bottom right | Copper cladding / graphite / turquoise | Harpoon |

Each tile is 512×256 with a 504×248 usable image and four-pixel edge-extruded
gutters. UVs stay within its interior; ordinary trilinear mipmaps and up to 4×
anisotropic filtering use the existing renderer path. Very distant bodies are
culled, avoiding the coarsest atlas mips where designs would mix. All four
skins share one texture and one opaque body batch. The atlas occupies about
2.67 MiB as RGBA8 with mipmaps; it adds no normal/roughness maps.

`flightGuns.geometry` selects a cell using a stable hash of the weapon family
name, stripping trailing ` D` and `#...` modifiers. Art selection never changes
ammo, damage, guidance, collision, or the three smooth body profiles.

The original prompt is recorded in [missile-skin-v1.md](missile-skin-v1.md).
New full-resolution sources, reduced tile previews and fixed-pose production
captures are retained under ignored `output/missile-skins/`. The deployment
asset is `missile-skins-v2.png`; no runtime network service is required.

## Exact generation prompts

### hazard

> Original game-ready missile ALBEDO UV texture, landscape 2:1. Flat unwrapped cylindrical surface filling entire image edge-to-edge; NOT a rendered missile, no silhouette, no fins, no perspective, no lighting, no highlights, no cast shadows, no border or background. Horizontal axis runs tail at LEFT to nose at RIGHT. Vertical axis wraps circumference: top and bottom must match seamlessly. Broad readable color masses for a 512x256 game texture, subtle small maintenance marks, restrained wear. No real logos or brands, no large text. Industrial ochre-yellow casing with broad diagonal charcoal warning chevrons on the tail quarter, a few asymmetric cream service hatches, thin black fastener seams and a graphite nose. Rugged mining-equipment design, sparse scratches, large clean yellow areas. Panel layout must differ from generic ring-band missiles.

### ceramic

> Original game-ready missile ALBEDO UV texture, landscape 2:1. Flat unwrapped cylindrical surface filling entire image edge-to-edge; NOT a rendered missile, no silhouette, no fins, no perspective, no lighting, no highlights, no cast shadows, no border or background. Horizontal axis runs tail at LEFT to nose at RIGHT. Vertical axis wraps circumference: top and bottom must match seamlessly. Broad readable color masses for a 512x256 game texture, subtle small maintenance marks, restrained wear. No real logos or brands, no large text. Clean aerospace cobalt-blue and white ceramic casing, broad white longitudinal panel strips running horizontally along the body, offset blue service panels, a narrow vermilion warning marking near the tail, a pearl-white nose. Crisp sparse technical stencils and tiny access fasteners, minimal wear. Avoid all-over rectangular panel grids.

### copper

> Original game-ready missile ALBEDO UV texture, landscape 2:1. Flat unwrapped cylindrical surface filling entire image edge-to-edge; NOT a rendered missile, no silhouette, no fins, no perspective, no lighting, no highlights, no cast shadows, no border or background. Horizontal axis runs tail at LEFT to nose at RIGHT. Vertical axis wraps circumference: top and bottom must match seamlessly. Broad readable color masses for a 512x256 game texture, subtle small maintenance marks, restrained wear. No real logos or brands, no large text. Exposed burnt-copper thermal cladding with broad charcoal longitudinal inset strips, silver fastening rails, irregular overlapping heat-shield plates, a pale ceramic nose and a narrow turquoise service marking. Restrained heat discoloration in the copper albedo, no glow, no lighting or highlights. Large readable alternating material zones.

## Review

The production scene comparison uses actual weapon catalog entries and the
production missile geometry/material path, at one metre scale and a fixed
camera against space. All four skins were inspected in that comparison.
Portal/rim views and the full per-weapon catalog remain unverified.
