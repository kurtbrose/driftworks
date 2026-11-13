# Flight missiles: FreeSpace baseline

This first gameplay pass imports retail missile tuning and adapts the common
FreeSpace Open secondary-weapon mechanics into Driftworks. It is not a complete
FreeSpace engine port. Gameplay sessions enable missiles; primary-only duel
experiments explicitly disable them unless `DuelOptions.missiles` is true.

## Controls

- Right mouse or B: fire the selected secondary bank.
- H: deploy countermeasures; holding repeats at the normal cooldown.
- M: cycle secondary banks.
- Standard controller: RB/R1 fires missiles, LT/L2 deploys countermeasures,
  left stick press cycles secondary banks. Bindings are editable.
- Touch: Missile, Decoy and Missile bank buttons.

Select the target with the existing auto-target, L and Tab controls. Aspect
missiles accumulate a lock while the target remains in range and within the
forward lock cone. Their HUD line shows percentage and LOCK. Unlocked aspect
missiles can dumbfire unless the weapon has the `no dumbfire` flag. Heat seekers
acquire in flight. Settings / Missile loadout changes types within the ship's
allowed retail list, conserving remaining ammunition cargo. Reset rearms.

## Numeric provenance

`tools/import-retail-missiles.cjs` reads the installed `Root_fs2.vp` offline and
writes `experiments/retail-missiles.js`. Original table hashes are recorded in
that file and match the primary/handling importer:

- weapons.tbl: `9e94ba10b7cd5acafefb22dcaada2545ca40d713fae112597a4dca1f63db6f9a`
- ships.tbl: `60266906ff4bc25932ecda1aa8070c92de0e7ab6cde42c2d5a02169c7e6315ca`

The catalog includes 21 standard types/variants: Rockeye, Tempest, Hornet,
Harpoon, Trebuchet, Cyclops, Helios, retail D/weak/short variants, Rebel Bomb,
Enemy MX-64, MX-52, FighterKiller, Swarmer, Unknown Bomb and Unknown Megabomb.
All 35 small-craft profiles supply default banks, allowed types, bank cargo
capacities and countermeasure counts. Round counts use the retail cargo-size
conversion. No retail models, textures, prose or audio are copied.

Imported fields: speed, damage, shield/armor factors, lifetime, fire wait,
cargo size, turn time, heat view cone, minimum lock time, lock/catch-up pixel
rates and penalty, swarm count, blast radii/force, shockwave speed and flags.
The Type One countermeasure's randomized 1–2 second lifetime comes from its
table. Visual length, radii and colors are Driftworks placeholders.

```powershell
node tools/import-retail-missiles.cjs "E:/GOG Galaxy/Games/Freespace 2/Root_fs2.vp"
node tools/import-retail-missiles.cjs "E:/GOG Galaxy/Games/Freespace 2/Root_fs2.vp" --check
```

## Source reference and implemented behavior

