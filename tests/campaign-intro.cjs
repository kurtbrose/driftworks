'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync(require('node:path').join(__dirname, '../experiments/campaign-intro.html'), 'utf8');
const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1];
function boot(saved, unavailable = false) {
  const nodes = {};
  const storage = { value: saved };
  const document = { querySelector(id) {
    return nodes[id] ||= { value: '', hidden: id === '#confirmation', handlers: {},
      addEventListener(type, handler) { this.handlers[type] = handler; },
      setCustomValidity(message) { this.error = message; },
      reportValidity() { return !nodes['#recruit-name'].error && !nodes['#recruit-callsign'].error; },
      focus() { this.focused = true; }
    };
  } };
  vm.runInNewContext(script, { document, localStorage: {
    getItem() { return storage.value; },
    setItem(key, value) { if (unavailable) throw Error('unavailable'); storage.value = value; }
  } });
  return { nodes, storage, submit() { nodes['#enlistment'].handlers.submit({ preventDefault() {} }); } };
}
const app = boot('invalid JSON');
app.nodes['#recruit-name'].value = '  Alex Morgan  ';
app.nodes['#recruit-callsign'].value = ' Rook ';
app.nodes['#enlistment'].handlers.input();
assert.equal(app.nodes['#preview-name'].textContent, 'Alex Morgan');
app.submit();
assert.deepEqual(JSON.parse(app.storage.value), { name: 'Alex Morgan', callsign: 'Rook' });
assert.equal(app.nodes['#confirmation'].hidden, false);
app.nodes['#edit-record'].handlers.click();
assert.equal(app.nodes['#enlistment'].hidden, false);
const restored = boot(app.storage.value);
assert.equal(restored.nodes['#recruit-callsign'].value, 'Rook');
restored.nodes['#recruit-name'].value = '   ';
restored.submit();
assert.equal(restored.nodes['#confirmation'].hidden, true);
const blocked = boot(app.storage.value, true);
blocked.submit();
assert.match(blocked.nodes['#welcome-copy'].textContent, /could not save/);
console.log('Campaign enlistment: preview, validation, persistence, amendment and storage fallback passed.');
