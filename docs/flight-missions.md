# Flight mission definitions, version 1

## Convoy escort / first step

Open `experiments/flight.html?mission=convoy` or select Convoy Escort on the
missions page. Thirty authored DW-14 modular freighters cross a 7.5 km route at 25 m/s.
Ten each use the container, mixed-freight and bulk-fluid configurations from
the industrial shipyard. Their original metre scale, atlas UVs, materials and
geometry are retained. The convoy occupies three lanes, two vertical tiers
and five rows: 45 m lateral, 35 m vertical and 110 m longitudinal spacing.
The player starts 260 m behind the rear row and 50 m above the convoy centre,
already matching convoy speed. The crossing takes
five minutes of simulation time; Esc pauses it and Reset starts a fresh route.
All ships stop at their own formation slots in the arrival corridor.

The standard escort wing has three fighters: the player, Lancer Two and Lancer
Three. This mission equips both wingmates with the player's handling profile
so a slower randomly assigned hull cannot fall behind. They follow moving
player-relative slots through ordinary steering, throttle and boost, rather
than teleporting with the player. The shared `convoyMission.WING_SIZE` is 3;
older encounter presets retain their authored counts.

`src/convoy-mission.js` owns transient `combat.convoy`: stable cargo IDs and
callsigns, starting formation slots, current positions and velocities, hull,
arrival flags, route speed and elapsed time. Positions use scene units;
velocities and speed use m/s. It runs in the same fixed-step flight session
headlessly and in the browser. Reset rebuilds the roster with the same IDs.
The HUD shows route distance/time, nearby cargo labels, cargo radar contacts
and arrival counts. The training asteroid and mothership are absent.

This is a quiet escort layout and pacing playtest. There are no attackers,
director decisions, Control vectors, patrol assignments or authored dialogue.
Weapons are disabled. Cargo hull values are preparatory state: freighters do
not yet participate in combat damage or physical collision, and a player can
fly through them. Reaching the corridor completes the cargo route regardless
of player position; there is no proximity-based success/failure gate yet.

`experiments/convoy-scenery.js` loads the industrial kit flight bake and paint
atlas. Repeated ships share immutable GPU geometry (26 material buffers across
three configurations); ten GPU instances of each configuration retain all triangles
in 26 draws. Immutable `Batch.instanceOffsets` contains model-local scene-unit
translation triples for flat-space repeated assets. Both raw and native textured
materials apply them before the shared batch transform; group culling includes
every copy, and triangle counters include the instance count. Offsets and source
vertices are cached independently and released when their batches leave the scene.
Only the convoy origin moves during the crossing. The launch gate waits for
freighter geometry, the atlas and GPU texture preparation. Regenerate the local
flight bake after editing the authored kit with `node tools/export-convoy-flight.cjs`.
The bake preserves factory pivots and converts +X aft / +Y dorsal into flight
+Y forward / +Z dorsal, including normals and texture orientation. As with the
existing civilian flight adapter, shared flight shading approximates the study
materials rather than duplicating its four-light inspection setup.
Flight lab & diagnostics includes **Benchmark convoy on / off**, which freezes
the camera and simulation for an ABBA render comparison. Headless behavior
coverage lives in `tests/convoy-mission.cjs`.

## Evacuation cockpit dry run

Open `experiments/flight.html?mission=evacuation` from the static server (also
linked on the home page). This first playable pass implements only Cycle A of
the October 21 working draft: Five departing, Six already refueling, the safed
charges exchange, four raiders, Station Four's diversion, and Six's departure.
The planet stays intact. The bomber encounter and later cycles are not authored.

`evacuation-mission.js` owns transient `combat.evacuation` state. The radio
scheduler advances one authored line only when the channel is available; combat
does not use the opening-dialogue weapons gate. Two NPC fighters plus the player
form the whole patrol. Actual and Finch have mission-only plot armor: shields
and hull take damage, but hull stops at one point, preventing death events and
wrecks. Player, enemies and other missions retain ordinary damage rules. The
optional transient craft flag is `plotArmor`. Four reserved hostiles enter after the weapons-free call;
generic furball wave resets are disabled. Fuel-complete dialogue requires the
two-minute minimum fueling interval and five seconds clear of living hostiles.
The diversion has its own pause before departure clearance. Pausing freezes both
story and flight, and restarting creates a fresh cycle. The same controller runs
through `tools/headless.cjs`; `tests/evacuation-mission.cjs` covers its gates.

