const assert=require('node:assert/strict');
const fs=require('node:fs');
(async()=>{
 const {bodyPresets,bodyControls,randomBody,shapePoint,guardBody,crewLimits,controlsForMode,createBodyModel}=await import('data:text/javascript;base64,'+fs.readFileSync('experiments/character-bodies.js').toString('base64'));
 for(const p of bodyPresets){
  for(const z of [0,.004,.0087,.011,.0135,.016,.019]){
   const v=shapePoint(.001,-.001,z,p),mirror=shapePoint(-.001,-.001,z,p);
   assert(v.every(Number.isFinite));assert.equal(v[2],z);assert.equal(v[0],-mirror[0]);
   assert(v[0]>.0003 && v[0]<.0035);
   if(z===0||z===.019)assert.deepEqual(v,[.001,-.001,z]);
   assert.deepEqual(shapePoint(.007,-.001,z,p),[.007,-.001,z],'Hands remain unchanged');
  }
 }
 const original=bodyPresets[0],feminine=bodyPresets[1];
 assert.deepEqual(shapePoint(.001,-.001,.011,original),[.001,-.001,.011]);
 assert(shapePoint(.001,0,.0087,feminine)[0]>.001);
 assert(shapePoint(.001,0,.0135,feminine)[0]<.001);
 assert(shapePoint(.001,0,.011,feminine)[0]<.001);
 // Exercise every corner of the continuous domain, including combined extremes.
 for(let mask=0;mask<64;mask++){
  const p={...original};bodyControls.forEach((c,i)=>p[c.key]=(mask&(1<<i))?c.max:c.min);
  const guarded=guardBody(p);
  assert.deepEqual(guardBody(guarded),guarded,'Guarding twice must not drift');
  for(const c of bodyControls){const [min,max]=crewLimits[c.key];assert(guarded[c.key]>=min-1e-9&&guarded[c.key]<=max+1e-9);}
  assert((1+guarded.hips)/(1+guarded.waist)<=1.5+1e-9);
  assert((1+guarded.waist)/(1+guarded.hips)<=1.25+1e-9);
  assert((1+guarded.shoulders)/(1+guarded.hips)>=.68-1e-9);
  assert((1+guarded.shoulders)/(1+guarded.hips)<=1.35+1e-9);
  assert(guarded.chest+guarded.depth<=.65+1e-9);
  for(let z=0;z<=.019;z+=.00025){const v=shapePoint(.001,-.001,z,p);assert(v.every(Number.isFinite));assert(v[0]>0);assert(v[1]<0);}
 }
 for(const stress of [false,true])for(const value of [0,.123456,.5,1]){
  const p=randomBody(()=>value,stress);
  for(const c of bodyControls)assert(p[c.key]>=c.min-1e-9&&p[c.key]<=c.max+1e-9,c.key);
 }
 assert.deepEqual(guardBody(original),original);
 assert.equal(controlsForMode(false)[0].min,.7);assert.equal(controlsForMode(true)[0].min,.6);
 for(const p of bodyPresets.filter(p=>!p.name.startsWith('Stress')))assert.deepEqual(guardBody(p),p,p.id+' is already inside crew limits');
 const a={...original,hips:.1},b={...original,hips:.2},mid={...original,hips:.15};
 assert(Math.abs(shapePoint(.001,0,.0087,mid)[0]-(shapePoint(.001,0,.0087,a)[0]+shapePoint(.001,0,.0087,b)[0])/2)<1e-12,'Continuous interpolation');
 assert(Math.abs(randomBody(()=>.123456).height-(.88+.24*.123456))<1e-12);

 class Attribute{
  constructor(values){this.array=new Float32Array(values);this.count=values.length/3;this.needsUpdate=false;}
  getX(i){return this.array[i*3];}getY(i){return this.array[i*3+1];}getZ(i){return this.array[i*3+2];}
  setXYZ(i,x,y,z){this.array.set([x,y,z],i*3);}
 }
 class Geometry{
  constructor(){this.attributes={position:new Attribute([.001,-.001,.0087,.001,-.001,.0135]),normal:new Attribute([0,1,0,0,1,0]),skinIndex:new Uint16Array([0,1]),skinWeight:new Float32Array([1,1])};this.bounds=0;this.spheres=0;this.disposals=0;this.normalUpdates=0;}
  clone(){const g=new Geometry();g.attributes.position=new Attribute(this.attributes.position.array);g.attributes.normal=new Attribute(this.attributes.normal.array);return g;}
  computeVertexNormals(){this.normalUpdates++;this.attributes.normal.array.fill(.5);this.attributes.normal.needsUpdate=true;}
  computeBoundingBox(){this.bounds++;}computeBoundingSphere(){this.spheres++;}dispose(){this.disposals++;}
 }
 const source=new Geometry(),sourcePositions=source.attributes.position.array.slice(),sourceNormals=source.attributes.normal.array.slice();
 const skeleton={bones:['hips','chest']},bindMatrix={unchanged:true};
 function rootFor(){
  const nodes=[true,false].map(frustumCulled=>({isSkinnedMesh:true,geometry:source,frustumCulled,skeleton,bindMatrix,bounds:0,computeBoundingBox(){this.bounds++;},computeBoundingSphere(){this.bounds++;}}));
  // An ordinary mesh is outside this pipeline's scope.
  const prop={geometry:source,frustumCulled:true};
  return {nodes,prop,updates:0,scale:{x:2,y:3,z:4,set(x,y,z){Object.assign(this,{x,y,z});}},traverse(fn){nodes.forEach(fn);fn(prop);},updateMatrixWorld(){this.updates++;}};
 }
 const root=rootFor(),otherRoot=rootFor(),model=createBodyModel(root),otherModel=createBodyModel(otherRoot);
 assert.equal(model.meshCount,2);
 const owned=root.nodes[0].geometry;
 assert.notEqual(owned,source);assert.equal(root.nodes[1].geometry,owned,'Shared primitives use one owned clone');
 assert.notEqual(otherRoot.nodes[0].geometry,owned,'Instances own independent geometry');
 assert.equal(root.prop.geometry,source);
 const tallFeminine={...feminine,height:1.3};
 model.apply(tallFeminine);const first=owned.attributes.position.array.slice();
 model.apply(bodyPresets.find(p=>p.id==='full'));model.apply(tallFeminine);
 assert.deepEqual(owned.attributes.position.array,first,'Shape changes do not accumulate');
 assert.deepEqual([root.scale.x,root.scale.y,root.scale.z],[2*1.3,3*1.3,4*1.3]);
 assert(root.nodes.every(n=>n.frustumCulled===false&&n.bounds>0));
 assert(owned.bounds>0&&owned.spheres>0&&owned.normalUpdates>0&&owned.attributes.position.needsUpdate);
 assert.deepEqual(source.attributes.position.array,sourcePositions);assert.deepEqual(source.attributes.normal.array,sourceNormals);
 assert.deepEqual(otherRoot.nodes[0].geometry.attributes.position.array,sourcePositions);
 for(const n of root.nodes){assert.equal(n.skeleton,skeleton);assert.equal(n.bindMatrix,bindMatrix);}
 assert.deepEqual(owned.attributes.skinIndex,source.attributes.skinIndex);assert.deepEqual(owned.attributes.skinWeight,source.attributes.skinWeight);
 // A custom neutral shape must restore source normals, regardless of its UI id.
 model.apply({...original,id:'custom'});assert.deepEqual(owned.attributes.normal.array,sourceNormals);
 model.apply(tallFeminine);model.reset();
 assert.deepEqual(owned.attributes.position.array,sourcePositions);assert.deepEqual(owned.attributes.normal.array,sourceNormals);
 assert.deepEqual(root.nodes.map(n=>n.frustumCulled),[true,false]);assert.deepEqual([root.scale.x,root.scale.y,root.scale.z],[2,3,4]);
 model.apply(tallFeminine);model.dispose();model.dispose();
 assert(root.nodes.every(n=>n.geometry===source));assert.equal(owned.disposals,1);assert.equal(source.disposals,0);
 assert.deepEqual(root.nodes.map(n=>n.frustumCulled),[true,false]);assert.deepEqual([root.scale.x,root.scale.y,root.scale.z],[2,3,4]);
 assert.throws(()=>model.apply(original),/disposed/);otherModel.dispose();
 console.log('PASS body variants: continuous edits, crew guardrails and ratios, idempotent clamping, original restoration');
})().catch(error=>{console.error(error);process.exitCode=1;});
