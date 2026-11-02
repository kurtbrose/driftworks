(function (scope) {
  'use strict';
  function fresh() { return {version:1, edits:{}, contexts:{}, plots:{}, characters:[], scenes:[], lines:[], takes:[]}; }
  function text(catalog, state, id) { return Object.hasOwn(state.edits,id) ? state.edits[id].text : catalog.lines.concat(state.lines).find(line => line.id === id).text; }
  function edit(catalog, state, id, value, direction) {
    const line = catalog.lines.concat(state.lines).find(item => item.id === id);
    const previous = state.edits[id];
    state.edits[id] = {text:value, direction, original:previous ? previous.original : line.text, sourceHash:previous ? previous.sourceHash : line.source?.hash || null};
  }
  function stale(take, current) { return take.text !== current; }
  function revision(catalog,state) {
    return {version:1, exportedAt:new Date().toISOString(), edits:Object.entries(state.edits).filter(([id,e]) => catalog.lines.some(l => l.id === id && l.source) && e.text !== e.original).map(([id,e]) => ({id,...e})), workshop: {contexts:state.contexts,plots:state.plots,characters:state.characters,scenes:state.scenes,lines:state.lines,directions:state.edits}};
  }
  function validate(state) {
    if (!state || state.version !== 1) throw Error('Unsupported session version');
    for (const key of ['edits','contexts','plots']) if (!state[key] || typeof state[key] !== 'object' || Array.isArray(state[key])) throw Error('Invalid ' + key);
    for (const key of ['characters','scenes','lines','takes']) if (!Array.isArray(state[key])) throw Error('Invalid ' + key);
    const ids = new Set();
    for (const row of [...state.characters,...state.scenes,...state.lines,...state.takes]) { if (!row || typeof row.id !== 'string' || ids.has(row.id)) throw Error('Invalid or duplicate ID'); ids.add(row.id); }
    for (const row of state.characters) if (typeof row.name !== 'string') throw Error('Invalid character');
    for (const row of state.scenes) if (typeof row.title !== 'string' || typeof row.mission !== 'string' || typeof row.context !== 'string') throw Error('Invalid scene');
    for (const row of state.lines) if (typeof row.text !== 'string' || typeof row.character !== 'string' || typeof row.scene !== 'string') throw Error('Invalid line');
    for (const row of state.takes) if (typeof row.line !== 'string' || typeof row.text !== 'string' || typeof row.chosen !== 'boolean' || !(row.blob instanceof Blob) || !Number.isFinite(row.duration)) throw Error('Invalid take');
    for (const entry of Object.values(state.edits)) if (!entry || typeof entry.text !== 'string' || typeof entry.direction !== 'string' || typeof entry.original !== 'string' || !(entry.sourceHash === null || typeof entry.sourceHash === 'string')) throw Error('Invalid edit');
    for (const value of [...Object.values(state.contexts),...Object.values(state.plots)]) if (typeof value !== 'string') throw Error('Invalid note');
    return state;
  }
  const api = {fresh,text,edit,stale,revision,validate};
  if (typeof module !== 'undefined') module.exports = api;
  else scope.MissionWorkshopModel = api;
}(typeof window !== 'undefined' ? window : globalThis));