`evacuation-scenery.js` uses the approved commuter and double-decker geometry,
preserving their metre scale. It directly imports the existing
`refueling-cycle.js` and `depot-arm.js`: Five starts in vertical departure, Six
starts in the connected hold, and clearance releases disconnect, vertical
clearance and departure. These remain visual transports, with no weapons,
damage, collision, passenger simulation or fuel-resource accounting in this pass.
The three-fighter combat and mission dialogue are real; depot defense damage and
runner-specific AI remain future mission systems. Shuttle Five uses Captain Daniel Okafor and Shuttle Six uses Captain Elena Park
from the civilian shuttle roster, including their suggested voice slots. Every
transmission from each shuttle retains that civilian portrait; fighters and
Defense Control keep their existing cast. Depot Control uses Deck Supervisor
Jo Mercer from the runway-worker roster for every transmission, with the
functional facility identifier retained on the radio. Scripted evacuation calls
use a fixed 0.85 speech rate; shared combat quip voice rates remain unchanged.

Run `python tools/export-civilian-flight.py` after editing the approved GLBs to
regenerate material-grouped binary geometry and ventral contact metadata. The
static flight renderer uses immutable local buffers and GPU poses. It preserves
geometry, vertex normals and base material colors; the shared flight shader
approximates GLB PBR finishes. The depot's UV paint and independent arm links are
retained. Its Blender palette is linear RGB and converts to display sRGB once
when creating study batches, preserving the authored safety-orange bands. The lab's **Benchmark depot / transports on / off** button performs a
frozen-camera ABBA comparison, with 20 warm-up and 90 recorded frames per block.
Its CPU submission/frame median and p95 exclude GPU completion timing.

The flight lab loads `experiments/flight-missions.js` before its consumers, then
loads ordinary local scripts that register definitions. Ohio is defined in
`experiments/mission-ohio.js`. No fetch, build step, engine copy or external
runtime dependency is required. Worker/headless entry points load the same files.

`flightMissions.define(id, overrides, parentId)` inherits `default` unless another
registered parent is named. Nested records merge; arrays replace in full.
Definitions are copied and deeply frozen, so editing an input array or another
mission cannot change the defaults. IDs are unique. Version, finite positive
unit scales, encounter counts, spawn settings, and opening speaker indices are
checked at registration. Unknown or malformed URL mission IDs resolve to defaults.

Select a registered mission with `flight.html?mission=county-fair`. Scripts for a
new definition must be included before the flight modules that consume it; this
initial format intentionally does not discover or execute arbitrary URL scripts.

The optional `emptySpace: true` mission flag removes the training asteroid and
mothership from the flight world, suppresses their radar contacts, disables
combat and terrain/projectile collision, and starts stationary facing the planet.
`planet-impact-watch` uses this for an unobstructed ten-minute sky study;
`planet-impact-baked` keeps the normal asteroid and 8v8 fight. The flag belongs
to the flight preset and adds no persistent simulation fields.

```js
window.Driftworks.flightMissions.define('county-fair', {
    heading: 'DRIFTWORKS / COUNTY FAIR',
    subtitle: 'Blue Ribbon vs. Red Ribbon',
    teams: {
        ally: { status: 'Blue Ribbon', target: 'Blue Ribbon', radio: 'Blue Ribbon' },
        enemy: { status: 'Red Ribbon', target: 'Red Ribbon', radio: 'Red Ribbon' }
    },
    encounter: {
        count: 4,
        spawn: { backRadii: 3, altitudeMeters: 500 },
        callsigns: ['Pat', 'Chris', 'Lee', 'Jo']
    },
    comms: { calls: { firing: ['Taking the shot. Save me a funnel cake.'] } },
    opening: []
}, 'furball');
```

## Definition fields

- `version`, `id`: schema version and registry identity. `define` supplies the ID.
- `title`, `heading`, `subtitle`, `hint`: page and launch presentation.
- `units`: distance/speed scales from SI, compact labels, spoken words, and
  whether radar uses kilometres. Ohio uses yards/mph; default flight uses m/m/s.
  These never modify simulation positions, velocities or weapon ranges.
- `teams`: separate status, target-label and radio labels for each side.
- `comms`: per-event line pools, named variants, friendly/rival forms of address,
  and whether ambient chatter uses actual cast members. Unspecified event pools
  fall back to shared dialogue; existing requests/replies and priority rules
  remain in the shared scheduler. `{pilot}` references retain real names.
