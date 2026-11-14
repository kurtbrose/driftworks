# Rotating habitat playground

Open `experiments/hab-drum.html`. This standalone FPS level prototype uses the
existing habitat's 72 × 34 m envelope and local Quaternius astronaut asset; it
does not yet connect to a flight-session boarding transition. The interior
pressure deck has radius 16 m and length 62 m. It does not replace the exterior
production habitat mesh.

`src/hab-physics.js` owns inertial SI positions and velocities. The rotating wall
transfers tangential speed through bounded contact acceleration. The curved deck
removes outward normal velocity at impact; axial end walls bounce with low
restitution. Jump applies a 4 m/s inward impulse. Airborne bodies have no forces
or steering; apparent centrifugal and Coriolis effects emerge in the rotating
view. Physics runs at 240 Hz with capped frame catch-up. Spin edits change wall
velocity, never rebase airborne crew velocity.

WASD walks, Shift runs, Space jumps, mouse looks, E calls nearby crew, R resets.
Escape releases the mouse and pauses. Camera up points toward the axis even
airborne: a comfort convention rather than suit attitude physics. Eight crew
patrol axially and contact the deck and end walls. No crew-to-crew collision,
full capsule collision, air drag, handheld weapons or combat encounter yet.
Suit radio uses the flight Mumble synthesis/transmission worker with subtitles
and no portrait display. Suits retain the supplied helmet artwork.

Run `node tests/hab-physics.cjs` for rotating contact, inertial flight, recontact,
zero rotation and end-wall impact regressions.
