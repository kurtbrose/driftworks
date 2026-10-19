const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function element() {
  return {style: {}, children: [], attributes: {}, listeners: {},
    setAttribute(key, value) { this.attributes[key] = value; },
    addEventListener(key, fn) { this.listeners[key] = fn; },
    removeEventListener(key, fn) { if(this.listeners[key]===fn)delete this.listeners[key]; },
    contains(node) { return node === this || this.children.some(child => child.contains(node)); },
    dispatchEvent(event) { if(this.listeners[event.type])this.listeners[event.type](event); },
    getBoundingClientRect() { return {left:0,top:0,width:800,height:600}; },
    setPointerCapture() {},
    appendChild(child) { this.children.push(child); }, remove() { this.removed = true; }};
}
const DW = {};
const callbacks = new Map(); let frameId = 0;
const windowEvents = element(), documentEvents = element();
function emit(target, name, values = {}) {
  const fn = target.listeners[name];
  if (fn) fn({target, preventDefault() {}, stopImmediatePropagation() {}, ...values});
}
function advance(now) { const pending = [...callbacks.values()]; callbacks.clear(); pending.forEach(fn => fn(now)); }

vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname, '../src/model-viewer.js'), 'utf8'), {
  window: Object.assign(windowEvents, {Driftworks: DW}),
  document: Object.assign(documentEvents, {createElement: element, hidden:false}),
  Event: class {constructor(type) {this.type=type;}}, Element: class {},
  requestAnimationFrame(fn) {callbacks.set(++frameId,fn);return frameId;},
  cancelAnimationFrame(id) {callbacks.delete(id);}

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

const pose = {eye:[0,10,0],right:[1,0,0],up:[0,0,1],back:[0,1,0],distance:10,focal:2};
let latest, orbitPose, orbitTarget, hit = [0,0,0], pickedRay;
const adapter = {
  worldUp:[0,0,1], pose:()=>structuredClone(pose), fly:p=>{latest=structuredClone(p);},
  orbit:(p,target)=>{orbitPose=structuredClone(p);orbitTarget=Array.from(target);},
  pick:(eye,ray)=>{pickedRay=Array.from(ray);return hit;}
};
const flightHost=element(), navigation=DW.modelViewer.create(flightHost,adapter);
const bar=flightHost.children[0], fly=bar.children[1], pick=bar.children[2], speed=bar.children[3], status=bar.children[4];
fly.onclick(); assert.equal(navigation.isFlying(),true); assert.deepEqual(latest.eye,pose.eye);
assert.equal(speed.value,'2','initial speed scales with framing distance');
advance(1000); emit(windowEvents,'keydown',{code:'KeyW'}); advance(1050);
assert.ok(Math.abs(latest.eye[1]-9.9)<1e-9,'forward movement uses real seconds');
emit(windowEvents,'keyup',{code:'KeyW'}); advance(1100); assert.ok(Math.abs(latest.eye[1]-9.9)<1e-9);
emit(windowEvents,'keydown',{code:'KeyE'}); emit(windowEvents,'keydown',{code:'ShiftLeft'}); advance(1150);
assert.ok(Math.abs(latest.eye[2]-.4)<1e-9,'vertical movement and Shift multiplier');
emit(windowEvents,'blur'); const stopped=latest.eye.slice(); advance(1200);assert.deepEqual(latest.eye,stopped,'blur clears held keys');
emit(flightHost,'pointerdown',{clientX:400,clientY:300,pointerId:1,button:0,buttons:1});
emit(flightHost,'pointermove',{clientX:450,clientY:320,pointerId:1,button:-1,buttons:1,altKey:false});
assert.ok(Math.abs(latest.back[0])>.1,'drag changes flight aim');
assert.ok(Math.abs(Math.hypot(...latest.back)-1)<1e-9);
emit(windowEvents,'keydown',{code:'Escape'});assert.equal(navigation.isFlying(),false);assert.deepEqual(orbitPose.eye,latest.eye,'orbit return preserves eye');
assert.ok(Math.abs(Math.hypot(...orbitTarget.map((x,i)=>x-orbitPose.eye[i]))-10)<1e-9);
pick.onclick(); emit(flightHost,'pointerdown',{clientX:400,clientY:300,pointerId:2,button:0,buttons:1});
assert.deepEqual(pickedRay,[0,-1,0]); assert.deepEqual(orbitTarget,[0,0,0]); assert.ok(status.textContent.includes('focus set'));
hit=null; emit(flightHost,'dblclick',{clientX:0,clientY:0}); assert.equal(status.textContent,'No model surface there');
pick.onclick(); assert.equal(navigation.isPicking(),true); navigation.reset(); assert.equal(navigation.isPicking(),false);
fly.onclick(); navigation.reset(); assert.equal(navigation.isFlying(),false,'presets/reset release flight');
fly.onclick(); navigation.dispose(); assert.equal(callbacks.size,0);assert.equal(flightHost.listeners.pointerdown,undefined);assert.equal(windowEvents.listeners.keydown,undefined);
console.log('PASS shared focus rays, hit/miss, flight movement, look, speed, blur, Escape, reset and cleanup');
