# Hyperbolic flight experiment

Open `experiments/hyperbolic.html`. This standalone Canvas experiment models a
two-dimensional hyperbolic plane, not the existing three-dimensional flight
session. Twelve fighters battle in two teams; the white fighter starts on
autopilot. Take control, steer with A/D, adjust speed with W/S and fire with
Space. Tab selects the next hostile marker, P pauses and R restarts. Fighters
respawn after three seconds. Curvature changes restart the same initial layout.
Contacts beyond 2.5 km are replaced by full-health reinforcements 1.1 km from
the player. This keeps a finite battle nearby and bounds numerical coordinates
during sustained escape; it is a roster rule, not an edge of hyperbolic space.

Positions use the unit Lorentz hyperboloid with inner product
`-a[0]*b[0] + a[1]*b[1] + a[2]*b[2]`. Physical distances are
`R * acosh(-dot(p,q))`, with Gaussian curvature `-1/R²`. Geodesic motion uses
`cosh(s/R)*p + sinh(s/R)*forward`; the frame is parallel transported with it.
Turning rotates the orthonormal tangent frame. Gunfire follows those same
geodesics, with swept segment hits against 22 m fighter hit radii. Simulation
runs at 120 Hz; fighter motion during each projectile interval is approximated
by its final position. Allies do not damage one another.

Each tick rebases all positions, tangent frames and trails into the player's
Lorentz frame to keep coordinates small. The main view is a player-centered
Poincaré disk; radar instead uses intrinsic distance and local bearing with a
linear 2 km radius. Fighter glyphs are deliberately schematic, constant screen
size. The main view displays equal-distance rings and two initially parallel,
200 m offset geodesics. Their divergence strengthens as R decreases. The
100 km option is nearly flat, not exactly Euclidean. No obstacles, sound,
relativistic time effects, or three-dimensional flight are modeled.

Math reference: [Nickel & Kiela, Lorentz model and exponential map](https://proceedings.mlr.press/v80/nickel18a/nickel18a.pdf).
The pure simulation API is `window.Driftworks.hyperbolic`; `create` returns
experiment state and `step` mutates it in place. This is separate from the RTS
world replacement API and does not create or alter saves. Run
`node tests/hyperbolic.cjs` for geometry and two-minute battle regressions.
