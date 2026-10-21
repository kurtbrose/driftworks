---
name: make-skybox
description: Compose and bake space skyboxes from reusable inward-facing sprite cards using six cameras at a shared origin. Use for making skyboxes, skybox factory work, reusable sky assets, and cubemap baking or revisions.
---

# Make a skybox

“Making a skybox” means composing reusable assets on sprite cards facing inward
toward a shared origin, then capturing six square 90-degree perspective views
from that origin along +X, -X, +Y, -Y, +Z and -Z. The asset library is an essential
part of this workflow; a gallery alone is not the composition-and-baking tool.

## Scope and existing tools

Inspect the project's sky authoring documentation, asset library, recipe format,
renderer and available baker first. Reuse working tools and conventions. Do not
claim a six-camera exporter exists unless inspected or executed. If it is missing,
implement the reusable capture path within the authorized skybox task; identify
any missing renderer or runtime that prevents baking.

In Driftworks, read [references/driftworks.md](references/driftworks.md) for the
existing implementation and its limits. Elsewhere use the host project's paths.

## Asset library

Search existing assets before generating more. Keep reusable source sprites
separate from compositions and baked outputs. Preserve originals; use descriptive
versioned filenames for new treatments. Record exact generation prompts, origin
or attribution, dimensions, aspect ratio and blend intent beside the assets.

Use imagegen for generated astronomical artwork when available, following its
skill. Simple optical treatments can be authored directly in shaders or canvas.
Black-backed emission features need genuinely dark margins and a smooth falloff
before every edge; use screen or additive blending as appropriate. Preserve native
alpha when present. Black-backed planets or dark dust require explicit occlusion
masks or an opaque pass; screen blending alone cannot hide background stars.

For ordinary visible-light suns, favor a nearly white disk or unresolved core,
restrained pale bloom and little visible surface contrast. Detailed bright loops
and strongly colored plasma belong to an instrument-view or stylized treatment
when requested. Camera streaks, diffraction and lens ghosts are optical effects,
not physical stellar structure. Keep the restrained original as a comparison when
exploring treatments; do not impose that art direction on every requested sky.

## Editable composition

Save an explicit, portable recipe with relative asset paths, coordinate/up-axis
convention, asset aspect ratios, placement yaw/pitch/roll or direction vectors,
angular size, gain, layer order, blend mode and exposure/color policy. Save resolved
placements and any seed so rebaking does not reshuffle the sky. Reuse the native
schema rather than inventing an incompatible second one.

Place each card at a positive distance along its viewing direction and orient its
textured front toward the origin. For distance d and full angular width theta,
card width is 2*d*tan(theta/2); height is width divided by image aspect ratio.
Angular width includes the source margins and halo. Preserve texture orientation
and authored roll. Use an unlit/emissive pass; scene lights must not darken the art.
Prefer distinct landmarks and deliberate quiet space over obvious repetitions.
Mix asset types when the requested composition calls for it and the tools support
it; distinguish a current tool limitation from a universal art rule.

## Six-camera bake

Use six cameras with exactly the same origin, square aspect, 90-degree vertical
FOV, resolution, near/far planes, exposure and render settings. Only their
orientation changes. Use the target engine's face order and up vectors; document
them in the output recipe. A face name does not establish orientation. Verify with
an axis-marked diagnostic before trusting new capture code, including top/bottom
rotation and image row direction. Do not mirror faces to conceal a convention bug.

Freeze animation, exposure adaptation and randomness to one shared timestamp for
all six captures. Keep camera-dependent flare out of the environment bake unless
the user deliberately wants it baked; otherwise face-local glare can produce
inconsistent seams. Wait for every texture to decode and upload. Render with the
same blend, alpha, color transfer and occlusion rules as the composition preview.
Write six equally sized faces with explicit axis filenames and a face manifest.
An atlas or equirectangular export is additional output when useful, not a
substitute silently labeled as a six-camera bake. Never ask imagegen to independently
paint six final faces and assume their projection and seams match.

## Review and delivery

Inspect the bake from inside a cube with a rotating view at the origin. Check all
12 edges, corners, poles, handedness, duplicate landmarks, clipped bloom and
rectangular card borders. Use a foreground model when judging composition and
lighting readability. Sky translation must not produce parallax. Start with a
small preview bake and increase resolution after projection and composition pass;
choose face resolution based on intended viewing detail and source pixel density.

Retain the source recipe, referenced original assets, face manifest, six images
and a review preview under a unique output/version directory. Report exact paths,
resolution, conventions and validation limits. Do not overwrite other skies or
silently replace mission selections. For repeated variants, reuse the library and
baker, vary explicit recipes, and preserve reproducibility rather than generating
new machinery for every sky. A request expecting many future skies is not itself
an instruction to generate a hundred assets now.

## Live motion

A static cubemap captures one instant. Put temporal bloom, surface evolution,
foreground point stars and view-dependent glare in optional live layers when
requested, with shared orientation and consistent occlusion. Keep disk silhouettes
stable; use low-amplitude local brightness variation rather than whole-star
rotation, boiling or rapid global pulsing. Treat accelerated convection and star
shimmer as artistic choices. Provide a static comparison, pause and reduced-motion
behavior for an animation bench. Do not promise animation inside six static PNGs.
