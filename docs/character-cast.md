# Shared character cast workflow

The crew-deck experiment pairs comms and 3D presentation through stable identity
records. Open `experiments/crew-deck.html`, use Inspect to choose one of six adults,
and compare the linked comms portrait with the front, three-quarter and profile
views. Three have generated portrait-guided skins (Jo, Luis, Asha); the others
remain visibly labelled base templates. This is not a finished 100-person cast.

## One identity, two presentations

`assets/portraits/runway-workers/roster.json` owns IDs, names, ages, roles, voices
and personalities. `assets/characters/crew-cast/recipes.json` adds head template,
hairstyle, hair/brow color, suit palette, optional skin and art status. The cast
builder joins by ID and rejects unknown or duplicate identities. The generated
catalog is consumed by crew deck, including its matching portrait preview.
Production flight radio still consumes its existing portrait roster/PNG assets;
this experiment does not silently change those consumers or save schemas.

Each identity reuses a shared body, skeleton, animation set, head mesh and hair
piece. Only a skin texture and comms atlas need unique image data. Facial shape,
hair fitting and rig setup are shared art investments. Do not generate a new rig
or arbitrary topology for every character. Existing source assets remain editable.

For NEW identities, the preferred order is: identity brief -> assemble approved
head/hair recipe -> generate UV skin -> review the in-world identity -> capture
front and three-quarter reference renders -> generate the comms artwork using
those references. This gives both outputs a concrete common identity. Existing
portraits use the inverse migration path: portrait -> compatible UV skin ->
in-world review. Strong likeness is harder on that path with fixed base heads.

`generation-briefs.json` contains deterministic identity-specific prompts for both
presentations and a review checklist. It is a queue of briefs, not a hidden paid
API client. Image creation uses the normal built-in ImageGen workflow; generation
is authoring-time only. Skin v1 prompts and original generated PNGs are preserved
under the base-character pack's `runtime/` directory. No new comms portraits were
needed in this pass; existing approved seven-pose atlases are reused.

## Repeatable build

From the repository root:

```text
node tools/extract-crew-head.mjs female
node tools/extract-crew-head.mjs male
python tools/pack-crew-assets.py
node tools/build-character-cast.cjs
node tools/refresh-site-assets.cjs
```

The pack step requires development-only Pillow (available in the bundled workspace
Python); the deployed site needs only ordinary static HTTP and vendored Three.js.
No browser build step, API credentials or runtime network dependency is added.
For a new person, add the comms roster identity and appearance recipe, create the
referenced art with the generated briefs, rebuild, then inspect the paired views.
Do not mark a base template as a finished portrait likeness just because it loads.
A contact-sheet review of a small batch is preferable to hand-tuning every NPC,
but generation quality still needs review before scaling a cast to 100.

## Geometry, textures and ownership

Head extraction retains triangles above the neck cutoff with at least 50% summed
neck/head-descendant influence at every vertex. This prevents shoulder fragments
from entering male head bakes. Source metres, UVs and normals are retained. The
binary delivery format deduplicates vertices with identical position/normal/UV
values, uses an interleaved float32 buffer and uint16 indices, and preserves all
triangles/material groups. It stores the source Head pivot so hairstyles attach
without per-character offset guessing. Morphs and full facial animation are not
part of this pass.

Runtime maps are WebP quality 90, maximum 1024px, derived from intact originals.
Comms keep the original seven 256px frames in their original order. This is a
resolution/format tradeoff, inspected in scene; it is not lossless compression.
The original source hair/skin/eye textures are not all downloaded by the viewer.
Hair glTF loading strips normal maps and substitutes local packed base-color maps.

Two head templates and a small hair library are shared. Per-instance materials
and skeletons are independent. Face replacement releases owned materials, not
shared buffers. The skin cache allows eight resources, pins active/template maps,
and disposes unused maps on eviction. The comms preview retains at most four
decoded atlases and closes evicted bitmaps. A cast of 100 does not imply decoding
100 skin atlases or spawning 100 animated actors simultaneously.

## Measured delivery sizes

These byte counts come from the actual retained files, not compressed-size guesses:

