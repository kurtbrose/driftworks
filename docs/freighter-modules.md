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
Restore. The hit marks are surface overlays; the shared split-seam damage
variant below also cuts the receiving panel geometry.
The continuous spine and fittings have a separate 1,200-integrity readout;
structural breakup is not implemented.

Detached components leave the attached collision mesh immediately. An imaginary
compressed spring supplies a release push at an off-centre attachment near
the mounted face. Its point and strength vary deterministically by freighter and
component ID. It pushes radially away from the load spine, with no global up
bias; mirrored mounting sides have mirrored release directions. A quarter of
the impulse starts the release; the rest is delivered smoothly over roughly
1.6–1.8 seconds. The attachment lever arm crossed with that same impulse supplies
tumble, scaled by simple box inertia and capped at 0.65 radians/second. There is
no drawn spring or persistent tether. Under thrust, the spring point is biased
toward the leading edge so it peels out first. The camera follows the ship while
its 1.4 m/s² forward acceleration leaves coasting debris aft (+X in the authored
coordinates). Stationary comparison disables that acceleration. There is no
drag force. These are presentation debris, excluded from
further weapon hits, capped at twelve visible components and removed after
eighteen active seconds. A conservative oriented-box contact check rejects new
overlaps against attached modules, loose modules and individual spine/fitting
triangles after bounds rejection. Movement is subdivided at 120 Hz; the shared
hull index also sweeps the debris centre against the actual spine triangles.
Parts slide clear of authored mounts before tumbling. Original corner locks
intersect the attached container skin; only those initial contacts are released
until the part clears them. They block subsequent return motion normally.
Contacts retain spin and add an approximate off-centre angular impulse, capped
at 0.9 radians/second. A blocked rotation does not cancel an otherwise clear
translation. This omits mass exchange, stacking and a rigid-body solver. Module
bounds can stop a part slightly early. Restore clears projectiles, debris and damage. Module
ownership follows the authored groups, not arbitrary slices through the hull.

Container damage becomes visible at 30 integrity. Three shared variants buckle
the panel, crush a corner or open a split seam with a dark interior liner.
Only the struck coplanar painted panel is tessellated, with a budget of at most
384 panel triangles (at most three subdivision levels). Other faces, frame and
fittings retain their original geometry attributes and materials. The panel's
outer edge stays seated against the unchanged frame. Collision triangles and
existing marks follow the deformed surface. Focused geometry checks measured
126–133 added triangles for the side-panel range views and up to 252 for tested
door-face variants; the regression limit is 400 added triangles including a
split-seam liner. At the same range camera and 1115 × 900, DPR 1, the partial
damage views fell from about 32,200 submitted triangles to 23,550–23,650.
Detached containers need one additional draw to keep their unchanged paint and
damaged panel separate. Recorded frame cadence stayed at about 13.3 ms median;
this demonstrates reduced geometry, not a measured frame-rate improvement.
The original paint atlas and branding remain shared. Three reusable 256px wear
maps add sparse exposed-metal chips and cracks in the material shader; no large
atlas copies or unique container textures are generated. The selector can choose
one variant, mix them by component ID, or retain the original shells.

Tank punctures emit short translucent GPU point sprites along the actual surface
normal. The local leak anchor follows detached tank position and rotation;
released gas coasts in the same moving frame. All leaks share one 64px puff map
and one draw, with at most twelve leak sources and 128 particles. Pressure fades
over fourteen seconds. The checkbox hides emission for comparison; Restore
clears leaks and particles. This is visual venting without fuel-loss simulation.

This is a Three.js review range with deliberately simple test projectiles. Its
shots are not a comparison with current flight weapon effects. Convoy simulation,
production collision, target selection, HUD and engine behavior are unchanged.
The drive/command readout only reports component integrity; route interruption,
loss of propulsion, gameplay fuel loss, secondary explosions and salvage are future work.
Production integration needs JSON-safe simulation ownership, shared projectile
and hull contacts, matching visible/collision removal, module targeting, and
performance and visual acceptance in the actual convoy scene.

Attached geometry is merged by material. Immutable component buffers are reused
for debris; attached meshes rebuild on damage-variant activation or destruction,
not during drift or orbit.
The optional focused browser check is:

```powershell
$env:DRIFTWORKS_BROWSER_MODULES='path/to/development/node_modules'
node tools/check-freighter-modules-browser.cjs
```

It checks all three freighters, independent damage, payload/drive/command
detachment, persistent marks, fixed firing poses, deliberate impacts against the
freighter and other debris, outward spring direction, aft drift, all three damage
variants, shared atlas retention, one-draw bounded venting, reset and GPU geometry lifetime. Run
`node tests/freighter-contact.cjs` for the dependency-free 3D box contact check,
and `node tests/freighter-damage.cjs` for panel budget, unchanged hardware/UVs,
shared atlas and visual/collision triangle-count checks.
Labeled range captures and matched intact/detached/detached/restored measurements go to ignored
`output/freighter-modules/`. Measurements report CPU submission and browser
cadence, not GPU execution or production convoy readiness.
