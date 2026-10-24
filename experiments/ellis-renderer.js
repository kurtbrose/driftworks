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
        var params=new URLSearchParams(location.search),updates=params.get('bridgeFaces')==='6'?6:1,adaptive=params.get('bridgeGeometry')==='adaptive';
        /** @param {number} width @param {number} height */
        function target(width,height){
            var t=new THREE.WebGLRenderTarget(width,height,{minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter});
            return Object.assign(t,{depthTexture:new THREE.DepthTexture(width,height,THREE.UnsignedIntType)});
        }
        var atlases=[target(size*3,size*2),target(size*3,size*2)];
        var primary=target(1,1),effects=target(1,1),hitMap=target(1,1),primaryWidth=1,primaryHeight=1;
        var lookup=new THREE.DataTexture(DW.ellisOptics.table(),512,512,THREE.RGBAFormat);
        lookup.minFilter=THREE.LinearFilter;lookup.magFilter=THREE.LinearFilter;lookup.needsUpdate=true;lookup.flipY=false;
        /** @type {Record<string,{value:Value}>} */var uniforms={
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
uniform float maxGeometryAngle;
float linearDepth(float z,float far){return .2*far/(far+.1-(2.*z-1.)*(far-.1));}
vec2 atlasUV(vec3 p){
 vec3 a=abs(p);float face,depth;vec2 q;
 if(a.x>=a.y&&a.x>=a.z){depth=a.x;face=p.x>0.?0.:1.;q=vec2(p.x>0.?-p.y:p.y,p.z);}
 else if(a.y>=a.z){depth=a.y;face=p.y>0.?2.:3.;q=vec2(p.y>0.?p.x:-p.x,p.z);}
 else{depth=a.z;face=p.z>0.?4.:5.;q=vec2(p.x,p.z>0.?-p.y:p.y);}
 vec2 uv=clamp(q/max(.000001,depth)*.5+.5,vec2(.5/384.),vec2(1.-.5/384.));
 return (vec2(mod(face,3.),floor(face/3.))+uv)/vec2(3.,2.);
}
float shellGap(vec3 point,float side){
 vec3 delta=(point-vec3(side*12000.,-2000.,1550.))/units;
 float radius=length(delta);vec2 uv=atlasUV(delta);
 bool local=side==ellisRegion;
 float depth=local?texture2D(localDepth,uv).r:texture2D(otherDepth,uv).r;
 if(depth>=.999999)return -1.e6;
 float dominant=max(max(abs(delta.x),abs(delta.y)),abs(delta.z))/max(.000001,radius);
 float radialDepth=linearDepth(depth,30000.)/max(.000001,dominant);
 if(radialDepth<300./units||radialDepth>5500./units)return -1.e6;
 return (radius-radialDepth)*units;
}
vec4 shellColor(vec3 point,float side){
 vec2 uv=atlasUV(point-vec3(side*12000.,-2000.,1550.));
 return side==ellisRegion?texture2D(localColor,uv):texture2D(otherColor,uv);
}
vec3 trace(EllisRay e){
 if(e.hit<.5)return vec3(0.);
 // A sample behind a radial shell is not itself a hit: that extrudes a
 // captured texel into a long wedge. Bracket and refine the actual crossing.
 float previousSide;vec3 previous=ellisPoint(e,0.,previousSide);
 float previousGap=shellGap(previous,previousSide),previousT=0.;
 for(int i=0;i<32;i++){
  float t=(float(i)+1.)/32.,side,travel;vec3 point=ellisPointPhase(e,t,side,travel);
  if(travel>maxGeometryAngle)break;
  float gap=shellGap(point,side);
  if(previousSide==side&&previousGap<0.&&gap>=0.){
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
 if(hit.z<.5)return vec4(0.);
 float side;vec3 point=ellisPoint(e,hit.x,side);
 return vec4(shellColor(point,side).rgb,1.);
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
        /** @param {string} defines */
        function resolveMaterial(defines){return new THREE.RawShaderMaterial({
            vertexShader:'precision highp float;attribute vec2 position;varying vec2 screen;void main(){screen=position;gl_Position=vec4(position,0.,1.);}',
            fragmentShader:defines+resolveShader,
            uniforms:uniforms,side:THREE.DoubleSide,transparent:false,depthTest:false,depthWrite:false,blending:THREE.NoBlending,defaultAttributeValues:{}
        });}
        var material=resolveMaterial(''),fullMaterial=resolveMaterial('#define ELLIS_FULL_PASS\n'),refineMaterial=resolveMaterial('#define ELLIS_REFINE_PASS\n');
        var mapMaterial=new THREE.RawShaderMaterial({
            vertexShader:'precision highp float;attribute vec2 position;varying vec2 screen;void main(){screen=position;gl_Position=vec4(position,0.,1.);}',
            fragmentShader:fieldShader+`// ELLIS_HIT_MAP_PASS
void main(){
 vec3 ray=normalize(-back+right*screen.x*aspect/focal+up*screen.y/focal);
 vec3 h=trace(ellisInit(eye,ray));float quantized=floor(clamp(h.x,0.,1.)*65535.+.5);
 gl_FragColor=vec4(floor(quantized/256.)/255.,mod(quantized,256.)/255.,(h.y+1.)*.25,h.z);
}`,
            uniforms:uniforms,side:THREE.DoubleSide,transparent:false,depthTest:false,depthWrite:false,blending:THREE.NoBlending,defaultAttributeValues:{}
        });
        var quad=new THREE.BufferGeometry();quad.setAttribute('position',new THREE.BufferAttribute(new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),2));
        var fullScene=new THREE.Scene(),refineScene=new THREE.Scene(),mapScene=new THREE.Scene(),postScene=new THREE.Scene(),postCamera=new THREE.Camera(),captureCamera=new THREE.Camera();
        var fullObject=new THREE.Mesh(quad,fullMaterial),refineObject=new THREE.Mesh(quad,refineMaterial);fullObject.frustumCulled=false;refineObject.frustumCulled=false;fullScene.add(fullObject);refineScene.add(refineObject);
        var mapObject=new THREE.Mesh(quad,mapMaterial);mapObject.frustumCulled=false;mapScene.add(mapObject);
        var quadObject=new THREE.Mesh(quad,material);quadObject.frustumCulled=false;postScene.add(quadObject);
        /** @param {import('../src/three-types').Scene} scene @param {Draw[]} entries @param {number[]} center @param {number} chart @param {number} face */
        function capture(scene,entries,center,chart,face){
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
        /** @param {import('../src/three-types').Scene} scene @param {import('../src/three-types').Object3D} camera @param {Draw[]} entries @param {Pose} pose @param {number} focal @param {number} far @param {number} width @param {number} height */
        function render(scene,camera,entries,pose,focal,far,width,height){
            var start=performance.now(),region=pose.region||0;
            uniforms.ellisRegion.value=region;
            if(primaryWidth!==width||primaryHeight!==height){primary.dispose();effects.dispose();hitMap.dispose();hitMap=target(Math.ceil(width/2),Math.ceil(height/2));hitMap.texture.minFilter=THREE.NearestFilter;hitMap.texture.magFilter=THREE.NearestFilter;uniforms.hitMap.value=hitMap.texture;uniforms.hitSize.value=[Math.ceil(width/2),Math.ceil(height/2)];primary=target(width,height);effects=target(width,height);uniforms.effectColor.value=effects.texture;uniforms.effectDepth.value=effects.depthTexture;primaryWidth=width;primaryHeight=height;uniforms.sourceColor.value=primary.texture;uniforms.sourceDepth.value=primary.depthTexture;}
            var originalVisibility=entries.map(function(e){return e.object.visible;});
            entries.forEach(function(e,i){e.object.visible=originalVisibility[i]&&(e.region||0)===region;});
            var lights=entries.filter(function(e){return e.object.visible&&e.uniforms.uFinish.value===9&&e.material.blending===THREE.AdditiveBlending;});
            var visibility=entries.map(function(e){return e.object.visible;}),writes=lights.map(function(e){return e.material.depthWrite;});
            // Additive fragments have no opaque surface depth. Keep them separate
            // from the radial shells rather than letting the lens erase them.
            lights.forEach(function(e){e.object.visible=false;});
            renderer.setRenderTarget(primary);renderer.setClearColor(0,0);renderer.clear();renderer.render(scene,camera);
            if(lights.length){
                entries.forEach(function(e){e.object.visible=false;});
                lights.forEach(function(e){e.object.visible=true;e.material.depthWrite=true;});
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
                    entries.forEach(function(e,k){e.object.visible=originalVisibility[k]&&(e.region||0)===worldSide&&lights.indexOf(e)<0;});
                    capture(scene,entries,[worldSide*12000/units,-2000/units,1550/units],chart,(next+i)%6);
                }
            }finally{restore();renderer.setScissorTest(false);renderer.setRenderTarget(null);renderer.setViewport(0,0,width,height);}
            entries.forEach(function(e,i){e.object.visible=originalVisibility[i];});
            initialized=true;next=(next+count)%6;
            uniforms.eye.value=pose.eye.map(function(v){return v*units;});uniforms.right.value=pose.right;uniforms.up.value=pose.up;uniforms.back.value=pose.back;
            uniforms.aspect.value=width/height;uniforms.focal.value=focal;uniforms.sourceFar.value=far;
            if(adaptive){renderer.setRenderTarget(hitMap);renderer.setViewport(0,0,Math.ceil(width/2),Math.ceil(height/2));renderer.setClearColor(0,0);renderer.clear();renderer.render(mapScene,postCamera);renderer.setRenderTarget(null);renderer.setViewport(0,0,width,height);}
            renderer.setClearColor(0,0);renderer.clear();renderer.render(adaptive?postScene:fullScene,postCamera);if(adaptive)renderer.render(refineScene,postCamera);
            return {extraPasses:adaptive?2:0,captures:count*2,cpuMs:performance.now()-start};
        }
        function dispose(){primary.dispose();effects.dispose();hitMap.dispose();mapMaterial.dispose();fullMaterial.dispose();refineMaterial.dispose();atlases.forEach(function(t){t.dispose();});lookup.dispose();quad.dispose();material.dispose();}
        return {render:render,dispose:dispose};
    }
    DW.ellisRenderer={create:create,faces:faces};
}());
