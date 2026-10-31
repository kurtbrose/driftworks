# Flight artwork

[Architecture overview](architecture.md) · [Script loading](script-loading.md) · [Test groups](testing.md)

## Imported flight artwork experiment

`assets/ships/` keeps each creator pack in its own directory with its untouched ZIP, provenance manifest, source OBJ/MTL subset, and derived `meshes.js`. `tools/convert-ship-packs.py` is an optional offline standard-library converter; deployment needs no build. `experiments/ship-packs.js` transforms normalized meshes into existing study actor batches, shared by the inspection page and flight enemies. Flight and inspection render original Quaternius textures imported offline from archived glTF. Artwork is normalized to an 8.5 m radius; flight and duel collision queries use those same normalized model triangles.

Flight training state accepts a `furball` mode with two eight-ship wings. Craft IDs own committed opponent targets, decisions run at pilot intervals, and the existing arcade controller executes steering. Swept bolts filter same-team hulls and hit the nearest opposing ship or scenery; player fire belongs to the allied team. Round replacement is bounded to 16 craft. Ship artwork and soft bolt effects batch by team (two opaque and four effect batches maximum).

### Flight lab fighter finishes

`experiments/ship-packs.js` keeps the original neutral `geometry` API and offers
`detailedGeometry` for the flight lab and ship inspection viewer. It caches model-local
armor seams and flush service stripes, and classifies faces into four shared finishes:
painted armor, exposed metal, dark glazing and ochre markings. Surface placement is
heuristic across the CC0 packs, not an authored UV layout. Existing silhouettes and
source meshes remain intact. Pose transforms batch each finish across a fleet; the
study renderer accepts eight actor batches (four per team) and optional `finish`
values using its existing lighting. Friendly square and hostile diamond HUD contacts,
plus radar colors, carry allegiance independently of hull paint. No runtime assets or
network dependencies are added.

The flight lab defaults both artwork selectors to Mixed fleet. Model assignment
cycles through the Quaternius library by immutable pilot index and wave, covering all
11 models over successive waves; casualties never reshuffle survivors. Per-model
geometry is merged into one source-textured batch per model per team. The study
renderer accepts all model batches so mixed fleets do not lose ships. Selecting a specific model or the blockout still overrides the mix.

Disabled flight-lab pilots create presentation wrecks with a copied pose, inherited
SI velocity and a deterministic world-space tumble axis. These coast without flight
damping or thrust, persist across waves, and retain their original wave's mixed
model assignment. They are excluded from targeting, radar, weapon collision and
kill accounting after the initial disable. Terrain contact stops drift and spin.
Wrecks expire after 120 simulation seconds and the oldest is removed above 48;
restart clears them. They share live craft's material batches and use intact hulls.
This is isolated training state, not the main game's salvage/recovery lifecycle.

Flight-lab hull finishes use a brighter armor palette and a study-actor-only .18
fill contribution, leaving production geology and mothership lighting unchanged.
`shipPackModels.engineAnchors` caches one or two aft-facing surface anchors per
model. `engineGeometry` emits a blue-white halo and throttle-scaled exhaust per
anchor into one additive effect batch shared by both teams. The halo faces the
camera; the flame ribbon's long axis stays on the ship's aft axis, with only its
width rotating toward the observer. This preserves nozzle alignment during
camera rotation and off-center perspective views. Both use the existing soft emissive shader and depth testing; they are visual cues,
not dynamic lights or bloom. Disabled/idle craft emit no exhaust. The study effect
budget is five batches (the existing four gun/impact batches plus engines).

Capital ships use the same blue-white additive exhaust at their existing bell
mouths. `engineGeometry` accepts optional local metre mounts `[right, forward,
up, radius]` for ships outside the fighter catalog; their flame overlaps the mouth
to avoid a detached glow at capital scale. Aegis flames track each engine's health
and hull integrity, including idle and curved-space capital variants. Convoy
mounts follow the DW-14 terminal bank and join the shared engine batch. Civilian
liner mounts follow the dock basis and ignite during departure, after refueling.
These effects do not change the authored meshes, materials, collision or thrust.

