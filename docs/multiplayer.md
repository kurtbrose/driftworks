# Multiplayer flight

## Server console and client tabs

Open `experiments/multiplayer.html` (redirects to `multiplayer-server.html`).

1. Pick a **Level**, then choose **Start server**. Keep this console tab open.
2. Choose **Open flight client** to join yourself in a separate tab. Choose
   **Start flight** in that client to fly. The console does not occupy a seat.
3. Open the **local join link** in another tab of the same browser profile and
   site origin to join a second pilot, without connection-text exchange.

Available co-flight locations are Asteroid range, Jade weather, Rime approach,
Planet backdrop and Orbital planet. The selected level is fixed while running;
stop the server to choose another. Both local and remote invitation links carry
the mission ID, and the room rejects clients loading a different level. Preparing
co-flight retains that mission's scenery/empty-space rules while disabling NPC
combat. Scripted battles and wormhole missions are not offered because their
simulation/crossings are not synchronized by this protocol.

The console displays the two-seat roster, pilot IDs/names, connection type,
last-heard age, accepted/rejected update counts, and join/disconnect activity.
**Kick** removes a pilot and prevents that client tab's ID from rejoining the
same server. This is a trusted-peer operator control, not authentication: opening
a new client creates a new ID. **Stop server** disconnects everyone. Neither
action stops local flight. A new server gets a new ID and new join links.

Local tab transport uses `BroadcastChannel`; all tabs must use the same browser
profile, storage partition and origin (including port). It does not connect
different computers, different browser profiles, or `localhost` to `127.0.0.1`.
An unanswered local join fails after five seconds with retry guidance. The local
HTTP server serves files; the console tab owns multiplayer membership and relay.

For another computer, expand **Invite someone on another computer**. Enter the
client page address your wingmate can reach (a deployed HTTPS site, or an address
on your LAN where browser WebRTC/security requirements are satisfied). A localhost
address points at the recipient's own computer. Optionally configure ICE servers,
then choose **Create remote invitation**. Send the generated private link; the
guest opens it and sends their answer text back. Paste that answer into the
console and choose **Apply answer**. The invite expires after two minutes;
connection establishment after applying the answer has a 20-second limit.

There is no signaling backend, so remote link sharing still requires this one
answer exchange. The invitation carries the offer and optional ICE configuration
in its URL fragment, including TURN credentials if configured. Share privately;
the client removes the fragment from the address after reading it. Credentials
are not persisted by application code. Candidate gathering has a 10-second limit.
No STUN/TURN or other external service is used by default. Direct connectivity
across machines/networks still requires separate verification.

`multiplayer-room.js` owns bounded membership, stable spawn slots, packet
validation/sequence rejection and forwarding. The console has no flight renderer
or authoritative simulation. Clients retain their own physics and send validated
pose/loadout/trigger updates at up to 20 Hz; the server forwards the other pilot's
state. Both local and WebRTC clients use this same room protocol. A server tick
and client heartbeats run every 500 ms; eight seconds without valid activity
expires a connection. Trigger flags expire 300 ms after the last valid pose,
even if heartbeats continue. Clients reject reordered server frames. Background
tab suspension can interrupt a session; keep the server tab running.

This uses the production 3D scene, fighter models, keyboard/controller/mouse
controls, flight physics, terrain and gun effects. Each browser owns its local
pilot and sends validated pose/loadout/trigger snapshots to its wingmate. Both
pilots start facing each other, 90 metres apart, above the same asteroid.

## Original manual peer experiment

The earlier peer-to-peer path remains at `flight.html?multiplayer=1` without a
`server` parameter. It has no dedicated server console. Its connection flow is:

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

Verified 2026-11-13: the room/session regressions, existing headless session
checks and strict application types passed. The server browser probe passed
local joins, production movement/firing, capacity rejection, kick/retry rejection,
mixed local/WebRTC forwarding across separate browser contexts, server stop and
stale-link diagnosis. The roster, production client view, mixed-transport console
and stale-link screenshots were visually inspected. Cross-device and cross-network
connectivity remain unverified.

Level selection was additionally verified with Rime on 2026-11-13: local and
WebRTC links retained its mission ID, wrong-level clients were rejected, scenery
and disabled weapons were preserved, and stopping unlocked the selector. The
selected-level console and production Rime client screenshots were inspected.

`node tests/multiplayer-room.cjs` checks the server roster, two-seat capacity,
stable roles after departures, validated forwarding, sequence rejection, stale
triggers with continuing heartbeats, kick/rejoin rejection, expiry and shutdown.

`node tools/check-multiplayer-server-browser.cjs` uses the production scene and
controls on Rime. It checks level selection/locking, preserved empty-space scenery,
wrong-level rejection, movement, the quiet level's disabled weapons, capacity
rejection, kicks, and server stop. It also connects a client in a separate
browser context through a real WebRTC invitation/answer and checks movement
through the mixed local/WebRTC server. Evidence goes under
`output/multiplayer-server/`. Same-machine browser checks do not prove connectivity
between physical devices or across networks.

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
