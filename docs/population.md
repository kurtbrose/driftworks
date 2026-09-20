# Population and operational crews

`population.js` owns an independent, versioned population state. `session.js`
coordinates it with tactical `World`; the app owns one mutable session. Tactical
commands and ticks still return replacement worlds. Population records never
enter `World`, `normalizeWorld`, or its JSON-cloning path. The population API
mutates its own working state only on assignments, events, and clock advances.

## Identity and time

Default population is 10,000 with a configurable 70% civilian background share.
The remaining operational capacity supplies named people on demand. Materializing
a person consumes an existing background resident, not a birth. People persist
after returning home or dying. Role-qualified available workers are reused before
new people are created; craft retain their assigned operators. Names come from
seeded local lists; IDs, not names, are unique. This slice does not simulate the
background residents individually, age them, or create relationships.

Population time is physical seconds: initial campaign days plus tactical seconds
times `PHYSICAL_SECONDS_PER_SECOND`, currently 60. Population receives elapsed time
in minute-sized batches and at event/save boundaries; it does not tick residents.
Platform deadlines use mission physical seconds. A shift lasts 28,800 physical
seconds (480 tactical seconds), matching the HUD clock. Pausing advances neither.
`session.advanceCampaign(session, days)` advances population and campaign time
only with the fleet recovered, no passengers aboard, and platforms stored.

Newly materialized operational residents are established settlement residents:
their seeded arrival dates fall 2–30 years before population time. This keeps
their tenure plausible and deterministic while leaving the background population
sparse. People store role, location, assignment, joining time, duty totals, overtime, and
service history. Duty starts when leaving home/boarding transport and ends at home,
so duty and overtime include travel. Platform shift duration starts on arrival.
An unavailable replacement leaves workers on duty and mining continues.

## Tactical boundary

Session `create`, `transition`, and `step` allocate crews before operations and
consume location changes before returning control. World stores `staffingEnabled`,
craft `crewIds`/`passengerIds`, and platform `workerIds`, `shiftStartedSeconds`, and
`evacuationRequested`. Only these small references participate in tactical clones.
Logistics returns `returnedPersonIds` for confirmed disembarkation at home; the
coordinator consumes and removes this transient list immediately.

Deployment, arrival, duty completion, recovery, and explicit death events carry
sequence IDs, person ID, mission ID, physical timestamp, location, and assignment.
Population ignores already-consumed IDs and rejects gaps. A coordinated checkpoint
stores the next event ID and last consumed ID. Events are consumed synchronously;
there is no renderer-owned delivery queue. Disabled fighters keep living pilots
aboard; repaired fighters generate recovery records. No new lethal combat rule is
introduced. Explicit death processing is available in `population.consume`.

## Shuttle logistics

One automatic shuttle has one pilot seat and five passenger seats. Each platform
shift has five workers. Linehorse brings the initial five on deployment and takes
the final crew home after packing; setup and packing last three physical hours.
The shuttle handles mid-mission replacements only. Dispatch priority is initial
staffing, then overdue replacement; platform ID breaks ties. Returning shuttles
refuel through normal docking.

Transfers require a surface rendezvous matching position and velocity. Incoming
workers disembark, then outgoing workers embark: platform occupancy is not capped
at five. The shuttle retains passengers through a fuel diversion or cancelled
delivery until it physically arrives home. Manual flight commands do not control it.

Manual platform retrieval marks an evacuation request, even if the tug is later
redirected. It remains latched until the platform is recovered. Workers remain on
the platform during packing and then board Linehorse. Home delivery takes three
physical minutes to unload the platform, ore, and passengers. Ending mining stops
extraction and waits for all platforms stored, packets caught, and crews unloaded.
Redeployment clears the previous evacuation request and resets setup/shift timers.

## Saves and replay

The existing local-storage key holds one atomic envelope with `sessionVersion: 1`,
the independently versioned tactical `world` and `population`, next event ID, and
campaign clock offset. `population.serialize/deserialize` also work independently.
Save/export/load/reset use the coordinator. Legacy tactical-only saves receive a
deterministic population, shuttle, craft crews, and a one-time initial workforce
for already deployed platforms. Repeated session loads never recreate identities.

Tactical serializers and old scenario fixtures continue to work without a
population. Worlds without `staffingEnabled` retain the historical extraction rule.
New gameplay captures include an optional coordinated `session` snapshot; scenario
replay uses it when present, preserving worker dispatch. Population-aware scenarios
use the normal combat state rather than external steering-only `threats` probes.

The HUD exposes population totals, platform staffing/deadlines, selected craft
crew/passengers, and individual service records. Select the mothership to inspect
workers stationed on platforms. Districts and city-building remain future work.