| Resource | Authoring/source bytes | Runtime bytes |
| --- | ---: | ---: |
| Female head geometry | 1,268,371 JSON | 126,840 binary plus small header |
| Male head geometry | 1,102,362 JSON | 111,448 binary plus small header |
| Jo skin | 1,674,281 PNG | 52,722 WebP |
| Luis skin | 1,724,405 PNG | 60,522 WebP |
| Asha skin | 1,887,795 PNG | 68,696 WebP |
| Jo seven-pose comms | 821,134 PNG | 107,068 WebP |

The six current records reference 1,458,897 bytes of distinct cast resources,
including both head buffers, skins, portraits, hair glTF/buffers and packed maps.
The shared astronaut source GLB (about 1,899 KiB) is additional. The catalog and
scene code are small additional files. `budget.json` includes resource paths,
byte lengths, hashes and a 100-character arithmetic projection based on Jo.
At current sample sizes, 100 unique skin/comms pairs project to roughly 16–18.5 MB,
plus shared geometry/hair/body and any audio. This is not 100 generated assets,
an audio budget or a 100-actor performance benchmark.

## Verification and remaining work

`node tests/character-cast.cjs` checks stable comms/3D identity linkage, duplicate
rejection, a synthetic 100-record fixture, source-to-packed position/normal/UV
parity and eviction while traversing 100 synthetic texture resources with a pinned
active map. `node tests/crew-deck.cjs` covers rig cloning, animated head attachment,
head bounds and reversible skin comparisons. Browser checks include swapping
male/female identities, shared hairstyles, linked comms, and angled skin views.

The current three guided skins are first-pass approximations. Nose/jaw/eye shape
still follows two base meshes, and only shared hairstyles are available. Age and
ethnicity likeness, controlled head morphs, outfit consistency with portraits,
facial animation, speech synchronization and production-radio integration remain
separate improvements. Prove a small varied batch of strong identities before
committing generation effort to 100; the resource pipeline already accepts that
number, while visual quality is not established by a record-count test.

Generated skin prompt records (built-in ImageGen):
[Jo](../assets/characters/quaternius-universal-base-characters/runtime/jo-skin-v1-generation.json),
[Luis](../assets/characters/quaternius-universal-base-characters/runtime/luis-skin-v1-generation.json),
[Asha](../assets/characters/quaternius-universal-base-characters/runtime/asha-skin-v1-generation.json).
The corresponding PNG authoring outputs sit beside these records; the generated
catalog references their small WebP delivery variants.

## Helmet portrait experiment

Helmet portrait remains selectable. Authored 3D keeps the generated UV skins, source
head meshes and hair; Exposed portrait control keeps the unshielded panel. Render
keeps Neutral and Illustrated available. No original mesh file or generated face
texture was overwritten. 3D skin controls apply only to Authored 3D.

Helmet portrait reuses the astronaut's existing helmet geometry and materials.
The discarded procedural bubble shell is no longer part of the scene. During
one-time source preparation, triangles are clipped precisely against a rectangular
faceplate aperture in bind-space metres. Outside fragments retain interpolated
UVs, normals and skin attributes; the opaque plate is removed, while side hardware
and the surrounding source shell remain. The prepared geometry is shared by crew.
Original GLB bytes remain unchanged. The helmet is uniformly reduced to 82% around
the original Head pivot; the body calibration remains unchanged.

The face uses the original comms atlas directly, sampling crop (82,77,92,108) from
a 256px pose. Its rounded boundary is a 0.17m by 0.205m shape before applying the
same helmet/actor scale. It sits recessed at local z=0.025m, follows the animated
Head bone, and has no projecting background rectangle. The source helmet itself
occludes it in profile. It does not billboard or disappear at a scripted angle.
Body proportions provides a full-body check alongside the three head views.

Blink and timed speaking frames reuse the original atlas. These are visual pose
placeholders, not audio synchronization. Helmet atlas resources are reference
counted with an eight-entry cache. Replacement releases owned materials and texture
views while preserving shared geometry. Per-actor revisions reject stale async
head loads. Actor-dependent controls stay disabled until initial loading completes.

Tests verify clipping leaves the original geometry untouched, creates a clear
front opening, retains a side wall that blocks a ray aimed at the recessed face,
and scales the helmet uniformly. Tests also cover pose selection and stale loads.
Browser checks include front, profile and full-body proportions. The portrait's
perspective remains fixed; this is a visual trick to evaluate, not a 3D face.

