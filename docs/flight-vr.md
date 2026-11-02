# Browser VR flight prototype

The shared flight composition supports WebXR `immersive-vr`. Quest 3's standalone
browser is the initial hardware target. Open a flight sortie over HTTPS, wait for
assets to load, and choose **Enter VR**. The session starts paused; press **B** to
fly. Ordinary browser fullscreen remains a flat screen and does not start VR.
VR entry stays fixed at the top right, outside the scrolling start/pause panel,
including during ordinary flight. Unsupported browsers show **VR unavailable**
with a reason instead of silently hiding the entry point.
All sorties using `flight.js`, `flightPresentation` and `flightControls` inherit
the integration. No mission-specific controller wiring or runtime downloads are
required. The tactical RTS and independent artwork viewers do not enter VR.

For a headset connecting to a development PC, `http://<PC address>:8000` is not
a secure WebXR origin. Use an HTTPS deployment or a development connection that
exposes the server as localhost on the headset. Desktop localhost alone does
not make a LAN address secure.

For USB testing, enable Quest Developer Mode, install Android Platform Tools on
the PC, connect a USB data cable, and accept the headset's USB debugging prompt.
With the repository server running on port 8000, run on the PC:

```powershell
adb devices
adb reverse tcp:8000 tcp:8000
```

