# Full-body sprite kill test

Open `experiments/body-sprites.html` for the free-walking comparison room. The
original controlled inspector is retained at `experiments/body-sprites.html?inspect=1`. The head-sprite / 3D-body experiment is
parked intact in `experiments/crew-deck.html`; its checkpoint and restart notes
are in `docs/character-cast.md`. No production NPC, comms or save data changes.

## Question and gates

Can one AI-authored painted character survive ordinary hangar cameras and motion?
Use Jo, one outfit, one body type and eight bearings. Test the failure cases
before expanding the cast. This is not a finished animation pipeline.

1. **Static gate:** same identity, hair, outfit and adult proportions across all
   bearings; stable foot pivot; tolerable 360-degree switching and camera pitch.
2. **Walk gate:** four distinct synchronized gait poses, opposite contacts and
   passing poses; readable limbs at every bearing; no changing limb length,
   facing flips, clipped boots or foot skating. If generation fails, allow one
   scoped repair attempt before spending on gestures.
3. **Stress poses, only after walk:** cross-body reach, then crouch. Reach must
   separate the hand/forearm from the torso in most bearings. Crouch must retain
   plausible compressed anatomy, fixed scale and the same floor baseline.

If standing/walking works but the stress poses fail, consider ordinary hangar
NPCs separately from action actors. Do not declare the approach generally viable
based on a good front-facing still.

## Actual result · 23 October 2026

The standing sheet is a useful static candidate. It is a transparent 4-column,
2-row sheet: front, left-facing front three-quarter, left profile, left rear
three-quarter, back, right rear three-quarter, right profile, right-facing front
three-quarter. The entire person is painted; no body mesh or separately animated
head is behind it. Standing is static, not a breathing idle animation.

**The walk authoring gate failed.** The first 32-cell request returned only three
rows with some repeated gait poses. One repair request returned four rows but
cropped the final row's lower legs and changed the left-profile bearing to face
right in row three. Neither sheet can be treated as a registered four-phase
eight-direction cycle. Both original outputs and exact prompts remain under
`assets/characters/crew-cast/body-sprites/`. The lab's sheet review shows them
without rearranging, cropping, retiming or hiding the failure.

Three built-in ImageGen calls were used: standing, walk and one walk repair.
No reach/crouch batch was generated after this failure. No usable in-scene walk,
gesture, crouch or animation-transition result is claimed. A single generation
method failing is evidence against that method, not proof that full-body sprites
are impossible. The unresolved question is whether repairing individual bearings
or using stronger pose guides is affordable. A prompt-only whole-sheet retry
did not fix this candidate with modest effort.

## In-scene procedure

- Sweep Orbit through the full circle, then enable Auto orbit. Check all eight
  silhouettes and the hysteresis at each 45-degree boundary. Drag also orbits.
- Repeat at close (2.2 m), medium (4 m) and far (9 m), then 20 degrees above and
  12 degrees below. Check whether the fixed perspective remains tolerable.
- Repeat against bright walls, dark walls and the busy hangar. Enable the crate
  to expose flat-plane depth/self-overlap limitations. Keep the foot ring and
  1.8 m reference visible when judging grounding and proportions.
- Review the two failed sheets. Count rows, compare profile facing across rows,
  inspect the cropped final row and check that anatomical stepping is consistent.
- Record Pass/Fail in the local review form. Unreviewed defaults are deliberate;
  loading an image does not pass a visual criterion. The review is versioned local
  browser storage only and does not auto-approve untested animations.

Stop/rethink on a walk failure, unstable identity, unacceptable pitched camera
view, or repair effort that keeps requiring a whole new sheet. Static display can
remain useful without promoting it to a production animation solution.

## Rendering and measurements

The vertical plane is 0.96 × 1.92 metres, with bottom at -0.0768 m. The candidate
artwork's boot baseline near 96% and crown near 2% place the visible figure near
1.8 m. This one fixed calibration applies to every cell. Per-view bounds are not
normalized, because that would conceal authoring drift. The panel rotates only
around world Y; it does not tilt toward an elevated camera. A separate floor
blob and ring show the world anchor. Alpha-tested pixels retain real scene depth;
the figure itself still has only one depth plane and baked ambient lighting.

ImageBitmap decoding flips Y explicitly before Three uploads it. Eight directional
cells are addressed with UV offsets, with two-degree hysteresis around sector
boundaries. The standing texture is fetched once; failed sheets are viewed as
ordinary images in a modal, not uploaded as animation atlases. Runtime uses local
assets and vendored Three.js only, without generation APIs or a build step.

The standing candidate observed in the actual scene used about 1.48 MiB encoded
and 6.0 MiB decoded base pixels (mipmaps and driver overhead additional). The lab
reports frame median/p95, CPU submission time, scene draws and triangle count.
These are local observations, not universal budgets or a multi-character test.
The sprite costs one two-triangle draw plus its separate floor guide/shadow.

`node tests/body-sprites.cjs` checks angle sectors, boundary stability, atlas cell
addressing and generation records; it is included in `tests/run.cjs`. Visual
identity, gait quality, camera tolerance and repair effort require human review.

## Free-walking comparison

The default entry now opens crew deck with all six variants standing in the room:
full-body sprite at the starting camera's center; 16- and 8-angle heads on either
side; helmet, authored 3D and exposed portrait behind. Each has a floating label.
Click the scene or Walk aboard, use WASD and move the mouse to look. Shift hurries;
Escape pauses. On pointer-lock denial, focused walking keeps mouse-look active
without dragging. Blur and lock loss clear held keys; walking focuses the canvas
so a previously focused selector does not swallow WASD. Only explicit inspection
buttons reposition the camera. There is no per-frame orbit or target tracking.
Optional tools are collapsed; Sheet review opens the old controlled inspector.

