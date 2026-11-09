# Flight mission definitions, version 1

## Local mission workshop

Open `tools/mission-workshop/` on the local static server to rehearse and revise
evacuation Cycle A and convoy escort dialogue. The workshop groups characters,
scenes and source-linked lines, stores takes locally, and exports guarded script
revisions. See [the workshop workflow](../tools/mission-workshop/README.md) for
catalog refresh, backups, applying revisions and the boundary between fixed
lines and dynamic runtime reports. Plot and trigger notes remain authoring
drafts until integrated into mission logic.

## Fleet evacuation / Jade ambush

Open `experiments/flight.html?mission=fleet-evacuation`. Thirty transports and
the player's two wingmates begin a quiet patrol over Jade. The mission rotates
the existing Jade tableau 65 degrees down: the night-side limb sits below the
convoy and its forward course clears the planet disk toward open stars. The earlier capital
battle prototype has become a staged ambush; convoy escort remains separate.

The fixed-step encounter in `src/convoy-ambush.js` consumes the convoy director's
`attention` state. It observes nearby player firing, incoming attacks, player
hull/shield damage and threats/damage to cargo. A distant surviving enemy alone
does not count as a dogfight. The phases are settling, combat, cooling, rest and
ready. Eight continuous quiet seconds earn a replayable, variable 10–30 second
rest; renewed combat resets both cooling and rest. Optional exposition waits for
rest, and a busy radio holds the next incident. Tactical warnings and live
interception orders remain available under fire. The physical simulation keeps
running throughout; this gates new events, never pauses enemies or changes damage.

The encounter owns the following beats:

- 3 / 10 seconds: Control requests fuel and systems status; Lancer Two answers
  Control. The fuel percentage is authored mission context (flight has no fuel
  consumption model). Fighter comms stay disciplined; conversational chatter
  belongs to civilian transports. No hostile or capital is
  active, and cargo cannot take encounter damage during this quiet opening.
- After the opening patrol settles (normally at least 60 seconds), when attention
  and the radio are free, Control
  warns "Warning. Spatial discontinuity detected." A dogfight postpones this
  opening as long as necessary.
- Six available seconds later: the hostile mouth opens ahead of the live convoy. Freighters
  physically turn port toward a new rally point, with shared flocking, acceleration,
  predictive hull separation and a threat field around the mouth.
- Four seconds after opening: the first strike wing arrives and Harrow fires
  finite-speed capital rounds through the mouth for an 18-second salvo window.
  These use real swept cargo hull hits and normal damage; no cargo loss is scripted.
  Up to four three-fighter strike wings arrive. Each subsequent wing waits for
  the current fight to cool and the rest window to finish; waves do not stack
  just because a launch timer expires. Bombardment stops between encounters so
  the capital cannot prevent the director from ever observing a lull.
  Capital-caused pressure does not cancel healthy ambush wings. Strike pilots
  take short defensive breaks and then recommit to cargo; depleted wings still
  retreat to a fixed, distant exit that can satisfy the departure condition.
- During the first earned rest: Control confirms the rally and delayed relief. Existing stable
  interception assignments and amber TASK radar/ship/edge cues identify live wings.
- After at least two wings and 120 seconds since the incident, the next earned
  rest can end with relief instead of another wing (four-wing maximum). The
  rescue mouth opens ahead of the rerouted convoy. Bastion emerges
  toward the convoy, then moves aside. Its actual Aegis weapons provide cover.
- Twenty seconds after relief arrives: transports cross that mouth in the opposite direction.
  Escape requires crossing its plane inside the aperture, not reaching an elapsed
  time or deleting every remaining enemy. Damage, targeting, rendering and reset
  ownership remain separate from escape bookkeeping. After completion, new capital
  fire stops while already-fired mission and native capital rounds continue to
  move, hit and expire; completion never freezes visible projectiles.

