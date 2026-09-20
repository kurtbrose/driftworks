# World state contract

This is the reference for simulation relationships and valid state transitions.
Constructors, order issuers, `normalizeWorld` and subsystem orchestration in
`src/sim.js`, with combat transitions in `src/combat.js`, implement it. Use those
APIs rather than assembling partial worlds.
Normalization fills historical defaults; it is not a validator for arbitrary
JSON or broken references.

## Root and units

World is a JSON-safe object, replaced by public simulation commands and ticks.
Positions/vectors are `{ x, y }`; angles are radians. Distance, velocity and
acceleration use world units and tactical seconds. Economy quantities are metric
tonnes; `physical` and `propulsion` use SI units. See
[physical units](../PHYSICAL_UNITS.md) for conversion constants.

| Fields | Meaning/owner |
| --- | --- |
| `version: 1`, `physicalUnitsVersion: 1`, `logisticsVersion: 2` | Independent world and migration markers. |
| `seed`, `elapsedSeconds`, `campaign` | Seeded initialization, tactical mission time, and `{ timeDays, money, location }`. Campaign time is not advanced by tactical ticks. The same seed reproduces initial asteroid spin and combat decisions. |
| `camera: { x, y, zoom }`, `selectedShipIds: string[]` | Saved presentation state; selection drives most command issuers. |
| `ships`, `asteroids`, `platforms`, `packets`, `wrecks` | Entity collections described below. |
| `formations`, `nextFormationId` | Object keyed by numeric group ID (JSON keys are strings), plus allocation counter. |
| `nextPacketId`, `nextWreckId` | Counters for numeric packet IDs and `wreck-N` string IDs. Preserve counters across loads. |
| `mothership.storage` | `{ ore, constructionMass, depotSections }`: raw ore, partial fabrication feedstock, ready section count. Separate from the mothership ship's position/hull. |
| `depot` | `{ name, position, builtStages, totalStages }`; stage values count sections, not tonnes. |
| `contract` | `{ id, name, quotaOre, reward }`; metadata/quota, not an automatic reward transaction. |
| `miningMission` | `active`, `recovering`, or `complete`. |
| `recovery` | `{ salvagedOre, repairedShips }`, cumulative counters also observed by visual feedback. |
| `combat` | Hostile entities, ID allocator, random state, director/weapon timers and last-tick events; see below. |

`stepWorld` explicitly constructs the next root object. A new root field must be
carried through there or it disappears on the next tick. Never put DOM/Pixi/audio
objects, functions, cyclic references, or non-JSON collections into world.

## Ships and orders

Current types are `mothership`, `tug` (Linehorse, the shared industrial carrier),
and `escort`. Stable string `id` identifies a ship; name is only a label.

- Motion: `position`, `previousPosition`, `velocity`, `previousVelocity`,
  `rotation`, `speed`, `acceleration`, `turnRate`. `speed` is a guidance limit;
  fuel exhaustion permits coasting. Previous fields support interpolation and
  effects. `acceleration` is recomputed from loaded mass; `burnMassKg` is working
  burn state that can also appear in saves, not independent hull metadata.
- Physical: `physical: { lengthM, dryMassKg, thrustN }`; mobile ships have
  `propulsion: { capacityKg, fuelKg, exhaustMps }`. Fuel stays within tank bounds.
- Load: `cargo`/`previousCargo` in tonnes, legacy `cargoCapacity` (currently zero),
  `carryingSection`, `platformId`, `towTarget`. A tug's module/hull attachment
  slot holds one section, platform, or recovered hull. Buffered platform ore
  becomes `cargo` on retrieval and contributes additional mass.
- Lifecycle: `docked`, `damage` in [0, 1], `disabled`, `towedBy`,
  `repairRemaining`, `launchElapsed` (`null` when not launching).

`order` is a tagged object. `target` is a world-space point, often refreshed by
guidance; it is not necessarily the durable identity of the destination.

