from pathlib import Path
p=Path('experiments/ellis-renderer.js');s=p.read_text(encoding='utf-8');s=s.replace("temporal=params.get('bridgeTemporal')==='1',adaptive=", "objects=params.get('bridgeGeometry')==='objects',temporal=params.get('bridgeTemporal')==='1',adaptive=")
mark='        /** @param {import(\'../src/three-types\').Scene} scene @param {import(\'../src/three-types\').Object3D} camera @param {Draw[]} entries @param {Pose} pose'
idx=s.index(mark)
code=r'''
        /** Four finite paths define a 3D affine patch; a fifth probes its screen error.
         * @param {import('../src/three-types').Scene} scene @param {import('../src/three-types').Object3D} camera
         * @param {Draw[]} entries @param {Pose} pose @param {number} focal @param {number} width @param {number} height */
        function renderObjects(scene,camera,entries,pose,focal,width,height){
            var start=performance.now(),eye=pose.eye.map(function(v){return v*units;}),region=pose.region||0,paths=0,maxError=0,bad=0;
            /** @typedef {{direct:boolean;turning:boolean;view:number[];columns:number[][];error:number}} Patch */
            var cache=/** @type {Map<string,Patch|null>} */(new Map());
            /** @param {number[]} point @param {number} side */
            function project(point,side){
                paths++;var h=DW.ellisOptics.primary(eye,point,region,side);if(!h)return null;
                var r=h.direction,d=h.length/units;
                return {hit:h,q:[r.reduce(function(sum,v,i){return sum+v*pose.right[i];},0)*d,r.reduce(function(sum,v,i){return sum+v*pose.up[i];},0)*d,-r.reduce(function(sum,v,i){return sum+v*pose.back[i];},0)*d]};
            }
            /** @param {number[]} center @param {number} side @param {number} radius @returns {Patch|null} */
            function patch(center,side,radius){
                var meters=center.map(function(v){return v*units;}),base=project(meters,side);
                if(!base||base.q[2]<.001)return null;
                if(base.hit.direct)return {direct:true,turning:false,view:base.q,columns:[],error:0};
                var columns=[],step=4;
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
            try{
                entries.forEach(function(e){
                    if(!e.object.visible)return;
                    var side=e.region||0,center=e.lensCenter||/** @type {number[]} */(e.uniforms.uOrigin.value),key=side+':'+center.join(','),p;
                    if(cache.has(key))p=cache.get(key)||null;
                    else{p=patch(center,side,e.lensRadius||20);cache.set(key,p);if(p){maxError=Math.max(maxError,p.error);if(p.error>2)bad++;}}
                    if(!p&&side!==region){e.object.visible=false;return;}
                    var u=e.uniforms;
                    u.uLensMode.value=side!==region?1:p&&!p.direct&&!p.turning?3:2;
                    u.uLensMouth.value=[region*12000/units-pose.eye[0],-2000/units-pose.eye[1],1550/units-pose.eye[2]];u.uLensRadius.value=300/units;
                    u.uLensEnabled.value=p&&!p.direct?1:0;u.uLensDebug.value=params.get('bridgeWarpDebug')==='1'&&p&&p.error>2?1:0;
                    if(p&&!p.direct){u.uLensCenter.value=center;u.uLensViewCenter.value=p.view;u.uLensX.value=p.columns[0];u.uLensY.value=p.columns[1];u.uLensZ.value=p.columns[2];}
                    // The production raw fallback supports the vertex patch and retains
                    // source textures/colors. Native PBR patching is a later comparison.
                    /** @type {import('../src/three-types').Object3D & {material:import('../src/three-types').Material}} */(e.object).material=e.material;
                });
                renderer.setRenderTarget(null);renderer.setViewport(0,0,width,height);renderer.setClearColor(0,0);renderer.clear();renderer.render(scene,camera);
            }finally{saved.forEach(function(s){s.e.object.visible=s.visible;/** @type {import('../src/three-types').Object3D & {material:import('../src/three-types').Material}} */(s.e.object).material=s.material;keys.forEach(function(k,i){s.e.uniforms[k].value=s.values[i];});});}
            return {objectPaths:paths,objectPatches:cache.size,objectError:maxError,objectBad:bad,compositionPasses:0,historyValid:0,extraPasses:0,captures:0,cpuMs:performance.now()-start};
        }
'''
s=s[:idx]+code+s[idx:];s=s.replace('            var start=performance.now(),region=pose.region||0;','            if(objects)return renderObjects(scene,camera,entries,pose,focal,width,height);\n            var start=performance.now(),region=pose.region||0;');s=s.replace('return {historyValid:valid?1:0,extraPasses:','return {objectPaths:0,objectPatches:0,objectError:0,objectBad:0,compositionPasses:adaptive?3:1,historyValid:valid?1:0,extraPasses:');p.write_text(s,encoding='utf-8',newline='\n')
p=Path('experiments/flight-presentation.js');s=p.read_text(encoding='utf-8').replace('return c.hp>0;','return (c.hp||0)>0;').replace('lensCenter:objectWarp?craft[0].pose.eye:undefined','lensRadius:objectWarp?DW.shipPackModels.hullRadius(DW.shipPackModels.craftModel(craft[0],team===\'ally\'?appearance.allyArt:appearance.enemyArt,combat.wave)):undefined,lensCenter:objectWarp?craft[0].pose.eye:undefined');p.write_text(s,encoding='utf-8',newline='\n')
for f in ['experiments/types.d.ts','src/types.d.ts']:
 p=Path(f);s=p.read_text(encoding='utf-8').replace('lensCenter?:number[];','lensRadius?:number;lensCenter?:number[];');s=s.replace('=>{historyValid:number;extraPasses:', '=>{objectPaths:number;objectPatches:number;objectError:number;objectBad:number;compositionPasses:number;historyValid:number;extraPasses:');s=s.replace('getRenderStats: () => {bridgeHistoryValid?', 'getRenderStats: () => {bridgeObjectPaths?:number;bridgeObjectPatches?:number;bridgeObjectError?:number;bridgeObjectBad?:number;bridgeHistoryValid?');p.write_text(s,encoding='utf-8',newline='\n')
