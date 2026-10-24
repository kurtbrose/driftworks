# Rime visible disk v2

The near scene uses `rime-disk-v2.png`: a finished, transparent, visible
hemisphere sprite. The original generated disk is preserved byte for byte.
Its prompt, dimensions and hash are in `disk-v2.json`. It is sampled directly
on the moon's fixed tangent plane: there is no latitude/longitude mapping,
no hidden-hemisphere texel budget, and no runtime surface wrapping. The
artwork already contains visible-hemisphere foreshortening.

The disk radius is .484 of the square source width. Tangent projection uses
the physically derived angular radius. The shared sun still sets the global
phase using analytic normals; this does not warp the texture. The sprite
contains some local crater shading. Alpha removes the source margins; the
physical silhouette retains its antialiasing and background-star occlusion.

Only the close scene loads this one image (14 startup requests total).
Texture unit 7, LINEAR filtering, CLAMP_TO_EDGE, no per-frame uploads or new
geometry. The distant scene keeps its existing small procedural moons.

`rime-albedo-v1.png` and `prompts.json` retain the rejected full-sphere map
for provenance/comparison. It is no longer requested by the game.