Illustrated mode retains warm key/cool fill and rim, cooler shadow color, mild
lighting bands, backface ink and a shared shadow map. Neutral stays available.
These style treatments do not reconstruct anatomy or establish likeness. Helmet
mode preserves identity by retaining the actual face artwork. Native resolution
and MSAA remain the default.

## Directional head sprite experiment

Crew deck now defaults to Directional sprites · Jo. Jo uses a generated transparent
4 × 2 sheet of eight unhelmeted head views on a camera-facing vertical plane.
Other identities retain Helmet portrait in this mode; their sprite art is not yet
created. The Helmet portrait, Authored 3D and Exposed portrait modes remain available.

The plane follows the animated Head position, faces the camera horizontally and
selects its 45-degree sector relative to the animated head orientation. It keeps
a fixed neck pivot and body scale. The views run front, left-facing three-quarter,
left profile, left rear three-quarter, back, right rear three-quarter, right profile,
right-facing three-quarter. Rear and back buttons supplement the existing inspection
views; walking around Jo tests the discrete transitions.

This is a neutral-expression likeness and silhouette test. It has no blinking or
speech animation yet. Extreme elevations still expose the vertical billboard trick,
and eight views visibly snap rather than interpolate. Generated views need visual
approval before extending this to the cast. Source sheet and built-in ImageGen
prompt record live in `assets/characters/crew-cast/head-sprites/`. No runtime image
generation, network service, new body geometry or save schema is involved.

Focused regressions cover angle wraparound and sector boundaries, camera facing
under a rotated parent, UV cell selection and animated neck attachment. Browser
inspection covered front/profile attachment and existing body proportions.

### Sixteen-angle comparison

Angles now defaults to 16, interleaving the original eight views with a second
4 × 2 sheet requested at 22.5, 67.5, 112.5, 157.5, 202.5, 247.5, 292.5 and
337.5 degrees. These generated paintings approximate the requested bearings;
they are not calibrated renders. The 8 option keeps the original art available.
Both modes retain a two-degree hysteresis margin beyond the nearest-sector
boundary, avoiding back-and-forth changes from small idle or camera movements.
Changing angle count clears the retained sector. Both sheets share the same plane,
neck pivot and size, are loaded once through the bounded reference-counted cache,
and release their per-head texture views when replaced.

Animation cost need not multiply full portraits: 16 directions with neutral,
blink and two mouth poses would naively require 64 head frames per identity.
A future patch experiment can keep hair/head silhouettes static, add small
registered mouth/eyelid patches for visible face angles, and omit facial animation
at rear bearings. Profile occlusion and seams still require validation. No patch
animation, blink or talking frames were added to directional mode in this pass.

## Parked checkpoint · 23 October 2026

The 16-angle Jo head on the animated 3D body is retained in `experiments/crew-deck.html`.
The original eight views, eight halfway views, 8/16 selector and two-degree switching
hysteresis remain available alongside helmet and authored-3D heads. The user found
this direction promising. Resume here if the full-body sprite trial fails.

Next head-specific test: animate only small mouth/eyelid regions over the fixed
painted face. Do not replace the entire head for each expression. This patch test
has not been implemented. The separate full-body trial is `experiments/body-sprites.html`;
it does not replace the crew-deck rig or the existing comms system.

Crew deck now presents all head variants at once, plus the full-body sprite, for
free walking comparison. The 8- and 16-angle samples keep separate per-actor
angle counts. Optional identity/head/angle controls change only the left sample;
they no longer replace every comparison head at once. Click the scene to walk;
WASD and mouse-look own the camera until Escape or focus loss. The main full-body
entry points to this room; `body-sprites.html?inspect=1` retains the old orbit lab.

Unlocked mouse-look uses successive canvas client coordinates, not `movementX/Y`.
Entry, exit, canvas leave and pointer-lock transitions reset the cursor baseline.
Captured input retains relative deltas. Nonfinite or over-120px single-event jumps
are rejected rather than driving the camera into its pitch clamp. Tests cover
continuity around positive/negative 45 degrees and pointer/coordinate transitions.

The comparison room now animates all variants with a shared motion clock.
Motion defaults to Auto cycle; manual motion selection and Pause characters are
independent of player movement. Existing rig clips cover walking, interacting,
waving and kicking. The full-body sprite has a rough four-pose walk plus reach
and crouch key poses, authored one eight-direction pose sheet at a time. See
`docs/body-sprites.md` for file names, registration, costs and remaining art drift.
