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
  /** @typedef {{ buffer: import('./three-types').Geometry, count: number, data?: Float32Array, stride?: number,  bakedValues?:Float32Array }} Mesh */
  /** @type {import('./types').DriftworksNamespace} */
  var DW = global.Driftworks;
  var sim = /** @type {import('./types').SimApi} */ (DW.sim);
  var terrain = DW.asteroidTerrain;
  if (!terrain) throw new Error('CPU asteroid terrain module did not load.');
  // Compatibility aliases preserve existing viewer and test entry points.
  var releaseTerrain = terrain.release;
  var asteroidMesh = terrain.asteroidMesh;
  var contactMesh = terrain.contactMesh;
  var craterDistance = terrain.craterDistance;
  var globeRelief = terrain.globeRelief;
  var impactBytes = terrain.impactBytes;
  var impactsFor = terrain.impactsFor;
  var platformSurface = terrain.platformSurface;
  var platformSurfaceGeometry = terrain.platformSurfaceGeometry;
  var platformSurfacePose = terrain.platformSurfacePose;
  var rockField = terrain.rockField;
  var setStudyParameters = terrain.setStudyParameters;
  var surfaceFrame = terrain.surfaceFrame;
  var surfaceHeight = terrain.surfaceHeight;
  var visualFor = terrain.visualFor;
  var FOCAL = 1 / Math.tan(Math.PI / 8);
  // Procedural geology shared by production and Three.js material studies.
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
  /** @type {WeakMap<Float32Array, {center:V3,half:V3}>} */var instanceBounds=new WeakMap();
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
    if(batch.instanceOffsets){
      var offsets=batch.instanceOffsets,placementBounds=instanceBounds.get(offsets);
      if(!placementBounds){var low=[Infinity,Infinity,Infinity],high=[-Infinity,-Infinity,-Infinity];for(var j=0;j<offsets.length;j++) {var axis=j%3;low[axis]=Math.min(low[axis],offsets[j]);high[axis]=Math.max(high[axis],offsets[j]);}placementBounds={center:/** @type {V3} */(low.map(function(v,k){return (v+high[k])/2;})),half:/** @type {V3} */(low.map(function(v,k){return (high[k]-v)/2;}))};instanceBounds.set(offsets,placementBounds);}
      const spread=placementBounds;
      box={center:/** @type {V3} */(bounds.center.map(function(v,k){return v+spread.center[k];})),half:/** @type {V3} */(bounds.half.map(function(v,k){return v+spread.half[k];}))};
    }
    if(batch.hyperbolicRadius&&batch.hyperbolicFrame){
      // A metric ball encloses the entire axial Fermi-mapped source box.
      // Linear transformed boxes can falsely reject a curved hull near the camera.
      var radius=batch.hyperbolicRadius,frame=batch.hyperbolicFrame;
      if(batch.hyperbolicLocalBasis||batch.hyperbolicLocalOrigin){
        var localBasis=batch.hyperbolicLocalBasis||new Float32Array([1,0,0,0,1,0,0,0,1]),localOrigin=batch.hyperbolicLocalOrigin||[0,0,0];
        box={center:/** @type {V3} */([0,1,2].map(function(k){return localOrigin[k]+box.center.reduce(function(n,v,j){return n+v*localBasis[j*3+k];},0);})),half:/** @type {V3} */([0,1,2].map(function(k){return box.half.reduce(function(n,v,j){return n+v*Math.abs(localBasis[j*3+k]);},0);}))};
      }
      var far=box.center.map(function(v,k){return Math.abs(v)+box.half[k];});
      // Hyperbolic right triangle: cosh(d/R)=cosh(x/R)*cosh(rho/R).
      var extent=Math.acosh(Math.max(1,Math.cosh(far[0]/radius)*Math.cosh(Math.hypot(far[1],far[2])/radius)));
      var ch=Math.cosh(extent),sh=Math.sinh(extent);
      /** @param {V3} n @param {number} constant */function curvedOutside(n,constant){
        var a=n[0]*frame[1]+n[1]*frame[2]+n[2]*frame[3];
        return radius*(a*ch+Math.sqrt(dot(n,n)+a*a)*sh)+constant-dot(n,target)<-1e-5;
      }
      var back=camera.back,d=camera.distance;
      if(curvedOutside(/** @type {V3} */(back.map(function(v){return -v;})),d-.1)||curvedOutside(back,30000))return false;
      for(var dimension=0;dimension<2;dimension++){
        var direction=dimension===0?camera.right:camera.up,tangent=(dimension===0?aspect:1)/camera.focal;
        for(var sign=-1;sign<=1;sign+=2)if(curvedOutside(/** @type {V3} */(back.map(function(v,k){return -v*tangent+sign*direction[k];})),d*tangent))return false;
      }return true;
    }
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

  var boxMesh=/** @type {Required<import('./types').DriftworksNamespace>} */ (DW).meshBuilder.boxMesh;

  // Compatibility entry points; construction belongs to the asset, fitting stays here.
  var miningPlatformGeometry=/** @type {Required<import('./types').DriftworksNamespace>} */ (DW).miningRig.geometry;
  var miningPlatformLights=/** @type {Required<import('./types').DriftworksNamespace>} */ (DW).miningRig.lights;

  var stationModels=/** @type {NonNullable<import('./types').DriftworksNamespace['stationModels']>} */(DW.stationModels);
  var habitatMesh=stationModels.habitatMesh,roundedHullMesh=stationModels.roundedHullMesh,habitatLod=stationModels.habitatLod,mothershipHardware=stationModels.mothershipHardware;

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

  /** @param {HTMLElement} host @param {() => World} getWorld @param {(world: World) => void} setWorld @param {{study?: boolean, viewer?: boolean, zoomToTerrain?: boolean}} [options] */
  function create(host, getWorld, setWorld, options) {
    var study = !!(options && options.study);
    var viewerEnabled = study && !!(options && options.viewer);
    var terrainZoom = !options || options.zoomToTerrain !== false;
    var canvas = document.createElement('canvas');
    canvas.setAttribute('aria-label', '3D tactical scene');
    var THREE = global.THREE;
    if (!THREE) throw new Error('Vendored Three.js did not load');
    if(DW.gpuDiagnostics)DW.gpuDiagnostics.mark('three.create');
    var renderer = new THREE.WebGLRenderer({canvas:canvas,antialias:true,alpha:true,premultipliedAlpha:false});
    // Restored GPU textures have no capture or temporal contents. Refill both.
    canvas.addEventListener('webglcontextlost',function(){if(bridgeRenderer)bridgeRenderer.invalidate();});
    canvas.addEventListener('webglcontextrestored',function(){if(bridgeRenderer)bridgeRenderer.invalidate();});
    renderer.autoClear=false;renderer.sortObjects=false;
    var scene = new THREE.Scene(), camera = new THREE.Camera();
    /** @type {import('../experiments/types').ShieldDisc[]} */var shieldDiscs=[];
    /** @type {HTMLCanvasElement|null} */var shieldSky=null;
    /** @type {ReturnType<NonNullable<import('./types').DriftworksNamespace['flightShields']>['create']>|null} */var shieldPass=null;
    /** @type {import('../experiments/types').CapitalShieldFrame|null} */var capitalShieldFrame=null;
    /** @type {ReturnType<NonNullable<import('./types').DriftworksNamespace['capitalShieldPass']>['create']>|null} */var capitalShieldPass=null;
    var shieldOutputUniform={value:0};
    // Common readability floor for native PBR; custom asteroid/mining shaders ignore it.
    scene.add(new THREE.AmbientLight(0xffffff,.35));
    var blending=THREE.NoBlending, depthWrite=true;
    if (!DW.asteroidArt) throw new Error('Shared asteroid artwork did not load');
    var art = DW.asteroidArt;
    var background = document.createElement('div'); background.className = 'night-sky-background';
    host.appendChild(background); host.appendChild(canvas);
    var overlay = document.createElement('canvas'); overlay.className = 'scene3d-overlay'; host.appendChild(overlay);
    var overlayContext = overlay.getContext('2d');
    if (!overlayContext) throw new Error('Missing tactical overlay context');
    var hud = overlayContext;
    var toolbar = document.createElement('div'); toolbar.className = 'scene3d-controls';
    toolbar.innerHTML = '<strong>3D RTS prototype</strong><span>Alt + drag: orbit | Middle / Space + drag: pan | Wheel: zoom</span><button type="button" data-rig-lights aria-pressed="true">Rig lights</button><button type="button" data-spotlight aria-pressed="false">Work light</button><button type="button" data-work-shadows aria-pressed="true">Shadows</button><button type="button" data-cut>Cutaway</button><button type="button" data-orbit aria-label="Orbit camera">Orbit 30 deg</button><button type="button" data-overview>Overview</button><button type="button" data-top>Top view</button><button type="button" data-under>Underside</button><a href="?renderer=2d">2D renderer</a>';
    host.appendChild(toolbar);
    /** @type {Orbit} */ var orbit = { yaw: 0, tilt: 0.48 };
    var studyHeight = 0;
    var diagnostics={mode:'normal',flat:false,scale:1,mothership:true,actors:true};
    /** @type {boolean|null} */var shipStretchingOverride=null;
    /** @type {import('../experiments/types').EllisRenderPass|null} */var bridgeRenderer=null;
    var renderStats={shieldFloat:-1,explosions:0,explosionBatches:0,effectVertices:0,bridgeObjectPaths:0,bridgeObjectPatches:0,bridgeObjectError:0,bridgeObjectBad:0,bridgeHistoryValid:0,bridgeCaptures:0,bridgeCpuMs:0,drawCalls:0,triangles:0,shadowDrawCalls:0,shadowTriangles:0,lines:0,meshes:0,materials:0,width:0,height:0,pixelRatio:1,cpuMs:0};
    /** @type {Set<import('./three-types').Geometry>} */ var frameMeshes=new Set();
    /** @type {Set<string>} */ var frameMaterials=new Set();
    var materialFinish=0;
    var identityBasis=new Float32Array([1,0,0,0,1,0,0,0,1]),emptyHyperbolicFrame=new Float32Array(16);
    var focus = false, stress = false, fps = 0;
    var rigLightsEnabled=true;
    /** @type {import('./types').RigLighting[]} */ var studyLightRigs=[];
    var spotlightEnabled = false, workShadowsEnabled = true, shadowPass = false;
    /** @type {Record<string,{visual:import('./types').AsteroidVisual,lamp:ReturnType<typeof surfaceSpotlight>}>} */
    var surfaceLamps = {};
    /** @type {{ event: import('./types').CombatEvent, age: number }[]} */ var effects = [];
    /** @type {Record<string, { key: string, mesh: Mesh, texture: import('./three-types').Texture, visual: import('./types').AsteroidVisual, values: ReturnType<typeof art.uniforms> }>} */ var rocks = {};
    var vertexShader = 
      'attribute vec3 aInstanceOffset;attribute vec2 aNormalUV;varying vec2 vNormalUV;attribute vec3 aBakedDocking; varying vec3 vBakedDocking; attribute vec2 aUV; varying vec2 vUV; attribute vec3 aPosition,aNormal; uniform vec3 uOrigin,uScale,uTarget,uRight,uUp,uBack; uniform vec3 uSpotPosition,uSpotDirection,uSpotRight,uSpotUp; uniform vec2 uSpotPower,uSpotFrustum; uniform float uShadowPass; uniform vec4 uView; uniform float uRotation,uAxialSpin; uniform mat3 uModelBasis; varying vec3 vNormal,vLocal,vRelative; varying float vDepth; varying vec3 vEffect; void main(){vNormalUV=aNormalUV;vBakedDocking=aBakedDocking;vUV=aUV;vEffect=aNormal; float c=cos(uRotation),s=sin(uRotation); vec3 local=aPosition; float ac=cos(uAxialSpin),as=sin(uAxialSpin);local=vec3(local.x,ac*local.y+as*local.z,-as*local.y+ac*local.z);vec3 p=uModelBasis*((local+aInstanceOffset)*uScale); p=vec3(c*p.x-s*p.y,s*p.x+c*p.y,p.z)+uOrigin-uTarget; vRelative=p; vec3 n=aNormal/uScale; n=vec3(n.x,ac*n.y+as*n.z,-as*n.y+ac*n.z);n=uModelBasis*n;vNormal=normalize(vec3(c*n.x-s*n.y,s*n.x+c*n.y,n.z)); vLocal=local; float d=uView.x-dot(p,uBack); vDepth=d; float far=uView.x+30000.; if(uShadowPass>.5){vec3 beam=p-uSpotPosition;float z=dot(beam,uSpotDirection),near=uSpotPower.y*uSpotFrustum.y;gl_Position=vec4(dot(beam,uSpotRight)*uSpotFrustum.x,dot(beam,uSpotUp)*uSpotFrustum.x,((uSpotPower.y+near)*z-2.*uSpotPower.y*near)/(uSpotPower.y-near),z);return;}gl_Position=vec4(dot(p,uRight)*uView.y/uView.z,dot(p,uUp)*uView.y,((far+.1)/(far-.1))*d-2.*far*.1/(far-.1),d); }';
    vertexShader=vertexShader.replace('attribute vec3 aBakedDocking;','uniform float uTransitBlend,uTransitRadius;uniform vec3 uTransitAxis,uTransitTangentX,uTransitTangentY;uniform vec3 uTransitView[33],uTransitX[33],uTransitY[33];uniform float uLensEnabled;uniform vec3 uLensCenter,uLensViewCenter,uLensX,uLensY,uLensZ;attribute vec3 aBakedDocking;').replace('float d=uView.x-dot(p,uBack);','if(uLensEnabled>.5){vec3 delta=p+uTarget-uLensCenter;vec3 q=uLensViewCenter+uLensX*delta.x+uLensY*delta.y+uLensZ*delta.z;if(uTransitBlend>0.){float h=clamp((dot(delta,uTransitAxis)/uTransitRadius+1.)*16.,0.,32.);int k=int(min(31.,floor(h)));float f=h-float(k);vec3 tq=mix(uTransitView[k],uTransitView[k+1],f)+mix(uTransitX[k],uTransitX[k+1],f)*dot(delta,uTransitTangentX)+mix(uTransitY[k],uTransitY[k+1],f)*dot(delta,uTransitTangentY);q=mix(q,tq,uTransitBlend);}p=uRight*q.x+uUp*q.y+uBack*(uView.x-q.z);vRelative=p;}float d=uView.x-dot(p,uBack);');
    var fragmentShader = art.shaderSource +
      '\nvarying vec2 vNormalUV;uniform sampler2D uArmorNormal;uniform float uArmorEnabled;uniform mat3 uModelBasis;varying vec3 vBakedDocking; uniform float uRigBakedEnabled; varying vec2 vUV; uniform sampler2D uShipTexture; uniform float uTextured,uPaintEnabled; uniform vec3 uPaint; varying vec3 vNormal,vLocal,vRelative; varying float vDepth; varying vec3 vEffect; uniform vec3 uSpotPosition,uSpotDirection,uSpotRight,uSpotUp; uniform float uShadowPass,uWorkShadowEnabled; uniform sampler2D uWorkShadow; uniform vec2 uSpotPower,uSpotFrustum; uniform vec3 uColor,uBack; uniform float uOpacity,uFlat,uRock,uRockDistance,uRotation,uCut,uCutHeight,uHabitat,uSpin,uHullFootprint,uHullDepth,uFinish,uCraftFill;\n'+
      'uniform float uEnvironmentEnabled;uniform vec3 uEnvironmentSH[9],uEnvironmentEye;uniform mat3 uEnvironmentBasis;uniform sampler2D uEnvironment;'+
      'vec3 skyDiffuse(vec3 n){n=normalize(uEnvironmentBasis*n);float x=n.x,y=n.y,z=n.z;vec3 c=uEnvironmentSH[0]*.282095+uEnvironmentSH[1]*(.488603*y)+uEnvironmentSH[2]*(.488603*z)+uEnvironmentSH[3]*(.488603*x)+uEnvironmentSH[4]*(1.092548*x*y)+uEnvironmentSH[5]*(1.092548*y*z)+uEnvironmentSH[6]*(.315392*(3.*z*z-1.))+uEnvironmentSH[7]*(1.092548*x*z)+uEnvironmentSH[8]*(.546274*(x*x-y*y));return pow(clamp(c+vec3(.18),vec3(.14),vec3(1.35)),vec3(1./2.2));}'+
      'vec3 skySpecular(vec3 n){vec3 incident=normalize(vRelative-uEnvironmentEye);vec3 ray=normalize(uEnvironmentBasis*reflect(incident,n));vec2 uv=vec2(atan(ray.y,ray.x)/6.28318530718+.5,acos(clamp(ray.z,-1.,1.))/3.14159265359);float metal=uFinish>.5&&uFinish<2.5?1.:0.;vec3 radiance=pow(texture2D(uEnvironment,uv,mix(5.,3.,metal)).rgb,vec3(2.2));float fresnel=pow(1.-max(0.,dot(n,-incident)),5.);return radiance*mix(.04,.18,metal)*(.4+.6*fresnel);}'+
      // Linear beam-depth packed into RG for the authored work-light material.
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
      'void main(){if(uShadowPass>.5){if(uOpacity<.99)discard;if(uTextured>.5&&texture2D(uShipTexture,vUV).a<.5)discard;float depth=clamp(dot(vRelative-uSpotPosition,uSpotDirection)/uSpotPower.y,0.,.99999);vec2 depthBytes=fract(vec2(1.,255.)*depth);depthBytes.x-=depthBytes.y/255.;gl_FragColor=vec4(depthBytes,0.,1.);return;}if(uFinish>8.5){float r=length(vEffect.xy);float glow=exp(-r*r*3.5)*(1.-smoothstep(.65,1.,r));float core=exp(-r*r*30.);if(glow*vEffect.z<.01)discard;gl_FragColor=vec4(mix(uColor,vec3(1.,.95,.86),core*.85*(1.-step(.5,uHabitat))),glow*vEffect.z*.8);return;}if(uFlat>.5){gl_FragColor=vec4(uColor,uOpacity);return;}vec3 n=normalize(vNormal);if(uArmorEnabled>.5&&vNormalUV.x>0.){vec3 mapped=normalize(uModelBasis*(texture2D(uArmorNormal,vNormalUV).xyz*2.-1.));float nc=cos(uRotation),ns=sin(uRotation);n=vec3(nc*mapped.x-ns*mapped.y,ns*mapped.x+nc*mapped.y,mapped.z);}vec3 light=normalize(uLight);vec3 col=uColor;if(uTextured>.5){vec4 tex=texture2D(uShipTexture,vUV);if(tex.a<.5)discard;vec3 rgb=tex.rgb;float hi=max(rgb.r,max(rgb.g,rgb.b));float lo=min(rgb.r,min(rgb.g,rgb.b));float chroma=hi-lo;float orange=(rgb.g-rgb.b)/max(.001,chroma);float mask=smoothstep(.12,.3,chroma/max(.001,hi))*smoothstep(.04,.16,orange)*(1.-smoothstep(.72,.95,orange))*step(rgb.g,rgb.r)*step(rgb.b,rgb.g)*uPaintEnabled;float paintValue=max(uPaint.r,max(uPaint.g,uPaint.b));vec3 paint=mix(vec3(lo*paintValue),uPaint*hi,chroma/max(.001,hi));col*=mix(rgb,paint,mask);if(uFinish<-1.5&&uFinish>-2.5){vec2 cell=vUV*vec2(4.,2.);vec2 local=fract(cell);float tile=floor(cell.x)+4.*floor(cell.y);float lit=step(.1,min(abs(tile-2.),abs(tile-6.)));float front=step(.01,local.x)*step(.01,local.y);col*=1.+.95*lit*front;}}'+
      'if(uRock>.5){vec2 p=vLocal.xy;float q=length(p)/boundary(p);float footprint=max(.000000001,uPixelFootprint*vDepth);'+
      'float dome=.78*sqrt(max(0.,1.-q*q));float exterior=uCut<.5?1.:step(abs(abs(vLocal.z)-dome),.12);'+
      'vec3 sphere=normalize(vec3(vLocal.xy/boundary(p),vLocal.z/.78));vec3 bodyNormal=n;vec4 crater=globeCraters(vLocal);float occ=crater.w*exterior;'+
      'vec3 fineGradient=rockBump(vLocal,footprint);if(exterior>.5){vec3 bump=rotateNormal(fineGradient+crater.xyz);bump-=bodyNormal*dot(bump,bodyNormal);n=normalize(bodyNormal-bump);}'+
      'else{vec3 bump=rotateNormal(fineGradient);n=normalize(n-(bump-n*dot(bump,n))*.6);occ=clamp((uCutHeight-vLocal.z)*1.1,0.,.22);}'+
      'float ndl=max(0.,dot(n,light));float sunlight=exterior>.5?smoothstep(-.03,.10,dot(bodyNormal,light)):1.;float lit=pow(ndl,.82)*sunlight;'+
      'vec3 toLamp=uSpotPosition-vRelative;float lampDistance=max(.0001,length(toLamp));vec3 lampDirection=toLamp/lampDistance;float cone=smoothstep(.80,.94,dot(-lampDirection,uSpotDirection));float reach=lampDistance/max(.0001,uSpotPower.y);float fade=1.-smoothstep(.7,1.,reach);float localLight=uSpotPower.x*cone*fade*fade/(1.+16.*reach*reach)*max(0.,dot(n,lampDirection))*workVisibility(vRelative);'+
      'float ambient=.17*(1.-occ*.7);float brightness=ambient+lit*.98;'+
      'col=globeColor(sphere)*((uEnvironmentEnabled>.5?skyDiffuse(n)*.17*(1.-occ*.7)+vec3(lit*.98):vec3(brightness))+vec3(.88,.94,1.)*localLight*(1.-occ*.5)+rigIllumination(vRelative,n)*(1.-occ*.35));col+=vec3(1.,.94,.81)*pow(ndl,8.)*.035*sunlight;'+
      '}else if(uHabitat>.5){float fp=max(.00001,uHullFootprint*vDepth/(max(.01,uHullDepth)*max(.18,abs(dot(n,uBack)))));float angle=atan(vLocal.y,vLocal.z);vec2 p=vec2(vLocal.x,(angle-uSpin)*17.);float shell=1.-smoothstep(30.,35.5,abs(vLocal.x));vec3 masks=hullMasks(p,fp);n=mix(n,hullSurface(p,n,angle,fp),shell);float diffuse=max(0.,dot(n,light));'+
      'vec2 plate=floor((p+vec2(5.,4.45))/vec2(10.,8.9));float tone=hash31(vec3(plate,2.));vec3 base=vec3(.82,.79,.70)*(.94+.09*tone);float seam=min(abs(shipCell(p,vec2(10.,8.9)).x),abs(shipCell(p,vec2(10.,8.9)).y));float cavity=1.-smoothstep(.06,.06+fp,seam);base*=1.-cavity*.22;'+
      'float close=1.-smoothstep(.018,.08,fp);float grain=noise3(vec3(p*70.,4.));base*=1.+(grain-.5)*.055*close;float grime=noise3(vec3(p*.45,3.))*exp(-seam*7.);base*=1.-grime*.14;col=base*(uEnvironmentEnabled>.5?skyDiffuse(n):vec3(.26+diffuse*.88));'+
      'vec3 halfVector=normalize(light+uBack);col+=vec3(.91,.89,.80)*pow(max(0.,dot(n,halfVector)),18.+tone*15.)*.045*(1.-uEnvironmentEnabled);col=mix(col,vec3(.57,.59,.57)*(uEnvironmentEnabled>.5?skyDiffuse(n):vec3(.28+diffuse*.8)),masks.y*.8*shell);'+
      'vec2 hatch=shipCell(p+vec2(2.,1.),vec2(20.,17.8));vec2 edge=abs(hatch)-vec2(.8,.6);float hatchDistance=max(edge.x,edge.y);float hatchMask=(1.-smoothstep(0.,fp,hatchDistance))*(1.-smoothstep(.18,.5,fp))*shell;float hatchRim=shipLine(hatchDistance,.035,fp)*shell;col=mix(col,col*.78,hatchMask);col+=vec3(.12,.13,.12)*hatchRim;'+
      'col*=.7+.3*shell;'+
      '}else{if(uFinish>.5&&uFinish<6.5){float fp=max(.00001,uHullFootprint*vDepth/(max(.01,uHullDepth)*max(.18,abs(dot(n,uBack)))));float near=1.-smoothstep(.02,.1,fp);vec3 gradient=noiseGradient3(vLocal*42.).yzw;vec3 grain=rotateNormal(gradient);n=normalize(n-(grain-n*dot(grain,n))*.09*near);float rough=noise3(vLocal*12.);col*=1.+(rough-.5)*.07*near;vec4 detail=hardwareMasks(vLocal,fp);col*=1.-detail.z*.23;col=mix(col,vec3(.72,.74,.70),detail.x*.72);col=mix(col,col*.72+vec3(.055),detail.y*.6);col=mix(col,vec3(.16,.19,.19),detail.w*.65);n=normalize(n+rotateNormal(vec3(.06,-.04,.03))*detail.y);if(uFinish>2.5&&uFinish<4.5){float joint=abs(mod(abs(vLocal.x)-42.,5.5)-.12);float weld=shipLine(joint,.04,fp);col=mix(col,col*.7,weld*.5);}}vec3 interiorAlbedo=col;float diffuse=max(0.,dot(n,light));col*=uEnvironmentEnabled>.5?skyDiffuse(n):vec3((uFinish>.5?.25+.92*diffuse:.61+.55*diffuse)+uCraftFill);if(uFinish<-.5)col=max(col,interiorAlbedo*.65);if(uEnvironmentEnabled<.5&&uFinish>.5&&uFinish<2.5){vec3 halfVector=normalize(light+uBack);col+=vec3(.85,.90,1.)*pow(max(0.,dot(n,halfVector)),uFinish<1.5?36.:12.)*.28;}if(uFinish>6.5&&uFinish<7.5)col=uColor*.95;else col+=uColor*(rigIllumination(vRelative,n)+vBakedDocking*uRigBakedEnabled);}if(uEnvironmentEnabled>.5 && !(uFinish>6.5&&uFinish<7.5))col+=skySpecular(n);gl_FragColor=vec4(col,uOpacity);}';
    fragmentShader=fragmentShader.replace('precision highp float;','precision highp float;uniform float uCameraExposure;').replace('gl_FragColor=vec4(col,uOpacity);','gl_FragColor=vec4(mix(col*pow(uCameraExposure,1./2.2),vec3(1.,.15,0.),uLensDebug*.55),uOpacity);');
    // Finite hull geometry is evaluated on the GPU; source buffers remain shared.
    var hyperbolicShader=DW.flightHyperbolic?DW.flightHyperbolic.hullShader:'uniform float uHyperbolicRadius;uniform mat4 uHyperbolicFrame;uniform vec3 uHyperbolicLocalOrigin;uniform mat3 uHyperbolicLocalBasis;vec3 hyperbolicPosition(vec3 v){return v;}mat3 hyperbolicNormalMatrix(vec3 v){return mat3(1.);}';
    vertexShader=vertexShader.replace('void main(){',hyperbolicShader+'\nvoid main(){').replace('vLocal=local;', 'if(uHyperbolicRadius>0.){p=hyperbolicPosition(aPosition)-uTarget;vRelative=p;vNormal=normalize(hyperbolicNormalMatrix(aPosition)*aNormal);}vLocal=local;');
    fragmentShader=fragmentShader.replace('void main(){',hyperbolicShader+'\nvoid main(){').replace('float nc=cos(uRotation)', 'if(uHyperbolicRadius>0.)mapped=normalize(hyperbolicNormalMatrix(vLocal)*(texture2D(uArmorNormal,vNormalUV).xyz*2.-1.));float nc=cos(uRotation)');
    var cameraExposureUniform={value:1};
    if(DW.explosions){
      fragmentShader=fragmentShader.replace('void main(){',DW.explosions.shaderSource+'\nvoid main(){if(uFinish>9.5){gl_FragColor=uFinish<10.5?blastFire(vEffect.xy,uSpin,vEffect.z,uColor.r):blastWave(vEffect.xy,uSpin);if(gl_FragColor.a<.01)discard;return;}');
    }
    fragmentShader=fragmentShader.replace('precision highp float;','precision highp float;uniform float uLensMode,uLensRadius,uLensDebug;uniform vec3 uLensMouth;uniform vec4 uView;').replace('void main(){',`void main(){
      if(uLensMode>.5){vec3 offset=vRelative-uBack*uView.x;vec3 ray=normalize(offset);float along=dot(uLensMouth,ray),disc=along*along-dot(uLensMouth,uLensMouth)+uLensRadius*uLensRadius;bool aperture=along>0.&&disc>=0.;if(uLensMode<1.5&&!aperture)discard;if(uLensMode>1.5&&uLensMode<2.5&&aperture&&length(offset)>along-sqrt(max(0.,disc))+.001)discard;}
    `);
    /** @type {Record<string,{value:number|number[]|Float32Array|import('./three-types').Texture|null}>} */
    var uniforms = {};
    // RawShaderMaterial preserves the established display-space art, including packed shadows.
    var declarations=vertexShader+'\n'+fragmentShader;
    declarations.replace(/uniform\s+(float|vec[234]|mat[34]|sampler2D)\s+([^;]+);/g,/** @param {string} _ @param {string} type @param {string} names */ function(_,type,names){
      names.split(',').forEach(function(name){var key=name.trim().replace(/\[.*$/, ''),size=type==='float'?1:type==='mat3'?9:type==='mat4'?16:Number(type.slice(-1));var count=Number((name.match(/\[(\d+)\]/)||[])[1]||1);uniforms[key]={value:type==='sampler2D'?null:size*count===1?0:new Float32Array(size*count)};});return '';
    });
    function material() {return new THREE.RawShaderMaterial({vertexShader:vertexShader,fragmentShader:fragmentShader,
      uniforms:uniforms,side:THREE.DoubleSide,transparent:true,depthWrite:depthWrite,blending:blending,
      defaultAttributeValues:{aInstanceOffset:[0,0,0],aNormalUV:[0,0],aUV:[0,0],aBakedDocking:[0,0,0]}});}
    /** @type {{object:import('./three-types').Object3D,material:import('./three-types').Material,uniforms:typeof uniforms,lines:boolean,projected?:boolean,lensTransit?:import('../experiments/types').HullTransit,lensRadius?:number,lensCenter?:number[],region?:number}[]} */
    var drawPool=[];
    var drawLensRadius=0,drawProjected=false;
    var drawLensTransit=/** @type {import('../experiments/types').HullTransit|undefined} */(undefined);
    var drawLensCenter=/** @type {number[]|null} */(null);
    var drawRegion=0,surfaceRegion=0,bridgeRevision=/** @type {string|null} */(null);
    /** @type {WeakMap<import('./three-types').Material,import('./three-types').StandardMaterial>} */ var standardShips=new WeakMap();
    /** @type {Map<HTMLImageElement,import('./three-types').RenderTarget>} */ var probes=new Map();
    /** @type {WeakMap<import('./three-types').Texture,import('./three-types').Texture>} */ var pbrTextures=new WeakMap();
    /** @type {import('./three-types').RenderTarget|null} */ var activeProbe=null;
    var skyBasis=new Float32Array(9);
    /** Native PBR only for source-textured ships. Rock/mining/procedural shaders stay intact.
     * @param {typeof uniforms} snapshot */
    function shipMaterial(snapshot){
      // Archived glTF materials: metallicFactor=0, omitted roughnessFactor defaults to 1.
      var result=new THREE.MeshStandardMaterial({metalness:0,roughness:1,side:THREE.DoubleSide,alphaTest:.5});
      result.defaultAttributeValues={aInstanceOffset:[0,0,0]};
      result.onBeforeCompile=function(shader){
        shader.vertexShader='attribute vec3 aInstanceOffset;\n'+shader.vertexShader;
        shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\ntransformed+=aInstanceOffset;');
        shader.uniforms.uShieldOutput=shieldOutputUniform;shader.uniforms.uSkyBasis={value:skyBasis};shader.uniforms.uSkyCameraExposure=cameraExposureUniform;
        shader.uniforms.uArmorNormal=snapshot.uArmorNormal;shader.uniforms.uArmorEnabled=snapshot.uArmorEnabled;
        shader.uniforms.uHyperbolicLocalOrigin=snapshot.uHyperbolicLocalOrigin;shader.uniforms.uHyperbolicLocalBasis=snapshot.uHyperbolicLocalBasis;shader.uniforms.uHyperbolicRadius=snapshot.uHyperbolicRadius;shader.uniforms.uHyperbolicFrame=snapshot.uHyperbolicFrame;shader.uniforms.uTarget=snapshot.uTarget;
        shader.vertexShader=hyperbolicShader+'uniform vec3 uTarget;\n'+shader.vertexShader;
        shader.vertexShader=shader.vertexShader.replace('#include <beginnormal_vertex>','#include <beginnormal_vertex>\nif(uHyperbolicRadius>0.)objectNormal=hyperbolicNormalMatrix(position)*objectNormal;');
        shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nif(uHyperbolicRadius>0.)transformed=hyperbolicPosition(position)-uTarget;');
        shader.vertexShader='attribute vec2 aNormalUV;varying vec2 vArmorUV;varying mat3 vArmorMatrix;\n'+shader.vertexShader;
        shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvArmorUV=aNormalUV;vArmorMatrix=normalMatrix;if(uHyperbolicRadius>0.)vArmorMatrix=normalMatrix*hyperbolicNormalMatrix(position);');
        shader.fragmentShader='uniform sampler2D uArmorNormal;uniform float uArmorEnabled;varying vec2 vArmorUV;varying mat3 vArmorMatrix;\n'+shader.fragmentShader;
        shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>','#include <normal_fragment_maps>\nif(uArmorEnabled>.5&&vArmorUV.x>0.){normal=normalize(vArmorMatrix*(texture2D(uArmorNormal,vArmorUV).xyz*2.-1.));normal*=gl_FrontFacing?1.:-1.;}');
        shader.uniforms.uShipPaint=snapshot.uPaint;
        shader.uniforms.uShipPaintEnabled=snapshot.uPaintEnabled;
        shader.fragmentShader='uniform float uShieldOutput;uniform float uSkyCameraExposure;uniform mat3 uSkyBasis;uniform vec3 uShipPaint;uniform float uShipPaintEnabled;\n'+shader.fragmentShader;
        shader.fragmentShader=shader.fragmentShader.replace('#include <colorspace_fragment>','#include <colorspace_fragment>\nif(uShieldOutput>.5)gl_FragColor=sRGBTransferOETF(gl_FragColor);');
        shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>','outgoingLight*=uSkyCameraExposure;\n#include <opaque_fragment>');
        shader.fragmentShader=shader.fragmentShader.replace('#include <envmap_physical_pars_fragment>',THREE.ShaderChunk.envmap_physical_pars_fragment.replace(/envMapRotation \*/g,'uSkyBasis *'));
        shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',THREE.ShaderChunk.map_fragment+
          '\n#ifdef USE_MAP\nvec3 rgb=pow(max(sampledDiffuseColor.rgb,vec3(0.)),vec3(1./2.2));float hi=max(rgb.r,max(rgb.g,rgb.b)),lo=min(rgb.r,min(rgb.g,rgb.b)),chroma=hi-lo;float orange=(rgb.g-rgb.b)/max(.001,chroma);float mask=smoothstep(.12,.3,chroma/max(.001,hi))*smoothstep(.04,.16,orange)*(1.-smoothstep(.72,.95,orange))*step(rgb.g,rgb.r)*step(rgb.b,rgb.g)*uShipPaintEnabled;float value=max(uShipPaint.r,max(uShipPaint.g,uShipPaint.b));vec3 paint=mix(vec3(lo*value),uShipPaint*hi,chroma/max(.001,hi));diffuseColor.rgb=mix(diffuseColor.rgb,diffuse*pow(max(paint,vec3(0.)),vec3(2.2)),mask);\n#endif\n');
      };
      return result;
    }
    var drawIndex=0;
    /** @param {string} name @param {number|number[]|Float32Array|import('./three-types').Texture|null} value */
    function setUniform(name,value){uniforms['u'+name].value=value;}
    setUniform('Light',[-0.813733,-0.581238,0.68]);
    /** @type {import('./types').SkyEnvironmentLighting|null} */ var environment=null;
    /** @type {{right:V3,up:V3,back:V3}|null} */ var environmentPose=null;
    var environmentBasis=new Float32Array([1,0,0,0,1,0,0,0,1]);
    /** @type {WeakMap<HTMLImageElement,import('./three-types').Texture>} */ var environmentTextures=new WeakMap();
    var blackEnvironment=new THREE.DataTexture(new Uint8Array([0,0,0,255]),1,1);blackEnvironment.needsUpdate=true;
    host.addEventListener('sky-environment',function(event){
      var data=/** @type {CustomEvent<{lighting:import('./types').SkyEnvironmentLighting|null,exposure?:number,pose:{right:V3,up:V3,back:V3}}>} */ (event).detail;
      environment=data.lighting;environmentPose=data.pose;cameraExposureUniform.value=data.exposure===undefined?1:Math.max(.05,Math.min(3,data.exposure));
    });
    /** @type {import('./three-types').RenderTarget|null} */
    var workShadow=null;
    function allocateWorkShadow(){if(!workShadow)workShadow=new THREE.WebGLRenderTarget(1024,1024,{minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter});return workShadow;}
    /** @param {Asteroid} asteroid */
    function craterTexture(asteroid){var texture=new THREE.DataTexture(impactBytes(asteroid),1440,1);texture.needsUpdate=true;return texture;}
    /** @type {WeakMap<import('./three-types').Geometry,import('./three-types').Interleaved>} */
    var geometryData=new WeakMap();
    /** @type {WeakSet<import('./three-types').Geometry>} */ var normalGeometry=new WeakSet();
    /** @param {Float32Array} data @param {number} [stride] @param {Float32Array} [instances] @returns {Mesh} */
    function upload(data,stride,instances) {
      var buffer=instances?new THREE.InstancedBufferGeometry():new THREE.BufferGeometry();updateGeometry(buffer,data,stride||6);
      if(instances){buffer.setAttribute('aInstanceOffset',new THREE.InstancedBufferAttribute(instances,3));buffer.instanceCount=instances.length/3;}
      return {buffer:buffer,data:viewerEnabled?data:undefined,count:data.length/(stride||6),stride:stride||6};
    }
    /** @param {import('./three-types').Geometry} geometry @param {Float32Array} data @param {number} stride */
    function updateGeometry(geometry,data,stride){
      var previous=geometryData.get(geometry);
      if(previous&&previous.array.length===data.length&&previous.stride===stride){previous.array.set(data);previous.needsUpdate=true;return;}
      if(previous)geometry.dispose();
      var interleaved=new THREE.InterleavedBuffer(data,stride);geometryData.set(geometry,interleaved);
      geometry.setAttribute('aPosition',new THREE.InterleavedBufferAttribute(interleaved,3,0));
      geometry.setAttribute('aNormal',new THREE.InterleavedBufferAttribute(interleaved,3,3));
      geometry.setAttribute('position',new THREE.InterleavedBufferAttribute(interleaved,3,0));
      geometry.setAttribute('normal',new THREE.InterleavedBufferAttribute(interleaved,3,3));
      if(stride===8){geometry.setAttribute('aUV',new THREE.InterleavedBufferAttribute(interleaved,2,6));geometry.setAttribute('uv',new THREE.InterleavedBufferAttribute(interleaved,2,6));}
    }
    /** @param {Mesh} mesh @param {Float32Array|undefined} values */
    function uploadDocking(mesh,values){if(mesh.bakedValues===values)return;mesh.bakedValues=values;
      if(values)mesh.buffer.setAttribute('aBakedDocking',new THREE.BufferAttribute(values,3));
      else mesh.buffer.deleteAttribute('aBakedDocking');
    }
    /** @type {{vertices:Float32Array,color:V3,shieldGlow?:boolean,origin?:V3,rotation?:number,projected?:boolean,lensTransit?:import('../experiments/types').HullTransit,lensRadius?:number,lensCenter?:number[],region?:number}[]} */ var studyEffects=[];
    /** @type {(Parameters<NonNullable<typeof DW.explosions>['build']>[0]&{region?:number})[]} */ var studyExplosions=[];
    /** @type {Mesh[]} */ var explosionMeshes=[];
    /** @type {Mesh[]} */ var studyEffectMeshes=[];
    /** @type {{instanceOffsets?:Float32Array,vertices:Float32Array,normalUV?:Float32Array,normalTexture?:HTMLImageElement,bakedDocking?:Float32Array,rigLights?:import('./types').RigLighting[],color:V3,finish?:number,texture?:HTMLImageElement,stride?:number,paint?:V3,opacity?:number,origin?:V3,rotation?:number,staticGeometry?:boolean,hyperbolicRadius?:number,hyperbolicFrame?:Float32Array,hyperbolicLocalOrigin?:number[],hyperbolicLocalBasis?:Float32Array,basis?:Float32Array,scale?:number,lensTransit?:import('../experiments/types').HullTransit,lensRadius?:number,lensCenter?:number[],region?:number}[]} */ var studyActors=[];
    /** @type {Mesh[]} */ var studyActorMeshes=[];
    /** @type {Map<Float32Array,Mesh>} */ var staticActorMeshes=new Map();
    /** @type {Map<Float32Array,Map<Float32Array,Mesh>>} */var instancedActorMeshes=new Map();
    /** @type {WeakMap<HTMLImageElement,import('./three-types').Texture>} */ var shipTextures=new WeakMap();
    /** @param {HTMLImageElement} image */
    // WebGL2 supports mipmaps for non-power-of-two images too.
    function shipTexture(image){
      var texture=shipTextures.get(image);
      if(!texture){texture=new THREE.Texture(image);texture.flipY=false;texture.needsUpdate=true;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.anisotropy=Math.min(4,renderer.capabilities?.getMaxAnisotropy()||1);shipTextures.set(image,texture);}
      return texture;
    }
    /** @param {import('./three-types').Texture} rawMap */
    function pbrShipTexture(rawMap){
      var map=pbrTextures.get(rawMap);
      if(!map){map=rawMap.clone();map.colorSpace=THREE.SRGBColorSpace;map.needsUpdate=true;pbrTextures.set(rawMap,map);}
      return map;
    }
    /** @param {HTMLImageElement | undefined} image */
    function bindShipTexture(image){
      setUniform('ArmorEnabled',0);setUniform('PaintEnabled',0);setUniform('Textured',image?1:0);if(!image)return;
      setUniform('ShipTexture',shipTexture(image));
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
    function setFinish(finish){materialFinish=finish;setUniform('Finish',finish);}
    /** @param {Mesh} mesh @param {V3} origin @param {V3} scale @param {number} rotation @param {V3} color @param {boolean} [rock] @param {boolean} [lines] @param {Float32Array} [basis] */
    function draw(mesh, origin, scale, rotation, color, rock, lines, basis) {
      if (viewerEnabled && !shadowPass && !lines && mesh.data && mesh.data.length) pickBatches.push({data:mesh.data,stride:mesh.stride||6,origin:origin,scale:scale,rotation:rotation,basis:basis,spin:pickSpin});
      if (shadowPass && lines) return;
      setUniform('RigBaked',mesh.bakedValues?1:0);setUniform('RigBakedEnabled',rigLightsEnabled?1:0);
      setUniform('ModelBasis',basis||identityBasis);setUniform('Origin',origin);setUniform('Scale',scale);setUniform('Color',color);
      setUniform('Rotation',rotation);setUniform('Rock',rock?1:0);
      mesh.buffer.setDrawRange(0,mesh.count);
      var entry=drawPool[drawIndex];
      if(!entry || entry.lines!==!!lines){
        if(entry)entry.material.dispose();
        var drawMaterial=material();
        /** @type {typeof uniforms} */ var snapshot={};
        Object.keys(uniforms).forEach(function(key){snapshot[key]={value:uniforms[key].value};});
        drawMaterial.uniforms=snapshot;
        var object=lines?new THREE.LineSegments(mesh.buffer,drawMaterial):new THREE.Mesh(mesh.buffer,drawMaterial);
        object.frustumCulled=false;entry={object:object,material:drawMaterial,uniforms:snapshot,lines:!!lines};drawPool[drawIndex]=entry;
      }
      entry.lensTransit=drawLensTransit;entry.projected=drawProjected;entry.lensRadius=drawLensRadius;entry.region=drawRegion;entry.lensCenter=drawLensCenter||origin;
      Object.keys(uniforms).forEach(function(key){entry.uniforms[key].value=uniforms[key].value;});
      // Negative finish is a textured interior with an illumination floor; keep its custom shader.
      var useStandard=materialFinish>=0 && !!activeProbe && !shadowPass && !rock && !lines && uniforms.uTextured.value===1 && uniforms.uFlat.value!==1;
      var submitted=entry.material;
      if(useStandard && activeProbe){
        var standard=standardShips.get(entry.material);
        if(!standard){standard=shipMaterial(entry.uniforms);standardShips.set(entry.material,standard);}
        var rawMap=/** @type {import('./three-types').Texture} */(uniforms.uShipTexture.value);
        var map=pbrShipTexture(rawMap);
        if(standard.map!==map||standard.envMap!==activeProbe.texture){standard.map=map;standard.envMap=activeProbe.texture;standard.needsUpdate=true;}
        standard.color.setRGB(color[0],color[1],color[2],THREE.SRGBColorSpace);standard.opacity=/** @type {number} */(uniforms.uOpacity.value);
        if(standard.transparent!==(standard.opacity<1)){standard.transparent=standard.opacity<1;standard.needsUpdate=true;}
        standard.envMapIntensity=1;submitted=standard;
        var b=basis||identityBasis,c=Math.cos(rotation),s=Math.sin(rotation);
        /** @type {number[]} */ var m=[];
        for(var axis=0;axis<3;axis++){m.push((c*b[axis*3]-s*b[axis*3+1])*scale[axis],(s*b[axis*3]+c*b[axis*3+1])*scale[axis],b[axis*3+2]*scale[axis],0);}
        var target=/** @type {number[]} */(uniforms.uTarget.value);
        m.push(origin[0]-target[0],origin[1]-target[1],origin[2]-target[2],1);
        entry.object.matrixAutoUpdate=false;entry.object.matrix.fromArray(m);
      }else{entry.object.matrixAutoUpdate=true;}
      // The raw shader ignores object matrices; identity restores normal scene bookkeeping.
      if(!useStandard||Number(uniforms.uHyperbolicRadius.value)>0)entry.object.matrix.fromArray([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
      /** @type {import('./three-types').Object3D & {material:import('./three-types').Material}} */(entry.object).material=submitted;
      submitted.blending=blending;submitted.depthWrite=depthWrite;
      entry.material.blending=blending;entry.material.depthWrite=depthWrite;entry.object.geometry=mesh.buffer;
      scene.add(entry.object);drawIndex++;
      renderStats.drawCalls++;if(lines)renderStats.lines+=mesh.count/2;else renderStats.triangles+=mesh.count/3*(mesh.buffer.instanceCount||1);
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
      setUniform('Spin', phase);
      setUniform('HullFootprint', Math.max(.00001, projected.depth / v.distance / (scale * getWorld().camera.zoom)));
      setUniform('HullDepth',projected.depth);
      var segments=habitatLod(17*scale*getWorld().camera.zoom*v.distance/Math.max(.01,projected.depth));
      var habitat=habitatLevels.filter(function(level){return level.segments===segments;})[0].mesh;
      setUniform('Habitat', 1);
      part(habitat, [0, 0, 0], [1, 1, 1], [.49, .529, .565]);
      setUniform('Habitat', 0);
      stationLevel(segments/96).forEach(function(item){
        pickSpin=item.rotor?phase:0;setUniform('AxialSpin',pickSpin);
        setFinish(item.finish);
        part(item.mesh,[0,0,0],[1,1,1],item.color);
      });
      pickSpin=0;setUniform('AxialSpin',0);
      setFinish(0);
    }
    /** @returns {Viewport} */ function viewport() { return { width: host.clientWidth, height: host.clientHeight }; }
    /** @param {string} type @param {number} zoom */
    function semanticScale(type, zoom) {
      if(study && type==='mothership')return 1;
      var exponent = type === 'mothership' ? 0.95 : type === 'tug' || type === 'platform' || type === 'depot' ? 0.12 : 0.08;
      var z = Math.min(32, zoom); return Math.pow(Math.max(1, z), exponent) / z;
    }
    /** @type {import('./types').ViewerPickBatch[]} */ var pickBatches = [];
    var pickSpin = 0;
    var input=(/** @type {Required<import('./types').DriftworksNamespace>} */(DW)).tacticalInput3d.mount({
      canvas:canvas,toolbar:toolbar,host:host,study:study,terrainZoom:terrainZoom,viewerEnabled:viewerEnabled,orbit:orbit,
      getWorld:getWorld,setWorld:setWorld,consume:consume,view:view,project:project,unproject:unproject,pickAsteroid:pickAsteroid,platformHeight:platformHeight,pickStudyBatches:pickStudyBatches,
      get pickBatches(){return pickBatches;},get focus(){return focus;},set focus(value){focus=value;},
      get studyHeight(){return studyHeight;},set studyHeight(value){studyHeight=value;},
      get rigLightsEnabled(){return rigLightsEnabled;},set rigLightsEnabled(value){rigLightsEnabled=value;},
      get spotlightEnabled(){return spotlightEnabled;},set spotlightEnabled(value){spotlightEnabled=value;},
      get workShadowsEnabled(){return workShadowsEnabled;},set workShadowsEnabled(value){workShadowsEnabled=value;}
    });
    /** @param {World} w */
    function sync(w) {
      if(study&&diagnostics.mode!=='normal')return;
      orbit.height = study ? studyHeight : inspectionHeight(w) * (orbit.tilt > Math.PI / 2 ? -1 : 1);
      Object.keys(rocks).forEach(function (id) {
        if (!w.asteroids.some(function (a) { return a.id === id; })) {
          rocks[id].mesh.buffer.dispose(); rocks[id].texture.dispose();
          releaseTerrain(id); delete surfaceLamps[id]; delete rocks[id];
        }
      });
      Object.keys(miningMeshes).forEach(function(key){
        if(!w.platforms.some(function(platform){return key.indexOf(platform.id+':')===0;})){miningMeshes[key].buffer.dispose();delete miningMeshes[key];}
      });
      w.asteroids.forEach(function (a) {
        var key = a.radius + ':' + JSON.stringify(a.excavation || null);
        if (!rocks[a.id] || rocks[a.id].key !== key || rocks[a.id].visual !== visualFor(a)) {
          if (rocks[a.id]) { rocks[a.id].mesh.buffer.dispose(); rocks[a.id].texture.dispose(); }
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
    }
    /** @param {World} w @param {number} alpha @param {number} dt @param {number} wallDt */
    function render(w, alpha, dt, wallDt) {
      var started=performance.now(), shadowCalls=0, shadowTriangles=0;
      if(spotlightEnabled && workShadowsEnabled && w.asteroids.length && diagnostics.mode==='normal'){
        allocateWorkShadow();shadowPass=true;
        try {renderFrame(w,alpha,0,0);shadowCalls=renderStats.drawCalls;shadowTriangles=renderStats.triangles;}
        finally {shadowPass=false;renderer.setRenderTarget(null);}
      }
      renderFrame(w,alpha,dt,wallDt);
      renderStats.shadowDrawCalls=shadowCalls;renderStats.shadowTriangles=shadowTriangles;
      renderStats.drawCalls+=shadowCalls;renderStats.triangles+=shadowTriangles;renderStats.cpuMs=performance.now()-started;
    }
    /** @param {World} w @param {number} alpha @param {number} dt @param {number} wallDt */
    function renderFrame(w, alpha, dt, wallDt) {
      if(study && !shadowPass)pickBatches=[];
      drawPool.forEach(function(entry){scene.remove(entry.object);});drawIndex=0;drawProjected=false;drawRegion=0;drawLensRadius=0;drawLensCenter=null;drawLensTransit=undefined;
      var renderStart=performance.now();renderStats.explosions=0;renderStats.explosionBatches=0;renderStats.effectVertices=0;renderStats.drawCalls=0;renderStats.triangles=0;renderStats.lines=0;frameMeshes.clear();frameMaterials.clear();
      var vp = viewport(); if (vp.width < 1 || vp.height < 1) return;
      var dpr = Math.min(2, window.devicePixelRatio || 1)*(study?diagnostics.scale:1);
      var width = Math.round(vp.width * dpr), height = Math.round(vp.height * dpr);
      if (canvas.width !== width || canvas.height !== height) { renderer.setSize(width,height,false); overlay.width = width; overlay.height = height; }
      renderer.setRenderTarget(shadowPass?workShadow:null);
      renderer.setClearColor(shadowPass?0xffffff:0x000000,shadowPass?1:0);renderer.clear();blending=THREE.NoBlending;depthWrite=true;
      renderStats.width=width;renderStats.height=height;renderStats.pixelRatio=dpr;
      if(study&&diagnostics.mode==='empty'){hud.clearRect(0,0,overlay.width,overlay.height);renderStats.meshes=0;renderStats.materials=0;renderStats.cpuMs=performance.now()-renderStart;return;}
      setUniform('Opacity',1);setUniform('Flat',study&&diagnostics.flat?1:0);var v = view(w.camera, vp, orbit);
      setUniform('Target', [w.camera.x, w.camera.y, orbit.height || 0]); setUniform('Right', v.right);
      setUniform('Up', v.up); setUniform('Back', v.back);
      setUniform('View', [v.distance, v.focal, vp.width / vp.height, 0]);
      camera.matrixAutoUpdate=false;
      camera.matrix.fromArray([v.right[0],v.right[1],v.right[2],0,v.up[0],v.up[1],v.up[2],0,v.back[0],v.back[1],v.back[2],0,v.back[0]*v.distance,v.back[1]*v.distance,v.back[2]*v.distance,1]);
      camera.matrixWorld.copy(camera.matrix);camera.matrixWorldInverse.copy(camera.matrix).invert();
      var top=.1/v.focal,right=top*vp.width/vp.height;
      camera.projectionMatrix.makePerspective(-right,right,top,-top,.1,v.distance+30000);camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
      activeProbe=null;
      setUniform('EnvironmentEnabled',environment?1:0);setUniform('CameraExposure',shadowPass?1:cameraExposureUniform.value);
      if(environment){
        var environmentTexture=environmentTextures.get(environment.image);
        if(!environmentTexture){environmentTexture=new THREE.Texture(environment.image);environmentTexture.flipY=false;environmentTexture.wrapS=THREE.RepeatWrapping;environmentTexture.minFilter=THREE.LinearMipmapLinearFilter;environmentTexture.needsUpdate=true;environmentTextures.set(environment.image,environmentTexture);}
        setUniform('Environment',environmentTexture);
        setUniform('EnvironmentSH',new Float32Array(environment.sh.flat()));
        if(environmentPose){for(var column=0;column<3;column++)for(var row=0;row<3;row++)environmentBasis[column*3+row]=environmentPose.right[row]*v.right[column]+environmentPose.up[row]*v.up[column]+environmentPose.back[row]*v.back[column];}
        if(!shadowPass){
          activeProbe=probes.get(environment.image)||null;
          if(!activeProbe){
            var source=environment.radiance?new THREE.DataTexture(environment.radiance,512,256,THREE.RGBAFormat,THREE.FloatType):new THREE.Texture(environment.image);
            source.flipY=false;source.colorSpace=environment.radiance?THREE.LinearSRGBColorSpace:THREE.SRGBColorSpace;source.mapping=THREE.EquirectangularReflectionMapping;source.needsUpdate=true;
            var pmrem=new THREE.PMREMGenerator(renderer);activeProbe=pmrem.fromEquirectangular(source);probes.set(environment.image,activeProbe);source.dispose();pmrem.dispose();
          }
          // Panorama uses Z as its pole and top-down rows; Three uses Y and bottom-up UVs.
          for(var col=0;col<3;col++){skyBasis[col*3]=environmentBasis[col*3];skyBasis[col*3+1]=-environmentBasis[col*3+2];skyBasis[col*3+2]=environmentBasis[col*3+1];}
        }
        setUniform('EnvironmentBasis',environmentBasis);
        setUniform('EnvironmentEye',v.back.map(function(value){return value*v.distance;}));
      }else setUniform('Environment',blackEnvironment);
      setUniform('ShadowPass',shadowPass?1:0);
      setUniform('WorkShadowEnabled',!shadowPass&&spotlightEnabled&&workShadowsEnabled&&workShadow?1:0);
      setUniform('WorkShadow',!shadowPass&&workShadow?workShadow.texture:blackEnvironment);
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
      setUniform('RigProjected',0);setUniform('RigCount',lightRigs.length);
      if(lampUniforms){setUniform('RigPower',lampUniforms.uRigPower);setUniform('RigOrigin',lampUniforms.uRigOrigin);setUniform('RigX',lampUniforms.uRigX);setUniform('RigY',lampUniforms.uRigY);setUniform('RigZ',lampUniforms.uRigZ);}
      var owner=w.asteroids[0];
      if(spotlightEnabled && owner){
        var visual=visualFor(owner), cachedLamp=surfaceLamps[owner.id];
        if(!cachedLamp || cachedLamp.visual!==visual)cachedLamp=surfaceLamps[owner.id]={visual:visual,lamp:surfaceSpotlight(owner)};
        var lamp=cachedLamp.lamp, lampFrame=workLightFrame(owner,lamp,w.camera,orbit.height||0);
        setUniform('SpotPosition',lampFrame.position);setUniform('SpotDirection',lampFrame.direction);
        setUniform('SpotRight',lampFrame.right);setUniform('SpotUp',lampFrame.up);
        setUniform('SpotFrustum',[lampFrame.focal,lampFrame.near/lamp.range]);
        setUniform('SpotPower',[2,lamp.range]);
      }else setUniform('SpotPower',[0,1]);
      w.asteroids.forEach(function (a) {
        if(study&&diagnostics.mode==='boxes'){draw(box,[a.position.x,a.position.y,0],[a.radius,a.radius,a.radius*.78],a.rotation,[.45,.43,.4]);return;}
        var rock = rocks[a.id]; if (!rock) return;
        var values = rock.values;
        ['Bulk', 'FieldLow', 'FieldMed', 'Profile', 'Relief', 'FieldBlobs'].forEach(function (name) {
          var value = /** @type {Record<string, Float32Array | number>} */ (values)['u' + name];
          if (value instanceof Float32Array) setUniform(name, value);
        });
        setUniform('BlobMaterial', values.uBlobMaterial);
        setUniform('CraterCount', impactsFor(a).length); setUniform('CraterTextureWidth', 1440);
        setUniform('Heterogeneity', values.uHeterogeneity); setUniform('Seed', values.uSeed);
        var center = project([a.position.x, a.position.y, 0], w.camera, vp, orbit);
        setUniform('RockDistance', center.depth);
        setUniform('PixelFootprint', Math.max(0.000001, 2 / (vp.height*v.focal*a.radius*dpr)));
        setUniform('Cut', a.excavation && a.excavation.level > 0 ? 1 : 0);
        setUniform('CutHeight', a.excavation ? -Math.min(.42, Math.max(.03, a.excavation.depthM / sim.METERS_PER_UNIT / a.radius)) : 0);
        setUniform('CraterData',rock.texture);
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
      updateGeometry(grid.buffer,new Float32Array(gridData),6);
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
          var meshKey=p.id+':'+material;
          var mesh=miningMeshes[meshKey] || (miningMeshes[meshKey]=upload(new Float32Array(0)));
          var meshData=new Float32Array(data);updateGeometry(mesh.buffer,meshData,mesh.stride||6);if(viewerEnabled)mesh.data=meshData;mesh.count=data.length/6;
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
      effects = effects.filter(function (fx) { return fx.age < (fx.event.kind==='ship-destroyed'?5.5:.5); });
      var drag=input.drag;
      if (drag && drag.mode === 'select') { hud.strokeStyle = '#b4e8ef'; hud.strokeRect(drag.start.x, drag.start.y, drag.last.x - drag.start.x, drag.last.y - drag.start.y); }
      if(study && diagnostics.actors && studyActors.length){
        setUniform('CraftFill',.18);
        setFinish(0);setUniform('Habitat',0);pickSpin=0;setUniform('AxialSpin',0);
        studyActors.forEach(function(batch,index){
          drawRegion=batch.region||0;drawLensCenter=batch.lensCenter||null;drawLensRadius=batch.lensRadius||0;drawLensTransit=batch.lensTransit;
          if(!batch.vertices.length)return;
          if(batch.staticGeometry&&!bridgeRenderer&&!shadowPass&&!viewerEnabled&&!studyBatchVisible(batch,[w.camera.x,w.camera.y,orbit.height||0],v,vp.width/vp.height))return;
          var stride=batch.stride || (batch.texture?8:6);
          /** @type {Mesh | undefined} */ var mesh;
          if(batch.staticGeometry){
            if(batch.instanceOffsets){
              var cache=instancedActorMeshes.get(batch.instanceOffsets);if(!cache){cache=new Map();instancedActorMeshes.set(batch.instanceOffsets,cache);}
              mesh=cache.get(batch.vertices);if(!mesh){mesh=upload(batch.vertices,stride,batch.instanceOffsets);cache.set(batch.vertices,mesh);}
            }else{mesh=staticActorMeshes.get(batch.vertices);if(!mesh){mesh=upload(batch.vertices,stride);staticActorMeshes.set(batch.vertices,mesh);}}
          }else{
            if(!studyActorMeshes[index])studyActorMeshes[index]=upload(new Float32Array(0));
            mesh=studyActorMeshes[index];
            updateGeometry(mesh.buffer,batch.vertices,mesh.stride||6);if(viewerEnabled)mesh.data=batch.vertices;
            mesh.stride=stride;mesh.count=batch.vertices.length/stride;
          }
          uploadDocking(mesh,batch.bakedDocking);
          bindShipTexture(batch.texture);
          if(batch.normalUV&&batch.normalTexture){
            if(!normalGeometry.has(mesh.buffer)){mesh.buffer.setAttribute('aNormalUV',new THREE.BufferAttribute(batch.normalUV,2));normalGeometry.add(mesh.buffer);}
            setUniform('ArmorNormal',shipTexture(batch.normalTexture));setUniform('ArmorEnabled',1);
          }
          if(batch.paint){setUniform('Paint',batch.paint);setUniform('PaintEnabled',1);}
          var translucent=batch.opacity!==undefined&&batch.opacity<1;
          setUniform('Opacity',batch.opacity===undefined?1:batch.opacity);
          if(translucent){blending=THREE.NormalBlending;depthWrite=false;}
          setFinish(batch.finish===7&&!rigLightsEnabled?8:batch.finish || 0);
          setUniform('HyperbolicLocalOrigin',batch.hyperbolicLocalOrigin||[0,0,0]);setUniform('HyperbolicLocalBasis',batch.hyperbolicLocalBasis||identityBasis);setUniform('HyperbolicRadius',batch.hyperbolicRadius||0);setUniform('HyperbolicFrame',batch.hyperbolicFrame||emptyHyperbolicFrame);
          var actorScale=batch.scale===undefined?1:batch.scale;
          draw(mesh,batch.origin || [0,0,0],[actorScale,actorScale,actorScale],batch.rotation || 0,batch.color,false,false,batch.basis);
          if(translucent){depthWrite=true;blending=THREE.NoBlending;}
        });
      }
      setUniform('HyperbolicRadius',0);
      drawRegion=0;drawLensCenter=null;drawLensRadius=0;drawLensTransit=undefined;
      setUniform('Opacity',1);
      bindShipTexture(undefined);
      setUniform('CraftFill',0);
      if(shadowPass){renderer.render(scene,camera);return;}
      if(study && studyEffects.length){
        blending=THREE.AdditiveBlending;depthWrite=false;
        setFinish(9);setUniform('Habitat',0);pickSpin=0;setUniform('AxialSpin',0);
        studyEffects.forEach(function(batch,index){
          setUniform('Habitat',batch.shieldGlow?1:0);
          drawProjected=!!batch.projected;
          drawRegion=batch.region||0;drawLensCenter=batch.lensCenter||null;drawLensRadius=batch.lensRadius||0;drawLensTransit=batch.lensTransit;
          if(!batch.vertices.length)return;
          renderStats.effectVertices+=batch.vertices.length/6;
          if(!studyEffectMeshes[index])studyEffectMeshes[index]=upload(new Float32Array(0));
          var mesh=studyEffectMeshes[index];updateGeometry(mesh.buffer,batch.vertices,mesh.stride||6);mesh.count=batch.vertices.length/6;
          draw(mesh,[0,0,0],[1,1,1],0,batch.color);
        });
        depthWrite=true;blending=THREE.NoBlending;setFinish(0);setUniform('Habitat',0);
      }
      drawProjected=false;
      if(DW.explosions){
        var blasts=study?studyExplosions:effects.filter(function(fx){return fx.event.kind==='ship-destroyed';}).map(function(fx){var event=fx.event;return {position:/** @type {V3} */([event.position.x,event.position.y,0]),velocity:/** @type {V3} */([event.velocity?event.velocity.x:0,event.velocity?event.velocity.y:0,0]),age:fx.age,size:2,seed:Math.round(event.position.x*31+event.position.y*17)};});
        var explosionIndex=0;
        blasts.forEach(function(blast){
          drawRegion='region' in blast?Number(blast.region)||0:0;drawLensCenter=blast.position;
          if(!DW.explosions)return;
          var blastBatches=DW.explosions.build(blast,v.right,v.up);if(blastBatches.length)renderStats.explosions++;
          blastBatches.forEach(function(batch){
            renderStats.explosionBatches++;
            var mesh=explosionMeshes[explosionIndex];if(!mesh)mesh=explosionMeshes[explosionIndex]=upload(new Float32Array(0));explosionIndex++;
            updateGeometry(mesh.buffer,batch.vertices,6);mesh.count=batch.vertices.length/6;
            blending=batch.finish===0?THREE.NoBlending:batch.finish===10?THREE.NormalBlending:THREE.AdditiveBlending;depthWrite=batch.finish===0;
            setFinish(batch.finish);setUniform('Spin',batch.age);setUniform('Flat',batch.finish===0?1:0);
            draw(mesh,[0,0,0],[1,1,1],0,batch.color);
          });
        });
        setFinish(0);setUniform('Spin',w.elapsedSeconds);setUniform('Flat',0);depthWrite=true;blending=THREE.NoBlending;
      }
      renderStats.bridgeObjectPaths=0;renderStats.bridgeObjectPatches=0;renderStats.bridgeObjectError=0;renderStats.bridgeObjectBad=0;renderStats.bridgeHistoryValid=0;renderStats.bridgeCaptures=0;renderStats.bridgeCpuMs=0;
      if(bridgeRenderer&&!shadowPass){
        var target=/** @type {number[]} */(uniforms.uTarget.value);
        var bridge=bridgeRenderer.render(scene,camera,drawPool.slice(0,drawIndex),{region:surfaceRegion,eye:target.map(function(x,i){return x+v.back[i]*v.distance;}),right:v.right,up:v.up,back:v.back},v.focal,v.distance+30000,width,height,bridgeRevision);
        renderStats.bridgeObjectPaths=bridge.objectPaths;renderStats.bridgeObjectPatches=bridge.objectPatches;renderStats.bridgeObjectError=bridge.objectError;renderStats.bridgeObjectBad=bridge.objectBad;renderStats.bridgeHistoryValid=bridge.historyValid;renderStats.bridgeCaptures=bridge.captures;renderStats.bridgeCpuMs=bridge.cpuMs;
        renderStats.drawCalls=renderStats.drawCalls*(1+bridge.captures)+bridge.compositionPasses;
        renderStats.triangles=renderStats.triangles*(1+bridge.captures)+2*bridge.compositionPasses;
        if(shieldDiscs.length&&shieldSky&&DW.flightShields){if(!shieldPass)shieldPass=DW.flightShields.create(THREE,renderer,shieldSky);var shieldExtra=shieldPass.render(scene,camera,shieldDiscs,width,height,true);renderStats.drawCalls+=shieldExtra;renderStats.triangles+=shieldExtra*2;}
      }else if(!shadowPass&&capitalShieldFrame&&shieldSky&&DW.capitalShieldPass&&(capitalShieldFrame.mode==='envelope'||capitalShieldFrame.impacts.some(function(hit){return hit.age>=0&&hit.age<(hit.heavy?.65:.36);}))){
        if(!capitalShieldPass)capitalShieldPass=DW.capitalShieldPass.create(THREE,renderer,shieldSky);
        renderStats.shieldFloat=capitalShieldPass.supported?1:0;shieldOutputUniform.value=capitalShieldFrame.mode==='refraction'&&capitalShieldPass.supported?1:0;
        try{var capitalExtra=capitalShieldPass.render(scene,camera,capitalShieldFrame,width,height);renderStats.drawCalls+=capitalExtra.draws;renderStats.triangles+=capitalExtra.triangles;}finally{shieldOutputUniform.value=0;}
      }else if(!shadowPass&&shieldDiscs.length&&shieldSky&&DW.flightShields){
        if(!shieldPass)shieldPass=DW.flightShields.create(THREE,renderer,shieldSky);
        shieldOutputUniform.value=1;try{var extra=shieldPass.render(scene,camera,shieldDiscs,width,height);renderStats.drawCalls+=extra;renderStats.triangles+=extra*2;}finally{shieldOutputUniform.value=0;}
      }else{if(DW.gpuDiagnostics)DW.gpuDiagnostics.mark('three.direct');renderer.render(scene,camera);}
      renderStats.meshes=frameMeshes.size;renderStats.materials=frameMaterials.size;renderStats.cpuMs=performance.now()-renderStart;
      if (wallDt > 0) fps = fps * 0.9 + Math.min(240, 1 / wallDt) * 0.1;
      if (DW.audio) DW.audio.setEngineThrust(Math.min(1, Math.max.apply(null, w.ships.map(function (s) { return s.disabled || s.docked ? 0 : Math.hypot(s.velocity.x - s.previousVelocity.x, s.velocity.y - s.previousVelocity.y) / Math.max(1, s.acceleration / 30); }))));
    }
    return {
      /** @param {{eye: V3, right: V3, up: V3, back: V3, region?:number} | null} pose */
      setSurfaceCamera: function(pose) {
        surfaceRegion=pose&&pose.region||0;
        if(!study)return;
        if(input.viewerControls)input.viewerControls.reset();
        if(!pose){delete orbit.surface;studyHeight=0;orbit.height=0;return;}
        orbit.surface={right:pose.right,up:pose.up,back:pose.back,distance:1,focal:FOCAL};
        studyHeight=pose.eye[2]-pose.back[2];orbit.height=studyHeight;
        var w=getWorld();setWorld(Object.assign({},w,{camera:{x:pose.eye[0]-pose.back[0],y:pose.eye[1]-pose.back[1],zoom:w.camera.zoom}}));
      },
      getOrbit: function () { return { yaw: orbit.yaw, tilt: orbit.tilt, height: studyHeight }; },
      /** @param {{yaw: number, tilt: number, height?: number}} value */
      setOrbit: function (value) { if(input.viewerControls && (input.viewerControls.isFlying() || input.viewerControls.isPicking())){var savedCamera=getWorld().camera;input.viewerControls.reset();var resetWorld=getWorld();setWorld(Object.assign({},resetWorld,{camera:savedCamera}));} if(study && value.height!==undefined)studyHeight=value.height;else if(study && getWorld().camera.zoom<1)studyHeight=0; orbit.yaw = value.yaw; orbit.tilt = Math.max(.06, Math.min(Math.PI - .06, value.tilt)); },
      /** @param {import('../experiments/types').CapitalShieldFrame|null} frame @param {HTMLCanvasElement|null} sky */
      setStudyCapitalShield:function(frame,sky){capitalShieldFrame=frame;shieldSky=sky;if(!sky&&capitalShieldPass){capitalShieldPass.dispose();capitalShieldPass=null;}},
      /** @param {import('../experiments/types').ShieldDisc[]} discs @param {HTMLCanvasElement|null} sky */
      setStudyShields:function(discs,sky){shieldDiscs=discs;shieldSky=sky;if(!sky&&shieldPass){shieldPass.dispose();shieldPass=null;}},
      completeFrame:function(){var gl=renderer.getContext();gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(4));},
      /** @param {{vertices:Float32Array,color:V3}[]} batches */
      setStudyEffects: function(batches){if(study)studyEffects=batches.slice();},
      /** @param {typeof studyExplosions} blasts */
      setStudyExplosions:function(blasts){if(study)studyExplosions=blasts.slice();},
      /** @param {{vertices:Float32Array,normalUV?:Float32Array,normalTexture?:HTMLImageElement,bakedDocking?:Float32Array,rigLights?:import('./types').RigLighting[],color:V3,finish?:number,texture?:HTMLImageElement,stride?:number,paint?:V3}[]} batches */
      /** @param {import('./types').RigLighting[]} rigs */
      setStudyLightRigs:function(rigs){studyLightRigs=rigs.slice(0,2);},
      /** @param {boolean} enabled */
      setRigLightsEnabled:function(enabled){input.setRigLightsEnabled(enabled);},
      // Upload one image per task while the fleet is loading, before publishing
      // textures to the combat renderer. No first-wreck upload or pixel processing.
      prepareStudyTextures: /** @param {HTMLImageElement[]} images */ async function(images){
        for(var image of new Set(images)){
          await new Promise(function(resolve){setTimeout(resolve,0);});
          var texture=shipTexture(image);
          renderer.initTexture(texture);
          renderer.initTexture(pbrShipTexture(texture));
        }
      },
      setStudyActors: /** @param {typeof studyActors} batches */ function(batches){
        if(!study)return;
        studyActors=batches.slice();
        var retained=new Set(batches.filter(function(b){return b.staticGeometry;}).map(function(b){return b.vertices;}));
        staticActorMeshes.forEach(function(mesh,data){if(!retained.has(data)){mesh.buffer.dispose();staticActorMeshes.delete(data);}});
        var keptOffsets=new Set(batches.map(function(b){return b.instanceOffsets;}).filter(Boolean));
        instancedActorMeshes.forEach(function(cache,offsets){cache.forEach(function(mesh,data){if(!keptOffsets.has(offsets)||!retained.has(data)){mesh.buffer.dispose();cache.delete(data);}});if(!cache.size)instancedActorMeshes.delete(offsets);});
      },
      sync: sync, render: render, consumeCombatEvents: consume,
      resetCombat: function () { effects = []; studyExplosions=[]; focus = false; },
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
      setStudyShipStretching:/** @param {boolean} enabled */function(enabled){shipStretchingOverride=enabled;if(bridgeRenderer)bridgeRenderer.setShipStretching(enabled);},
      setStudyBridgeRevision:/** @param {string|null} revision */function(revision){bridgeRevision=revision;},
      /** @param {boolean} enabled */
      setStudyBridge: function(enabled){
        if(!study)return;
        if(enabled&&!bridgeRenderer&&DW.ellisRenderer){bridgeRenderer=DW.ellisRenderer.create(THREE,renderer);if(shipStretchingOverride!==null)bridgeRenderer.setShipStretching(shipStretchingOverride);}
        if(!enabled&&bridgeRenderer){bridgeRenderer.dispose();bridgeRenderer=null;}
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
