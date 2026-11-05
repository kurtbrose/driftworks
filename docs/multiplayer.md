# Client-only multiplayer experiment

Open `experiments/multiplayer.html` from the static site. Choose **Create host
offer** in one browser and **Join as guest** in the other. Copy the host's
connection text into the guest's received-text box and apply it. Copy the guest's
answer back into the host and apply it. Once connected, click each arena to fly
with WASD or the arrow keys. Disconnect/reset starts a fresh session.

The page uses native WebRTC data channels with manual SDP exchange and an empty
ICE server list. No signaling backend, external library, STUN or TURN service is
required. Two local tabs are the easiest first test. Devices on the same LAN may
connect; firewall, browser address masking and NAT policy can prevent direct
connections. Different networks will often need STUN and possibly a TURN relay.
HTTPS or localhost is recommended; clipboard access depends on a secure context.
Connection text contains network information and should go only to the intended
peer. Reset clears the connection; nothing is saved.

The host owns both ships and advances a standalone arena at 30 ticks per second.
The guest sends bounded steering/thrust plus an increasing sequence number.
The host ignores old input packets and releases guest controls after 300 ms
without fresh input. Snapshots carry increasing ticks; the guest rejects older
snapshots. Both directions use an unordered channel without retransmission,
and drop outgoing updates when its buffer grows. The guest displays snapshot age
and marks a stalled host. Browser background throttling can pause/slow the host;
the experiment does not catch up missed ticks. Keep both windows visible to test
movement timing.

`experiments/multiplayer-model.js` owns the JSON-safe arena model and packet
validation; the HTML owns WebRTC, keyboard focus and canvas drawing. This is a
transport/control experiment, separate from production flight sessions. There is
no prediction, interpolation, combat, host migration, reconnect, matchmaking,
authentication or cheat resistance. The host is trusted. The next integration
decision is which production mode to share and how remote input maps onto its
craft lifecycle. Full simulation snapshots are not yet a stable network protocol.

Run `node tests/multiplayer.cjs` for the dependency-free model regression.
Browser acceptance requires exchanging a real offer and answer, moving both
ships, checking snapshot delivery and disconnecting. A local two-tab success does
not establish connectivity across different networks.

Initial verification (2026-11-04): the model regression and strict application
type check passed. A headless Chrome two-tab test exchanged real offers/answers,
moved both ships, received snapshots, rejected malformed connection text and
detected peer disconnect, with no page errors. The host screenshot was visually
inspected. Captures remain under ignored `output/multiplayer/`. Cross-device and
cross-network connectivity have not been verified.
