'use strict';

// Run the real composition root, session, diagnostics and watch adapter. Only
// browser resources are stubbed; drive their registered callbacks and RAF queue.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

module.exports = function runFlightTransitions(namespace) {
  function mount(search = '') {
    class Element {
      constructor() {
        this.value = ''; this.checked = false; this.options = []; this.dataset = {}; this.style = {};
        this.classList = {add() {}, remove() {}, toggle() {}};
      }
      set textContent(value) { this.text = value; this.options = []; }
      get textContent() { return this.text || ''; }
      appendChild(option) { this.options.push(option); if (this.options.length === 1) this.value = option.value; }
      addEventListener() {}
      setAttribute() {}
      cloneNode() { return Object.assign(new Element(), this); }
      dispatchEvent(event) { if (event.type === 'change' && this.onchange) this.onchange(event); }
      blur() {}
    }
    const nodes = new Map();
    const captures = [], clipboard = [];
    const layers = ['sky', 'scene', 'effects'].map(name => ({name, width:640, height:360}));
    class Canvas extends Element {
      constructor(name='output') { super(); this.name=name; this.width=640; this.height=360; this.drawn=[]; }
      getContext() { return {fillRect() {}, drawImage:layer => this.drawn.push(layer.name)}; }
      toBlob(callback) { captures.push(this); callback({type:'image/png'}); }
    }
    const hudCanvas = new Canvas('hud');
    const get = id => { if (!nodes.has(id)) nodes.set(id, new Element()); return nodes.get(id); };
    for (const [id, value] of Object.entries({
      'watch-pilot':'manual', 'watch-style':'baseline', 'combat-mode':'training',
      'watch-seed':'29', 'watch-profile':'0', 'watch-opponent-profile':'-1',
      'watch-weapon':'-1', 'watch-defense':'retail', 'watch-start':'headOn',
      'watch-camera':'chase', 'watch-speed':'1', 'ally-art':'mixed', 'enemy-art':'mixed',
      'fps-cap':'0', 'render-mode':'normal'
    })) get(id).value = value;
    get('combat-toggle').checked = true;
    const document = {
      body: Object.assign(new Element(), {dataset:{}}), getElementById:get,
      createElement:tag => tag==='canvas' ? new Canvas() : new Element(), activeElement:null, pointerLockElement:null,
      querySelector:selector => selector==='canvas.gpu-flight-hud' ? hudCanvas : null
    };
    get('viewer').clientWidth=640;get('viewer').clientHeight=360;
    get('viewer').querySelectorAll=() => layers;
    let actions, session, frame, now = 0;
    const elapsed = [];
    const noop = () => {};
    const DW = Object.assign({}, namespace, {
      audio:{mountMixer:noop, unlock:noop, setFlightEngine:noop, playGunshot:noop, playImpact:noop, playWormhole:noop},
      flightDiagnostics:{mount:() => namespace.flightDiagnostics.mount({document, performance:{now:() => now}})},
      asteroidTerrain:Object.assign({}, namespace.asteroidTerrain, {surfaceFrame:(_asteroid, direction) => ({point:direction})}),
      flightSession:{create(environment) {
        session = namespace.flightSession.create(environment);
        const advance = session.advance;
        session.advance = (dt, ...args) => { elapsed.push(dt); return advance(dt, ...args); };
        return session;
      }},
      flightPresentation:{mount() { return {
        pose:noop, render:noop,
        appearance:() => ({allyArt:get('ally-art').value, enemyArt:get('enemy-art').value}),
        renderStats:() => ({scene:{cpuMs:0,drawCalls:0,triangles:0,meshes:0,materials:0,width:1,height:1,pixelRatio:1},sky:{drawCalls:0,triangles:0,points:0}})
      }; }},
      flightHud:{mount:() => ({render:noop, cycleRadarRange:noop})},
      flightComms:{mount:() => ({reset:noop,pause:noop,unlock:noop,update:noop,speakerId:() => null})},
      flightControls:{mount(_host, callbacks) {
        actions = callbacks;
        return {clear:noop,release:noop,resetButtons:noop,haptics:noop,
          view:() => ({inputMode:'keyboard'}),
          sample:() => ({throttle:0,throttleRate:0,stop:true,fire:false})};
      }}
    });
    const context = vm.createContext({window:{Driftworks:DW,devicePixelRatio:2}, document, HTMLElement:Element, HTMLDetailsElement:Element, HTMLCanvasElement:Canvas,
      navigator:{clipboard:{write(items) { clipboard.push(items); return Promise.resolve(); }}},
      ClipboardItem:class { constructor(data) { this.data=data; } },
      URL:{createObjectURL:() => 'blob:test',revokeObjectURL() {}},
      URLSearchParams, location:{search}, performance:{now:() => now},
      requestAnimationFrame:callback => { frame = callback; }});
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../experiments/ellis-feedback.js'), 'utf8'), context, {filename:'experiments/ellis-feedback.js'});
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../experiments/flight.js'), 'utf8'), context, {filename:'experiments/flight.js'});
    return {get, actions, session, elapsed, document, captures, clipboard,
      tick(time) { now = time; const callback = frame; frame = null; callback(time); assert(frame); }};
  }

  for (const hud of [true,false]) {
    const shot=mount(),panel=shot.get('launch').options.at(-1),button=panel.options[hud?0:1];
    shot.tick(1000);
    const before=JSON.stringify(shot.session.snapshot());
    button.onclick();
    assert.equal(shot.clipboard.length,1,'Clipboard write starts inside click activation');
    assert.equal(typeof shot.clipboard[0][0].data['image/png'].then,'function');
    assert.equal(shot.captures.length,0,'Capture waits for freshly rendered WebGL buffers');
    shot.tick(1100);
    assert.deepEqual(shot.captures[0].drawn,hud?['sky','scene','effects','hud']:['sky','scene','effects']);
    assert.equal(shot.captures[0].width,1280);assert.equal(shot.captures[0].height,720);
    assert(shot.actions.isPaused());assert.equal(JSON.stringify(shot.session.snapshot()),before);
  }
  console.log('PASS pause screenshots: fresh frame, ordered layers, optional HUD, display resolution and frozen simulation');

  const style = mount();
  style.get('watch-style').value = 'passer'; style.get('watch-style').onchange();
  style.tick(1000); // Apply the current UI hull selection.
  style.get('combat-toggle').checked = false; style.get('combat-toggle').onchange();
  style.get('combat-toggle').checked = true; style.get('combat-toggle').onchange();
  assert.equal(style.session.snapshot().combat.opponentStyle, 'passer');
  style.get('fly').onclick(); style.tick(1050); style.tick(4150);
  // The session caps no elapsed time itself; the browser caps this stall at .1s.
  const current = style.session.snapshot();
  namespace.training.spawn(current.combat, current.state, current.asteroid.radius);
  assert(current.combat.enemies.every(c => c.opponentStyle === 'passer'));
  assert.equal(current.combat.hullModels.ally, 'mixed');
  // Immediate-spawn patrol toggles must configure participants before spawning.
  style.get('combat-mode').value = 'asteroid-patrol'; style.get('combat-mode').onchange();
  style.get('combat-toggle').checked = false; style.get('combat-toggle').onchange();
  style.get('combat-toggle').checked = true; style.get('combat-toggle').onchange();
  assert(style.session.snapshot().combat.enemies.every(c => c.opponentStyle === 'passer'));

  const timing = mount();
  timing.tick(1000); timing.get('fly').onclick(); timing.tick(1050); timing.tick(1060);
  assert.deepEqual(timing.elapsed, [0, .01]);
  timing.actions.pause(); timing.tick(2000); timing.actions.resume(); timing.tick(2050); timing.tick(2060);
  assert.deepEqual(timing.elapsed, [0, .01, 0, .01]);
  // Pause and resume between RAF callbacks must also discard the old baseline.
  timing.actions.pause(); timing.actions.resume(); timing.tick(2070); timing.tick(2080);
  assert.deepEqual(timing.elapsed.slice(-2), [0, .01]);
  assert(timing.get('perf-overlay').textContent.includes('worst 940.0 ms'), 'Performance measurements retain real frame intervals');
  timing.get('perf-reset').onclick(); timing.tick(2090);
  assert.equal(timing.elapsed.at(-1), .01, 'Resetting measurements must not reset simulation time');

  const status = mount();
  status.tick(1000); status.get('fly').onclick(); status.tick(1050);
  assert.equal(status.get('status').textContent, 'Flight controls active');
  const view = status.session.snapshot(); view.state.eye = [view.asteroid.radius,0,0];
  status.tick(1060); assert.equal(status.get('status').textContent, 'Surface contact · throttle cut');
  status.actions.pause(); assert.equal(status.get('status').textContent, 'Paused - Resume flight when ready');
  status.actions.resume(); status.tick(1070);
  view.combat.dead = true; status.document.pointerLockElement = status.get('viewer'); status.tick(1080);
  assert.equal(status.get('status').textContent, 'Training over · Restart training to try again');
  assert(status.actions.isPaused()); assert.equal(status.get('fly').textContent, 'Restart flight');
  status.tick(1200); assert.equal(status.get('status').textContent, 'Training over · Restart training to try again');

  const menu = mount();
  menu.tick(1000); menu.actions.resume(); menu.tick(1050);
  menu.actions.toggleDiagnostics();
  assert(menu.actions.isPaused(), 'F3 pauses flight before opening DOM diagnostics');
  assert.equal(menu.get('flight-lab').open,true);
  menu.actions.resume(); menu.actions.togglePerformance();
  assert(menu.actions.isPaused(), 'P keeps performance controls on the pause screen');

  const watch = mount('?duel=1&duration=.05&category=human&flavor=novice');
  watch.tick(1000); watch.get('watch-play').onclick(); watch.tick(1050); watch.tick(1060);
  assert.equal(watch.get('status').textContent, 'Watching test pilot · Esc pauses');
  watch.actions.pause(); watch.tick(2000); watch.get('watch-play').onclick(); watch.tick(2050);
  assert(watch.get('watch-readout').textContent.startsWith('0.01s'), 'Watch resume must not consume paused time');
  for (let time=2150; time<124000 && !watch.actions.isPaused(); time+=100) watch.tick(time);
  assert(watch.actions.isPaused());
  assert.equal(watch.get('status').textContent, 'Duel complete · Replay duel or choose another pilot');
  console.log('PASS flight composition: retained combat settings, pause/resume clocks, contact/death/completion status');
};

if (require.main === module) module.exports(require('./helpers/shared-runtime.cjs').install().namespace);