Behavior was inspected at FreeSpace Open commit
[`c28032a2afa99b508aaafe96ec075b4ec4a54b1c`](https://github.com/scp-fs2open/fs2open.github.com/tree/c28032a2afa99b508aaafe96ec075b4ec4a54b1c).
References below are pinned; modern mod/profile flags can change these rules.
The implementation is authored JavaScript, with no transplanted C++ or retail
assets. The upstream [license](https://github.com/scp-fs2open/fs2open.github.com/blob/c28032a2afa99b508aaafe96ec075b4ec4a54b1c/Copying.md)
contains restrictions on the original code; this is not an unrestricted code
vendor operation.

- [weapons.cpp](https://github.com/scp-fs2open/fs2open.github.com/blob/c28032a2afa99b508aaafe96ec075b4ec4a54b1c/code/weapon/weapons.cpp):
  heat/aspect seeker defaults; half of the 0.5-second free-flight interval before
  homing; launch at one quarter of maximum speed plus forward ship velocity;
  first-second homing speed ramp; reduced speed in a hard turn; bounded turning;
  aspect lead capped at two seconds; heat view-cone loss/reacquisition; lifetime
  loss while off-axis; near-miss detonation; quadratic blast damage falloff;
  expanding shockwaves for nonzero table shockwave speed.
- [hudlock.cpp](https://github.com/scp-fs2open/fs2open.github.com/blob/c28032a2afa99b508aaafe96ec075b4ec4a54b1c/code/hud/hudlock.cpp):
  target-specific acquisition, minimum lock time, virtual 640×480 indicator
  movement, catch-up penalty, cone/range gating and degradation. The default
  lock-cone dot threshold is 0.85.
- [swarm.cpp](https://github.com/scp-fs2open/fs2open.github.com/blob/c28032a2afa99b508aaafe96ec075b4ec4a54b1c/code/weapon/swarm.cpp):
  150 ms salvo spacing, 300–500 ms zig intervals, two-metre lateral deflection
  basis, and straightening near impact. Salvos consume one actual round per
  missile and continue after trigger release.
- [cmeasure.cpp](https://github.com/scp-fs2open/fs2open.github.com/blob/c28032a2afa99b508aaafe96ec075b4ec4a54b1c/code/cmeasure/cmeasure.cpp)
  and weapons.cpp: rearward 25 m/s launch plus ship velocity and jitter,
  300 m effectiveness radius, heat/aspect strength 3/2, one effectiveness roll
  per missile/decoy pair, two launch pulses and 40 m detonation radius. Decoy
  detonation also clears opposing missiles inside that radius.
- [aicode.cpp](https://github.com/scp-fs2open/fs2open.github.com/blob/c28032a2afa99b508aaafe96ec075b4ec4a54b1c/code/ai/aicode.cpp):
  nearby incoming seekers trigger AI countermeasures within roughly two seconds
  of missile travel. AI missile fire requires a valid forward target, range,
  ammunition, cooldown and aspect lock where applicable. Empty banks switch
  to another supported loaded bank.

## Adaptations and remaining work

This preserves Driftworks' pooled shields, hulls, flight physics and mission
ownership. Blast distance uses its collision envelope rather than FSO's nearest
bounding-box point. Obstacles occlude blast damage. Homing and lock acquisition
use local-space targets; a missile can travel through registered wormholes but
does not lock onto a remote-space target through a mouth. Curved-space travel,
guidance and chart rebasing use the existing flight geometry.

The lock indicator/catch-up algorithm and swarm steering reproduce the broad
rules, not the complete FSO UI/state machine. The HUD shows lock
progress text and a moving lock box. AI's range/cone/safety gates and guaranteed countermeasure
response are Driftworks adaptations: FSO's difficulty/class fire probabilities,
missile-volley limits and ship evasion states are not ported. Countermeasure
launch pulses use two fixed simulation ticks, rather than render frames.
Countermeasures use the same seeded per-combat stream on each reset.

Tornado corkscrews, Piranha/Infyrno cluster children, Stiletto subsystem effects,
EMP, TAG, turret missile selection, shootable bombs, missile-to-missile collision,
arming/dinky explosions, directional shields, capital damage scaling,
mass-dependent blast impulse and FreeSpace's sound/HUD artwork remain unported.
Their unsupported default banks are labeled unavailable rather than silently
substituting different weapons. The table's blast-force field is retained but
does not apply a guessed impulse to Driftworks ships. This pass does not claim
retail campaign balance or visual equivalence to a running FreeSpace build.

## Verification

`node tests/flight-missiles.cjs` exercises imported tuning, steady/moving locks,
target/bank resets, ammo/cooldowns, dumbfire restrictions, swarms, heat and aspect
target ownership, turn limits, countermeasure lifecycle and once-only rolls,
damage, region separation, terrain and the real session integration. The check
is registered in the flight test group. Strict type checking includes the new
runtime and data; the importer has an exact regeneration check.

Production Chrome checks use the actual flight session, ship assets, HUD,
controls and projectile renderer with fixed ships/camera. Temporary captures and
the browser report live under ignored `output/missiles/`; the automation lives
under `.scratch/missiles/`. Mechanical checks and those captures do not establish
FreeSpace parity or acceptance for every weapon, mission and wormhole view.

The broad flight-group run completed 61/64 entries before the loadout DOM fixture
was updated; that fixture's transition/loading tests now pass. The two other
failures were isolated: the Ohio roster's missing `convoyBattle` dependency also
fails with the committed pre-missile runtime; the current workspace's assignment
HUD count still fails with the missile module omitted. The focused missile
changes applied without the concurrent wormhole HUD edits pass that full HUD
check. These existing workspace failures are not included in the missile change.
No CI result is claimed.

## Original missile visuals

The production gun/effect path now draws original eight-sided pointed missile
bodies with four swept fins. Standard missiles are 3.2 m long with a 0.16 m
body radius; heavy weapons (cargo size at least 10) use 5.4 m / 0.32 m.
These are authored visual dimensions, not imported FreeSpace model dimensions.
Opaque, depth-writing bodies disappear beyond 180 body lengths; additive nozzle
glows and exhaust remain. Missile artwork bypasses primary-gun visual options.
No FreeSpace mesh, texture, sound or effect asset is used.

Simulation history records actual positions approximately every 25 ms, capped at
48 points / 0.85 seconds. Connected strips share edge vertices and fade only across their width and
with age, avoiding a repeating bright/dark pattern at each sample;
region changes break strips. Detonation retains the remaining history so the
tail fades naturally. Hyperbolic rebasing transforms live and detached history.
The history is visual data and has no influence on guidance or collision.

Warheads have a 0.12-second flash, expanding fire puffs and radial sparks fading
over 1.1 seconds. Visual scale uses the square root of the table's inner blast
radius, bounded to 3–28 m; damage and propagating shockwave rules are unchanged.
This first pass has no volumetric smoke, dynamic light or visible damage-wave
boundary. Countermeasures retain their existing spark treatment.

Focused coverage includes finite opaque geometry, distance culling, bounded
history, no ribbon across regions and extended detonation lifetime. Fixed-pose
production Chrome captures under `output/missile-visuals/` cover the ship-scale
side view, close missile body, a real seeker turn, flash and aftermath. The
close and turning views use separate fixed camera poses. Portal/rim visual
acceptance and a full weapon-by-weapon art pass remain unverified.
