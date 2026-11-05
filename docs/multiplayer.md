# Multiplayer flight experiment

Open `experiments/multiplayer.html` (it redirects to `flight.html?multiplayer=1`).
This uses the production 3D scene, fighter models, keyboard/controller/mouse
controls, flight physics, terrain and gun effects. Each browser owns its local
pilot and sends validated pose/loadout/trigger snapshots to its wingmate. Both
pilots start facing each other, 90 metres apart, above the same asteroid.

## Connect

1. Host chooses **Create host offer** in the Multiplayer panel and sends the
   generated text to the guest.
2. Guest chooses **Join as guest**, pastes the offer and applies it. The guest
   sends their generated answer back to the host.
3. Host pastes and applies the answer. Both pilots choose Start / resume flight.
   The panel collapses when connected; Esc returns to the normal game controls.

Flight remains available before connection, after disconnect, and after failed
attempts. Disconnect / retry closes the peer and resets the connection controls
without reloading the game. Starting a new connection repositions the local
pilot at their role's start. Normal sortie reset preserves that role.

The data channel uses manual WebRTC SDP exchange. No external service is contacted
by default. An empty ICE server list supports direct connections only. A successful
same-machine connection does not establish cross-device or internet connectivity.
Routers, firewalls, browser address masking and browser policies may block direct
connections. Both pilots can provide their own ICE server JSON array under
Network options: STUN can discover routes; TURN can relay when direct routes are
blocked. TURN credentials stay in the tab and are not persisted or sent to the
other pilot by this code. Connection text contains network information; send it
only to the intended peer. Clipboard failure selects the text for manual copying.

After the host applies an answer, connection establishment has a 20-second
limit. The guest has a 60-second limit to allow answer exchange. Failure closes
the peer and restores the Host/Guest buttons with a route/retry explanation.
Candidate gathering has a separate 10-second limit. Existing sessions expire
following five seconds without valid peer updates. Network heartbeats use wall
time while the local simulation is paused; stale trigger input is released after
300 ms. Browser background suspension can still interrupt a session.

## Ownership and limits

`multiplayer-model.js` validates versioned packets, finite bounded vectors,
orthonormal attitude bases, loadout indices and increasing sequence numbers.
Only known pose fields enter the session. `multiplayer-flight.js` owns browser
resources, connection deadlines, UI and packet exchange (up to 20 Hz with buffer
limits, unordered delivery and no retransmission). `flight-session.js` exposes
`prepareMultiplayer(guest)` and `setRemotePilot(pilot|null)` to configure co-flight
and observe the other pilot through ordinary craft rendering and gun effects.
The guest follows the host's asteroid rotation.

This is two-player co-flight in the actual game. Shared damage, missions, NPC
simulation, ship-to-ship collision, authoritative combat, prediction, interpolation,
host migration and matchmaking are not implemented. Peers are trusted; local
movement is not cheat checked. A remote craft cannot damage the local pilot.
Local pause pauses local physics; the other pilot may continue flying and their
pose continues to update. Existing single-player saves are unaffected.

## Verification

`node tests/multiplayer.cjs` exercises real headless sessions, independent local
flight, remote craft/weapon observation, disconnect/reset, packet validation and
sequence rejection. `node tests/headless.cjs` checks existing session behavior.

With the site served on port 8000 and optional Playwright installed, run
`node tools/check-multiplayer-browser.cjs` (set `DRIFTWORKS_BROWSER_MODULES` to the
development package directory if needed). It exchanges real offers/answers in
two Chrome tabs, checks production ship poses and keyboard movement, captures
both views, disconnects, and simulates a blocked connection to verify timeout
recovery and continued flight. Evidence is ignored under `output/multiplayer-flight/`.
Cross-device and cross-network connectivity require separate verification.

Verified 2026-11-04: model/session regressions, existing headless session checks,
module-boundary checks, strict application types and manifest tests passed.
The two-tab Chrome probe passed movement in both directions, real gun firing,
disconnect recovery and a forced blocked-route timeout followed by keyboard
flight. No page errors or external resource requests were recorded. Both
connected screenshots and the timeout screenshot were visually inspected.