`combat.convoy.evacuation` is transient, JSON-safe mission state. Positions use
scene units; routes, rally and cruise intent use SI units. Harrow's outgoing
rounds are stepped headlessly as well as in the browser; its remote hull does
not collide with local fighters. Bastion's native Aegis combat remains owned by
the browser facade and has a separate actual-rig regression. The seeded unattended
route test (durable test pilot only) runs through separated fights, earned
rest windows, delayed relief and physical extraction. Encounter timestamps and
losses are observed replay output, not scheduled event times or forced outcomes. This verifies progression, not player difficulty.
The hostile opening is 1.3 km in diameter; the rescue opening is 1.6 km. These
are initial staging values, not a requirement imposed by the capital's length.

Control's assigned enemies carry amber TASK brackets on radar, ship markers and
offscreen arrows. Entire live wings are marked, including survivors after leader
loss. Outside-range contacts remain at the radar rim. Intercept orders use a fixed
banner and nearest-attacker distance. `convoyBattle.assignmentTargets` excludes
dead, withdrawing and departed ships and never changes the player's target lock.

Focused checks: `node tests/fleet-evacuation.cjs`,
`node tests/evacuation-capitals.cjs`, `node tests/flight-hud-markers.cjs`, and the
`node tests/convoy-ambush-tactics.cjs`, `node tests/convoy-pacing.cjs` and
`node tests/convoy-projectile-cleanup.cjs` regressions, plus the
convoy battle/director/arrival checks. Original prototype measurements are retained
in `docs/benchmarks/fleet-evacuation.md`; they predate this staged encounter.

## Convoy escort / battlefield direction

Open `experiments/flight.html?mission=convoy` or select Convoy Escort on the
missions page. Thirty authored DW-14 modular freighters cross a 7.5 km route at 25 m/s.
Ten each use the container, mixed-freight and bulk-fluid configurations from
the industrial shipyard. Their original metre scale, atlas UVs, materials and
geometry are retained. Five packets of six ships occupy a staggered volume:
Upper, Port, Lower, Starboard and Rear. Each packet has two offset columns,
three longitudinal ranks and varying height. Local columns are 96 m apart,
ranks 125 m apart with a 60 m stagger; packet centres provide larger crossing
corridors. The full formation spans roughly 663 x 830 x 409 m, with no coincident
rows or a shared flight plane. All noses stay aligned with the route.
The player starts 680 m behind the route origin and 80 m above it,
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
arrival flags, route speed, elapsed time and the first-raid lifecycle flag. Positions use scene units;
velocities and speed use m/s. It runs in the same fixed-step flight session
headlessly and in the browser. Reset rebuilds the roster with the same IDs.
The HUD shows route distance/time, nearby cargo labels, cargo radar contacts
and arrival counts. The training asteroid and mothership are absent.

The playtest opens with sixty seconds of quiet escort, including the arrival
exchange and roughly forty-five seconds to settle into formation afterward.
No hostile fighters exist during this leg; weapons and cargo damage remain live.
At sixty active-flight seconds, the first three-raider approach begins.
Raiders spawn as one loose three-fighter wedge on a common starboard-aft bearing,
over 2.5 km from the rear packet. Formation slots are 130 m to either side,
180 m astern and 40 m above/below the lead. Shared steering and acceleration
maintain the formation; positions are assigned only at spawn. The wing releases
into its roles within 1.4 km of cargo or when escorts intercept it.

Two raiders make strike runs; the third covers them against escorts. Normal
GTF Ulysses durability is retained (180 hull / 380 shield), with Veteran skill
and the existing FreeSpace-inspired breaking/pursuit policy. Threat response
observes distance, facing, live rounds and recent damage, never the player's
selected target or future input. Strikers can be peeled off their run; the cover
pilot can engage the interceptor. Target assignments are reconsidered instead
of holding the old effectively infinite cargo lock.

Strafing passes stop after five seconds of firing or close approach. Critical
hull damage also aborts a run. The wing regroups off the convoy after the strikes
finish or its engagement window expires, then reforms for another approach.
These goals use normal flight physics, gun tracing, shields and collision. A
survivor assumes leadership if the lead is destroyed. `combat.convoy.raids` owns
independent numeric wing IDs, phases and leader IDs; each craft's `convoyRaider` stores its wing ID, role and pass
bookkeeping, with JSON-safe IDs rather than entity pointers. `stepRaider` returns
true only when it has performed formation/cover/extension movement; its caller
still ages guns and updates collision/neighbour indices. Engaged targeting uses
the normal combat path. Wingmen return to escort after the raid is defeated.
The first battle-director pass owns `combat.convoy.director`. It observes live
hostile proximity to cargo, actual cargo-directed firing, recent cargo hull loss,
player hull and surviving wingmates. Pressure is smoothed over three seconds;
the director never changes weapon damage, durability, aim or existing positions.
Its observable stages are opening, patrol, contact, threatened, under-fire and
recovery. These describe the real situation, rather than forcing a firing cue
when no shots are being taken.

