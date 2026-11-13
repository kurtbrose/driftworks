# Missile skin v1

Original albedo generated with the built-in ImageGen tool on 2026-11-12.
No FreeSpace artwork or reference image was supplied.

`missile-skin-v1.png` is the deployment asset: 512 × 256 RGBA/PNG, reduced
offline from the generated sheet with bicubic filtering. It uses one shared
texture, the renderer's existing mipmaps and one body batch; there is no normal,
roughness or metallic map. The horizontal coordinate runs from tail to nose;
the vertical coordinate wraps around the circumference. Three finless body profiles share the same image. Smooth vertex normals
supply the round appearance.

The full generated sheet and visual review captures remain in ignored
`output/missile-skin/`. Texture and source are original generated artwork;
no imported game model, texture, decal or logo is used.

## Generation prompt

> Create one original game-ready spacecraft missile ALBEDO TEXTURE, a flat rectangular unwrapped cylindrical surface filling the entire image edge to edge. This is a UV texture sheet, NOT a picture of a missile, no rendered object, no perspective, no lighting, no shadows, no background, no border. Horizontal image axis is the missile's length: LEFT is tail/nozzle, RIGHT is nose. Vertical image axis wraps around circumference; top and bottom edges must match seamlessly. Predominantly warm pale gray / ivory ceramic-coated metal, restrained charcoal panel seams and small inset access covers. A dark graphite tail band in leftmost 12%, one muted burnt-orange identification band at 22% from left, a narrow graphite collar at 78%, rightmost 15% pale gray nose coating. A few small dark maintenance stencil marks and abstract industrial ID glyphs, no recognizable brand, no large text, no logos. Fine subtle wear around panel edges, small fasteners, restrained machining detail, but avoid dense greebles and heavy grime. Broad clean readable color masses suitable for a very small 3D projectile; details must survive reduction to a 512 by 256 texture. Continuous flat surface; do not draw fins or a silhouette. Physically neutral albedo without specular highlights. Landscape 2:1 composition.

## Review

Inspect the actual textured body in the fixed-pose production captures, rather
than treating this flat sheet as visual acceptance. The first pass targets
small, readable gray/orange forms; the panel marks are extra close-up detail.
Runtime captures cover a close side view and turning flight. Full portal/rim
views and all missile classes have not been visually accepted.
