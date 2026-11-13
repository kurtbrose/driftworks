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
Clicking a surface selects that exact aim point; the selector aims at the component
centre. Each impact uses the fighter `shipHulls.addScorch` projector to clip five
small, irregular layers to the receiving module's actual triangles. A dark inner
puncture sits inside a restrained scorch halo; the surrounding original paint
stays intact. Marks persist after the flash and move with detached hardware.
Each component retains up to 24 impacts, rebuilt only when hit and cleared on
Restore. These are surface marks, not perforated collision geometry or a burned
wreck texture.
The continuous spine and fittings have a separate 1,200-integrity readout;
structural breakup is not implemented.

Detached components leave the attached collision mesh immediately. An imaginary
compressed spring supplies a release impulse at an off-centre attachment near
the mounted face. Its point and strength vary deterministically by freighter and
component ID. The impulse lifts the part away from the mount; the attachment
lever arm crossed with that same impulse supplies tumble, scaled by simple box
inertia and capped at 0.65 radians/second. There is no drawn spring or ongoing
tether. The part then coasts. These are presentation debris, excluded from
further weapon hits, capped at twelve visible components and removed after
eighteen active seconds. A conservative oriented-box contact check rejects new
overlaps against attached modules, loose modules and individual spine/fitting
triangles after bounds rejection. Movement is subdivided at 120 Hz; the shared
hull index also sweeps the debris centre against the actual spine triangles.
Parts slide clear of authored mounts before tumbling. Original corner locks
intersect the attached container skin; only those initial contacts are released
until the part clears them. They block subsequent return motion normally.
Contacts damp spin and deflect velocity; this deliberately omits mass, torque,
stacking and a rigid-body solver. Module bounds can stop a
part slightly early. Restore clears projectiles, debris and damage. Module
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
detachment, persistent marks, fixed firing poses, deliberate impacts against the
freighter and other debris, reset and GPU geometry lifetime. Run
`node tests/freighter-contact.cjs` for the dependency-free 3D box contact check.
Labeled range captures and matched intact/detached/detached/restored measurements go to ignored
`output/freighter-modules/`. Measurements report CPU submission and browser
cadence, not GPU execution or production convoy readiness.
