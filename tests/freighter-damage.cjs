'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {THREE:T,kit}=require('../tools/export-industrial-kit.cjs').loadKit();
const atlas=new T.Texture();kit.setSurfaceTexture(atlas);
const context={T,document:{createElement:()=>({width:0,height:0,getContext:()=>({fillRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){}})})}};
vm.createContext(context);vm.runInContext(fs.readFileSync('studies/freighter-effects.js','utf8').replace(/^import .*$/gm,'').replace(/^export /gm,''),context);
const signature=(g,i)=>{const p=g.attributes.position,n=g.attributes.normal,uv=g.attributes.uv,result=[];for(let j=i;j<i+3;j++)result.push(p.getX(j),p.getY(j),p.getZ(j),n.getX(j),n.getY(j),n.getZ(j),uv.getX(j),uv.getY(j));return JSON.stringify(result);};
const results=[];
for(const [point,normal] of [[[0,0,2.275],[0,0,1]],[[0,0,-2.275],[0,0,-1]],[[0,2.275,0],[0,1,0]],[[0,-2.275,0],[0,-1,0]],[[-5.07,0,1],[-1,0,0]],[[4.825,0,0],[1,0,0]]])for(let variant=0;variant<3;variant++){
 const group=kit.batchStatic(kit.part('cargo',{variant:2})),surfaceMeshes=group.children.slice(),bounds=new T.Box3().setFromObject(group),original=surfaceMeshes.map(mesh=>({mesh,geometry:mesh.geometry,material:mesh.material,triangles:new Set(Array.from({length:mesh.geometry.attributes.position.count/3},(_,i)=>signature(mesh.geometry,i*3)))}));
 const component={group,surfaceMeshes,center:new T.Vector3(),half:[0,1,2].map(k=>Math.max(Math.abs(bounds.min.getComponent(k)),Math.abs(bounds.max.getComponent(k)))),scorches:[],model:{id:'test-cargo'}};
 context.damageContainer(component,new T.Vector3(...point),new T.Vector3(...normal),variant);
 const stats=component.damageTriangles;assert(stats.added<=400,'Damage stays within a few hundred extra triangles');assert(stats.panel<=384);assert(stats.after>0);
 for(const item of original){
  assert.equal(item.mesh.material,item.material,'Original hardware/paint material is unchanged');
  if(!item.material.map)assert.equal(item.mesh.geometry,item.geometry,'Unpainted fittings keep their original geometry object');
  const geometry=item.mesh.geometry;for(let i=0;i<geometry.attributes.position.count;i+=3)assert(item.triangles.has(signature(geometry,i)),'Every retained triangle keeps exact positions, normals and UVs');
 }
 for(const mesh of surfaceMeshes){for(const attr of Object.values(mesh.geometry.attributes))assert([...attr.array].every(Number.isFinite));if(mesh.material.map)assert.equal(mesh.material.map,atlas,'Damaged panel shares the base paint atlas');}
 assert.equal(component.model.vertices.length/18,stats.after,'Collision mesh matches the final visual triangle count');
 results.push({face:normal.join(','),variant,added:stats.added,panel:stats.panel});kit.disposeBatch(group);
}
console.log('PASS panel-only freighter damage: <=400 added triangles, exact retained hardware/UVs/materials, shared atlas, finite geometry and matching collision mesh');
console.log(JSON.stringify(results));
