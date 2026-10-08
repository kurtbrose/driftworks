(function (global) {
  'use strict';
  /** @typedef {import('./types').World} World */
  /** @typedef {import('./types').Vec2} Vec2 */
  /** @typedef {import('./types').Camera} Camera */
  /** @typedef {import('./types').Viewport} Viewport */
  /** @typedef {import('./types').Asteroid} Asteroid */
  /** @typedef {[number, number, number]} V3 */
  /** @typedef {{ yaw: number, tilt: number, height?: number }} Orbit */
  /** @typedef {{ right: V3, up: V3, back: V3, distance: number, focal: number }} View */
  /** @typedef {{ buffer: WebGLBuffer, count: number }} Mesh */
  /** @type {import('./types').DriftworksNamespace} */
  var DW = global.Driftworks;
  var sim = /** @type {import('./types').SimApi} */ (DW.sim);
  var FOCAL = 1 / Math.tan(Math.PI / 8);
  /** @type {Record<string, { radius: number, visual: import('./types').AsteroidVisual }>} */
  var geology = {};
  /** @param {Asteroid} asteroid */
  function visualFor(asteroid) {
    if (!DW.asteroidArt) throw new Error('Shared asteroid artwork did not load');
    var cached = geology[asteroid.id];
    if (!cached || cached.radius !== asteroid.radius) cached = geology[asteroid.id] = { radius: asteroid.radius, visual: DW.asteroidArt.describe(asteroid) };
    return cached.visual;
  }
  /** @type {Record<string, { radius: number, table: Float32Array }>} */
  var shells = {};
  /** Full-surface relief: lifted impact centers and round tangent-plane bowls. */
  /** @param {Asteroid} asteroid @param {V3} direction */
  function globeRelief(asteroid, direction) {
    var visual = visualFor(asteroid), h = 0;
    for (var side = 0; side < 2; side++) visual.craters.forEach(function (crater) {
      var r = sim.surfaceRadius(asteroid, Math.atan2(crater.y, crater.x)) / asteroid.radius;
      var cx = crater.x / (r * .96), cy = crater.y / (r * .96), cz = Math.sqrt(Math.max(.001, 1 - cx * cx - cy * cy));
      var length = Math.hypot(cx, cy, cz); cx /= length; cy /= length; cz /= length;
      var x = side ? -cy : cx, y = side ? cx : cy, z = side ? -cz : cz;
      var cosine = direction[0] * x + direction[1] * y + direction[2] * z;
      var size = crater.rx / (r * .96);
      if (cosine <= 0 || Math.hypot(direction[0] - x, direction[1] - y, direction[2] - z) >= size * 1.5) return;
      var q = Math.sqrt(Math.max(0, 1 - cosine * cosine)) / size;
      if (q >= 1.35) return;
      var t = Math.max(0, Math.min(1, (q - .7) / .48));
      h *= t * t * (3 - 2 * t);
      if (q < 1) h -= (1 - q * q) * crater.depth;
      var rim = (q - 1) / .16;
      h += Math.exp(-rim * rim) * crater.depth * .34 * crater.rimScale;
    });
    return h;
  }
  /** Cache angular relief once; voxel evaluation and picking share this shell. */
  /** @param {Asteroid} asteroid @param {V3} direction */
  function shellRadius(asteroid, direction) {
    var cached = shells[asteroid.id], nx = 128, ny = 64;
    if (!cached || cached.radius !== asteroid.radius) {
      var table = new Float32Array((nx + 1) * (ny + 1));
      var visual = visualFor(asteroid), broad = Object.assign({}, visual, { craters: [] });
      for (var iy = 0; iy <= ny; iy++) for (var ix = 0; ix <= nx; ix++) {
        var longitude = ix / nx * Math.PI * 2, latitude = iy / ny * Math.PI;
        /** @type {V3} */ var d = [Math.cos(longitude) * Math.sin(latitude), Math.sin(longitude) * Math.sin(latitude), Math.cos(latitude)];
        var w = d.map(function (v) { return Math.pow(Math.abs(v), 8); });
        var sum = w[0] + w[1] + w[2];
        var art = /** @type {NonNullable<typeof DW.asteroidArt>} */ (DW.asteroidArt);
        var relief = (art.reliefAt(broad, d[1], d[2]) * w[0] + art.reliefAt(broad, d[2], d[0]) * w[1] + art.reliefAt(broad, d[0], d[1]) * w[2]) / sum;
        table[ix + (nx + 1) * iy] = 1 + relief + globeRelief(asteroid, d);
      }
      cached = shells[asteroid.id] = { radius: asteroid.radius, table: table };
    }
    var gx = ((Math.atan2(direction[1], direction[0]) / (Math.PI * 2) + 1) % 1) * nx;
    var gy = Math.acos(Math.max(-1, Math.min(1, direction[2]))) / Math.PI * ny;
    var x = Math.floor(gx), y = Math.min(ny - 1, Math.floor(gy)), tx = gx - x, ty = gy - y;
    var a = cached.table[x + (nx + 1) * y] * (1 - tx) + cached.table[x + 1 + (nx + 1) * y] * tx;
    var b = cached.table[x + (nx + 1) * (y + 1)] * (1 - tx) + cached.table[x + 1 + (nx + 1) * (y + 1)] * tx;
    return a * (1 - ty) + b * ty;
  }
  /** @param {Asteroid} asteroid @param {V3} p */
  function outerField(asteroid, p) {
    var r = sim.surfaceRadius(asteroid, Math.atan2(p[1], p[0])) / asteroid.radius;
    /** @type {V3} */ var d = [p[0] / r, p[1] / r, p[2] / .78];
    var length = Math.hypot.apply(null, d);
    if (length < .000001) return -1;
    return length - shellRadius(asteroid, [d[0] / length, d[1] / length, d[2] / length]);
  }
  /** Surface attachments intersect the complete closed shell. */
  /** @param {Asteroid} asteroid @param {number} x @param {number} y @param {boolean} [lower] */
  function surfaceHeight(asteroid, x, y, lower) {
    var lo = 0, hi = .9, sign = lower ? -1 : 1;
    if (outerField(asteroid, [x, y, 0]) > 0) return 0;
    for (var i = 0; i < 24; i++) {
      var mid = (lo + hi) / 2;
      if (outerField(asteroid, [x, y, mid * sign]) < 0) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }

  /** @param {V3} a @param {V3} b */
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  /** @param {Camera} camera @param {Viewport} viewport @param {Orbit} orbit @returns {View} */
  function view(camera, viewport, orbit) {
    var s = Math.sin(orbit.yaw), c = Math.cos(orbit.yaw);
    var st = Math.sin(orbit.tilt), ct = Math.cos(orbit.tilt);
    return { right: [c, s, 0], up: [s * ct, -c * ct, st], back: [-s * st, c * st, ct],
      distance: viewport.height * FOCAL / (2 * camera.zoom), focal: FOCAL };
  }
  /** @param {V3} point @param {Camera} camera @param {Viewport} viewport @param {Orbit} orbit */
  function project(point, camera, viewport, orbit) {
    var v = view(camera, viewport, orbit);
    /** @type {V3} */
    var p = [point[0] - camera.x, point[1] - camera.y, point[2] - (orbit.height || 0)];
    var depth = v.distance - dot(p, v.back);
    return { x: viewport.width / 2 + dot(p, v.right) * v.focal * viewport.height / (2 * depth),
      y: viewport.height / 2 - dot(p, v.up) * v.focal * viewport.height / (2 * depth), depth: depth };
  }
  /** Ray/plane intersection uses the same perspective camera as rendering. */
  /** @param {Vec2} point @param {Camera} camera @param {Viewport} viewport @param {Orbit} orbit @param {number} [z] @returns {Vec2 | null} */
  function unproject(point, camera, viewport, orbit, z) {
    var v = view(camera, viewport, orbit);
    var sx = (point.x - viewport.width / 2) * 2 / (viewport.height * v.focal);
    var sy = -(point.y - viewport.height / 2) * 2 / (viewport.height * v.focal);
    /** @type {V3} */
    var ray = [sx * v.right[0] + sy * v.up[0] - v.back[0],
      sx * v.right[1] + sy * v.up[1] - v.back[1], sy * v.up[2] - v.back[2]];
    if (Math.abs(ray[2]) < 0.00001) return null;
    var t = ((z || 0) - (orbit.height || 0) - v.back[2] * v.distance) / ray[2];
    if (t <= 0) return null;
    return { x: camera.x + v.back[0] * v.distance + ray[0] * t,
      y: camera.y + v.back[1] * v.distance + ray[1] * t };
  }

  /** Ray cast against the same local solid used to generate the asteroid mesh. */
  /** @param {Vec2} point @param {Asteroid} asteroid @param {Camera} camera @param {Viewport} viewport @param {Orbit} orbit */
  function pickAsteroid(point, asteroid, camera, viewport, orbit) {
    var v = view(camera, viewport, orbit);
    var sx = (point.x - viewport.width / 2) * 2 / (viewport.height * v.focal);
    var sy = -(point.y - viewport.height / 2) * 2 / (viewport.height * v.focal);
    /** @type {V3} */ var ray = [sx * v.right[0] + sy * v.up[0] - v.back[0],
      sx * v.right[1] + sy * v.up[1] - v.back[1], sy * v.up[2] - v.back[2]];
    var length = Math.hypot.apply(null, ray);
    ray = [ray[0] / length, ray[1] / length, ray[2] / length];
    var c = Math.cos(asteroid.rotation), s = Math.sin(asteroid.rotation), r = asteroid.radius;
    var ox = camera.x + v.back[0] * v.distance - asteroid.position.x;
    var oy = camera.y + v.back[1] * v.distance - asteroid.position.y;
    /** @type {V3} */ var origin = [(ox * c + oy * s) / r, (-ox * s + oy * c) / r, ((orbit.height || 0) + v.back[2] * v.distance) / r];
    /** @type {V3} */ var direction = [ray[0] * c + ray[1] * s, -ray[0] * s + ray[1] * c, ray[2]];
    var b = dot(origin, direction), discriminant = b * b - dot(origin, origin) + 1.21;
    if (discriminant < 0) return null;
    var first = Math.max(0, -b - Math.sqrt(discriminant)), last = -b + Math.sqrt(discriminant);
    for (var t = first; t <= last; t += 0.008) {
      /** @type {V3} */ var p = [origin[0] + direction[0] * t, origin[1] + direction[1] * t, origin[2] + direction[2] * t];
      if (rockField(asteroid, p) <= 0) {
        var travel = t * r;
        /** @type {V3} */ var worldPoint = [camera.x + v.back[0] * v.distance + ray[0] * travel,
          camera.y + v.back[1] * v.distance + ray[1] * travel, (orbit.height || 0) + v.back[2] * v.distance + ray[2] * travel];
        return { position: worldPoint, depth: project(worldPoint, camera, viewport, orbit).depth };
      }
    }
    return null;
  }

  /** Surface attachment height is presentation-only and rotates with the body. */
  /** @param {import('./types').Platform} platform @param {Asteroid | undefined} asteroid */
  function platformHeight(platform, asteroid) {
    if (!asteroid) return 0;
    var e = asteroid.excavation;
    if (e && e.level > 0) return -Math.min(0.42 * asteroid.radius, Math.max(0.03 * asteroid.radius, e.depthM / sim.METERS_PER_UNIT));
    var x = platform.position.x - asteroid.position.x, y = platform.position.y - asteroid.position.y;
    var c = Math.cos(asteroid.rotation), s = Math.sin(asteroid.rotation);
    return asteroid.radius * surfaceHeight(asteroid, (x * c + y * s) / asteroid.radius, (-x * s + y * c) / asteroid.radius);
  }

  /** Elevate an inspection target onto the visible rock instead of zooming inside it. */
  /** @param {World} world */
  function inspectionHeight(world) {
    var camera = world.camera;
    var a = world.asteroids.find(function (a) { return Math.hypot(camera.x - a.position.x, camera.y - a.position.y) < a.radius * 0.85; });
    if (!a) {
      var scale = Math.pow(Math.max(1, Math.min(32, camera.zoom)), .95) / Math.min(32, camera.zoom);
      var home = world.ships.find(function (ship) { return ship.type === 'mothership' && Math.hypot(camera.x - ship.position.x, camera.y - ship.position.y) < 40 * scale; });
      return home ? (30 * scale + 2) * Math.max(0, Math.min(1, (camera.zoom - 4) / 8)) : 0;
    }
    var e = a.excavation;
    var x = camera.x - a.position.x, y = camera.y - a.position.y;
    var c = Math.cos(a.rotation), s = Math.sin(a.rotation);
    var surface = e && e.level > 0 ? -Math.min(0.42 * a.radius, Math.max(0.03 * a.radius, e.depthM / sim.METERS_PER_UNIT)) :
      a.radius * surfaceHeight(a, (x * c + y * s) / a.radius, (-x * s + y * c) / a.radius) + a.radius * 0.03;
    var blend = Math.max(0, Math.min(1, (camera.zoom - 0.8) / 1.2));
    return surface * blend;
  }

  /** @param {V3} p @param {V3} a @param {V3} b */
  function segmentDistance(p, a, b) {
    /** @type {V3} */ var d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    /** @type {V3} */ var q = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
    var t = Math.max(0, Math.min(1, dot(q, d) / Math.max(0.000001, dot(d, d))));
    return Math.hypot(q[0] - t * d[0], q[1] - t * d[1], q[2] - t * d[2]);
  }
  /** Solid field in asteroid-local normalized coordinates; negative means rock. */
  /** @param {Asteroid} asteroid @param {V3} p */
  function rockField(asteroid, p) {
    var outer = outerField(asteroid, p);
    var e = asteroid.excavation;
    if (!e || e.level <= 0) return outer;
    var depth = Math.min(0.42, Math.max(0.03, e.depthM / sim.METERS_PER_UNIT / asteroid.radius));
    /** @type {V3} */ var center = [e.pocketOffset.x, e.pocketOffset.y, -depth];
    /** @type {V3} */ var entrance = [Math.cos(e.tunnelAngle) * 1.08, Math.sin(e.tunnelAngle) * 1.08, -depth];
    /** @type {V3} */ var bend = [Math.cos(e.tunnelAngle + e.tunnelTurn) * 0.43,
      Math.sin(e.tunnelAngle + e.tunnelTurn) * 0.43, -depth - 0.035];
    var cavity = Math.hypot(p[0] - center[0], p[1] - center[1], p[2] - center[2]) - e.pocketRadius;
    var tunnel = Math.min(segmentDistance(p, entrance, bend), segmentDistance(p, bend, center)) - 0.062;
    // Remove upper rock through the chamber center. All exposed faces are meshed.
    return Math.max(outer, p[2] + depth, -Math.min(cavity, tunnel));
  }

  /** Marching tetrahedra: cached closed solid including cut face and cavity walls. */
  /** @param {Asteroid} asteroid @param {number} [resolution] */
  function asteroidMesh(asteroid, resolution) {
    var n = resolution || 88, stride = n + 1;
    var field = new Float32Array(stride * stride * stride);
    var step = 2.2 / n;
    /** @param {number} x @param {number} y @param {number} z @returns {V3} */
    function point(x, y, z) { return [-1.1 + x * step, -1.1 + y * step, -1.1 + z * step]; }
    /** @param {number} x @param {number} y @param {number} z */
    function index(x, y, z) { return x + stride * (y + stride * z); }
    /** @param {V3} p */
    function sampledField(p) { return rockField(asteroid, p); }
    for (var z = 0; z <= n; z++) for (var y = 0; y <= n; y++) for (var x = 0; x <= n; x++) {
      field[index(x, y, z)] = rockField(asteroid, point(x, y, z));
    }
    var corners = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]];
    var tetrahedra = [[0, 5, 1, 6], [0, 1, 2, 6], [0, 2, 3, 6], [0, 3, 7, 6], [0, 7, 4, 6], [0, 4, 5, 6]];
    /** @type {number[]} */ var output = [];
    /** @param {V3} p */
    function vertex(p) {
      var h = 0.0005;
      var dx = sampledField([p[0] + h, p[1], p[2]]) - sampledField([p[0] - h, p[1], p[2]]);
      var dy = sampledField([p[0], p[1] + h, p[2]]) - sampledField([p[0], p[1] - h, p[2]]);
      var dz = sampledField([p[0], p[1], p[2] + h]) - sampledField([p[0], p[1], p[2] - h]);
      var length = Math.hypot(dx, dy, dz) || 1;
      output.push(p[0], p[1], p[2], dx / length, dy / length, dz / length);
    }
    for (var iz = 0; iz < n; iz++) for (var iy = 0; iy < n; iy++) for (var ix = 0; ix < n; ix++) {
      var values = corners.map(function (c) { return field[index(ix + c[0], iy + c[1], iz + c[2])]; });
      if (values.every(function (v) { return v >= 0; }) || values.every(function (v) { return v < 0; })) continue;
      var points = corners.map(function (c) { return point(ix + c[0], iy + c[1], iz + c[2]); });
      tetrahedra.forEach(function (tet) {
        var inside = tet.filter(function (i) { return values[i] < 0; });
        var outside = tet.filter(function (i) { return values[i] >= 0; });
        /** @param {number} a @param {number} b @returns {V3} */
        function edge(a, b) {
          var t = values[a] / (values[a] - values[b]);
          return [points[a][0] + t * (points[b][0] - points[a][0]),
            points[a][1] + t * (points[b][1] - points[a][1]), points[a][2] + t * (points[b][2] - points[a][2])];
        }
        if (inside.length === 1) outside.forEach(function (b) { vertex(edge(inside[0], b)); });
        if (inside.length === 3) inside.forEach(function (a) { vertex(edge(a, outside[0])); });
        if (inside.length === 2) {
          var a = edge(inside[0], outside[0]), b = edge(inside[0], outside[1]);
          var c = edge(inside[1], outside[0]), d = edge(inside[1], outside[1]);
          [a, b, c, b, d, c].forEach(vertex);
        }
      });
    }
    return new Float32Array(output);
  }

  /** @returns {Float32Array} */
  function boxMesh() {
    /** @type {number[]} */ var data = [];
    var faces = [[0, 1, 2], [0, 2, 3]];
    for (var axis = 0; axis < 3; axis++) for (var sign = -1; sign <= 1; sign += 2) {
      var a = (axis + 1) % 3, b = (axis + 2) % 3;
      var corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
      faces.forEach(function (face) { face.forEach(function (i) {
        var p = [0, 0, 0], normal = [0, 0, 0];
        p[axis] = sign; p[a] = corners[i][0]; p[b] = corners[i][1]; normal[axis] = sign;
        data.push.apply(data, p.concat(normal));
      }); });
    }
    return new Float32Array(data);
  }

  /** Translate the existing rounded 72 x 34 habitat silhouette into a drum. */
  function habitatMesh() {
    /** @type {number[]} */ var data = [];
    var rings = [-36, -35.9, -35.5, -35, -34, -33, -32, -31, 31, 32, 33, 34, 35, 35.5, 35.9, 36];
    /** @param {number} x */
    function radius(x) { return Math.abs(x) <= 31 ? 17 : 12 + Math.sqrt(Math.max(0, 25 - Math.pow(Math.abs(x) - 31, 2))); }
    /** @param {number} x @param {number} angle @param {number} [cap] */
    function vertex(x, angle, cap) {
      var r = radius(x), slope = Math.abs(x) <= 31 ? 0 : -(Math.abs(x) - 31) * Math.sign(x) / Math.sqrt(Math.max(.001, 25 - Math.pow(Math.abs(x) - 31, 2)));
      var length = Math.hypot(1, slope);
      data.push(x, r * Math.sin(angle), r * Math.cos(angle), cap || -slope / length, cap ? 0 : Math.sin(angle) / length, cap ? 0 : Math.cos(angle) / length);
    }
    for (var ring = 0; ring < rings.length - 1; ring++) for (var i = 0; i < 96; i++) {
      var a = i * Math.PI * 2 / 96, b = (i + 1) * Math.PI * 2 / 96;
      vertex(rings[ring], a); vertex(rings[ring + 1], a); vertex(rings[ring + 1], b);
      vertex(rings[ring], a); vertex(rings[ring + 1], b); vertex(rings[ring], b);
    }
    [-1, 1].forEach(function (side) {
      for (var i = 0; i < 96; i++) {
        data.push(side * 36, 0, 0, side, 0, 0);
        vertex(side * 36, i * Math.PI * 2 / 96, side); vertex(side * 36, (i + 1) * Math.PI * 2 / 96, side);
      }
    });
    return new Float32Array(data);
  }

  /** Rounded extrusions for the original bearing, spine and fixed machinery. */
  /** @param {number} width @param {number} length @param {number} depth @param {number} radius */
  function roundedHullMesh(width, length, depth, radius) {
    /** @type {number[]} */ var data = [];
    /** @type {Vec2[]} */ var outline = [];
    for (var corner = 0; corner < 4; corner++) {
      var angle = corner * Math.PI / 2;
      var cx = Math.cos(angle + Math.PI / 4) > 0 ? width / 2 - radius : -width / 2 + radius;
      var cy = Math.sin(angle + Math.PI / 4) > 0 ? length / 2 - radius : -length / 2 + radius;
      for (var i = 0; i <= 8; i++) { var t = angle + i * Math.PI / 16; outline.push({ x: cx + Math.cos(t) * radius, y: cy + Math.sin(t) * radius }); }
    }
    outline.forEach(function (p, i) {
      var q = outline[(i + 1) % outline.length], nx = q.y - p.y, ny = p.x - q.x;
      var len = Math.hypot(nx, ny) || 1; nx /= len; ny /= len;
      data.push(p.x,p.y,-depth/2,nx,ny,0, q.x,q.y,-depth/2,nx,ny,0, q.x,q.y,depth/2,nx,ny,0,
        p.x,p.y,-depth/2,nx,ny,0, q.x,q.y,depth/2,nx,ny,0, p.x,p.y,depth/2,nx,ny,0);
      [-1, 1].forEach(function (side) { data.push(0,0,side*depth/2,0,0,side, p.x,p.y,side*depth/2,0,0,side, q.x,q.y,side*depth/2,0,0,side); });
    });
    return new Float32Array(data);
  }

  /** @param {HTMLElement} host @param {() => World} getWorld @param {(world: World) => void} setWorld @param {{study?: boolean}} [options] */
  function create(host, getWorld, setWorld, options) {
    var study = !!(options && options.study);
    var canvas = document.createElement('canvas');
    canvas.setAttribute('aria-label', '3D tactical scene');
    var context = canvas.getContext('webgl', { antialias: true, alpha: true });
    if (!context) throw new Error('The 3D prototype requires WebGL. Use ?renderer=2d for the existing renderer.');
    var gl = context;
    if (!DW.asteroidArt) throw new Error('Shared asteroid artwork did not load');
    var art = DW.asteroidArt;
    var background = document.createElement('div'); background.className = 'night-sky-background';
    host.appendChild(background); host.appendChild(canvas);
    var overlay = document.createElement('canvas'); overlay.className = 'scene3d-overlay'; host.appendChild(overlay);
    var overlayContext = overlay.getContext('2d');
    if (!overlayContext) throw new Error('Missing tactical overlay context');
    var hud = overlayContext;
    var toolbar = document.createElement('div'); toolbar.className = 'scene3d-controls';
    toolbar.innerHTML = '<strong>3D RTS prototype</strong><span>Alt + drag: orbit · Middle / Space + drag: pan · Wheel: zoom</span><button type="button" data-cut>Cutaway</button><button type="button" data-orbit aria-label="Orbit camera">Orbit ↻</button><button type="button" data-overview>Overview</button><button type="button" data-top>Top view</button><button type="button" data-under>Underside</button><a href="?renderer=2d">2D renderer</a>';
    host.appendChild(toolbar);
    /** @type {Orbit} */ var orbit = { yaw: 0, tilt: 0.48 };
    var focus = false, space = false, stress = false, fps = 0;
    /** @type {{ start: Vec2, last: Vec2, mode: string } | null} */ var drag = null;
    /** @type {{ event: import('./types').CombatEvent, age: number }[]} */ var effects = [];
    /** @type {Record<string, { key: string, mesh: Mesh, texture: WebGLTexture, visual: import('./types').AsteroidVisual }>} */ var rocks = {};
    /** @param {number} type @param {string} source */
    function shader(type, source) {
      var s = gl.createShader(type); if (!s) throw new Error('Shader allocation failed');
      gl.shaderSource(s, source); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'Shader compilation failed');
      return s;
    }
    var program = gl.createProgram(); if (!program) throw new Error('Program allocation failed');
    gl.attachShader(program, shader(gl.VERTEX_SHADER,
      'attribute vec3 aPosition,aNormal; uniform vec3 uOrigin,uScale,uTarget,uRight,uUp,uBack; uniform vec4 uView; uniform float uRotation; varying vec3 vNormal,vLocal; varying float vDepth; void main(){ float c=cos(uRotation),s=sin(uRotation); vec3 p=aPosition*uScale; p=vec3(c*p.x-s*p.y,s*p.x+c*p.y,p.z)+uOrigin-uTarget; vec3 n=aNormal/uScale; vNormal=normalize(vec3(c*n.x-s*n.y,s*n.x+c*n.y,n.z)); vLocal=aPosition; float d=uView.x-dot(p,uBack); vDepth=d; float far=uView.x+30000.; gl_Position=vec4(dot(p,uRight)*uView.y/uView.z,dot(p,uUp)*uView.y,((far+.1)/(far-.1))*d-2.*far*.1/(far-.1),d); }'));
    gl.attachShader(program, shader(gl.FRAGMENT_SHADER, art.shaderSource +
      '\nvarying vec3 vNormal,vLocal; varying float vDepth; uniform vec3 uColor,uBack; uniform float uRock,uRotation,uCut,uCutHeight,uHabitat,uSpin,uHullFootprint;\n'+
      'vec3 rotateNormal(vec3 n){float c=cos(uRotation),s=sin(uRotation);return vec3(c*n.x-s*n.y,s*n.x+c*n.y,n.z);}\n'+
      'float stripe(float value,float center,float halfWidth,float aa){return 1.-smoothstep(halfWidth,halfWidth+aa,abs(value-center));}\n'+
      'float angularDistance(float a,float b){return abs(mod(a-b+PI,2.*PI)-PI);}\n'+
      // Evaluate crater disks on the unit sphere, rather than projecting every
      // face through XY. The back population is rotated to avoid a mirrored map.
      'vec4 globeCraters(vec3 p){float h=0.;vec3 grad=vec3(0.);float occ=0.;'+
      'for(int side=0;side<2;side++){for(int i=0;i<144;i++){if(float(i)<uCraterCount){float fi=float(i);vec4 t0=craterTexel(fi,0.);vec4 t1=craterTexel(fi,1.);vec2 xy=vec2(unpack16(t0.rg),unpack16(t0.ba))*2.5-1.25;float r=boundary(xy);vec2 uv=xy/(r*.96);vec3 center=normalize(vec3(uv,sqrt(max(.001,1.-dot(uv,uv)))));'+
      'if(side==1)center=vec3(-center.y,center.x,-center.z);float size=unpack16(t1.rg)*.3/(r*.96);float cosine=dot(p,center);if(cosine>0.&&length(p-center)<size*1.5){vec4 t3=craterTexel(fi,3.);float depth=unpack16(t3.rg)*.12;float rimScale=unpack16(t3.ba);vec3 delta=p-center*cosine;float distance=length(delta);float q=distance/max(.001,size);if(q<1.35){vec3 dq=distance>.00001?delta/(distance*size):vec3(0.);float t=clamp((q-.7)/.48,0.,1.);float mask=t*t*(3.-2.*t);float dm=(q>.7&&q<1.18)?6.*t*(1.-t)/.48:0.;grad=grad*mask+h*dm*dq;h*=mask;if(q<1.){h-=(1.-q*q)*depth;grad+=2.*depth*q*dq;occ=max(occ,(1.-q)*.42);}float rd=(q-1.)/.16;float rim=exp(-rd*rd)*depth*.34*rimScale;h+=rim;grad+=rim*(-2.*(q-1.)/(.16*.16))*dq;}}}}}return vec4(grad,min(.58,occ));}\n'+
      'vec3 globeWeights(vec3 p){vec3 w=pow(abs(p),vec3(8.));return w/(w.x+w.y+w.z);}\n'+
      'float globeMicro(vec3 p,float fp){vec3 w=globeWeights(p);return microRelief(p.yz,fp)*w.x+microRelief(p.zx,fp)*w.y+microRelief(p.xy,fp)*w.z;}\n'+
      'vec3 globeColor(vec3 p){vec3 w=globeWeights(p);return materialColor(composition(p.yz))*w.x+materialColor(composition(p.zx))*w.y+materialColor(composition(p.xy))*w.z;}\n'+
      'void main(){vec3 n=normalize(vNormal);vec3 light=normalize(uLight);vec3 col=uColor;'+
      'if(uRock>.5){vec2 p=vLocal.xy;float q=length(p)/boundary(p);float footprint=uPixelFootprint;'+
      'float dome=.78*sqrt(max(0.,1.-q*q));float exterior=uCut<.5?1.:step(abs(abs(vLocal.z)-dome),.12);'+
      'vec3 sphere=normalize(vec3(vLocal.xy/boundary(p),vLocal.z/.78));vec4 crater=globeCraters(sphere);float occ=crater.w*exterior;'+
      'if(exterior>.5){float e=max(.00045,min(.004,footprint*.8));vec3 gradient=vec3(globeMicro(sphere+vec3(e,0,0),footprint)-globeMicro(sphere-vec3(e,0,0),footprint),globeMicro(sphere+vec3(0,e,0),footprint)-globeMicro(sphere-vec3(0,e,0),footprint),globeMicro(sphere+vec3(0,0,e),footprint)-globeMicro(sphere-vec3(0,0,e),footprint))/(2.*e);gradient+=crater.xyz;vec3 bump=rotateNormal(gradient-sphere*dot(gradient,sphere));n=normalize(n-bump);}'+
      'else{float e=max(.00045,min(.004,footprint*.8));vec2 gradient=vec2(microRelief(p+vec2(e,0),footprint)-microRelief(p-vec2(e,0),footprint),microRelief(p+vec2(0,e),footprint)-microRelief(p-vec2(0,e),footprint))/(2.*e);vec3 bump=rotateNormal(vec3(-gradient,0));n=normalize(n+(bump-n*dot(bump,n))*.6);occ=clamp((uCutHeight-vLocal.z)*1.1,0.,.22);}'+
      'float ndl=dot(n,light);float lit=pow(max(0.,ndl),.82);float limb=exterior>.5?sqrt(max(0.,dot(n,uBack))):1.;'+
      'float rough=globeMicro(sphere,footprint)/max(.001,uProfile.x*.011);float grazing=pow(1.-sat(ndl),1.25);'+
      'float brightness=(.22+lit*.98)*(.66+limb*.34)-occ+rough*uProfile.z*grazing*.16;'+
      'col=globeColor(sphere)*clamp(brightness,.12,1.28);col+=vec3(1.,.94,.81)*pow(max(0.,ndl),8.)*.035;'+
      '}else if(uHabitat>.5){float aa=max(.015,uHullFootprint);float theta=atan(vLocal.y,vLocal.z);float diffuse=max(0.,dot(n,light));col=vec3(.49,.529,.565)*(.61+diffuse*.55);'+
      'float bands=1.-smoothstep(0.,.055+aa*.018,abs(sin((theta-uSpin)*3.)));col=mix(col,vec3(.74,.85,.89),bands*.25);'+
      'float ribs=max(max(stripe(vLocal.x,-25.,.42,aa),stripe(vLocal.x,-15.,.42,aa)),max(stripe(vLocal.x,15.,.42,aa),stripe(vLocal.x,25.,.42,aa)));col=mix(col,vec3(.21,.29,.33),ribs*.72);'+
      'float lampA=1.-smoothstep(1.25,1.25+aa,length(vec2(vLocal.x+26.,angularDistance(theta,uSpin)*17.)));float lampB=1.-smoothstep(1.25,1.25+aa,length(vec2(vLocal.x-26.,angularDistance(theta,uSpin+PI)*17.)));col=mix(col,vec3(.74,.88,.92),max(lampA,lampB));'+
      'float panelY=angularDistance(theta,uSpin+.72)*16.5;float panel=stripe(vLocal.x,22.5,4.5,aa)*stripe(panelY,0.,2.,aa);float border=stripe(vLocal.x,22.5,5.2,aa)*stripe(panelY,0.,2.7,aa);col=mix(col,vec3(.91,.76,.43),max(0.,border-panel)*.8);col=mix(col,vec3(.23,.28,.30),panel*.9);'+
      'float end=1.-smoothstep(31.,36.,abs(vLocal.x));col*=.65+.35*end;'+
      '}else{col*=.61+.55*max(0.,dot(n,light));}gl_FragColor=vec4(col,1.);}'));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || 'Shader linking failed');
    gl.useProgram(program); gl.enable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
    var pos = gl.getAttribLocation(program, 'aPosition'), normal = gl.getAttribLocation(program, 'aNormal');
    /** @type {Record<string, WebGLUniformLocation | null>} */ var uniforms = {};
    ['Origin', 'Scale', 'Target', 'Right', 'Up', 'Back', 'View', 'Rotation', 'Color', 'Rock', 'Light', 'Bulk', 'FieldLow', 'FieldMed', 'Profile', 'Relief', 'FieldBlobs', 'BlobMaterial', 'CraterData', 'CraterTextureWidth', 'CraterCount', 'Heterogeneity', 'Seed', 'PixelFootprint', 'Cut', 'CutHeight', 'Habitat', 'Spin', 'HullFootprint'].forEach(function (name) { uniforms[name] = gl.getUniformLocation(program, 'u' + name); });
    gl.uniform3fv(uniforms.Light, [-0.813733, -0.581238, 0.68]);
    /** @param {import('./types').AsteroidVisual} visual */
    function craterTexture(visual) {
      var texture = gl.createTexture(); if (!texture) throw new Error('Crater texture allocation failed');
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 576, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, art.craterBytes(visual));
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return texture;
    }
    /** @param {Float32Array} data @returns {Mesh} */
    function upload(data) {
      var buffer = gl.createBuffer(); if (!buffer) throw new Error('Mesh allocation failed');
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      return { buffer: buffer, count: data.length / 6 };
    }
    var box = upload(boxMesh());
    var grid = upload(new Float32Array(600));
    var habitat = upload(habitatMesh());
    var bearing = upload(roundedHullMesh(24, 38, 8, 3));
    var spine = upload(roundedHullMesh(17, 58, 8, 2.5));
    var hatch = upload(roundedHullMesh(11, 8, 1, 2));
    /** @param {Mesh} mesh @param {V3} origin @param {V3} scale @param {number} rotation @param {V3} color @param {boolean} [rock] @param {boolean} [lines] */
    function draw(mesh, origin, scale, rotation, color, rock, lines) {
      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.buffer);
      gl.enableVertexAttribArray(pos); gl.enableVertexAttribArray(normal);
      gl.vertexAttribPointer(pos, 3, gl.FLOAT, false, 24, 0); gl.vertexAttribPointer(normal, 3, gl.FLOAT, false, 24, 12);
      gl.uniform3fv(uniforms.Origin, origin); gl.uniform3fv(uniforms.Scale, scale); gl.uniform3fv(uniforms.Color, color);
      gl.uniform1f(uniforms.Rotation, rotation); gl.uniform1f(uniforms.Rock, rock ? 1 : 0);
      gl.drawArrays(lines ? gl.LINES : gl.TRIANGLES, 0, mesh.count);
    }
    /** Existing layout in ship-local coordinates; only the habitat surface spins. */
    /** @param {number} x @param {number} y @param {number} scale @param {number} rotation @param {number} elapsed */
    function drawMothership(x, y, scale, rotation, elapsed) {
      var c = Math.cos(rotation), s = Math.sin(rotation);
      /** @param {Mesh} mesh @param {V3} local @param {V3} size @param {V3} color @param {number} [angle] */
      function part(mesh, local, size, color, angle) {
        draw(mesh, [x + (local[0] * c - local[1] * s) * scale, y + (local[0] * s + local[1] * c) * scale, local[2] * scale],
          [size[0] * scale, size[1] * scale, size[2] * scale], rotation + (angle || 0), color);
      }
      var game = /** @type {{ mothershipHabitatUniforms: (elapsed: number, rotation: number, scale: number) => { uSpin: number } }} */ (DW.game);
      var phase = game.mothershipHabitatUniforms(elapsed, rotation, scale).uSpin;
      var projected = project([x, y, 0], getWorld().camera, viewport(), orbit);
      var v = view(getWorld().camera, viewport(), orbit);
      gl.uniform1f(uniforms.Spin, phase);
      gl.uniform1f(uniforms.HullFootprint, Math.max(.01, projected.depth / v.distance / (scale * getWorld().camera.zoom)));
      gl.uniform1f(uniforms.Habitat, 1);
      part(habitat, [0, 0, 0], [1, 1, 1], [.49, .529, .565]);
      gl.uniform1f(uniforms.Habitat, 0);
      part(bearing, [0, 0, 17], [1, 1, 1], [.08, .13, .16]);
      [-12.5, 12.5].forEach(function (by) {
        part(box, [0, by, 21.2], [11, 2.5, .7], [.2, .26, .3]);
        part(box, [0, by - 2, 22], [10, .3, .25], [.56, .81, .77]);
        var travel = (elapsed * 4.5) % 16;
        part(box, [-8 + travel, by, 22], [.65, .65, .35], [.72, .95, .86]);
      });
      part(spine, [0, 0, 25], [1, 1, 1], [.396, .463, .502]);
      [-7, -4.5, 4.5, 7].forEach(function (px) {
        part(box, [px, 0, 29.15], [.18, 25.5, .15], px === -7 ? [.72, .8, .82] : [.1, .16, .2]);
      });
      [-21, 21].forEach(function (py) {
        part(hatch, [0, py, 29.7], [1, 1, 1], [.09, .16, .2]);
        part(box, [0, py, 30.4], [3.5, .4, .2], [.61, .72, .76]);
        part(box, [0, py, 10], [4, 2, 10], [.16, .23, .27]);
      });
      [[-12, -20], [12, 20]].forEach(function (p) {
        part(box, [p[0], p[1], 23], [3, 5, 3], [.17, .24, .27]);
        part(box, [p[0] - 1, p[1], 26.2], [.35, 4, .2], [.61, .7, .74]);
      });
      part(box, [0, -32, 27], [.45, 3, .45], [.57, .67, .7]);
      part(box, [2.5, -37, 27], [.45, 3.2, .45], [.57, .67, .7], .9);
      part(box, [5, -39, 27], [.8, .8, .8], [.72, .95, .86]);
    }
    /** @returns {Viewport} */ function viewport() { return { width: host.clientWidth, height: host.clientHeight }; }
    /** @param {PointerEvent | WheelEvent} e */
    function pointer(e) { var r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
    function unlock() { if (DW.audio) DW.audio.unlock(); }
    /** @param {World} world @param {Vec2} point */
    function hitShip(world, point) {
      return world.ships.filter(function (s) { return !s.docked; }).map(function (s) {
        var p = project([s.position.x, s.position.y, 0], world.camera, viewport(), orbit);
        return { ship: s, distance: Math.hypot(point.x - p.x, point.y - p.y), depth: p.depth };
      }).filter(function (h) { return h.depth > 0 && h.distance < Math.max(12, (h.ship.type === 'mothership' ? 38 : 18) * world.camera.zoom * semanticScale(h.ship.type, world.camera.zoom)); })
        .sort(function (a, b) { return a.distance - b.distance; })[0];
    }
    /** @param {string} type @param {number} zoom */
    function semanticScale(type, zoom) {
      var exponent = type === 'mothership' ? 0.95 : type === 'tug' || type === 'platform' || type === 'depot' ? 0.12 : 0.08;
      var z = Math.min(32, zoom); return Math.pow(Math.max(1, z), exponent) / z;
    }
    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    canvas.addEventListener('pointerdown', function (e) {
      unlock(); focus = false; var p = pointer(e), w = getWorld();
      if (e.button === 2 && !e.altKey) {
        var target = unproject(p, w.camera, viewport(), orbit);
        var hit = hitShip(w, p); if (hit) target = hit.ship.position;
        // Surface hits must be mapped to the asteroid, not to the plane behind it.
        var rockHits = w.asteroids.map(function (a) { return { asteroid: a, hit: pickAsteroid(p, a, w.camera, viewport(), orbit) }; })
          .filter(function (r) { return r.hit !== null; }).sort(function (a, b) { return (a.hit ? a.hit.depth : Infinity) - (b.hit ? b.hit.depth : Infinity); });
        var rock = rockHits[0];
        if (rock && rock.hit && (!hit || rock.hit.depth < hit.depth)) target = rock.asteroid.position;
        var platform = w.platforms.find(function (platform) {
          if (platform.state !== 'deployed' && platform.state !== 'setting-up') return false;
          var a = w.asteroids.find(function (a) { return a.id === platform.asteroidId; });
          var q = project([platform.position.x, platform.position.y, platformHeight(platform, a)], w.camera, viewport(), orbit);
          return q.depth > 0 && Math.hypot(q.x - p.x, q.y - p.y) < 14 && (!rock || !rock.hit || q.depth <= rock.hit.depth + 10);
        });
        if (platform) target = platform.position;
        if (!target) return;
        var game = /** @type {{ issueVisualContextOrder: (world: World, target: Vec2) => World }} */ (DW.game);
        setWorld(game.issueVisualContextOrder(w, target)); if (DW.audio) DW.audio.playMove(); return;
      }
      drag = { start: p, last: p, mode: e.altKey || (study && e.button === 0 && !space) ? 'orbit' : e.button === 1 || space ? 'pan' : 'select' };
      canvas.setPointerCapture(e.pointerId); e.preventDefault();
    });
    canvas.addEventListener('pointermove', function (e) {
      if (!drag) return;
      var p = pointer(e), w = getWorld();
      if (drag.mode === 'orbit') {
        orbit.yaw -= (p.x - drag.last.x) * 0.006;
        orbit.tilt = Math.max(0.06, Math.min(Math.PI - 0.06, orbit.tilt + (p.y - drag.last.y) * 0.006));
      } else if (drag.mode === 'pan') {
        var a = unproject(drag.last, w.camera, viewport(), orbit, orbit.height), b = unproject(p, w.camera, viewport(), orbit, orbit.height);
        if (a && b) setWorld(Object.assign({}, w, { camera: { x: w.camera.x + a.x - b.x, y: w.camera.y + a.y - b.y, zoom: w.camera.zoom } }));
      }
      drag.last = p;
    });
    canvas.addEventListener('pointerup', function (e) {
      if (!drag) return;
      if (drag.mode === 'select') {
        var p = pointer(e), w = getWorld(), start = drag.start;
        /** @type {string[]} */ var ids = [];
        if (Math.hypot(p.x - start.x, p.y - start.y) < 5) {
          /** @type {ReturnType<typeof hitShip> | undefined} */ var hit = hitShip(w, p);
          var hitDepth = hit ? hit.depth : Infinity;
          if (hit && w.asteroids.some(function (a) { var rock = pickAsteroid(p, a, w.camera, viewport(), orbit); return rock && rock.depth < hitDepth; })) hit = undefined;
          if (hit) ids = [hit.ship.id];
          if (e.shiftKey && hit) { var hitId = hit.ship.id; ids = w.selectedShipIds.indexOf(hitId) >= 0 ? w.selectedShipIds.filter(function (id) { return id !== hitId; }) : w.selectedShipIds.concat(ids); }
        } else {
          ids = w.ships.filter(function (s) {
            var q = project([s.position.x, s.position.y, 0], w.camera, viewport(), orbit);
            return !s.docked && q.depth > 0 && q.x >= Math.min(p.x, start.x) && q.x <= Math.max(p.x, start.x) && q.y >= Math.min(p.y, start.y) && q.y <= Math.max(p.y, start.y);
          }).map(function (s) { return s.id; });
          if (e.shiftKey) ids = Array.from(new Set(w.selectedShipIds.concat(ids)));
        }
        var selected = sim.selectShips(w, ids);
        if (!ids.length && Math.hypot(p.x - start.x, p.y - start.y) < 5) {
          var platform = w.platforms.find(function (platform) {
            if (platform.state !== 'deployed' && platform.state !== 'setting-up') return false;
            var a = w.asteroids.find(function (a) { return a.id === platform.asteroidId; });
            var q = project([platform.position.x, platform.position.y, platformHeight(platform, a)], w.camera, viewport(), orbit);
            return q.depth > 0 && Math.hypot(q.x - p.x, q.y - p.y) < 14;
          });
          if (platform) selected = sim.selectPlatform(selected, platform.id);
        }
        setWorld(selected); if ((ids.length || selected.selectedPlatformId) && DW.audio) DW.audio.playSelect();
      }
      drag = null;
    });
    canvas.addEventListener('pointercancel', function () { drag = null; });
    canvas.addEventListener('wheel', function (e) {
      e.preventDefault(); focus = false; var w = getWorld(), p = pointer(e), vp = viewport();
      var before = unproject(p, w.camera, vp, orbit, orbit.height);
      var camera = { x: w.camera.x, y: w.camera.y, zoom: Math.max(0.2, Math.min(128, w.camera.zoom * Math.exp(-Math.max(-300, Math.min(300, e.deltaY)) * 0.0015))) };
      var after = unproject(p, camera, vp, orbit, orbit.height);
      if (before && after) { camera.x += before.x - after.x; camera.y += before.y - after.y; }
      setWorld(Object.assign({}, w, { camera: camera }));
    }, { passive: false });
    window.addEventListener('keydown', function (e) {
      if (e.target instanceof HTMLElement && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      if (e.code === 'Space') { space = true; e.preventDefault(); }
      if (e.code === 'KeyF') focus = true;
      if (e.code === 'KeyH' && !e.repeat) { var next = sim.spawnHostileWave(getWorld()); setWorld(next); consume(next.combat.events); }
      if (e.code === 'KeyK' && !e.repeat) setWorld(sim.spawnFighter(getWorld()));
      if (e.code === 'KeyJ' && !e.repeat) {
        var w = getWorld(), fighter = w.ships.find(function (s) { return s.type === 'escort' && w.selectedShipIds.indexOf(s.id) >= 0; });
        if (fighter) setWorld(sim.damageFighter(w, fighter.id, 1));
      }
    });
    window.addEventListener('keyup', function (e) { if (e.code === 'Space') space = false; });
    window.addEventListener('blur', function () { space = false; drag = null; });
    var cutButton = toolbar.querySelector('[data-cut]');
    var overviewButton = toolbar.querySelector('[data-overview]');
    var topButton = toolbar.querySelector('[data-top]');
    var orbitButton = toolbar.querySelector('[data-orbit]');
    if (!cutButton || !overviewButton || !topButton || !orbitButton) throw new Error('Missing 3D controls');
    orbitButton.addEventListener('click', function () { orbit.yaw += Math.PI / 6; orbit.tilt = 0.75; });
    cutButton.addEventListener('click', function () {
      var w = getWorld(), a = w.asteroids[0]; if (!a) return;
      focus = false; w = sim.toggleAsteroidExcavation(w, a.id);
      setWorld(Object.assign({}, w, { camera: { x: a.position.x, y: a.position.y, zoom: Math.min(viewport().height / (a.radius * 2.8), 1.8) } }));
    });
    overviewButton.addEventListener('click', function () {
      focus = false; var w = getWorld();
      var points = w.asteroids.map(function (a) { return a.position; }).concat(w.ships.map(function (s) { return s.position; }));
      var xs = points.map(function (p) { return p.x; }), ys = points.map(function (p) { return p.y; });
      var minX = Math.min.apply(null, xs) - 350, maxX = Math.max.apply(null, xs) + 350;
      var minY = Math.min.apply(null, ys) - 350, maxY = Math.max.apply(null, ys) + 350;
      orbit.yaw = 0; orbit.tilt = 0.48;
      setWorld(Object.assign({}, w, { camera: { x: (minX + maxX) / 2, y: (minY + maxY) / 2,
        zoom: Math.min(viewport().width / (maxX - minX), viewport().height / (maxY - minY)) * 0.7 } }));
    });
    topButton.addEventListener('click', function () { orbit.yaw = 0; orbit.tilt = 0.06; });
    var underButton = toolbar.querySelector('[data-under]');
    if (underButton) underButton.addEventListener('click', function () { orbit.tilt = Math.PI - .75; });

    /** @param {World} w */
    function sync(w) {
      orbit.height = study ? 0 : inspectionHeight(w) * (orbit.tilt > Math.PI / 2 ? -1 : 1);
      Object.keys(rocks).forEach(function (id) { if (!w.asteroids.some(function (a) { return a.id === id; })) { gl.deleteBuffer(rocks[id].mesh.buffer); gl.deleteTexture(rocks[id].texture); delete rocks[id]; } });
      w.asteroids.forEach(function (a) {
        var key = a.radius + ':' + JSON.stringify(a.excavation || null);
        if (!rocks[a.id] || rocks[a.id].key !== key) {
          if (rocks[a.id]) { gl.deleteBuffer(rocks[a.id].mesh.buffer); gl.deleteTexture(rocks[a.id].texture); }
          var visual = visualFor(a);
          rocks[a.id] = { key: key, mesh: upload(asteroidMesh(a)), texture: craterTexture(visual), visual: visual };
        }
      });
      var button = /** @type {HTMLButtonElement} */ (toolbar.querySelector('[data-cut]'));
      button.textContent = w.asteroids[0] && w.asteroids[0].excavation && w.asteroids[0].excavation.level > 0 ? 'Close cutaway' : 'Cutaway';
    }
    /** @param {import('./types').CombatEvent[]} events */
    function consume(events) {
      events.forEach(function (event) { effects.push({ event: event, age: 0 });
        if (DW.audio) {
          if (event.kind === 'weapon-fired') DW.audio.playGunshot();
          if (event.kind === 'contact-warning') DW.audio.playWarning();
          if (event.kind === 'ship-damaged' || event.kind === 'ship-destroyed') DW.audio.playImpact(event.amount || 1);
        }
      });
      if (effects.length > 260) effects.splice(0, effects.length - 260);
    }
    /** @param {World} w @param {number} alpha @param {number} dt @param {number} wallDt */
    function render(w, alpha, dt, wallDt) {
      var vp = viewport(); if (vp.width < 1 || vp.height < 1) return;
      var dpr = Math.min(2, window.devicePixelRatio || 1);
      var width = Math.round(vp.width * dpr), height = Math.round(vp.height * dpr);
      if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; overlay.width = width; overlay.height = height; }
      gl.viewport(0, 0, width, height); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.useProgram(program); var v = view(w.camera, vp, orbit);
      gl.uniform3fv(uniforms.Target, [w.camera.x, w.camera.y, orbit.height || 0]); gl.uniform3fv(uniforms.Right, v.right);
      gl.uniform3fv(uniforms.Up, v.up); gl.uniform3fv(uniforms.Back, v.back);
      gl.uniform4fv(uniforms.View, [v.distance, v.focal, vp.width / vp.height, 0]);
      w.asteroids.forEach(function (a) {
        var rock = rocks[a.id]; if (!rock) return;
        var values = art.uniforms(rock.visual);
        ['Bulk', 'FieldLow', 'FieldMed', 'Profile', 'Relief', 'FieldBlobs'].forEach(function (name) {
          var value = /** @type {Record<string, Float32Array | number>} */ (values)['u' + name];
          if (value instanceof Float32Array) gl.uniform4fv(uniforms[name], value);
        });
        gl.uniform1fv(uniforms.BlobMaterial, values.uBlobMaterial);
        gl.uniform1f(uniforms.CraterCount, values.uCraterCount); gl.uniform1f(uniforms.CraterTextureWidth, 576);
        gl.uniform1f(uniforms.Heterogeneity, values.uHeterogeneity); gl.uniform1f(uniforms.Seed, values.uSeed);
        var center = project([a.position.x, a.position.y, 0], w.camera, vp, orbit);
        gl.uniform1f(uniforms.PixelFootprint, Math.max(0.000001, center.depth / v.distance / (a.radius * w.camera.zoom * dpr)));
        gl.uniform1f(uniforms.Cut, a.excavation && a.excavation.level > 0 ? 1 : 0);
        gl.uniform1f(uniforms.CutHeight, a.excavation ? -Math.min(.42, Math.max(.03, a.excavation.depthM / sim.METERS_PER_UNIT / a.radius)) : 0);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, rock.texture); gl.uniform1i(uniforms.CraterData, 0);
        draw(rock.mesh, [a.position.x, a.position.y, 0], [a.radius, a.radius, a.radius], a.rotation, [0.45, 0.43, 0.4], true);
      });
      hud.setTransform(dpr, 0, 0, dpr, 0, 0); hud.clearRect(0, 0, vp.width, vp.height);
      hud.font = '11px system-ui'; hud.textAlign = 'center';
      /** @param {V3} a @param {V3} b @param {string} color */
      function line(a, b, color) {
        var p = project(a, w.camera, vp, orbit), q = project(b, w.camera, vp, orbit);
        if (p.depth <= 0 || q.depth <= 0) return;
        hud.strokeStyle = color; hud.beginPath(); hud.moveTo(p.x, p.y); hud.lineTo(q.x, q.y); hud.stroke();
      }
      // Depth-tested lattice: rock and ships hide the plane beneath them.
      var gridZ = orbit.tilt > Math.PI / 2 ? 330 : -330;
      var gridStep = Math.pow(10, Math.floor(Math.log10(180 / w.camera.zoom)));
      var extent = Math.max(vp.width, vp.height) / w.camera.zoom * 1.5;
      var gridX = Math.floor(w.camera.x / gridStep) * gridStep, gridY = Math.floor(w.camera.y / gridStep) * gridStep;
      /** @type {number[]} */ var gridData = [];
      for (var i = -12; i <= 12; i++) {
        gridData.push(gridX + i * gridStep, gridY - extent, gridZ, 0, 0, 1, gridX + i * gridStep, gridY + extent, gridZ, 0, 0, 1,
          gridX - extent, gridY + i * gridStep, gridZ, 0, 0, 1, gridX + extent, gridY + i * gridStep, gridZ, 0, 0, 1);
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, grid.buffer); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(gridData), gl.DYNAMIC_DRAW);
      if (!study) draw(grid, [0, 0, 0], [1, 1, 1], 0, [0.035, 0.055, 0.065], false, true);
      w.ships.forEach(function (s) {
        if (s.docked) return;
        var x = s.previousPosition.x + (s.position.x - s.previousPosition.x) * alpha;
        var y = s.previousPosition.y + (s.position.y - s.previousPosition.y) * alpha;
        var scale = semanticScale(s.type, w.camera.zoom);
        /** @type {V3} */ var color = s.disabled ? [0.28, 0.28, 0.29] : s.type === 'escort' ? [0.7, 0.28, 0.28] : s.type === 'tug' ? [0.28, 0.58, 0.76] : [0.72, 0.77, 0.79];
        var big = s.type === 'mothership', length = big ? 34 : s.type === 'tug' ? 18 : 10;
        if (big) drawMothership(x, y, scale, s.rotation, w.elapsedSeconds);
        else {
          draw(box, [x, y, 0], [length * scale, 5 * scale, 3 * scale], s.rotation, color);
          draw(box, [x, y, 5 * scale], [4 * scale, 9 * scale, 2 * scale], s.rotation, color);
        }
        var p = project([x, y, 0], w.camera, vp, orbit);
        if (p.depth <= 0) return;
        if (w.selectedShipIds.indexOf(s.id) >= 0) {
          var size = Math.max(14, length * scale * w.camera.zoom * v.distance / p.depth + 7);
          hud.strokeStyle = '#a2e6ef'; hud.strokeRect(p.x - size, p.y - size, size * 2, size * 2);
          hud.fillStyle = '#d6eef2'; hud.fillText(s.name, p.x, p.y - size - 8);
          var target = 'target' in s.order ? s.order.target : s.order.kind === 'defend' ? s.order.anchor : null;
          if (target) line([x, y, 0], [target.x, target.y, 0], 'rgba(110,220,230,.55)');
        }
      });
      w.platforms.forEach(function (p) {
        if (p.state !== 'deployed' && p.state !== 'setting-up' && p.state !== 'packing') return;
        var a = w.asteroids.find(function (a) { return a.id === p.asteroidId; });
        var z = platformHeight(p, a);
        var scale = semanticScale('platform', w.camera.zoom);
        draw(box, [p.position.x, p.position.y, z + 5 * scale], [12 * scale, 9 * scale, 5 * scale], p.siteAngle + (a ? a.rotation : 0), [0.83, 0.61, 0.24]);
      });
      w.wrecks.forEach(function (s) { draw(box, [s.position.x, s.position.y, 0], [10, 4, 3], s.rotation || 0, [0.3, 0.27, 0.24]); });
      w.combat.drones.forEach(function (d) {
        var scale = semanticScale('escort', w.camera.zoom);
        draw(box, [d.previousPosition.x + (d.position.x - d.previousPosition.x) * alpha,
          d.previousPosition.y + (d.position.y - d.previousPosition.y) * alpha, 0], [9 * scale, 5 * scale, 4 * scale], Math.atan2(d.velocity.y, d.velocity.x), [0.86, 0.22, 0.16]);
      });
      var ds = semanticScale('depot', w.camera.zoom);
      for (var stage = 0; stage < (study ? 0 : Math.max(1, w.depot.builtStages)); stage++) draw(box,
        [w.depot.position.x, w.depot.position.y + stage * 8 * ds, 0], [24 * ds, 3 * ds, 6 * ds], 0, [0.4, 0.55, 0.6]);
      w.packets.forEach(function (p) { draw(box, [p.position.x, p.position.y, 0], [2 / w.camera.zoom, 2 / w.camera.zoom, 2 / w.camera.zoom], 0, [0.9, 0.75, 0.3]); });
      if (stress) for (var j = 0; j < 1000; j++) draw(box, [Math.sin(j * 12.3 + w.elapsedSeconds * 0.01) * 1600,
        Math.cos(j * 7.1) * 1200, 0], [3, 1, 1], j, [0.3, 0.5, 0.6]);
      effects.forEach(function (fx) {
        fx.age += dt;
        if (fx.event.kind === 'weapon-fired' && fx.event.source) line([fx.event.source.x, fx.event.source.y, 0], [fx.event.position.x, fx.event.position.y, 0], 'rgba(255,160,100,' + Math.max(0, 1 - fx.age / 0.2) + ')');
      });
      effects = effects.filter(function (fx) { return fx.age < 0.5; });
      if (drag && drag.mode === 'select') { hud.strokeStyle = '#b4e8ef'; hud.strokeRect(drag.start.x, drag.start.y, drag.last.x - drag.start.x, drag.last.y - drag.start.y); }
      if (wallDt > 0) fps = fps * 0.9 + Math.min(240, 1 / wallDt) * 0.1;
      if (DW.audio) DW.audio.setEngineThrust(Math.min(1, Math.max.apply(null, w.ships.map(function (s) { return s.disabled || s.docked ? 0 : Math.hypot(s.velocity.x - s.previousVelocity.x, s.velocity.y - s.previousVelocity.y) / Math.max(1, s.acceleration / 30); }))));
    }
    return {
      getOrbit: function () { return { yaw: orbit.yaw, tilt: orbit.tilt }; },
      /** @param {{yaw: number, tilt: number}} value */
      setOrbit: function (value) { orbit.yaw = value.yaw; orbit.tilt = Math.max(.06, Math.min(Math.PI - .06, value.tilt)); },
      sync: sync, render: render, consumeCombatEvents: consume,
      resetCombat: function () { effects = []; focus = false; },
      /** @param {World} w @param {number} dt */
      applyCameraFocus: function (w, dt) {
        if (!focus || !DW.camera) return w;
        var target = DW.camera.computeSelectionFocus(w); return target ? DW.camera.focusCameraToward(w, target, dt) : w;
      },
      /** @param {boolean} enabled */ setStressEnabled: function (enabled) { stress = enabled; },
      /** @param {{image: string, brightness: number}} settings */
      setBackground: function (settings) {
        var game = /** @type {{ backgroundOptions: () => { id: string, url: string, contrast: number }[] }} */ (DW.game);
        var option = game.backgroundOptions().find(function (b) { return b.id === settings.image; });
        background.style.backgroundImage = option && option.url ? 'url("' + option.url + '")' : 'none';
        background.style.filter = 'brightness(' + settings.brightness + ')';
      },
      getStats: function () {
        var w = getWorld(); return { fps: Math.round(fps), stressEnabled: stress,
          entityCount: w.ships.length + w.asteroids.length + w.platforms.length + w.wrecks.length + w.combat.drones.length + (stress ? 1000 : 0),
          contacts: w.combat.drones.length ? w.combat.drones.length + ' active' : w.combat.director.state === 'warning' ? 'inbound ' + Math.ceil(w.combat.director.timer) + 's' : 'quiet' };
      }
    };
  }
  DW.scene3d = { create: create, project: project, unproject: unproject, view: view,
    rockField: rockField, asteroidMesh: asteroidMesh, pickAsteroid: pickAsteroid, platformHeight: platformHeight, inspectionHeight: inspectionHeight,
    globeRelief: globeRelief, visualFor: visualFor, surfaceHeight: surfaceHeight, habitatMesh: habitatMesh, roundedHullMesh: roundedHullMesh };
})(window);
