import * as T from 'three';

// Metres; +X is aft, +Y is up. Connections lie on the longitudinal X axis.
export const dimensions = { cabin:[8,4.4,5], truss:[12,5,5], cargo:[10,5,5], tank:[10,10,10], engine:[7,4,4], coupler:[2,2,2] };
const colors={ivory:0xd7d6c9,steel:0x333e43,edge:0x697276,ochre:0xc28a32,glass:0x193f50,rust:0x965b40,blue:0x526f80,nozzle:0x172429};
const materials=Object.fromEntries(Object.entries(colors).map(([k,c])=>[k,new T.MeshStandardMaterial({color:c,roughness:.76,metalness:k==='steel'||k==='edge'?.65:.25})]));
const geometries=new Map();
function geometry(key,make){if(!geometries.has(key))geometries.set(key,make());return geometries.get(key);}
function mesh(g,geo,mat,p=[0,0,0]){const m=new T.Mesh(geo,materials[mat]);m.position.set(...p);g.add(m);return m;}
function box(g,s,p,mat='ivory'){return mesh(g,geometry('b'+s.join(','),()=>new T.BoxGeometry(...s)),mat,p);}
function cylinder(g,r1,r2,length,p,mat='steel',axis='x') {const m=mesh(g,geometry(['c',r1,r2,length].join(','),()=>new T.CylinderGeometry(r1,r2,length,16)),mat,p);if(axis==='x')m.rotation.z=-Math.PI/2;return m;}
function beam(g,a,b,r=.12,mat='steel'){const av=new T.Vector3(...a),bv=new T.Vector3(...b),d=bv.clone().sub(av);const m=mesh(g,geometry('beam'+r,()=>new T.CylinderGeometry(r,r,1,6)),mat);m.position.copy(av.add(bv).multiplyScalar(.5));m.scale.y=d.length();m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),d.normalize());}
function ring(g,x,r,mat='ochre'){const m=mesh(g,geometry('ring'+r,()=>new T.TorusGeometry(r,.12,6,32)),mat,[x,0,0]);m.rotation.y=Math.PI/2;}
function cabin(g){
  box(g,[7,3.8,4.8],[0,0,0]);box(g,[7.5,.35,5.1],[0,-2,0],'steel');box(g,[5.8,.22,4.9],[.3,2,0],'ochre');
  box(g,[.12,1.45,3.8],[-3.56,.55,0],'glass');
  for(const z of [-2.43,2.43])for(const x of [-2.3,-.5,1.3])box(g,[1.3,1.25,.12],[x,.55,z],'glass');
  for(const z of [-1,1])box(g,[.15,1.5,.12],[-3.65,.55,z],'ivory');
  box(g,[1.1,2.5,.16],[2.35,-.3,2.5],'steel');box(g,[.8,2.1,.18],[2.35,-.3,2.6],'edge');
  box(g,[2,.35,1.5],[1,2.2,0],'edge');beam(g,[1,2.4,0],[1,5,0],.045,'edge');
  for(const z of [-1.8,1.8])box(g,[2,.15,.4],[-.5,-1.1,z],'ochre');
}
function truss(g){
  for(const y of [-2.5,2.5])for(const z of [-2.5,2.5])beam(g,[-6,y,z],[6,y,z],.17);
  for(const x of [-6,-2,2,6]){
    for(const y of [-2.5,2.5])beam(g,[x,y,-2.5],[x,y,2.5],.12,'edge');
    for(const z of [-2.5,2.5])beam(g,[x,-2.5,z],[x,2.5,z],.12,'edge');
  }
  for(let x=-6;x<6;x+=4)for(const z of [-2.5,2.5])beam(g,[x,-2.5,z],[x+4,2.5,z],.13,'edge');
  for(let x=-6;x<6;x+=4)beam(g,[x,2.5,-2.5],[x+4,2.5,2.5],.12);
  cylinder(g,.38,.38,12,[0,-1.4,0],'ochre');
}
function cargo(g){
  box(g,[9.6,4.6,4.6],[0,0,0]);
  for(const x of [-4.8,4.8]){box(g,[.24,5,5],[x,0,0],'steel');for(const y of [-2.2,2.2])for(const z of [-2.2,2.2])box(g,[.5,.55,.55],[x,y,z],'ochre');}
  for(const x of [-2,1.5]){box(g,[.10,4.65,4.65],[x,0,0],'edge');}
  box(g,[2.5,4.62,4.62],[2.9,0,0],'blue');
  for(const z of [-2.35,2.35])box(g,[.1,3.5,.1],[4,0,z],'ochre');
}
function tank(g){
  mesh(g,geometry('sphere',()=>new T.SphereGeometry(4.6,24,16)),'ivory');
  for(const x of [-2.5,0,2.5])ring(g,x,Math.sqrt(4.6**2-x*x)+.04,x===0?'ochre':'edge');
  for(const x of [-5,5])cylinder(g,.9,.9,1,[x,0,0],'steel');
  for(const y of [-4.9,4.9])for(const z of [-4.9,4.9])beam(g,[-6,y,z],[6,y,z],.13);
  for(const x of [-6,6])for(const y of [-4.9,4.9])beam(g,[x,y,-4.9],[x,y,4.9],.13,'edge');
  beam(g,[-5,4.9,0],[5,4.9,0],.1,'ochre');
}
function engine(g){
  cylinder(g,1.55,1.55,4,[-1,0,0],'ivory');
  for(const x of [-2.8,-1,1])cylinder(g,1.7,1.7,.3,[x,0,0],'steel');
  cylinder(g,2,1.35,2,[2,0,0],'edge');cylinder(g,1.75,1.75,.12,[3.05,0,0],'nozzle');
  cylinder(g,.9,.9,.14,[3.13,0,0],'steel');
  for(const z of [-1.4,1.4])box(g,[3.5,.35,.4],[-1,0,z],'ochre');
  box(g,[3,.6,2],[-1,-1.8,0],'steel');
}
function coupler(g){cylinder(g,.72,.72,2,[0,0,0]);for(const x of [-.8,.8])cylinder(g,1.2,1.2,.22,[x,0,0],'ochre');}
const builders={cabin,truss,cargo,tank,engine,coupler};
export function part(name){if(!builders[name])throw new Error('Unknown industrial part: '+name);const g=new T.Group();g.name=name;builders[name](g);return g;}
export function assembly(kind){
  const g=new T.Group();g.name=kind;
  function add(name,x,y=0,z=0){const p=part(name);p.position.set(x,y,z);g.add(p);return p;}
  if(kind==='kit'){Object.keys(builders).forEach((name,i)=>add(name,(i%3-1)*19,0,(Math.floor(i/3)-.5)*19));return g;}
  add('cabin',-12);add('coupler',-7);
  const bays=kind==='tug'?1:3;
  for(let i=0;i<bays;i++){
    const x=i*12;
    if(kind==='tanker')add('tank',x);
    else {add('truss',x);if(kind==='hauler')for(const z of [-5.2,5.2])add('cargo',x,0,z);}
  }
  const aft=bays*12-5;
  box(g,[1.2,7,7],[aft,0,0],'steel');
  for(const y of [-2.2,2.2])for(const z of [-2.2,2.2])add('engine',aft+4,y,z);
  if(kind==='tug'){add('cargo',0,-5.1,0);add('coupler',-17);}
  return g;
}

