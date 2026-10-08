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
    var radius = sim.surfaceRadius(asteroid, Math.atan2(y, x) - asteroid.rotation);
    return asteroid.radius * 0.72 * Math.sqrt(Math.max(0, 1 - (x * x + y * y) / (radius * radius)));
  }

  /** Elevate an inspection target onto the visible rock instead of zooming inside it. */
  /** @param {World} world */
  function inspectionHeight(world) {
    var camera = world.camera;
    var a = world.asteroids.find(function (a) { return Math.hypot(camera.x - a.position.x, camera.y - a.position.y) < a.radius * 0.85; });
    if (!a) return 0;
    var e = a.excavation;
    var x = camera.x - a.position.x, y = camera.y - a.position.y;
    var r = sim.surfaceRadius(a, Math.atan2(y, x) - a.rotation);
    var surface = e && e.level > 0 ? -Math.min(0.42 * a.radius, Math.max(0.03 * a.radius, e.depthM / sim.METERS_PER_UNIT)) :
      a.radius * 0.72 * Math.sqrt(Math.max(0, 1 - (x * x + y * y) / (r * r))) + a.radius * 0.02;
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
    var angle = Math.atan2(p[1], p[0]);
    var radius = sim.surfaceRadius(asteroid, angle) / asteroid.radius;
    var radial = Math.hypot(p[0], p[1]);
    // Preserve the simulation's equatorial outline; relief fades to zero there.
    var relief = 0.018 * Math.sin(p[0] * 24 + p[1] * 13) * Math.sin(p[1] * 19 - p[2] * 17) * Math.min(1, Math.abs(p[2]) * 8);
    var outer = (Math.hypot(radial / radius, p[2] / 0.72) - 1) * 0.72 + relief;
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
    var n = resolution || 56, stride = n + 1;
    var field = new Float32Array(stride * stride * stride);
    var step = 2.2 / n;
    /** @param {number} x @param {number} y @param {number} z @returns {V3} */
    function point(x, y, z) { return [-1.1 + x * step, -1.1 + y * step, -1.1 + z * step]; }
    /** @param {number} x @param {number} y @param {number} z */
    function index(x, y, z) { return x + stride * (y + stride * z); }
    for (var z = 0; z <= n; z++) for (var y = 0; y <= n; y++) for (var x = 0; x <= n; x++) {
      field[index(x, y, z)] = rockField(asteroid, point(x, y, z));
    }
    var corners = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]];
    var tetrahedra = [[0, 5, 1, 6], [0, 1, 2, 6], [0, 2, 3, 6], [0, 3, 7, 6], [0, 7, 4, 6], [0, 4, 5, 6]];
    /** @type {number[]} */ var output = [];
    /** @param {V3} p */
    function vertex(p) {
      var h = 0.0005;
      var dx = rockField(asteroid, [p[0] + h, p[1], p[2]]) - rockField(asteroid, [p[0] - h, p[1], p[2]]);
      var dy = rockField(asteroid, [p[0], p[1] + h, p[2]]) - rockField(asteroid, [p[0], p[1] - h, p[2]]);
      var dz = rockField(asteroid, [p[0], p[1], p[2] + h]) - rockField(asteroid, [p[0], p[1], p[2] - h]);
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

  /** @param {HTMLElement} host @param {() => World} getWorld @param {(world: World) => void} setWorld */
  function create(host, getWorld, setWorld) {
    var canvas = document.createElement('canvas');
    canvas.setAttribute('aria-label', '3D tactical scene');
    var context = canvas.getContext('webgl', { antialias: true, alpha: true });
    if (!context) throw new Error('The 3D prototype requires WebGL. Use ?renderer=2d for the existing renderer.');
    var gl = context;
    var background = document.createElement('div'); background.className = 'night-sky-background';
    host.appendChild(background); host.appendChild(canvas);
    var overlay = document.createElement('canvas'); overlay.className = 'scene3d-overlay'; host.appendChild(overlay);
    var overlayContext = overlay.getContext('2d');
    if (!overlayContext) throw new Error('Missing tactical overlay context');
    var hud = overlayContext;
    var toolbar = document.createElement('div'); toolbar.className = 'scene3d-controls';
    toolbar.innerHTML = '<strong>3D RTS prototype</strong><span>Alt + drag: orbit · Middle / Space + drag: pan · Wheel: zoom</span><button type="button" data-cut>Cutaway</button><button type="button" data-orbit aria-label="Orbit camera">Orbit ↻</button><button type="button" data-overview>Overview</button><button type="button" data-top>Top view</button><a href="?renderer=2d">2D renderer</a>';
    host.appendChild(toolbar);
    /** @type {Orbit} */ var orbit = { yaw: 0, tilt: 0.48 };
    var focus = false, space = false, stress = false, fps = 0;
    /** @type {{ start: Vec2, last: Vec2, mode: string } | null} */ var drag = null;
    /** @type {{ event: import('./types').CombatEvent, age: number }[]} */ var effects = [];
    /** @type {Record<string, { key: string, mesh: Mesh }>} */ var rocks = {};
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
    gl.attachShader(program, shader(gl.FRAGMENT_SHADER,
      'precision highp float; varying vec3 vNormal,vLocal; varying float vDepth; uniform vec3 uColor; uniform float uRock; '+
      'float hash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);} '+
      'float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);} '+
      'void main(){vec3 n=normalize(vNormal);float light=max(0.,dot(n,normalize(vec3(-.8,-.5,1.))));vec3 col=uColor;'+
      'if(uRock>.5){float geology=noise(vLocal*3.)*.65+noise(vLocal*8.)*.35;col=mix(vec3(.28,.34,.38),vec3(.57,.46,.32),smoothstep(.25,.75,geology));float grain=noise(vLocal*42.);col*=.88+.2*grain;}'+
      'col*=.22+.78*light;col+=vec3(.04,.07,.09)*max(0.,dot(n,normalize(vec3(.4,.6,-.3))));gl_FragColor=vec4(col,1.);}'));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || 'Shader linking failed');
    gl.useProgram(program); gl.enable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
    var pos = gl.getAttribLocation(program, 'aPosition'), normal = gl.getAttribLocation(program, 'aNormal');
    /** @type {Record<string, WebGLUniformLocation | null>} */ var uniforms = {};
    ['Origin', 'Scale', 'Target', 'Right', 'Up', 'Back', 'View', 'Rotation', 'Color', 'Rock'].forEach(function (name) { uniforms[name] = gl.getUniformLocation(program, 'u' + name); });
    /** @param {Float32Array} data @returns {Mesh} */
    function upload(data) {
      var buffer = gl.createBuffer(); if (!buffer) throw new Error('Mesh allocation failed');
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      return { buffer: buffer, count: data.length / 6 };
    }
    var box = upload(boxMesh());
    var grid = upload(new Float32Array(600));
    /** @param {Mesh} mesh @param {V3} origin @param {V3} scale @param {number} rotation @param {V3} color @param {boolean} [rock] @param {boolean} [lines] */
    function draw(mesh, origin, scale, rotation, color, rock, lines) {
      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.buffer);
      gl.enableVertexAttribArray(pos); gl.enableVertexAttribArray(normal);
      gl.vertexAttribPointer(pos, 3, gl.FLOAT, false, 24, 0); gl.vertexAttribPointer(normal, 3, gl.FLOAT, false, 24, 12);
      gl.uniform3fv(uniforms.Origin, origin); gl.uniform3fv(uniforms.Scale, scale); gl.uniform3fv(uniforms.Color, color);
      gl.uniform1f(uniforms.Rotation, rotation); gl.uniform1f(uniforms.Rock, rock ? 1 : 0);
      gl.drawArrays(lines ? gl.LINES : gl.TRIANGLES, 0, mesh.count);
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
      drag = { start: p, last: p, mode: e.altKey ? 'orbit' : e.button === 1 || space ? 'pan' : 'select' };
      canvas.setPointerCapture(e.pointerId); e.preventDefault();
    });
    canvas.addEventListener('pointermove', function (e) {
      if (!drag) return;
      var p = pointer(e), w = getWorld();
      if (drag.mode === 'orbit') {
        orbit.yaw -= (p.x - drag.last.x) * 0.006;
        orbit.tilt = Math.max(0.06, Math.min(1.12, orbit.tilt + (p.y - drag.last.y) * 0.006));
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

    /** @param {World} w */
    function sync(w) {
      orbit.height = inspectionHeight(w);
      Object.keys(rocks).forEach(function (id) { if (!w.asteroids.some(function (a) { return a.id === id; })) { gl.deleteBuffer(rocks[id].mesh.buffer); delete rocks[id]; } });
      w.asteroids.forEach(function (a) {
        var key = a.radius + ':' + JSON.stringify(a.excavation || null);
        if (!rocks[a.id] || rocks[a.id].key !== key) {
          if (rocks[a.id]) gl.deleteBuffer(rocks[a.id].mesh.buffer);
          rocks[a.id] = { key: key, mesh: upload(asteroidMesh(a)) };
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
      w.asteroids.forEach(function (a) { if (rocks[a.id]) draw(rocks[a.id].mesh, [a.position.x, a.position.y, 0], [a.radius, a.radius, a.radius], a.rotation, [0.45, 0.43, 0.4], true); });
      hud.setTransform(dpr, 0, 0, dpr, 0, 0); hud.clearRect(0, 0, vp.width, vp.height);
      hud.font = '11px system-ui'; hud.textAlign = 'center';
      /** @param {V3} a @param {V3} b @param {string} color */
      function line(a, b, color) {
        var p = project(a, w.camera, vp, orbit), q = project(b, w.camera, vp, orbit);
        if (p.depth <= 0 || q.depth <= 0) return;
        hud.strokeStyle = color; hud.beginPath(); hud.moveTo(p.x, p.y); hud.lineTo(q.x, q.y); hud.stroke();
      }
      // Depth-tested lattice: rock and ships hide the plane beneath them.
      var gridStep = Math.pow(10, Math.floor(Math.log10(180 / w.camera.zoom)));
      var extent = Math.max(vp.width, vp.height) / w.camera.zoom * 1.5;
      var gridX = Math.floor(w.camera.x / gridStep) * gridStep, gridY = Math.floor(w.camera.y / gridStep) * gridStep;
      /** @type {number[]} */ var gridData = [];
      for (var i = -12; i <= 12; i++) {
        gridData.push(gridX + i * gridStep, gridY - extent, -330, 0, 0, 1, gridX + i * gridStep, gridY + extent, -330, 0, 0, 1,
          gridX - extent, gridY + i * gridStep, -330, 0, 0, 1, gridX + extent, gridY + i * gridStep, -330, 0, 0, 1);
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, grid.buffer); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(gridData), gl.DYNAMIC_DRAW);
      draw(grid, [0, 0, 0], [1, 1, 1], 0, [0.035, 0.055, 0.065], false, true);
      w.ships.forEach(function (s) {
        if (s.docked) return;
        var x = s.previousPosition.x + (s.position.x - s.previousPosition.x) * alpha;
        var y = s.previousPosition.y + (s.position.y - s.previousPosition.y) * alpha;
        var scale = semanticScale(s.type, w.camera.zoom);
        /** @type {V3} */ var color = s.disabled ? [0.28, 0.28, 0.29] : s.type === 'escort' ? [0.7, 0.28, 0.28] : s.type === 'tug' ? [0.28, 0.58, 0.76] : [0.72, 0.77, 0.79];
        var big = s.type === 'mothership', length = big ? 34 : s.type === 'tug' ? 18 : 10;
        draw(box, [x, y, 0], [length * scale, (big ? 13 : 5) * scale, (big ? 8 : 3) * scale], s.rotation, color);
        draw(box, [x, y, 5 * scale], [(big ? 12 : 4) * scale, (big ? 24 : 9) * scale, 2 * scale], s.rotation, color);
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
      for (var stage = 0; stage < Math.max(1, w.depot.builtStages); stage++) draw(box,
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
    rockField: rockField, asteroidMesh: asteroidMesh, pickAsteroid: pickAsteroid, platformHeight: platformHeight, inspectionHeight: inspectionHeight };
})(window);