Wings now have separate `hold`, `approach`, `engage`, `regroup`, `withdraw`
and `departed` orders. Eighteen seconds into an active first encounter, the
planned reserve can arrive as one physical three-ship wing at a distant holding
station. It waits at least twenty seconds before exploiting a cargo packet with
no escort within 1.4 km, and only while pressure is below 0.5. A tight screen
keeps it held. Intercepting it makes it defend immediately. Beating the main raid
makes an uncommitted reserve withdraw, rather than automatically replacing losses.

A wing withdraws after losing two pilots, falling below 45% average hull,
completing two passes, or six seconds of sustained pressure above 0.62. It flies
out under ordinary steering/boost with weapons held. Only survivors beyond
5.5 km from every freighter are removed from the roster; they are counted as
withdrawals, not kills. No actor teleports or receives a durability/aim change.
Control reports current holding, commitment and breakoff orders through the
existing spaced channel; stale instructions are dropped.

After every hostile has been defeated or physically departed, recovery lasts
45â€“85 seconds; recent cargo damage and player strain earn more time. Damage
reports finish before another encounter. The sortie retains a total budget of
three three-fighter wings, including reserves, and no new spawn after 210 route
seconds. Separate wings can approach from different bearings, while each wing
stays coherent. No automatic allied fighter reinforcement spawning is included.

### Reception fleet

Bastion and Vigilant are two production Aegis capitals at their original roughly
1.3 km length, stationary either side of the arrival corridor, 2.9 km apart.
They are part of the scene from launch and grow in view as the convoy approaches;
they do not pop into existence at arrival. Their opposed vertical offsets and
staggered along-route positions leave the cargo route unobstructed. Control
identifies the reception fleet on the final approach.

`convoyMission.arrivalFleet()` supplies JSON-safe poses and IDs to each sortie.
`convoyScenery.createArrivalFleet()` composes two existing idle Aegis rigs. They
retain production textures, material finishes, metre scale, shared immutable
local buffers, separate GPU poses, weapon traces and fighter hull contacts.
They receive the convoy without automatically starting a capital battle.
Flight-lab diagnostics provide reception approach/underside/stern cameras and
a capital-only frozen ABBA comparison, independently of the freighter toggle.
See [the measured arrival-fleet readiness pass](benchmarks/convoy-arrival-2026-10-31.md).

### Wider battle and Control dispatch

The normal convoy includes 24 background fighters from launch: 12 friendly and
12 hostile, in three-ship wings across Port screen, Starboard screen, Forward
screen and Rear picket. Together with Lancer this is 27 fighters before any
local raid. These are ordinary armed craft, with standard hull/shield profiles,
real collisions, projectiles, damage and casualties. They do not wait for the
player to kill a scripted wave. Each front starts with one three-ship wing per
side, separated by at least 1.8 km for an approach before engagement. Each has an independent 1.1 km pursuit
zone whose goal moves with the convoy; actors themselves move only by physics.
The cargo's first minute remains protected from direct attack, while distant
screens are already fighting.

`src/convoy-battle.js` owns initial sector rosters, half-second strength
assessments and dispatch decisions. `combat.convoy.battle` stores numeric front
IDs, counts, health summaries and the current order. A screen losing by two
fighters after the opening can release one existing enemy three-ship wing
toward the cargo: IDs, positions, health and guns are retained, and zone ownership
is exchanged for normal convoy-raider orders. Breakthroughs consume real forces,
not newly spawned replacements.