A 1400 � 900, DPR 1 production-renderer stern comparison (15 warm-up and 50
samples per ABBA block, frozen simulation) added one draw and 20 triangles for
five Aegis engines: 131 to 132 draws, 40,364 to 40,384 triangles. Median submission
was 1.4 / 1.5 ms without / with flames, p95 1.9 / 1.9 ms; frame cadence was
11.9 ms median and 12.5 ms p95 for both. This is renderer submission and cadence,
not GPU timing or a whole-mission benchmark. Visual checks covered Aegis stern
and close views, all three convoy variants, and both liner meshes. Scratch
captures and measurements live under ignored `output/capital-flames/`.

Flight lab communications live in `experiments/flight-comms.js`. The pure
`create`/`step` scheduler consumes active flight seconds and living training
combatants. `mount` owns subtitles and a gesture-unlocked Web Audio context,
using `mumble.js` synthesis and radio processing. Only one voice plays at a
time; actual source completion restarts the silent-gap timer, and occupied frame intervals never count as silence. Completion callbacks are scoped to their transmission; pause, reset, and page exit stop playback. Comms state is not persisted.
`pilotVoice(craft)` assigns 16 curated adult timbres by stable craft index in
furball, mixing masculine and feminine voices on both teams. Lines carry fresh
`voiceSettings` and a character seed. Playback applies emotion over that stable
identity. Control has a separate profile; mumble owns output level matching.
Lines carry a separate `radioSeed` derived from transmission serial for varying
squelch and intermittent static without changing speaker identity.

Coordination, distress, combat reports, and emotional exchanges are audible only
from allies or control. Enemy broadcasts use the taunt pool and brief reactions
to actual hits; enemy transitions and emotions cannot nominate coordination
calls or start exchanges.

Comms observes living craft mode transitions each flight frame (attack, evade,
break, recover, reposition). It records transitions even while blocked and
drops those calls rather than queuing stale maneuvers. Reactive calls require
a varied 2-3.7 seconds of clear channel and ten seconds since that pilot last spoke; distress
precedes other transitions. Valid support replies, reassurance, and returning acknowledgments take first priority and bypass pilot/activity cooldowns. Each reply must start within five active flight seconds of the preceding line being selected, or it is discarded, including while the channel is busy. Support and emotional exchanges finish with an A/B/A acknowledgment; each turn still waits for a clear channel. Firing starts and target switches also offer calls,
and another speaker is preferred when several pilots have something to say. Speaker labels identify craft and maneuver. Tail
calls additionally require a pursuing opponent behind the speaker. Muted
subtitles reserve the estimated speech duration too. Reset clears observations.

Radio airtime is balanced by activity before selecting a pilot. Attack and firing
share an offense category. The last eight reactive calls bias selection toward
less-heard categories and extend category cooldowns (4 + 3 seconds per recent
call), leaving room for rarer maneuvers without inventing events or queuing them.

Comms retains one short-lived cover exchange using caller/threat IDs only.
Replies revalidate both living participants, the threat's target, and a same-team
helper attacking that threat while firing or moving toward it. Requests expire
after five active seconds or when invalid. Support replies have their own airtime
category, observe channel availability, and consume the request once spoken;
they observe AI behavior without issuing orders or changing combat decisions.

Training exposes a bounded `radioEvents` journal (64 entries, increasing
`radioSerial`) for attributed destruction, player shield depletion, and
projectile near misses. `damageEnemy` accepts an optional shooter ID source
(player string or AI craft); `trace` supplies it. `playerKills` counts only
player-attributed kills, unlike `kills`, which counts all hostile losses.
Near misses use segments clipped at the first hit, a 10-30 meter clearance,
and six seconds between reports per recipient. These are isolated lab fields.

