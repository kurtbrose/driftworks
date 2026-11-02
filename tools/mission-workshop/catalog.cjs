'use strict';
// Authoring helper only. The workshop itself serves as ordinary static files.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const digest = text => crypto.createHash('sha256').update(text.replace(/\r\n/g, '\n')).digest('hex');
function literal(source, start) {
  const quote = source[start];
  if (quote !== '"' && quote !== "'") throw Error('Expected string');
  let end = start + 1;
  while (end < source.length) {
    if (source[end] === '\\') { end += 2; continue; }
    if (source[end++] === quote) return {start, end, text: vm.runInNewContext(source.slice(start, end), {}, {timeout: 100})};
  }
  throw Error('Unclosed string');
}
function array(source, name) {
  const match = new RegExp('\\b(?:var|const|let)\\s+' + name + '\\s*=\\s*\\[').exec(source);
  if (!match) throw Error('Missing array: ' + name);
  const start = match.index + match[0].length - 1;
  let depth = 0;
  for (let i = start; i < source.length; i++) {
    if (source[i] === '"' || source[i] === "'") { i = literal(source, i).end - 1; continue; }
    if (source[i] === '[') depth++;
    if (source[i] === ']' && --depth === 0) {
      const raw = source.slice(start, i + 1), strings = [];
      for (let j = start; j <= i; j++) if (source[j] === '"' || source[j] === "'") {
        const entry = literal(source, j); strings.push(entry); j = entry.end - 1;
      }
      return {value: vm.runInNewContext('(' + raw + ')', {}, {timeout: 100}), strings};
    }
  }
  throw Error('Unclosed array: ' + name);
}
function build(base = root) {
  const project = {version: 1, characters: [], missions: [], scenes: [], lines: [], dynamic: []};
  const sources = {};
  function source(file) { return sources[file] ||= fs.readFileSync(path.join(base, file), 'utf8').replace(/\r\n/g, '\n'); }
  function character(id, name) {
    const existing = project.characters.find(c => c.id === id);
    if (existing && existing.name !== name) existing.name += ' · ' + name;
    else if (!existing) project.characters.push({id, name});
    return id;
  }
  function scene(id, mission, title, context) { project.scenes.push({id, mission, title, context}); return id; }
  function line(id, sceneId, speaker, entry, file) {
    if (!entry) throw Error('Missing source string: ' + id);
    project.lines.push({id, scene: sceneId, character: speaker, text: entry.text, direction: '', source: {file, start: entry.start, end: entry.end, line: source(file).slice(0, entry.start).split('\n').length, hash: digest(source(file))}});
  }
  const evacFile = 'experiments/evacuation-mission.js', evac = source(evacFile);
  const names = array(evac, 'names').value;
  const ids = ['actual', 'finch', 'jo-mercer', 'defense-control', 'elena-park', 'daniel-okafor'];
  names.forEach((name, i) => character(ids[i], name + (i === 2 ? ' / Jo Mercer' : i === 4 ? ' / Elena Park' : i === 5 ? ' / Daniel Okafor' : '')));
  project.missions.push({id: 'evacuation', title: 'Evacuation / fuel depot', context: 'Cycle A only. Cover refueling, defend the depot, clear Shuttle Six, then hold for Eight. Later catastrophe beats are not authored.'});
  const titles = ['Cover fuel operations', 'Demolition charges', 'Incoming contacts', 'Fuel transfer complete', 'Divert Shuttle Eight', 'Departure clearance', 'Hold for Eight'];
  const gates = ['Opening exchange at the depot.', 'After the opening; charges remain safed.', 'Contact warning; four raiders activate after this exchange.', 'Requires 120 elapsed seconds, no hostiles and five quiet seconds.', 'Station Four suspends service; Eight is diverted.', 'Six receives departure clearance.', 'Requires completed departure, no hostiles and five quiet seconds.'];
  const scenes = array(evac, 'scenes'); let cursor = 0;
  scenes.value.forEach((rows, i) => {
    const sid = scene('evacuation-scene-' + i, 'evacuation', titles[i], gates[i]);
    rows.forEach((row, j) => line(sid + '-line-' + j, sid, ids[row[0]], scenes.strings[cursor++], evacFile));
  });
  const convoyFile = 'src/convoy-mission.js', convoy = source(convoyFile), packets = array(convoy, 'packets').value;
  packets.forEach(p => character(p.id, p.ship + ' / Captain ' + p.pilot));
  character('convoy-control-rook', 'CONTROL / Rook'); character('lancer-flight', 'Lancer wingman / runtime-selected');
  project.missions.push({id: 'convoy', title: 'Convoy escort', context: 'Thirty freighters, five cargo packets, Lancer escort. Arrival exchange, interrupted quiet conversations, combat calls and condition-dependent reports.'});
  const opening = scene('convoy-opening', 'convoy', 'Rendezvous', 'Quiet opening, before combat or weapons-range reports. A surviving wingman must see the convoy before Wayfarer replies.');
  const radio = scene('convoy-radio', 'convoy', 'Control / situational calls', 'Conditional calls, not one chronological conversation. See source for exact gates.');
  const distress = scene('convoy-distress', 'convoy', 'Cargo distress', 'Each packet lead speaks when cargo takes damage and the lead survives.');
  const calls = /\b(cue|fighterCue)\(\s*/g; let m;
  while ((m = calls.exec(convoy))) {
    if (!['"', "'"].includes(convoy[calls.lastIndex])) continue;
    const key = literal(convoy, calls.lastIndex); let pos = key.end;
    // A computed cue key may concatenate IDs before the comma.
    const comma = convoy.indexOf(',', pos); if (comma < 0) continue;
    pos = comma + 1; while (/\s/.test(convoy[pos])) pos++;
    if (!['"', "'"].includes(convoy[pos])) continue;
    const entry = literal(convoy, pos); let after = entry.end; while (/\s/.test(convoy[after])) after++;
    if (![',', ')'].includes(convoy[after])) continue; // dynamic templates are inventoried below
    const id = 'convoy-cue-' + key.text;
    if (project.lines.some(l => l.id === id)) continue;
    const speaker = m[1] === 'fighterCue' ? 'lancer-flight' : key.text === 'welcome' ? packets[0].id : 'convoy-control-rook';
    line(id, ['intro-control', 'visual-reply', 'welcome'].includes(key.text) ? opening : radio, speaker, entry, convoyFile);
  }
  array(convoy, 'distress').strings.forEach((entry, i) => line('convoy-distress-' + i, distress, packets[i].id, entry, convoyFile));
  const chats = array(convoy, 'conversations'); cursor = 0;
  chats.value.forEach((chat, i) => {
    const sid = scene('convoy-chat-' + i, 'convoy', ['Breakfast all shift', 'That rattle', 'Routine delivery'][i], 'Quiet cruise only. Skipped if a speaker is lost; combat can interrupt the exchange.');
    chat.lines.forEach((text, j) => line(sid + '-line-' + j, sid, packets[chat.speakers[j]].id, chats.strings[cursor++], convoyFile));
  });
  convoy.split('\n').forEach((text, i) => {
    if (/return (?:cue|fighterCue)\(/.test(text) && !project.lines.some(l => l.source.file === convoyFile && l.source.line === i + 1)) project.dynamic.push({file: convoyFile, line: i + 1, expression: text.trim()});
  });
  project.missions.push({id: 'generic', title: 'Generic chatter', context: 'New workshop lines. No runtime generic chatter has been imported in this first pass.'});
  scene('generic-drafts', 'generic', 'Chatter drafts', 'Write reusable acknowledgments, warnings or exchanges here. Exported drafts need runtime integration.');
  return project;
}
function apply(revision, base = root) {
  if (revision.version !== 1 || !Array.isArray(revision.edits)) throw Error('Invalid revision format');
  const catalog = build(base), changes = new Map(), seen = new Set();
  for (const edit of revision.edits) {
    if (seen.has(edit.id)) throw Error('Duplicate edit: ' + edit.id); seen.add(edit.id);
    const original = catalog.lines.find(l => l.id === edit.id);
    if (!original || edit.original !== original.text || edit.sourceHash !== original.source.hash) throw Error('Source conflict for ' + edit.id + '; refresh and reconcile before applying');
    if (typeof edit.text !== 'string' || !edit.text.trim()) throw Error('Empty or invalid line: ' + edit.id);
    const file = original.source.file;
    if (!changes.has(file)) changes.set(file, []);
    changes.get(file).push({...original.source, text: edit.text});
  }
  // Validate every edit before touching any source file.
  for (const [file, edits] of changes) {
    let text = fs.readFileSync(path.join(base, file), 'utf8').replace(/\r\n/g, '\n');
    for (const edit of edits.sort((a, b) => b.start - a.start)) text = text.slice(0, edit.start) + JSON.stringify(edit.text) + text.slice(edit.end);
    fs.writeFileSync(path.join(base, file), text);
  }
  return [...changes.keys()];
}
function render(catalog) { return '/* Generated by node tools/mission-workshop/catalog.cjs. */\nwindow.MissionWorkshopCatalog = ' + JSON.stringify(catalog, null, 2) + ';\n'; }
if (require.main === module) {
  const args = process.argv.slice(2), output = path.join(__dirname, 'catalog.js');
  if (args[0] === '--apply') {
    if (!args[1]) throw Error('Usage: catalog.cjs --apply revision.json');
    console.log('Updated: ' + apply(JSON.parse(fs.readFileSync(args[1], 'utf8'))).join(', '));
  }
  const text = render(build());
  if (args[0] === '--check') {
    if (!fs.existsSync(output) || fs.readFileSync(output, 'utf8') !== text) throw Error('Workshop catalog stale: run node tools/mission-workshop/catalog.cjs');
  } else fs.writeFileSync(output, text);
}
module.exports = {build, apply, render};
