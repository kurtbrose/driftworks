(function (global) {
  'use strict';
  /** @typedef {import('./types').PopulationState} PopulationState */
  /** @typedef {import('./types').PopulationEvent} PopulationEvent */
  /** @type {import('./types').DriftworksNamespace} */
  var namespace = global.Driftworks = global.Driftworks || {};
  var firstNames = ['Ada', 'Amir', 'Anika', 'Bo', 'Celia', 'Dara', 'Elias', 'Emi', 'Farah', 'Finn', 'Imani', 'Ivo', 'Jia', 'Jules', 'Kai', 'Leila', 'Luca', 'Mara', 'Nadia', 'Noor', 'Omar', 'Priya', 'Ravi', 'Ren', 'Sana', 'Tessa', 'Theo', 'Uma', 'Vera', 'Yara', 'Yun', 'Zuri'];
  var surnames = ['Adler', 'Alvarez', 'Basu', 'Chen', 'Costa', 'Diallo', 'Duarte', 'Evans', 'Farouk', 'Garcia', 'Haddad', 'Ito', 'Jensen', 'Khan', 'Kim', 'Kowalski', 'Laurent', 'Mensah', 'Moreau', 'Nguyen', 'Okafor', 'Ortiz', 'Park', 'Patel', 'Reyes', 'Sato', 'Shah', 'Singh', 'Tan', 'Varga', 'Wang', 'Yilmaz'];

  /** @param {number} [seed] @param {number} [total] @param {number} [civilianShare] @returns {PopulationState} */
  function create(seed, total, civilianShare) {
    total = total === undefined ? 10000 : total;
    civilianShare = civilianShare === undefined ? 0.7 : civilianShare;
    if (!Number.isSafeInteger(total) || total < 0 || !Number.isFinite(civilianShare) || civilianShare < 0 || civilianShare > 1) throw new Error('Invalid population configuration');
    return { version: 1, seed: (seed || 1) >>> 0, total: total, civilianShare: civilianShare,
      operationalCapacity: Math.round(total * (1 - civilianShare)), nextPersonId: 1, lastEventId: 0, timeSeconds: 0, people: {} };
  }

  // Population owns these working records. The coordinator never includes them in World.
  /** @param {PopulationState} state @param {string} role @param {string} assignment @param {number} count @returns {string[]} */
  function assign(state, role, assignment, count) {
    if (!Number.isSafeInteger(count) || count < 0) throw new Error('Invalid crew size');
    var people = Object.values(state.people);
    var existing = people.filter(function (p) { return p.alive && p.role === role && p.assignment === assignment; });
    var available = people.filter(function (p) { return p.alive && p.role === role && p.assignment === null && p.location === 'home'; })
      .sort(function (a, b) { return Number(b.preferredAssignment === assignment) - Number(a.preferredAssignment === assignment) || a.id.localeCompare(b.id); });
    var needed = Math.max(0, count - existing.length);
    if (available.length + state.operationalCapacity - people.length < needed) return [];
    var selected = existing.slice(0, count);
    while (selected.length < count) {
      var person = available.shift();
      if (!person) {
        var n = state.nextPersonId++;
        var hash = Math.imul(state.seed ^ n, 2654435761) >>> 0;
        var id = 'person-' + n;
        // Operational residents are drawn from the established settlement. Give
        // each a seeded arrival date within the preceding 2–30 years.
        var tenureSeconds = (2 + ((hash >>> 20) % 29)) * 365.25 * 86400;
        person = { id: id, name: firstNames[hash % firstNames.length] + ' ' + surnames[(hash >>> 12) % surnames.length],
          role: role, joinedSeconds: state.timeSeconds - tenureSeconds, alive: true, location: 'home', assignment: null,
          preferredAssignment: null, dutyStartedSeconds: null, dutySeconds: 0, overtimeSeconds: 0, history: [] };
        state.people[id] = person;
      }
      person.assignment = assignment;
      person.preferredAssignment = assignment;
      selected.push(person);
    }
    return selected.map(function (p) { return p.id; });
  }

  /** @param {PopulationState} state @param {number} seconds */
  function advanceTo(state, seconds) {
    if (!Number.isFinite(seconds) || seconds < state.timeSeconds) throw new Error('Population time cannot run backwards');
    state.timeSeconds = seconds;
  }

  /** @param {PopulationState} state @param {PopulationEvent[]} events */
  function consume(state, events) {
    events.forEach(function (event) {
      if (event.id <= state.lastEventId) return;
      if (event.id !== state.lastEventId + 1) throw new Error('Population event sequence gap');
      var person = state.people[event.personId];
      if (!person) throw new Error('Unknown person ' + event.personId);
      advanceTo(state, Math.max(state.timeSeconds, event.atSeconds));
      if (person.alive) {
        if (event.kind === 'deployment' && person.dutyStartedSeconds === null) person.dutyStartedSeconds = event.atSeconds;
        if (event.kind === 'duty-completed' || event.kind === 'death') {
          if (person.dutyStartedSeconds !== null) {
            var duty = Math.max(0, event.atSeconds - person.dutyStartedSeconds);
            person.dutySeconds += duty;
            person.overtimeSeconds += Math.max(0, duty - 8 * 3600);
            person.dutyStartedSeconds = null;
          }
        }
        person.location = event.location;
        person.assignment = event.assignment;
        if (event.kind === 'death') { person.alive = false; person.assignment = null; state.total -= 1; }
        person.history.push(Object.assign({}, event));
      }
      state.lastEventId = event.id;
    });
  }
  /** @param {PopulationState} state */
  function serialize(state) { return JSON.stringify(state); }
  /** @param {string} text @returns {PopulationState} */
  function deserialize(text) {
    var state = /** @type {PopulationState} */ (JSON.parse(text));
    if (!state || state.version !== 1 || !state.people || !Number.isFinite(state.timeSeconds)) throw new Error('Unsupported population save');
    return state;
  }
  namespace.population = { create: create, assign: assign, advanceTo: advanceTo, consume: consume, serialize: serialize, deserialize: deserialize };
})(window);
