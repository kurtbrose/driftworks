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

The default Head option is now Helmet portrait. Authored 3D retains the generated
UV skins, source head meshes and hair. Exposed portrait control retains the simple
unshielded panel for comparison. Skin remains an authored-3D control; Render keeps
the Neutral and Illustrated lighting/shading experiments available in every mode.
No previous source mesh, generated texture or recipe was replaced by the helmet.

Helmet portrait uses the existing comms atlas directly. A fixed plane samples the
inner face crop (82,77,92,108) in a 256px pose, sharing the seven-pose source image.
A rounded armor shell, dark opaque recess and closed back surround it. The panel
is physically behind the front rim; depth testing and real tunnel side walls hide
it at grazing angles. It follows the animated Head bone without billboarding,
camera-facing rotation or angle-triggered disappearance. The original sealed
astronaut helmet is hidden because its opaque face geometry obstructs the panel.
The procedural replacement shell is shared across the cast; helmet colors live
in the appearance recipes. No extra character-specific portrait art is needed.

Blink and timed talking-frame selection reuse the original atlas. These are visual
pose placeholders, not audio synchronization. Helmet atlas resources are reference
counted with an eight-entry cache; per-instance texture transforms select poses.
Replacing an identity or head mode releases only owned materials and texture views.
Per-actor revision checks discard obsolete asynchronous head loads. Controls that
need actors are disabled until initial loading completes.

The shell is a prototype silhouette, not a finished helmet design. Moderate angles
can still reveal that facial perspective is fixed; the purpose is to find how much
physical occlusion is enough. Front, three-quarter and profile inspection views
and ordinary walking remain the quickest comparison. Automated ray tests require
a clear frontal view and an obstructing side wall along an oblique ray aimed at the
face. Tests also cover original blink/talk pose selection and stale mode loads.

Illustrated mode currently adds a warm key, cool fill/rim, cooler shadow color,
mild lighting-band shaping, subpixel-width backface ink and a shared shadow map.
Neutral remains a presentation control. The image treatment does not reconstruct
portrait anatomy or establish likeness; the helmet branch bypasses that problem
by retaining the approved face artwork itself. Native resolution/MSAA remains the
default. No further facial-rendering work is implied by this experiment.
