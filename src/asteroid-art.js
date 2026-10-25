(function (global) {
  'use strict';
  // Shared deterministic geology and shader data. No DOM, Pixi or Three resources.
  /** @typedef {import('./types').Asteroid} Asteroid */
  /** @typedef {import('./types').Rng} Rng */
  /** @type {import('./types').DriftworksNamespace} */
  var DW = global.Driftworks;
  var sim = /** @type {import('./types').SimApi} */ (DW.sim);

  // Artwork-only mixes: simulation currently has one undifferentiated ore resource.
  var ASTEROID_PALETTES = [
    { name: 'ice', rgb: [160, 182, 194] },
    { name: 'volatiles', rgb: [120, 104, 92] },
    { name: 'metals', rgb: [145, 138, 126] },
    { name: 'silicates', rgb: [126, 132, 128] }
  ];

  var ASTEROID_SURFACE_PRESETS = [
    { roughnessAmp: 0.2, roughnessFreq: 0.32, grazingBoost: 0.2, pittingDensity: 0.25,
      fractureDensity: 0.18, craterSharpness: 0.35, rimStrength: 0.35, boulderiness: 0.18, smoothing: 0.78 },
    { roughnessAmp: 0.43, roughnessFreq: 0.53, grazingBoost: 0.38, pittingDensity: 0.5,
      fractureDensity: 0.26, craterSharpness: 0.4, rimStrength: 0.4, boulderiness: 0.3, smoothing: 0.58 },
    { roughnessAmp: 0.48, roughnessFreq: 0.48, grazingBoost: 0.4, pittingDensity: 0.3,
      fractureDensity: 0.34, craterSharpness: 0.68, rimStrength: 0.68, boulderiness: 0.7, smoothing: 0.25 },
    { roughnessAmp: 0.75, roughnessFreq: 0.74, grazingBoost: 0.72, pittingDensity: 0.75,
      fractureDensity: 0.38, craterSharpness: 0.55, rimStrength: 0.52, boulderiness: 0.48, smoothing: 0.32 }
  ];

  var WORLD_LIGHT = { x: -0.813733, y: -0.581238, z: 0.68 };

  var ASTEROID_MAX_CRATERS = 144;
  var ASTEROID_CRATER_TEXELS = 4;
  var ASTEROID_CRATER_TEXTURE_WIDTH = ASTEROID_MAX_CRATERS * ASTEROID_CRATER_TEXELS;
  var ASTEROID_MAX_FIELD_BLOBS = 12;

  /** @param {number} value @returns {number} */
  function smoothstep(value) {
    value = Math.max(0, Math.min(1, value));
    return value * value * (3 - 2 * value);
  }

  /** @param {number[]} rgb @param {number} lightness @returns {number} */
  function asteroidColor(rgb, lightness) {
    /** @param {number} value */
    var channel = function (value) { return Math.max(0, Math.min(255, Math.round(value * lightness))); };
    return channel(rgb[0]) * 0x10000 + channel(rgb[1]) * 0x100 + channel(rgb[2]);
  }

  /** Smooth deterministic field in roughly [-1, 1].
   * @param {number} x @param {number} y @param {number} phase @param {number} scale
   */
  function asteroidWave(x, y, phase, scale) {
    return (Math.sin((x * 1.17 + y * 0.73) * scale + phase) +
      Math.cos((x * -0.61 + y * 1.31) * scale + phase * 1.63)) * 0.5;
  }

  /** @typedef {{ x: number, y: number, z: number }} AsteroidNormal */
  /** @typedef {{ phase: number, blobs: { x: number, y: number, sigma: number, amp: number }[] }} AsteroidRelief */
  /** @typedef {{ x: number, y: number, rx: number, ry: number, angle: number, depth: number, rimScale?: number }} AsteroidReliefCrater */
  /** @typedef {{ roughnessAmp:number, roughnessFreq:number, grazingBoost:number, pittingDensity:number, fractureDensity:number, craterSharpness:number, rimStrength:number, boulderiness:number, smoothing:number, state:string }} AsteroidSurfaceProfile */

  /** Shared pseudo-height field in asteroid-radius units.
   * @param {AsteroidRelief} relief @param {AsteroidReliefCrater[]} craters
   * @param {number} x @param {number} y @returns {number}
   */
  function asteroidReliefAt(relief, craters, x, y) {
    var height = asteroidWave(x, y, relief.phase, 2.15) * 0.035;
    relief.blobs.forEach(function (blob) {
      var dx = x - blob.x, dy = y - blob.y;
      height += blob.amp * Math.exp(-(dx * dx + dy * dy) / (2 * blob.sigma * blob.sigma));
    });
    var craterHeight = 0;
    craters.forEach(function (crater) {
      var dx = x - crater.x, dy = y - crater.y;
      var c = Math.cos(crater.angle), s = Math.sin(crater.angle);
      var ex = (dx * c + dy * s) / crater.rx;
      var ey = (-dx * s + dy * c) / crater.ry;
      var distance = Math.sqrt(ex * ex + ey * ey);
      if (distance >= 1.35) return;
      // Impacts are ordered oldest to newest. A later bowl erases the older
      // crater relief beneath its footprint before stamping its own profile.
      craterHeight *= smoothstep((distance - 0.7) / 0.48);
      var bowlBase = 1 - distance * distance;
      var bowl = distance < 1 ? -bowlBase * crater.depth : 0;
      var rimScale = crater.rimScale === undefined ? 1 : crater.rimScale;
      var rim = Math.exp(-Math.pow((distance - 1) / 0.16, 2)) * crater.depth * 0.34 * rimScale;
      craterHeight += bowl + rim;
    });
    return height + craterHeight;
  }

  /** Full rounded body height plus local relief, in asteroid-radius units.
   * @param {AsteroidRelief} relief @param {AsteroidReliefCrater[]} craters
   * @param {number} x @param {number} y @returns {number}
   */
  function asteroidHeightAt(relief, craters, x, y) {
    var radial = Math.min(0.995, Math.hypot(x, y) / 0.98);
    var dome = Math.sqrt(Math.max(0.01, 1 - radial * radial)) * 0.78;
    return dome + asteroidReliefAt(relief, craters, x, y);
  }

  /** Derive a rounded-body normal perturbed by the shared relief field.
   * @param {AsteroidRelief} relief @param {AsteroidReliefCrater[]} craters
   * @param {number} x @param {number} y @returns {AsteroidNormal}
   */
  function asteroidNormalAt(relief, craters, x, y) {
    var epsilon = 0.012;
    var dx = (asteroidHeightAt(relief, craters, x + epsilon, y) - asteroidHeightAt(relief, craters, x - epsilon, y)) / (2 * epsilon);
    var dy = (asteroidHeightAt(relief, craters, x, y + epsilon) - asteroidHeightAt(relief, craters, x, y - epsilon)) / (2 * epsilon);
    var length = Math.hypot(dx, dy, 1) || 1;
    return { x: -dx / length, y: -dy / length, z: 1 / length };
  }

  /** Material-biased defaults plus independent surface processing history.
   * @param {number[]} bulk @param {Rng} rng
   */
  function asteroidSurfaceProfile(bulk, rng) {
    /** @param {'roughnessAmp'|'roughnessFreq'|'grazingBoost'|'pittingDensity'|'fractureDensity'|'craterSharpness'|'rimStrength'|'boulderiness'|'smoothing'} key */
    function blend(key) {
      return ASTEROID_SURFACE_PRESETS.reduce(function (sum, preset, index) { return sum + preset[key] * bulk[index]; }, 0);
    }
    /** @type {AsteroidSurfaceProfile} */
    var profile = { roughnessAmp: blend('roughnessAmp'), roughnessFreq: blend('roughnessFreq'),
      grazingBoost: blend('grazingBoost'), pittingDensity: blend('pittingDensity'),
      fractureDensity: blend('fractureDensity'), craterSharpness: blend('craterSharpness'),
      rimStrength: blend('rimStrength'), boulderiness: blend('boulderiness'),
      smoothing: blend('smoothing'), state: 'fresh' };
    var states = ['fresh', 'dusty', 'battered', 'fractured', 'rubble-pile'];
    var state = states[Math.floor(rng() * states.length)];
    var variation = 0.86 + rng() * 0.28;
    profile.roughnessAmp *= variation;
    profile.roughnessFreq *= 0.9 + rng() * 0.2;
    profile.grazingBoost *= 0.88 + rng() * 0.24;
    if (state === 'fresh') { profile.craterSharpness *= 1.18; profile.rimStrength *= 1.16; profile.smoothing *= 0.78; }
    if (state === 'dusty') { profile.roughnessAmp *= 0.82; profile.rimStrength *= 0.72; profile.smoothing *= 1.18; }
    if (state === 'battered') { profile.pittingDensity *= 1.3; profile.roughnessAmp *= 1.12; }
    if (state === 'fractured') { profile.fractureDensity *= 1.45; profile.roughnessAmp *= 1.08; }
    if (state === 'rubble-pile') { profile.boulderiness *= 1.35; profile.roughnessAmp *= 1.18; }
    profile.state = state;
    return profile;
  }

  /** Cheap crevice darkening from crater depth and overlapping bowls.
   * @param {AsteroidReliefCrater[]} craters @param {number} x @param {number} y @returns {number}
   */
  function asteroidOcclusionAt(craters, x, y) {
    var occlusion = 0, overlaps = 0;
    craters.forEach(function (crater) {
      var dx = x - crater.x, dy = y - crater.y;
      var c = Math.cos(crater.angle), s = Math.sin(crater.angle);
      var distance = Math.hypot((dx * c + dy * s) / crater.rx, (-dx * s + dy * c) / crater.ry);
      if (distance < 1) { occlusion = Math.max(occlusion, (1 - distance) * 0.42); overlaps += 1; }
    });
    return Math.min(0.58, occlusion + Math.max(0, overlaps - 1) * 0.1);
  }

  /** @param {number[]} bulk @param {{ low: number, med: number, blobs: { x: number, y: number, sigma: number, amp: number }[] }[]} fields @param {number} heterogeneity @param {number} x @param {number} y @returns {number[]} */
  function asteroidCompositionAt(bulk, fields, heterogeneity, x, y) {
    // High-heterogeneity bodies need enough log-space range to overturn a
    // strong bulk bias; quiet bodies remain close to their global mixture.
    var broad = 0.18 + heterogeneity * heterogeneity * 2.45;
    var medium = 0.06 + heterogeneity * 0.52;
    var chunk = heterogeneity * heterogeneity * 1.65;
    var temperature = 1.32 - heterogeneity * 0.62;
    var scores = fields.map(function (field, index) {
      var blobs = field.blobs.reduce(function (sum, blob) {
        var dx = x - blob.x, dy = y - blob.y;
        return sum + blob.amp * Math.exp(-(dx * dx + dy * dy) / (2 * blob.sigma * blob.sigma));
      }, 0);
      return Math.log(bulk[index] + 0.000001) +
        broad * asteroidWave(x, y, field.low, 1.8) +
        medium * asteroidWave(x, y, field.med, 5) + chunk * blobs;
    });
    var peak = Math.max.apply(null, scores);
    var values = scores.map(function (score) { return Math.exp((score - peak) / temperature); });
    var total = values.reduce(function (sum, value) { return sum + value; }, 0);
    values = values.map(function (value) { return Math.max(0.03, Math.min(0.9, value / total)); });
    total = values.reduce(function (sum, value) { return sum + value; }, 0);
    return values.map(function (value) { return value / total; });
  }

  /** @param {number[]} composition @param {number} lightness @returns {number} */
  function asteroidCompositionColor(composition, lightness) {
    var mixed = [0, 0, 0];
    var dominant = 0;
    composition.forEach(function (fraction, index) {
      if (fraction > composition[dominant]) dominant = index;
      ASTEROID_PALETTES[index].rgb.forEach(function (channel, c) { mixed[c] += fraction * channel; });
    });
    var boost = smoothstep((composition[dominant] - 0.36) / 0.44) * 0.42;
    var target = ASTEROID_PALETTES[dominant].rgb;
    return asteroidColor(mixed.map(function (channel, index) {
      return channel + (target[index] - channel) * boost;
    }), lightness);
  }

  /** @param {number[][]} points @param {number[]} triangle @returns {{ x: number, y: number, radiusSquared: number } | null} */
  function asteroidCircumcircle(points, triangle) {
    var a = points[triangle[0]], b = points[triangle[1]], c = points[triangle[2]];
    var divisor = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]));
    if (Math.abs(divisor) < 0.000001) return null;
    var aa = a[0] * a[0] + a[1] * a[1];
    var bb = b[0] * b[0] + b[1] * b[1];
    var cc = c[0] * c[0] + c[1] * c[1];
    var x = (aa * (b[1] - c[1]) + bb * (c[1] - a[1]) + cc * (a[1] - b[1])) / divisor;
    var y = (aa * (c[0] - b[0]) + bb * (a[0] - c[0]) + cc * (b[0] - a[0])) / divisor;
    return { x: x, y: y, radiusSquared: (x - a[0]) * (x - a[0]) + (y - a[1]) * (y - a[1]) };
  }

  /** Bowyer-Watson triangulation for the small, once-per-asteroid artwork mesh.
   * @param {number[][]} source @param {number} extent @returns {number[][]}
   */
  function asteroidTriangulation(source, extent) {
    var count = source.length;
    var points = source.concat([[-extent * 4, extent * 3], [0, -extent * 5], [extent * 4, extent * 3]]);
    var triangles = [[count, count + 1, count + 2]];
    for (var index = 0; index < count; index += 1) {
      var point = points[index];
      var bad = triangles.filter(function (triangle) {
        var circle = asteroidCircumcircle(points, triangle);
        return circle && (point[0] - circle.x) * (point[0] - circle.x) +
          (point[1] - circle.y) * (point[1] - circle.y) <= circle.radiusSquared;
      });
      /** @type {Record<string, { edge: number[], count: number }>} */
      var edges = {};
      bad.forEach(function (triangle) {
        [[triangle[0], triangle[1]], [triangle[1], triangle[2]], [triangle[2], triangle[0]]].forEach(function (edge) {
          var key = Math.min(edge[0], edge[1]) + ':' + Math.max(edge[0], edge[1]);
          if (!edges[key]) edges[key] = { edge: edge, count: 0 };
          edges[key].count += 1;
        });
      });
      triangles = triangles.filter(function (triangle) { return bad.indexOf(triangle) < 0; });
      Object.keys(edges).forEach(function (key) {
        if (edges[key].count === 1) triangles.push([edges[key].edge[0], edges[key].edge[1], index]);
      });
    }
    return triangles.filter(function (triangle) {
      return triangle[0] < count && triangle[1] < count && triangle[2] < count;
    });
  }

  /** Deterministic body-local artwork, independent of simulation RNG and depletion.
   * @param {Asteroid} asteroid @returns {import('./types').LegacyAsteroidVisual}
   */
  function legacyAsteroidVisualDescription(asteroid) {
    var seed = 2166136261;
    for (var h = 0; h < asteroid.id.length; h += 1) seed = Math.imul(seed ^ asteroid.id.charCodeAt(h), 16777619);
    var rng = sim.createRng(seed >>> 0);
    var weights = [0.85 + rng() * 0.4, 0.85 + rng() * 0.4, 0.85 + rng() * 0.4, 0.85 + rng() * 0.4];
    var bulk = weights.map(function (weight) { return -Math.log(Math.max(0.000001, rng())) * weight; });
    var bulkTotal = bulk.reduce(function (sum, value) { return sum + value; }, 0);
    bulk = bulk.map(function (value) { return value / bulkTotal; });
    var surfaceRng = sim.createRng((seed ^ 0x6d2b79f5) >>> 0);
    var surfaceProfile = asteroidSurfaceProfile(bulk, surfaceRng);
    var heterogeneity = rng();
    var fields = ASTEROID_PALETTES.map(function () {
      /** @type {{x: number; y: number; sigma: number; amp: number}[]} */
      var blobs = [];
      var blobCount = Math.floor(rng() * (1 + Math.round(heterogeneity * 3)));
      for (var b = 0; b < blobCount; b += 1) {
        blobs.push({ x: rng() - 0.5, y: rng() - 0.5,
          sigma: 0.12 + rng() * 0.16, amp: -0.6 + rng() * 1.4 });
      }
      return { low: rng() * 100, med: rng() * 100, blobs: blobs };
    });
    var radius = asteroid.radius;
    /** @type {AsteroidRelief} */
    var relief = { phase: rng() * 100, blobs: [] };
    for (var lump = 0; lump < 5; lump += 1) {
      relief.blobs.push({ x: (rng() - 0.5) * 1.15, y: (rng() - 0.5) * 1.15,
        sigma: 0.22 + rng() * 0.22, amp: (rng() - 0.42) * (0.1 + surfaceProfile.boulderiness * 0.07) });
    }
    /** @type {{ x: number, y: number, rx: number, ry: number, angle: number, depth: number, floor: number, rim: number, shadow: number, normal?: AsteroidNormal, age: number, rimMask?: boolean[] }[]} */
    var craters = [];
    var craterRng = sim.createRng((seed ^ 0x9e3779b9) >>> 0);
    var craterCount = 4 + Math.floor(craterRng() * (9 + surfaceProfile.pittingDensity * 7));
    for (var c = 0; c < craterCount; c += 1) {
      var major = 0.025 + craterRng() * 0.055;
      var ca = craterRng() * Math.PI * 2;
      var cd = 0.12 + craterRng() * 0.55;
      var cx = Math.cos(ca) * cd, cy = Math.sin(ca) * cd;
      // Deliberately seed some intersecting and nested impacts. Array order is
      // geological age, so this crater will cut any chosen older parent.
      if (craters.length && craterRng() < 0.42) {
        var parent = craters[Math.floor(craterRng() * craters.length)];
        var overlapAngle = craterRng() * Math.PI * 2;
        var overlapDistance = (parent.rx + major) * (0.22 + craterRng() * 0.62);
        cx = parent.x + Math.cos(overlapAngle) * overlapDistance;
        cy = parent.y + Math.sin(overlapAngle) * overlapDistance;
      }
      var local = asteroidCompositionAt(bulk, fields, heterogeneity, cx, cy);
      var localColor = asteroidCompositionColor(local, 1);
      var rgb = [(localColor >> 16) & 255, (localColor >> 8) & 255, localColor & 255];
      var patchNormal = asteroidNormalAt(relief, [], cx, cy);
      var foreshorten = 0.52 + patchNormal.z * 0.43;
      craters.push({ x: cx, y: cy, rx: major, ry: major * foreshorten,
        angle: Math.atan2(patchNormal.y, patchNormal.x) + Math.PI / 2,
        depth: major * (0.24 + surfaceProfile.craterSharpness * 0.16 + craterRng() * 0.2), floor: asteroidColor(rgb, 0.79),
        rim: asteroidColor(rgb, 1.06 + surfaceProfile.rimStrength * 0.2), shadow: asteroidColor(rgb, 0.4), age: c });
    }
    var normalizedCraters = craters.map(function (crater) {
      return { x: crater.x, y: crater.y, rx: crater.rx, ry: crater.ry,
        angle: crater.angle, depth: crater.depth };
    });
    craters.forEach(function (crater, craterIndex) {
      crater.normal = asteroidNormalAt(relief, normalizedCraters, crater.x, crater.y);
      crater.rimMask = [];
      for (var rimStep = 0; rimStep < 28; rimStep += 1) {
        var rimAngle = rimStep / 28 * Math.PI * 2;
        var rimX = crater.x + Math.cos(rimAngle) * crater.rx * Math.cos(crater.angle) -
          Math.sin(rimAngle) * crater.ry * Math.sin(crater.angle);
        var rimY = crater.y + Math.cos(rimAngle) * crater.rx * Math.sin(crater.angle) +
          Math.sin(rimAngle) * crater.ry * Math.cos(crater.angle);
        crater.rimMask.push(!normalizedCraters.slice(craterIndex + 1).some(function (newer) {
          var dx = rimX - newer.x, dy = rimY - newer.y;
          var nc = Math.cos(newer.angle), ns = Math.sin(newer.angle);
          return Math.hypot((dx * nc + dy * ns) / newer.rx, (-dx * ns + dy * nc) / newer.ry) < 1.08;
        }));
      }
      crater.x *= radius; crater.y *= radius; crater.rx *= radius; crater.ry *= radius; crater.depth *= radius;
    });
    var boundaryCount = 64;
    /** @type {number[][]} */
    var points = [];
    for (var i = 0; i < boundaryCount; i += 1) {
      var angle = i / boundaryCount * Math.PI * 2;
      var surface = sim.surfaceRadius(asteroid, angle);
      points.push([Math.cos(angle) * surface, Math.sin(angle) * surface]);
    }
    for (var interior = 0; interior < 125; interior += 1) {
      var interiorAngle = rng() * Math.PI * 2;
      var distance = Math.sqrt(rng()) * sim.surfaceRadius(asteroid, interiorAngle) * 0.94;
      points.push([Math.cos(interiorAngle) * distance, Math.sin(interiorAngle) * distance]);
    }
    /** @type {{ points: number[], composition: number[], normal: AsteroidNormal, occlusion: number, limb: number, color: number }[]} */
    var cells = [];
    /** @param {number[]} points */
    function addCell(points) {
      var x = 0, y = 0;
      for (var p = 0; p < points.length; p += 2) { x += points[p]; y += points[p + 1]; }
      x /= points.length / 2; y /= points.length / 2;
      var nx = x / radius, ny = y / radius;
      var composition = asteroidCompositionAt(bulk, fields, heterogeneity, nx, ny);
      // Static albedo carries only nondirectional relief. World-space lighting
      // belongs to the dynamic overlay so it does not rotate with the rock.
      var fineTexture = asteroidWave(nx, ny, seed * 0.00017, 13) * 0.014;
      var lightness = 0.96 + fineTexture;
      cells.push({ points: points, composition: composition,
        normal: asteroidNormalAt(relief, normalizedCraters, nx, ny),
        occlusion: asteroidOcclusionAt(normalizedCraters, nx, ny),
        limb: Math.sqrt(Math.max(0, 1 - Math.min(1, nx * nx + ny * ny))),
        color: asteroidCompositionColor(composition, lightness) });
    }
    asteroidTriangulation(points, radius).forEach(function (triangle) {
      var vertices = triangle.map(function (index) { return points[index]; });
      var checks = vertices.concat(vertices.map(function (point, index) {
        var next = vertices[(index + 1) % 3];
        return [(point[0] + next[0]) / 2, (point[1] + next[1]) / 2];
      }));
      if (!checks.every(function (point) {
        return Math.hypot(point[0], point[1]) <= sim.surfaceRadius(asteroid, Math.atan2(point[1], point[0])) + radius * 0.002;
      })) return;
      addCell(vertices.reduce(function (flat, point) { return flat.concat(point); }, []));
    });
    /** @type {{ x: number, y: number, radius: number, color: number }[]} */
    var pits = [];
    for (var pit = 0; pit < 16 + Math.floor(surfaceProfile.pittingDensity * 54 + rng() * 18); pit += 1) {
      var pitAngle = rng() * Math.PI * 2;
      var pitDistance = Math.sqrt(rng()) * sim.surfaceRadius(asteroid, pitAngle) * 0.82;
      var pitX = Math.cos(pitAngle) * pitDistance, pitY = Math.sin(pitAngle) * pitDistance;
      var pitComposition = asteroidCompositionAt(bulk, fields, heterogeneity, pitX / radius, pitY / radius);
      var pitBase = asteroidCompositionColor(pitComposition, 1);
      var pitRgb = [(pitBase >> 16) & 255, (pitBase >> 8) & 255, pitBase & 255];
      pits.push({ x: pitX, y: pitY, radius: radius * (0.003 + rng() * 0.008), color: asteroidColor(pitRgb, 0.62) });
    }
    /** @type {{ points: number[], color: number }[]} */
    var fractures = [];
    var fractureBase = asteroidCompositionColor(bulk, 1);
    var fractureRgb = [(fractureBase >> 16) & 255, (fractureBase >> 8) & 255, fractureBase & 255];
    for (var fracture = 0; fracture < 1 + Math.floor(surfaceProfile.fractureDensity * 7 + rng() * 2); fracture += 1) {
      var startAngle = rng() * Math.PI * 2;
      var startDistance = rng() * radius * 0.45;
      var fx = Math.cos(startAngle) * startDistance, fy = Math.sin(startAngle) * startDistance;
      var direction = rng() * Math.PI * 2;
      var fracturePoints = [fx, fy];
      for (var segment = 0; segment < 3 + Math.floor(rng() * 4); segment += 1) {
        direction += (rng() - 0.5) * 0.75;
        fx += Math.cos(direction) * radius * (0.035 + rng() * 0.045);
        fy += Math.sin(direction) * radius * (0.035 + rng() * 0.045);
        if (Math.hypot(fx, fy) > sim.surfaceRadius(asteroid, Math.atan2(fy, fx)) * 0.85) break;
        fracturePoints.push(fx, fy);
      }
      if (fracturePoints.length >= 6) fractures.push({ points: fracturePoints, color: asteroidColor(fractureRgb, 0.55) });
    }
    /** @type {{ x: number, y: number, radius: number, aspect: number, strength: number, normal: AsteroidNormal }[]} */
    var microBumps = [];
    var microCount = Math.round(260 + surfaceProfile.roughnessFreq * 520 + surfaceProfile.pittingDensity * 170);
    for (var micro = 0; micro < microCount; micro += 1) {
      var microAngle = surfaceRng() * Math.PI * 2;
      var microDistance = Math.sqrt(surfaceRng()) * 0.88;
      var microX = Math.cos(microAngle) * microDistance, microY = Math.sin(microAngle) * microDistance;
      var signal = asteroidWave(microX, microY, seed * 0.00023, 16 + surfaceProfile.roughnessFreq * 20) * 0.65 +
        asteroidWave(microX, microY, seed * 0.00037, 31 + surfaceProfile.roughnessFreq * 24) * 0.35;
      microBumps.push({ x: microX * radius, y: microY * radius,
        radius: radius * (0.003 + surfaceRng() * 0.006) * (0.72 + surfaceProfile.roughnessAmp * 0.55),
        aspect: 0.42 + surfaceRng() * 0.7,
        strength: (0.35 + Math.abs(signal) * 0.65) * surfaceProfile.roughnessAmp,
        normal: asteroidNormalAt(relief, normalizedCraters, microX, microY) });
    }
    var shape = points.slice(0, boundaryCount).reduce(function (flat, point) { return flat.concat(point); }, []);
    return { shape: shape, bulk: bulk, heterogeneity: heterogeneity, fields: fields, relief: relief,
      surfaceProfile: surfaceProfile, cells: cells, craters: craters, pits: pits, fractures: fractures,
      microBumps: microBumps };
  }

  // The shader description deliberately contains only bounded, normalized data.
  // Legacy polygon geometry is kept separate from this bounded shader data.
  /** @param {Asteroid} asteroid @param {number[]} [bulkOverride] @returns {import('./types').AsteroidVisual} */
  function asteroidVisualDescription(asteroid, bulkOverride) {
    var seed = 2166136261;
    for (var h = 0; h < asteroid.id.length; h += 1) seed = Math.imul(seed ^ asteroid.id.charCodeAt(h), 16777619);
    var rng = sim.createRng(seed >>> 0);
    var weights = [0.85 + rng() * 0.4, 0.85 + rng() * 0.4, 0.85 + rng() * 0.4, 0.85 + rng() * 0.4];
    var bulk = weights.map(function (weight) { return -Math.log(Math.max(0.000001, rng())) * weight; });
    var total = bulk.reduce(function (sum, value) { return sum + value; }, 0);
    bulk = bulk.map(function (value) { return value / total; });
    if (bulkOverride && bulkOverride.length === 4 && bulkOverride.every(function (value) { return Number.isFinite(value) && value >= 0; })) {
      var overrideTotal = bulkOverride.reduce(function (sum, value) { return sum + value; }, 0);
      if (overrideTotal > 0) bulk = bulkOverride.map(function (value) { return value / overrideTotal; });
    }
    var surfaceRng = sim.createRng((seed ^ 0x6d2b79f5) >>> 0);
    var surfaceProfile = asteroidSurfaceProfile(bulk, surfaceRng);
    var heterogeneity = rng();
    var fields = ASTEROID_PALETTES.map(function () {
      /** @type {{x: number; y: number; sigma: number; amp: number}[]} */
      var blobs = [];
      var count = Math.floor(rng() * (1 + Math.round(heterogeneity * 3)));
      for (var b = 0; b < count; b += 1) blobs.push({ x: rng() - 0.5, y: rng() - 0.5,
        sigma: 0.12 + rng() * 0.16, amp: -0.6 + rng() * 1.4 });
      return { low: rng() * 100, med: rng() * 100, blobs: blobs };
    });
    /** @type {AsteroidRelief} */
    var relief = { phase: rng() * 100, blobs: [] };
    for (var lump = 0; lump < 5; lump += 1) relief.blobs.push({ x: (rng() - 0.5) * 1.15,
      y: (rng() - 0.5) * 1.15, sigma: 0.22 + rng() * 0.22,
      amp: (rng() - 0.42) * (0.1 + surfaceProfile.boulderiness * 0.07) });
    /** @type {{x:number,y:number,rx:number,ry:number,angle:number,depth:number,age:number,rimScale:number,sizeClass:string}[]} */
    var craters = [];
    var craterRng = sim.createRng((seed ^ 0x9e3779b9) >>> 0);
    var craterCount = Math.min(ASTEROID_MAX_CRATERS,
      102 + Math.floor(craterRng() * 21 + surfaceProfile.pittingDensity * 33));
    for (var craterIndex = 0; craterIndex < craterCount; craterIndex += 1) {
      var sizeRoll = craterRng();
      var sizeClass = 'small';
      /** @type {number} */
      var major = 0;
      if (sizeRoll < 0.7) {
        major = 0.007 + Math.pow(craterRng(), 1.6) * 0.016;
      } else if (sizeRoll < 0.94) {
        sizeClass = 'medium'; major = 0.023 + craterRng() * 0.045;
      } else if (sizeRoll < 0.99) {
        sizeClass = 'large'; major = 0.072 + craterRng() * 0.065;
      } else {
        sizeClass = 'basin'; major = 0.15 + craterRng() * 0.11;
      }
      var locationAngle = craterRng() * Math.PI * 2;
      // Uniform visible-hemisphere surface area, projected onto the screen.
      // Compared with uniform disk pixels this correctly represents the much
      // larger amount of edge-on terrain compressed near the limb.
      var surfaceZ = craterRng();
      var projectedRadius = Math.sqrt(Math.max(0, 1 - surfaceZ * surfaceZ)) * 0.96;
      var directionalRadius = 0.88 + 0.07 * Math.cos(locationAngle * 3) +
        0.05 * Math.sin(locationAngle * 5);
      var locationDistance = projectedRadius * directionalRadius;
      var x = Math.cos(locationAngle) * locationDistance, y = Math.sin(locationAngle) * locationDistance;
      var patchNormal = asteroidNormalAt(relief, craters, x, y);
      var foreshorten = 0.52 + patchNormal.z * 0.43;
      var ageSoftening = 0.58 + (craterIndex / Math.max(1, craterCount - 1)) * 0.42;
      var basinSoftening = sizeClass === 'basin' ? 0.42 : (sizeClass === 'large' ? 0.76 : 1);
      craters.push({ x: x, y: y, rx: major, ry: major * foreshorten,
        angle: Math.atan2(patchNormal.y, patchNormal.x) + Math.PI / 2,
        depth: major * (0.22 + surfaceProfile.craterSharpness * 0.14 + craterRng() * 0.18) * basinSoftening,
        rimScale: ageSoftening * (sizeClass === 'basin' ? 0.42 : 1), age: craterIndex, sizeClass: sizeClass });
    }
    return { seed: relief.phase * 0.017, bulk: bulk, heterogeneity: heterogeneity,
      fields: fields, relief: relief, surfaceProfile: surfaceProfile,
      craters: craters };
  }

  /** @param {ReturnType<typeof asteroidVisualDescription>} visual */
  function asteroidShaderUniforms(visual) {
    var relief = new Float32Array(20);
    visual.relief.blobs.slice(0, 5).forEach(function (blob, i) { relief.set([blob.x, blob.y, blob.sigma, blob.amp], i * 4); });
    var fieldBlobs = new Float32Array(ASTEROID_MAX_FIELD_BLOBS * 4);
    var blobMaterial = new Float32Array(ASTEROID_MAX_FIELD_BLOBS);
    var blobIndex = 0;
    visual.fields.forEach(function (field, material) { field.blobs.forEach(function (blob) {
      if (blobIndex >= ASTEROID_MAX_FIELD_BLOBS) return;
      fieldBlobs.set([blob.x, blob.y, blob.sigma, blob.amp], blobIndex * 4); blobMaterial[blobIndex] = material; blobIndex += 1;
    }); });
    return { uLight: new Float32Array([WORLD_LIGHT.x, WORLD_LIGHT.y, WORLD_LIGHT.z]), uBulk: new Float32Array(visual.bulk),
      uFieldLow: new Float32Array(visual.fields.map(function (field) { return field.low; })),
      uFieldMed: new Float32Array(visual.fields.map(function (field) { return field.med; })),
      uProfile: new Float32Array([visual.surfaceProfile.roughnessAmp, visual.surfaceProfile.roughnessFreq,
        visual.surfaceProfile.grazingBoost, visual.surfaceProfile.pittingDensity]),
      uRelief: relief, uFieldBlobs: fieldBlobs, uBlobMaterial: blobMaterial,
      uCraterCount: visual.craters.length,
      uHeterogeneity: visual.heterogeneity, uSeed: visual.seed, uPixelFootprint: 0.01 };
  }

  /** Pack two normalized scalars into one RGBA8 texel at 16-bit precision.
   * @param {Uint8Array} bytes @param {number} texel @param {number} first @param {number} second
   */
  function packAsteroidCraterTexel(bytes, texel, first, second) {
    var a = Math.round(Math.max(0, Math.min(1, first)) * 65535);
    var b = Math.round(Math.max(0, Math.min(1, second)) * 65535);
    var offset = texel * 4;
    bytes[offset] = a >> 8; bytes[offset + 1] = a & 255;
    bytes[offset + 2] = b >> 8; bytes[offset + 3] = b & 255;
  }

  /** Shared raw data upload for both rendering backends. */
  /** @param {ReturnType<typeof asteroidVisualDescription>} visual */
  function asteroidCraterBytes(visual) {
    var image = { data: new Uint8Array(ASTEROID_CRATER_TEXTURE_WIDTH * 4) };
    visual.craters.forEach(function (crater, index) {
      var texel = index * ASTEROID_CRATER_TEXELS;
      packAsteroidCraterTexel(image.data, texel, (crater.x + 1.25) / 2.5, (crater.y + 1.25) / 2.5);
      packAsteroidCraterTexel(image.data, texel + 1, crater.rx / 0.3, crater.ry / 0.3);
      packAsteroidCraterTexel(image.data, texel + 2, (Math.cos(crater.angle) + 1) / 2,
        (Math.sin(crater.angle) + 1) / 2);
      packAsteroidCraterTexel(image.data, texel + 3, crater.depth / 0.12, crater.rimScale);
    });
    return image.data;
  }

  /** CPU reference used by deterministic tests and surface diagnostics.
   * @param {ReturnType<typeof asteroidVisualDescription>} visual @param {number} x @param {number} y
   */
  function asteroidSurfaceSample(visual, x, y) {
    return { height: asteroidHeightAt(visual.relief, visual.craters, x, y),
      normal: asteroidNormalAt(visual.relief, visual.craters, x, y),
      composition: asteroidCompositionAt(visual.bulk, visual.fields, visual.heterogeneity, x, y),
      occlusion: asteroidOcclusionAt(visual.craters, x, y) };
  }

  var ASTEROID_GEOLOGY_SHADER = [
    'precision highp float;',
    'varying vec2 vLocalCoord;',
    'uniform vec3 uLight;',
    'uniform vec4 uBulk;',
    'uniform vec4 uFieldLow;',
    'uniform vec4 uFieldMed;',
    'uniform vec4 uProfile;', // roughness amp/frequency, grazing boost, pitting
    'uniform vec4 uRelief[5];',
    'uniform vec4 uFieldBlobs[12];',
    'uniform float uBlobMaterial[12];',
    'uniform sampler2D uCraterData;',
    'uniform float uCraterTextureWidth;',
    'uniform float uCraterCount;',
    'uniform float uHeterogeneity;',
    'uniform float uSeed;',
    'uniform float uPixelFootprint;',
    'uniform vec4 uPocket;', // center x/y, radius, enabled
    'uniform vec4 uTunnel;', // angle, width, depth, enabled
    'uniform vec2 uCavityParallax;',
    'uniform vec2 uCavityShadow;',
    'const float PI=3.141592653589793;',
    'float sat(float x){return clamp(x,0.0,1.0);}',
    'float hash21(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123);}',
    'float valueNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);float a=hash21(i),b=hash21(i+vec2(1.0,0.0)),c=hash21(i+vec2(0.0,1.0)),d=hash21(i+vec2(1.0,1.0));return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);}',
    'float wave(vec2 p,float phase,float scale){return valueNoise(p*scale+vec2(phase*.73,phase*1.17))*2.0-1.0;}',
    'float filteredFbm(vec2 p,float phase,float baseFrequency,float footprint){float sum=0.0;float amplitude=1.0;float frequency=baseFrequency;for(int octave=0;octave<7;octave++){float visibility=1.0-smoothstep(.28,.72,frequency*footprint);if(visibility>.001){sum+=wave(p,phase+float(octave)*17.13,frequency)*amplitude*visibility;}frequency*=2.03;amplitude*=.49;}return sum;}',
    'float unpack16(vec2 bytes){return (bytes.x*65280.0+bytes.y*255.0)/65535.0;}',
    'vec4 craterTexel(float crater,float offset){return texture2D(uCraterData,vec2((crater*4.0+offset+.5)/uCraterTextureWidth,.5));}',
    'float boundary(vec2 p){float a=atan(p.y,p.x);return .88+.07*cos(a*3.0)+.05*sin(a*5.0);}',
    'float blobField(vec2 p,float material){float value=0.0;for(int i=0;i<12;i++){vec4 b=uFieldBlobs[i];if(abs(uBlobMaterial[i]-material)<.25&&b.z>0.0){vec2 d=p-b.xy;value+=b.w*exp(-dot(d,d)/(2.0*b.z*b.z));}}return value;}',
    'float baseReliefHeight(vec2 p){',
    ' float h=wave(p,uSeed,2.15)*.035;',
    ' for(int i=0;i<5;i++){vec4 b=uRelief[i];vec2 d=p-b.xy;h+=b.w*exp(-dot(d,d)/(2.0*b.z*b.z));}',
    ' return h;',
    '}',
    'float microRelief(vec2 p,float footprint){float f=13.0+uProfile.y*27.0;return filteredFbm(p,uSeed*1.73,f,footprint)*uProfile.x*.0055;}',
    'float reliefHeightAt(vec2 p,float footprint){return baseReliefHeight(p)+microRelief(p,footprint);}',
    // Analytic gradient of the boundary-shaped dome. Finite differences cross the
    // silhouette at high zoom and turn its former safety clamp into a visible band.
    'vec2 domeGradient(vec2 p){float r=length(p);if(r<.00001){return vec2(0.0);}float a=atan(p.y,p.x);float b=max(.001,boundary(p));float dbda=-.21*sin(a*3.0)+.25*cos(a*5.0);vec2 gradA=vec2(-p.y,p.x)/(r*r);vec2 gradQ=p/(r*b)-(r*dbda/(b*b))*gradA;float q=min(.999999,r/b);return (-.78*q/sqrt(max(.000001,1.0-q*q)))*gradQ;}',
    // Returns age-ordered crater height, analytic x/y slope, and occlusion.
    'vec4 craterSurface(vec2 p){',
    ' float h=0.0;vec2 grad=vec2(0.0);float occ=0.0;float overlaps=0.0;',
    ' for(int i=0;i<144;i++){if(float(i)<uCraterCount){float fi=float(i);vec4 p0=craterTexel(fi,0.0);vec4 p1=craterTexel(fi,1.0);vec4 a=vec4(unpack16(p0.rg)*2.5-1.25,unpack16(p0.ba)*2.5-1.25,unpack16(p1.rg)*.3,unpack16(p1.ba)*.3);vec2 d=p-a.xy;float bound=max(a.z,a.w)*1.35;',
    '  if(abs(d.x)<bound&&abs(d.y)<bound){vec4 p2=craterTexel(fi,2.0);vec4 p3=craterTexel(fi,3.0);vec4 b=vec4(unpack16(p2.rg)*2.0-1.0,unpack16(p2.ba)*2.0-1.0,unpack16(p3.rg)*.12,unpack16(p3.ba));vec2 e=vec2((d.x*b.x+d.y*b.y)/a.z,(-d.x*b.y+d.y*b.x)/a.w);float q=length(e);',
    '   if(q<1.35){float safeQ=max(q,.00001);vec2 dq=vec2((e.x*b.x/a.z-e.y*b.y/a.w)/safeQ,(e.x*b.y/a.z+e.y*b.x/a.w)/safeQ);',
    '    float t=clamp((q-.7)/.48,0.0,1.0);float mask=t*t*(3.0-2.0*t);float dm=(q>.7&&q<1.18)?6.0*t*(1.0-t)/.48:0.0;',
    '    float oldH=h;grad=grad*mask+oldH*dm*dq;h=oldH*mask;',
    '    if(q<1.0){float bowlBase=1.0-q*q;float bowl=-bowlBase*b.z;h+=bowl;grad+=2.0*b.z*q*dq;occ=max(occ,(1.0-q)*.42);overlaps+=1.0;}',
    // GLSL pow is undefined for negative bases, including an exponent of 2.
    // q < 1 is the entire crater interior: square with multiplication instead.
    '    float rimDistance=(q-1.0)/.16;float rim=exp(-rimDistance*rimDistance)*b.z*.34*b.w;h+=rim;grad+=rim*(-2.0*(q-1.0)/(.16*.16))*dq;',
    '   }',
    '  }',
    ' }}',
    ' return vec4(h,grad,min(.58,occ+max(0.0,overlaps-1.0)*.1));',
    '}',
    'vec3 normalAt(vec2 p,vec2 craterGradient,float footprint){float e=max(.00035,min(.0035,footprint*.7));float dx=(reliefHeightAt(p+vec2(e,0.0),footprint)-reliefHeightAt(p-vec2(e,0.0),footprint))/(2.0*e);float dy=(reliefHeightAt(p+vec2(0.0,e),footprint)-reliefHeightAt(p-vec2(0.0,e),footprint))/(2.0*e);vec2 gradient=domeGradient(p)+vec2(dx,dy)+craterGradient;return normalize(vec3(-gradient,1.0));}',
    'vec4 composition(vec2 p){',
    ' float broad=.18+uHeterogeneity*uHeterogeneity*2.45;float med=.06+uHeterogeneity*.52;float chunk=uHeterogeneity*uHeterogeneity*1.65;float temp=1.32-uHeterogeneity*.62;',
    ' vec4 score=log(max(uBulk,vec4(.000001)));',
    ' score.x+=broad*wave(p,uFieldLow.x,1.8)+med*wave(p,uFieldMed.x,5.0)+chunk*blobField(p,0.0);',
    ' score.y+=broad*wave(p,uFieldLow.y,1.8)+med*wave(p,uFieldMed.y,5.0)+chunk*blobField(p,1.0);',
    ' score.z+=broad*wave(p,uFieldLow.z,1.8)+med*wave(p,uFieldMed.z,5.0)+chunk*blobField(p,2.0);',
    ' score.w+=broad*wave(p,uFieldLow.w,1.8)+med*wave(p,uFieldMed.w,5.0)+chunk*blobField(p,3.0);',
    ' float peak=max(max(score.x,score.y),max(score.z,score.w));vec4 value=exp((score-peak)/temp);value=max(value/dot(value,vec4(1.0)),vec4(.03));return value/dot(value,vec4(1.0));',
    '}',
    'vec3 materialColor(vec4 c){return c.x*vec3(.627,.714,.761)+c.y*vec3(.471,.408,.361)+c.z*vec3(.569,.541,.494)+c.w*vec3(.494,.518,.502);}',
  ].join('\n') + '\n';

  DW.asteroidArt = {
    describe: asteroidVisualDescription,
    reliefAt: function (visual, x, y) { return asteroidReliefAt(visual.relief, visual.craters, x, y); },
    surfaceSample: asteroidSurfaceSample,
    uniforms: asteroidShaderUniforms,
    craterBytes: asteroidCraterBytes,
    shaderSource: ASTEROID_GEOLOGY_SHADER,
    craterTextureWidth: ASTEROID_CRATER_TEXTURE_WIDTH,
    light: WORLD_LIGHT,
    // Pure data helpers retained for the dormant legacy Pixi painter.
    legacyDescribe: legacyAsteroidVisualDescription,
    color: asteroidColor,
    compositionColor: asteroidCompositionColor
  };
})(window);
