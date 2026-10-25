(function () {
  'use strict';

  window.DriftworksSharedTests = window.DriftworksSharedTests || {};
  window.DriftworksSharedTests.tooling = function (harness, fixtures) {
    var sim = window.Driftworks.sim;
    var game = window.Driftworks.game;
    var hud = window.Driftworks.hud;
    var test = harness.test, assert = harness.assert, assertClose = harness.assertClose;



  test('tooling', 'experiment controls report missing markup at the lookup boundary', function () {
    var get = window.Driftworks.experimentDom({getElementById: function () { return null; }});
    var message = '';
    try { get('profile'); } catch (error) { message = error.message; }
    assert(message === 'Missing experiment element #profile');
  });
  };
})();
