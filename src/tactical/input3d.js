(function (global) {
  'use strict';
  /** @typedef {import('../types').World} World */
  /** @typedef {import('../types').Vec2} Vec2 */
  /** @typedef {import('../types').Camera} Camera */
  /** @typedef {import('../types').Viewport} Viewport */
  /** @typedef {import('../types').Asteroid} Asteroid */
  /** @typedef {[number, number, number]} V3 */
  /** @typedef {{ yaw: number, tilt: number, height?: number, surface?: View }} Orbit */
  /** @typedef {{ right: V3, up: V3, back: V3, distance: number, focal: number }} View */
  var DW=/** @type {Required<import('../types').DriftworksNamespace>} */(global.Driftworks);
  var sim=DW.sim;
  /** @param {import('../types').TacticalInputHost} owner */
  function mount(owner){
    /** @type {{start:Vec2,last:Vec2,mode:string}|null} */var drag=null;
    var space=false;
    /** @returns {Viewport} */ function viewport() { return { width: owner.host.clientWidth, height: owner.host.clientHeight }; }
    /** @param {PointerEvent | WheelEvent} e */
    function pointer(e) { var r = owner.canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
    function unlock() { if (DW.audio) DW.audio.unlock(); }
    /** @param {World} world @param {Vec2} point */
    function hitShip(world, point) {
      return world.ships.filter(function (s) { return !s.docked; }).map(function (s) {
        var p = owner.project([s.position.x, s.position.y, 0], world.camera, viewport(), owner.orbit);
        return { ship: s, distance: Math.hypot(point.x - p.x, point.y - p.y), depth: p.depth };
      }).filter(function (h) { return h.depth > 0 && h.distance < Math.max(12, (h.ship.type === 'mothership' ? 38 : 18) * world.camera.zoom * semanticScale(h.ship.type, world.camera.zoom)); })
        .sort(function (a, b) { return a.distance - b.distance; })[0];
    }
    /** @param {string} type @param {number} zoom */
    function semanticScale(type, zoom) {
      if(owner.study && type==='mothership')return 1;
      var exponent = type === 'mothership' ? 0.95 : type === 'tug' || type === 'platform' || type === 'depot' ? 0.12 : 0.08;
      var z = Math.min(32, zoom); return Math.pow(Math.max(1, z), exponent) / z;
    }
    /** @returns {import('../types').ViewerPose} */
    function viewerPose() {
      var w = owner.getWorld(), v = owner.view(w.camera, viewport(), owner.orbit);
      return {eye:[w.camera.x+v.back[0]*v.distance,w.camera.y+v.back[1]*v.distance,(owner.orbit.height||0)+v.back[2]*v.distance],right:[v.right[0],v.right[1],v.right[2]],up:[v.up[0],v.up[1],v.up[2]],back:[v.back[0],v.back[1],v.back[2]],distance:v.distance,focal:v.focal};
    }
    /** @param {import('../types').ViewerPose} pose */
    function flyViewer(pose) {
      owner.orbit.surface={right:pose.right,up:pose.up,back:pose.back,distance:1,focal:pose.focal};
      owner.studyHeight=pose.eye[2]-pose.back[2];owner.orbit.height=owner.studyHeight;
      var w=owner.getWorld();owner.setWorld(Object.assign({},w,{camera:{x:pose.eye[0]-pose.back[0],y:pose.eye[1]-pose.back[1],zoom:owner.host.clientHeight*pose.focal/2}}));
    }
    /** @param {import('../types').ViewerPose} pose @param {V3} target */
    function orbitViewer(pose,target) {
      var back=/** @type {V3} */ (pose.eye.map(function(x,i){return x-target[i];})),distance=Math.max(.001,Math.hypot.apply(null,back));
      delete owner.orbit.surface;owner.studyHeight=target[2];owner.orbit.height=target[2];owner.orbit.yaw=Math.atan2(-back[0],back[1]);owner.orbit.tilt=Math.acos(Math.max(-1,Math.min(1,back[2]/distance)));
      var w=owner.getWorld();owner.setWorld(Object.assign({},w,{camera:{x:target[0],y:target[1],zoom:owner.host.clientHeight*pose.focal/(2*distance)}}));
    }
    var viewerControls = owner.viewerEnabled && DW.modelViewer ? DW.modelViewer.create(owner.host,{pose:viewerPose,fly:flyViewer,orbit:orbitViewer,pick:function(eye,direction){return owner.pickStudyBatches(eye,direction,owner.pickBatches);},worldUp:[0,0,1]}) : null;
    owner.canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    owner.canvas.addEventListener('pointerdown', function (e) {
      if(owner.orbit.surface)return;
      unlock(); owner.focus = false; var p = pointer(e), w = owner.getWorld();
      if (!owner.study && e.button === 2 && !e.altKey) {
        var target = owner.unproject(p, w.camera, viewport(), owner.orbit);
        var hit = hitShip(w, p); if (hit) target = hit.ship.position;
        // Surface hits must be mapped to the asteroid, not to the plane behind it.
        var rockHits = w.asteroids.map(function (a) { return { asteroid: a, hit: owner.pickAsteroid(p, a, w.camera, viewport(), owner.orbit) }; })
          .filter(function (r) { return r.hit !== null; }).sort(function (a, b) { return (a.hit ? a.hit.depth : Infinity) - (b.hit ? b.hit.depth : Infinity); });
        var rock = rockHits[0];
        if (rock && rock.hit && (!hit || rock.hit.depth < hit.depth)) target = rock.asteroid.position;
        var platform = w.platforms.find(function (platform) {
          if (platform.state !== 'deployed' && platform.state !== 'setting-up') return false;
          var a = w.asteroids.find(function (a) { return a.id === platform.asteroidId; });
          var q = owner.project([platform.position.x, platform.position.y, owner.platformHeight(platform, a)], w.camera, viewport(), owner.orbit);
          return q.depth > 0 && Math.hypot(q.x - p.x, q.y - p.y) < 14 && (!rock || !rock.hit || q.depth <= rock.hit.depth + 10);
        });
        if (platform) target = platform.position;
        if (!target) return;
        owner.setWorld(sim.issuePickedContextOrder(w,target,DW.tacticalPicking.pickContext(w,target,semanticScale),w.selectedShipIds)); if (DW.audio) DW.audio.playMove(); return;
      }
      drag = { start: p, last: p, mode: viewerControls ? viewerControls.gesture(e, space) : e.altKey || (owner.study && e.button === 0 && !space) ? 'orbit' : e.button === 1 || space ? 'pan' : 'select' };
      owner.canvas.setPointerCapture(e.pointerId); e.preventDefault();
    });
    owner.canvas.addEventListener('pointermove', function (e) {
      if (!drag) return;
      var p = pointer(e), w = owner.getWorld();
      if (viewerControls) drag.mode = viewerControls.gesture(e, space);
      if (drag.mode === 'orbit') {
        owner.orbit.yaw -= (p.x - drag.last.x) * 0.006;
        owner.orbit.tilt = Math.max(0.06, Math.min(Math.PI - 0.06, owner.orbit.tilt + (p.y - drag.last.y) * 0.006));
      } else if (drag.mode === 'pan') {
        var a = owner.unproject(drag.last, w.camera, viewport(), owner.orbit, owner.orbit.height), b = owner.unproject(p, w.camera, viewport(), owner.orbit, owner.orbit.height);
        if (a && b) owner.setWorld(Object.assign({}, w, { camera: { x: w.camera.x + a.x - b.x, y: w.camera.y + a.y - b.y, zoom: w.camera.zoom } }));
      }
      drag.last = p;
    });
    owner.canvas.addEventListener('pointerup', function (e) {
      if (!drag) return;
      if (viewerControls && e.buttons) { drag.mode = viewerControls.gesture(e, space); drag.last = pointer(e); return; }
      if (drag.mode === 'select') {
        var p = pointer(e), w = owner.getWorld(), start = drag.start;
        /** @type {string[]} */ var ids = [];
        if (Math.hypot(p.x - start.x, p.y - start.y) < 5) {
          /** @type {ReturnType<typeof hitShip> | undefined} */ var hit = hitShip(w, p);
          var hitDepth = hit ? hit.depth : Infinity;
          if (hit && w.asteroids.some(function (a) { var rock = owner.pickAsteroid(p, a, w.camera, viewport(), owner.orbit); return rock && rock.depth < hitDepth; })) hit = undefined;
          if (hit) ids = [hit.ship.id];
          if (e.shiftKey && hit) { var hitId = hit.ship.id; ids = w.selectedShipIds.indexOf(hitId) >= 0 ? w.selectedShipIds.filter(function (id) { return id !== hitId; }) : w.selectedShipIds.concat(ids); }
        } else {
          ids = w.ships.filter(function (s) {
            var q = owner.project([s.position.x, s.position.y, 0], w.camera, viewport(), owner.orbit);
            return !s.docked && q.depth > 0 && q.x >= Math.min(p.x, start.x) && q.x <= Math.max(p.x, start.x) && q.y >= Math.min(p.y, start.y) && q.y <= Math.max(p.y, start.y);
          }).map(function (s) { return s.id; });
          if (e.shiftKey) ids = Array.from(new Set(w.selectedShipIds.concat(ids)));
        }
        var selected = sim.selectShips(w, ids);
        if (!ids.length && Math.hypot(p.x - start.x, p.y - start.y) < 5) {
          var platform = w.platforms.find(function (platform) {
            if (platform.state !== 'deployed' && platform.state !== 'setting-up') return false;
            var a = w.asteroids.find(function (a) { return a.id === platform.asteroidId; });
            var q = owner.project([platform.position.x, platform.position.y, owner.platformHeight(platform, a)], w.camera, viewport(), owner.orbit);
            return q.depth > 0 && Math.hypot(q.x - p.x, q.y - p.y) < 14;
          });
          if (platform) selected = sim.selectPlatform(selected, platform.id);
        }
        owner.setWorld(selected); if ((ids.length || selected.selectedPlatformId) && DW.audio) DW.audio.playSelect();
      }
      drag = null;
    });
    owner.canvas.addEventListener('pointercancel', function () { drag = null; });
    owner.canvas.addEventListener('wheel', function (e) {
      if(owner.orbit.surface){e.preventDefault();return;}
      e.preventDefault(); owner.focus = false; var w = owner.getWorld(), p = pointer(e), vp = viewport();
      if(owner.study && owner.terrainZoom && e.deltaY<0 && w.asteroids[0]) {
        var hit=owner.pickAsteroid(p,w.asteroids[0],w.camera,vp,owner.orbit);
        if(hit){owner.studyHeight=hit.position[2];owner.orbit.height=owner.studyHeight;w=Object.assign({},w,{camera:{x:hit.position[0],y:hit.position[1],zoom:w.camera.zoom}});}
      }
      var before = owner.unproject(p, w.camera, vp, owner.orbit, owner.orbit.height);
      var camera = { x: w.camera.x, y: w.camera.y, zoom: Math.max(0.2, Math.min(owner.study ? 512 : 128, w.camera.zoom * Math.exp(-Math.max(-300, Math.min(300, e.deltaY)) * 0.0015))) };
      var after = owner.unproject(p, camera, vp, owner.orbit, owner.orbit.height);
      if (before && after) { camera.x += before.x - after.x; camera.y += before.y - after.y; }
      owner.setWorld(Object.assign({}, w, { camera: camera }));
    }, { passive: false });
    window.addEventListener('keydown', function (e) {
      if(owner.orbit.surface)return;
      if (e.target instanceof HTMLElement && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      if (e.code === 'Space') { space = true; e.preventDefault(); }
      if (e.code === 'KeyF') owner.focus = true;
      if (e.code === 'KeyH' && !e.repeat) { var next = sim.spawnHostileWave(owner.getWorld()); owner.setWorld(next); owner.consume(next.combat.events); }
      if (e.code === 'KeyK' && !e.repeat) owner.setWorld(sim.spawnFighter(owner.getWorld()));
      if (e.code === 'KeyJ' && !e.repeat) {
        var w = owner.getWorld(), fighter = w.ships.find(function (s) { return s.type === 'escort' && w.selectedShipIds.indexOf(s.id) >= 0; });
        if (fighter) owner.setWorld(sim.damageFighter(w, fighter.id, 1));
      }
    });
    window.addEventListener('keyup', function (e) { if (e.code === 'Space') space = false; });
    window.addEventListener('blur', function () { space = false; drag = null; });
    var rigLightButton=owner.toolbar.querySelector('[data-rig-lights]');
    if(rigLightButton)rigLightButton.addEventListener('click',function(){owner.rigLightsEnabled=!owner.rigLightsEnabled;if(rigLightButton)rigLightButton.setAttribute('aria-pressed',String(owner.rigLightsEnabled));});
    var spotlightButton = owner.toolbar.querySelector('[data-spotlight]');
    if (spotlightButton) spotlightButton.addEventListener('click', function () {
      owner.spotlightEnabled = !owner.spotlightEnabled;
      if (spotlightButton) spotlightButton.setAttribute('aria-pressed', String(owner.spotlightEnabled));
    });
    var workShadowButton=owner.toolbar.querySelector('[data-work-shadows]');
    if(workShadowButton)workShadowButton.addEventListener('click',function(){owner.workShadowsEnabled=!owner.workShadowsEnabled;if(workShadowButton)workShadowButton.setAttribute('aria-pressed',String(owner.workShadowsEnabled));});
    var cutButton = owner.toolbar.querySelector('[data-cut]');
    var overviewButton = owner.toolbar.querySelector('[data-overview]');
    var topButton = owner.toolbar.querySelector('[data-top]');
    var orbitButton = owner.toolbar.querySelector('[data-orbit]');
    if (!cutButton || !overviewButton || !topButton || !orbitButton) throw new Error('Missing 3D controls');
    orbitButton.addEventListener('click', function () { owner.orbit.yaw += Math.PI / 6; owner.orbit.tilt = 0.75; });
    cutButton.addEventListener('click', function () {
      var w = owner.getWorld(), a = w.asteroids[0]; if (!a) return;
      owner.focus = false; w = sim.toggleAsteroidExcavation(w, a.id);
      owner.setWorld(Object.assign({}, w, { camera: { x: a.position.x, y: a.position.y, zoom: Math.min(viewport().height / (a.radius * 2.8), 1.8) } }));
    });
    overviewButton.addEventListener('click', function () {
      owner.focus = false; var w = owner.getWorld();
      var points = w.asteroids.map(function (a) { return a.position; }).concat(w.ships.map(function (s) { return s.position; }));
      var xs = points.map(function (p) { return p.x; }), ys = points.map(function (p) { return p.y; });
      var minX = Math.min.apply(null, xs) - 350, maxX = Math.max.apply(null, xs) + 350;
      var minY = Math.min.apply(null, ys) - 350, maxY = Math.max.apply(null, ys) + 350;
      owner.orbit.yaw = 0; owner.orbit.tilt = 0.48;
      owner.setWorld(Object.assign({}, w, { camera: { x: (minX + maxX) / 2, y: (minY + maxY) / 2,
        zoom: Math.min(viewport().width / (maxX - minX), viewport().height / (maxY - minY)) * 0.7 } }));
    });
    topButton.addEventListener('click', function () { owner.orbit.yaw = 0; owner.orbit.tilt = 0.06; });
    var underButton = owner.toolbar.querySelector('[data-under]');
    if (underButton) underButton.addEventListener('click', function () { owner.orbit.tilt = Math.PI - .75; });


    return {get drag(){return drag;},viewerControls:viewerControls,
      /** @param {boolean} enabled */setRigLightsEnabled:function(enabled){owner.rigLightsEnabled=enabled;if(rigLightButton)rigLightButton.setAttribute('aria-pressed',String(enabled));}};
  }
  DW.tacticalInput3d={mount:mount};
})(window);
