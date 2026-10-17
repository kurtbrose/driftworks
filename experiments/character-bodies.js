/** Continuous suit silhouettes in the source astronaut's Z-up mesh coordinates.
 * Rest joints, inverse bind matrices, weights and animation tracks stay intact.
 */
/** Slider ranges are artistic stress limits, not measured human percentiles. */
export const bodyControls = [
 {key:'height',name:'Height',min:.6,max:1.45,base:1},
 {key:'hips',name:'Hip width',min:-.3,max:.8,base:0},
 {key:'waist',name:'Waist / belly width',min:-.45,max:1.4,base:0},
 {key:'shoulders',name:'Shoulder width',min:-.35,max:.65,base:0},
 {key:'depth',name:'Torso / belly depth',min:-.35,max:1.8,base:0},
 {key:'chest',name:'Chest volume',min:-.2,max:.9,base:0}
];
export const bodyPresets = [
  {id:'original',name:'Original',height:1,hips:0,waist:0,shoulders:0,depth:0},
  {id:'feminine',name:'Feminine · balanced',height:1,hips:.09,waist:-.07,shoulders:-.07,depth:-.025},
  {id:'feminine-short',name:'Feminine · short',height:.94,hips:.11,waist:-.06,shoulders:-.08,depth:0},
  {id:'short',name:'Short · sturdy',height:.93,hips:.04,waist:.04,shoulders:.035,depth:.04},
  {id:'tall',name:'Tall',height:1.07,hips:0,waist:-.02,shoulders:0,depth:-.02},
  {id:'slight',name:'Slight',height:.98,hips:-.035,waist:-.06,shoulders:-.055,depth:-.05},
  {id:'broad',name:'Broad',height:1.02,hips:.05,waist:.06,shoulders:.08,depth:.07},
  {id:'feminine-pronounced',name:'Feminine · pronounced',height:1,hips:.26,waist:-.15,shoulders:-.12,depth:.02,chest:.32},
  {id:'full',name:'Full build',height:1,hips:.20,waist:.28,shoulders:.12,depth:.35,chest:.10},
  {id:'crew-short',name:'Short · range limit',height:.70,hips:.09,waist:0,shoulders:0,depth:.04},
  {id:'crew-tall',name:'Tall · range limit',height:1.30,hips:0,waist:0,shoulders:0,depth:0},
  {id:'feminine-extreme',name:'Stress · pronounced feminine',height:.96,hips:.65,waist:-.42,shoulders:-.30,depth:.08,chest:.75},
  {id:'shortest',name:'Stress · shortest',height:.6,hips:.12,waist:.1,shoulders:.08,depth:.1},
  {id:'tallest',name:'Stress · tallest',height:1.45,hips:-.04,waist:-.08,shoulders:-.04,depth:-.06},
  {id:'heaviest',name:'Stress · heaviest',height:1,hips:.7,waist:1.4,shoulders:.35,depth:1.8,chest:.4}

].map(p=>({...p,chest:p.chest||0}));
/** Conservative suit-deformation limits, relative to the original mesh. */
export const crewLimits={height:[.70,1.30],hips:[-.08,.30],waist:[-.18,.40],shoulders:[-.16,.25],depth:[-.12,.45],chest:[-.05,.35]};
/** @param {number} v @param {number[]} range */
function clampRange(v,range){return Math.max(range[0],Math.min(range[1],Number.isFinite(v)?v:0));}
/** Clamp combinations as well as individual knobs; idempotent and JSON-safe.
 * Ratios describe deformation multipliers, not anatomical measurements.
 * @param {typeof bodyPresets[number]} shape
 */
export function guardBody(shape){
 const p={...shape,height:clampRange(shape.height,crewLimits.height),hips:clampRange(shape.hips,crewLimits.hips),waist:clampRange(shape.waist,crewLimits.waist),shoulders:clampRange(shape.shoulders,crewLimits.shoulders),depth:clampRange(shape.depth,crewLimits.depth),chest:clampRange(shape.chest,crewLimits.chest)};
 // Avoid a pinched waist beneath oversized hips, or a belly much wider than the pelvis.
 p.waist=Math.max((1+p.hips)/1.5-1,Math.min((1+p.hips)*1.25-1,p.waist));
 // Keep shoulder-to-hip changes within a coherent silhouette.
 p.shoulders=Math.max((1+p.hips)*.68-1,Math.min((1+p.hips)*1.35-1,p.shoulders));
 // Avoid stacking maximum chest and belly expansion near the arms.
 p.chest=Math.min(p.chest,.65-p.depth);
 return p;
}
/** Return slider ranges for the selected mode. @param {boolean} stress */
export function controlsForMode(stress){return bodyControls.map(c=>{const limits=crewLimits[/** @type {keyof typeof crewLimits} */(c.key)];return {...c,min:stress?c.min:limits[0],max:stress?c.max:limits[1]};});}
/** Continuously sampled, correlated builds. Crew is a conservative artistic range.
 * @param {()=>number} [rng] @param {boolean} [stress]
 */
export function randomBody(rng=Math.random,stress=false){
 const between=(/** @type {number} */ a,/** @type {number} */ b)=>a+(b-a)*rng();
 if(stress){return {id:'custom',name:'Random stress',height:between(.6,1.45),hips:between(-.3,.8),waist:between(-.45,1.4),shoulders:between(-.35,.65),depth:between(-.35,1.8),chest:between(-.2,.9)};}
 const feminine=rng(),mass=between(-.12,.28);
 return guardBody({id:'custom',name:'Random crew',height:between(.88,1.12),hips:mass*.5+feminine*.22,waist:mass-feminine*.13,shoulders:mass*.35-feminine*.15,depth:mass*1.1,chest:feminine*.22});
}
/** @param {number} z @param {number} center @param {number} radius */
function bell(z,center,radius){const t=Math.max(0,1-Math.abs(z-center)/radius);return t*t*(3-2*t);}
/** Deform the rest mesh before ordinary linear blend skinning.
 * @param {number} x @param {number} y @param {number} z
 * @param {typeof bodyPresets[number]} preset
 */
