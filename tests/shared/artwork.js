(function () {
  'use strict';

  window.DriftworksSharedTests = window.DriftworksSharedTests || {};
  window.DriftworksSharedTests.artwork = function (harness, fixtures) {
    var sim = window.Driftworks.sim;
    var game = window.Driftworks.game;
    var hud = window.Driftworks.hud;
    var test = harness.test, assert = harness.assert, assertClose = harness.assertClose;
    var createFreshWorld = fixtures.createFreshWorld;

  test('artwork', 'asteroid artwork is stable through movement, depletion and save reload', function () {
    var world = createFreshWorld();
    var asteroid = world.asteroids[0];
    var before = JSON.stringify(game.asteroidVisualDescription(asteroid));
    var changed = Object.assign({}, asteroid, { rotation: 2, ore: 0, position: { x: 999, y: -42 } });
    assert(JSON.stringify(game.asteroidVisualDescription(changed)) === before);
    var loaded = sim.deserializeWorld(sim.serializeWorld(world));
    assert(JSON.stringify(game.asteroidVisualDescription(loaded.asteroids[0])) === before);
  });

  test('artwork', 'asteroid surface is a normalized four-material composition field', function () {
    var base = createFreshWorld().asteroids[0];
    var craterCounts = new Set();
    var bulkWinners = new Set();
    var heterogeneities = [];
    var roughnessByDominant = [[], [], [], []];
    /** @type {Record<string, number>} */
    var craterSizes = { small: 0, medium: 0, large: 0, basin: 0 };
    var limbCraters = 0;
    for (var n = 0; n < 80; n += 1) {
      var asteroid = Object.assign({}, base, { id: 'sample-' + n });
      var visual = game.asteroidVisualDescription(asteroid);
      craterCounts.add(visual.craters.length);
      heterogeneities.push(visual.heterogeneity);
      var winner = visual.bulk.indexOf(Math.max.apply(null, visual.bulk));
      bulkWinners.add(winner);
      roughnessByDominant[winner].push(visual.surfaceProfile.roughnessAmp);
      assertClose(visual.bulk.reduce(function (a, b) { return a + b; }, 0), 1);
      assert(visual.bulk.every(function (fraction) { return fraction > 0; }), 'Every bulk material must be present');
      assert(visual.craters.length >= 102 && visual.craters.length <= 144, 'Shader crater population is dense and bounded');
      assert(visual.relief.blobs.length === 5, 'Every asteroid has a coherent large-scale relief field');
      assert(['fresh', 'dusty', 'battered', 'fractured', 'rubble-pile'].indexOf(visual.surfaceProfile.state) >= 0);
      assert(visual.surfaceProfile.roughnessAmp > 0 && visual.surfaceProfile.grazingBoost > 0);
      visual.craters.forEach(function (crater) {
        craterSizes[crater.sizeClass] += 1;
        var craterAngle = Math.atan2(crater.y, crater.x);
        var edge = 0.88 + 0.07 * Math.cos(craterAngle * 3) + 0.05 * Math.sin(craterAngle * 5);
        if (Math.hypot(crater.x, crater.y) / edge > 0.72) limbCraters += 1;
        assert(crater.ry <= crater.rx && crater.ry >= crater.rx * 0.5,
          'Crater ellipses are foreshortened by their local surface orientation');
        assert(crater.depth > 0 && crater.depth < crater.rx, 'Crater relief is normalized for shader evaluation');
      });
      var bareVisual = Object.assign({}, visual, { craters: [] });
      var center = game.asteroidSurfaceSample(bareVisual, 0, 0);
      var edge = game.asteroidSurfaceSample(bareVisual, 0.78, 0);
      assertClose(center.composition.reduce(function (a, b) { return a + b; }, 0), 1);
      assert(center.composition.every(function (fraction) { return fraction >= 0.025 && fraction <= 0.91; }),
        'Every sampled point remains a material mixture');
      assertClose(Math.hypot(center.normal.x, center.normal.y, center.normal.z), 1, 0.00001);
      assert(center.normal.z > edge.normal.z, 'Full-height normals curve away from the viewer near the limb');
      var crater = visual.craters[visual.craters.length - 1];
      var floor = game.asteroidSurfaceSample(visual, crater.x, crater.y);
      assert(floor.occlusion >= 0.35, 'Newest crater center is represented as occluded relief');
    }
    assert(bulkWinners.size === 4, 'All four materials can dominate bulk composition');
    var averageRoughness = roughnessByDominant.map(function (values) {
      return values.reduce(function (sum, value) { return sum + value; }, 0) / values.length;
    });
    assert(averageRoughness[3] > averageRoughness[0], 'Silicate-dominant surfaces are rougher on average than ice-dominant surfaces');
    assert(craterCounts.size > 5);
    var craterTotal = craterSizes.small + craterSizes.medium + craterSizes.large + craterSizes.basin;
    assert(craterSizes.small / craterTotal > 0.6 && craterSizes.small / craterTotal < 0.8,
      'Most impacts are small craters');
    assert(craterSizes.medium / craterTotal > 0.15 && craterSizes.medium / craterTotal < 0.32,
      'Medium impacts form the supporting crater population');
    assert(craterSizes.large > 80 && craterSizes.basin > 5,
      'Large impacts and occasional basins appear across a broad sample');
    assert(limbCraters / craterTotal > 0.6,
      'Visible-hemisphere sampling represents compressed edge-on surface area');
    assert(Math.min.apply(null, heterogeneities) < 0.1 && Math.max.apply(null, heterogeneities) > 0.9,
      'Field heterogeneity should span nearly homogeneous to chunky');
  });
  };
})();