Comms snapshots hull, pursuit, firing-pass outcome, wing counts, and relative
closing speed; `update` now accepts player pose. Important facts can wait up to
seven active seconds in a bounded 12-entry buffer, unlike transient maneuvers.
Wave changes and dead speakers invalidate buffered facts; remaining counts and
shield depletion are rechecked before speaking. Reactive activity balancing
still governs richer calls. `compose(kind,data)` expands templates, and
`numberWords` supplies spoken numeric fragments before full-line synthesis.
AI fighters have no shields; only the real player shield pool produces shield
callouts. Hull vulnerability is explicitly described as hull damage.

`flightComms.contactData(player,point)` projects contacts into the player basis
using SI distances, rounded 100-meter ranges, clock sectors and elevation.
Acquisition uses 2.5 km entry / 3 km exit hysteresis. A newly acquired contact
can offer a report; subsequent reports need a changed sector/range and 30 seconds
since its previous announcement. Only the nearest new contact is offered per
frame. Pending reports are deduplicated, expire with other facts, and revalidate
target survival, range and current geometry before playback. Contact airtime
has an 18-second base cooldown plus the usual recent-activity penalty.

The comms mount exposes `speakerId()`, the active transmission's craft ID or
null for control/anonymous chatter. It clears on completion, pause, mute and
reset; muted subsequent calls use the estimated speech duration. Flight HUD
contacts pass a `speaking` flag to radar. `flightRadar.speakerHalo` draws a shared
white ring with dark underlay on the radar tip, ship marker or edge arrow,
preserving faction and selected-target colors.

Comms line choice uses a bounded 24-record `recentLines` history of rendered
text and template keys. `compose` retains source keys on its returned array;
`pickLine` scores exact-text and template matches by frequency and recency,
selects randomly among the lowest scores, and avoids immediate exact repeats
when alternatives exist. This history is global across speakers, clears on
reset, and permits singleton choices. Work is bounded by variants times 24.

Flight radio tracks one continuous `stress` value (0 to 1) per living pilot in
its `emotions` map, keyed by craft ID. Observed pursuit adds .06 stress per
active second (.10 for multiple attackers); each hull point lost adds .015.
Critical hull damage raises stress to 1 and damage delays recovery for six
seconds. Safe flight then removes .035 per second. Fear enters at .35 and
exits below .25; panic enters at .80 and exits below .65. These separate entry
and exit thresholds prevent flickering near a boundary. Derived intensity
follows stress, so voice delivery also recovers gradually.

Losses/confusion, missed passes/frustration, kill praise/confidence, and escape/
relief create ten-second modifiers, fading during their final three seconds.
Confusion and frustration also add .08 stress; outnumbering raises it to at
least .85. Fear and panic always override modifiers, so positive events cannot
erase accumulated stress. Expired modifiers never reappear after recovery.
Maneuver changes do not reset stress. Death, disabling combat, wave changes,
and restart remove observations. These are presentation-only flight lab fields,
not persistent world fields or AI inputs.

Non-calm pilots can voice their feeling and use emotional variants for routine
maneuvers; factual reports retain their information. Transmissions carry a copied
`emotion` descriptor. `voiceOptions` adjusts the existing character preset's
pitch, pace, variation and tremor without changing voice identity. A single
five-second emotional exchange retains caller ID and emotional category. A living,
same-team pilot who is not afraid or panicked can reassure or acknowledge them,
without needing to attack the caller's pursuer. Replies wait for channel availability, bypass pilot and activity
cooldowns, and take priority over other calls. Reassuring delivery is local to the reply and does not overwrite the
responding pilot's own emotion. Emotional observations continue on busy radio;
expired feelings never form a backlog of old emotional calls.

The ship inspection viewer now defaults to Quaternius Striker with original glTF base-color texture, UVs and normals; both inspection and flight use the original source appearance. The offline converter reads the archived self-contained glTF 2.0 triangle exports and writes inspection vertex data plus local PNGs in `textures/`. This supports these single-mesh exports, not general glTF/GLB, scene transforms, animation, or full PBR. Flight uses the same source textures, UVs and normals, grouping ships by model and texture. Deployment still uses only relative local assets and needs no build.

