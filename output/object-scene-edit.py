from pathlib import Path
p=Path('src/scene3d.js');s=p.read_text(encoding='utf-8')
s=s.replace("    var fragmentShader = art.shaderSource +", "    vertexShader=vertexShader.replace('attribute vec3 aBakedDocking;','uniform float uLensEnabled;uniform vec3 uLensCenter,uLensViewCenter,uLensX,uLensY,uLensZ;attribute vec3 aBakedDocking;').replace('float d=uView.x-dot(p,uBack);','if(uLensEnabled>.5){vec3 delta=p+uTarget-uLensCenter;vec3 q=uLensViewCenter+uLensX*delta.x+uLensY*delta.y+uLensZ*delta.z;p=uRight*q.x+uUp*q.y+uBack*(uView.x-q.z);vRelative=p;}float d=uView.x-dot(p,uBack);');\n    var fragmentShader = art.shaderSource +")
mark='    /** @type {Record<string,{value:number|number[]|Float32Array|import(\'./three-types\').Texture|null}>} */'
code="""    fragmentShader=fragmentShader.replace('precision highp float;','precision highp float;uniform float uLensMode,uLensRadius;uniform vec3 uLensMouth;uniform vec4 uView;').replace('void main(){',`void main(){
      if(uLensMode>.5){vec3 offset=vRelative-uBack*uView.x;vec3 ray=normalize(offset);float along=dot(uLensMouth,ray),disc=along*along-dot(uLensMouth,uLensMouth)+uLensRadius*uLensRadius;bool aperture=along>0.&&disc>=0.;if(uLensMode<1.5&&!aperture)discard;if(uLensMode>1.5&&uLensMode<2.5&&aperture&&length(offset)>along-sqrt(max(0.,disc))+.001)discard;}
    `);
"""
assert mark in s;s=s.replace(mark,code+mark)
s=s.replace('lines:boolean,region?:number','lines:boolean,lensCenter?:number[],region?:number')
s=s.replace('var drawRegion=0,surfaceRegion=0,','var drawLensCenter=/** @type {number[]|null} */(null);\n    var drawRegion=0,surfaceRegion=0,')
s=s.replace('entry.region=drawRegion;','entry.region=drawRegion;entry.lensCenter=drawLensCenter||origin;')
s=s.replace('drawIndex=0;drawRegion=0;','drawIndex=0;drawRegion=0;drawLensCenter=null;')
s=s.replace('region?:number}[]} */ var studyEffects','lensCenter?:number[],region?:number}[]} */ var studyEffects').replace('region?:number}[]} */ var studyActors','lensCenter?:number[],region?:number}[]} */ var studyActors')
s=s.replace('drawRegion=batch.region||0;','drawRegion=batch.region||0;drawLensCenter=batch.lensCenter||null;')
s=s.replace('drawRegion=0;\n      setUniform(\'Opacity\',1);','drawRegion=0;drawLensCenter=null;\n      setUniform(\'Opacity\',1);')
s=s.replace("drawRegion='region' in blast?Number(blast.region)||0:0;","drawRegion='region' in blast?Number(blast.region)||0:0;drawLensCenter=blast.position;")
p.write_text(s,encoding='utf-8',newline='\n')
p=Path('src/types.d.ts');s=p.read_text(encoding='utf-8').replace('setStudyActors: (batches: {region?:number;','setStudyActors: (batches: {lensCenter?:number[];region?:number;').replace('setStudyEffects: (batches: {region?:number;','setStudyEffects: (batches: {lensCenter?:number[];region?:number;');p.write_text(s,encoding='utf-8',newline='\n')
p=Path('experiments/flight-presentation.js');s=p.read_text(encoding='utf-8')
s=s.replace("var regions=DW.flightMissions.resolve(combat.mode).sky.wormhole?[0,1]:[0];","var regions=DW.flightMissions.resolve(combat.mode).sky.wormhole?[0,1]:[0],objectWarp=typeof location!=='undefined'&&new URLSearchParams(location.search).get('bridgeGeometry')==='objects';")
s=s.replace("            ['ally', 'enemy'].flatMap(function(team){return regions.map(function(region){return {team:team,region:region};});}).forEach(function (group) {", "            groups.forEach(function (group) {")
mark='            if (view.observerCraft) livingArt.push(view.observerCraft);'
s=s.replace(mark,mark+"\n            var groups=/** @type {{team:string;region:number;craft:ArtCraft[]}[]} */([]);\n            ['ally','enemy'].forEach(function(team){regions.forEach(function(region){var list=livingArt.filter(function(c){return (c.team||'enemy')===team&&(c.pose.region||0)===region;});if(objectWarp)list.forEach(function(c){groups.push({team:team,region:region,craft:[c]});});else groups.push({team:team,region:region,craft:list});});});")
s=s.replace("var craft = livingArt.filter(function (e) {\n                    return (e.team || 'enemy') === team&&(e.pose.region||0)===group.region;\n                })",'var craft = group.craft')
s=s.replace('actorBatches.push(Object.assign({},batch,{region:group.region}));','actorBatches.push(Object.assign({},batch,{region:group.region,lensCenter:objectWarp?craft[0].pose.eye:undefined}));')
a=s.index('                var craft = /** @type {ArtCraft[]} */ (DW.training.alive(combat).filter(');b=s.index('                if(!craft.length)return;',a)
s=s[:a]+"                var craft=group.craft.filter(function(c){return c.hp>0;});\n"+s[b:]
s=s.replace("engineParts.push(Object.assign({},DW.shipPackModels.engineGeometry(craft, team === 'ally' ? appearance.allyArt : appearance.enemyArt, combat.wave, units, state, world.elapsedSeconds),{region:group.region}));", "var engine=Object.assign({},DW.shipPackModels.engineGeometry(craft, team === 'ally' ? appearance.allyArt : appearance.enemyArt, combat.wave, units, state, world.elapsedSeconds),{region:group.region,lensCenter:objectWarp?craft[0].pose.eye:undefined});\n                if(objectWarp)effectBatches.push(engine);else engineParts.push(engine);")
s=s.replace('            regions.forEach(function(region){\n                var parts=engineParts','            if(!objectWarp)regions.forEach(function(region){\n                var parts=engineParts')
a=s.index('            regions.forEach(function(region){DW.flightGuns.geometry(');b=s.index('\n            groups.forEach',a)
old=s[a:b]
new="""            if(objectWarp){
                allGuns.bolts.forEach(function(b){DW.flightGuns.geometry({bolts:[b],impacts:[]},state).forEach(function(batch){effectBatches.push(Object.assign({},batch,{region:b.region||0,lensCenter:b.position}));});});
                allGuns.impacts.forEach(function(b){DW.flightGuns.geometry({bolts:[],impacts:[b]},state).forEach(function(batch){effectBatches.push(Object.assign({},batch,{region:b.region||0,lensCenter:b.position}));});});
            }else{
"""+old+"\n            }"
s=s[:a]+new+s[b:];p.write_text(s,encoding='utf-8',newline='\n')
