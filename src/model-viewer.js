(function (global) {
  'use strict';
  var DW = /** @type {import('./types').DriftworksNamespace} */ (global.Driftworks);
  /** Shared navigation policy and accessible toolbar for scene3d studies.
   * @param {HTMLElement} host
   */
  function create(host) {
    var sliding = false;
    var toolbar = document.createElement('div');
    toolbar.className = 'model-viewer-navigation';
    toolbar.setAttribute('role', 'group');
    toolbar.setAttribute('aria-label', 'Model viewer navigation');
    toolbar.style.cssText = 'position:absolute;right:12px;bottom:42px;z-index:4;display:flex;gap:6px';
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
    return {
      /** @param {{buttons:number; button:number; altKey:boolean}} event @param {boolean} space @returns {'orbit'|'pan'} */
      gesture: function (event, space) {
        if (event.altKey || (event.buttons & 3) === 3) return 'orbit';
        if (space || (event.buttons & 6) !== 0 || event.button === 1 || event.button === 2) return 'pan';
        return sliding ? 'pan' : 'orbit';
      },
      dispose: function () { toolbar.remove(); }
    };
  }
  DW.modelViewer = {create: create};
})(window);