// Portable glTF with embedded binary data; retain named part transforms and materials.
export function exportGLTF(root){
  const doc={asset:{version:'2.0',generator:'Driftworks industrial kit'},scene:0,scenes:[{nodes:[]}],nodes:[],meshes:[],materials:[],buffers:[],bufferViews:[],accessors:[]};
  const chunks=[];let bytes=0;const matMap=new Map();
  function accessor(array,type,target){const a=Float32Array.from(array);const view=doc.bufferViews.push({buffer:0,byteOffset:bytes,byteLength:a.byteLength,target})-1;chunks.push(new Uint8Array(a.buffer));bytes+=a.byteLength;const item={bufferView:view,componentType:5126,count:a.length/(type==='VEC3'?3:2),type};if(type==='VEC3'){item.min=[Infinity,Infinity,Infinity];item.max=[-Infinity,-Infinity,-Infinity];for(let i=0;i<a.length;i++) {const j=i%3;item.min[j]=Math.min(item.min[j],a[i]);item.max[j]=Math.max(item.max[j],a[i]);}}return doc.accessors.push(item)-1;}
  function visit(obj){const node={name:obj.name||'detail',translation:obj.position.toArray(),rotation:obj.quaternion.toArray(),scale:obj.scale.toArray()};const index=doc.nodes.push(node)-1;
    if(obj.isMesh){const geo=obj.geometry.index?obj.geometry.toNonIndexed():obj.geometry;const mat=obj.material;if(!matMap.has(mat)){matMap.set(mat,doc.materials.length);doc.materials.push({name:Object.keys(materials).find(k=>materials[k]===mat),pbrMetallicRoughness:{baseColorFactor:[...mat.color.toArray(),1],metallicFactor:mat.metalness,roughnessFactor:mat.roughness}});}node.mesh=doc.meshes.push({primitives:[{attributes:{POSITION:accessor(geo.attributes.position.array,'VEC3',34962),NORMAL:accessor(geo.attributes.normal.array,'VEC3',34962)},material:matMap.get(mat)}]})-1;}
    if(obj.children.length)node.children=obj.children.map(visit);return index;
  }
  doc.scenes[0].nodes.push(visit(root));const buffer=new Uint8Array(bytes);let offset=0;for(const c of chunks){buffer.set(c,offset);offset+=c.length;}let binary='';for(const b of buffer)binary+=String.fromCharCode(b);doc.buffers.push({byteLength:bytes,uri:'data:application/octet-stream;base64,'+btoa(binary)});return JSON.stringify(doc);
}
