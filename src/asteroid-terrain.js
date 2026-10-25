(function (global) {
  'use strict';
  // CPU terrain, meshes and contact fitting. No renderer or browser resources.
  /** @typedef {import('./types').Asteroid} Asteroid */
  /** @typedef {[number, number, number]} V3 */
  /** @type {import('./types').DriftworksNamespace} */
  var DW = global.Driftworks;
  var sim = /** @type {import('./types').SimApi} */ (DW.sim);
  var miningPlatformGeometry = /** @type {Required<import('./types').DriftworksNamespace>} */ (DW).miningRig.geometry;

  /** @param {V3} a @param {V3} b */
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }

  /** @type {Record<string, { radius: number, visual: import('./types').AsteroidVisual }>} */
  var geology = {};
  /** @param {Asteroid} asteroid */
  function visualFor(asteroid) {
    if (!DW.asteroidArt) throw new Error('Shared asteroid artwork did not load');
    var cached = geology[asteroid.id];
    if (!cached || cached.radius !== asteroid.radius) cached = geology[asteroid.id] = { radius: asteroid.radius, visual: DW.asteroidArt.describe(asteroid) };
    return cached.visual;
  }
  /** Viewer-only artwork controls; never change persistent asteroid fields. */
  /** @param {Asteroid} asteroid @param {{bulk?: number[], roughness?: number, craterDepth?: number, heterogeneity?: number}} parameters */
  function setStudyParameters(asteroid, parameters) {
    if (!DW.asteroidArt) throw new Error('Shared asteroid artwork did not load');
    var visual = DW.asteroidArt.describe(asteroid, parameters.bulk);
    if (Number.isFinite(parameters.roughness)) visual.surfaceProfile.roughnessAmp *= Math.max(0, Math.min(2, /** @type {number} */ (parameters.roughness)));
    if (Number.isFinite(parameters.craterDepth)) visual.craters.forEach(function (crater) { crater.depth = Math.min(.12, crater.depth * Math.max(.25, Math.min(2, /** @type {number} */ (parameters.craterDepth)))); });
    if (Number.isFinite(parameters.heterogeneity)) visual.heterogeneity = Math.max(0, Math.min(1, /** @type {number} */ (parameters.heterogeneity)));
    geology[asteroid.id] = {radius: asteroid.radius, visual: visual};
    delete shells[asteroid.id]; delete impacts[asteroid.id];
    return visual;
  }
  /** @typedef {{center: V3, normal: V3, radius: number, depth: number, rim: number}} Impact */
  /** @type {Record<string, { radius: number, table: Float32Array }>} */
  var shells = {};
  /** @type {Record<string, {radius: number, impacts: Impact[], buckets: Record<string, Impact[]>}>} */
  var impacts = {};
  /** @param {Asteroid} asteroid @param {V3} direction */
  function broadRadius(asteroid, direction) {
    var visual = visualFor(asteroid), broad = Object.assign({}, visual, {craters: []});
    var w = direction.map(function (v) { return Math.pow(Math.abs(v), 8); });
    var sum = w[0] + w[1] + w[2];
    var art = /** @type {NonNullable<typeof DW.asteroidArt>} */ (DW.asteroidArt);
    return 1 + (art.reliefAt(broad, direction[1], direction[2]) * w[0] + art.reliefAt(broad, direction[2], direction[0]) * w[1] + art.reliefAt(broad, direction[0], direction[1]) * w[2]) / sum;
  }
  /** @param {Asteroid} asteroid @param {V3} direction @returns {V3} */
  function broadPoint(asteroid, direction) {
    var r = sim.surfaceRadius(asteroid, Math.atan2(direction[1], direction[0])) / asteroid.radius;
    var h = broadRadius(asteroid, direction);
    return [direction[0]*r*h, direction[1]*r*h, direction[2]*.78*h];
  }
  /** Exact uncratered field, used only to author local impact frames. */
  /** @param {Asteroid} asteroid @param {V3} p */
  function broadField(asteroid, p) {
    var r = sim.surfaceRadius(asteroid, Math.atan2(p[1], p[0])) / asteroid.radius;
    /** @type {V3} */ var d = [p[0]/r, p[1]/r, p[2]/.78];
    var length = Math.hypot.apply(null, d);
    return length - broadRadius(asteroid, [d[0]/length,d[1]/length,d[2]/length]);
  }
  /** Circular footprints live in the actual body tangent plane, in world units. */
  /** @param {Asteroid} asteroid */
  function impactsFor(asteroid) {
    var cached = impacts[asteroid.id];
    if (cached && cached.radius === asteroid.radius) return cached.impacts;
    /** @type {Impact[]} */ var list = [];
    for (var side = 0; side < 2; side++) visualFor(asteroid).craters.forEach(function (crater) {
      var r = sim.surfaceRadius(asteroid, Math.atan2(crater.y, crater.x)) / asteroid.radius;
      var x = crater.x/(r*.96), y = crater.y/(r*.96), z = Math.sqrt(Math.max(.001,1-x*x-y*y));
      var length = Math.hypot(x,y,z);
      /** @type {V3} */ var direction = side ? [-y/length,x/length,-z/length] : [x/length,y/length,z/length];
      var center = broadPoint(asteroid, direction), e = .0005;
      /** @type {V3} */ var gradient = [
        broadField(asteroid,[center[0]+e,center[1],center[2]])-broadField(asteroid,[center[0]-e,center[1],center[2]]),
        broadField(asteroid,[center[0],center[1]+e,center[2]])-broadField(asteroid,[center[0],center[1]-e,center[2]]),
        broadField(asteroid,[center[0],center[1],center[2]+e])-broadField(asteroid,[center[0],center[1],center[2]-e])];
      var magnitude = Math.hypot.apply(null,gradient);
      list.push({center:center,normal:[gradient[0]/magnitude,gradient[1]/magnitude,gradient[2]/magnitude],radius:crater.rx,depth:crater.depth,rim:crater.rimScale});
    });
    /** @type {Record<string, Impact[]>} */ var buckets = {};
    list.forEach(function(impact) {
      var bound = impact.radius*1.6;
      for(var z=Math.floor((impact.center[2]-bound)/.15);z<=Math.floor((impact.center[2]+bound)/.15);z++)
        for(var y=Math.floor((impact.center[1]-bound)/.15);y<=Math.floor((impact.center[1]+bound)/.15);y++)
          for(var x=Math.floor((impact.center[0]-bound)/.15);x<=Math.floor((impact.center[0]+bound)/.15);x++) {
            var key=x+','+y+','+z;
            if(!buckets[key]) buckets[key]=[];
            buckets[key].push(impact);
          }
    });
    impacts[asteroid.id] = {radius:asteroid.radius,impacts:list,buckets:buckets};
    return list;
  }
  /** @param {Pick<Impact, 'center' | 'normal' | 'radius'>} impact @param {V3} point */
  function craterDistance(impact, point) {
    /** @type {V3} */ var d = [point[0]-impact.center[0],point[1]-impact.center[1],point[2]-impact.center[2]];
    var axial = dot(d,impact.normal);
    return Math.hypot(d[0]-axial*impact.normal[0],d[1]-axial*impact.normal[1],d[2]-axial*impact.normal[2])/impact.radius;
  }
  /** @param {Asteroid} asteroid @param {V3} direction */
  function globeRelief(asteroid, direction) {
    return physicalRelief(asteroid,broadPoint(asteroid,direction));
  }
  /** Spatial bins retain age order and avoid scanning every impact per voxel. */
  /** @param {Asteroid} asteroid @param {V3} point */
  function physicalRelief(asteroid,point) {
    impactsFor(asteroid);
    var h = 0, key = Math.floor(point[0]/.15)+','+Math.floor(point[1]/.15)+','+Math.floor(point[2]/.15);
    var candidates = impacts[asteroid.id].buckets[key] || [];
    candidates.forEach(function (impact) {
      /** @type {V3} */ var d = [point[0]-impact.center[0],point[1]-impact.center[1],point[2]-impact.center[2]];
      // The opposite side of a closed body must not receive this impact stamp.
      if (dot(d,d) > impact.radius*impact.radius*2.56) return;
      var q = craterDistance(impact,point);
      if (q >= 1.35) return;
      var t = Math.max(0,Math.min(1,(q-.7)/.48));
      h *= t*t*(3-2*t);
      if(q<1) h -= (1-q*q)*impact.depth;
      var rim = (q-1)/.16;
      h += Math.exp(-rim*rim)*impact.depth*.34*impact.rim;
    });
    return h;
  }
  /** RGBA8, five texels per impact: center, local normal, radius, depth, rim. */
  /** @param {Asteroid} asteroid */
  function impactBytes(asteroid) {
    var list = impactsFor(asteroid), bytes = new Uint8Array(288*20);
    list.forEach(function(impact,index) {
      var values = impact.center.map(function(v){return (v+1.2)/2.4;}).concat(impact.normal.map(function(v){return (v+1)/2;}),[impact.radius/.4,impact.depth/.12,impact.rim,0]);
      values.forEach(function(value,i){var packed=Math.round(Math.max(0,Math.min(1,value))*65535);bytes[index*20+i*2]=packed>>8;bytes[index*20+i*2+1]=packed&255;});
    });
    return bytes;
  }
  /** Cache angular relief once; voxel evaluation and picking share this shell. */
  /** @param {Asteroid} asteroid @param {V3} direction */
  function shellRadius(asteroid, direction) {
    var cached = shells[asteroid.id], nx = 128, ny = 64;
    if (!cached || cached.radius !== asteroid.radius) {
      var table = new Float32Array((nx + 1) * (ny + 1));
      for (var iy = 0; iy <= ny; iy++) for (var ix = 0; ix <= nx; ix++) {
        var longitude = ix / nx * Math.PI * 2, latitude = iy / ny * Math.PI;
        /** @type {V3} */ var d = [Math.cos(longitude)*Math.sin(latitude),Math.sin(longitude)*Math.sin(latitude),Math.cos(latitude)];
        table[ix+(nx+1)*iy] = broadRadius(asteroid,d);
      }
      cached = shells[asteroid.id] = { radius: asteroid.radius, table: table };
    }
    var samples = cached.table;
    var gx = ((Math.atan2(direction[1], direction[0]) / (Math.PI * 2) + 1) % 1) * nx;
    var gy = Math.acos(Math.max(-1, Math.min(1, direction[2]))) / Math.PI * ny;
    var x = Math.floor(gx), y = Math.min(ny - 1, Math.floor(gy)), tx = gx - x, ty = gy - y;
    var a = samples[x + (nx + 1) * y] * (1 - tx) + samples[x + 1 + (nx + 1) * y] * tx;
    var b = samples[x + (nx + 1) * (y + 1)] * (1 - tx) + samples[x + 1 + (nx + 1) * (y + 1)] * tx;
    return a * (1 - ty) + b * ty;
  }
  /** @param {Asteroid} asteroid @param {V3} p @param {boolean} [broadOnly] */
  function outerField(asteroid, p, broadOnly) {
    var r = sim.surfaceRadius(asteroid, Math.atan2(p[1], p[0])) / asteroid.radius;
    /** @type {V3} */ var d = [p[0] / r, p[1] / r, p[2] / .78];
    var length = Math.hypot.apply(null, d);
    if (length < .000001) return -1;
    var base = length - shellRadius(asteroid, [d[0]/length,d[1]/length,d[2]/length]);
    if (broadOnly || Math.abs(base) > .2) return base;
    var a = Math.atan2(p[1],p[0]), dr = -.21*Math.sin(a*3)+.25*Math.cos(a*5);
    var gx = p[0]/(r*r*length)+dr*p[1]/(r*r*r*length);
    var gy = p[1]/(r*r*length)-dr*p[0]/(r*r*r*length);
    var gz = p[2]/(.78*.78*length);
    return base - physicalRelief(asteroid,p)*Math.hypot(gx,gy,gz);
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

  /** @param {Asteroid} asteroid @param {V3} direction */
  function surfaceFrame(asteroid,direction) {
    var length=Math.hypot.apply(null,direction);
    /** @type {V3} */ var d=[direction[0]/length,direction[1]/length,direction[2]/length];
    var lo=0,hi=1.1;
    for(var i=0;i<25;i++){var mid=(lo+hi)/2;if(rockField(asteroid,[d[0]*mid,d[1]*mid,d[2]*mid])<0)lo=mid;else hi=mid;}
    /** @type {V3} */ var point=[d[0]*(lo+hi)/2,d[1]*(lo+hi)/2,d[2]*(lo+hi)/2];
    var e=.0005;
    /** @type {V3} */ var normal=[rockField(asteroid,[point[0]+e,point[1],point[2]])-rockField(asteroid,[point[0]-e,point[1],point[2]]),rockField(asteroid,[point[0],point[1]+e,point[2]])-rockField(asteroid,[point[0],point[1]-e,point[2]]),rockField(asteroid,[point[0],point[1],point[2]+e])-rockField(asteroid,[point[0],point[1],point[2]-e])];
    var magnitude=Math.hypot.apply(null,normal)||1;
    return {point:point,normal:/** @type {V3} */ ([normal[0]/magnitude,normal[1]/magnitude,normal[2]/magnitude])};
  }

  /** @param {V3} p @param {V3} a @param {V3} b */
  function segmentDistance(p, a, b) {
    /** @type {V3} */ var d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    /** @type {V3} */ var q = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
    var t = Math.max(0, Math.min(1, dot(q, d) / Math.max(0.000001, dot(d, d))));
    return Math.hypot(q[0] - t * d[0], q[1] - t * d[1], q[2] - t * d[2]);
  }
  /** Solid field in asteroid-local normalized coordinates; negative means rock. */
  /** Piecewise-linear, repeatable fracture displacement; no rounded wave bands.
   * @param {V3} p */
  function excavationFracture(p) {
    var x=p[0]*31, y=p[1]*31, z=p[2]*31;
    var ix=Math.floor(x), iy=Math.floor(y), iz=Math.floor(z);
    x-=ix;y-=iy;z-=iz;
    var value=0;
    for(var k=0;k<2;k++)for(var j=0;j<2;j++)for(var i=0;i<2;i++){
      var hash=Math.sin((ix+i)*127.1+(iy+j)*311.7+(iz+k)*74.7)*43758.5453;
      value+=(hash-Math.floor(hash))*(i?x:1-x)*(j?y:1-y)*(k?z:1-z);
    }
    return value*2-1;
  }
  /** Octagonal excavation along a segment, with planar sides and sloping haunches.
   * @param {V3} p @param {V3} a @param {V3} b */
  function excavatedPassage(p,a,b){
    var dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2],length=Math.hypot(dx,dy,dz);
    var t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy+(p[2]-a[2])*dz)/(length*length)));
    var qx=p[0]-a[0]-dx*t,qy=p[1]-a[1]-dy*t,qz=p[2]-a[2]-dz*t;
    var horizontal=Math.hypot(dx,dy),side=Math.abs((-dy*qx+dx*qy)/horizontal);
    var up=Math.abs((qz*horizontal-(qx*dx+qy*dy)*dz/horizontal)/length);
    var end=Math.abs((qx*dx+qy*dy+qz*dz)/length);
    return Math.max(side*.94,up*1.12,(side+up)*.77,end)-.062;
  }
  /** @param {Asteroid} asteroid @param {V3} p @param {boolean} [cutaway] */
  function rockField(asteroid, p, cutaway) {
    var outer = outerField(asteroid, p);
    var e = asteroid.excavation;
    if (!e || e.level <= 0) return outer;
    var depth = Math.min(0.42, Math.max(0.03, e.depthM / sim.METERS_PER_UNIT / asteroid.radius));
    /** @type {V3} */ var center = [e.pocketOffset.x, e.pocketOffset.y, -depth];
    /** @type {V3} */ var entrance = [Math.cos(e.tunnelAngle) * 1.08, Math.sin(e.tunnelAngle) * 1.08, -depth];
    /** @type {V3} */ var bend = [Math.cos(e.tunnelAngle + e.tunnelTurn) * 0.43,
      Math.sin(e.tunnelAngle + e.tunnelTurn) * 0.43, -depth - 0.035];
    var x = p[0] - center[0], y = p[1] - center[1], z = p[2] - center[2];
    // Intersect offset joint planes instead of carving a smooth ellipsoid.
    // Oblique faces form broken shoulders, a pitched roof and uneven walls.
    var r=e.pocketRadius, broken=excavationFracture(p);
    var cavity=Math.max(Math.abs(x)/1.16-r,Math.abs(y)/.88-r,Math.abs(z)/.82-r,
      (x*.63+y*.51+z*.58)-r*.98,(-x*.72+y*.33+z*.61)-r*.94,
      (x*.31-y*.81+z*.49)-r*.93,(-x*.4-y*.63-z*.66)-r*.96,
      (x*.75+y*.52-z*.4)-r*.98)+.018*broken;
    var tunnel=Math.min(excavatedPassage(p,entrance,bend),excavatedPassage(p,bend,center))+.012*broken;
    var solid = Math.max(outer, -Math.min(cavity, tunnel));
    // Cutaway is an inspection operation, separate from the excavated solid.
    // Existing callers retain their established cutaway presentation.
    return cutaway === false ? solid : Math.max(solid, p[2] + depth);
  }

  /** CPU terrain is shared with rendering; contact solutions never live in saves.
   * @type {Map<string,{key:string;visual:import('./types').AsteroidVisual;data:Float32Array;sites:Map<string,import('./types').PlatformSurface|null>}>} */
  var contactTerrain=new Map();
  /** @param {Asteroid} asteroid */
  function contactMesh(asteroid){
    var key=asteroid.radius+':'+JSON.stringify(asteroid.excavation || null),visual=visualFor(asteroid),cached=contactTerrain.get(asteroid.id);
    if(!cached || cached.key!==key || cached.visual!==visual){cached={key:key,visual:visual,data:asteroidMesh(asteroid),sites:/** @type {Map<string,import('./types').PlatformSurface|null>} */ (new Map())};contactTerrain.set(asteroid.id,cached);}
    return cached;
  }
  /** Fixed physical scale keeps contacts independent of camera magnification.
   * @param {import('./types').Platform} platform @param {Asteroid} asteroid @param {boolean} [open] */
  function platformSurface(platform,asteroid,open){
    var terrain=DW.miningTerrain;if(!terrain)return null;
    var mesh=contactMesh(asteroid),key=platform.siteAngle+':'+platform.siteDepth;
    if(!mesh.sites.has(key)){
      var scale=terrain.metresPerModelUnit/sim.METERS_PER_UNIT,heading=platform.siteAngle;
      var radius=sim.surfaceRadius(asteroid,heading)*(platform.siteDepth || .5),site=[Math.cos(heading)*radius,Math.sin(heading)*radius];
      var sample=terrain.surfaceSampler(mesh.data,asteroid.radius,site,heading,scale),fit=terrain.fit(sample,[0,0]);
      mesh.sites.set(key,fit?{fit:fit,sample:sample,scale:scale,site:site,heading:heading,ramps:null}:null);
    }
    var surface=mesh.sites.get(key) || null;
    if(open && surface && surface.fit.valid && !surface.ramps){
      surface.ramps=terrain.rampStops(surface.sample,surface.fit,function(t){return /** @type {Required<import('./types').DriftworksNamespace>} */ (DW).miningRig.ramps(t);});
    }
    return surface;
  }
  /** @type {WeakMap<import('./types').PlatformSurface,{key:string;groups:Record<string,number[]>}>} */
  var contactGeometry=new WeakMap();
  /** @param {import('./types').PlatformSurface} surface @param {number} deployment @param {number} ramps */
  function platformSurfaceGeometry(surface,deployment,ramps){
    var terrain=DW.miningTerrain,key=deployment+':'+ramps,cached=contactGeometry.get(surface);
    if(cached && cached.key===key)return cached.groups;
    var contacts=terrain?terrain.contactPoses(surface.fit,deployment):undefined;
    var limits=surface.ramps?surface.ramps.map(function(limit){return limit*ramps;}):undefined;
    var groups=miningPlatformGeometry(deployment,0,false,ramps,'',false,false,contacts,limits);
    contactGeometry.set(surface,{key:key,groups:groups});return groups;
  }
  /** Renderer-owned pose from persistent simulation state; no DOM or camera inputs.
   * @param {import('./types').PlatformSurface} surface @param {import('./types').Platform} platform @param {Asteroid} asteroid */
  function platformSurfacePose(surface,platform,asteroid){
    var landing=platform.state==='setting-up' && platform.landingElapsedSeconds!==undefined && DW.miningLanding?DW.miningLanding.sample(platform.landingElapsedSeconds):null;
    var spin=asteroid.rotation || 0,heading=surface.heading+spin,cs=Math.cos(heading),sn=Math.sin(heading);
    var yaw=landing?landing.headingOffset-(spin-(platform.landingReleaseRotation || 0))*(1-landing.match):0,c=Math.cos(yaw),s=Math.sin(yaw);
    var altitude=landing?landing.altitude/sim.METERS_PER_UNIT:0,scale=surface.scale;
    // Horizontal approach is owned by logistics; fitting only determines the contact height/tilt.
    var ox=surface.fit.origin[0]*scale,oy=surface.fit.origin[1]*scale;
    var origin=[platform.position.x+cs*ox-sn*oy,platform.position.y+sn*ox+cs*oy,surface.fit.origin[2]*scale+altitude];
    /** @param {number[]} p */
    function rotate(p){var local=[c*p[0]-s*p[1],s*p[0]+c*p[1],p[2]],b=surface.fit.basis;
      var x=b[0][0]*local[0]+b[1][0]*local[1]+b[2][0]*local[2],y=b[0][1]*local[0]+b[1][1]*local[1]+b[2][1]*local[2];
      return [cs*x-sn*y,sn*x+cs*y,b[0][2]*local[0]+b[1][2]*local[1]+b[2][2]*local[2]];}
    /** @param {number[]} p */
    function world(p){var r=rotate(p);return r.map(function(v,k){return origin[k]+v*scale;});}
    return {world:world,rotate:rotate};
  }

  /** Marching tetrahedra: cached closed solid including cut face and cavity walls. */
  /** @param {Asteroid} asteroid @param {number} [resolution] @param {boolean} [cutaway] */
  function asteroidMesh(asteroid, resolution, cutaway) {
    var n = resolution || 88, stride = n + 1;
    var field = new Float32Array(stride * stride * stride);
    var step = 2.2 / n;
    /** @param {number} x @param {number} y @param {number} z @returns {V3} */
    function point(x, y, z) { return [-1.1 + x * step, -1.1 + y * step, -1.1 + z * step]; }
    /** @param {number} x @param {number} y @param {number} z */
    function index(x, y, z) { return x + stride * (y + stride * z); }
    /** @param {V3} p */
    function sampledField(p) { return rockField(asteroid, p, cutaway); }
    for (var z = 0; z <= n; z++) for (var y = 0; y <= n; y++) for (var x = 0; x <= n; x++) {
      field[index(x, y, z)] = sampledField(point(x, y, z));
    }
    var corners = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]];
    var tetrahedra = [[0, 5, 1, 6], [0, 1, 2, 6], [0, 2, 3, 6], [0, 3, 7, 6], [0, 7, 4, 6], [0, 4, 5, 6]];
    /** @type {number[]} */ var output = [];
    /** @param {V3} p */
    function vertex(p) {
      var h = 0.0005;
      var exterior = !asteroid.excavation || asteroid.excavation.level <= 0 || Math.abs(outerField(asteroid,p)) < .012;
      /** @param {V3} point */
      function normalField(point) { return exterior ? outerField(asteroid,point,true) : sampledField(point); }
      var dx = normalField([p[0] + h, p[1], p[2]]) - normalField([p[0] - h, p[1], p[2]]);
      var dy = normalField([p[0], p[1] + h, p[2]]) - normalField([p[0], p[1] - h, p[2]]);
      var dz = normalField([p[0], p[1], p[2] + h]) - normalField([p[0], p[1], p[2] - h]);
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
  /** Drop derived data when its owning world/scene removes an asteroid.
   * @param {string} id */
  function release(id) {
    contactTerrain.delete(id); delete geology[id]; delete shells[id]; delete impacts[id];
  }

  DW.asteroidTerrain = {
    asteroidMesh: asteroidMesh,
    contactMesh: contactMesh,
    craterDistance: craterDistance,
    globeRelief: globeRelief,
    impactBytes: impactBytes,
    impactsFor: impactsFor,
    platformSurface: platformSurface,
    platformSurfaceGeometry: platformSurfaceGeometry,
    platformSurfacePose: platformSurfacePose,
    rockField: rockField,
    setStudyParameters: setStudyParameters,
    surfaceFrame: surfaceFrame,
    surfaceHeight: surfaceHeight,
    visualFor: visualFor,
    release: release
  };
})(window);