Control ranks immediate cargo firing, weapons-range threats, approaching strike
wings and weakened friendly fronts. Background assignments require a real
friendly deficit or damage. Orders have an 18-second service window and a
55-point improvement threshold; an immediate convoy threat can interrupt them.
Assignments clear when the local need disappears, without requiring every
fighter in the larger battle to die. Control announces the current assignment
only when the radio is free, replacing stale pending orders rather than queuing
an obsolete itinerary. It does not change the player's weapon target or lock.
Lancer's two wingmates engage near the player and regroup when drawn too far
away; sector fighters remain with their own fronts.

Far background contacts remain visible as ships and gunfire, but get individual
HUD brackets only when selected or within 1.8 km. The radar retains the larger
contact picture. Mission completion requires the freighters and immediate
convoy threats to be resolved, not the destruction of every distant opponent.
The surrounding battle can continue after escort completion. See the
[measured battlefield readiness pass](benchmarks/convoy-battle-2026-10-31.md)
for the current CPU limit and collision-query optimization.

Control provides a cyan moving patrol station during quiet periods and an amber
intercept waypoint during threats. Patrol stations move with the cargo and rotate
through packets after arrival or a 40-second watch. Intercept positions lie
between the assigned hostile and threatened cargo, with cargo-motion lead;
support orders mark the friendly front. The
marker clamps to screen edges when outside view; its label includes packet,
assignment and range. Control's contact call refers to the observed threatened
packet and marked intercept. Target locks remain under player control. Completion
clears the waypoint; reset rebuilds all director state.

Control's callsign is Rook: calm, concise and concerned with the entire convoy.
Control and fighter calls use addressee/caller, observation and order. The opening
is a visual-acquisition exchange: Control advises that the convoy should be in
visual range; a surviving nearby wingman acknowledges sighting it; Wayfarer
welcomes the escort if the tactical situation still permits. Related replies
use the three-second silent gap; urgent traffic takes precedence and cancels
stale greetings once attackers reach weapons range. Control never explains game
features. Captains use ship callsigns rather than personal introductions, with
warmer or less disciplined language appropriate to each character.
Five recurring civilian captains lead the packets, reusing their existing roster
identities, portraits and voice settings (no new portrait artwork):

| Packet | Ship | Captain | Character voice |
| --- | --- | --- | --- |
| Upper | Wayfarer | Mara Vale | Patient, reassuring; holds course for the escorts. |
| Port | Long Haul | Daniel Okafor | Unhurried veteran; dry humor about the job. |
| Lower | Keel | Elena Park | Economical, precise reports and clear corridors. |
| Starboard | Good Measure | Ines Duarte | Firm about crew safety and advance warning. |
| Rear | Last Light | Thomas Reed | Formal, dependable, uneasy about covering the tail. |

`convoyMission.radio` owns serializable per-sortie cue bookkeeping in
`combat.convoy.radio`; `flightComms` routes convoy calls through the normal shared
audio/subtitle channel. Radio phases are arrival, cruise, combat, damage report
and completion. After combat, Control requests an assessment; a surviving wingman
reports actual hull/shield condition and friendly losses, the most affected
packet reports damaged/lost ship counts, and Control acknowledges the remaining
transports before returning to cruise. A destroyed packet leader is replaced by
a Control report, never a ghost captain. No casual conversation plays during
combat or this assessment. The HUD returns to escort status when contacts clear.

Cruising chatter consists of brief, finite two-person conversations between
freighter crews about diners, machinery and hauling jobs. It replaces the old
five-captain status roll call. Each new conversation requires 28 seconds of
actual channel silence. Related replies, damage-report turns and urgent facts
require at least three silent seconds; speech counts toward neither gap. New
hostiles cancel pending casual replies and restart the combat/assessment cycle.
The initial quiet escort leg retains only its arrival exchange.

Combat distress calls require more than 10% hull loss and are limited to one per
packet per sortie, as are loss alerts, rather than queueing one call per freighter.
The later assessment includes even minor actual damage and makes no invented
claims about crew casualties or repairs.
Rook reports nearby contacts, actual weapon reach, and a live firing run against
cargo, then all-clear and escort completion. Reports use current survivors and
target assignments rather than a scheduled attack script. Packet labels in the
HUD show live ship counts. Radio does not steer fighters or grant invulnerability.