Then open `http://localhost:8000/experiments/flight.html` in the Quest browser.
ADB forwards the headset's localhost port to the PC; the browser's trusted
localhost exception allows WebXR without a certificate. Reapply forwarding after
disconnecting/restarting as needed. See [Meta's browser debugging guide](https://developers.meta.com/vr/documentation/web/browser-remote-debugging/?device=QUEST).

## Controls

The two controllers form one flight input using their `handedness` and
`xr-standard` gamepad mapping. Controller pose never steers or aims the ship.
Unrecognized mappings are ignored instead of guessing button indices.

| Controller input | Action |
| --- | --- |
| Left stick | Pitch / yaw |
| Right stick horizontal | Roll |
| Right stick vertical | Adjust throttle; hold fully forward at maximum throttle for afterburner |
| Hold left grip + right stick | Sideways / vertical thrust |
| Right trigger | Fire |
| A / right lower face button | Boost |
| Y / left upper face button | Next weapon |
| Left trigger | Toggle target lock |
| Right grip | Next target |
| B / right upper face button | Pause / resume; restart after destruction |
| X / left lower face button | Recenter seated position and forward heading |
| Headset system menu | Leave immersive VR |

Quest axes currently use a linear response with zero deadzone, including steering,
roll, throttle and grip strafing. Tiny hardware offsets are passed through for this
headset trial. Desktop gamepads retain their configurable 12% default deadzone.
Holding forward above 95% demand at maximum throttle engages afterburner on both
XR and desktop controllers; release ends it. Grip strafing does not engage it.

The lighting probe and exposure use the ship's world orientation, while the native
sky uses each tracked eye. Head rotation must not rotate illumination. XR uses the
desktop-equivalent 2 m near plane to preserve depth separation on distant hulls;
geometry within 2 m is clipped. Source sky images receive mip filtering in WebGL2,
and tiny point stars use wider energy-normalized footprints to reduce shimmer.
These target reported flicker; headset confirmation remains necessary.

Damage flashes cover the full view of each eye, independent of the forward HUD
bounds and head direction.

Head rotation is a presentation input. Physical walking and leaning are cancelled
from the flight viewpoint; the two eyes retain their physical separation. Ship
state, weapon aim, physics, distances and saves do not receive the headset pose.
The HUD is a ship-forward angular overlay at infinity, with a 45-degree vertical
layout, rendered above world geometry. Its primitives share one continuous
stereographic (locally angle-preserving) spherical projection. Text is not
given individual billboard orientations or copied from a screenshot. It has no finite glass-plane
depth, convergence or positional parallax. Turning away leaves it behind. Pause
controls use the same projection without a large opaque screen. Initial entry and
recentering reset the seated heading while retaining head pitch and roll.

## Shared implementation

`experiments/flight-vr.js` owns a bridge per flight host, session entry, lifecycle,
the metre-to-world camera rig, XR controller decoding and the sky/HUD surfaces.
`scene3d.create(..., {flight:true})` opts the main flight renderer into that bridge;
embedded target cameras and other study renderers stay ordinary cameras.

The main loop uses Three's `setAnimationLoop`, which hands scheduling to the XR
runtime during immersion. Desktop FPS limits, including the paused 15 FPS limit,
do not throttle headset frames. Tracking loss, input source changes, session
visibility loss and session exit pause gameplay; resuming is explicit.

The native renderer submits the world for each eye. Raw engine materials receive
the actual eye view/projection matrices through `onBeforeRender`; native PBR
materials use Three's XR camera. The camera rig converts headset metres into
simulation world units and cancels the tracked head centre each frame, retaining
rotation and physical eye separation. Static actor batches are culled against
both current eye frusta, using each eye's actual projection and inverse world
matrix after the rig is prepared. A batch is kept if either eye can see its
transformed bounds; the desktop forward camera is never used to reject XR
actors. Missing tracking or invalid eye data conservatively retains batches.
This preserves head turns, asymmetric projections, near-plane intersections and
physical eye separation. Simulation and cached mesh ownership are unaffected.
It does not change asteroid backface/material handling or the dynamic-effect path.

The ordinary sky renderer remains the owner of appearance, lighting and animation
clocks. XR draws the same authored sky directly into the headset framebuffer for
each eye, using the world renderer's WebGL 2 context. The sky shader adapter
converts to GLSL 3, applies each eye's asymmetric projection centre and explicit
viewport, and restores Three's framebuffer/state before world geometry. Native
sky draws borrow one frame snapshot and never advance animation separately for
the two eyes. Sky images are not copied from a live canvas into an XR plane.

The GPU HUD supplies its retained primitive geometry, immutable distance-field
font atlas and small image slots directly to the XR renderer. Its original CSS
pixel coordinates share a continuous conformal spherical field; glyph coverage
uses derivatives at the actual per-eye output resolution. There are no per-glyph
billboard orientations. The XR layout uses 600 logical pixels vertically and a
14px minimum font, independent of the browser's desktop-window resolution. The
HUD is submitted last with depth testing/writes disabled. `GpuUi.nativeFrame()` on a UI instance
returns borrowed geometry and samplers for that frame; the UI retains ownership.
Native-only pause batches need no separate WebGL canvas render. Fixed foveation
is set to zero during this quality trial; its performance cost needs hardware
measurement.

## Validation and current limits

Automated checks cover controller signs, handedness, missing sources, grip strafe,
button edges, pause suppression, ordinary-input isolation, headset frame pacing,
session rejection/end, recentering, tracking loss, three-axis translation
cancellation, angular HUD projection and physical stereo matrices. Culling
regressions compare 8,000 points against actual per-eye clip-space projection
with head/ship rotation and asymmetric eyes, plus 1,500 transformed box cases
against an independent corner oracle for XR planes.

The [local culling comparison](benchmarks/vr-culling-2026-11-01.md) records the
matched CPU/draw reductions and native WebXR emulator visual checks. Desktop
proxy timings are not Quest frame-time measurements.

A disposable browser XR emulator exercised the actual vendored Three XR render
loop with two views. The asteroid-range sortie was visually inspected paused and
running, facing forward and looking 90 degrees sideways. Both eye images included
the world and forward HUD/pause card; looking sideways removed the HUD and changed
the world view. No browser errors were reported during those checks. Captures are
in ignored `output/vr/`; the emulator is in ignored `.scratch/vr/`.

The first user Quest 3 trial found sky flicker, unwanted finite-glass HUD
perspective and physical walking/leaning. Buffer retention alone did not resolve
the flicker. A whole-image spherical HUD lost text clarity; individual glyph
billboards improved readability but introduced inconsistent text perspective.
The current native HUD uses continuous conformal projection (pause label **P4**),
with direct per-eye SDF text, and the sky uses the shared graphics context.
These render in the emulator without browser errors, but **current Quest visual
acceptance is pending**. Prior reports of legibility do not approve the latest
projection or establish that flicker is fixed. Headset comfort, sustained frame
timing and performance in larger missions remain unverified. Controller haptics
and a full in-headset settings menu are not implemented; configure ordinary
settings before entering VR.

Desktop screen-space shield refraction, work-light shadow passes and the special
Ellis multi-chart compositor are bypassed in XR. World geometry and additive
effects still render, but portal optics are not validated or complete in stereo.
Start the hardware trial in the ordinary asteroid-range sortie. Hyperbolic,
wormhole, cinematic/observer and large battle scenes are not visually accepted in
VR merely because they share the entry button. The sky texture also needs checks
at unusual browser-window aspect ratios and with animated mission-specific sky
effects. This prototype makes no headset-wide or whole-mission performance claim.
