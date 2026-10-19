(function (global) {
  'use strict';
  var DW = /** @type {import('./types').DriftworksNamespace} */ (global.Driftworks);
  /** @typedef {import('./types').ViewerVector} V3 */
  /** @type {HTMLElement | null} */ var active = null;
  /** Shared navigation policy and accessible toolbar for scene3d studies.
   * @param {HTMLElement} host
   * @param {import('./types').ViewerAdapter} [adapter]
   */
  function create(host, adapter) {
    var sliding = false;
    var toolbar = document.createElement('div');
    toolbar.className = 'model-viewer-navigation';
    toolbar.setAttribute('role', 'group');
    toolbar.setAttribute('aria-label', 'Model viewer navigation');
    toolbar.style.cssText = 'position:absolute;right:12px;bottom:42px;z-index:4;display:flex;gap:6px;flex-wrap:wrap;max-width:calc(100% - 24px);justify-content:flex-end';
    var button = document.createElement('button');
    button.type = 'button';
    button.style.cssText = 'padding:8px 12px;background:#15232c;color:#dce6e9;border:1px solid #607582;border-radius:6px;cursor:pointer';
    button.title = 'Toggle drag mode. Right drag: slide. Hold both mouse buttons: orbit. Wheel: zoom.';
    function label() {
      button.textContent = sliding ? 'Slide · click for orbit' : 'Orbit · click for slide';
      button.setAttribute('aria-pressed', String(sliding));
    }
    button.onclick = function () { sliding = !sliding; label(); };
    // Do not start a canvas gesture or pause a page's animation for toolbar clicks.
    function stop(/** @type {Event} */ event) { event.stopPropagation(); }
    toolbar.addEventListener('pointerdown', stop);
    toolbar.addEventListener('dblclick', stop);
    toolbar.appendChild(button); host.appendChild(toolbar); label();
    /** @type {(() => void)[]} */ var cleanup = [];
    var flying = false, picking = false, disposed = false, frame = 0, previous = 0;
    /** @type {import('./types').ViewerPose | null} */ var flight = null;
    /** @type {Record<string, boolean>} */ var keys = {};
    /** @type {{x:number,y:number,id:number} | null} */ var drag = null;
    var speed = document.createElement('input'), status = document.createElement('span');
    var flyButton = document.createElement('button'), pickButton = document.createElement('button');
    /** @param {EventTarget} target @param {string} name @param {EventListener} fn @param {AddEventListenerOptions | boolean} [options] */
    function listen(target, name, fn, options) {
      target.addEventListener(name, fn, options);
      cleanup.push(function () { target.removeEventListener(name, fn, options); });
    }
    /** @param {V3} v @returns {V3} */
    function normalized(v) { var length = Math.hypot.apply(null, v); return /** @type {V3} */ (v.map(function (x) { return x / Math.max(1e-12, length); })); }
    /** @param {V3} v @param {V3} axis @param {number} angle @returns {V3} */
    function rotate(v, axis, angle) {
      var c = Math.cos(angle), s = Math.sin(angle), dot = v[0]*axis[0]+v[1]*axis[1]+v[2]*axis[2];
      var cross = [axis[1]*v[2]-axis[2]*v[1],axis[2]*v[0]-axis[0]*v[2],axis[0]*v[1]-axis[1]*v[0]];
      return normalized(/** @type {V3} */ (v.map(function (x,i) { return x*c+cross[i]*s+axis[i]*dot*(1-c); })));
    }
    function interact() { active = host; host.dispatchEvent(new Event('viewer-interaction')); }
    function startNavigation() { interact(); host.dispatchEvent(new Event('viewer-navigation-start')); }
    function labels() {
      flyButton.textContent = flying ? 'Return to orbit' : 'Free flight';
      flyButton.setAttribute('aria-pressed', String(flying));
      pickButton.setAttribute('aria-pressed', String(picking));
      status.textContent = picking ? 'Click a model surface' : flying ? 'WASD · Q/E up/down · Shift faster · Esc orbit' : 'Double-click a surface to focus';
    }
    function clearInput() { keys = {}; drag = null; }
    function leave() {
      if (!adapter || !flight) return;
      var pose = flight, distance = pose.distance;
      var target = /** @type {V3} */ (pose.eye.map(function (x,i) { return x-pose.back[i]*distance; }));
      flying = false; flight = null; clearInput(); adapter.orbit(pose, target); labels();
    }
    function enter() {
      if (!adapter) return;
      startNavigation(); picking = false;
      flight = adapter.pose(); flying = true; clearInput();
      speed.value = String(Math.max(.001, flight.distance / 5));
      adapter.fly(flight); labels();
    }
    /** @param {MouseEvent} event */
    function focus(event) {
      if (!adapter) return;
      startNavigation();
      var pose = flight || adapter.pose(), rect = host.getBoundingClientRect();
      var sx = (event.clientX-rect.left-rect.width/2)*2/(rect.height*pose.focal);
      var sy = -(event.clientY-rect.top-rect.height/2)*2/(rect.height*pose.focal);
      var ray = normalized(/** @type {V3} */ (pose.back.map(function (x,i) { return -x+pose.right[i]*sx+pose.up[i]*sy; })));
      var hit = adapter.pick(pose.eye, ray); picking = false;
      if (!hit) { labels(); status.textContent = 'No model surface there'; return; }
      flying = false; flight = null; clearInput(); adapter.orbit(pose, hit); labels(); status.textContent = 'Orbit focus set on the model';
    }
    function reset() { leave(); picking = false; clearInput(); labels(); }
    /** @param {Event} event */
    function keydown(event) {
      var e = /** @type {KeyboardEvent} */ (event);
      if (active !== host) return;
      if (e.code === 'Escape') { leave(); picking = false; labels(); return; }
      if (e.target instanceof Element && e.target.closest('input,textarea,select,[contenteditable=true]')) return;
      if (flying && /^(Key[WASDQE]|Space|ShiftLeft|ShiftRight)$/.test(e.code)) { keys[e.code] = true; e.preventDefault(); }
    }
    /** @param {number} now */
    function tick(now) {
      if (disposed) return;
      var dt = previous ? Math.min(.05, (now-previous)/1000) : 0; previous = now;
      if (adapter && flight && flying && active === host && !document.hidden) {
        var forward = (keys.KeyW?1:0)-(keys.KeyS?1:0), side = (keys.KeyD?1:0)-(keys.KeyA?1:0), vertical = (keys.KeyE?1:0)-(keys.KeyQ?1:0);
        var step = Math.max(.001, Number(speed.value)||.001)*dt*(keys.ShiftLeft||keys.ShiftRight?4:1)/Math.max(1, Math.hypot(forward, side, vertical));
        var pose = flight;
        pose.eye = /** @type {V3} */ (pose.eye.map(function (x,i) { return x+step*(-pose.back[i]*forward+pose.right[i]*side+adapter.worldUp[i]*vertical); }));
        adapter.fly(pose);
      }
      frame = requestAnimationFrame(tick);
    }
    if (adapter) {
      [flyButton, pickButton].forEach(function (b) { b.type = 'button'; b.style.cssText = button.style.cssText; toolbar.appendChild(b); });
      pickButton.textContent = 'Pick focus';
      speed.type = 'number'; speed.min = '0.001'; speed.step = 'any'; speed.value = '1'; speed.setAttribute('aria-label', 'Flight speed in scene units per second');
      speed.title = 'Flight speed in scene units per second'; speed.style.cssText = 'width:65px;background:#15232c;color:#dce6e9;border:1px solid #607582';
      toolbar.appendChild(speed); status.style.cssText = 'flex-basis:100%;font:12px system-ui;color:#b5c8d2;text-shadow:0 1px 3px #000'; status.setAttribute('role','status'); toolbar.appendChild(status);
      flyButton.onclick = function () { if (flying) leave(); else enter(); };
      pickButton.onclick = function () { startNavigation(); picking = !picking; labels(); };
      listen(host, 'pointerdown', function (event) {
        var e = /** @type {PointerEvent} */ (event);
        if (toolbar.contains(/** @type {Node} */ (e.target))) return;
        interact();
        if (picking) { e.preventDefault(); e.stopImmediatePropagation(); focus(e); return; }
        if (!flying) return;
        e.preventDefault(); e.stopImmediatePropagation(); drag = {x:e.clientX,y:e.clientY,id:e.pointerId}; host.setPointerCapture(e.pointerId);
      }, true);
      listen(host, 'pointermove', function (event) {
        var e = /** @type {PointerEvent} */ (event);
        if (!flying || !flight || !drag || drag.id !== e.pointerId) return;
        e.preventDefault(); e.stopImmediatePropagation();
        var dx = e.clientX-drag.x, dy = e.clientY-drag.y, pose = flight;
        if (gesture(e, !!keys.Space) === 'pan') {
          var amount = Math.max(.001, Number(speed.value)||.001)*.012;
          pose.eye = /** @type {V3} */ (pose.eye.map(function (x,i) { return x+amount*(-pose.right[i]*dx+pose.up[i]*dy); }));
        } else {
          pose.right = rotate(pose.right, adapter.worldUp, -dx*.005); pose.up = rotate(pose.up, adapter.worldUp, -dx*.005); pose.back = rotate(pose.back, adapter.worldUp, -dx*.005);
          var vertical = pose.back.reduce(function (sum,x,i) { return sum+x*adapter.worldUp[i]; },0);
          var pitch = Math.max(-1.51, Math.min(1.51, Math.asin(Math.max(-1,Math.min(1,vertical)))+dy*.005))-Math.asin(Math.max(-1,Math.min(1,vertical)));
          pose.up = rotate(pose.up, pose.right, pitch); pose.back = rotate(pose.back, pose.right, pitch);
        }
        drag.x = e.clientX; drag.y = e.clientY; adapter.fly(pose);
      }, true);
      listen(host, 'pointerup', function (event) { var e = /** @type {PointerEvent} */ (event); if (!e.buttons) drag = null; }, true);
      listen(host, 'pointercancel', clearInput, true);
      listen(host, 'lostpointercapture', clearInput, true);
      listen(host, 'dblclick', function (event) { if (!toolbar.contains(/** @type {Node} */ (event.target))) { event.stopImmediatePropagation(); focus(/** @type {MouseEvent} */ (event)); } }, true);
      listen(host, 'wheel', function (event) {
        if (!flight || !flying || toolbar.contains(/** @type {Node} */ (event.target))) return;
        var e = /** @type {WheelEvent} */ (event), pose = flight; e.preventDefault(); e.stopImmediatePropagation(); interact();
        var delta = e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?host.clientHeight:1), amount = Math.max(-300,Math.min(300,delta))*Math.max(.001,Number(speed.value)||.001)*.002;
        pose.eye = /** @type {V3} */ (pose.eye.map(function (x,i) { return x+pose.back[i]*amount; })); adapter.fly(pose);
      }, {capture:true, passive:false});
      listen(global, 'keydown', keydown, true);
      listen(global, 'keyup', function (event) { delete keys[/** @type {KeyboardEvent} */ (event).code]; });
      listen(global, 'blur', clearInput);
      listen(document, 'visibilitychange', clearInput);
      labels(); frame = requestAnimationFrame(tick);
    }
    /** @param {{buttons:number; button:number; altKey:boolean}} event @param {boolean} space @returns {'orbit'|'pan'} */
    function gesture(event, space) {
      if (event.altKey || (event.buttons & 3) === 3) return 'orbit';
      if (space || (event.buttons & 6) !== 0 || event.button === 1 || event.button === 2) return 'pan';
      return sliding ? 'pan' : 'orbit';
    }
    return {
      isFlying: function () { return flying; }, isPicking: function () { return picking; }, reset: reset,
      /** @param {{buttons:number; button:number; altKey:boolean}} event @param {boolean} space @returns {'orbit'|'pan'} */
      gesture: gesture,
      dispose: function () { reset(); disposed = true; if(frame)cancelAnimationFrame(frame); cleanup.forEach(function (remove) { remove(); }); if(active===host)active=null; toolbar.remove(); }

    };
  }
  DW.modelViewer = {create: create};
})(window);
