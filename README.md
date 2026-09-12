# Driftworks

Driftworks is a browser-based 2D hard-SF economic/RTS prototype. This repository state is deliberately small: a static tactical sandbox where a persistent handful of industrial spacecraft can begin doing useful work.

## What Works Now

- Full-window PixiJS tactical scene using vendored runtime code.
- Geometric placeholder mothership, miners, tug, and two escort craft.
- Single-click selection and drag-box multi-selection.
- Right-click move orders with fixed-step simulation and interpolated rendering.
- Right-click asteroid nodes with selected miners to extract ore.
- Miners automatically return full cargo to the mothership and deposit it into storage.
- Mothership processes delivered ore into 80t depot sections.
- Tug can carry fabricated depot sections from the mothership to the depot site.
- HUD ore quota, depot progress, construction section stock, and remaining field ore readouts.
- Subtle parallax starfield below the grid.
- Acceleration-driven engine plumes, mining motes, and delivery feedback text.
- Move-order reticles, selection pulses, mothership running lights, and focus-selection camera key with visible focus feedback.
- Debug hostile-raider vignette with industrial target selection, escort range coverage, laser dwell, impacts, destruction fragments, very light final-hit shake, and final-kill slow motion.
- Simple threat director that warns, then sends raiders once mining/construction activity exposes the operation.
- Camera pan with middle mouse or Space + drag, plus mouse-wheel zoom.
- Versioned localStorage save/load of serializable game state.
- Toggleable stress mode that animates thousands of simple sprites.
- DOM HUD with selected ships, simulation time, entity count, and measured FPS.
- Browser-native simulation tests at `./tests/`.

## No Build Pipeline

There is intentionally no Node, npm, package manager, TypeScript, Vite, bundler, transpiler, lockfile, or generated build output. The repository itself is the deployable static artifact.

## Run Locally

From the repository root:

```sh
python -m http.server 8000
```

Or use the tiny launcher for your platform:

```sh
serve.bat
./serve.sh
```

Then open:

- Game: http://localhost:8000/
- Tests: http://localhost:8000/tests/

The app uses ordinary scripts, not JavaScript modules. Serving over HTTP is still the recommended path because browser behavior around local files varies, and it matches GitHub Pages or any static host.

Debug controls:

- `F`: ease camera onto the selected ship or fleet and flash a focus reticle.
- `H`: manually spawn a short hostile-raider vignette; selected escorts show their coverage circle.

Construction controls:

- Deliver ore to the mothership until a depot section is ready.
- Select `Linehorse`, then right-click the depot ghost to carry a ready section to the site.
- Once mining or construction is underway, contacts can appear automatically after a warning.

## Deploy

Deploy the repository contents directly as a static site, including to GitHub Pages. All application URLs are relative, so the game can run from a domain root or a repository subpath.

## Vendored Runtime

PixiJS is vendored at `vendor/pixi/pixi.min.js`.

- Version: PixiJS 7.4.2
- Source: `https://cdn.jsdelivr.net/npm/pixi.js@7.4.2/dist/pixi.min.js`
- License: MIT, copied to `vendor/pixi/LICENSE` from the PixiJS 7.4.2 repository tag.

The game does not load code, fonts, art, telemetry, or other runtime resources from the network.

## Browser Assumptions

- Ordinary browser scripts loaded in explicit order.
- Canvas/WebGL support through PixiJS.
- `localStorage`.
- Pointer events.
- `requestAnimationFrame`.

## Next Vertical-Slice Milestone

The next milestone is pressure and consequence: add a simple extraction timer, a director-triggered pirate warning/attack, and persistent damage/cargo/money changes after the mining operation ends.