- `portraits`: local atlas folder and diagnostic cast label, retaining shared
  voice slots and facial animation layout.
- `sky`: selectable shared sky by default. The `landmarks` handler currently
  accepts exactly two authored tangent-space images (planet and sun), using the
  existing single background pass and independent crisp stars.
- `scenery`: authored renderer descriptors. The initial built-in handler is
  `highway-sign`; its local image path comes from the definition. The `roadside`
  handler loads a local normalized mesh catalog and accepts `placements` with
  `model`, `x`, `y`, `size` (maximum dimension in metres), and `yaw` (radians).
  Optional `scale` and `anchor` shrink the entire layout together; `offset`
  translates it in asteroid-local metres after scaling. The settlement
  uses a flat platform resting on sampled terrain and batches by color. Additional
  scenery types need renderer implementations, rather than functions in data.
- `encounter`: built-in `training`, `furball` or `patrol` behavior, fixed count
  (zero retains the training wave count), immediate spawn, cast names and start
  offset. Furball wings split the count evenly (the ally wing gets the odd slot).
  Spawn altitude is metres above the nominal radius, matching existing flight.
- `opening`: ordered `{text, speakerIndex, channel}` transmissions. The shared
  sequencer waits for radio availability and the configured speakers; player and
  AI firing remain gated until the last line finishes. `Combat.openingStep` is
  transient flight-session state and survives waves in that session, not a new
  field in the persistent strategy-world save schema.

Ohio inherits the `furball` encounter. Its labels, units, dialogue, cast, wardrobe,
planet/sun bearings, sign asset and opening exchange reside in its definition.
Existing shared geometry/shader implementations remain renderer code. The old
`flightDialogue.ohioAddress` and boolean `compose(..., true)` entry points are thin
compatibility adapters to the registry; gameplay consumers pass mission IDs.

This is a small authored mission format, not a campaign/save format, scripting
language or editor. New encounter and scenery mechanisms still require ordinary
shared code. Ohio places a small farm/fuel-stop cluster beneath the sign through its `roadside` descriptor.

Run `node tests/flight-missions.cjs` for inheritance/immutability validation and
`npm run check` for the full suite. Browser checks should cover default flight,
Ohio's full opening/combat transition, units, labels, wardrobe and sky/sign.
The regression suite also registers a third mission with four ships, a different
spawn, distance units and firing line, ensuring consumers do not depend on Ohio.

### Continuous rosters and craft overrides

`encounter.count` is the number of AI craft, excluding the player. Ohio uses eight
(four on each side). Its sixteen `callsigns` retain stable cast/voice indices:
the first eight belong to Ford Folks, the next eight to Chevy Crew.
`encounter.reinforcements` supplies `rosterSplit`, `launchModel`, `launchSeconds`
and `launchSpeed` (metres/second). A destroyed AI slot immediately receives the
next inactive pilot from its own half of the roster, with a fresh unique ID and
defenses. Continuous encounters do not trigger round victory/wave resets.

The session samples the flat roadside deck once per asteroid radius/mission and
rotates the named building's doorway with the asteroid. Replacements fly a short
straight departure before normal AI steering takes over. They cannot fire during
this departure. Death effects and bounded wrecks retain the original model.

`encounter.craftModels` cycles optional model IDs by stable cast index; empty
entries use the ordinary chosen fighter artwork. `ArtCraft.modelId` carries the
explicit override through collision, display, headlight gun anchors, engine
plumes, target cameras and wrecks. Optional model `gunMounts`/`engineMounts` use
the existing flight coordinates in metres (+X right, +Y forward, +Z up).
Mission-only packs are excluded from the generic mixed-spaceship catalog.
These settings are optional; set `reinforcements: null` to disable an inherited continuous roster. Other missions retain their existing wave rules.

Roadside placements may include a cylindrical decal: {asset, centerZ, radius:[x,y], height, arc}. Dimensions are normalized to the source model's maximum dimension; arc is radians around the front (-Y). Decals share the placement transform and terrain cache, load local textures once, and add one static UV batch each.

Optional `asteroidBulk` supplies artwork fractions in ice, volatiles, metals,
and silicates order. Flight sessions apply the mix on reset, combat mode changes,
and diameter edits so terrain queries and rendering share the same geology.
Omitting it restores the generated default. Ohio uses 85% ice and 15% volatiles;
this does not change simulation ore resources.

