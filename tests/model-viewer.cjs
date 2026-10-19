const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function element() {
  return {style: {}, children: [], attributes: {}, listeners: {},
    setAttribute(key, value) { this.attributes[key] = value; },
    addEventListener(key, fn) { this.listeners[key] = fn; },
    appendChild(child) { this.children.push(child); }, remove() { this.removed = true; }};
}
const DW = {};
vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname, '../src/model-viewer.js'), 'utf8'), {
  window: {Driftworks: DW}, document: {createElement: element}
});
const host = element(), viewer = DW.modelViewer.create(host);
const toolbar = host.children[0], button = toolbar.children[0];
const event = (buttons, button = -1, altKey = false) => ({buttons, button, altKey});
assert.equal(viewer.gesture(event(1), false), 'orbit');
button.onclick();
assert.equal(button.attributes['aria-pressed'], 'true');
assert.equal(viewer.gesture(event(1), false), 'pan');
assert.equal(viewer.gesture(event(3), false), 'orbit', 'adding the second button orbits immediately');
assert.equal(viewer.gesture(event(1), false), 'pan', 'releasing the second button resumes sliding');
assert.equal(viewer.gesture(event(1, 0, true), false), 'orbit');
button.onclick();
assert.equal(viewer.gesture(event(2, 2), false), 'pan');
assert.equal(viewer.gesture(event(4, 1), false), 'pan');
assert.equal(viewer.gesture(event(1), true), 'pan');
assert.equal(button.attributes['aria-pressed'], 'false');
const other = DW.modelViewer.create(element());
button.onclick();
assert.equal(other.gesture(event(1), false), 'orbit', 'viewports have independent modes');
viewer.dispose(); assert.equal(toolbar.removed, true);
console.log('PASS shared viewer modes, mouse chords, modifiers, independent viewports and cleanup');