## Follow-up: animated comparison trial

The user requested animations for both presentations after the first atlas gate.
Crew deck now defaults to an automatic 23-second loop: walk (8 s), reach/interact
(4 s), wave/point (4 s), crouch/kick (4 s), stand (3 s). Motion selects a single
mode; Pause characters freezes the shared animation clock and skeleton mixers
without pausing the player's camera. E's brief wave is ignored while actors are
paused. All poses and playback are provisional visual trials, not a gate pass.

The 3D bodies use their existing Walk, Interact, Wave, Kick_Left/Kick_Right and
Idle clips. They walk a closed 0.7 m radius circuit, returning to the original
mark before actions. The painted character follows the same path using a four-
pose walk loop at 6 fps. It has standing/reach key poses and standing/half/deep
crouch key poses. Wave/point is a wave on the rigs and a point on the painted
character; crouch/kick is a crouch on the painted character and a kick on the
rigs. This does not claim matching facial, skeletal or gait phases between styles.

Rather than another 32-cell atlas, each new source sheet contains eight bearings
of one pose, in the original 4 by 2 layout. Seven usable new pose sheets plus the
standing sheet are loaded once. One repeated-contact candidate was rejected and
retained as `jo-walk-contact-right-v1.png`; v2 supplies the opposite contact used
in playback. Eight generation calls were made for this follow-up. Exact prompts
and source PNGs sit beside the earlier trial under `body-sprites/`.

Runtime registration isolates each connected figure (alpha above 8), including
limbs crossing a source cell edge, from neighboring figures. It uses the nearest
opaque torso-region seed in each direction and scans within that source row's
band. All sheets use a half-height band split except deep crouch (0.56), whose
first row extends lower. It preserves source pixel scale and horizontal pivot,
aligns the lowest connected boot pixel to a common 96% baseline, and pads each
cell horizontally for reaching arms. It does not warp or resize anatomy, repair
costume changes, or infer missing frames. Faint disconnected flecks are omitted.
Original PNGs remain unchanged. Sources are decoded and packed sequentially to
bound temporary flood-fill buffers; prepared textures are cached for the one
visible identity and reused during playback.

The prepared panel is 1.44 by 1.92 m; extra transparent width preserves the same
artwork scale as the previous 0.96 m panel. There are eight 1884 by 1256 prepared
canvases (about 72.2 MiB total base pixels), plus GPU textures/mipmaps and other
scene resources. This is a deliberately small, one-identity authoring trial, not
an optimized 100-character animation budget. No per-frame bitmap creation or
texture upload is required after the first use of a pose.

Known visual weaknesses remain: occasional view-dependent limb phase, head/body
orientation, costume/face drift, and coarse keyframe transitions. The older dense
atlas failures remain inspectable at `body-sprites.html?inspect=1`. The historical
review's disabled motion verdicts apply to that old attempt, not a claim that the
new trial is approved. Judge the new animations by walking around them.

Focused tests cover automatic phase boundaries, manual mode timing, path closure,
four-pose cycling, crouch/reach timing, all source paths, odd-sized source packing,
unequal row bands, common foot baseline and cross-cell limb isolation. Existing
camera/input tests stay active.

Browser validation of the follow-up included the walking circuit, front deep
crouch, profile reach with the full hand visible, and freely moving the camera
while all characters were paused. A local run observed roughly 14.9 ms median /
15.1 ms p95 frame time and 1.4 ms CPU submission with the animated lineup. These
are illustrative observations while the development checks were running.

### Active source art and prompt records

All are built-in ImageGen outputs; source bytes are preserved.

| Pose | Source | Exact prompt |
| --- | --- | --- |
| Standing | [PNG](../assets/characters/crew-cast/body-sprites/jo-standing-v1.png) | [Record](../assets/characters/crew-cast/body-sprites/jo-standing-v1-generation.json) |
| Contact A | [PNG](../assets/characters/crew-cast/body-sprites/jo-walk-contact-left-v1.png) | [Record](../assets/characters/crew-cast/body-sprites/jo-walk-contact-left-v1-generation.json) |
| Passing A | [PNG](../assets/characters/crew-cast/body-sprites/jo-walk-pass-right-v1.png) | [Record](../assets/characters/crew-cast/body-sprites/jo-walk-pass-right-v1-generation.json) |
| Contact B | [PNG](../assets/characters/crew-cast/body-sprites/jo-walk-contact-right-v2.png) | [Record](../assets/characters/crew-cast/body-sprites/jo-walk-contact-right-v2-generation.json) |
| Passing B | [PNG](../assets/characters/crew-cast/body-sprites/jo-walk-pass-left-v1.png) | [Record](../assets/characters/crew-cast/body-sprites/jo-walk-pass-left-v1-generation.json) |
| Reach | [PNG](../assets/characters/crew-cast/body-sprites/jo-reach-v1.png) | [Record](../assets/characters/crew-cast/body-sprites/jo-reach-v1-generation.json) |
| Half crouch | [PNG](../assets/characters/crew-cast/body-sprites/jo-crouch-half-v1.png) | [Record](../assets/characters/crew-cast/body-sprites/jo-crouch-half-v1-generation.json) |
| Deep crouch | [PNG](../assets/characters/crew-cast/body-sprites/jo-crouch-deep-v1.png) | [Record](../assets/characters/crew-cast/body-sprites/jo-crouch-deep-v1-generation.json) |
