# Flight mission definitions, version 1

## Evacuation cockpit dry run

Open `experiments/flight.html?mission=evacuation` from the static server (also
linked on the home page). This first playable pass implements only Cycle A of
the October 21 working draft: Five departing, Six already refueling, the safed
charges exchange, four raiders, Station Four's diversion, and Six's departure.
The planet stays intact. The bomber encounter and later cycles are not authored.

`evacuation-mission.js` owns transient `combat.evacuation` state. The radio
scheduler advances one authored line only when the channel is available; combat
does not use the opening-dialogue weapons gate. Two NPC fighters plus the player
form the whole patrol. Four reserved hostiles enter after the weapons-free call;
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
Defense Control keeps its existing cast. Depot Control uses Deck Supervisor
Jo Mercer from the runway-worker roster for every transmission, with the
functional facility identifier retained on the radio.

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
