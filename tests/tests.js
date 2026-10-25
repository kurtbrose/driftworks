(function () {
  'use strict';

  var harness = window.DriftworksTestHarness.create();
  window.DriftworksTestHarness.groups.forEach(function (group) {
    var register = window.DriftworksSharedTests[group];
    if (typeof register !== 'function') throw new Error('Missing shared test group: ' + group);
    register(harness, window.DriftworksSharedFixtures);
  });
  window.DriftworksTestResult = harness.run();
})();