export function shapePoint(x,y,z,preset){
  // Fade at the wrists; preserve helmet, boots and joint heights.
  const center=1-Math.min(1,Math.max(0,(Math.abs(x)-.002)/.004));
  const width=preset.hips*bell(z,.0087,.0025)+preset.waist*bell(z,.011,.0025)+preset.shoulders*bell(z,.0135,.0024);
  const depth=preset.depth*bell(z,.0105,.004)+preset.chest*bell(z,.0132,.0018);
  return [x*(1+width*center),y*(1+depth*center),z];
}

/** Minimal structural Three.js interfaces keep the pipeline renderer-independent.
 * @typedef {{count:number, getX(i:number):number, getY(i:number):number, getZ(i:number):number, setXYZ(i:number,x:number,y:number,z:number):unknown, needsUpdate:boolean}} BodyAttribute
 * @typedef {{attributes:{position:BodyAttribute,normal:BodyAttribute}, clone():BodyGeometry, computeVertexNormals():void, computeBoundingBox():void, computeBoundingSphere():void, dispose():void}} BodyGeometry
 * @typedef {{isSkinnedMesh?:boolean,geometry?:BodyGeometry,frustumCulled?:boolean,computeBoundingBox?:()=>void,computeBoundingSphere?:()=>void}} BodyNode
 * @typedef {{scale:{x:number,y:number,z:number,set(x:number,y:number,z:number):unknown},traverse(visit:(node:BodyNode)=>void):void,updateMatrixWorld(force:boolean):void}} BodyRoot
 */
/** Create one deformation controller per astronaut instance, before changing its shape.
 * Pass a dedicated, unanimated wrapper containing BOTH the mesh and its skeleton.
 * The caller owns the wrapper, animation mixer, source geometry and all other resources.
 * This controller owns geometry clones only; shared source assets remain untouched.
 * Input coordinates must match this astronaut's source Z-up mesh coordinates.
 * Crew/stress policy stays with the caller: pass guardBody(shape) for crew limits.
 * @param {BodyRoot} root
 */
export function createBodyModel(root){
 const scale={x:root.scale.x,y:root.scale.y,z:root.scale.z};
 /** @type {Map<BodyGeometry,{geometry:BodyGeometry,positions:Float32Array,normals:Float32Array}>} */
 const geometries=new Map();
 /** @type {{node:BodyNode,source:BodyGeometry,culled:boolean|undefined}[]} */
 const meshes=[];
 /** @param {BodyAttribute} attribute */
 function capture(attribute){const data=new Float32Array(attribute.count*3);for(let i=0;i<attribute.count;i++)data.set([attribute.getX(i),attribute.getY(i),attribute.getZ(i)],i*3);return data;}
 root.traverse(node=>{
  if(!node.isSkinnedMesh||!node.geometry)return;
  const source=node.geometry;
  let entry=geometries.get(source);
  if(!entry){const geometry=source.clone();entry={geometry,positions:capture(geometry.attributes.position),normals:capture(geometry.attributes.normal)};geometries.set(source,entry);}
  meshes.push({node,source,culled:node.frustumCulled});node.geometry=entry.geometry;
 });
 let disposed=false;
 /** @param {typeof bodyPresets[number]} shape */
 function apply(shape){
  if(disposed)throw Error('Body model has been disposed');
  const unshaped=shape.hips===0&&shape.waist===0&&shape.shoulders===0&&shape.depth===0&&shape.chest===0;
  root.scale.set(scale.x*shape.height,scale.y*shape.height,scale.z*shape.height);
  for(const {geometry,positions,normals} of geometries.values()){
   const position=geometry.attributes.position,normal=geometry.attributes.normal;
   for(let i=0;i<position.count;i++){
    const offset=i*3;
    const point=shapePoint(positions[offset],positions[offset+1],positions[offset+2],shape);
    position.setXYZ(i,point[0],point[1],point[2]);
   }
   position.needsUpdate=true;
   if(unshaped){for(let i=0;i<normal.count;i++)normal.setXYZ(i,normals[i*3],normals[i*3+1],normals[i*3+2]);normal.needsUpdate=true;}
   else geometry.computeVertexNormals();
   geometry.computeBoundingBox();geometry.computeBoundingSphere();
  }
  root.updateMatrixWorld(true);
  for(const {node,culled} of meshes){
   // Pose bounds become stale as animation advances; disable culling for shaped instances.
   node.frustumCulled=unshaped?culled:false;
   node.computeBoundingBox?.();node.computeBoundingSphere?.();
  }
 }
 function reset(){apply(bodyPresets[0]);}
 function dispose(){
  if(disposed)return;
  for(const {node,source,culled} of meshes){node.geometry=source;node.frustumCulled=culled;}
  root.scale.set(scale.x,scale.y,scale.z);root.updateMatrixWorld(true);
  for(const {node} of meshes){node.computeBoundingBox?.();node.computeBoundingSphere?.();}
  for(const {geometry} of geometries.values())geometry.dispose();
  geometries.clear();meshes.length=0;disposed=true;
 }
 return {apply,reset,dispose,meshCount:meshes.length};
}