Packet-layout rendering check (2026-10-31): foreground in-app browser, 1280 x
720 CSS pixels, DPR 1.5, 1920 x 1080 backing, production scale/materials and
unchanged `convoy-flight.json`/`.bin` assets. Frozen launch camera and simulation,
radio suppressed only in the ignored measurement fixture; no tests or rebuilds
running. Fleet OFF/ON/ON/OFF, 20 warm-up and 90 measured frames per block:
render-submission CPU median/p95 was 0.40/0.40-0.50 ms OFF and 0.80/0.90 ms ON.
The fleet adds 26 draws and 1,922,020 triangles (27 / 1,922,064 total ON).
Browser cadence was 13.40/26.70 ms median/p95 in all four blocks. Existing
instanced buffers remain sufficient for this view; no new rendering bottleneck
was demonstrated. These are CPU/cadence observations, not GPU timings or a
live-combat budget. Live browser inspection also covered packet separation,
labels, Rook's opening and an actual captain damage report. Existing portrait
artwork was reused; no new portrait visual approval is claimed.

Freighters have 5,000 hull points, no shields, and real projectile damage. The
shared weapon trace compares cargo surfaces against fighter/terrain hits and
stops at the nearest surface; cargo blocks crossfire, including friendly rounds.
Destroyed freighters explode, leave their formation slots empty, cease collision,
and are removed from target selection. Hull and loss readouts reflect live state.
Aim at a cargo hull to select/lock it; Tab continues to cycle hostiles. Derived
cargo target views alias the cargo hull value and never enter the fighter movement
or rendering roster. The target camera uses the actual freighter geometry.

An escort succeeds when surviving cargo arrives and the raiders have been cleared.
Losing every freighter fails the escort. Arriving while attackers survive keeps
the defense objective active. Destroying raiders does not spawn generic new waves.

Freighter target views participate in `flight-collision.js`'s shared spatial
index and projectile corridor scheduling. They remain outside the fighter
movement/render roster. Enemy and friendly rounds both test their exact authored
hulls, preserving cargo friendly fire. The common nearest-hit resolver chooses
between cargo, fighter shields/hulls and terrain; it applies only one hit.
Convergence uses the same indexed segment candidates. Swept body contacts query
the shared index with a conservative radius including target displacement, then
retain moving-frame narrow phase. The public convoy trace remains an exhaustive
geometry oracle/CCD helper, not a separate per-projectile gameplay pass.

Freighter hulls also collide with the player and wingmen. The indexed triangle
sweep preserves open scaffolding rather than filling each ship with a solid box.
Fighter radii are swept in the moving freighter frame to prevent tunneling and
handle a freighter overtaking a stopped fighter. Contacts deflect fighters and
synchronize their engine ramps; ram damage is not added.

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
The bake includes three shared triangle BVHs in the manifest. Physics installs
those same material-batch vertices without UVs, in authored metres; the renderer
and headless loader install identical collision data before starting. The fixed
tick records prior fighter and freighter positions before either moves, then
resolves contacts before controlled gun processing. Collision indexes and source
meshes are asset caches, not serializable fields on the convoy or strategy world.
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

### Nearby reinforcement arrival tool

`convoyMission.openReinforcementPortal(combat)` offers the director a localized
reinforcement entrance. Later recovery encounters use it instead of a distant
spawn. The first contact and held reserve retain their existing approach.
The mouth stays fixed 1.1 km forward and 350 m to starboard of the player's
pose when chosen. Placement rejects nearby cargo, reception hulls and fighters.
Control announces the opening; a spherical violet energy outline grows over
three seconds, and the ordinary three-fighter raid appears four seconds after
the cue, then flies toward cargo using the existing physics and tactics.
The outline collapses after thirteen seconds. The sky inside the mouth uses
the existing thin-shell bridge's antipodal ray mapping, revealing a distorted
remote starfield. This localized entrance does not permit player transit or
use the full Ellis spacetime compositor.

The tool spends the existing three-wing budget and rejects overlapping mouths,
high pressure, a player below half hull, and late arrivals. Once telegraphed,
an arrival completes at its fixed position, without moving existing actors or
changing their durability or weapons. All timing uses active simulation time.