| `kind` | Fields beyond `kind` and interpretation |
| --- | --- |
| `idle` | None required; idle does not imply docked or stationary. |
| `move` | `target`. Generic mobile-ship movement; normal fighter context clicks issue defense instead. |
| `return` | `target`; optional `automatic: true` for low-fuel diversion. Home position is refreshed. |
| `build` | `target`. `carryingSection` determines whether to collect stock at home or deliver to depot. |
| `deploy` | `asteroidId`, `platformId`, `siteAngle`, `siteDepth`, `target`. The order reserves deployment intent before a stored platform is physically picked up. |
| `retrieve-platform` | `platformId`, `target`. Platform retains asteroid/site identity; target tracks its rotating site. |
| `recover` | `recoveryTarget: { kind: 'wreck' \| 'ship', id }`, `target`. Approach intent; successful pickup establishes towing and switches to return. |
| `defend` | `anchor`, nullable `anchorShipId`, `groupId`, `leashRadius`, `offset`, `side`, `target`, `formation`. Anchor ship is resolved by ID with the saved point as fallback; target is the current steering point. |

Legacy `mine` orders may appear in migration code; they are not a current mining
command. `issueMineOrder` now assigns platform deployment through the selected
mothership and an available idle tug. Move/return can redirect a loaded tug
without dropping its payload. Command eligibility and lifecycle guards must be
preserved when introducing new orders.

## Formation ownership

Active, non-disabled ships with `defend` orders and formation snapshots determine
membership. `stepFormations` groups them by `order.groupId`, removes empty groups,
and refreshes `memberIds`. Do not edit only `formation.memberIds` to join or leave.

`world.formations[groupId]` holds shared `position`, `velocity`, `angle`,
`memberIds` and evolving `angularVelocity`, `pivoting`, `directTravel`,
`relocating`, `looseness` fields. Per-ship `order.offset` and `side` own slot
assignments. Each order also gets a cloned `formation` snapshot; the world entry
takes precedence, with the snapshot a fallback. Steps synchronize these copies.

Ordering an entire active wing reuses its group ID; ordering a subset creates a
new group. Disabled/reassigned members leave through their orders/lifecycle, and
survivors close ranks on the next formation step. Group caches can therefore be
temporarily stale immediately after a command. Slots are reassigned on membership
or pivot changes, rotated during turns, and need not be occupied exactly during
combat. Selection itself does not define membership.

## Platforms, ore and construction

Asteroids have `id`, `name`, `position`, `ore`, `oreInitial`, `radius`, `rotation`,
`angularVelocity`. Depletion changes accessible ore, not physical radius.

Platforms have `id`, `state`, nullable `carrierId`/`asteroidId`, `position`,
`siteAngle`, `siteDepth`, buffered `ore`, and `packetTimer`:

- `stored`: belongs to mothership storage, no carrier; position follows home.
- `carried`: `carrierId` resolves to a tug whose `platformId` points back.
  Position follows that tug. Docked + idle unloads the platform and clears both
  links; docking during deployment pickup must not immediately unload it.
- `deployed`: no carrier; `asteroidId` and asteroid-local site angle/depth define
  the attachment. Position is derived from asteroid rotation, not independently
  integrated. Site fields may remain after storage; interpret them by state.

Extraction transfers asteroid ore into the platform buffer. Launch transfers
that buffer into a packet `{ id, position, velocity, ore }`. Packets are persistent
ballistic entities, independent of their source platform, and disappear only on
catch with ore credited to storage. Catch uses swept relative motion plus the
shared velocity envelope. Retrieval transfers unsent ore to tug cargo exactly
once; returning unloads cargo to storage.

`endMining` enters `recovering`, cancels deployment orders into returns, and stops
extraction. Logistics assigns successive retrieval trips; in-flight packets
continue. Completion requires **all platforms stored and no packets remaining**,
not merely an empty asteroid. Starting a new mission requires reset/current code
changes; deployment is allowed only while `active`.

Construction transfers storage ore into `constructionMass`, then ready sections;
pickup decrements ready stock and sets `carryingSection`; installation clears it
and increments `builtStages`. Keep counts separate from mass and use
`DEPOT_SECTION` for mass/geometry. Physical mass includes fuel, cargo and attached
loads; mothership reporting also includes its storage and stored platforms.