Quaternius engine exhaust uses explicit model-specific nozzle mounts in `experiments/ship-packs.js`, in normalized right-X / forward-Y / up-Z metres, plus nozzle radius. Mounts are presentation data and do not affect thrust physics. Four-engine ships retain all four outlets; plume dimensions follow nozzle radius and tails extend aft from each mount. The ship inspector provides an exhaust toggle and rear view for attachment review.

Faction paint in the ship inspection viewer and flight lab is an optional per-batch `paint` RGB vector (0–1) on source ship geometry. `sourceGeometry` and `sourceFleetGeometry` accept it as their last argument; omitting it restores the source texture. The shared scene shader selects saturated orange texels with feathered hue boundaries and substitutes the primary paint while preserving source texture variation and neutral/weathered detail. Texture images remain shared and unmodified. Destroyed flight craft (`age` present or nonpositive `hp`) use a separate soot/heat-discolored atlas cached by source image in `ship-packs.js`; faction paint is disabled for these batches. Lossless `.wreck.webp` files are baked offline by `tools/bake-wreck-textures.cjs` (authoring requires `sharp`), retaining source resolution, UVs, alpha and the approved soot treatment. `loadTextures` resolves only after both source and wreck images load. `textureSources(images)` supplies both variants to `scene.prepareStudyTextures`, which uploads one image per task before flight publishes the image map. Destruction performs only a texture-cache lookup and shares the original geometry buffers; it never generates pixels, decodes an image or starts a GPU texture upload. Source/derived hashes and sizes live in `assets/ships/wreck-textures.json`. Orange markings in the same hue range also recolor; engines and untextured scenery do not. Flight exposes separate allied/enemy colors and a source-paint toggle; these preview settings are not saved world state.

`shipPackModels.loadTextures(ids?)` can load a selected list of model IDs. An
omitted argument loads the full catalog; an empty list loads nothing. Both live
and wreck images still finish before that request resolves. Selected and full
requests share the existing promise/image cache. The hyperbolic flight study
uses this to load only the chosen fighter's pair and guards asynchronous model
switches against stale completion before GPU upload and publication.

The inspection viewer enables faction paint by default. Picking a primary color enables paint immediately (including after restoring source paint), without resetting the orbit or zoom. Turning off faction paint still restores the original texture.

