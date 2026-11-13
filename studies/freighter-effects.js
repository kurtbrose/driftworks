import * as T from 'three';

export const damageNames=['Buckled panel','Crushed corner','Split seam'];
const wearMaps=[],wearMaterials=new WeakMap();
const innerMaterial=new T.MeshStandardMaterial({color:0x23292b,roughness:.95,metalness:.3});
function wearMap(variant){
 if(wearMaps[variant])return wearMaps[variant];
 const canvas=document.createElement('canvas');canvas.width=canvas.height=256;const c=canvas.getContext('2d');
 let seed=91+variant*71;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 for(let i=0;i<110;i++){
  const x=random()*256,y=random()*256;c.fillStyle=i%3?'rgba(86,89,85,.45)':'rgba(29,33,34,.6)';
  c.fillRect(x,y,1+random()*2,2+random()*13);
 }
 for(let i=0;i<5;i++){
  const x=22+i*48+variant*7;c.strokeStyle='rgba(18,23,25,.65)';c.lineWidth=variant===2?2.1:1.1;c.beginPath();c.moveTo(x,110);
  for(let j=0;j<7;j++)c.lineTo(x+(random()-.5)*14,110+j*15);c.stroke();
  c.strokeStyle='rgba(171,171,154,.35)';c.lineWidth=.7;c.stroke();
 }
 const texture=new T.CanvasTexture(canvas);texture.wrapS=texture.wrapT=T.RepeatWrapping;wearMaps[variant]=texture;return texture;
}
function wornMaterial(source,variant){
 let variants=wearMaterials.get(source);if(!variants){variants=[];wearMaterials.set(source,variants);}if(variants[variant])return variants[variant];
 const material=source.clone(),map=wearMap(variant);
 material.onBeforeCompile=shader=>{
  shader.uniforms.rangeWear={value:map};shader.fragmentShader='uniform sampler2D rangeWear;\n'+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','#include <map_fragment>\nvec4 wear=texture2D(rangeWear,fract(vMapUv*vec2(8.,6.)));diffuseColor.rgb=mix(diffuseColor.rgb,wear.rgb,wear.a);');
 };
 material.customProgramCacheKey=()=> 'freighter-shared-wear-v1';variants[variant]=material;return material;
}
// Split out one coplanar painted panel. Hardware and other faces retain their
// original attributes; the selected panel has a fixed, small triangle budget.
function damagedGeometry(source,selected,level,warp,cut){
 const p=source.attributes.position,uv=source.attributes.uv,n=source.attributes.normal,positions=[],uvs=[],restPositions=[],restUvs=[],restNormals=[];
 const vertex=i=>({p:new T.Vector3().fromBufferAttribute(p,i),uv:new T.Vector2().fromBufferAttribute(uv,i)});
 const mid=(a,b)=>({p:a.p.clone().add(b.p).multiplyScalar(.5),uv:a.uv.clone().add(b.uv).multiplyScalar(.5)});
 function triangle(a,b,c,depth){
  if(depth<level){const ab=mid(a,b),bc=mid(b,c),ca=mid(c,a);triangle(a,ab,ca,depth+1);triangle(ab,b,bc,depth+1);triangle(ca,bc,c,depth+1);triangle(ab,bc,ca,depth+1);return;}
  if(cut(a.p.clone().add(b.p).add(c.p).multiplyScalar(1/3)))return;
  for(const v of [a,b,c]){const q=warp(v.p);positions.push(q.x,q.y,q.z);uvs.push(v.uv.x,v.uv.y);}
 }
 for(let i=0;i<p.count;i+=3){
  if(selected(i)){triangle(vertex(i),vertex(i+1),vertex(i+2),0);continue;}
  for(let j=i;j<i+3;j++){restPositions.push(p.getX(j),p.getY(j),p.getZ(j));restUvs.push(uv.getX(j),uv.getY(j));restNormals.push(n.getX(j),n.getY(j),n.getZ(j));}
 }
 function geometry(points,texcoords,normals){const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(points,3));g.setAttribute('uv',new T.Float32BufferAttribute(texcoords,2));if(normals)g.setAttribute('normal',new T.Float32BufferAttribute(normals,3));else g.computeVertexNormals();g.computeBoundingSphere();return g;}
 return {panel:geometry(positions,uvs),rest:geometry(restPositions,restUvs,restNormals)};
}
export function damageContainer(component,point,normal,variant){
 if(component.damageName)return point;
 const hit=point.clone().sub(component.center),dominant=[0,1,2].sort((a,b)=>Math.abs(normal.getComponent(b))-Math.abs(normal.getComponent(a)))[0],n=new T.Vector3().setComponent(dominant,Math.sign(normal.getComponent(dominant)));
 const axis=Math.abs(n.x)<.8?new T.Vector3(1,0,0):new T.Vector3(0,0,1),t=axis.addScaledVector(n,-axis.dot(n)).normalize(),b=new T.Vector3().crossVectors(n,t);
 const planes=new Map(),selectedTriangles=new Map();
 let before=0;
 for(const mesh of component.surfaceMeshes){
  const p=mesh.geometry.attributes.position,normals=mesh.geometry.attributes.normal;before+=p.count/3;if(!mesh.material.map)continue;
  for(let i=0;i<p.count;i+=3){
   const face=new T.Vector3().fromBufferAttribute(normals,i);if(face.dot(n)<.999)continue;
   const a=new T.Vector3().fromBufferAttribute(p,i),q=new T.Vector3().fromBufferAttribute(p,i+1),r=new T.Vector3().fromBufferAttribute(p,i+2),plane=Math.round(a.dot(n)*1000)/1000,key=String(plane);
   let bucket=planes.get(key);if(!bucket){bucket={plane,area:0,triangles:[]};planes.set(key,bucket);}
   bucket.area+=q.sub(a).cross(r.sub(a)).length()*.5;bucket.triangles.push({mesh,offset:i});
  }
 }
 const panel=[...planes.values()].sort((a,b)=>b.area/(1+100*(b.plane-hit.dot(n))**2)-a.area/(1+100*(a.plane-hit.dot(n))**2))[0];
 if(!panel)return point;
 const level=Math.min(3,Math.max(0,Math.floor(Math.log(384/panel.triangles.length)/Math.log(4))));
 const extents=[Infinity,-Infinity,Infinity,-Infinity];
 for(const tri of panel.triangles){let offsets=selectedTriangles.get(tri.mesh);if(!offsets){offsets=new Set();selectedTriangles.set(tri.mesh,offsets);}offsets.add(tri.offset);
  const p=tri.mesh.geometry.attributes.position;for(let i=tri.offset;i<tri.offset+3;i++){const v=new T.Vector3().fromBufferAttribute(p,i),u=v.dot(t),w=v.dot(b);extents[0]=Math.min(extents[0],u);extents[1]=Math.max(extents[1],u);extents[2]=Math.min(extents[2],w);extents[3]=Math.max(extents[3],w);}
 }
 const anchor=variant===1?new T.Vector3(...component.half.map((h,k)=>Math.sign(hit.getComponent(k)||1)*h*.88)):hit.clone();
 const coordinates=p=>{const d=p.clone().sub(anchor);return [d.dot(t),d.dot(b),d.dot(n)];};
 const warp=p=>{
  if(Math.abs(p.dot(n)-panel.plane)>.08)return p.clone();
  const [u,v,depth]=coordinates(p),weight=Math.max(0,1-(u/3.8)**2-(v/2.6)**2)*Math.exp(-Math.abs(depth)/.6),q=p.clone();
  const clamp=x=>Math.max(0,Math.min(1,x)),s=p.dot(t),w=p.dot(b),rim=clamp((s-extents[0])/.35)*clamp((extents[1]-s)/.35)*clamp((w-extents[2])/.35)*clamp((extents[3]-w)/.35);
  const dent=variant===0?.48*(.6+.4*Math.cos(u*2.5)):variant===1?.7:.28;
  q.addScaledVector(n,-dent*weight*rim);
  if(variant===2){q.addScaledVector(t,Math.sign(u)*.16*weight*rim);q.addScaledVector(b,Math.sin(u*2.6)*.16*weight*rim);}return q;
 };
 const cut=p=>{const [u,v,depth]=coordinates(p);return variant===2&&Math.abs(p.dot(n)-panel.plane)<.08&&Math.abs(depth)<.4&&Math.abs(u)<.38&&Math.abs(v)<1.35;};
 for(const [mesh,offsets] of selectedTriangles){
  const original=mesh.geometry,parts=damagedGeometry(original,i=>offsets.has(i),level,warp,cut);mesh.geometry=parts.rest;original.dispose();
  const skin=new T.Mesh(parts.panel,wornMaterial(mesh.material,variant));component.group.add(skin);component.surfaceMeshes.push(skin);
 }
 if(variant===2){const liner=new T.Mesh(new T.BoxGeometry(...component.half.map((h,k)=>Math.max(.2,h-(k?.9:.6))*2)).toNonIndexed(),innerMaterial);component.group.add(liner);component.surfaceMeshes.push(liner);}
 for(const mark of component.scorches)mark.layers=mark.layers.map(layer=>{
  const result=[];for(let i=0;i<layer.length;i+=18){const center=new T.Vector3();for(let j=0;j<3;j++)center.add(new T.Vector3(...layer.slice(i+j*6,i+j*6+3)));if(cut(center.multiplyScalar(1/3)))continue;
   for(let j=0;j<3;j++){const offset=i+j*6,q=warp(new T.Vector3(...layer.slice(offset,offset+3)));result.push(q.x,q.y,q.z,...layer.slice(offset+3,offset+6));}}
  return result;
 });
 const vertices=[],bounds=new T.Box3();
 for(const mesh of component.surfaceMeshes){const p=mesh.geometry.attributes.position,normals=mesh.geometry.attributes.normal;for(let i=0;i<p.count;i++){vertices.push(p.getX(i),p.getY(i),p.getZ(i),normals.getX(i),normals.getY(i),normals.getZ(i));bounds.expandByPoint(new T.Vector3().fromBufferAttribute(p,i));}}
 component.model={id:component.model.id,vertices};component.damageTriangles={before,after:vertices.length/18,added:vertices.length/18-before,panel:panel.triangles.length*4**level,untouched:before-panel.triangles.length};component.half=component.half.map((h,k)=>Math.max(h,Math.abs(bounds.min.getComponent(k)),Math.abs(bounds.max.getComponent(k))));
 component.damageName=damageNames[variant];component.group.updateMatrixWorld(true);
 const ray=new T.Raycaster(point.clone().addScaledVector(n,1.2),n.clone().negate(),0,3),surface=ray.intersectObjects(component.surfaceMeshes,false)[0];
 return surface?surface.point:warp(hit).add(component.center);
}

