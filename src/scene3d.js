(function (global) {
  'use strict';
  /** @typedef {import('./types').World} World */
  /** @typedef {import('./types').Vec2} Vec2 */
  /** @typedef {import('./types').Camera} Camera */
  /** @typedef {import('./types').Viewport} Viewport */
  /** @typedef {import('./types').Asteroid} Asteroid */
  /** @typedef {[number, number, number]} V3 */
  /** @typedef {{ yaw: number, tilt: number, height?: number, surface?: View }} Orbit */
  /** @typedef {{ right: V3, up: V3, back: V3, distance: number, focal: number }} View */
  /** @typedef {{ buffer: WebGLBuffer, count: number, data?: Float32Array, stride?: number, bakedBuffer?:WebGLBuffer, bakedValues?:Float32Array }} Mesh */
  /** @type {import('./types').DriftworksNamespace} */
  var DW = global.Driftworks;
  var sim = /** @type {import('./types').SimApi} */ (DW.sim);
  var FOCAL = 1 / Math.tan(Math.PI / 8);
  /** @type {Record<string, { radius: number, visual: import('./types').AsteroidVisual }>} */
  var geology = {};
  // Geology shared with the Three.js comparison; lighting remains backend-owned.
  var ROCK_SURFACE_SHADER =
      'vec3 rotateNormal(vec3 n){float c=cos(uRotation),s=sin(uRotation);return vec3(c*n.x-s*n.y,s*n.x+c*n.y,n.z);}\n'+
      'float stripe(float value,float center,float halfWidth,float aa){return 1.-smoothstep(halfWidth,halfWidth+aa,abs(value-center));}\n'+
      'float angularDistance(float a,float b){return abs(mod(a-b+PI,2.*PI)-PI);}\n'+
      // Packed physical centers and normals define circular local tangent disks.
      'vec4 impactTexel(float impact,float offset){return texture2D(uCraterData,vec2((impact*5.+offset+.5)/uCraterTextureWidth,.5));}\n'+
      'vec4 globeCraters(vec3 p){float h=0.;vec3 grad=vec3(0.);float occ=0.;'+
      'for(int i=0;i<288;i++){if(float(i)<uCraterCount){float fi=float(i);vec4 t0=impactTexel(fi,0.);vec4 t1=impactTexel(fi,1.);vec4 t2=impactTexel(fi,2.);vec4 t3=impactTexel(fi,3.);vec4 t4=impactTexel(fi,4.);vec3 center=vec3(unpack16(t0.rg),unpack16(t0.ba),unpack16(t1.rg))*2.4-1.2;vec3 axis=normalize(vec3(unpack16(t1.ba),unpack16(t2.rg),unpack16(t2.ba))*2.-1.);float size=unpack16(t3.rg)*.4;vec3 d=p-center;if(length(d)<size*1.6){vec3 tangent=d-axis*dot(d,axis);float distance=length(tangent);float q=distance/max(.001,size);if(q<1.35){float depth=unpack16(t3.ba)*.12;float rimScale=unpack16(t4.rg);vec3 dq=distance>.00001?tangent/(distance*size):vec3(0.);float t=clamp((q-.7)/.48,0.,1.);float mask=t*t*(3.-2.*t);float dm=(q>.7&&q<1.18)?6.*t*(1.-t)/.48:0.;grad=grad*mask+h*dm*dq;h*=mask;if(q<1.){h-=(1.-q*q)*depth;grad+=2.*depth*q*dq;occ=max(occ,(1.-q)*.42);}float rd=(q-1.)/.16;float rim=exp(-rd*rd)*depth*.34*rimScale;h+=rim;grad+=rim*(-2.*(q-1.)/(.16*.16))*dq;}}}}return vec4(grad,min(.58,occ));}\n'+
      'vec3 globeWeights(vec3 p){vec3 w=pow(abs(p),vec3(8.));return w/(w.x+w.y+w.z);}\n'+
      // Solid 3D noise is sampled after deformation, in physical body space.
      // No sphere normalization, ellipsoid rescaling or planar projection.
      'float hash31(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453123);}\n'+
      'float noise3(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(hash31(i),hash31(i+vec3(1,0,0)),f.x),mix(hash31(i+vec3(0,1,0)),hash31(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash31(i+vec3(0,0,1)),hash31(i+vec3(1,0,1)),f.x),mix(hash31(i+vec3(0,1,1)),hash31(i+vec3(1,1,1)),f.x),f.y),f.z);}\n'+
      // Analytic value-noise derivatives: eight hashes per layer, not six noise evaluations.
      'vec4 noiseGradient3(vec3 p){vec3 i=mod(floor(p),256.),t=fract(p),f=t*t*(3.-2.*t),df=6.*t*(1.-t);float a=hash31(i),b=hash31(i+vec3(1,0,0)),c=hash31(i+vec3(0,1,0)),d=hash31(i+vec3(1,1,0)),e=hash31(i+vec3(0,0,1)),g=hash31(i+vec3(1,0,1)),h=hash31(i+vec3(0,1,1)),j=hash31(i+vec3(1,1,1));float lo=mix(mix(a,b,f.x),mix(c,d,f.x),f.y),hi=mix(mix(e,g,f.x),mix(h,j,f.x),f.y);return vec4(mix(lo,hi,f.z),mix(mix(b-a,d-c,f.y),mix(g-e,j-h,f.y),f.z)*df.x,mix(mix(c-a,d-b,f.x),mix(h-e,j-g,f.x),f.z)*df.y,(hi-lo)*df.z);}\n'+
      'vec3 rockBump(vec3 p,float fp){vec3 gradient=vec3(0.);float amplitude=1.,frequency=13.+uProfile.y*27.;mat3 basis=mat3(1.);for(int octave=0;octave<14;octave++){float visibility=1.-smoothstep(.28,.72,frequency*fp);if(visibility<.001)break;vec4 sampleValue=noiseGradient3(basis*p*frequency+vec3(uSeed*1.73+float(octave)*17.13));vec3 derivative=vec3(dot(basis[0],sampleValue.yzw),dot(basis[1],sampleValue.yzw),dot(basis[2],sampleValue.yzw));gradient+=derivative*frequency*amplitude*visibility*2.;basis=mat3(.36,.48,-.8,-.8,.60,0.,.48,.64,.60)*basis;frequency*=2.03;amplitude*=.49;}return gradient*uProfile.x*.0055;}\n'+
      'vec3 globeColor(vec3 p){vec3 w=globeWeights(p);return materialColor(composition(p.yz))*w.x+materialColor(composition(p.zx))*w.y+materialColor(composition(p.xy))*w.z;}\n';
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
  /** Fixed work light: 2 m above rock, aimed 12 m along its tangent plane.
   * Positions are asteroid-local world units; dimensions never follow camera zoom.
   * @param {Asteroid} asteroid */
  function surfaceSpotlight(asteroid) {
    var frame=surfaceFrame(asteroid,[.4,.5,.75]), n=frame.normal;
    var tangent=[-n[0]*n[1],1-n[1]*n[1],-n[2]*n[1]];
    var length=Math.hypot.apply(null,tangent)||1, unit=1/sim.METERS_PER_UNIT;
    var forward=tangent.map(function(p){return p/length;});
    var right=[forward[1]*n[2]-forward[2]*n[1],forward[2]*n[0]-forward[0]*n[2],forward[0]*n[1]-forward[1]*n[0]];
    var position=frame.point.map(function(p,i){return p*asteroid.radius+(n[i]*2-right[i]*2)*unit;});
    var direction=forward.map(function(p,i){return p*12+right[i]*2-n[i]*2;});
    var magnitude=Math.hypot.apply(null,direction);
    return {position:position,direction:direction.map(function(p){return p/magnitude;}),range:30*unit};
  }
  /** Shared light-camera frame for both shadow depth and visible surface passes.
   * @param {Asteroid} asteroid @param {ReturnType<typeof surfaceSpotlight>} lamp @param {Camera} camera @param {number} height */
  function workLightFrame(asteroid,lamp,camera,height) {
    var c=Math.cos(asteroid.rotation),s=Math.sin(asteroid.rotation);
    var direction=[c*lamp.direction[0]-s*lamp.direction[1],s*lamp.direction[0]+c*lamp.direction[1],lamp.direction[2]];
    var reference=Math.abs(direction[2])<.95?[0,0,1]:[0,1,0];
    var right=[direction[1]*reference[2]-direction[2]*reference[1],direction[2]*reference[0]-direction[0]*reference[2],direction[0]*reference[1]-direction[1]*reference[0]];
    var length=Math.hypot.apply(null,right);right=right.map(function(p){return p/length;});
    var up=[right[1]*direction[2]-right[2]*direction[1],right[2]*direction[0]-right[0]*direction[2],right[0]*direction[1]-right[1]*direction[0]];
    return {position:[asteroid.position.x+c*lamp.position[0]-s*lamp.position[1]-camera.x,asteroid.position.y+s*lamp.position[0]+c*lamp.position[1]-camera.y,lamp.position[2]-height],direction:direction,right:right,up:up,focal:4/3,near:lamp.range/600};
  }
  /** @param {V3} a @param {V3} b */
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  /** @param {Camera} camera @param {Viewport} viewport @param {Orbit} orbit @returns {View} */
  function view(camera, viewport, orbit) {
    if(orbit.surface)return orbit.surface;
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
  // Immutable source-space bounds; transforms and camera planes remain frame-local.
  /** @type {WeakMap<Float32Array, {center:V3,half:V3}>} */
  var studyBounds=new WeakMap();
  /** Conservative box/frustum test matching the study vertex shader. No shadow/picking use.
   * @param {import('../experiments/types').Batch} batch @param {V3} target @param {View} camera @param {number} aspect */
  function studyBatchVisible(batch,target,camera,aspect){
    var bounds=studyBounds.get(batch.vertices);
    if(!bounds){
      var lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity],stride=batch.stride||(batch.texture?8:6);
      for(var i=0;i<batch.vertices.length;i+=stride)for(var k=0;k<3;k++){lo[k]=Math.min(lo[k],batch.vertices[i+k]);hi[k]=Math.max(hi[k],batch.vertices[i+k]);}
      bounds={center:/** @type {V3} */(lo.map(function(v,k){return (v+hi[k])/2;})),half:/** @type {V3} */(lo.map(function(v,k){return (hi[k]-v)/2;}))};
      studyBounds.set(batch.vertices,bounds);
    }
    var box=bounds;
    var b=batch.basis,scale=batch.scale===undefined?1:batch.scale,c=Math.cos(batch.rotation||0),s=Math.sin(batch.rotation||0);
    var a00=(c*(b?b[0]:1)-s*(b?b[1]:0))*scale,a10=(s*(b?b[0]:1)+c*(b?b[1]:0))*scale,a20=(b?b[2]:0)*scale;
    var a01=(c*(b?b[3]:0)-s*(b?b[4]:1))*scale,a11=(s*(b?b[3]:0)+c*(b?b[4]:1))*scale,a21=(b?b[5]:0)*scale;
    var a02=(c*(b?b[6]:0)-s*(b?b[7]:0))*scale,a12=(s*(b?b[6]:0)+c*(b?b[7]:0))*scale,a22=(b?b[8]:1)*scale;
    var origin=batch.origin,cx=box.center[0],cy=box.center[1],cz=box.center[2];
    var x=(origin?origin[0]:0)-target[0]+a00*cx+a01*cy+a02*cz,y=(origin?origin[1]:0)-target[1]+a10*cx+a11*cy+a12*cz,z=(origin?origin[2]:0)-target[2]+a20*cx+a21*cy+a22*cz;
    /** @param {number} nx @param {number} ny @param {number} nz @param {number} constant */
    function outside(nx,ny,nz,constant){
      var support=Math.abs(nx*a00+ny*a10+nz*a20)*box.half[0]+Math.abs(nx*a01+ny*a11+nz*a21)*box.half[1]+Math.abs(nx*a02+ny*a12+nz*a22)*box.half[2];
      return nx*x+ny*y+nz*z+constant+support < -1e-5;
    }
    var back=camera.back,d=camera.distance;
    if(outside(-back[0],-back[1],-back[2],d-.1)||outside(back[0],back[1],back[2],30000))return false;
    for(var dimension=0;dimension<2;dimension++){
      var direction=dimension===0?camera.right:camera.up,tangent=(dimension===0?aspect:1)/camera.focal;
      for(var sign=-1;sign<=1;sign+=2)if(outside(-back[0]*tangent+sign*direction[0],-back[1]*tangent+sign*direction[1],-back[2]*tangent+sign*direction[2],d*tangent))return false;
    }
    return true;
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
    var fitted=platformSurface(platform,asteroid);
    if(fitted && fitted.fit.valid)return platformSurfacePose(fitted,platform,asteroid).world([0,0,0])[2];
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
    var asteroidId=a.id;
    var nearby=world.platforms.find(function(p){return p.asteroidId===asteroidId && (p.state==='deployed' || p.state==='setting-up' || p.state==='packing-up') && Math.hypot(p.position.x-camera.x,p.position.y-camera.y)<4;});
    if(nearby){var fitted=platformSurface(nearby,a);if(fitted && fitted.fit.valid)return platformHeight(nearby,a)+8*fitted.scale;}
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

  var boxMesh=/** @type {Required<import('./types').DriftworksNamespace>} */ (DW).meshBuilder.boxMesh;

  // Compatibility entry points; construction belongs to the asset, fitting stays here.
  var miningPlatformGeometry=/** @type {Required<import('./types').DriftworksNamespace>} */ (DW).miningRig.geometry;
  var miningPlatformLights=/** @type {Required<import('./types').DriftworksNamespace>} */ (DW).miningRig.lights;

  /** Translate the existing rounded 72 x 34 habitat silhouette into a drum. */
  /** @param {number} [segments] */
  function habitatMesh(segments) {
    var count = segments || 96;
    /** @type {number[]} */ var data = [];
    var capSteps=count/8, rings=/** @type {number[]} */ ([]);
    for(var cap=capSteps;cap>=0;cap--)rings.push(-31-5*Math.sin(cap*Math.PI/(2*capSteps)));
    for(var cap=0;cap<=capSteps;cap++)rings.push(31+5*Math.sin(cap*Math.PI/(2*capSteps)));
    /** @param {number} x */
    function radius(x) { return Math.abs(x) <= 31 ? 17 : 12 + Math.sqrt(Math.max(0, 25 - Math.pow(Math.abs(x) - 31, 2))); }
    /** @param {number} x @param {number} angle @param {number} [cap] */
    function vertex(x, angle, cap) {
      var r = radius(x), slope = Math.abs(x) <= 31 ? 0 : -(Math.abs(x) - 31) * Math.sign(x) / Math.sqrt(Math.max(.001, 25 - Math.pow(Math.abs(x) - 31, 2)));
      var length = Math.hypot(1, slope);
      data.push(x, r * Math.sin(angle), r * Math.cos(angle), cap || -slope / length, cap ? 0 : Math.sin(angle) / length, cap ? 0 : Math.cos(angle) / length);
    }
    for (var ring = 0; ring < rings.length - 1; ring++) for (var i = 0; i < count; i++) {
      var a = i * Math.PI * 2 / count, b = (i + 1) * Math.PI * 2 / count;
      vertex(rings[ring], a); vertex(rings[ring + 1], a); vertex(rings[ring + 1], b);
      vertex(rings[ring], a); vertex(rings[ring + 1], b); vertex(rings[ring], b);
    }
    [-1, 1].forEach(function (side) {
      for (var i = 0; i < count; i++) {
        data.push(side * 36, 0, 0, side, 0, 0);
        vertex(side * 36, i * Math.PI * 2 / count, side); vertex(side * 36, (i + 1) * Math.PI * 2 / count, side);
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

  /** Keep circular silhouette error below roughly half a screen pixel. */
  /** @param {number} radiusPixels */
  function habitatLod(radiusPixels) {
    return radiusPixels > 2000 ? 384 : radiusPixels > 500 ? 192 : 96;
  }

  /** Nearest two-sided ray/triangle hit, used only when choosing a study focus. */
  /** @param {V3} eye @param {V3} direction @param {ArrayLike<number>[]} meshes @returns {V3 | null} */
  function pickStudySurface(eye,direction,meshes) {
    var nearest=Infinity;
    meshes.forEach(function(mesh){
      for(var i=0;i<mesh.length;i+=18){
        var ax=mesh[i],ay=mesh[i+1],az=mesh[i+2];
        var ex=mesh[i+6]-ax,ey=mesh[i+7]-ay,ez=mesh[i+8]-az;
        var fx=mesh[i+12]-ax,fy=mesh[i+13]-ay,fz=mesh[i+14]-az;
        var px=direction[1]*fz-direction[2]*fy,py=direction[2]*fx-direction[0]*fz,pz=direction[0]*fy-direction[1]*fx;
        var det=ex*px+ey*py+ez*pz;if(Math.abs(det)<1e-9)continue;
        var tx=eye[0]-ax,ty=eye[1]-ay,tz=eye[2]-az;
        var u=(tx*px+ty*py+tz*pz)/det;if(u<0||u>1)continue;
        var qx=ty*ez-tz*ey,qy=tz*ex-tx*ez,qz=tx*ey-ty*ex;
        var v=(direction[0]*qx+direction[1]*qy+direction[2]*qz)/det;if(v<0||u+v>1)continue;
        var distance=(fx*qx+fy*qy+fz*qz)/det;if(distance>.001&&distance<nearest)nearest=distance;
      }
    });
    return nearest<Infinity?[eye[0]+direction[0]*nearest,eye[1]+direction[1]*nearest,eye[2]+direction[2]*nearest]:null;
  }

  /** World-space picking uses the same stride, scale, basis, axial spin and rotation as the vertex shader.
   * @param {V3} eye @param {V3} direction @param {import('./types').ViewerPickBatch[]} batches @returns {V3 | null} */
  function pickStudyBatches(eye,direction,batches) {
      /** @type {V3 | null} */ var nearest=null; var best=Infinity;
      batches.forEach(function(batch){
        var data=new Float32Array(batch.data.length/batch.stride*6),c=Math.cos(batch.rotation),s=Math.sin(batch.rotation),ac=Math.cos(batch.spin),as=Math.sin(batch.spin);
        for(var i=0,j=0;i<batch.data.length;i+=batch.stride,j+=6){
          var x=batch.data[i]*batch.scale[0],y=(ac*batch.data[i+1]+as*batch.data[i+2])*batch.scale[1],z=(-as*batch.data[i+1]+ac*batch.data[i+2])*batch.scale[2],b=batch.basis;
          var bx=b?b[0]*x+b[3]*y+b[6]*z:x,by=b?b[1]*x+b[4]*y+b[7]*z:y,bz=b?b[2]*x+b[5]*y+b[8]*z:z;
          data[j]=c*bx-s*by+batch.origin[0];data[j+1]=s*bx+c*by+batch.origin[1];data[j+2]=bz+batch.origin[2];
        }
        var hit=pickStudySurface(eye,direction,[data]);if(!hit)return;
        var distance=Math.hypot(hit[0]-eye[0],hit[1]-eye[1],hit[2]-eye[2]);if(distance<best){best=distance;nearest=hit;}
      });return nearest;
  }

  /** Static station hardware is batched by finish, with no per-detail draw calls. */
  /** @param {number} [detail] */
  function mothershipHardware(detail) {
    var refinement=detail || 1;
    /** @param {V3} v @returns {V3} */
    function normalize3(v){var length=Math.hypot(v[0],v[1],v[2])||1;return [v[0]/length,v[1]/length,v[2]/length];}
    /** @param {V3} a @param {V3} b @returns {V3} */
    function cross(a,b){return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];}
    /** @type {Record<string, number[]>} */ var groups = {};
    /** @param {string} material @param {V3} a @param {V3} b @param {number} radius @param {number} [sides] */
    function tube(material, a, b, radius, sides) {
      var count = Math.min(64,(sides || 8)*refinement), axis = normalize3([b[0]-a[0],b[1]-a[1],b[2]-a[2]]);
      var right = normalize3(cross(axis, Math.abs(axis[2]) < .9 ? [0,0,1] : [0,1,0])), up = cross(axis,right);
      var data = groups[material] || (groups[material] = []);
      /** @param {V3} center @param {number} angle @param {number} [cap] */
      function vertex(center, angle, cap) {
        var n = right.map(function(v,i){return v*Math.cos(angle)+up[i]*Math.sin(angle);});
        data.push(center[0]+n[0]*radius,center[1]+n[1]*radius,center[2]+n[2]*radius,
          cap ? axis[0]*cap : n[0],cap ? axis[1]*cap : n[1],cap ? axis[2]*cap : n[2]);
      }
      for(var i=0;i<count;i++) {
        var p=i*Math.PI*2/count,q=(i+1)*Math.PI*2/count;
        vertex(a,p);vertex(b,p);vertex(b,q);vertex(a,p);vertex(b,q);vertex(a,q);
        [a,b].forEach(function(center,j){var sign=j?1:-1;data.push(center[0],center[1],center[2],axis[0]*sign,axis[1]*sign,axis[2]*sign);vertex(center,p,sign);vertex(center,q,sign);});
      }
    }
    /** @param {string} material @param {V3} center @param {V3} size */
    function block(material,center,size) {
      var data=groups[material]||(groups[material]=[]), source=boxMesh();
      for(var i=0;i<source.length;i+=6)data.push(center[0]+source[i]*size[0],center[1]+source[i+1]*size[1],center[2]+source[i+2]*size[2],source[i+3],source[i+4],source[i+5]);
    }
    /** @param {string} material @param {number} x @param {number} radius @param {number} thickness */
    function ring(material,x,radius,thickness) {
      var data=groups[material]||(groups[material]=[]), count=96*refinement, sides=8+2*Math.log2(refinement);
      /** @param {number} along @param {number} around */
      function vertex(along,around){
        var nx=Math.sin(around), radial=Math.cos(around), ny=Math.sin(along)*radial,nz=Math.cos(along)*radial;
        data.push(x+thickness*nx,Math.sin(along)*(radius+thickness*radial),Math.cos(along)*(radius+thickness*radial),nx,ny,nz);
      }
      for(var i=0;i<count;i++)for(var j=0;j<sides;j++){
        var a=i*Math.PI*2/count,b=(i+1)*Math.PI*2/count,c=j*Math.PI*2/sides,d=(j+1)*Math.PI*2/sides;
        vertex(a,c);vertex(b,c);vertex(b,d);vertex(a,c);vertex(b,d);vertex(a,d);
      }
    }
    // Fixed bearing cages embrace the spinning shell; axial hubs remain stationary.
    [-38,38].forEach(function(x){
      ring('metal',x,18.3,.65);ring('dark',x,16.8,1.1);
      tube('metal',[x-2,0,0],[x+2,0,0],4,24);
      for(var i=0;i<8;i++){var a=i*Math.PI/4;tube('metal',[x,Math.sin(a)*4,Math.cos(a)*4],[x,Math.sin(a)*17,Math.cos(a)*17],.45);}
      tube('metal',[x,0,0],[x+(x<0?-6:6),0,0],2.6,24);
      ring('orange',x+(x<0?-2:2),4.2,.25);
    });
    // Coaxial fixed structure extends from the two habitat hubs.
    [-1,1].forEach(function(end){
      [-4,4].forEach(function(y){[-4,4].forEach(function(z){tube('metal',[end*42,y,z],[end*64,y,z],.4);});});
      for(var x=42;x<64;x+=5.5){
        [-4,4].forEach(function(z){tube('metal',[end*x,-4,z],[end*(x+5.5),4,z],.24);});
        [-4,4].forEach(function(y){tube('metal',[end*x,y,-4],[end*(x+5.5),y,4],.24);});
      }
      tube('shell',[end*44,0,0],[end*53,0,0],3.2,24);
      tube('dark',[end*48,0,0],[end*48.6,0,0],3.3,24);
      // Local tank cluster follows the same longitudinal axis.
      [-1,1].forEach(function(side){
        tube('tank',[end*54,side*6,0],[end*62,side*6,0],2,16);
        tube('orange',[end*54,side*6,0],[end*54.3,side*6,0],2.1,16);
        tube('metal',[end*54,side*4,-2],[end*62,side*6,-2],.2);
      });
    });
    // Aft thermal wings attach beyond the drum, keeping the habitat unobstructed.
    [-1,1].forEach(function(side){
      tube('metal',[51,side*4,0],[51,side*31,0],.45);
      for(var i=0;i<3;i++){
        var y=side*(12+i*8);
        block('thermal',[53,y,0],[9,3.5,.18]);
        [-9,0,9].forEach(function(d){block('metal',[53+d,y,.25],[.12,3.5,.12]);});
        for(var j=-8;j<=8;j+=2)block('dark',[53+j,y,.22],[.06,3.3,.04]);
        tube('metal',[43,side*4,0],[44,y,0],.18);
      }
      // Forward docking arms, service deck and a small collar.
      tube('metal',[-56,side*3,0],[-56,side*13,0],1,16);
      tube('dark',[-56,side*13,0],[-56,side*15,0],1.7,24);
      tube('orange',[-56,side*15,0],[-56,side*15.3,0],1.8,24);
      block('dark',[-56,side*9,-2],[4,3,.25]);
      tube('metal',[-60,side*6,-1],[-60,side*12,-1],.12);
      tube('metal',[-52,side*6,-1],[-52,side*12,-1],.12);
      block('light',[-54,side*15,0],[.2,.2,.2]);
    });
    // Utility shuttle at the forward collar; propulsion points aft along X.
    tube('shell',[-56,16.2,0],[-56,18.5,0],.55,12);
    block('dark',[-56,17.7,.55],[.4,.4,.1]);
    block('orange',[-56,18.5,0],[.6,.15,.6]);
    [-3,3].forEach(function(y){
      tube('tank',[63,y,0],[67,y,0],1.5,16);
      tube('dark',[67,y,0],[71,y,0],2,20);
      tube('metal',[70.5,y,0],[71,y,0],2.2,20);
    });
    tube('metal',[-64,0,0],[-71,0,4],.15);block('light',[-71,0,4],[.25,.25,.25]);
    // Drum ribs and access tracks rotate as a single batched mesh about its axis.
    [-30,-20,-10,0,10,20,30].forEach(function(x){ring('rotor',x,17.12,.16);});
    for(var i=0;i<12;i++){var a=i*Math.PI/6;tube('rotor',[-31,Math.sin(a)*17.14,Math.cos(a)*17.14],[31,Math.sin(a)*17.14,Math.cos(a)*17.14],.09,6);}
    return groups;
  }

  /** @param {HTMLElement} host @param {() => World} getWorld @param {(world: World) => void} setWorld @param {{study?: boolean, viewer?: boolean, zoomToTerrain?: boolean}} [options] */
  function create(host, getWorld, setWorld, options) {
    var study = !!(options && options.study);
    var viewerEnabled = study && !!(options && options.viewer);
    var terrainZoom = !options || options.zoomToTerrain !== false;
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
    toolbar.innerHTML = '<strong>3D RTS prototype</strong><span>Alt + drag: orbit · Middle / Space + drag: pan · Wheel: zoom</span><button type="button" data-rig-lights aria-pressed="true">Rig lights</button><button type="button" data-spotlight aria-pressed="false">Work light</button><button type="button" data-work-shadows aria-pressed="true">Shadows</button><button type="button" data-cut>Cutaway</button><button type="button" data-orbit aria-label="Orbit camera">Orbit ↻</button><button type="button" data-overview>Overview</button><button type="button" data-top>Top view</button><button type="button" data-under>Underside</button><a href="?renderer=2d">2D renderer</a>';
    host.appendChild(toolbar);
    /** @type {Orbit} */ var orbit = { yaw: 0, tilt: 0.48 };
    var studyHeight = 0;
    var diagnostics={mode:'normal',flat:false,scale:1,mothership:true,actors:true};
    var renderStats={drawCalls:0,triangles:0,shadowDrawCalls:0,shadowTriangles:0,lines:0,meshes:0,materials:0,width:0,height:0,pixelRatio:1,cpuMs:0};
    /** @type {Set<WebGLBuffer>} */ var frameMeshes=new Set();
    /** @type {Set<string>} */ var frameMaterials=new Set();
    var materialFinish=0;
    var identityBasis=new Float32Array([1,0,0,0,1,0,0,0,1]);
    var focus = false, space = false, stress = false, fps = 0;
    var rigLightsEnabled=true;
    /** @type {import('./types').RigLighting[]} */ var studyLightRigs=[];
    var spotlightEnabled = false, workShadowsEnabled = true, shadowPass = false;
    /** @type {Record<string,{visual:import('./types').AsteroidVisual,lamp:ReturnType<typeof surfaceSpotlight>}>} */
    var surfaceLamps = {};
    /** @type {{ start: Vec2, last: Vec2, mode: string } | null} */ var drag = null;
    /** @type {{ event: import('./types').CombatEvent, age: number }[]} */ var effects = [];
    /** @type {Record<string, { key: string, mesh: Mesh, texture: WebGLTexture, visual: import('./types').AsteroidVisual, values: ReturnType<typeof art.uniforms> }>} */ var rocks = {};
    /** @param {number} type @param {string} source */
    function shader(type, source) {
      var s = gl.createShader(type); if (!s) throw new Error('Shader allocation failed');
      gl.shaderSource(s, source); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'Shader compilation failed');
      return s;
    }
    var program = gl.createProgram(); if (!program) throw new Error('Program allocation failed');
    gl.attachShader(program, shader(gl.VERTEX_SHADER,
      'attribute vec3 aBakedDocking; varying vec3 vBakedDocking; attribute vec2 aUV; varying vec2 vUV; attribute vec3 aPosition,aNormal; uniform vec3 uOrigin,uScale,uTarget,uRight,uUp,uBack; uniform vec3 uSpotPosition,uSpotDirection,uSpotRight,uSpotUp; uniform vec2 uSpotPower,uSpotFrustum; uniform float uShadowPass; uniform vec4 uView; uniform float uRotation,uAxialSpin; uniform mat3 uModelBasis; varying vec3 vNormal,vLocal,vRelative; varying float vDepth; varying vec3 vEffect; void main(){vBakedDocking=aBakedDocking;vUV=aUV;vEffect=aNormal; float c=cos(uRotation),s=sin(uRotation); vec3 local=aPosition; float ac=cos(uAxialSpin),as=sin(uAxialSpin);local=vec3(local.x,ac*local.y+as*local.z,-as*local.y+ac*local.z);vec3 p=uModelBasis*(local*uScale); p=vec3(c*p.x-s*p.y,s*p.x+c*p.y,p.z)+uOrigin-uTarget; vRelative=p; vec3 n=aNormal/uScale; n=vec3(n.x,ac*n.y+as*n.z,-as*n.y+ac*n.z);n=uModelBasis*n;vNormal=normalize(vec3(c*n.x-s*n.y,s*n.x+c*n.y,n.z)); vLocal=local; float d=uView.x-dot(p,uBack); vDepth=d; float far=uView.x+30000.; if(uShadowPass>.5){vec3 beam=p-uSpotPosition;float z=dot(beam,uSpotDirection),near=uSpotPower.y*uSpotFrustum.y;gl_Position=vec4(dot(beam,uSpotRight)*uSpotFrustum.x,dot(beam,uSpotUp)*uSpotFrustum.x,((uSpotPower.y+near)*z-2.*uSpotPower.y*near)/(uSpotPower.y-near),z);return;}gl_Position=vec4(dot(p,uRight)*uView.y/uView.z,dot(p,uUp)*uView.y,((far+.1)/(far-.1))*d-2.*far*.1/(far-.1),d); }'));
    gl.attachShader(program, shader(gl.FRAGMENT_SHADER, art.shaderSource +
      '\nvarying vec3 vBakedDocking; uniform float uRigBakedEnabled; varying vec2 vUV; uniform sampler2D uShipTexture; uniform float uTextured,uPaintEnabled; uniform vec3 uPaint; varying vec3 vNormal,vLocal,vRelative; varying float vDepth; varying vec3 vEffect; uniform vec3 uSpotPosition,uSpotDirection,uSpotRight,uSpotUp; uniform float uShadowPass,uWorkShadowEnabled; uniform sampler2D uWorkShadow; uniform vec2 uSpotPower,uSpotFrustum; uniform vec3 uColor,uBack; uniform float uOpacity,uFlat,uRock,uRockDistance,uRotation,uCut,uCutHeight,uHabitat,uSpin,uHullFootprint,uHullDepth,uFinish,uCraftFill;\n'+
      'uniform float uEnvironmentEnabled;uniform vec3 uEnvironmentSH[9],uEnvironmentEye;uniform mat3 uEnvironmentBasis;uniform sampler2D uEnvironment;'+
      'vec3 skyDiffuse(vec3 n){n=normalize(uEnvironmentBasis*n);float x=n.x,y=n.y,z=n.z;vec3 c=uEnvironmentSH[0]*.282095+uEnvironmentSH[1]*(.488603*y)+uEnvironmentSH[2]*(.488603*z)+uEnvironmentSH[3]*(.488603*x)+uEnvironmentSH[4]*(1.092548*x*y)+uEnvironmentSH[5]*(1.092548*y*z)+uEnvironmentSH[6]*(.315392*(3.*z*z-1.))+uEnvironmentSH[7]*(1.092548*x*z)+uEnvironmentSH[8]*(.546274*(x*x-y*y));return pow(clamp(c+vec3(.18),vec3(.14),vec3(1.35)),vec3(1./2.2));}'+
      'vec3 skySpecular(vec3 n){vec3 incident=normalize(vRelative-uEnvironmentEye);vec3 ray=normalize(uEnvironmentBasis*reflect(incident,n));vec2 uv=vec2(atan(ray.y,ray.x)/6.28318530718+.5,acos(clamp(ray.z,-1.,1.))/3.14159265359);float metal=uFinish>.5&&uFinish<2.5?1.:0.;vec3 radiance=pow(texture2D(uEnvironment,uv,mix(5.,3.,metal)).rgb,vec3(2.2));float fresnel=pow(1.-max(0.,dot(n,-incident)),5.);return radiance*mix(.04,.18,metal)*(.4+.6*fresnel);}'+
      // Linear beam-depth, packed into RG for baseline WebGL without depth-texture extensions.
      (DW.miningLights?DW.miningLights.shaderSource:'vec3 rigIllumination(vec3 p,vec3 n){return vec3(0.);}')+
      'float workVisibility(vec3 p){if(uWorkShadowEnabled<.5)return 1.;vec3 beam=p-uSpotPosition;float z=dot(beam,uSpotDirection);if(z<=uSpotPower.y*uSpotFrustum.y||z>=uSpotPower.y)return 1.;vec2 uv=vec2(dot(beam,uSpotRight),dot(beam,uSpotUp))*uSpotFrustum.x/z*.5+.5;if(min(uv.x,uv.y)<.001||max(uv.x,uv.y)>.999)return 1.;float receiver=z/uSpotPower.y-.001;float visibility=0.;for(int y=0;y<2;y++)for(int x=0;x<2;x++){vec2 tap=(floor(uv*1024.)+vec2(float(x),float(y))+.5)/1024.;vec2 depthBytes=texture2D(uWorkShadow,tap).rg;visibility+=step(receiver,depthBytes.x+depthBytes.y/255.);}return visibility*.25;}\n'+
      ROCK_SURFACE_SHADER +
      // Filtered object-space height field: welds and fasteners resolve only nearby.
      'float shipLine(float d,float width,float fp){return (1.-smoothstep(width,width+fp,abs(d)))*(1.-smoothstep(width*2.,width*7.,fp));}'+
      'vec2 shipCell(vec2 p,vec2 period){return mod(p+period*.5,period)-period*.5;}'+
      'vec3 hullMasks(vec2 p,float fp){vec2 cell=shipCell(p,vec2(10.,8.9));float seam=min(abs(cell.x),abs(cell.y));float weld=shipLine(seam,.045,fp);float bead=.75+.25*cos(p.x*130.+p.y*130.);vec2 boltCell=shipCell(p,vec2(.65,.65));float boltDistance=min(length(vec2(abs(cell.x)-.22,boltCell.y)),length(vec2(boltCell.x,abs(cell.y)-.22)));float bolt=shipLine(boltDistance,.042,fp);float groove=shipLine(seam,.025,fp);return vec3(weld*bead,bolt,groove);}'+
      'float hullHeight(vec2 p,float fp){vec3 mask=hullMasks(p,fp);return .018*mask.x+.024*mask.y-.025*mask.z;}'+
      'vec3 hullSurface(vec2 p,vec3 normal,float theta,float fp){float e=max(.003,fp*.5);float h=hullHeight(p,fp);vec2 gradient=vec2(hullHeight(p+vec2(e,0.),fp)-h,hullHeight(p+vec2(0.,e),fp)-h)/e;vec3 axial=rotateNormal(vec3(1.,0.,0.)),tangent=rotateNormal(vec3(0.,cos(theta),-sin(theta)));return normalize(normal-axial*gradient.x-tangent*gradient.y);}'+
      // Functional masks use authored hub, tank, panel and truss coordinates.
      'vec4 hardwareMasks(vec3 p,float fp){float x=abs(p.x),r=length(p.yz),angle=atan(p.y,p.z);float bolt=0.,weld=0.,channel=0.,mark=0.;float close=1.-smoothstep(.08,.3,fp);'+
      'if(uFinish<2.5){float bearing=1.-smoothstep(.7,1.4,abs(x-38.));float tangential=abs(mod(angle*18.3+.48,.96)-.48);bolt=shipLine(length(vec2(r-18.3,tangential)),.065,fp)*bearing;float join=shipLine(mod(x-42.+2.75,5.5)-2.75,.065,fp)*step(41.,x)*step(x,64.);weld=join*(.7+.3*cos((p.y+p.z)*85.));channel=shipLine(mod(r+.09,.18)-.09,.015,fp)*bearing;mark=bearing*shipLine(mod(angle*18.3+2.,4.)-2.,.16,fp);}'+
      'else if(uFinish<4.5){float tank=uFinish>3.5?1.:0.;float localY=p.y-tank*sign(p.y)*6.;float circumference=atan(localY,p.z)*(tank>0.?2.:3.2);float joint=tank>0.?min(abs(x-54.),min(abs(x-58.),abs(x-62.))):min(abs(x-44.),abs(x-53.));weld=shipLine(joint-.18,.045,fp)*(.75+.25*cos(circumference*110.));bolt=shipLine(length(vec2(joint-.32,mod(circumference+.22,.44)-.22)),.04,fp);float panel=max(abs(x-48.5)-.8,abs(circumference-1.5)-.55);channel=shipLine(panel,.03,fp)*(1.-tank);mark=(1.-smoothstep(0.,fp,panel))*(1.-tank)*shipLine(mod(x+.08,.16)-.08,.03,fp)*step(1.35,circumference);}'+
      'else if(uFinish<5.5){float edge=min(abs(x-44.3),abs(x-61.7));float panelEdge=abs(mod(abs(p.y)-12.+4.,8.)-4.);bolt=shipLine(length(vec2(edge,abs(panelEdge-3.1))),.055,fp);channel=shipLine(mod(p.y+.15,.3)-.15,.018,fp);weld=shipLine(edge,.035,fp);}'+
      'else{mark=(.5+.5*cos((p.x+p.y+p.z)*12.))*close;}return vec4(bolt,weld,channel,mark); }'+
      // Feather orange paint; preserve texture variation while respecting target paint brightness.
      'void main(){if(uShadowPass>.5){if(uOpacity<.99)discard;if(uTextured>.5&&texture2D(uShipTexture,vUV).a<.5)discard;float depth=clamp(dot(vRelative-uSpotPosition,uSpotDirection)/uSpotPower.y,0.,.99999);vec2 depthBytes=fract(vec2(1.,255.)*depth);depthBytes.x-=depthBytes.y/255.;gl_FragColor=vec4(depthBytes,0.,1.);return;}if(uFinish>8.5){float r=length(vEffect.xy);float glow=exp(-r*r*3.5)*(1.-smoothstep(.65,1.,r));float core=exp(-r*r*30.);gl_FragColor=vec4(mix(uColor,vec3(1.,.95,.86),core*.85),glow*vEffect.z*.8);return;}if(uFlat>.5){gl_FragColor=vec4(uColor,uOpacity);return;}vec3 n=normalize(vNormal);vec3 light=normalize(uLight);vec3 col=uColor;if(uTextured>.5){vec4 tex=texture2D(uShipTexture,vUV);if(tex.a<.5)discard;vec3 rgb=tex.rgb;float hi=max(rgb.r,max(rgb.g,rgb.b));float lo=min(rgb.r,min(rgb.g,rgb.b));float chroma=hi-lo;float orange=(rgb.g-rgb.b)/max(.001,chroma);float mask=smoothstep(.12,.3,chroma/max(.001,hi))*smoothstep(.04,.16,orange)*(1.-smoothstep(.72,.95,orange))*step(rgb.g,rgb.r)*step(rgb.b,rgb.g)*uPaintEnabled;float paintValue=max(uPaint.r,max(uPaint.g,uPaint.b));vec3 paint=mix(vec3(lo*paintValue),uPaint*hi,chroma/max(.001,hi));col*=mix(rgb,paint,mask);}'+
      'if(uRock>.5){vec2 p=vLocal.xy;float q=length(p)/boundary(p);float footprint=max(.000000001,uPixelFootprint*vDepth);'+
      'float dome=.78*sqrt(max(0.,1.-q*q));float exterior=uCut<.5?1.:step(abs(abs(vLocal.z)-dome),.12);'+
      'vec3 sphere=normalize(vec3(vLocal.xy/boundary(p),vLocal.z/.78));vec3 bodyNormal=n;vec4 crater=globeCraters(vLocal);float occ=crater.w*exterior;'+
      'vec3 fineGradient=rockBump(vLocal,footprint);if(exterior>.5){vec3 bump=rotateNormal(fineGradient+crater.xyz);bump-=bodyNormal*dot(bump,bodyNormal);n=normalize(bodyNormal-bump);}'+
      'else{vec3 bump=rotateNormal(fineGradient);n=normalize(n-(bump-n*dot(bump,n))*.6);occ=clamp((uCutHeight-vLocal.z)*1.1,0.,.22);}'+
      'float ndl=max(0.,dot(n,light));float sunlight=exterior>.5?smoothstep(-.03,.10,dot(bodyNormal,light)):1.;float lit=pow(ndl,.82)*sunlight;'+
      'vec3 toLamp=uSpotPosition-vRelative;float lampDistance=max(.0001,length(toLamp));vec3 lampDirection=toLamp/lampDistance;float cone=smoothstep(.80,.94,dot(-lampDirection,uSpotDirection));float reach=lampDistance/max(.0001,uSpotPower.y);float fade=1.-smoothstep(.7,1.,reach);float localLight=uSpotPower.x*cone*fade*fade/(1.+16.*reach*reach)*max(0.,dot(n,lampDirection))*workVisibility(vRelative);'+
      'float ambient=.17*(1.-occ*.7);float brightness=ambient+lit*.98;'+
      'col=globeColor(sphere)*((uEnvironmentEnabled>.5?skyDiffuse(n)*(1.-occ*.7):vec3(brightness))+vec3(.88,.94,1.)*localLight*(1.-occ*.5)+rigIllumination(vRelative,n)*(1.-occ*.35));col+=vec3(1.,.94,.81)*pow(ndl,8.)*.035*sunlight*(1.-uEnvironmentEnabled);'+
      '}else if(uHabitat>.5){float fp=max(.00001,uHullFootprint*vDepth/(max(.01,uHullDepth)*max(.18,abs(dot(n,uBack)))));float angle=atan(vLocal.y,vLocal.z);vec2 p=vec2(vLocal.x,(angle-uSpin)*17.);float shell=1.-smoothstep(30.,35.5,abs(vLocal.x));vec3 masks=hullMasks(p,fp);n=mix(n,hullSurface(p,n,angle,fp),shell);float diffuse=max(0.,dot(n,light));'+
      'vec2 plate=floor((p+vec2(5.,4.45))/vec2(10.,8.9));float tone=hash31(vec3(plate,2.));vec3 base=vec3(.82,.79,.70)*(.94+.09*tone);float seam=min(abs(shipCell(p,vec2(10.,8.9)).x),abs(shipCell(p,vec2(10.,8.9)).y));float cavity=1.-smoothstep(.06,.06+fp,seam);base*=1.-cavity*.22;'+
      'float close=1.-smoothstep(.018,.08,fp);float grain=noise3(vec3(p*70.,4.));base*=1.+(grain-.5)*.055*close;float grime=noise3(vec3(p*.45,3.))*exp(-seam*7.);base*=1.-grime*.14;col=base*(uEnvironmentEnabled>.5?skyDiffuse(n):vec3(.26+diffuse*.88));'+
      'vec3 halfVector=normalize(light+uBack);col+=vec3(.91,.89,.80)*pow(max(0.,dot(n,halfVector)),18.+tone*15.)*.045*(1.-uEnvironmentEnabled);col=mix(col,vec3(.57,.59,.57)*(uEnvironmentEnabled>.5?skyDiffuse(n):vec3(.28+diffuse*.8)),masks.y*.8*shell);'+
      'vec2 hatch=shipCell(p+vec2(2.,1.),vec2(20.,17.8));vec2 edge=abs(hatch)-vec2(.8,.6);float hatchDistance=max(edge.x,edge.y);float hatchMask=(1.-smoothstep(0.,fp,hatchDistance))*(1.-smoothstep(.18,.5,fp))*shell;float hatchRim=shipLine(hatchDistance,.035,fp)*shell;col=mix(col,col*.78,hatchMask);col+=vec3(.12,.13,.12)*hatchRim;'+
      'col*=.7+.3*shell;'+
      '}else{if(uFinish>.5&&uFinish<6.5){float fp=max(.00001,uHullFootprint*vDepth/(max(.01,uHullDepth)*max(.18,abs(dot(n,uBack)))));float near=1.-smoothstep(.02,.1,fp);vec3 gradient=noiseGradient3(vLocal*42.).yzw;vec3 grain=rotateNormal(gradient);n=normalize(n-(grain-n*dot(grain,n))*.09*near);float rough=noise3(vLocal*12.);col*=1.+(rough-.5)*.07*near;vec4 detail=hardwareMasks(vLocal,fp);col*=1.-detail.z*.23;col=mix(col,vec3(.72,.74,.70),detail.x*.72);col=mix(col,col*.72+vec3(.055),detail.y*.6);col=mix(col,vec3(.16,.19,.19),detail.w*.65);n=normalize(n+rotateNormal(vec3(.06,-.04,.03))*detail.y);if(uFinish>2.5&&uFinish<4.5){float joint=abs(mod(abs(vLocal.x)-42.,5.5)-.12);float weld=shipLine(joint,.04,fp);col=mix(col,col*.7,weld*.5);}}float diffuse=max(0.,dot(n,light));col*=uEnvironmentEnabled>.5?skyDiffuse(n):vec3((uFinish>.5?.25+.92*diffuse:.61+.55*diffuse)+uCraftFill);if(uEnvironmentEnabled<.5&&uFinish>.5&&uFinish<2.5){vec3 halfVector=normalize(light+uBack);col+=vec3(.85,.90,1.)*pow(max(0.,dot(n,halfVector)),uFinish<1.5?36.:12.)*.28;}if(uFinish>6.5&&uFinish<7.5)col=uColor*.95;else col+=uColor*(rigIllumination(vRelative,n)+vBakedDocking*uRigBakedEnabled);}if(uEnvironmentEnabled>.5 && !(uFinish>6.5&&uFinish<7.5))col+=skySpecular(n);gl_FragColor=vec4(col,uOpacity);}'));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || 'Shader linking failed');
    gl.useProgram(program); gl.enable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
    var uv = gl.getAttribLocation(program,'aUV');
    var bakedAttribute=gl.getAttribLocation(program,'aBakedDocking');
    var pos = gl.getAttribLocation(program, 'aPosition'), normal = gl.getAttribLocation(program, 'aNormal');
    /** @type {Record<string, WebGLUniformLocation | null>} */ var uniforms = {};
    ['RigBaked','RigBakedEnabled','ModelBasis','RigProjected','RigCount','SpotFrustum', 'SpotRight', 'SpotUp', 'ShadowPass', 'WorkShadowEnabled', 'WorkShadow', 'SpotPosition', 'SpotDirection', 'SpotPower', 'Opacity', 'CraftFill', 'HullDepth', 'Flat', 'Finish', 'AxialSpin', 'Origin', 'Scale', 'Target', 'Right', 'Up', 'Back', 'View', 'Rotation', 'Color', 'Rock', 'RockDistance', 'Light', 'Bulk', 'FieldLow', 'FieldMed', 'Profile', 'Relief', 'FieldBlobs', 'BlobMaterial', 'CraterData', 'CraterTextureWidth', 'CraterCount', 'Heterogeneity', 'Seed', 'PixelFootprint', 'Cut', 'CutHeight', 'Habitat', 'Spin', 'HullFootprint'].forEach(function (name) { uniforms[name] = gl.getUniformLocation(program, 'u' + name); });
    ['RigPower','RigOrigin','RigX','RigY','RigZ'].forEach(function(name){uniforms[name]=gl.getUniformLocation(program,'u'+name+'[0]');});
    uniforms.Textured=gl.getUniformLocation(program,'uTextured');uniforms.ShipTexture=gl.getUniformLocation(program,'uShipTexture');
    uniforms.Paint=gl.getUniformLocation(program,'uPaint');uniforms.PaintEnabled=gl.getUniformLocation(program,'uPaintEnabled');
    gl.uniform1i(uniforms.ShipTexture,1);

    gl.uniform3fv(uniforms.Light, [-0.813733, -0.581238, 0.68]);
    uniforms.EnvironmentEnabled=gl.getUniformLocation(program,'uEnvironmentEnabled');
    uniforms.EnvironmentSH=gl.getUniformLocation(program,'uEnvironmentSH[0]');
    uniforms.EnvironmentBasis=gl.getUniformLocation(program,'uEnvironmentBasis');
    uniforms.EnvironmentEye=gl.getUniformLocation(program,'uEnvironmentEye');
    uniforms.Environment=gl.getUniformLocation(program,'uEnvironment');
    /** @type {import('./types').SkyEnvironmentLighting|null} */ var environment=null;
    /** @type {{right:V3,up:V3,back:V3}|null} */ var environmentPose=null;
    var environmentBasis=new Float32Array([1,0,0,0,1,0,0,0,1]);
    /** @type {WeakMap<HTMLImageElement,WebGLTexture>} */ var environmentTextures=new WeakMap();
    var blackEnvironment=gl.createTexture();
    gl.activeTexture(gl.TEXTURE3);gl.bindTexture(gl.TEXTURE_2D,blackEnvironment);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([0,0,0,255]));
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.activeTexture(gl.TEXTURE0);
    host.addEventListener('sky-environment',function(event){
      var data=/** @type {CustomEvent<{lighting:import('./types').SkyEnvironmentLighting|null,pose:{right:V3,up:V3,back:V3}}>} */ (event).detail;
      environment=data.lighting;environmentPose=data.pose;
    });
    /** @type {{texture:WebGLTexture,framebuffer:WebGLFramebuffer,depth:WebGLRenderbuffer}|null} */
    var workShadow = null;
    function allocateWorkShadow() {
      if (workShadow) return workShadow;
      var texture=gl.createTexture(), framebuffer=gl.createFramebuffer(), depth=gl.createRenderbuffer();
      if (!texture || !framebuffer || !depth) throw new Error('Work-light shadow allocation failed');
      gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,texture);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1024,1024,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,texture,0);
      gl.bindRenderbuffer(gl.RENDERBUFFER,depth);gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH_COMPONENT16,1024,1024);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,depth);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE) throw new Error('Work-light shadow framebuffer incomplete');
      gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.bindRenderbuffer(gl.RENDERBUFFER,null);gl.activeTexture(gl.TEXTURE0);
      workShadow={texture:texture,framebuffer:framebuffer,depth:depth};return workShadow;
    }
    /** @param {Asteroid} asteroid */
    function craterTexture(asteroid) {
      var texture = gl.createTexture(); if (!texture) throw new Error('Crater texture allocation failed');
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1440, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, impactBytes(asteroid));
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return texture;
    }
    /** @param {Float32Array} data @param {number} [stride] @returns {Mesh} */
    function upload(data,stride) {
      var buffer = gl.createBuffer(); if (!buffer) throw new Error('Mesh allocation failed');
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      return { buffer: buffer, data: viewerEnabled ? data : undefined, count: data.length / (stride||6),stride:stride||6 };
    }
    /** @param {Mesh} mesh @param {Float32Array|undefined} values */
    function uploadDocking(mesh,values){
      if(!values){mesh.bakedValues=undefined;return;}
      if(mesh.bakedValues===values)return;
      mesh.bakedValues=values;
      if(!mesh.bakedBuffer){var buffer=gl.createBuffer();if(!buffer)throw new Error('Baked lighting allocation failed');mesh.bakedBuffer=buffer;}
      gl.bindBuffer(gl.ARRAY_BUFFER,mesh.bakedBuffer);gl.bufferData(gl.ARRAY_BUFFER,values,gl.STATIC_DRAW);
    }
    /** @type {{vertices:Float32Array,color:V3,origin?:V3,rotation?:number}[]} */ var studyEffects=[];
    /** @type {Mesh[]} */ var studyEffectMeshes=[];
    /** @type {{vertices:Float32Array,bakedDocking?:Float32Array,rigLights?:import('./types').RigLighting[],color:V3,finish?:number,texture?:HTMLImageElement,stride?:number,paint?:V3,opacity?:number,origin?:V3,rotation?:number,staticGeometry?:boolean,basis?:Float32Array,scale?:number}[]} */ var studyActors=[];
    /** @type {Mesh[]} */ var studyActorMeshes=[];
    /** @type {Map<Float32Array,Mesh>} */ var staticActorMeshes=new Map();
    /** @type {WeakMap<HTMLImageElement,WebGLTexture>} */ var shipTextures=new WeakMap();
    /** @param {HTMLImageElement | undefined} image */
    function bindShipTexture(image){
      gl.uniform1f(uniforms.PaintEnabled,0);
      gl.uniform1f(uniforms.Textured,image?1:0);
      if(!image)return;
      var texture=shipTextures.get(image);
      if(!texture){
        texture=gl.createTexture();if(!texture)throw new Error('Ship texture allocation failed');
        gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,texture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,0);
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
        if((image.width & (image.width-1))===0 && (image.height & (image.height-1))===0){gl.generateMipmap(gl.TEXTURE_2D);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);}
        shipTextures.set(image,texture);
      }
      gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,texture);gl.activeTexture(gl.TEXTURE0);
    }
    var box = upload(boxMesh());
    /** @type {Record<string, Mesh>} */ var miningMeshes = {};
    var grid = upload(new Float32Array(600));
    var habitatLevels = [96,192,384].map(function(segments){return {segments:segments,mesh:upload(habitatMesh(segments))};});
    /** @type {Record<number, {mesh: Mesh, color: V3, rotor: boolean, finish: number}[]>} */
    var hardwareLevels = {};
    /** @type {Record<string, V3>} */
    var finishes = {metal:[.57,.61,.63],dark:[.12,.16,.18],shell:[.82,.79,.69],thermal:[.73,.77,.79],tank:[.65,.64,.56],orange:[.86,.36,.10],light:[.64,.93,.89],rotor:[.39,.43,.44]};
    /** @param {number} detail */
    function stationLevel(detail){
      if(!hardwareLevels[detail]){
        var hardware=mothershipHardware(detail);
        hardwareLevels[detail]=Object.keys(hardware).map(function(key){return {mesh:upload(new Float32Array(hardware[key])),color:finishes[key],rotor:key==='rotor',finish:key==='metal'||key==='rotor'?1:key==='dark'?2:key==='light'?7:key==='tank'?4:key==='thermal'?5:key==='orange'?6:3};});
      }
      return hardwareLevels[detail];
    }
    /** @param {number} finish */
    function setFinish(finish){materialFinish=finish;gl.uniform1f(uniforms.Finish,finish);}
    /** @param {Mesh} mesh @param {V3} origin @param {V3} scale @param {number} rotation @param {V3} color @param {boolean} [rock] @param {boolean} [lines] @param {Float32Array} [basis] */
    function draw(mesh, origin, scale, rotation, color, rock, lines, basis) {
      if (viewerEnabled && !shadowPass && !lines && mesh.data && mesh.data.length) pickBatches.push({data:mesh.data,stride:mesh.stride||6,origin:origin,scale:scale,rotation:rotation,basis:basis,spin:pickSpin});
      if (shadowPass && lines) return;
      gl.uniform1f(uniforms.RigBaked,mesh.bakedValues?1:0);
      gl.uniform1f(uniforms.RigBakedEnabled,rigLightsEnabled?1:0);
      if(mesh.bakedValues&&mesh.bakedBuffer){gl.bindBuffer(gl.ARRAY_BUFFER,mesh.bakedBuffer);gl.enableVertexAttribArray(bakedAttribute);gl.vertexAttribPointer(bakedAttribute,3,gl.FLOAT,false,12,0);}
      else{gl.disableVertexAttribArray(bakedAttribute);gl.vertexAttrib3f(bakedAttribute,0,0,0);}
      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.buffer);
      gl.enableVertexAttribArray(pos); gl.enableVertexAttribArray(normal);
      var stride=(mesh.stride||6)*4;
      if(stride===32){gl.enableVertexAttribArray(uv);gl.vertexAttribPointer(uv,2,gl.FLOAT,false,stride,24);}else{gl.disableVertexAttribArray(uv);gl.vertexAttrib2f(uv,0,0);}
      gl.vertexAttribPointer(pos,3,gl.FLOAT,false,stride,0);gl.vertexAttribPointer(normal,3,gl.FLOAT,false,stride,12);
      gl.uniformMatrix3fv(uniforms.ModelBasis,false,basis || identityBasis);
      gl.uniform3fv(uniforms.Origin, origin); gl.uniform3fv(uniforms.Scale, scale); gl.uniform3fv(uniforms.Color, color);
      gl.uniform1f(uniforms.Rotation, rotation); gl.uniform1f(uniforms.Rock, rock ? 1 : 0);
      gl.drawArrays(lines ? gl.LINES : gl.TRIANGLES, 0, mesh.count);
      renderStats.drawCalls++;if(lines)renderStats.lines+=mesh.count/2;else renderStats.triangles+=mesh.count/3;
      frameMeshes.add(mesh.buffer);frameMaterials.add(materialFinish+':'+!!rock+':'+color.join(','));
    }
    /** Existing layout in ship-local coordinates; only the habitat surface spins. */
    /** @param {number} x @param {number} y @param {number} scale @param {number} rotation @param {number} elapsed */
    function drawMothership(x, y, scale, rotation, elapsed) {
      if(study&&!diagnostics.mothership)return;
      if(study&&diagnostics.mode==='boxes'){draw(box,[x,y,0],[64*scale,18*scale,18*scale],rotation,[.49,.529,.565]);return;}
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
      gl.uniform1f(uniforms.HullFootprint, Math.max(.00001, projected.depth / v.distance / (scale * getWorld().camera.zoom)));
      gl.uniform1f(uniforms.HullDepth,projected.depth);
      var segments=habitatLod(17*scale*getWorld().camera.zoom*v.distance/Math.max(.01,projected.depth));
      var habitat=habitatLevels.filter(function(level){return level.segments===segments;})[0].mesh;
      gl.uniform1f(uniforms.Habitat, 1);
      part(habitat, [0, 0, 0], [1, 1, 1], [.49, .529, .565]);
      gl.uniform1f(uniforms.Habitat, 0);
      stationLevel(segments/96).forEach(function(item){
        pickSpin=item.rotor?phase:0;gl.uniform1f(uniforms.AxialSpin,pickSpin);
        setFinish(item.finish);
        part(item.mesh,[0,0,0],[1,1,1],item.color);
      });
      pickSpin=0;gl.uniform1f(uniforms.AxialSpin,0);
      setFinish(0);
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
      if(study && type==='mothership')return 1;
      var exponent = type === 'mothership' ? 0.95 : type === 'tug' || type === 'platform' || type === 'depot' ? 0.12 : 0.08;
      var z = Math.min(32, zoom); return Math.pow(Math.max(1, z), exponent) / z;
    }
    /** @type {import('./types').ViewerPickBatch[]} */ var pickBatches = [];
    var pickSpin = 0;
    /** @returns {import('./types').ViewerPose} */
    function viewerPose() {
      var w = getWorld(), v = view(w.camera, viewport(), orbit);
      return {eye:[w.camera.x+v.back[0]*v.distance,w.camera.y+v.back[1]*v.distance,(orbit.height||0)+v.back[2]*v.distance],right:[v.right[0],v.right[1],v.right[2]],up:[v.up[0],v.up[1],v.up[2]],back:[v.back[0],v.back[1],v.back[2]],distance:v.distance,focal:v.focal};
    }
    /** @param {import('./types').ViewerPose} pose */
    function flyViewer(pose) {
      orbit.surface={right:pose.right,up:pose.up,back:pose.back,distance:1,focal:pose.focal};
      studyHeight=pose.eye[2]-pose.back[2];orbit.height=studyHeight;
      var w=getWorld();setWorld(Object.assign({},w,{camera:{x:pose.eye[0]-pose.back[0],y:pose.eye[1]-pose.back[1],zoom:host.clientHeight*pose.focal/2}}));
    }
    /** @param {import('./types').ViewerPose} pose @param {V3} target */
    function orbitViewer(pose,target) {
      var back=/** @type {V3} */ (pose.eye.map(function(x,i){return x-target[i];})),distance=Math.max(.001,Math.hypot.apply(null,back));
      delete orbit.surface;studyHeight=target[2];orbit.height=target[2];orbit.yaw=Math.atan2(-back[0],back[1]);orbit.tilt=Math.acos(Math.max(-1,Math.min(1,back[2]/distance)));
      var w=getWorld();setWorld(Object.assign({},w,{camera:{x:target[0],y:target[1],zoom:host.clientHeight*pose.focal/(2*distance)}}));
    }
    var viewerControls = viewerEnabled && DW.modelViewer ? DW.modelViewer.create(host,{pose:viewerPose,fly:flyViewer,orbit:orbitViewer,pick:function(eye,direction){return pickStudyBatches(eye,direction,pickBatches);},worldUp:[0,0,1]}) : null;
    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    canvas.addEventListener('pointerdown', function (e) {
      if(orbit.surface)return;
      unlock(); focus = false; var p = pointer(e), w = getWorld();
      if (!study && e.button === 2 && !e.altKey) {
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
        var game = /** @type {{ issueVisualContextOrder: (world: World, target: Vec2, shipIds?: string[]) => World }} */ (DW.game);
        setWorld(game.issueVisualContextOrder(w, target, w.selectedShipIds)); if (DW.audio) DW.audio.playMove(); return;
      }
      drag = { start: p, last: p, mode: viewerControls ? viewerControls.gesture(e, space) : e.altKey || (study && e.button === 0 && !space) ? 'orbit' : e.button === 1 || space ? 'pan' : 'select' };
      canvas.setPointerCapture(e.pointerId); e.preventDefault();
    });
    canvas.addEventListener('pointermove', function (e) {
      if (!drag) return;
      var p = pointer(e), w = getWorld();
      if (viewerControls) drag.mode = viewerControls.gesture(e, space);
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
      if (viewerControls && e.buttons) { drag.mode = viewerControls.gesture(e, space); drag.last = pointer(e); return; }
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
      if(orbit.surface){e.preventDefault();return;}
      e.preventDefault(); focus = false; var w = getWorld(), p = pointer(e), vp = viewport();
      if(study && terrainZoom && e.deltaY<0 && w.asteroids[0]) {
        var hit=pickAsteroid(p,w.asteroids[0],w.camera,vp,orbit);
        if(hit){studyHeight=hit.position[2];orbit.height=studyHeight;w=Object.assign({},w,{camera:{x:hit.position[0],y:hit.position[1],zoom:w.camera.zoom}});}
      }
      var before = unproject(p, w.camera, vp, orbit, orbit.height);
      var camera = { x: w.camera.x, y: w.camera.y, zoom: Math.max(0.2, Math.min(study ? 512 : 128, w.camera.zoom * Math.exp(-Math.max(-300, Math.min(300, e.deltaY)) * 0.0015))) };
      var after = unproject(p, camera, vp, orbit, orbit.height);
      if (before && after) { camera.x += before.x - after.x; camera.y += before.y - after.y; }
      setWorld(Object.assign({}, w, { camera: camera }));
    }, { passive: false });
    window.addEventListener('keydown', function (e) {
      if(orbit.surface)return;
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
    var rigLightButton=toolbar.querySelector('[data-rig-lights]');
    if(rigLightButton)rigLightButton.addEventListener('click',function(){rigLightsEnabled=!rigLightsEnabled;if(rigLightButton)rigLightButton.setAttribute('aria-pressed',String(rigLightsEnabled));});
    var spotlightButton = toolbar.querySelector('[data-spotlight]');
    if (spotlightButton) spotlightButton.addEventListener('click', function () {
      spotlightEnabled = !spotlightEnabled;
      if (spotlightButton) spotlightButton.setAttribute('aria-pressed', String(spotlightEnabled));
    });
    var workShadowButton=toolbar.querySelector('[data-work-shadows]');
    if(workShadowButton)workShadowButton.addEventListener('click',function(){workShadowsEnabled=!workShadowsEnabled;if(workShadowButton)workShadowButton.setAttribute('aria-pressed',String(workShadowsEnabled));});
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
      if(study&&diagnostics.mode!=='normal')return;
      orbit.height = study ? studyHeight : inspectionHeight(w) * (orbit.tilt > Math.PI / 2 ? -1 : 1);
      Object.keys(rocks).forEach(function (id) {
        if (!w.asteroids.some(function (a) { return a.id === id; })) {
          gl.deleteBuffer(rocks[id].mesh.buffer); gl.deleteTexture(rocks[id].texture);
          contactTerrain.delete(id); delete surfaceLamps[id]; delete rocks[id]; delete geology[id]; delete shells[id]; delete impacts[id];
        }
      });
      w.asteroids.forEach(function (a) {
        var key = a.radius + ':' + JSON.stringify(a.excavation || null);
        if (!rocks[a.id] || rocks[a.id].key !== key || rocks[a.id].visual !== visualFor(a)) {
          if (rocks[a.id]) { gl.deleteBuffer(rocks[a.id].mesh.buffer); gl.deleteTexture(rocks[a.id].texture); }
          var visual = visualFor(a);
          rocks[a.id] = { key: key, mesh: upload(contactMesh(a).data), texture: craterTexture(a), visual: visual, values: art.uniforms(visual) };
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
      var started=performance.now(), shadowCalls=0, shadowTriangles=0;
      if(spotlightEnabled && workShadowsEnabled && w.asteroids.length && diagnostics.mode==='normal'){
        allocateWorkShadow();shadowPass=true;
        try {renderFrame(w,alpha,0,0);shadowCalls=renderStats.drawCalls;shadowTriangles=renderStats.triangles;}
        finally {shadowPass=false;gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.enable(gl.DITHER);}
      }
      renderFrame(w,alpha,dt,wallDt);
      renderStats.shadowDrawCalls=shadowCalls;renderStats.shadowTriangles=shadowTriangles;
      renderStats.drawCalls+=shadowCalls;renderStats.triangles+=shadowTriangles;renderStats.cpuMs=performance.now()-started;
    }
    /** @param {World} w @param {number} alpha @param {number} dt @param {number} wallDt */
    function renderFrame(w, alpha, dt, wallDt) {
      if(study && !shadowPass)pickBatches=[];
      var renderStart=performance.now();renderStats.drawCalls=0;renderStats.triangles=0;renderStats.lines=0;frameMeshes.clear();frameMaterials.clear();
      var vp = viewport(); if (vp.width < 1 || vp.height < 1) return;
      var dpr = Math.min(2, window.devicePixelRatio || 1)*(study?diagnostics.scale:1);
      var width = Math.round(vp.width * dpr), height = Math.round(vp.height * dpr);
      if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; overlay.width = width; overlay.height = height; }
      gl.bindFramebuffer(gl.FRAMEBUFFER,shadowPass && workShadow ? workShadow.framebuffer : null);
      gl.viewport(0,0,shadowPass?1024:width,shadowPass?1024:height);
      gl.disable(gl.BLEND);gl.depthMask(true);if(shadowPass)gl.disable(gl.DITHER);
      gl.clearColor(shadowPass?1:0,shadowPass?1:0,shadowPass?1:0,shadowPass?1:0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      renderStats.width=width;renderStats.height=height;renderStats.pixelRatio=dpr;
      if(study&&diagnostics.mode==='empty'){hud.clearRect(0,0,overlay.width,overlay.height);renderStats.meshes=0;renderStats.materials=0;renderStats.cpuMs=performance.now()-renderStart;return;}
      gl.useProgram(program);gl.uniform1f(uniforms.Opacity,1);gl.uniform1f(uniforms.Flat,study&&diagnostics.flat?1:0);var v = view(w.camera, vp, orbit);
      gl.uniform3fv(uniforms.Target, [w.camera.x, w.camera.y, orbit.height || 0]); gl.uniform3fv(uniforms.Right, v.right);
      gl.uniform3fv(uniforms.Up, v.up); gl.uniform3fv(uniforms.Back, v.back);
      gl.uniform4fv(uniforms.View, [v.distance, v.focal, vp.width / vp.height, 0]);
      gl.uniform1f(uniforms.EnvironmentEnabled,environment?1:0);
      gl.uniform1i(uniforms.Environment,3);gl.activeTexture(gl.TEXTURE3);
      if(environment){
        var environmentTexture=environmentTextures.get(environment.image);
        if(!environmentTexture){
          var allocated=gl.createTexture();if(!allocated)throw new Error('Sky environment allocation failed');
          environmentTexture=allocated;environmentTextures.set(environment.image,allocated);
          gl.bindTexture(gl.TEXTURE_2D,allocated);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,environment.image);
          gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.generateMipmap(gl.TEXTURE_2D);
        }
        gl.bindTexture(gl.TEXTURE_2D,environmentTexture);
        gl.uniform3fv(uniforms.EnvironmentSH,new Float32Array(environment.sh.flat()));
        if(environmentPose){for(var column=0;column<3;column++)for(var row=0;row<3;row++)environmentBasis[column*3+row]=environmentPose.right[row]*v.right[column]+environmentPose.up[row]*v.up[column]+environmentPose.back[row]*v.back[column];}
        gl.uniformMatrix3fv(uniforms.EnvironmentBasis,false,environmentBasis);
        gl.uniform3fv(uniforms.EnvironmentEye,v.back.map(function(value){return value*v.distance;}));
      }else gl.bindTexture(gl.TEXTURE_2D,blackEnvironment);
      gl.activeTexture(gl.TEXTURE0);
      gl.uniform1f(uniforms.ShadowPass,shadowPass?1:0);
      gl.uniform1f(uniforms.WorkShadowEnabled,!shadowPass && spotlightEnabled && workShadowsEnabled && workShadow?1:0);
      gl.uniform1i(uniforms.WorkShadow,2);gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D,!shadowPass && workShadow?workShadow.texture:null);gl.activeTexture(gl.TEXTURE0);
      /** @type {import('./types').RigLighting[]} */ var lightRigs=[];
      if(rigLightsEnabled && DW.miningLights){
        lightRigs=study?DW.miningLights.placedLights(studyActors):[];
        if(study&&!lightRigs.length)lightRigs=studyLightRigs.slice();
        // All fixtures stay visible; bound dynamic illumination to the nearest two rigs.
        lightRigs.sort(function(a,b){return Math.hypot(a.origin[0]-w.camera.x,a.origin[1]-w.camera.y,a.origin[2]-(orbit.height||0))-Math.hypot(b.origin[0]-w.camera.x,b.origin[1]-w.camera.y,b.origin[2]-(orbit.height||0));});lightRigs=lightRigs.slice(0,2);
        if(!study)w.platforms.forEach(function(p){
          if(lightRigs.length>=2 || (p.state!=='deployed' && p.state!=='setting-up' && p.state!=='packing-up'))return;
          var a=w.asteroids.find(function(a){return a.id===p.asteroidId;});if(!a)return;
          var surface=platformSurface(p,a);if(surface && surface.fit.valid && DW.miningLights)lightRigs.push(DW.miningLights.rig(platformSurfacePose(surface,p,a),surface.scale));
        });
      }
      var lampUniforms=DW.miningLights?DW.miningLights.uniforms(lightRigs,[w.camera.x,w.camera.y,orbit.height || 0],0,1):null;
      gl.uniform1f(uniforms.RigProjected,0);gl.uniform1f(uniforms.RigCount,lightRigs.length);
      if(lampUniforms){gl.uniform1fv(uniforms.RigPower,lampUniforms.uRigPower);gl.uniform4fv(uniforms.RigOrigin,lampUniforms.uRigOrigin);gl.uniform3fv(uniforms.RigX,lampUniforms.uRigX);gl.uniform3fv(uniforms.RigY,lampUniforms.uRigY);gl.uniform3fv(uniforms.RigZ,lampUniforms.uRigZ);}
      var owner=w.asteroids[0];
      if(spotlightEnabled && owner){
        var visual=visualFor(owner), cachedLamp=surfaceLamps[owner.id];
        if(!cachedLamp || cachedLamp.visual!==visual)cachedLamp=surfaceLamps[owner.id]={visual:visual,lamp:surfaceSpotlight(owner)};
        var lamp=cachedLamp.lamp, lampFrame=workLightFrame(owner,lamp,w.camera,orbit.height||0);
        gl.uniform3fv(uniforms.SpotPosition,lampFrame.position);gl.uniform3fv(uniforms.SpotDirection,lampFrame.direction);
        gl.uniform3fv(uniforms.SpotRight,lampFrame.right);gl.uniform3fv(uniforms.SpotUp,lampFrame.up);
        gl.uniform2f(uniforms.SpotFrustum,lampFrame.focal,lampFrame.near/lamp.range);
        gl.uniform2f(uniforms.SpotPower,2,lamp.range);
      }else gl.uniform2f(uniforms.SpotPower,0,1);
      w.asteroids.forEach(function (a) {
        if(study&&diagnostics.mode==='boxes'){draw(box,[a.position.x,a.position.y,0],[a.radius,a.radius,a.radius*.78],a.rotation,[.45,.43,.4]);return;}
        var rock = rocks[a.id]; if (!rock) return;
        var values = rock.values;
        ['Bulk', 'FieldLow', 'FieldMed', 'Profile', 'Relief', 'FieldBlobs'].forEach(function (name) {
          var value = /** @type {Record<string, Float32Array | number>} */ (values)['u' + name];
          if (value instanceof Float32Array) gl.uniform4fv(uniforms[name], value);
        });
        gl.uniform1fv(uniforms.BlobMaterial, values.uBlobMaterial);
        gl.uniform1f(uniforms.CraterCount, impactsFor(a).length); gl.uniform1f(uniforms.CraterTextureWidth, 1440);
        gl.uniform1f(uniforms.Heterogeneity, values.uHeterogeneity); gl.uniform1f(uniforms.Seed, values.uSeed);
        var center = project([a.position.x, a.position.y, 0], w.camera, vp, orbit);
        gl.uniform1f(uniforms.RockDistance, center.depth);
        gl.uniform1f(uniforms.PixelFootprint, Math.max(0.000001, 2 / (vp.height*v.focal*a.radius*dpr)));
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
      if (!study) {
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
      draw(grid, [0, 0, 0], [1, 1, 1], 0, [0.035, 0.055, 0.065], false, true);
      }
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
        if (p.state !== 'deployed' && p.state !== 'setting-up' && p.state !== 'packing-up') return;
        var a = w.asteroids.find(function (a) { return a.id === p.asteroidId; });
        var z = platformHeight(p, a);
        var scale = semanticScale('platform', w.camera.zoom);
        var surface=a?platformSurface(p,a,true):null;
        var fitted=surface && surface.fit.valid && DW.miningTerrain?surface:null;
        var deployment = p.state === 'deployed' ? 1 : p.state === 'setting-up'
          ? 1-(p.setupRemainingSeconds || 0)/(DW.logistics ? DW.logistics.setupSeconds : 1)
          : (p.packRemainingSeconds || 0)/(DW.logistics ? DW.logistics.packSeconds : 1);
        var working = p.state === 'deployed' && w.miningMission === 'active' && !!a && a.ore > 0 &&
          (!w.staffingEnabled || (p.workerIds || []).length >= 5);
        var landing = p.state === 'setting-up' && p.landingElapsedSeconds !== undefined && DW.miningLanding ? DW.miningLanding.sample(p.landingElapsedSeconds) : null;
        if(landing){deployment=landing.deployment;z+=landing.altitude/(DW.sim ? DW.sim.METERS_PER_UNIT : 10000/600);}
        var rampOpen=landing?landing.ramps:p.state==='deployed'?1:p.state==='packing-up'?deployment:0;
        var geometry=fitted?platformSurfaceGeometry(fitted,deployment,rampOpen):miningPlatformGeometry(deployment,w.elapsedSeconds,working,rampOpen);
        var fittedPose=fitted && a?platformSurfacePose(fitted,p,a):null;
        var landingHeading=landing?landing.headingOffset-((a?a.rotation:0)-(p.landingReleaseRotation || 0))*(1-landing.match):0;
        var angle=landingHeading+p.siteAngle+(a?a.rotation:0), c=Math.cos(angle), s=Math.sin(angle);
        // Match the local surface slope while preserving the simulation anchor.
        var e=.15, n=/** @type {V3} */ ([0,0,1]);
        if(a && !(a.excavation && a.excavation.level>0)) {
          /** @param {number} dx @param {number} dy */
          var sample=function(dx,dy){return platformHeight(Object.assign({},p,{position:{x:p.position.x+dx,y:p.position.y+dy}}),a);};
          n=[-(sample(e,0)-sample(-e,0))/(2*e),-(sample(0,e)-sample(0,-e))/(2*e),1];
          var magnitude=Math.hypot.apply(null,n);n=/** @type {V3} */ (n.map(function(v){return v/magnitude;}));
        }
        var tangent=/** @type {V3} */ ([c,s,-(n[0]*c+n[1]*s)/n[2]]);
        var magnitude=Math.hypot.apply(null,tangent);tangent=/** @type {V3} */ (tangent.map(function(v){return v/magnitude;}));
        var across=/** @type {V3} */ ([n[1]*tangent[2]-n[2]*tangent[1],n[2]*tangent[0]-n[0]*tangent[2],n[0]*tangent[1]-n[1]*tangent[0]]);
        var colors=/** @type {Record<string,V3>} */ ({ochre:[.83,.64,.29],steel:[.46,.53,.52],dark:[.10,.15,.17],light:[.89,.79,.49],lamp:[1,.94,.78],marker:[.35,.95,.85]});
        var visualBatches=DW.miningLights?DW.miningLights.visual(geometry):null;
        Object.keys(geometry).forEach(function(material,index){
          /** @type {number[]|Float32Array} */ var data=geometry[material];
          var baked=visualBatches?visualBatches[index].bakedDocking:undefined;
          if(fittedPose && DW.miningTerrain){
            data=DW.miningTerrain.transform({vertices:new Float32Array(data)},fittedPose).vertices;
          }else for(var i=0;i<data.length;i+=6)for(var offset=0;offset<=3;offset+=3){
            var lx=data[i+offset],ly=data[i+offset+1],lz=data[i+offset+2];
            for(var k=0;k<3;k++)data[i+offset+k]=tangent[k]*lx+across[k]*ly+n[k]*lz;
          }
          var mesh=miningMeshes[material] || (miningMeshes[material]=upload(new Float32Array(0)));
          gl.bindBuffer(gl.ARRAY_BUFFER,mesh.buffer);var meshData=new Float32Array(data);gl.bufferData(gl.ARRAY_BUFFER,meshData,gl.DYNAMIC_DRAW);if(viewerEnabled)mesh.data=meshData;mesh.count=data.length/6;
          uploadDocking(mesh,baked);
          setFinish(material==='lamp'||material==='marker'?(rigLightsEnabled?7:8):8);
          draw(mesh,fittedPose?[0,0,0]:[p.position.x,p.position.y,z],fittedPose?[1,1,1]:[scale,scale,scale],0,colors[material]);
        });
        setFinish(0);
        if(!shadowPass && fitted && fittedPose && w.camera.zoom*fitted.scale*32<8){
          var marker=project(/** @type {V3} */ (fittedPose.world([0,0,8])),w.camera,vp,orbit);
          hud.fillStyle='#d4a34a';hud.fillRect(marker.x-2,marker.y-2,4,4);
        }
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
      if (!shadowPass) effects.forEach(function (fx) {
        fx.age += dt;
        if (fx.event.kind === 'weapon-fired' && fx.event.source) line([fx.event.source.x, fx.event.source.y, 0], [fx.event.position.x, fx.event.position.y, 0], 'rgba(255,160,100,' + Math.max(0, 1 - fx.age / 0.2) + ')');
      });
      effects = effects.filter(function (fx) { return fx.age < 0.5; });
      if (drag && drag.mode === 'select') { hud.strokeStyle = '#b4e8ef'; hud.strokeRect(drag.start.x, drag.start.y, drag.last.x - drag.start.x, drag.last.y - drag.start.y); }
      if(study && diagnostics.actors && studyActors.length){
        gl.uniform1f(uniforms.CraftFill,.18);
        setFinish(0);gl.uniform1f(uniforms.Habitat,0);pickSpin=0;gl.uniform1f(uniforms.AxialSpin,0);
        studyActors.forEach(function(batch,index){
          if(!batch.vertices.length)return;
          if(batch.staticGeometry&&!shadowPass&&!viewerEnabled&&!studyBatchVisible(batch,[w.camera.x,w.camera.y,orbit.height||0],v,vp.width/vp.height))return;
          var stride=batch.stride || (batch.texture?8:6);
          /** @type {Mesh | undefined} */ var mesh;
          if(batch.staticGeometry){
            mesh=staticActorMeshes.get(batch.vertices);
            if(!mesh){mesh=upload(batch.vertices,stride);staticActorMeshes.set(batch.vertices,mesh);}
          }else{
            if(!studyActorMeshes[index])studyActorMeshes[index]=upload(new Float32Array(0));
            mesh=studyActorMeshes[index];
            gl.bindBuffer(gl.ARRAY_BUFFER,mesh.buffer);gl.bufferData(gl.ARRAY_BUFFER,batch.vertices,gl.DYNAMIC_DRAW);if(viewerEnabled)mesh.data=batch.vertices;
            mesh.stride=stride;mesh.count=batch.vertices.length/stride;
          }
          uploadDocking(mesh,batch.bakedDocking);
          bindShipTexture(batch.texture);
          if(batch.paint){gl.uniform3fv(uniforms.Paint,batch.paint);gl.uniform1f(uniforms.PaintEnabled,1);}
          var translucent=batch.opacity!==undefined&&batch.opacity<1;
          gl.uniform1f(uniforms.Opacity,batch.opacity===undefined?1:batch.opacity);
          if(translucent){gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);}
          setFinish(batch.finish===7&&!rigLightsEnabled?8:batch.finish || 0);
          var actorScale=batch.scale===undefined?1:batch.scale;
          draw(mesh,batch.origin || [0,0,0],[actorScale,actorScale,actorScale],batch.rotation || 0,batch.color,false,false,batch.basis);
          if(translucent){gl.depthMask(true);gl.disable(gl.BLEND);}
        });
      }
      gl.uniform1f(uniforms.Opacity,1);
      bindShipTexture(undefined);
      gl.uniform1f(uniforms.CraftFill,0);
      if(shadowPass)return;
      if(study && studyEffects.length){
        gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE);gl.depthMask(false);
        setFinish(9);gl.uniform1f(uniforms.Habitat,0);pickSpin=0;gl.uniform1f(uniforms.AxialSpin,0);
        studyEffects.forEach(function(batch,index){
          if(!batch.vertices.length)return;
          if(!studyEffectMeshes[index])studyEffectMeshes[index]=upload(new Float32Array(0));
          var mesh=studyEffectMeshes[index];gl.bindBuffer(gl.ARRAY_BUFFER,mesh.buffer);gl.bufferData(gl.ARRAY_BUFFER,batch.vertices,gl.DYNAMIC_DRAW);mesh.count=batch.vertices.length/6;
          draw(mesh,[0,0,0],[1,1,1],0,batch.color);
        });
        gl.depthMask(true);gl.disable(gl.BLEND);setFinish(0);
      }
      renderStats.meshes=frameMeshes.size;renderStats.materials=frameMaterials.size;renderStats.cpuMs=performance.now()-renderStart;
      if (wallDt > 0) fps = fps * 0.9 + Math.min(240, 1 / wallDt) * 0.1;
      if (DW.audio) DW.audio.setEngineThrust(Math.min(1, Math.max.apply(null, w.ships.map(function (s) { return s.disabled || s.docked ? 0 : Math.hypot(s.velocity.x - s.previousVelocity.x, s.velocity.y - s.previousVelocity.y) / Math.max(1, s.acceleration / 30); }))));
    }
    return {
      /** @param {{eye: V3, right: V3, up: V3, back: V3} | null} pose */
      setSurfaceCamera: function(pose) {
        if(!study)return;
        if(viewerControls)viewerControls.reset();
        if(!pose){delete orbit.surface;studyHeight=0;orbit.height=0;return;}
        orbit.surface={right:pose.right,up:pose.up,back:pose.back,distance:1,focal:FOCAL};
        studyHeight=pose.eye[2]-pose.back[2];orbit.height=studyHeight;
        var w=getWorld();setWorld(Object.assign({},w,{camera:{x:pose.eye[0]-pose.back[0],y:pose.eye[1]-pose.back[1],zoom:w.camera.zoom}}));
      },
      getOrbit: function () { return { yaw: orbit.yaw, tilt: orbit.tilt, height: studyHeight }; },
      /** @param {{yaw: number, tilt: number, height?: number}} value */
      setOrbit: function (value) { if(viewerControls && (viewerControls.isFlying() || viewerControls.isPicking())){var savedCamera=getWorld().camera;viewerControls.reset();var resetWorld=getWorld();setWorld(Object.assign({},resetWorld,{camera:savedCamera}));} if(study && value.height!==undefined)studyHeight=value.height;else if(study && getWorld().camera.zoom<1)studyHeight=0; orbit.yaw = value.yaw; orbit.tilt = Math.max(.06, Math.min(Math.PI - .06, value.tilt)); },
      /** @param {{vertices:Float32Array,color:V3}[]} batches */
      setStudyEffects: function(batches){if(study)studyEffects=batches.slice();},
      /** @param {{vertices:Float32Array,bakedDocking?:Float32Array,rigLights?:import('./types').RigLighting[],color:V3,finish?:number,texture?:HTMLImageElement,stride?:number,paint?:V3}[]} batches */
      /** @param {import('./types').RigLighting[]} rigs */
      setStudyLightRigs:function(rigs){studyLightRigs=rigs.slice(0,2);},
      /** @param {boolean} enabled */
      setRigLightsEnabled:function(enabled){rigLightsEnabled=enabled;if(rigLightButton)rigLightButton.setAttribute('aria-pressed',String(enabled));},
      setStudyActors: /** @param {typeof studyActors} batches */ function(batches){
        if(!study)return;
        studyActors=batches.slice();
        var retained=new Set(batches.filter(function(b){return b.staticGeometry;}).map(function(b){return b.vertices;}));
        staticActorMeshes.forEach(function(mesh,data){if(!retained.has(data)){gl.deleteBuffer(mesh.buffer);if(mesh.bakedBuffer)gl.deleteBuffer(mesh.bakedBuffer);staticActorMeshes.delete(data);}});
      },
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
      /** @param {{mode:string,flat:boolean,scale:number,mothership:boolean,actors:boolean}} value */
      setStudyDiagnostics: function(value){if(study)diagnostics={mode:value.mode==='empty'||value.mode==='boxes'?value.mode:'normal',flat:!!value.flat,scale:Math.max(.25,Math.min(1,value.scale)),mothership:!!value.mothership,actors:!!value.actors};},
      getRenderStats: function(){return Object.assign({},renderStats);},
      getStats: function () {
        var w = getWorld(); return { fps: Math.round(fps), stressEnabled: stress,
          entityCount: w.ships.length + w.asteroids.length + w.platforms.length + w.wrecks.length + w.combat.drones.length + (stress ? 1000 : 0),
          contacts: w.combat.drones.length ? w.combat.drones.length + ' active' : w.combat.director.state === 'warning' ? 'inbound ' + Math.ceil(w.combat.director.timer) + 's' : 'quiet' };
      }
    };
  }
  DW.scene3d = { rockSurfaceShader: function(){if(!DW.asteroidArt)throw new Error('Missing asteroid artwork');return DW.asteroidArt.shaderSource+ROCK_SURFACE_SHADER;}, create: create, project: project, unproject: unproject, view: view,
    miningPlatformGeometry: miningPlatformGeometry,
    /** @param {number} deployment @param {number} panelOpen @param {string} interiorCut @param {{knee:number[],tip:number[],normal:number[]}[]} poses @param {number[]} [rampLimits] */
    /** @param {number} panelOpen */
    miningPlatformRampGeometry:function(panelOpen){return /** @type {Required<import('./types').DriftworksNamespace>} */ (DW).miningRig.ramps(panelOpen);},
    miningPlatformLights:miningPlatformLights,
    platformSurface:platformSurface,platformSurfacePose:platformSurfacePose,platformSurfaceGeometry:platformSurfaceGeometry,
    miningPlatformContactGeometry: function(deployment,panelOpen,interiorCut,poses,rampLimits){return miningPlatformGeometry(deployment,0,false,panelOpen,interiorCut,false,false,poses,rampLimits);},
    miningPlatformInfillGeometry: function(){return /** @type {Required<import('./types').DriftworksNamespace>} */ (DW).miningRig.infill();},
    /** @param {number} deployment */ miningPlatformLegGeometry: function(deployment){return /** @type {Required<import('./types').DriftworksNamespace>} */ (DW).miningRig.legs(deployment);}, rockField: rockField, asteroidMesh: asteroidMesh, pickAsteroid: pickAsteroid, platformHeight: platformHeight, inspectionHeight: inspectionHeight,
    workLightFrame: workLightFrame, surfaceSpotlight: surfaceSpotlight, surfaceFrame: surfaceFrame, setStudyParameters: setStudyParameters, impactsFor: impactsFor, craterDistance: craterDistance, impactBytes: impactBytes, globeRelief: globeRelief, visualFor: visualFor, surfaceHeight: surfaceHeight, mothershipHardware: mothershipHardware, pickStudySurface: pickStudySurface, pickStudyBatches:pickStudyBatches, studyBatchVisible:studyBatchVisible, habitatLod: habitatLod, habitatMesh: habitatMesh, roundedHullMesh: roundedHullMesh };
})(window);
