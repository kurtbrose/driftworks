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
| Right stick vertical | Adjust throttle; neutral holds current throttle |
| Hold left grip + right stick | Sideways / vertical thrust |
| Right trigger | Fire |
| A / right lower face button | Boost |
| Y / left upper face button | Next weapon |
| Left trigger | Toggle target lock |
| Right grip | Next target |
| B / right upper face button | Pause / resume; restart after destruction |
| X / left lower face button | Recenter seated position and forward heading |
| Headset system menu | Leave immersive VR |

Head rotation and translation are presentation inputs. Ship state, weapon aim,
physics, distances and saves do not receive the headset pose. The HUD occupies
a ship-forward surface two metres from the seated eye, with the ordinary
45-degree vertical layout. Turning away leaves it behind. The pause card occupies
the same surface and lists the controls. Initial entry and recentering remove the
current seated translation and heading while retaining head pitch and roll.

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
simulation world units, including physical eye separation and leaning. Forward
screen-frustum culling is bypassed so turning around does not discard ships.

The existing sky renders once at 140 degrees around the current head orientation.
Its canvas is sampled by a direction-only background surface in the XR renderer,
without eye translation parallax for the distant sky. The existing GPU HUD renders
once per frame, then is sampled by the forward cockpit surface in both eyes.
These textures are transferred between the existing graphics contexts; this is a
prototype performance cost to measure on Quest hardware.

## Validation and current limits

Automated checks cover controller signs, handedness, missing sources, grip strafe,
button edges, pause suppression, ordinary-input isolation, headset frame pacing,
session rejection/end, recentering, tracking loss and physical stereo matrices.

A disposable browser XR emulator exercised the actual vendored Three XR render
loop with two views. The asteroid-range sortie was visually inspected paused and
running, facing forward and looking 90 degrees sideways. Both eye images included
the world and forward HUD/pause card; looking sideways removed the HUD and changed
the world view. No browser errors were reported during those checks. Captures are
in ignored `output/vr/`; the emulator is in ignored `.scratch/vr/`.

This has **not been tested in a physical Quest 3**. Headset comfort, controller
behavior, text readability, sustained frame timing and performance in larger
missions remain unverified. Controller haptics and a full in-headset settings
menu are not implemented; configure ordinary settings before entering VR.

Desktop screen-space shield refraction, work-light shadow passes and the special
Ellis multi-chart compositor are bypassed in XR. World geometry and additive
effects still render, but portal optics are not validated or complete in stereo.
Start the hardware trial in the ordinary asteroid-range sortie. Hyperbolic,
wormhole, cinematic/observer and large battle scenes are not visually accepted in
VR merely because they share the entry button. The sky texture also needs checks
at unusual browser-window aspect ratios and with animated mission-specific sky
effects. This prototype makes no headset-wide or whole-mission performance claim.