## Recovery and entity references

References are IDs, not array indices or embedded entities. Wrecks carry `id`,
`position`, `rotation`, `massKg`, `salvageOre`, and nullable `towedBy`. Salvage yield
is distinct from tow mass. A recoverable ship is a disabled escort that is neither
repairing nor launching.

`stepRecovery` owns both ends of towing: hauler `towTarget: { kind, id }` and
payload `towedBy: hauler.id`. Pickup claims the payload; other haulers must not
claim it. A pending recovery order is not yet ownership. Payload pose follows
the hauler; a missing/mismatched payload clears the hauler reference. Preserve
reciprocity in any new removal or transfer path; normalization does not repair
every dangling relationship.

At home, wreck delivery credits salvage and removes the wreck. Fighter delivery
clears towing and starts six seconds of repair, then six seconds of launch.
`disabled` stays true through both phases; repair completion clears damage and
refills fuel, while launch completion clears disabled and increments the repair
counter. Damage reaching one clears the fighter's order and motion, leaving the
entity present for recovery. Do not equate zero damage with operational status.

## Combat ownership

`combat` contains `drones`, `nextDroneId`, `rngState`, `director`, `weaponTimers`
and `events`. It is initialized, normalized for old saves, and carried through
`stepWorld`'s explicit reconstruction. Old saves receive an idle director and
no hostiles; loading a current save never resets encounters or random state.

Drones have stable `drone-N` IDs; `targetId`/`targetKind` identify their approach
target. They own `position`, `previousPosition`, `velocity`, `speed`, `hp`,
`underFire`, `flash` and `fireCooldown`. `underFire` is accumulated laser dwell,
decaying by 0.35 per second and destroyed at 1.35 seconds of accumulated dwell.
`hp` retains the hull health field; current fighter weapons use dwell. Wrecks
use the separate world wreck-ID allocator. Debug wave spawning adds hostiles
without removing existing ones or counting toward the automatic wave limit.

The director owns `state`, warning `timer`, `cooldown` and `wavesSpawned`.
`rngState` is an unsigned 32-bit state, advanced explicitly with each seeded
random draw; no random closure or pointer is saved. `weaponTimers` is keyed by
friendly ship ID and throttles laser presentation pulses; dwell advances every
tick regardless of whether a pulse is emitted. Raider firing cooldowns affect
actual shots and live on each drone.

Movement precedes weapon selection. Damage resolves after all shots are chosen,
so simultaneous lethal fire is allowed. Disabled fighters remain for recovery;
destroyed drones are removed and become one salvage wreck each. All consequences
originate in simulation code, never rendering.

`events` contains the most recent tick's `contact-warning`, `wave-spawned`,
`weapon-fired`, `ship-damaged`, `ship-disabled` and `ship-destroyed` records, with
copied positions and source/target IDs where relevant. These JSON-safe diagnostic
records are included in snapshots but cleared before the next tick; they are
not a history or pending gameplay work. The app consumes events once immediately
after each step, never replays them on load, and uses them only for effects/audio.

## Persistence and compatibility

`serializeWorld` saves the entire world in `{ version: 1, savedAt, world }` under
`driftworks.save.v1`. Derived/previous fields in world are serialized too.
`deserializeWorld` checks envelope and world versions and normalizes; unsupported
versions throw. App loading catches errors and starts fresh. Reset creates and
saves a replacement mission, not just a new live view.

Normalization runs on load and every simulation step. It fills missing historical
fields, merges old asteroid sets, applies a one-time 18.75 mass conversion when
`physicalUnitsVersion` is absent, and migrates old miner/cargo hulls to logistics
version 2 while preserving their cargo ore. Repeated loads must not reapply unit
conversion. Existing physical hull values survive; missing ones receive defaults.

Saved: orders and pending work, formations, fuel, damage/repair, attachments,
platforms, packets, economy, elapsed time, camera, selection, hostile encounters,
director/RNG state and weapon timers. Not saved in world: effects, playback speed,
camera-focus animation, stress graphics or audio resources. Audio preferences
persist separately under `driftworks-audio-settings-v1`.