p=Path('src/scene3d.js');s=p.read_text(encoding='utf-8').replace('lensCenter?:number[]','lensRadius?:number,lensCenter?:number[]');s=s.replace('var drawLensCenter=','var drawLensRadius=0;\n    var drawLensCenter=');s=s.replace('entry.region=drawRegion;','entry.lensRadius=drawLensRadius;entry.region=drawRegion;');s=s.replace('drawIndex=0;drawRegion=0;','drawIndex=0;drawRegion=0;drawLensRadius=0;');s=s.replace('drawLensCenter=batch.lensCenter||null;','drawLensCenter=batch.lensCenter||null;drawLensRadius=batch.lensRadius||0;');s=s.replace('drawRegion=0;drawLensCenter=null;','drawRegion=0;drawLensCenter=null;drawLensRadius=0;');s=s.replace("uLensMode,uLensRadius;","uLensMode,uLensRadius,uLensDebug;");s=s.replace("gl_FragColor=vec4(col*pow(uCameraExposure,1./2.2),uOpacity);","gl_FragColor=vec4(mix(col*pow(uCameraExposure,1./2.2),vec3(1.,.15,0.),uLensDebug*.55),uOpacity);");s=s.replace('var renderStats={bridgeHistoryValid:0','var renderStats={bridgeObjectPaths:0,bridgeObjectPatches:0,bridgeObjectError:0,bridgeObjectBad:0,bridgeHistoryValid:0');s=s.replace('renderStats.bridgeHistoryValid=0;','renderStats.bridgeObjectPaths=0;renderStats.bridgeObjectPatches=0;renderStats.bridgeObjectError=0;renderStats.bridgeObjectBad=0;renderStats.bridgeHistoryValid=0;');s=s.replace('renderStats.bridgeHistoryValid=bridge.historyValid;','renderStats.bridgeObjectPaths=bridge.objectPaths;renderStats.bridgeObjectPatches=bridge.objectPatches;renderStats.bridgeObjectError=bridge.objectError;renderStats.bridgeObjectBad=bridge.objectBad;renderStats.bridgeHistoryValid=bridge.historyValid;');s=s.replace('+1+bridge.extraPasses;','+bridge.compositionPasses;').replace('+2*(1+bridge.extraPasses);','+2*bridge.compositionPasses;');p.write_text(s,encoding='utf-8',newline='\n')