export function createVents(scene){
 const capacity=128,positions=new Float32Array(capacity*3),sizes=new Float32Array(capacity),alphas=new Float32Array(capacity),geometry=new T.BufferGeometry();
 geometry.setAttribute('position',new T.BufferAttribute(positions,3).setUsage(T.DynamicDrawUsage));geometry.setAttribute('puffSize',new T.BufferAttribute(sizes,1).setUsage(T.DynamicDrawUsage));geometry.setAttribute('puffAlpha',new T.BufferAttribute(alphas,1).setUsage(T.DynamicDrawUsage));
 const canvas=document.createElement('canvas');canvas.width=canvas.height=64;const c=canvas.getContext('2d'),gradient=c.createRadialGradient(32,32,2,32,32,32);gradient.addColorStop(0,'rgba(230,244,250,.8)');gradient.addColorStop(.38,'rgba(210,230,240,.45)');gradient.addColorStop(1,'rgba(205,224,236,0)');c.fillStyle=gradient;c.fillRect(0,0,64,64);
 const material=new T.ShaderMaterial({uniforms:{puffMap:{value:new T.CanvasTexture(canvas)},viewportHeight:{value:900}},transparent:true,depthTest:true,depthWrite:false,
  vertexShader:'attribute float puffSize;attribute float puffAlpha;uniform float viewportHeight;varying float alpha;void main(){vec4 p=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*p;gl_PointSize=clamp(puffSize*projectionMatrix[1][1]*viewportHeight/max(1.,-p.z),1.,128.);alpha=puffAlpha;}',
  fragmentShader:'uniform sampler2D puffMap;varying float alpha;void main(){vec4 puff=texture2D(puffMap,gl_PointCoord);gl_FragColor=vec4(puff.rgb,puff.a*alpha);if(gl_FragColor.a<.005)discard;}' });
 const cloud=new T.Points(geometry,material);cloud.frustumCulled=false;cloud.renderOrder=20;cloud.visible=false;scene.add(cloud);
 let leaks=[],particles=[],serial=0,enabled=true;
 function add(component,point,normal){
  const local=point.clone().sub(component.center);if(leaks.some(l=>l.component===component&&l.local.distanceTo(local)<.35))return;
  leaks.push({component,local,normal:normal.clone(),age:0,budget:0});if(leaks.length>12)leaks.shift();
 }
 function clear(){leaks=[];particles=[];alphas.fill(0);cloud.visible=false;}
 function step(dt,acceleration,height){
  material.uniforms.viewportHeight.value=height;
  if(!enabled){cloud.visible=false;return;}
  leaks=leaks.filter(l=>l.age<14&&(l.component.hp>0||!!l.component.group.parent));
  for(const leak of leaks){
   leak.age+=dt;const component=leak.component,q=component.group.quaternion,normal=leak.normal.clone().applyQuaternion(q),origin=leak.local.clone().applyQuaternion(q).add(component.group.position).addScaledVector(normal,.06);
   leak.budget+=dt*14*Math.exp(-leak.age/9);
   while(leak.budget>=1){leak.budget--;const i=serial++,jitter=new T.Vector3(Math.sin(i*17.3),Math.cos(i*9.7),Math.sin(i*5.1)).multiplyScalar(.3);
    particles.push({position:origin.clone(),velocity:normal.clone().multiplyScalar(3.6).add(jitter).add(component.hp<=0?component.velocity:new T.Vector3()),age:0,life:1.4+(i%7)*.09});if(particles.length>capacity)particles.shift();}
  }
  particles=particles.filter(p=>p.age<p.life);alphas.fill(0);
  particles.forEach((p,i)=>{p.age+=dt;p.velocity.x+=acceleration*dt;p.position.addScaledVector(p.velocity,dt);positions.set(p.position.toArray(),i*3);sizes[i]=.16+p.age*.56;alphas[i]=Math.sin(Math.min(1,p.age/p.life)*Math.PI)*.38;});
  geometry.attributes.position.needsUpdate=geometry.attributes.puffSize.needsUpdate=geometry.attributes.puffAlpha.needsUpdate=true;geometry.setDrawRange(0,particles.length);cloud.visible=particles.length>0;
 }
 return {add,step,clear,setEnabled:value=>{enabled=value;if(!value){particles=[];alphas.fill(0);cloud.visible=false;}},stats:()=>({leaks:leaks.length,particles:particles.length,capacity})};
}
