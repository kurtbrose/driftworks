# Freighter submodule damage prototype

Open [the damage range](../studies/freighter-modules.html) on the local HTTP
server. Choose a freighter, pick visible hardware or use the component selector,
then fire. Drag to orbit and use the wheel to approach. Broadside, Engines and
Command restore useful inspection poses; firing never moves the camera.

The range uses `buildFreighter` from the industrial kit at its authored metre
scale, with its existing surface atlas. Containers, permanent tank assemblies,
four drives, command hardware and maneuvering cassettes have independent
integrity. Three 35-damage hits detach a 100-integrity component. Swept 450 m/s
test shots stop at the nearest actual mesh surface, including intervening
hardware. Selecting a hidden component does not let shots pass through the ship.
The continuous spine and fittings have a separate 1,200-integrity readout;
structural breakup is not implemented.

Detached components leave the attached collision mesh immediately and coast
with a deterministic tumble. They are presentation debris, excluded from
further weapon hits, capped at twelve visible components and removed after
eighteen active seconds. Restore clears projectiles, debris and damage. Module
ownership follows the authored groups, not arbitrary slices through the hull.

This is a Three.js review range with deliberately simple test projectiles. Its
shots are not a comparison with current flight weapon effects. Convoy simulation,
production collision, target selection, HUD and engine behavior are unchanged.
The drive/command readout only reports component integrity; route interruption,
loss of propulsion, fuel leaks, secondary explosions and salvage are future work.
Production integration needs JSON-safe simulation ownership, shared projectile
and hull contacts, matching visible/collision removal, module targeting, and
performance and visual acceptance in the actual convoy scene.

Attached geometry is merged by material. Immutable component buffers are reused
for debris; attached meshes rebuild on destruction, not during drift or orbit.
The optional focused browser check is:

```powershell
$env:DRIFTWORKS_BROWSER_MODULES='path/to/development/node_modules'
node tools/check-freighter-modules-browser.cjs
```

It checks all three freighters, independent damage, payload/drive/command
detachment, fixed firing poses, reset and GPU geometry lifetime. Labeled range
captures and matched intact/detached/detached/restored measurements go to ignored
`output/freighter-modules/`. Measurements report CPU submission and browser
cadence, not GPU execution or production convoy readiness.
