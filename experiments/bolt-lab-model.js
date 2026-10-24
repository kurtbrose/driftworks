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
    projectedBody(position, velocity, eye, basis, length, diameter) {
      /** @param {V3} a @param {V3} b */
      const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
      /** @type {V3} */ const relative=[position[0]-eye[0],position[1]-eye[1],position[2]-eye[2]];
      const speed=Math.hypot(...velocity)||1,extension=Math.max(0,length-diameter);
      /** @type {V3} */ const head=[dot(relative,basis.right),dot(relative,basis.up),dot(relative,basis.back)];
      /** @type {V3} */ const tail=[head[0]-dot(velocity,basis.right)/speed*extension,head[1]-dot(velocity,basis.up)/speed*extension,head[2]-dot(velocity,basis.back)/speed*extension];
      // Clip the axial segment before dividing by depth, including near misses
      // that pass through or behind the eye.
      const near=-.51;
      if(head[2]>near&&tail[2]>near)return null;
      if(head[2]>near||tail[2]>near){
        const outside=head[2]>near?head:tail,inside=outside===head?tail:head;
        const t=(near-inside[2])/(outside[2]-inside[2]);
        outside[0]=inside[0]+(outside[0]-inside[0])*t;
        outside[1]=inside[1]+(outside[1]-inside[1])*t;outside[2]=near;
      }
      const depth=-(head[2]+tail[2])*.5;
      const hx=head[0]/-head[2],hy=head[1]/-head[2],tx=tail[0]/-tail[2],ty=tail[1]/-tail[2];
      return {center:[(hx+tx)*.5*depth,(hy+ty)*.5*depth,-depth],span:[(hx-tx)*depth,(hy-ty)*depth]};
    },
    crossing(distance, phase) {
      const angle = .48;
      return {position: [-distance * .9, Math.sin(phase) * distance * .12, -distance], direction: [Math.cos(angle), 0, Math.sin(angle)]};
    }
  };
  var DW = /** @type {import('../src/types').DriftworksNamespace} */ (window.Driftworks = window.Driftworks || {});
  DW.boltRangeModel = model;
})();