### SCRAMBLE! scripted launch

Open `experiments/flight.html?mission=scramble` from the mission selector.
The player and three wingmen start inside the existing 1,305 m Aegis hangar:
one on the left, two on the right, aligned across the deck. Wingmen accelerate
from holds staggered at 0.2, 0.55 and 0.95 seconds. The player has normal flight
controls immediately. After textures are prepared, SCRAMBLE enters the HUD and
starts automatically with Flight Control's ordered scramble call. Mouse mode
starts in cursor steering immediately; keyboard/controller input is also live.
Wingmen hold fire only during the short doorway clearance, then use normal
target acquisition, attack, break, evade and recovery rules. Twelve additional
fighters are already fighting roughly 150-480 metres outside the mouth at sortie start;
their ordinary AI aims, fires and damages real opponents.
Raiders attack from above as the wingmen clear the deck, then dive past.
The lead attacker uses a lethal bolt led onto the left fighter's flight
path with the normal lead solver. Destruction occurs only on a swept projectile/hull intersection, with an
impact and the normal shield, hull, wreck and radio-event paths. There is no
scheduled explosion or timer-applied damage. Player movement does not change
the left fighter's route or the attacker's target. Other raiders fire weaker
bursts at the right fighter. Launch holds release as each wingman clears 60 metres beyond the carrier
center, around 1.3-2.1 seconds. A forward clearance goal keeps nearby pilots
from breaking back into the doorway. Only the three incoming raiders retain
the authored dive passes until ten seconds. The melee starts from an irregular
3D spread with crossed target assignments, independent speed and bank, and
pilots already attacking, breaking, evading or recovering; it uses no mirrored
formation or synchronized maneuver clock.
Pause freezes the timeline; sortie reset replays it. Radio cues wait for the
channel; the loss report also waits for actual destruction.
The capital uses the existing static material batches / immutable GPU geometry.

SCRAMBLE launch-camera readiness measurement (2026-10-25): existing Aegis
`flight-rig.js` SHA256 `857eb4969b70b418f32635920c188f07e38c6b12f25cd13b87472c9ebeeee607`.
Foreground in-app browser, 902 x 939 CSS pixels, DPR 1.5, main backing
1353 x 1409, 100% render scale, production artwork, six fighters, fixed initial
hangar camera, simulation/effects frozen. No test or rebuild ran during sampling.
The built-in OFF/ON/ON/OFF comparison used 20 warm-up and 90 measured frames per
block. Capital hidden: submission median/p95 0.70/0.90 ms, 8 draws, 16,238
triangles. Capital visible: 0.80/1.00 ms, 15 draws, 60,490 triangles. Both had
13.30/13.40 ms frame median/p95. The existing unarmed static material batching
and cached GPU buffers remain sufficient for this view; no new bottleneck was
demonstrated. These are CPU submission and browser cadence, not GPU execution
or a live-combat frame budget. Cockpit launch and visible raider strafing passes
were also inspected live; no portrait artwork was changed or approved.

The flight page disables Start flight until `flightPresentation.ready` resolves
successfully after both source/wreck image loading and renderer texture upload.
Loading leaves the session paused. Completion enables flight: SCRAMBLE starts
automatically in the HUD, while other sorties wait for Start flight. Failure
keeps launch disabled and displays the error with a reload retry instruction. Resume and pointer capture also enforce the readiness gate.

Close-furball render comparison (2026-10-26): same existing cached fighter assets,
initial hangar camera and capital, 902 x 939 CSS pixels, DPR 1.5, 1353 x 1409
backing, production artwork at 100% scale. Foreground, no tests/rebuilds running,
OFF/ON/ON/OFF, 20 warm-up plus 90 samples per block, fixed simulation snapshot.
The new close-furball diagnostic toggles only the twelve additional fighters.
OFF: CPU submission median/p95 0.80/1.00 ms, 15 draws, 60,490 triangles.
ON: 1.00/1.20 ms, 23 draws, 84,600 triangles. Frame median/p95 stayed
13.30/13.40 ms in both. Existing shared model buffers/material batches keep
this integration inexpensive at the inspected camera; no new rendering
bottleneck was demonstrated. This frozen comparison excludes AI execution
and does not measure GPU time or establish a live-combat frame budget.
Live cockpit inspection also checked nearby crossing fighters, banking,
projectiles, the wingmen breaking out of formation, and the left fighter loss.
