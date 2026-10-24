(function () {
  'use strict';
  /** @typedef {import('./bolt-lab-types').V3} V3 */
  /** @type {import('./bolt-lab-types').BoltRangeModel} */
  const model = {
    basis(yaw, pitch, roll) {
      const c = Math.cos(yaw), s = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch), cr = Math.cos(roll), sr = Math.sin(roll);
      /** @type {V3} */ const right = [c, 0, -s];
      /** @type {V3} */ const up = [s * sp, cp, c * sp];
      return {right: [right[0] * cr + up[0] * sr, up[1] * sr, right[2] * cr + up[2] * sr],
        up: [up[0] * cr - right[0] * sr, up[1] * cr, up[2] * cr - right[2] * sr], back: [s * cp, -sp, c * cp]};
    },
    local(b, p) {return [b.right[0] * p[0] + b.up[0] * p[1] + b.back[0] * p[2], b.right[1] * p[0] + b.up[1] * p[1] + b.back[1] * p[2], b.right[2] * p[0] + b.up[2] * p[1] + b.back[2] * p[2]];},
    advance(shot, dt) {shot.age += dt; for (let axis = 0; axis < 3; axis++) shot.position[axis] += shot.velocity[axis] * dt;},
    bodyLength(speed, interval, diameter, frames) {
      return Math.max(diameter, speed * interval * frames);
    },
    crossing(distance, phase) {
      const angle = .48;
      return {position: [-distance * .9, Math.sin(phase) * distance * .12, -distance], direction: [Math.cos(angle), 0, Math.sin(angle)]};
    }
  };
  var DW = /** @type {import('../src/types').DriftworksNamespace} */ (window.Driftworks = window.Driftworks || {});
  DW.boltRangeModel = model;
})();
