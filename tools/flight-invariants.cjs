'use strict';

// Development-only checks on live session objects; no browser/runtime dependency.
function assertFlightInvariants(snapshot) {
  const fail = message => { throw new Error('Flight invariant: ' + message); };
  const finite = (value, label) => {
    if (!Number.isFinite(value)) fail(label + ' must be finite');
  };
  const vector = (value, label) => {
    if (!Array.isArray(value) || value.length !== 3) fail(label + ' must be a 3-vector');
    value.forEach(component => finite(component, label));
  };
  const {combat, state} = snapshot;
  finite(combat.time, 'combat.time');
  const ids = new Set();
  for (const craft of [combat.player, ...combat.enemies]) {
    if (typeof craft.id !== 'string' || !craft.id || ids.has(craft.id)) fail('duplicate or invalid craft ID: ' + craft.id);
    ids.add(craft.id);
    finite(craft.hp, craft.id + '.hp');
    for (const key of ['eye', 'right', 'up', 'back']) {
      vector(craft.pose[key], craft.id + '.pose.' + key);
    }
    vector(craft.pose.velocity, craft.id + '.pose.velocity');
  }
  for (const key of ['eye', 'right', 'up', 'back', 'velocity', 'rates']) {
    vector(state[key], 'state.' + key);
  }
}

module.exports = {assertFlightInvariants};
