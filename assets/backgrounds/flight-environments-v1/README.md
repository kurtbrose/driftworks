# Complete flight environments v1

These are static deployment assets, generated offline. Each folder contains six
1024 x 1024 PNG faces (px nx py ny pz nz) plus its camera/hash manifest and axis
diagnostics. The complete background, including distant stars, is already baked.
catalog.json identifies environments and their camera-glare metadata. Recipes
retain the mission composition, original asset hashes, seed and fixed timestamp.
Original artwork remains in the existing background authoring library.

Regenerate from the repository root with its HTTP server running:

    node tools/bake-flight-environments.cjs
    node tools/bake-flight-environments.cjs fleet --force

The driver uses local Chrome and the existing bake-sky-cube.py --captures path.
Set DRIFTWORKS_BROWSER_MODULES and DRIFTWORKS_BAKE_PYTHON for local development
runtimes. There are no runtime package or network dependencies. See
docs/skybox-authoring.md for camera orientation, source policy and acceptance.

The 58 environments include 13 selectable skies, both canonical bridge worlds,
Jade/Rime/fleet tableaux, planet studies, Ohio, two fleet destinations and nine
complete impact frames, plus 24 complete lightning plates for Jade/Rime/fleet.
Normal views blend those full plates on a fixed 12-second loop; wormhole-bent
images use the constant default sky. New animated backgrounds must likewise be
baked as complete frames before deployment.
