(function(){
    'use strict';
    /** @typedef {import('../src/three-types').Three} Three */
    /** @typedef {import('../src/three-types').Renderer} Renderer */
    /** @typedef {import('../src/three-types').UniformValue} Value */
    /** @typedef {import('./types').EllisDraw} Draw */
    /** @typedef {import('./types').Pose} Pose */
    var DW=/** @type {Required<import('../src/types').DriftworksNamespace>} */(window.Driftworks);
    var faces=[
        {right:[0,-1,0],up:[0,0,1],back:[-1,0,0]},
        {right:[0,1,0],up:[0,0,1],back:[1,0,0]},
        {right:[1,0,0],up:[0,0,1],back:[0,-1,0]},
        {right:[-1,0,0],up:[0,0,1],back:[0,1,0]},
        {right:[1,0,0],up:[0,-1,0],back:[0,0,-1]},
        {right:[1,0,0],up:[0,1,0],back:[0,0,1]}
    ];
    /** @param {Three} THREE @param {Renderer} renderer */
    function create(THREE,renderer){
        var units=DW.sim.METERS_PER_UNIT,size=384,next=0,initialized=false,lastSide=-1;
        var params=new URLSearchParams(location.search),readableShips=params.get('bridgeShips')!=='warped',updates=params.get('bridgeFaces')==='6'?6:1,explicit=params.get('bridgeLod')!=='implicit',objects=params.get('bridgeGeometry')==='objects',temporal=params.get('bridgeTemporal')==='1',adaptive=temporal||params.get('bridgeGeometry')==='adaptive';
        /** @param {number} width @param {number} height */
        function target(width,height){
            var t=new THREE.WebGLRenderTarget(width,height,{minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter});
            return Object.assign(t,{depthTexture:new THREE.DepthTexture(width,height,THREE.UnsignedIntType)});
        }
        var atlases=[target(size*3,size*2),target(size*3,size*2)];
        var primary=target(1,1),effects=target(1,1),hitMap=target(1,1),historyMap=target(1,1),primaryWidth=1,primaryHeight=1;
        var historyPose=/** @type {Pose|null} */(null),historyRevision=/** @type {string|null} */(null),historyFocal=0,phase=0;
        var lookup=new THREE.DataTexture(DW.ellisOptics.table(),512,512,THREE.RGBAFormat);
        lookup.minFilter=THREE.LinearFilter;lookup.magFilter=THREE.LinearFilter;lookup.needsUpdate=true;lookup.flipY=false;
        /** @type {Record<string,{value:Value}>} */var uniforms={
            historyMap:{value:historyMap.texture},historyValid:{value:0},historyPhase:{value:0},historyTile:{value:params.get('bridgeTemporalTile')==='1'?1:8},previousRight:{value:[1,0,0]},previousUp:{value:[0,0,1]},previousBack:{value:[0,-1,0]},
            smoothShell:{value:params.get('bridgeDepth')==='nearest'?0:1},
            maxGeometryAngle:{value:params.has('bridgeAngle')&&Number(params.get('bridgeAngle'))>0?Number(params.get('bridgeAngle'))*Math.PI/180:1.e6},hitMap:{value:hitMap.texture},hitSize:{value:[1,1]},useHitMap:{value:adaptive?1:0},
            effectColor:{value:effects.texture},effectDepth:{value:effects.depthTexture},hasEffects:{value:0},
            ellisTable:{value:lookup},sourceColor:{value:primary.texture},sourceDepth:{value:primary.depthTexture},
            localColor:{value:atlases[0].texture},localDepth:{value:atlases[0].depthTexture},
            otherColor:{value:atlases[1].texture},otherDepth:{value:atlases[1].depthTexture},
            ellisRegion:{value:0},eye:{value:[0,0,0]},right:{value:[1,0,0]},up:{value:[0,0,1]},back:{value:[0,-1,0]},
            aspect:{value:1},focal:{value:1},units:{value:units},sourceFar:{value:30001}
        };
        var fieldShader=`precision highp float;
varying vec2 screen;
uniform sampler2D sourceColor,sourceDepth,localColor,localDepth,otherColor,otherDepth,effectColor,effectDepth;uniform float hasEffects;
uniform sampler2D hitMap;uniform vec2 hitSize;uniform float useHitMap;
uniform vec3 eye,right,up,back;uniform float aspect,focal,units,sourceFar;
${DW.ellisOptics.shader}
uniform float maxGeometryAngle,smoothShell;
float linearDepth(float z,float far){return .2*far/(far+.1-(2.*z-1.)*(far-.1));}
vec2 atlasUV(vec3 p){
 vec3 a=abs(p);float face,depth;vec2 q;
 if(a.x>=a.y&&a.x>=a.z){depth=a.x;face=p.x>0.?0.:1.;q=vec2(p.x>0.?-p.y:p.y,p.z);}
 else if(a.y>=a.z){depth=a.y;face=p.y>0.?2.:3.;q=vec2(p.y>0.?p.x:-p.x,p.z);}
 else{depth=a.z;face=p.z>0.?4.:5.;q=vec2(p.x,p.z>0.?-p.y:p.y);}
 vec2 uv=clamp(q/max(.000001,depth)*.5+.5,vec2(.5/384.),vec2(1.-.5/384.));
 return (vec2(mod(face,3.),floor(face/3.))+uv)/vec2(3.,2.);
}
float shellDepth(sampler2D tex,vec2 uv){
 if(smoothShell<.5)return texture2D(tex,uv).r;
 // Explicit bilinear reconstruction also works on unfilterable depth formats.
 vec2 p=uv*vec2(1152.,768.)-.5,cell=floor(p),f=fract(p);
 vec2 a=(cell+.5)/vec2(1152.,768.),d=vec2(1./1152.,1./768.);
 vec4 z=vec4(texture2D(tex,a).r,texture2D(tex,a+vec2(d.x,0.)).r,texture2D(tex,a+vec2(0.,d.y)).r,texture2D(tex,a+d).r);
 vec4 distance=vec4(linearDepth(z.x,30000.),linearDepth(z.y,30000.),linearDepth(z.z,30000.),linearDepth(z.w,30000.));
 float near=min(min(distance.x,distance.y),min(distance.z,distance.w)),far=max(max(distance.x,distance.y),max(distance.z,distance.w));
 // Never interpolate foreground into empty capture pixels or another surface.
 if(max(max(z.x,z.y),max(z.z,z.w))>=.999999||far-near>max(5./units,near*.03))return texture2D(tex,uv).r;
 return mix(mix(z.x,z.y,f.x),mix(z.z,z.w,f.x),f.y);
}
float shellGap(vec3 point,float side,bool refineSurface){
 vec3 delta=(point-vec3(side*12000.,-2000.,1550.))/units;
 float radius=length(delta);vec2 uv=atlasUV(delta);
 bool local=side==ellisRegion;
 float depth=refineSurface?(local?shellDepth(localDepth,uv):shellDepth(otherDepth,uv)):(local?texture2D(localDepth,uv).r:texture2D(otherDepth,uv).r);
 if(depth>=.999999)return -1.e6;
 float dominant=max(max(abs(delta.x),abs(delta.y)),abs(delta.z))/max(.000001,radius);
 float radialDepth=linearDepth(depth,30000.)/max(.000001,dominant);
 if(radialDepth<300./units||radialDepth>5500./units)return -1.e6;
 return (radius-radialDepth)*units;
}
float shellGap(vec3 point,float side){return shellGap(point,side,true);}
vec4 shellColor(vec3 point,float side){
 vec2 uv=atlasUV(point-vec3(side*12000.,-2000.,1550.));
 return side==ellisRegion?texture2D(localColor,uv):texture2D(otherColor,uv);
}
vec3 trace(EllisRay e){
 if(e.hit<.5)return vec3(0.);
 // A sample behind a radial shell is not itself a hit: that extrudes a
 // captured texel into a long wedge. Bracket and refine the actual crossing.
 float previousSide;vec3 previous=ellisPoint(e,0.,previousSide);
 float previousGap=shellGap(previous,previousSide,false),previousT=0.;
 for(int i=0;i<32;i++){
  float t=(float(i)+1.)/32.,side,travel;vec3 point=ellisPointPhase(e,t,side,travel);
  if(travel>maxGeometryAngle)break;
  float gap=shellGap(point,side,false);
  if(previousSide==side&&(smoothShell<.5||previousGap> -1.e5)&&previousGap<0.&&gap>=0.){
   float low=previousT,high=t;
   for(int j=0;j<9;j++){
    float middle=(low+high)*.5,midSide;vec3 p=ellisPoint(e,middle,midSide);
    if(midSide==side&&shellGap(p,midSide)>=0.)high=middle;else low=middle;
   }
   point=ellisPoint(e,high,side);gap=shellGap(point,side);
   vec4 color=shellColor(point,side);
   // Reject depth/silhouette jumps, rather than displaying space-filled wedges.
   float footprint=max(1.,length(point-vec3(side*12000.,-2000.,1550.))*.008);
   if(gap>=0.&&gap<footprint&&color.a>.5)return vec3(high,side,1.);
  }
  previousT=t;previousGap=gap;previousSide=side;
 }
 return vec3(0.);
}

`;
        var resolveShader=`${fieldShader}
vec3 mapHit(vec2 pixel){
 vec2 uv=clamp((pixel+.5)/hitSize,.5/hitSize,1.-.5/hitSize);
 vec4 h=texture2D(hitMap,uv);
 return vec3(dot(h.rg,vec2(65280.,255.))/65535.,floor(h.b*4.+.5)-1.,step(.5,h.a));
}
bool refineNeeded=false;
vec3 mappedHit(EllisRay e,vec2 uv){
 bool refine=useHitMap<.5||abs(e.b-1.)<.012;
 vec3 candidate=vec3(0.);
 if(!refine){
  vec2 p=uv*hitSize-.5,cell=floor(p),f=fract(p);
  vec3 a=mapHit(cell),b=mapHit(cell+vec2(1.,0.)),c=mapHit(cell+vec2(0.,1.)),d=mapHit(cell+1.);
  vec4 kinds=vec4(a.z*(a.y+1.),b.z*(b.y+1.),c.z*(c.y+1.),d.z*(d.y+1.));
  float lo=min(min(kinds.x,kinds.y),min(kinds.z,kinds.w)),hi=max(max(kinds.x,kinds.y),max(kinds.z,kinds.w));
  refine=hi-lo>.1;
  if(!refine&&hi>.5){
   float first=min(min(a.x,b.x),min(c.x,d.x)),last=max(max(a.x,b.x),max(c.x,d.x));
   float t=mix(mix(a.x,b.x,f.x),mix(c.x,d.x,f.x),f.y),side,travel;
   vec3 point=ellisPointPhase(e,t,side,travel);vec4 color=shellColor(point,side);
   float footprint=max(1.,length(point-vec3(side*12000.,-2000.,1550.))*.008);
   refine=travel>maxGeometryAngle||last-first>.003||side!=a.y||abs(shellGap(point,side))>footprint||color.a<.5;
   candidate=vec3(t,side,1.);
  }
 }
 // A single fallback call avoids duplicating the long traversal in driver compilers.
 refineNeeded=refine;
 return candidate;
}
vec4 lens(){
 vec2 uv=screen*.5+.5;vec4 ordinary=texture2D(sourceColor,uv);
 vec3 ray=normalize(-back+right*screen.x*aspect/focal+up*screen.y/focal);
 EllisRay e=ellisInit(eye,ray);
 if(e.hit<.5){
#ifdef ELLIS_REFINE_PASS
 discard;
#endif
 return ordinary;
}
 float depth=texture2D(sourceDepth,uv).r;
 float distance=linearDepth(depth,sourceFar)/max(.00001,dot(ray,-back))*units;
 if(depth<.999999&&distance<e.entry-.5){
#ifdef ELLIS_REFINE_PASS
 discard;
#endif
 return ordinary;
}
 vec3 hit;
#ifdef ELLIS_FULL_PASS
 hit=trace(e);
#else
 hit=mappedHit(e,uv);
#ifdef ELLIS_REFINE_PASS
 if(!refineNeeded)discard;
 hit=trace(e);
#endif
#endif
 vec4 bent=vec4(0.);
 if(hit.z>.5){
  float side;vec3 point=ellisPoint(e,hit.x,side);
  bent=vec4(shellColor(point,side).rgb,1.)*(1.-ellisLocalWeight(eye,point,side));
 }
 // Preserve nearby local geometry at its ordinary screen position; suppress
 // its atlas-derived copies even where the ordinary pixel is transparent.
 float localWeight=depth<.999999?ellisLocalWeight(eye,eye+ray*distance,ellisRegion):0.;
 return bent*(1.-ordinary.a*localWeight)+ordinary*localWeight;
}
void main(){
 vec4 base=lens();vec2 uv=screen*.5+.5;
 if(hasEffects>.5){
  float z=texture2D(effectDepth,uv).r;
  vec3 ray=normalize(-back+right*screen.x*aspect/focal+up*screen.y/focal);
  float distance=linearDepth(z,sourceFar)/max(.00001,dot(ray,-back))*units;
  float opaque=texture2D(sourceDepth,uv).r;
  vec3 relative=eye-vec3(ellisRegion*12000.,-2000.,1550.);
  float along=dot(relative,ray),disc=along*along-dot(relative,relative)+300.*300.;
  float throat=disc>0.?-along-sqrt(disc):1.e10;
  if(throat<0.)throat=1.e10;
  // Preserve the locally straight segment. After entering the lens volume, fade the
  // approximation before distant effects require curved transparent transport.
  EllisRay localRay=ellisInit(eye,ray);
  float reach=localRay.hit>.5?localRay.entry+150.:1.e10;
  float fade=1.-smoothstep(reach*.666667,reach,distance);
  if(z<.999999&&z<=opaque+.0000001&&distance<throat&&true){
   vec4 light=texture2D(effectColor,uv)*fade;
   base=vec4(base.rgb+light.rgb,max(base.a,light.a));
  }
 }
 gl_FragColor=base;
}`;
        var postVertex='precision highp float;attribute vec2 position;varying vec2 screen;void main(){screen=position;gl_Position=vec4(position,0.,1.);}';
        if(explicit)postVertex=postVertex.replace('attribute vec2','in vec2').replace('varying vec2','out vec2');
        /** Fixed LOD avoids implicit derivatives inside divergent traversal loops.
         * @param {string} source */
        function fragmentSource(source){return explicit?source.replace('varying vec2 screen;','in vec2 screen;out vec4 ellisOutput;vec4 ellisTexture(sampler2D s,vec2 uv){return textureLod(s,uv,0.);}') .replace(/texture2D\(/g,'ellisTexture(').replace(/gl_FragColor/g,'ellisOutput'):source;}
        /** @param {string} defines */
        function resolveMaterial(defines){return new THREE.RawShaderMaterial({
            ...(explicit?{glslVersion:'300 es'}:{}),vertexShader:postVertex,
            fragmentShader:fragmentSource(defines+resolveShader),
            uniforms:uniforms,side:THREE.DoubleSide,transparent:false,depthTest:false,depthWrite:false,blending:THREE.NoBlending,defaultAttributeValues:{}
        });}
        var material=resolveMaterial(''),fullMaterial=resolveMaterial('#define ELLIS_FULL_PASS\n'),refineMaterial=resolveMaterial('#define ELLIS_REFINE_PASS\n');
        var mapMaterial=new THREE.RawShaderMaterial({
            ...(explicit?{glslVersion:'300 es'}:{}),vertexShader:postVertex,
            fragmentShader:fragmentSource((temporal?'#define ELLIS_TEMPORAL\n':'')+fieldShader+`// ELLIS_HIT_MAP_PASS
uniform sampler2D historyMap;
uniform float historyValid,historyPhase,historyTile;
uniform vec3 previousRight,previousUp,previousBack;
void main(){
 vec3 ray=normalize(-back+right*screen.x*aspect/focal+up*screen.y/focal);
 EllisRay e=ellisInit(eye,ray);
#ifdef ELLIS_TEMPORAL
 // Rotation-only reprojection: identical eye means the world ray follows the
 // same curved path. No perspective position reprojection through the throat.
 if(historyValid>.5&&mod(floor(gl_FragCoord.x/historyTile)+floor(gl_FragCoord.y/historyTile),2.)!=historyPhase&&abs(e.b-1.)>.03){
  float forward=dot(ray,-previousBack);
  vec2 uv=vec2(dot(ray,previousRight)*focal/aspect,dot(ray,previousUp)*focal)/max(.00001,forward)*.5+.5;
  if(forward>0.&&min(uv.x,uv.y)>1./hitSize.x&&max(uv.x,uv.y)<1.-1./hitSize.y){
   vec2 cell=floor(uv*hitSize-.5),center=(floor(uv*hitSize)+.5)/hitSize;
   vec4 h=texture2D(historyMap,center);
   float low=3.,high=0.;
   for(int y=0;y<2;y++)for(int x=0;x<2;x++){
    vec4 n=texture2D(historyMap,(cell+vec2(float(x),float(y))+.5)/hitSize);
    float kind=step(.5,n.a)*(floor(n.b*4.+.5));low=min(low,kind);high=max(high,kind);
   }
   bool fresh=h.a>.9||(h.a>.2&&h.a<.3),valid=high-low<.1;
   if(h.a>.5){
    float t=dot(h.rg,vec2(65280.,255.))/65535.,side,travel;
    vec3 point=ellisPointPhase(e,t,side,travel);
    float footprint=max(1.,length(point-vec3(side*12000.,-2000.,1550.))*.008);
    valid=valid&&side==floor(h.b*4.+.5)-1.&&travel<=maxGeometryAngle&&abs(shellGap(point,side))<footprint&&shellColor(point,side).a>.5;
   }
   // Never propagate reused history again: every accepted sample is at most
   // one frame old, including under rotation and for empty-space samples.
   if(fresh&&valid){gl_FragColor=vec4(h.rgb,h.a>.5?.75:0.);return;}
  }
 }
#endif
 vec3 h=trace(e);float quantized=floor(clamp(h.x,0.,1.)*65535.+.5);
 gl_FragColor=vec4(floor(quantized/256.)/255.,mod(quantized,256.)/255.,(h.y+1.)*.25,h.z>.5?1.:.25);
}`),
            uniforms:uniforms,side:THREE.DoubleSide,transparent:false,depthTest:false,depthWrite:false,blending:THREE.NoBlending,defaultAttributeValues:{}
        });
        var quad=new THREE.BufferGeometry();quad.setAttribute('position',new THREE.BufferAttribute(new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),2));
        var fullScene=new THREE.Scene(),refineScene=new THREE.Scene(),mapScene=new THREE.Scene(),postScene=new THREE.Scene(),postCamera=new THREE.Camera(),captureCamera=new THREE.Camera();
        var fullObject=new THREE.Mesh(quad,fullMaterial),refineObject=new THREE.Mesh(quad,refineMaterial);fullObject.frustumCulled=false;refineObject.frustumCulled=false;fullScene.add(fullObject);refineScene.add(refineObject);
        var mapObject=new THREE.Mesh(quad,mapMaterial);mapObject.frustumCulled=false;mapScene.add(mapObject);
        var quadObject=new THREE.Mesh(quad,material);quadObject.frustumCulled=false;postScene.add(quadObject);
        /** @param {import('../src/three-types').Scene} scene @param {Draw[]} entries @param {number[]} center @param {number} chart @param {number} face */
        function capture(scene,entries,center,chart,face){
            if(DW.gpuDiagnostics)DW.gpuDiagnostics.mark('ellis.capture.'+chart+'.'+face);
            var f=faces[face];
            entries.forEach(function(entry){
                var u=entry.uniforms,old=/** @type {number[]} */(u.uTarget.value);
                if(!entry.object.matrixAutoUpdate){
                    var m=entry.object.matrix.elements.slice();
                    m[12]+=old[0]-center[0];m[13]+=old[1]-center[1];m[14]+=old[2]-center[2];entry.object.matrix.fromArray(m);
                }
                u.uTarget.value=center;u.uRight.value=f.right;u.uUp.value=f.up;u.uBack.value=f.back;u.uView.value=[0,1,1,0];
            });
            captureCamera.matrixAutoUpdate=false;
            captureCamera.matrix.fromArray([...f.right,0,...f.up,0,...f.back,0,0,0,0,1]);
            captureCamera.matrixWorld.copy(captureCamera.matrix);captureCamera.matrixWorldInverse.copy(captureCamera.matrix).invert();
            captureCamera.projectionMatrix.makePerspective(-.1,.1,.1,-.1,.1,30000.);captureCamera.projectionMatrixInverse.copy(captureCamera.projectionMatrix).invert();
            renderer.setRenderTarget(atlases[chart]);renderer.setViewport(face%3*size,Math.floor(face/3)*size,size,size);
            renderer.setScissor(face%3*size,Math.floor(face/3)*size,size,size);renderer.setScissorTest(true);
            renderer.setClearColor(0,0);renderer.clear();renderer.render(scene,captureCamera);
        }

        /** @param {Draw} entry */
        function readable(entry){return readableShips&&!!entry.lensCenter&&(entry.lensRadius||0)>0;}
        /** Four finite paths define a 3D affine patch; a fifth probes its screen error.
         * @param {import('../src/three-types').Scene} scene @param {import('../src/three-types').Object3D} camera
         * @param {Draw[]} entries @param {Pose} pose @param {number} focal @param {number} width @param {number} height @param {boolean=} overlay */
        function renderObjects(scene,camera,entries,pose,focal,width,height,overlay){
            var start=performance.now(),eye=pose.eye.map(function(v){return v*units;}),region=pose.region||0,paths=0,maxError=0,bad=0;
            /** @typedef {{direct:boolean;turning:boolean;view:number[];columns:number[][];error:number}} Patch */
            var cache=/** @type {Map<string,Patch|null>} */(new Map());
            /** @param {number[]} point @param {number} side */
            function project(point,side){
                paths++;var h=DW.ellisOptics.primary(eye,point,region,side);if(!h)return null;
                var r=h.direction,d=h.length/units;
                return {hit:h,q:[r.reduce(function(sum,v,i){return sum+v*pose.right[i];},0)*d,r.reduce(function(sum,v,i){return sum+v*pose.up[i];},0)*d,-r.reduce(function(sum,v,i){return sum+v*pose.back[i];},0)*d]};
            }
            /** @param {number[]} center @param {number} side @param {number} radius @param {boolean} rigid @returns {Patch|null} */
            function patch(center,side,radius,rigid){
                var meters=center.map(function(v){return v*units;});const base=project(meters,side);
                if(!base||(!rigid&&base.q[2]<.001))return null;
                if(base.hit.direct)return {direct:true,turning:false,view:base.q,columns:[],error:0};
                if(rigid){
                    var mouth=[side*12000,-2000,1550],radialAxis=meters.map(function(v,i){return v-mouth[i];}),norm=Math.hypot.apply(null,radialAxis);
                    radialAxis=radialAxis.map(function(v){return v/Math.max(.000001,norm);});
                    /** @param {number[]} v */function transport(v){return side===region?v:radialAxis.map(function(n,i){return 2*n*v.reduce(function(sum,x,j){return sum+x*radialAxis[j];},0)-v[i];});}
                    var from=transport(base.hit.sourceDirection),to=base.hit.direction;
                    var rotationAxis=[from[1]*to[2]-from[2]*to[1],from[2]*to[0]-from[0]*to[2],from[0]*to[1]-from[1]*to[0]],cosine=from.reduce(function(sum,x,i){return sum+x*to[i];},0);
                    /** @param {number[]} a @param {number[]} b */function cross(a,b){return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];}
                    var w=1+cosine,qNorm=Math.hypot(rotationAxis[0],rotationAxis[1],rotationAxis[2],w);
                    if(qNorm<1e-8){rotationAxis=cross(from,Math.abs(from[2])<.9?[0,0,1]:[0,1,0]);qNorm=Math.hypot.apply(null,rotationAxis);w=0;}
                    rotationAxis=rotationAxis.map(function(v){return v/qNorm;});w/=qNorm;
                    var rigidColumns=[0,1,2].map(function(i){
                        var v=transport([i===0?1:0,i===1?1:0,i===2?1:0]);
                        // Parallel transport in the optical plane, preserving a rigid hull.
                        var first=cross(rotationAxis,v),second=cross(rotationAxis,first);
                        v=v.map(function(x,j){return x+2*(w*first[j]+second[j]);});
                        return [v.reduce(function(sum,n,j){return sum+n*pose.right[j];},0),v.reduce(function(sum,n,j){return sum+n*pose.up[j];},0),-v.reduce(function(sum,n,j){return sum+n*pose.back[j];},0)];
                    });
                    return {direct:false,turning:base.hit.turning,view:base.q,columns:rigidColumns,error:0};
                }
                var columns=/** @type {number[][]} */([]),step=4;
                for(var axis=0;axis<3;axis++){
                    var offset=meters.slice();offset[axis]+=step;var p=project(offset,side);if(!p)return null;
                    var column=p.q.map(function(v,i){return (v-base.q[i])*units/step;});
                    if(column.some(function(v){return !Number.isFinite(v)||Math.abs(v)>30;}))return null;
                    columns.push(column);
                }
                var span=Math.max(4,Math.min(2000,radius)),delta=pose.right.map(function(v,i){return (v+pose.up[i])*span/Math.sqrt(2);});
                var actual=project(meters.map(function(v,i){return v+delta[i];}),side),predicted=base.q.map(function(v,i){return v+columns.reduce(function(sum,c,j){return sum+c[i]*delta[j]/units;},0);}),error=9999;
                if(actual&&actual.q[2]>.001&&predicted[2]>.001){
                    error=Math.hypot((actual.q[0]/actual.q[2]-predicted[0]/predicted[2])*focal*height*.5,(actual.q[1]/actual.q[2]-predicted[1]/predicted[2])*focal*height*.5);
                }
                return {direct:false,turning:base.hit.turning,view:base.q,columns:columns,error:error};
            }
            var keys=['uLensEnabled','uLensMode','uLensCenter','uLensViewCenter','uLensX','uLensY','uLensZ','uLensMouth','uLensRadius','uLensDebug'];
            var saved=entries.map(function(e){return {e:e,visible:e.object.visible,material:/** @type {import('../src/three-types').Object3D & {material:import('../src/three-types').Material}} */(e.object).material,values:keys.map(function(k){return e.uniforms[k].value;})};});
            var autoClear=renderer.autoClear;
            try{
                entries.forEach(function(e){
                    if(!e.object.visible)return;
                    var side=e.region||0,center=e.lensCenter||/** @type {number[]} */(e.uniforms.uOrigin.value),key=side+':'+center.join(','),p=/** @type {Patch|null} */(null);
                    if(cache.has(key))p=cache.get(key)||null;
                    else{p=patch(center,side,e.lensRadius||20,readable(e));cache.set(key,p);if(p){maxError=Math.max(maxError,p.error);if(p.error>2)bad++;}}
                    if(!p&&(readable(e)||side!==region)){e.object.visible=false;return;}
                    var u=e.uniforms;
                    var localDistance=Math.hypot.apply(null,center.map(function(v,i){return v*units-eye[i];}));
                    u.uLensMode.value=readable(e)?3:side===region&&localDistance<200&&p?3:side!==region?1:p&&!p.direct&&!p.turning?3:2;
                    u.uLensMouth.value=[region*12000/units-pose.eye[0],-2000/units-pose.eye[1],1550/units-pose.eye[2]];u.uLensRadius.value=300/units;
                    u.uLensEnabled.value=p&&!p.direct?1:0;u.uLensDebug.value=params.get('bridgeWarpDebug')==='1'&&p&&p.error>2?1:0;
                    if(p&&!p.direct){u.uLensCenter.value=center;u.uLensViewCenter.value=p.view;u.uLensX.value=p.columns[0];u.uLensY.value=p.columns[1];u.uLensZ.value=p.columns[2];}
                    // The production raw fallback supports the vertex patch and retains
                    // source textures/colors. Native PBR patching is a later comparison.
                    /** @type {import('../src/three-types').Object3D & {material:import('../src/three-types').Material}} */(e.object).material=e.material;
                });
                renderer.setRenderTarget(null);renderer.setViewport(0,0,width,height);renderer.setClearColor(0,0);if(!overlay)renderer.clear();renderer.autoClear=false;renderer.render(scene,camera);
            }finally{renderer.autoClear=autoClear;saved.forEach(function(s){s.e.object.visible=s.visible;/** @type {import('../src/three-types').Object3D & {material:import('../src/three-types').Material}} */(s.e.object).material=s.material;keys.forEach(function(k,i){s.e.uniforms[k].value=s.values[i];});});}
            return {objectPaths:paths,objectPatches:cache.size,objectError:maxError,objectBad:bad,compositionPasses:0,historyValid:0,extraPasses:0,captures:0,cpuMs:performance.now()-start};
        }
        /** @param {import('../src/three-types').Scene} scene @param {import('../src/three-types').Object3D} camera @param {Draw[]} entries @param {Pose} pose @param {number} focal @param {number} far @param {number} width @param {number} height @param {string|null} [revision] */
        function render(scene,camera,entries,pose,focal,far,width,height,revision){
            if(objects)return renderObjects(scene,camera,entries,pose,focal,width,height);
            var start=performance.now(),region=pose.region||0;
            uniforms.ellisRegion.value=region;
            if(primaryWidth!==width||primaryHeight!==height){primary.dispose();effects.dispose();hitMap.dispose();historyMap.dispose();historyPose=null;historyMap=target(Math.ceil(width/2),Math.ceil(height/2));historyMap.texture.minFilter=THREE.NearestFilter;historyMap.texture.magFilter=THREE.NearestFilter;hitMap=target(Math.ceil(width/2),Math.ceil(height/2));hitMap.texture.minFilter=THREE.NearestFilter;hitMap.texture.magFilter=THREE.NearestFilter;uniforms.hitMap.value=hitMap.texture;uniforms.hitSize.value=[Math.ceil(width/2),Math.ceil(height/2)];primary=target(width,height);effects=target(width,height);uniforms.effectColor.value=effects.texture;uniforms.effectDepth.value=effects.depthTexture;primaryWidth=width;primaryHeight=height;uniforms.sourceColor.value=primary.texture;uniforms.sourceDepth.value=primary.depthTexture;}
            var originalVisibility=entries.map(function(e){return e.object.visible;}),ships=entries.filter(readable);
            entries.forEach(function(e,i){e.object.visible=originalVisibility[i]&&(e.region||0)===region&&!readable(e)&&!e.projected;});
            var lights=entries.filter(function(e){return e.object.visible&&e.uniforms.uFinish.value===9&&e.material.blending===THREE.AdditiveBlending;});
            var visibility=entries.map(function(e){return e.object.visible;}),writes=lights.map(function(e){return e.material.depthWrite;});
            // Additive fragments have no opaque surface depth. Keep them separate
            // from the radial shells rather than letting the lens erase them.
            lights.forEach(function(e){e.object.visible=false;});
            if(DW.gpuDiagnostics)DW.gpuDiagnostics.mark('ellis.primary');
            renderer.setRenderTarget(primary);renderer.setClearColor(0,0);renderer.clear();renderer.render(scene,camera);
            if(lights.length){
                entries.forEach(function(e){e.object.visible=false;});
                lights.forEach(function(e){e.object.visible=true;e.material.depthWrite=true;});
                if(DW.gpuDiagnostics)DW.gpuDiagnostics.mark('ellis.effects');
                renderer.setRenderTarget(effects);renderer.clear();renderer.render(scene,camera);
                lights.forEach(function(e,i){e.object.visible=false;e.material.depthWrite=writes[i];});
                entries.forEach(function(e,i){if(lights.indexOf(e)<0)e.object.visible=visibility[i];});
            }
            uniforms.hasEffects.value=lights.length?1:0;
            var saved=entries.map(function(entry){return {entry:entry,matrix:entry.object.matrix.elements.slice(),values:['uTarget','uRight','uUp','uBack','uView'].map(function(key){return entry.uniforms[key].value;})};});
            var side=pose.region||0;
            if(side!==lastSide){initialized=false;lastSide=side;}
            var count=initialized?updates:6;
            function restore(){saved.forEach(function(s){s.entry.object.matrix.fromArray(s.matrix);['uTarget','uRight','uUp','uBack','uView'].forEach(function(key,i){s.entry.uniforms[key].value=s.values[i];});});}
            try{
                for(var chart=0;chart<2;chart++)for(var i=0;i<count;i++){
                    restore();var worldSide=chart===0?side:1-side;
                    entries.forEach(function(e,k){e.object.visible=originalVisibility[k]&&!readable(e)&&!e.projected&&(e.region||0)===worldSide&&!(e.uniforms.uFinish.value===9&&e.material.blending===THREE.AdditiveBlending);});
                    capture(scene,entries,[worldSide*12000/units,-2000/units,1550/units],chart,(next+i)%6);
                }
            }finally{restore();renderer.setScissorTest(false);renderer.setRenderTarget(null);renderer.setViewport(0,0,width,height);}
            entries.forEach(function(e,i){e.object.visible=originalVisibility[i];});
            initialized=true;next=(next+count)%6;
            uniforms.eye.value=pose.eye.map(function(v){return v*units;});uniforms.right.value=pose.right;uniforms.up.value=pose.up;uniforms.back.value=pose.back;
            uniforms.aspect.value=width/height;uniforms.focal.value=focal;uniforms.sourceFar.value=far;
            const previousPose=historyPose;
            var valid=!!(temporal&&previousPose&&revision!==undefined&&revision!==null&&revision===historyRevision&&historyFocal===focal&&(previousPose.region||0)===region&&pose.eye.every(function(v,i){return Math.abs(v-previousPose.eye[i])*units<.000001;})&&pose.back.reduce(function(sum,v,i){return sum+v*previousPose.back[i];},0)>.9998);
            uniforms.historyValid.value=valid?1:0;uniforms.historyPhase.value=phase;
            if(historyPose){uniforms.previousRight.value=historyPose.right;uniforms.previousUp.value=historyPose.up;uniforms.previousBack.value=historyPose.back;}
            uniforms.historyMap.value=historyMap.texture;
            if(adaptive){if(DW.gpuDiagnostics)DW.gpuDiagnostics.mark('ellis.hit-map');uniforms.hitMap.value=hitMap.texture;renderer.setRenderTarget(hitMap);renderer.setViewport(0,0,Math.ceil(width/2),Math.ceil(height/2));renderer.setClearColor(0,0);renderer.clear();renderer.render(mapScene,postCamera);renderer.setRenderTarget(null);renderer.setViewport(0,0,width,height);}
            if(DW.gpuDiagnostics)DW.gpuDiagnostics.mark('ellis.composition');
            renderer.setClearColor(0,0);renderer.clear();renderer.render(adaptive?postScene:fullScene,postCamera);if(adaptive){if(DW.gpuDiagnostics)DW.gpuDiagnostics.mark('ellis.refinement');renderer.render(refineScene,postCamera);}
            if(temporal){
                var swap=historyMap;historyMap=hitMap;hitMap=swap;
                uniforms.hitMap.value=hitMap.texture;
                historyPose={eye:pose.eye.slice(),right:pose.right.slice(),up:pose.up.slice(),back:pose.back.slice(),region:region};
                historyRevision=revision===undefined?null:revision;historyFocal=focal;phase=1-phase;
            }
            var shipStats={objectPaths:0,objectPatches:0,objectError:0,objectBad:0};
            if(ships.length){
                entries.forEach(function(e,i){e.object.visible=originalVisibility[i]&&readable(e);});
                try{shipStats=renderObjects(scene,camera,ships,pose,focal,width,height,true);}
                finally{entries.forEach(function(e,i){e.object.visible=originalVisibility[i];});}
            }
            var projected=entries.some(function(e,i){return originalVisibility[i]&&e.projected;});
            if(projected){
                entries.forEach(function(e,i){e.object.visible=originalVisibility[i]&&!!e.projected;});
                var auto=renderer.autoClear;renderer.autoClear=false;
                try{renderer.render(scene,camera);}finally{renderer.autoClear=auto;entries.forEach(function(e,i){e.object.visible=originalVisibility[i];});}
            }
            return {objectPaths:shipStats.objectPaths,objectPatches:shipStats.objectPatches,objectError:shipStats.objectError,objectBad:shipStats.objectBad,compositionPasses:(adaptive?3:1)+(ships.length?1:0)+(projected?1:0),historyValid:valid?1:0,extraPasses:(adaptive?2:0)+(ships.length?1:0)+(projected?1:0),captures:count*2,cpuMs:performance.now()-start};
        }
        function dispose(){primary.dispose();effects.dispose();hitMap.dispose();historyMap.dispose();mapMaterial.dispose();fullMaterial.dispose();refineMaterial.dispose();atlases.forEach(function(t){t.dispose();});lookup.dispose();quad.dispose();material.dispose();}
        return {render:render,dispose:dispose,invalidate:function(){initialized=false;lastSide=-1;historyPose=null;historyRevision=null;phase=0;}};
    }
    DW.ellisRenderer={create:create,faces:faces};
}());
