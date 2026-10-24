from pathlib import Path

def edit(f,a,b):
 p=Path(f);s=p.read_text();assert a in s,(f,a[:70]);p.write_text(s.replace(a,b),encoding='utf-8',newline='\n')
f='experiments/types.d.ts'
for a,b in [('export type Pose = {','export type Pose = {\n    region?: number;'),('export type Bolt = {','export type Bolt = {\n    region?: number;'),('export type Impact = {','export type Impact = {\n    region?: number;'),('export type Batch = {','export type Batch = {\n    region?: number;'),('export type EllisDraw={','export type EllisDraw={region?:number;')]:edit(f,a,b)
edit('experiments/ellis-optics.js','uniform sampler2D ellisTable;','uniform sampler2D ellisTable;\nuniform float ellisRegion;')
edit('experiments/ellis-optics.js','float side=step(6000.,eye.x);','float side=ellisRegion;')
f='experiments/skybox.js'
edit(f,'float side=step(6000.,bridgeEye.x);','float side=ellisRegion;')
edit(f,"gl.uniform1f(gl.getUniformLocation(sky,'bridgeEnabled'),missionSky.wormhole?1:0);","gl.uniform1f(gl.getUniformLocation(sky,'bridgeEnabled'),missionSky.wormhole?1:0);\n                gl.uniform1f(gl.getUniformLocation(sky,'ellisRegion'),pose.region||0);")
f='experiments/ellis-renderer.js'
edit(f,'eye:{value:[0,0,0]}','ellisRegion:{value:0},eye:{value:[0,0,0]}')
edit(f,'step(6000.,eye.x)','ellisRegion')
edit(f,'step(6000.,(eye+ray*distance).x)==ellisRegion','true')
edit(f,'var side=pose.eye[0]*units>=6000?1:0;','var side=pose.region||0;')
edit(f,'var start=performance.now();','var start=performance.now(),region=pose.region||0;\n            uniforms.ellisRegion.value=region;')
edit(f,'var lights=entries.filter','var originalVisibility=entries.map(function(e){return e.object.visible;});\n            entries.forEach(function(e,i){e.object.visible=originalVisibility[i]&&(e.region||0)===region;});\n            var lights=entries.filter')
edit(f,"return e.uniforms.uFinish.value===9&&e.material.blending===THREE.AdditiveBlending;","return e.object.visible&&e.uniforms.uFinish.value===9&&e.material.blending===THREE.AdditiveBlending;")
# Capture visibility must be based on original submission, independently of primary visibility.
edit(f,'function capture(scene,entries,center,chart,face){','function capture(scene,entries,center,chart,face){')
edit(f,'restore();var worldSide=chart===0?side:1-side;','restore();var worldSide=chart===0?side:1-side;\n                    entries.forEach(function(e,k){e.object.visible=originalVisibility[k]&&(e.region||0)===worldSide&&lights.indexOf(e)<0;});')
edit(f,'entries.forEach(function(e,i){e.object.visible=visibility[i];});','entries.forEach(function(e,i){e.object.visible=originalVisibility[i];});')
f='src/scene3d.js'
edit(f,'var drawPool=[];','var drawPool=[];\n    var drawRegion=0,surfaceRegion=0;')
edit(f,'uniforms:typeof uniforms,lines:boolean','uniforms:typeof uniforms,lines:boolean,region?:number')
edit(f,"Object.keys(uniforms).forEach(function(key){entry.uniforms[key].value=uniforms[key].value;});","entry.region=drawRegion;\n      Object.keys(uniforms).forEach(function(key){entry.uniforms[key].value=uniforms[key].value;});")
edit(f,'scene.remove(entry.object);});drawIndex=0;','scene.remove(entry.object);});drawIndex=0;drawRegion=0;')
edit(f,'origin?:V3,rotation?:number}[]} */ var studyEffects','origin?:V3,rotation?:number,region?:number}[]} */ var studyEffects')
edit(f,'scale?:number}[]} */ var studyActors','scale?:number,region?:number}[]} */ var studyActors')
edit(f,'studyActors.forEach(function(batch,index){','studyActors.forEach(function(batch,index){\n          drawRegion=batch.region||0;')
edit(f,'studyEffects.forEach(function(batch,index){','studyEffects.forEach(function(batch,index){\n          drawRegion=batch.region||0;')
edit(f,'setUniform(\'Opacity\',1);\n      bindShipTexture(undefined);','drawRegion=0;\n      setUniform(\'Opacity\',1);\n      bindShipTexture(undefined);')
edit(f,'{eye:target.map(function(x,i)','{region:surfaceRegion,eye:target.map(function(x,i)')
edit(f,'@param {{eye: V3, right: V3, up: V3, back: V3} | null} pose','@param {{eye: V3, right: V3, up: V3, back: V3, region?:number} | null} pose')
edit(f,'setSurfaceCamera: function(pose) {','setSurfaceCamera: function(pose) {\n        surfaceRegion=pose&&pose.region||0;')
# Session region is authoritative; coordinates no longer select a chart.
f='experiments/flight-session.js'
edit(f,'function crossBridge(before,after){\n            var side=before[0]*units>6000?1:0;','function crossBridge(before,after,side){')
edit(f,'@param {number[]} before @param {number[]} after */','@param {number[]} before @param {number[]} after @param {number} side */')
edit(f,'if(index%4>=2)c.pose.eye[0]+=12000/units;','c.pose.region=index%4>=2?1:0;\n                if(c.pose.region)c.pose.eye[0]+=12000/units;')
edit(f,'function seedBridgeCombat(){','function seedBridgeCombat(){\n            state.region=0;')
edit(f,'crossBridge(previous[index],pose.eye)','crossBridge(previous[index],pose.eye,pose.region||0)')
edit(f,'pose.eye=crossing.eye;pose.right','pose.region=1-(pose.region||0);pose.eye=crossing.eye;pose.right')
edit(f,'crossBridge(record.before,record.bolt.position)','crossBridge(record.before,record.bolt.position,record.bolt.region||0)')
edit(f,'if(crossing){record.bolt.position','if(crossing){record.bolt.region=1-(record.bolt.region||0);record.bolt.position')
edit(f,'if (!emptySpace&&length <','if (!emptySpace&&!(state.region||0)&&length <')
edit('experiments/guns.js','guns.bolts.push({ position: position','guns.bolts.push({ region:pose.region||0, position: position')
