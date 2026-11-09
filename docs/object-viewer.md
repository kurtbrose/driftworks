# Flight object viewer

Open `studies/object-viewer.html` from **Object viewer** in the homepage quick
launch. This is the main inspection entry point. Earlier kit builders and
specialist comparisons remain under **Development studies**.

Choose fighters/bombers, the production Aegis capital hull, the three production
freighters, or an Ellis wormhole. Choose the surrounding sky independently.
Freighters have a cargo/operator seed and Shuffle button; changing the seed
preserves the camera. The wormhole is a 600 m throat at the scene origin, with
independent local/destination skies and a side selector. It uses the shared
Ellis background optics, not a sphere with a special mouth texture.

Drag to orbit, wheel to zoom, right-drag to pan, and double-click a visible
surface to focus. Fit object restores framing. Camera presets and the optional
turntable work across families. Inspection fill is the default; Sky lighting
uses the engine's existing environment-lighting support. Copy view link saves
the selected object, skies, cargo seed, lighting, effects and camera.

`studies/object-viewer.js` adapts the current `shipPackModels.sourceGeometry`,
`aegisFlight` rig and `convoyScenery` baked buffers into one `scene3d` instance.
The freighter atlas is prepared once and the seed is passed to the existing
cargo shader. Large buffers stay static across frames. `flightSkybox` renders
complete baked environments and applies Ellis optics to the selected throat.
There is no embedded viewer or alternate ship/sky renderer. The `objectViewer`
script-manifest profile owns dependencies and the page controller.

The capital selection represents the current runtime Aegis hull. Earlier
cruiser/carrier kit configurations remain authoring studies, not additional
runtime ships. This viewer does not add a mission or change flight behavior.
Wormhole inspection covers orbit, rim and near-throat views from either side;
it does not establish acceptance for gameplay crossings or foreground lensing.

Focused browser regression: serve the repository, then run
`node tests/object-viewer-browser.cjs --visible`. Supply Playwright through the
existing `DRIFTWORKS_BROWSER_MODULES` development-only setting if it is outside
the repository. `--measure` records matched asset-on/off CPU submission and
browser cadence in the actual viewer. Captures and measurements go under
`output/object-viewer/`; GPU execution is not measured.