Paint brightness follows the chosen RGB color rather than being normalized to the original orange luminance, so dark liveries remain dark. Default flight liveries are forest green (#607451) and burnt orange (#bd713f); color inputs also suggest dark navy (#415d7d).

Flight lab hull contacts use `shipPackModels.hullHit`: a cached sphere bounds
check followed by a swept triangle query against a simulation-owned model ID
(including the training blockout). `training.trace` resolves the nearest terrain or hull
contact and uses that point for impact flashes and damage. Flight sessions assign
mixed-fleet collision model IDs by default. In normal flight, each frame samples
hull selections once and calls `training.configureHulls` before advancing or
rendering. That explicit simulation input assigns the same `craftModel` IDs used
by presentation to both teams and the player. Team selections are stored in
`combat.hullModels`, so new waves inherit them before firing. A changed mesh
clears old surface marks; unchanged IDs preserve marks and descriptors. Standalone training callers retain explicit sphere shapes. Watch and headless
duels call the same `configureHulls` API as normal flight for both participants.
Duel options `allyHull` and `enemyHull` resolve to canonical model IDs, included
in summaries, study links and version-4 replays. Hull changes restart watch
duels; the chase camera uses the actual player craft model. Versions 1 and 2
of duel replays are rejected because their collision rules differ. The worker
and CLI load and fingerprint the same vendored meshes and ship-pack code.
`training.hullHit` resolves a craft's JSON-safe `collision` descriptor using shared
mesh geometry, without a presentation callback; unknown model IDs fail explicitly. Scorches are clipped surface geometry baked once per hit in local ship
metres, rendered in five translucent soot layers, and transformed with the hull each frame.
Each craft retains at most 24 burns. Wrecks inherit them; round/restart lifecycle
and the existing wreck cap bound retention. Changing artwork hides marks from a
different model. These experimental cosmetic fields are not production saves.

Study actor batches may specify `opacity`; translucent batches blend over the
opaque hull with depth testing retained and depth writes disabled. Scorch layers
use this to preserve the underlying texture instead of covering it in solid black.

### Flight point-blank firing reference

The generic mount correction is a Driftworks playability rule, not an imported
FreeSpace rule. The older Icculus-derived [FreeSpace 2 firing source](https://github.com/ptitSeb/freespace2/blob/master/src/ship/ship.cpp#L4915-L4925)
transforms each model gunpoint into world space and creates the weapon with the
ship orientation. This is a port, not proof of every untouched retail behavior.
Modern [FreeSpace Open firing code](https://github.com/scp-fs2open/fs2open.github.com/blob/master/code/ship/ship.cpp#L12574-L12645)
uses model gunpoints and supports optional fixed, automatic and model-normal
convergence. Its automatic convergence has configurable minimum distances.
These paths do not establish a universal 4 m muzzle offset or the point-blank
retraction rule used here. Projectile billboard visibility is presentation only;
damage is determined by swept collision segments.

Primary gun counts in the flight lab come from retail POF GPNT bank records, imported offline by `tools/import-retail-flight.cjs` with `tools/retail-gun-mounts.cjs`. Profiles retain bank counts, totals and model hashes; no retail geometry is shipped. Manual, NPC and duel callers pass that count and `training.gunAnchors(craft)` to `flightGuns.step`. The latter resolves the same collision model used for visible artwork. `shipPackModels.gunAnchors` stores reviewed mesh-local muzzle centers (right X, forward Y, up Z), including asymmetric barrels. Because the assets lack named sockets, these attachments are authored from visible geometry. Each muzzle emits one unchanged bolt per volley; the interval is `weapon.fireWait * anchors.length / importedCount`, preserving nominal sustained DPS with smaller, faster volleys. Close-surface retraction and adaptive convergence apply to each muzzle. Legacy calls without anchors retain the old count/rack behavior; blockouts explicitly use two anchors. Energy and retail linked-bank behavior remain unmodeled. Replay schema 5 rejects earlier firing-rule recordings.

### Tether scale greyboxes

The flight lab accepts `?tether=100&start=hub` with spans 100, 50, 20, 10 or 2 km and hub/tip/overview starts. `flightPresentation.tetherGeometry(lengthKm)` emits cached static grey batches using mesh-builder, converted from metres to world units once. Presentation rotates them about a fixed hub 20 km above the asteroid origin using the flight elapsed-seconds clock (independent of combat) and `tetherSpin` angular speed. Flight composition owns the selector, reset pose and initial combat-off setting. These are unsaved visual scenery, with no collision or momentum exchange simulation; tactical worlds and propulsion rules are unchanged.

Operational spin assumes a symmetric hub at midspan: radius = span / 2, tip speed = sqrt(loadG * 9.80665 * radius), angular speed = tip speed / radius, and period = 2 pi / angular speed. The study defaults to 1 g tip acceleration, with 2 g and 3 g options (`spin=1g`, `spin=2g`, `spin=3g`). Old or invalid spin parameters fall back to 1 g. No material, taper, payload mass or safety-factor feasibility is calculated. Tether resets zero the local flight clock so tip starts align at phase zero; pausing freezes rotation. Rotation uses the real flight elapsed clock even with combat disabled.


## Shared ship module ownership

`src/ship-catalog.js` owns model selection and reviewed attachments;
`src/ship-hulls.js` owns renderer-independent hull queries and burn projection;
`src/ship-assets.js` owns browser image loading and catalog controls; and
`src/ship-render.js` owns draw geometry and immutable buffer caches.
`experiments/ship-packs.js` retains the `DW.shipPackModels` compatibility facade.
The separation preserves source mesh coordinates, material data, attachment
positions and the existing baked hull indices. See [flight architecture](flight-architecture.md)
for capital simulation/visual ownership and load-order contracts.
