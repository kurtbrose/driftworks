(function (root) {
  'use strict';
  // Inertial coordinates, metres/seconds. Drum axis is X. No fictitious gravity.
  const radius = 16, halfLength = 30;
  function create(x = 0, angle = -Math.PI / 2, omega = 2 * Math.PI / 38) {
    const y = radius * Math.cos(angle), z = radius * Math.sin(angle);
    return {p: [x, y, z], v: [0, -omega * z, omega * y], grounded: true, impact: 0};
  }
  function step(body, dt, omega, axial = 0, around = 0, jump = false) {
    const p = body.p, v = body.v;
    let r = Math.hypot(p[1], p[2]), ny = p[1] / r, nz = p[2] / r;
    if (body.grounded) {
      // Friction/muscular acceleration acts only while touching the rotating wall.
      const tangent = -nz * v[1] + ny * v[2];
      const change = Math.max(-18 * dt, Math.min(18 * dt, omega * radius + around - tangent));
      v[1] -= nz * change; v[2] += ny * change;
      v[0] += Math.max(-18 * dt, Math.min(18 * dt, axial - v[0]));
      if (jump) { v[1] -= ny * 4; v[2] -= nz * 4; body.grounded = false; }
    }
    for (let i = 0; i < 3; i++) p[i] += v[i] * dt;
    r = Math.hypot(p[1], p[2]); ny = p[1] / r; nz = p[2] / r;
    body.grounded = false; body.impact = 0;
    if (r >= radius) {
      const outward = v[1] * ny + v[2] * nz;
      body.impact = Math.max(0, outward);
      p[1] = ny * radius; p[2] = nz * radius;
      if (outward > 0) { v[1] -= ny * outward; v[2] -= nz * outward; }
      body.grounded = true;
    }
    if (Math.abs(p[0]) > halfLength) {
      p[0] = Math.sign(p[0]) * halfLength;
      if (p[0] * v[0] > 0) v[0] *= -.15;
    }
  }
  const api = {radius, halfLength, create, step};
  if (typeof module !== 'undefined') module.exports = api;
  else (root.Driftworks = root.Driftworks || {}).habPhysics = api;
})(typeof window === 'undefined' ? globalThis : window);
