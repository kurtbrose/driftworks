import * as T from 'three';

// Metres; +X aft, +Y up, +Z starboard. Named groups retain module/joint pivots.
export const dimensions={cabin:[8,4.4,5],truss:[12,5,5],cargo:[10,5,5],tank:[12,10,10],engine:[8,4.4,4.4],coupler:[2,2.4,2.4],service:[4,3,3],crane:[11,9,3],rcs:[2,2,2],bulkTank:[28,14,16],latticeCrane:[21,14,6]};
export const shipNames=['tug','hauler','tanker','salvager','bulkCarrier'];
const tiles={ivory:0,cabin:1,cargo:2,ochrePaint:3,rust:4,blue:5,service:6,door:7,hazard:8,vent:9,radiator:10,tank:11,dark:12,deck:13,registry:14,patch:15,bulk:15};
const materials={
  paint:new T.MeshStandardMaterial({color:0xffffff,roughness:.8,metalness:.22}),
  steel:new T.MeshStandardMaterial({color:0x323d40,roughness:.67,metalness:.65}),
  edge:new T.MeshStandardMaterial({color:0x677070,roughness:.52,metalness:.7}),
  rubber:new T.MeshStandardMaterial({color:0x1d2527,roughness:.94}),
  ochre:new T.MeshStandardMaterial({color:0xb1823b,roughness:.65,metalness:.35}),
  glass:new T.MeshStandardMaterial({color:0x193b4a,roughness:.23,metalness:.6,emissive:0x19323c,emissiveIntensity:.22}),
  warm:new T.MeshStandardMaterial({color:0xffce7e,emissive:0xffb454,emissiveIntensity:1.6,roughness:.5}),
  cool:new T.MeshStandardMaterial({color:0xb2d1d5,emissive:0x81aebd,emissiveIntensity:.6}),
  hot:new T.MeshStandardMaterial({color:0x40332c,emissive:0xb15b29,emissiveIntensity:.24,roughness:.8,metalness:.5})
};
const geometries=new Map();
let atlasURI=null;
export function setSurfaceTexture(texture,uri){texture.colorSpace=T.SRGBColorSpace;texture.anisotropy=8;materials.paint.map=texture;materials.paint.needsUpdate=true;atlasURI=uri;}
function geometry(key,make){if(!geometries.has(key))geometries.set(key,make());return geometries.get(key);}
function mesh(g,geo,mat,p=[0,0,0],name=mat){const m=new T.Mesh(geo,materials[mat]);m.name=name;m.position.set(...p);m.castShadow=true;m.receiveShadow=true;g.add(m);return m;}

// Closed chamfered cuboid: six faces, twelve bevels, eight corner triangles.
// Hard face normals retain machined edges; UVs address the shared paint atlas.
function chamferGeometry(size,b,tile){
  const h=size.map(v=>v/2),a=h.map(v=>v-b),vertices=[],normals=[],uvs=[],indices=[];
  function face(points,edge=false){
    const normal=new T.Vector3().subVectors(new T.Vector3(...points[1]),new T.Vector3(...points[0])).cross(new T.Vector3().subVectors(new T.Vector3(...points[2]),new T.Vector3(...points[0]))).normalize();
    const center=new T.Vector3();points.forEach(p=>center.add(new T.Vector3(...p)));if(normal.dot(center)<0){points=points.slice().reverse();normal.negate();}
    const components=[Math.abs(normal.x),Math.abs(normal.y),Math.abs(normal.z)],axis=components.indexOf(Math.max(...components));
    const axes=axis===0?[2,1]:axis===1?[0,2]:[0,1],start=vertices.length/3;
    for(const p of points){vertices.push(...p);normals.push(normal.x,normal.y,normal.z);let u=.5+p[axes[0]]/size[axes[0]],v=.5+p[axes[1]]/size[axes[1]];if((axis===0&&normal.x>0)||(axis===1&&normal.y>0)||(axis===2&&normal.z<0))u=1-u;if(edge){u=.025+u*.018;v=.025+v*.018;}const index=tile===null?0:tiles[tile];uvs.push(((index%4)+.008+u*.984)/4,(3-Math.floor(index/4)+.008+v*.984)/4);}
    for(let i=1;i<points.length-1;i++)indices.push(start,start+i,start+i+1);
  }
  for(let axis=0;axis<3;axis++)for(const sign of [-1,1]){const other=[0,1,2].filter(i=>i!==axis);face([[-1,-1],[1,-1],[1,1],[-1,1]].map(pair=>{const p=[0,0,0];p[axis]=sign*h[axis];other.forEach((j,k)=>p[j]=pair[k]*a[j]);return p;}));}
  for(let along=0;along<3;along++){
    const [i,j]=[0,1,2].filter(v=>v!==along);
    for(const si of [-1,1])for(const sj of [-1,1])face([[-1,0],[1,0],[1,1],[-1,1]].map(([s,k])=>{const p=[0,0,0];p[along]=s*a[along];p[i]=si*(k?a[i]:h[i]);p[j]=sj*(k?h[j]:a[j]);return p;}),true);
  }
  for(const x of [-1,1])for(const y of [-1,1])for(const z of [-1,1]){const signs=[x,y,z];face([0,1,2].map(axis=>signs.map((s,i)=>s*(i===axis?h[i]:a[i]))),true);}
  const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(vertices,3));geo.setAttribute('normal',new T.Float32BufferAttribute(normals,3));geo.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));geo.setIndex(indices);geo.computeBoundingSphere();return geo;
}
function box(g,s,p,mat='steel',bevel=0){
  const tile=Object.hasOwn(tiles,mat)?mat:null,b=Math.min(bevel,...s.map(v=>v*.24));
  const geo=geometry(['box',...s,b,tile].join(','),()=>b?chamferGeometry(s,b,tile):new T.BoxGeometry(...s));
  return mesh(g,geo,tile?'paint':mat,p,mat+' panel');
}
function panel(g,s,p,tile='ivory',b=.08){return box(g,s,p,tile,b);}
function cylinder(g,r1,r2,length,p,mat='steel',axis='x',segments=16){const m=mesh(g,geometry(['c',r1,r2,length,segments].join(','),()=>new T.CylinderGeometry(r1,r2,length,segments)),mat,p,'cylinder / '+mat);if(axis==='x')m.rotation.z=-Math.PI/2;if(axis==='z')m.rotation.x=Math.PI/2;return m;}
function beam(g,a,b,width=.16,mat='steel',depth=width){const av=new T.Vector3(...a),bv=new T.Vector3(...b),delta=bv.clone().sub(av);const m=mesh(g,geometry('beam'+width+','+depth,()=>new T.BoxGeometry(width,1,depth)),mat);m.name='structural beam';m.position.copy(av.add(bv).multiplyScalar(.5));m.scale.y=delta.length();m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),delta.normalize());return m;}
function pipe(g,points,r=.08,mat='edge'){return mesh(g,geometry('pipe'+r+JSON.stringify(points),()=>new T.TubeGeometry(new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p)),false,'catmullrom',.15),Math.max(12,points.length*5),r,6,false)),mat,[0,0,0],'service pipe');}
function ring(g,x,r,mat='ochre',tube=.1){const m=mesh(g,geometry('ring'+r+','+tube,()=>new T.TorusGeometry(r,tube,6,40)),mat,[x,0,0],'retaining hoop');m.rotation.y=Math.PI/2;return m;}
function group(g,name,p=[0,0,0]){const c=new T.Group();c.name=name;c.position.set(...p);g.add(c);return c;}
function handholdRun(g,a,b){const p=new T.Vector3(...a),d=new T.Vector3(...b).sub(p),n=Math.max(1,Math.ceil(d.length()/2)),t=d.clone().normalize().multiplyScalar(.27);for(let i=0;i<n;i++){const c=p.clone().addScaledVector(d,(i+.5)/n),a=c.clone().sub(t),b=c.clone().add(t);beam(g,a.toArray(),[a.x,a.y+.15,a.z],.035,'edge');beam(g,[a.x,a.y+.15,a.z],[b.x,b.y+.15,b.z],.04,'ochre');beam(g,[b.x,b.y+.15,b.z],b.toArray(),.035,'edge');}}
function hatch(g,p=[0,0,0]){panel(g,[1.9,.12,1.7],p,'service');const [x,y,z]=p;cylinder(g,.65,.65,.12,[x,y+.12,z],'edge','y');box(g,[.75,.1,.08],[x,y+.22,z],'ochre');}
function restraintLug(g,x,z,y=-3.1){beam(g,[x,y+1,z],[x+.2,y+.4,z],.2);cylinder(g,.36,.36,.24,[x+.2,y+.4,z],'edge','z');}
function rcs(g){
  panel(g,[1.5,1.15,1.15],[0,0,0],'ivory',.16);
  for(const [axis,p] of [['x',[-.95,0,0]],['y',[0,.8,0]],['z',[0,0,.8]]])cylinder(g,.23,.35,.55,p,'steel',axis,12);
  panel(g,[.5,.1,1.18],[.3,.59,0],'hazard',.02);
}
function viewportSpec(direction,width,height){
  const u=new T.Vector3(...direction).normalize(),p=new T.Vector3(u.x*3.8,u.y*2.05,u.z*2.25),normal=new T.Vector3(u.x/3.8,u.y/2.05,u.z/2.25).normalize();
  return {p,normal,width,height,rotation:new T.Quaternion().setFromUnitVectors(new T.Vector3(0,0,1),normal)};
}
const cabinPorts=[viewportSpec([-.86,.28,.43],1.18,.86),viewportSpec([-.86,.28,-.43],1.18,.86),viewportSpec([-.57,.8,.12],.92,.7)];
function portPlate(g,size,p,normal,mat,name,hole=0){
  const [w,h,d]=size,geo=geometry('octagonal port'+size.join(',')+':'+hole,()=>{
    function points(w,h){const c=Math.min(w,h)*.23;return [[-w/2+c,-h/2],[w/2-c,-h/2],[w/2,-h/2+c],[w/2,h/2-c],[w/2-c,h/2],[-w/2+c,h/2],[-w/2,h/2-c],[-w/2,-h/2+c]];}
    const shape=new T.Shape();points(w,h).forEach(([x,y],i)=>i?shape.lineTo(x,y):shape.moveTo(x,y));shape.closePath();
    if(hole){const inner=new T.Path();points(w*hole,h*hole).reverse().forEach(([x,y],i)=>i?inner.lineTo(x,y):inner.moveTo(x,y));inner.closePath();shape.holes.push(inner);}
    const geo=new T.ExtrudeGeometry(shape,{depth:d,bevelEnabled:false,steps:1});geo.translate(0,0,-d/2);return geo;
  });
  const m=mesh(g,geo,mat,p.toArray(),name);m.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),normal);return m;
}
function cabin(g){
  const shell=geometry('crew pressure capsule / recessed ports',()=>{
    const geo=new T.SphereGeometry(1,128,80);geo.scale(3.8,2.05,2.25);const pos=geo.attributes.position,index=geo.index,keep=[],point=new T.Vector3(),local=new T.Vector3();
    for(let i=0;i<index.count;i+=3){
      point.set(0,0,0);for(let j=0;j<3;j++)point.add(new T.Vector3().fromBufferAttribute(pos,index.getX(i+j)));point.multiplyScalar(1/3);
      const cut=cabinPorts.some(port=>{const inverse=port.rotation.clone().invert();for(let j=0;j<3;j++){local.fromBufferAttribute(pos,index.getX(i+j)).sub(port.p).applyQuaternion(inverse);const x=Math.abs(local.x)/port.width,y=Math.abs(local.y)/port.height;if(x<.39&&y<.39&&x+y<.65&&Math.abs(local.z)<.3)return true;}return false;});
      if(!cut)keep.push(index.getX(i),index.getX(i+1),index.getX(i+2));
    }
    geo.setIndex(keep);const uv=geo.attributes.uv;for(let i=0;i<uv.count;i++)uv.setXY(i,(1+.22+uv.getX(i)*.08)/4,(3+.38+uv.getY(i)*.12)/4);return geo;
  });
  mesh(g,shell,'paint',[0,0,0],'rounded crew pressure shell');
  for(const port of cabinPorts){
    portPlate(g,[port.width,port.height,.28],port.p.clone().addScaledVector(port.normal,.005),port.normal,'steel','recessed viewport surround',.70);
    portPlate(g,[port.width*.78,port.height*.76,.05],port.p.clone().addScaledVector(port.normal,-.04),port.normal,'glass','pressure viewport');
  }
  for(const x of [2.65,3.45]){cylinder(g,1.24,1.24,.4,[x,0,0],'steel');ring(g,x,1.28,'edge',.10);}
  cylinder(g,.45,.45,.5,[-3.72,-.25,0],'steel');cylinder(g,.31,.31,.05,[-4,-.25,0],'cool');
  for(const z of [-1,1]){
    const normal=new T.Vector3(.22,-.08,z).normalize(),p=new T.Vector3(1.1,-.15,z*2.08);
    portPlate(g,[1.35,1.35,.18],p,normal,'edge','pressure access collar');
    portPlate(g,[1.05,1.05,.20],p.clone().addScaledVector(normal,.06),normal,'steel','sealed pressure hatch');
    const handle=group(g,'EVA hatch grips',p.clone().addScaledVector(normal,.20).toArray());handle.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),normal);handholdRun(handle,[-.48,0,0],[.48,0,0]);
    panel(g,[1.4,.65,.26],[1.9,.7,z*1.83],'service',.1);
    pipe(g,[[.6,-1.4,z*1.4],[1.8,-1.2,z*1.6],[2.8,-.7,z*1.1]],.09,'ochre');
    for(const x of [-.2,1.9]){const grip=group(g,'radial EVA handhold',[x,.75,z*1.92]);grip.rotation.x=z*Math.PI/2;handholdRun(grip,[-.25,0,0],[.25,0,0]);}
    cylinder(g,.2,.32,.5,[2.6,z*.9,z*1.05],'steel','z',12);
  }
  panel(g,[1.8,.6,1.1],[1.3,1.65,-.4],'ivory',.18);beam(g,[1.8,1.9,-.4],[2.8,2.4,-.65],.055,'edge');
  for(const z of [-.9,.9]){box(g,[.22,.15,.18],[-2.7,.2,z*1.5],'cool');box(g,[.22,.15,.18],[2.9,.4,z],'warm');}
  g.userData.sockets={aft:[4,0,0],forward:[-4,0,0]};g.userData.environment='zero-g pressure module';
}

function truss(g,options={}){
  for(const y of [-2.5,2.5])for(const z of [-2.5,2.5]){
    beam(g,[-6,y,z],[6,y,z],.25,'steel',.3);
    for(const x of [-6,-2,2,6])if(!(options.omitFront&&x===-6))panel(g,[.42,.45,.45],[x,y,z],'service',.045);
  }
  for(const x of [-6,-2,2,6]){
    if(options.omitFront&&x===-6)continue;
    for(const y of [-2.5,2.5])beam(g,[x,y,-2.5],[x,y,2.5],.16,'edge');
    for(const z of [-2.5,2.5])beam(g,[x,-2.5,z],[x,2.5,z],.16,'edge');
  }
  for(let x=-6;x<6;x+=4){
    const even=x===-2;
    for(const z of [-2.5,2.5])beam(g,[x,even?2.5:-2.5,z],[x+4,even?-2.5:2.5,z],.16,'edge');
    beam(g,[x,2.5,-2.5],[x+4,2.5,2.5],.14);
    panel(g,[3.75,.12,.65],[x+2,-2.5,0],'deck',.025);
  }
  for(const z of [-.72,.72])cylinder(g,.19,.19,12,[0,-1.75,z],'edge');
  cylinder(g,.11,.11,12,[0,-1.75,1.25],'ochre');
  for(const x of [-5.5,5.5])panel(g,[.35,.65,2.5],[x,-1.8,0],'dark',.06);
  panel(g,[2.1,.8,1.6],[2,-1.85,0],'service',.09);
  g.userData.sockets={forward:[-6,0,0],aft:[6,0,0],port:[0,0,-2.5],starboard:[0,0,2.5]};
}
function cargo(g,options={}){
  const color=options.color||'cargo';panel(g,[9.65,4.55,4.55],[0,0,0],color,.30);
  for(const x of [-4.8,4.8]){
    panel(g,[.28,4.9,4.9],[x,0,0],'dark',.1);
    for(const y of [-2.13,2.13])for(const z of [-2.13,2.13]){panel(g,[.65,.62,.62],[x,y,z],'ochrePaint',.09);box(g,[.10,.23,.24],[x+Math.sign(x)*.33,y,z],'rubber',.03);}
  }
  for(const z of [-1.05,1.05]){
    panel(g,[.16,3.86,1.94],[-4.99,0,z],color,.08);
    for(const dz of [-.55,.55])cylinder(g,.055,.055,3.35,[-5.13,0,z+dz],'edge','y',8);
    box(g,[.12,.12,.6],[-5.24,-.22,z],'ochre');
    for(const y of [-1.4,1.4])box(g,[.18,.3,.42],[-5.15,y,z],'steel');
  }
  for(const z of [-2.3,2.3]){
    for(const x of [-3.6,-1.8,0,1.8,3.6])panel(g,[.13,3.8,.13],[x,0,z],'service',.025);
    panel(g,[1.5,.56,.08],[2.6,.9,z+Math.sign(z)*.05],'registry',.025);
    panel(g,[7.7,.14,.18],[0,-2.12,z],'edge',.025);
  }
  for(const z of [-1.8,1.8])panel(g,[8.9,.18,.2],[0,2.25,z],'service',.03);
  for(const x of [-2.6,2.6])panel(g,[.4,.13,3.7],[x,2.28,0],'dark',.025);
  g.userData.sockets={forward:[-5,0,0],aft:[5,0,0],mount:[0,2.5,0]};
}
function tank(g,options={}){
  const sphere=geometry('pressure sphere',()=>{
    const geo=new T.SphereGeometry(4.6,40,24),uv=geo.attributes.uv;
    for(let i=0;i<uv.count;i++)uv.setXY(i,(3+.008+uv.getX(i)*.984)/4,(1+.008+uv.getY(i)*.984)/4);return geo;
  });
  mesh(g,sphere,'paint',[0,0,0],'pressure vessel');
  for(const x of [-2.6,0,2.6]){
    const radius=Math.sqrt(4.6**2-x*x)+.055;ring(g,x,radius,x===0?'ochre':'edge',x===0?.115:.045);
    if(x===0)for(const dx of [-.18,.18])ring(g,dx,4.63,'steel',.055);
  }
  for(const x of [-4.9,4.9]){cylinder(g,.73,.73,1.4,[x,0,0],'steel');cylinder(g,1.03,1.03,.18,[x,0,0],'ochre');}
  for(const y of [-4.9,4.9])for(const z of [-4.9,4.9])beam(g,[-6,y,z],[6,y,z],.21);
  for(const x of [-6,6]){
    if(options.omitFront&&x===-6)continue;
    for(const y of [-4.9,4.9])beam(g,[x,y,-4.9],[x,y,4.9],.2,'edge');
    for(const z of [-4.9,4.9])beam(g,[x,-4.9,z],[x,4.9,z],.2,'edge');
    for(const y of [-1,1])for(const z of [-1,1]){beam(g,[x,y*4.9,z*4.9],[x*.43,y*2.8,z*2.8],.14,'ochre');panel(g,[.45,.6,.6],[x,y*4.9,z*4.9],'service',.07);}
  }
  for(const z of [-4.9,4.9]){beam(g,[-6,-4.9,z],[6,4.9,z],.12);pipe(g,[[-5,-4.4,z],[0,-4.4,z],[5,-4.4,z]],.1,'ochre');}
  for(const x of [-2.6,2.6])for(const z of [-1,1])beam(g,[x,-3.7,z*2],[x,-4.9,z*4.9],.22,'edge');
  panel(g,[10,.18,.35],[0,4.85,0],'deck',.025);handholdRun(g,[-4.8,4.95,0],[4.8,4.95,0]);
  cylinder(g,.55,.55,.65,[0,4.8,0],'steel','y');hatch(g,[0,5.28,0]);
  pipe(g,[[-4.9,0,0],[-5.4,-1,1.3],[-5.4,-3,3.9],[-4.7,-4.2,4.9],[5.5,-4.2,4.9]],.12,'edge');
  panel(g,[1.4,.95,.55],[3.4,-3.8,4.9],'ochrePaint',.09);
  g.userData.sockets={forward:[-6,0,0],aft:[6,0,0]};
}
function engine(g){
  panel(g,[3.8,3.15,3.15],[-1.8,0,0],'ivory',.45);
  cylinder(g,1.32,1.32,3,[-1.3,0,0],'steel','x',24);
  for(const x of [-3.8,-1.8])cylinder(g,1.52,1.52,.22,[x,0,0],x===-1.8?'ochre':'edge','x',24);
  ring(g,.5,.78,'edge',.10);
  const bell=geometry('hollow engine bell',()=>{
    const points=[[.7,.4],[.75,.7],[.95,1.4],[1.35,2.15],[1.95,3.2],[2.05,3.35],[1.86,3.4],[1.73,3.16],[1.17,2.2],[.8,1.4],[.60,.7],[.6,.4]].map(([r,x])=>new T.Vector2(r,x));const geo=new T.LatheGeometry(points,32);geo.normalizeNormals();return geo;
  });
  const nozzle=mesh(g,bell,'edge',[0,0,0],'recessed engine bell');nozzle.rotation.z=-Math.PI/2;
  cylinder(g,.59,.59,.05,[.47,0,0],'hot','x',24);ring(g,3.28,1.96,'steel',.09);
  for(let i=0;i<8;i++){const angle=i*Math.PI/4,y=Math.cos(angle),z=Math.sin(angle);beam(g,[.6,y*.98,z*.98],[2.8,y*1.82,z*1.82],.06,'steel');}
  for(const z of [-1.68,1.68]){
    panel(g,[2.4,1.7,.45],[-1.6,0,z],'service',.14);panel(g,[1.85,1.22,.12],[-1.6,0,z+Math.sign(z)*.26],'vent',.04);
    pipe(g,[[-3.8,.6,z*.7],[-3.2,1.15,z],[-.4,1.15,z],[.3,.6,z*.7]],.09,'ochre');
  }
  panel(g,[2.8,.4,1.6],[-2,-1.7,0],'dark',.1);
  for(const y of [-1.3,1.3])beam(g,[-4,y,0],[-2.7,y,0],.2);
  g.userData.sockets={mount:[-4,0,0],exhaust:[3.4,0,0]};
}
function coupler(g){
  cylinder(g,.72,.72,2,[0,0,0],'steel');
  for(const x of [-.8,.8]){cylinder(g,1.18,1.18,.23,[x,0,0],'edge');ring(g,x,1.05,'ochre',.08);for(let i=0;i<6;i++){const a=i*Math.PI/3;cylinder(g,.08,.08,.28,[x,Math.cos(a)*.91,Math.sin(a)*.91],'steel','x',8);}}
  for(const z of [-.75,.75])beam(g,[-.6,.4,z],[.6,.4,z],.10,'ochre');
  g.userData.sockets={forward:[-1,0,0],aft:[1,0,0]};
}
function service(g){
  panel(g,[3.8,2.7,2.9],[0,0,0],'service',.25);
  for(const z of [-1.47,1.47]){panel(g,[3.1,1.6,.12],[0,.25,z],'vent',.06);panel(g,[2.8,.22,.12],[0,-1,z],'ochrePaint',.03);}
  for(const x of [-1.4,1.4])panel(g,[.3,.2,3.1],[x,1.4,0],'dark',.04);
  hatch(g,[0,1.4,0]);
  for(const z of [-.8,.8]){cylinder(g,.35,.35,2.8,[0,-1.5,z],'steel');cylinder(g,.4,.4,.18,[-1.15,-1.5,z],'ochre');}
}
function crane(g){handlingArm(g,false);}

function bulkTank(g){
  // A continuous 24 m shell: 16 m barrel and two ellipsoidal domed heads.
  const shell=geometry('bulk fluid shell / 24m',()=>{
    const stations=[],radius=5.5,segments=48,positions=[],normals=[],uvs=[],indices=[];
    for(let i=0;i<=10;i++){const a=-Math.PI/2+i*Math.PI/20;stations.push({x:-8+4*Math.sin(a),r:radius*Math.cos(a),nx:Math.sin(a)/4,nr:Math.cos(a)/radius});}
    for(const x of [-4,0,4,8])stations.push({x,r:radius,nx:0,nr:1/radius});
    for(let i=1;i<=10;i++){const a=i*Math.PI/20;stations.push({x:8+4*Math.sin(a),r:radius*Math.cos(a),nx:Math.sin(a)/4,nr:Math.cos(a)/radius});}
    for(const s of stations)for(let j=0;j<=segments;j++){const a=j*Math.PI*2/segments,c=Math.cos(a),z=Math.sin(a),n=new T.Vector3(s.nx,s.nr*c,s.nr*z).normalize();positions.push(s.x,s.r*c,s.r*z);normals.push(n.x,n.y,n.z);uvs.push((3+.008+(s.x+12)/24*.984)/4,(.008+(1-j/segments)*.984)/4);}
    for(let i=0;i<stations.length-1;i++)for(let j=0;j<segments;j++){const a=i*(segments+1)+j,b=a+segments+1,c=a+1,d=b+1;if(i>0)indices.push(a,c,b);if(i<stations.length-2)indices.push(b,c,d);}
    const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(positions,3));geo.setAttribute('normal',new T.Float32BufferAttribute(normals,3));geo.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));geo.setIndex(indices);return geo;
  });
  mesh(g,shell,'paint',[0,0,0],'domed bulk-fluid vessel');
  for(const x of [-7.5,0,7.5]){
    const strap=geometry('bulk structural band',()=>{const p=[[5.5,-.18],[5.68,-.18],[5.68,.18],[5.5,.18],[5.5,-.18]].map(([r,y])=>new T.Vector2(r,y));const geo=new T.LatheGeometry(p,48);geo.normalizeNormals();return geo;});
    const band=mesh(g,strap,x===0?'ochre':'edge',[x,0,0],'structural tank band');band.rotation.z=-Math.PI/2;
  }
  for(const x of [-7.5,7.5]){
    const points=[];for(let i=0;i<=32;i++){const a=-Math.PI/2+i*Math.PI/16;points.push([x,-5.72*Math.cos(a),5.72*Math.sin(a)]);}pipe(g,points,.25,'steel');
    beam(g,[x,-6.3,-5.6],[x,-6.3,5.6],.3);beam(g,[x,6.3,-5.6],[x,6.3,5.6],.3);
    for(const z of [-5.5,5.5]){beam(g,[x,-6.05,z],[x,-3.7,z*.77],.32,'edge');panel(g,[1.6,.3,1.1],[x,-6.05,z],'ochrePaint',.08);}
  }
  for(const z of [-5.6,5.6]){
    beam(g,[-14,-6.3,z],[14,-6.3,z],.36);
    for(const x of [-13.6,-7.5,7.5,13.6])panel(g,[.75,.65,.75],[x,-6.25,z],'ochrePaint',.08);
    beam(g,[-13,-6.3,z],[-9,-2.4,z*.72],.18,'edge');beam(g,[13,-6.3,z],[9,-2.4,z*.72],.18,'edge');
  }
  for(const x of [-13.6,13.6])beam(g,[x,-6.3,-5.6],[x,-6.3,5.6],.3);
  for(const x of [-12.6,12.6]){cylinder(g,.65,.65,1.4,[x,0,0],'steel');cylinder(g,1,1,.2,[x+Math.sign(x)*.55,0,0],'ochre');}
  panel(g,[18,.22,.42],[0,5.58,0],'deck',.03);
  handholdRun(g,[-8.5,5.70,0],[8.5,5.70,0]);
  for(const x of [-7.5,7.5])for(const z of [-.45,.45])beam(g,[x,5.5,z],[x,5.66,z],.12,'edge');
  hatch(g,[-3,5.76,0]);hatch(g,[4.5,5.76,0]);
  for(const z of [-6.3,6.3])pipe(g,[[-12.8,0,0],[-13.4,-1,z*.4],[-11.8,-4.7,z],[0,-4.7,z],[11.8,-4.7,z],[13.4,-1,z*.4],[12.8,0,0]],.17,z<0?'edge':'ochre');
  const pump=group(g,'fluid transfer cassette',[3.5,-4.7,6.9]);service(pump);pump.scale.set(.85,.7,.6);
  for(const x of [-3.5,0]){
    cylinder(g,.28,.28,1.1,[x,-4.7,6.8],'edge','z');
    const valve=ring(g,0,.42,'ochre',.055);valve.rotation.set(0,0,0);valve.position.set(x,-4.7,7.4);
    for(const y of [-.2,.2])beam(g,[x-.24,-4.7+y,7.4],[x+.24,-4.7-y,7.4],.045,'edge');
  }
  panel(g,[6,.18,.35],[-2,-5.2,6.4],'service',.04);
  g.userData.sockets={forward:[-14,0,0],aft:[14,0,0],saddleForward:[-7.5,-6.3,0],saddleAft:[7.5,-6.3,0]};
}
function handlingArm(g,large=false){
  const first=large?7.5:3.5,second=large?5.6:3.1,r=large?.58:.36;
  cylinder(g,large?1.5:.9,large?1.5:.9,.5,[0,0,0],'steel','y',24);
  for(let i=0;i<6;i++){const a=i*Math.PI/3;cylinder(g,.13,.13,.16,[Math.cos(a)*(large?1.28:.72),.3,Math.sin(a)*(large?1.28:.72)],'edge','y',8);}
  const shoulder=group(g,'handling shoulder',[0,large?1.1:.7,0]);shoulder.rotation.z=.32;shoulder.userData.joint='handling-shoulder';
  cylinder(shoulder,r+.14,r+.14,large?1.8:1.2,[0,0,0],'edge','z',20);
  function link(parent,length,width){
    for(const y of [-width,width])for(const z of [-width,width])beam(parent,[0,y,z],[length,y,z],large?.16:.12,'ochre');
    const count=Math.ceil(length/(large?1.5:1.2));
    for(let i=0;i<=count;i++){const x=i*length/count;for(const z of [-width,width])beam(parent,[x,-width,z],[x,width,z],.12,'edge');for(const y of [-width,width])beam(parent,[x,y,-width],[x,y,width],.1);}
    for(let i=0;i<count;i++)for(const z of [-width,width])beam(parent,[i*length/count,-width,z],[(i+1)*length/count,width,z],.10,'ochre');
  }
  link(shoulder,first,r);panel(shoulder,[1.5,r*2.4,r*2.4],[first*.45,0,0],'service',.1);
  const elbow=group(shoulder,'handling elbow',[first,0,0]);elbow.rotation.z=-.75;elbow.userData.joint='handling-elbow';
  cylinder(elbow,r+.12,r+.12,large?1.65:1.1,[0,0,0],'edge','z',20);link(elbow,second,r*.76);
  panel(elbow,[second*.62,r*1.2,r*1.45],[second*.68,0,0],'service',.10);
  const extension=group(elbow,'rigid telescoping carriage',[second-.55,0,0]);extension.userData.joint='handling-extension';extension.userData.restX=second-.55;extension.userData.stroke=large?2.2:1.2;
  panel(extension,[large?4:2.7,r*.85,r*1.05],[.5,0,0],'dark',.07);
  for(const z of [-r*.35,r*.35])beam(extension,[-1,0,z],[large?2.6:1.8,0,z],.08,'edge');
  const wrist=group(extension,'capture wrist',[large?2.9:2.0,0,0]);wrist.rotation.x=.35;wrist.userData.joint='handling-wrist';
  cylinder(wrist,r,r,.6,[0,0,0],'edge');
  const radius=large?1.7:1;ring(wrist,.55,radius,'steel',large?.16:.12);
  for(let i=0;i<3;i++){
    const a=i*Math.PI*2/3,y=Math.cos(a),z=Math.sin(a),jaw=group(wrist,'capture jaw '+i,[.55,y*radius,z*radius]);
    cylinder(jaw,.20,.20,.4,[0,0,0],'edge');beam(jaw,[0,0,0],[1.05,-y*.18,-z*.18],.17,'ochre');beam(jaw,[1.05,-y*.18,-z*.18],[1.05,-y*.65,-z*.65],.19,'steel');
    panel(jaw,[.3,.27,.27],[1.1,-y*.65,-z*.65],'hazard',.035);
  }
  for(const z of [-r*.85,r*.85])pipe(shoulder,[[0,-r*.6,z],[first*.35,-r*.9,z],[first*.8,-r*.9,z],[first,-r*.6,z]],.055,'edge');
  g.userData.sockets={mount:[0,-.25,0]};g.userData.articulation='rigid shoulder, elbow, telescopic carriage, rotating capture wrist';
}
function latticeCrane(g){handlingArm(g,true);}

const builders={cabin,truss,cargo,tank,engine,coupler,service,crane,rcs,bulkTank,latticeCrane};
export function part(name,options={}){if(!builders[name])throw new Error('Unknown industrial part: '+name);const g=new T.Group();g.name=name;g.userData.part=name;builders[name](g,options);return g;}
function addPart(g,name,p,options={}){const m=part(name,options);m.position.set(...p);g.add(m);return m;}
function rack(g,x,y,z){const side=Math.sign(z);for(const dx of [-3.8,3.8]){beam(g,[x+dx,y,side*2.5],[x+dx,y,z],.24);beam(g,[x+dx,y-1.7,side*2.5],[x+dx,y,z],.16,'edge');panel(g,[.65,.4,.7],[x+dx,y,z],'ochrePaint',.07);}}
function engineBank(g,x,layout){
  for(const [y,z] of layout){beam(g,[x-3,0,0],[x-3,y,z],.4);const e=addPart(g,'engine',[x,y,z]);e.name='drive module';}
  for(const z of [-1,1]){panel(g,[3.4,.2,4],[x-4,3.2,z*5.5],'radiator',.08);beam(g,[x-4,1.5,z*2],[x-4,3.1,z*5.5],.15);}
  addPart(g,'service',[x-4,0,0]);
}
function smallPressurePod(g,p,scale=1){
  const pod=group(g,'auxiliary pressure vessel',p);pod.scale.setScalar(scale);
  const geo=geometry('auxiliary pressure shell',()=>{const geo=new T.SphereGeometry(1,24,16);geo.scale(2.9,1.35,1.65);const uv=geo.attributes.uv;for(let i=0;i<uv.count;i++)uv.setXY(i,(1+.22+uv.getX(i)*.08)/4,(3+.38+uv.getY(i)*.12)/4);return geo;});
  mesh(pod,geo,'paint',[0,0,0],'auxiliary pressure shell');
  for(const x of [-2.55,2.55])cylinder(pod,.58,.58,.5,[x,0,0],'steel');
  for(const z of [-1,1]){cylinder(pod,.32,.32,.12,[-.7,.2,z*1.56],'steel','z');cylinder(pod,.24,.24,.14,[-.7,.2,z*1.61],'glass','z');pipe(pod,[[.6,-.6,z*1.2],[1.6,-.4,z*1.15],[2.2,0,z*.85]],.065,'ochre');}
  return pod;
}

function neck(g,from,to){const dx=to-from;cylinder(g,.72,.72,dx,[(from+to)/2,0,0],'steel');for(const z of [-1.05,1.05])beam(g,[from,-.85,z],[to,-.85,z],.18,'edge');}
function undercarriage(g,x,z){
  const u=group(g,'external utility saddle',[x,-3.3,z]);
  panel(u,[5,.45,2.3],[0,0,0],'dark',.10);
  for(const dz of [-.65,.65]){cylinder(u,.4,.4,3.6,[0,-.5,dz],'edge');for(const dx of [-1.5,1.5])cylinder(u,.44,.44,.16,[dx,-.5,dz],'steel');}
  panel(u,[2.8,.7,.65],[.3,-.3,1.3],'service',.09);
  pipe(u,[[-2,-.3,0],[-2,-1.2,0],[2,-1.2,0],[2,-.2,0]],.09,'ochre');
  for(const dx of [-1.8,1.8])beam(u,[dx,1.1,0],[dx,-.2,0],.22);
}

export const moduleStandard=Object.freeze({pitch:14,halfWidth:6.2,interface:'DW-14 / four-corner rigid lock',payloads:['cargo','tank','machinery','habitat','empty','bulkFluid']});
export const routePresets=Object.freeze({container:['cargo','cargo','cargo'],mixed:['cargo','tank','machinery','empty'],fluid:['bulkFluid','bulkFluid'],support:['habitat','machinery','empty','cargo']});
function standardFrame(g,span=1){
  const length=14*span,h=6.2;
  for(const y of [-h,h])for(const z of [-h,h])beam(g,[-length/2+.25,y,z],[length/2-.25,y,z],.30,'steel');
  for(let bay=0;bay<=span;bay++){
    const x=-length/2+bay*14+(bay===0?.22:bay===span?-.22:0);
    for(const y of [-h,h])beam(g,[x,y,-h],[x,y,h],.25,'edge');
    for(const z of [-h,h])beam(g,[x,-h,z],[x,h,z],.25,'edge');
    for(const y of [-h,h])for(const z of [-h,h])panel(g,[.7,.72,.72],[x,y,z],'ochrePaint',.08);
  }
  // Triangulate the perimeter faces; every brace terminates on frame nodes.
  for(let bay=0;bay<span;bay++){
    const x=-length/2+bay*14,left=x+(bay===0?.22:0),right=x+14-(bay===span-1?.22:0);
    for(const z of [-h,h]){beam(g,[left,-h,z],[right,h,z],.16,'steel');beam(g,[left,h,z],[right,-h,z],.16,'steel');}
    for(const y of [-h,h])beam(g,[left,y,-h],[right,y,h],.14,'edge');
  }
  for(const z of [-h,h]){pipe(g,[[-length/2,0,z],[0,0,z],[length/2,0,z]],.10,z>0?'ochre':'edge');handholdRun(g,[-length/2+1,h+.15,z],[length/2-1,h+.15,z]);}
  g.userData.interface=moduleStandard.interface;g.userData.span=span;
  g.userData.sockets={forward:[-length/2,0,0],aft:[length/2,0,0]};
}
function rigidLock(g,x){
  const joint=group(g,'DW-14 rigid interface',[x,0,0]);joint.userData.interface=moduleStandard.interface;
  for(const y of [-6.2,6.2])for(const z of [-6.2,6.2]){
    panel(joint,[1.1,.9,.9],[0,y,z],'dark',.08);
    for(const d of [-.4,.4])panel(joint,[.15,1,1],[d,y,z],'ochrePaint',.04);
    cylinder(joint,.14,.14,1.25,[0,y,z],'edge');
  }
  for(const z of [-6.2,6.2]){cylinder(joint,.23,.23,.8,[0,0,z],'edge');ring(joint,0,.24,'ochre',.045).position.z=z;}
}
function modulePayload(g,type,span){
  const payload=group(g,'Interchangeable payload / '+type);payload.userData.payload=type;
  if(type==='cargo'){
    for(const y of [-2.6,2.6])for(const z of [-2.6,2.6])addPart(payload,'cargo',[0,y,z],{color:y>0?(z>0?'cargo':'blue'):(z>0?'rust':'ochrePaint')});
    for(const x of [-4.8,4.8])for(const y of [-2.6,2.6])for(const z of [-2.6,2.6])beam(payload,[x,y+Math.sign(y)*2.25,z+Math.sign(z)*2.25],[x,Math.sign(y)*6.2,Math.sign(z)*6.2],.16,'edge');
  }else if(type==='tank'){
    const vessel=mesh(payload,geometry('DW14 spherical insert',()=>new T.SphereGeometry(4.8,40,24)),'paint',[0,0,0],'fluid sphere');
    const uv=vessel.geometry.attributes.uv;if(!vessel.geometry.userData.atlas){for(let i=0;i<uv.count;i++)uv.setXY(i,(3+.008+uv.getX(i)*.984)/4,(1+.008+uv.getY(i)*.984)/4);vessel.geometry.userData.atlas=true;}
    for(const x of [-2.8,2.8]){ring(payload,x,Math.sqrt(4.8**2-x**2)+.12,'ochre',.12);for(const y of [-1,1])for(const z of [-1,1])beam(payload,[x,y*2.8,z*2.8],[x,y*6.2,z*6.2],.18,'steel');}
    for(const x of [-5.2,5.2])cylinder(payload,.55,.55,1.2,[x,0,0],'edge');
    pipe(payload,[[-6.5,0,6.2],[-4,0,6.2],[-3,0,3.5]],.14,'ochre');
  }else if(type==='bulkFluid'){
    // Reuse only the shared continuous vessel, not the legacy carrier's frame.
    const vesselSource=part('bulkTank'),vessel=vesselSource.getObjectByName('domed bulk-fluid vessel').clone();payload.add(vessel);
    for(const x of [-8,0,8]){ring(payload,x,5.65,'ochre',.13);for(const y of [-1,1])for(const z of [-1,1])beam(payload,[x,y*3.95,z*3.95],[x,y*6.2,z*6.2],.18,'steel');}
    for(const x of [-12.5,12.5])cylinder(payload,.55,.55,1.2,[x,0,0],'edge');
    pipe(payload,[[-14,0,6.2],[0,0,6.2],[14,0,6.2]],.17,'ochre');
  }else if(type==='machinery'){
    for(const x of [-3,3])for(const z of [-3,3])addPart(payload,'service',[x,0,z]);
    for(const y of [-3.4,3.4])panel(payload,[9,.22,8],[0,y,0],'radiator',.08);
    for(const x of [-4.5,4.5])for(const z of [-4,4])beam(payload,[x,-3.4,z],[x,3.4,z],.20);
    const arm=addPart(payload,'crane',[0,0,-6.3]);arm.rotation.x=-Math.PI/2;
  }else if(type==='habitat'){
    addPart(payload,'cabin',[-1,0,0]);smallPressurePod(payload,[3,0,0],.65);
    for(const y of [-1,1])for(const z of [-1,1])beam(payload,[2.8,y,z],[3,y*6.2,z*6.2],.22,'edge');
    for(const z of [-4,4])addPart(payload,'service',[1,0,z]);
  }
  g.userData.payloadEnvelope={length:14*span-2,width:11.6,height:11.6};
}
export function standardBay(type='empty'){
  if(!moduleStandard.payloads.includes(type))throw new Error('Unknown standard payload: '+type);
  const span=type==='bulkFluid'?2:1,g=new T.Group();g.name='DW-14 bay / '+type;g.userData.standardBay=true;g.userData.payload=type;
  standardFrame(g,span);modulePayload(g,type,span);return g;
}
export function buildConsist(types=routePresets.mixed,options={}){
  if(!Array.isArray(types)||types.length<1||types.length>6||types.some(t=>!moduleStandard.payloads.includes(t)))throw new Error('Choose one to six standard payload modules');
  const gap=Math.max(0,Math.min(8,Number(options.separation)||0)),g=new T.Group();g.name='modular';g.userData.units='metres';g.userData.interface=moduleStandard.interface;g.userData.manifest=types.slice();g.userData.separation=gap;
  let cursor=-7;const joints=[];
  for(const [i,type] of types.entries()){
    const bay=standardBay(type),length=14*bay.userData.span;bay.position.x=cursor+length/2;g.add(bay);if(i>0&&gap===0)rigidLock(g,cursor);
    joints.push({index:i,payload:type,span:bay.userData.span,forward:cursor,aft:cursor+length});cursor+=length+(i<types.length-1?gap:0);
  }
  const end=cursor;
  // Identical terminal adapters distribute thrust and cabin loads to four corners.
  for(const x of [-7,end]){for(const y of [-6.2,6.2])for(const z of [-6.2,6.2])beam(g,[x,y,z],[x+(x<0?-3:3),y*.17,z*.17],.28,'steel');rigidLock(g,x);}
  addPart(g,'cabin',[-14,0,0]);neck(g,-10.2,-7);
  engineBank(g,end+8,[[-2.8,-3],[-2.8,3],[2.8,-3],[2.8,3]]);neck(g,end,end+3);
  for(const x of [-6,end-1])for(const z of [-6.2,6.2])addPart(g,'rcs',[x,0,z]);
  g.userData.bays=joints;g.userData.structuralLength=end+7;return g;
}

export function assembly(kind){
  if(kind==='modular')return buildConsist();
  const g=new T.Group();g.name=kind;
  if(kind==='fleet'){shipNames.forEach((name,i)=>{const ship=assembly(name);ship.position.set((i%2)*78,0,Math.floor(i/2)*50);g.add(ship);});return g;}
  if(kind==='kit'){Object.keys(builders).forEach((name,i)=>addPart(g,name,[(i%3-1)*34,0,(Math.floor(i/3)-1.5)*28]));return g;}
  if(!shipNames.includes(kind))throw new Error('Unknown industrial assembly: '+kind);
  if(kind==='tug'){
    const cab=addPart(g,'cabin',[-7,1.4,-.65]);cab.scale.setScalar(.82);
    smallPressurePod(g,[-7.8,-2.1,.55],.7);addPart(g,'coupler',[-11,0,0]);neck(g,-4.1,-2.8);
    for(const x of [-8.5,-6])beam(g,[x,-.1,0],[x,-1.4,0],.3);
    const spine=addPart(g,'truss',[1,0,0]);spine.scale.x=.65;
    addPart(g,'service',[.6,-.6,3.6]);addPart(g,'service',[1.8,.2,-3.7]);
    panel(g,[3.5,.2,2],[-1,2.65,0],'deck',.05);handholdRun(g,[-2.5,2.76,0],[-.5,2.76,0]);
    for(const z of [-2.7,2.7]){addPart(g,'engine',[7,0,z]);restraintLug(g,1,z,-3.6);addPart(g,'rcs',[-3,-1.9,z]);}
    panel(g,[1,5.2,8],[3.5,0,0],'dark',.15);undercarriage(g,1,0);
    for(let i=0;i<3;i++){const a=i*Math.PI*2/3,y=Math.cos(a),z=Math.sin(a);beam(g,[-10,y,z],[-12,y*1.7,z*1.7],.25,'ochre');beam(g,[-12,y*1.7,z*1.7],[-12.5,y*1.15,z*1.15],.2);}
  }else if(kind==='hauler'){
    addPart(g,'cabin',[-13,0,0]);smallPressurePod(g,[-14.2,-3.35,.2],.85);addPart(g,'coupler',[-7.5,0,0]);neck(g,-9.3,-6);
    for(let i=0;i<3;i++)addPart(g,'truss',[i*12,0,0],{omitFront:i>0});
    for(const [x,y,z,color] of [[0,-.3,-5.3,'ochrePaint'],[0,-.3,5.3,'cargo'],[12,-.3,5.3,'rust'],[24,-.3,-5.3,'cargo'],[24,-.3,5.3,'blue']]){rack(g,x,y,z);addPart(g,'cargo',[x,y,z],{color});}
    addPart(g,'service',[12,-.5,-4.3]);addPart(g,'service',[23,3.9,0]);
    addPart(g,'cargo',[10,4.15,0],{color:'cargo'}).scale.set(.62,.55,.65);
    for(const x of [8,12])beam(g,[x,2.5,0],[x,3.1,0],.3);
    for(const x of [0,12,24])undercarriage(g,x,0);
    neck(g,29,32);
    for(const x of [-4,28])for(const z of [-2.7,2.7])addPart(g,'rcs',[x,-2.5,z]);
    engineBank(g,35,[[-2.8,-3],[-2.8,3],[2.8,-3],[2.8,3]]);
  }else if(kind==='tanker'){
    addPart(g,'cabin',[-14.4,.2,0]);smallPressurePod(g,[-14.5,-3.1,0],.7);addPart(g,'coupler',[-8.8,0,0]);neck(g,-10.6,-5.6);
    for(let i=0;i<3;i++)addPart(g,'tank',[i*12,0,0],{omitFront:i>0});
    for(const x of [6,18]){addPart(g,'coupler',[x,0,0]);panel(g,[2.2,.18,.35],[x,4.85,0],'deck',.025);handholdRun(g,[x-1,4.95,0],[x+1,4.95,0]);}
    addPart(g,'service',[31,0,0]);engineBank(g,37,[[-2.8,-3],[-2.8,3],[2.8,-3],[2.8,3]]);
    for(const x of [-5,29])for(const z of [-5,5])addPart(g,'rcs',[x,-4.6,z]);
    pipe(g,[[-8,0,0],[-7,-2,0],[-7,-4.5,3],[0,-5.2,3],[24,-5.2,3],[31,-2,0]],.18,'ochre');
  }else if(kind==='bulkCarrier'){
    addPart(g,'cabin',[-20,0,0]);smallPressurePod(g,[-20.4,-3.35,.2],.85);addPart(g,'coupler',[-14.5,0,0]);neck(g,-16.3,-12.2);
    for(const x of [0,28])addPart(g,'bulkTank',[x,0,0]);
    addPart(g,'coupler',[14,0,0]);
    panel(g,[10,.22,.42],[14,5.58,0],'deck',.04);handholdRun(g,[9,5.70,0],[19,5.70,0]);
    for(const x of [12.8,15.2]){for(let i=0;i<8;i++){const a=i*Math.PI/4,b=(i+1)*Math.PI/4;beam(g,[x,6.2*Math.cos(a),6.2*Math.sin(a)],[x,6.2*Math.cos(b),6.2*Math.sin(b)],.28,'edge');}beam(g,[x,0,-6.2],[x,0,-7.3],.35);}
    const arm=addPart(g,'latticeCrane',[14,0,-7.3]);arm.rotation.x=-Math.PI/2;
    pipe(g,[[-9,-5.1,6.3],[0,-5.1,6.3],[14,-5.1,6.3],[28,-5.1,6.3],[37,-5.1,6.3]],.2,'ochre');
    const adapter=addPart(g,'truss',[43.5,0,0]);adapter.scale.set(.4,1,1);engineBank(g,50,[[-3,-3.2],[-3,3.2],[3,-3.2],[3,3.2]]);
    for(const x of [-12,40])for(const z of [-5.6,5.6])addPart(g,'rcs',[x,-5.8,z]);
  }else{
    // Open U-shaped recovery bed with an offset cabin and mismatched external stores.
    for(const z of [-5.1,5.1])for(const x of [2,14]){const t=addPart(g,'truss',[x,-1.2,z],{omitFront:x===14});t.scale.set(1,.65,.52);}
    for(const x of [-3.5,8,20]){beam(g,[x,-2.8,-5.1],[x,-2.8,5.1],.4);panel(g,[1.4,.15,8],[x,-2.5,0],'deck',.035);}
    addPart(g,'cabin',[-9.5,.6,4.4]);smallPressurePod(g,[-8,-3,4.4],.65);addPart(g,'coupler',[-4.6,0,4.4]);
    neck(group(g,'offset cabin connector',[0,.5,4.4]),-5.8,-3.5);for(const x of [-9,-6.8])beam(g,[x,-1.5,4.4],[x,-2.3,4.4],.3);
    addPart(g,'cargo',[4,-1,-8.8],{color:'rust'});addPart(g,'cargo',[16,-.7,8.8],{color:'blue'});
    for(const p of [[-4,1.2,-5],[11,1.3,-5],[22,2,0],[-2,-1.8,8.5]])addPart(g,'service',p);
    const c1=addPart(g,'crane',[0,1.2,-5.2]);c1.rotation.set(Math.PI/2,-.9,0);
    const c2=addPart(g,'crane',[15,1.2,5.2]);c2.rotation.set(-Math.PI/2,2.3,0);
    for(const x of [2,14])for(const z of [-5.1,5.1])undercarriage(g,x,z);
    for(const [x,z] of [[4,-8.8],[16,8.8]]){rack(g,x,-1,z);restraintLug(g,x,z,-4.6);}
    for(const z of [-3.5,3.5]){beam(g,[-3,-1.5,z],[-3,1,z],.22,'ochre');panel(g,[1.3,.5,1.1],[-3,1,z],'hazard',.06);}
    for(const z of [-5,5]){handholdRun(g,[2,.5,-Math.sign(z)*5.1],[10,.5,-Math.sign(z)*5.1]);addPart(g,'rcs',[-4,-2,z]);}
    engineBank(g,28,[[-1.5,-5],[-1.5,5],[2,0]]);panel(g,[2.4,6,13],[22,-.2,0],'dark',.2);
  }
  g.userData.units='metres';g.userData.family='Driftworks industrial / study 02';return g;
}
export function setCranePose(root,deployment){const t=Math.max(0,Math.min(1,deployment));root.traverse(o=>{if(o.userData.joint==='handling-shoulder')o.rotation.z=.32-t*.68;if(o.userData.joint==='handling-elbow')o.rotation.z=-.75+t*1.15;if(o.userData.joint==='handling-wrist')o.rotation.x=.35+t*.9;});}
export function setArmExtension(root,fraction){const t=Math.max(0,Math.min(1,fraction));root.traverse(o=>{if(o.userData.joint==='handling-extension')o.position.x=o.userData.restX+t*o.userData.stroke;});}
export function setHoistPayout(root,fraction){setArmExtension(root,fraction);}


// Static review copy, batched by material. Editable source/pivots remain untouched.
export function batchStatic(root){
  root.updateMatrixWorld(true);const byMaterial=new Map(),inverse=new T.Matrix4().copy(root.matrixWorld).invert();
  root.traverse(o=>{if(!o.isMesh)return;const key=o.material;let bucket=byMaterial.get(key);if(!bucket){bucket={positions:[],normals:[],uvs:[]};byMaterial.set(key,bucket);}const geo=o.geometry.index?o.geometry.toNonIndexed():o.geometry,transform=new T.Matrix4().multiplyMatrices(inverse,o.matrixWorld),normalMatrix=new T.Matrix3().getNormalMatrix(transform),p=geo.attributes.position,n=geo.attributes.normal,uv=geo.attributes.uv,v=new T.Vector3();for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i).applyMatrix4(transform);bucket.positions.push(v.x,v.y,v.z);v.fromBufferAttribute(n,i).applyNormalMatrix(normalMatrix);bucket.normals.push(v.x,v.y,v.z);bucket.uvs.push(uv?uv.getX(i):0,uv?uv.getY(i):0);}});
  const result=new T.Group();result.name=root.name+' / static display';
  for(const [material,b] of byMaterial){const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(b.positions,3));geo.setAttribute('normal',new T.Float32BufferAttribute(b.normals,3));geo.setAttribute('uv',new T.Float32BufferAttribute(b.uvs,2));geo.computeBoundingSphere();const m=new T.Mesh(geo,material);m.castShadow=true;m.receiveShadow=true;result.add(m);}
  return result;
}
export function disposeBatch(root){root.traverse(o=>{if(o.isMesh)o.geometry.dispose();});}

// Embedded glTF 2.0: share mesh/accessor data, retain named part/joint transforms.
export function exportGLTF(root){
  const doc={asset:{version:'2.0',generator:'Driftworks industrial kit / study 02'},scene:0,scenes:[{nodes:[]}],nodes:[],meshes:[],materials:[],buffers:[],bufferViews:[],accessors:[]};
  const chunks=[];let bytes=0;const matMap=new Map(),geoMap=new Map(),meshMap=new Map();
  let usesAtlas=false;root.traverse(o=>{if(o.isMesh&&o.material===materials.paint)usesAtlas=true;});
  if(atlasURI&&usesAtlas){doc.images=[{uri:atlasURI}];doc.samplers=[{magFilter:9729,minFilter:9987,wrapS:33071,wrapT:33071}];doc.textures=[{source:0,sampler:0}];}
  function accessor(array,type,target){const view=doc.bufferViews.push({buffer:0,byteOffset:bytes,byteLength:array.byteLength,target})-1;chunks.push(new Uint8Array(array.buffer,array.byteOffset,array.byteLength));bytes+=array.byteLength;const padding=(4-bytes%4)%4;if(padding){chunks.push(new Uint8Array(padding));bytes+=padding;}const components=type==='VEC3'?3:type==='VEC2'?2:1,item={bufferView:view,componentType:array instanceof Float32Array?5126:array instanceof Uint32Array?5125:5123,count:array.length/components,type};if(type==='VEC3'){item.min=[Infinity,Infinity,Infinity];item.max=[-Infinity,-Infinity,-Infinity];for(let i=0;i<array.length;i++){const j=i%3;item.min[j]=Math.min(item.min[j],array[i]);item.max[j]=Math.max(item.max[j],array[i]);}}return doc.accessors.push(item)-1;}
  function visit(obj){
    const node={name:obj.name||'detail',translation:obj.position.toArray(),rotation:obj.quaternion.toArray(),scale:obj.scale.toArray()};if(obj.userData.sockets)node.extras={sockets:obj.userData.sockets,units:'metres'};const index=doc.nodes.push(node)-1;
    if(obj.isMesh){
      const geo=obj.geometry,mat=obj.material;
      if(!matMap.has(mat)){const pbr={baseColorFactor:[...mat.color.toArray(),1],metallicFactor:mat.metalness,roughnessFactor:mat.roughness};if(mat===materials.paint&&atlasURI)pbr.baseColorTexture={index:0};const entry={name:Object.keys(materials).find(k=>materials[k]===mat),pbrMetallicRoughness:pbr};if(mat.emissive&&mat.emissive.getHex()>0){entry.emissiveFactor=mat.emissive.toArray();if(mat.emissiveIntensity!==1){entry.extensions={KHR_materials_emissive_strength:{emissiveStrength:mat.emissiveIntensity}};doc.extensionsUsed=["KHR_materials_emissive_strength"];}}matMap.set(mat,doc.materials.length);doc.materials.push(entry);}
      if(!geoMap.has(geo)){const attrs={POSITION:accessor(geo.attributes.position.array,'VEC3',34962),NORMAL:accessor(geo.attributes.normal.array,'VEC3',34962)};if(geo.attributes.uv)attrs.TEXCOORD_0=accessor(Float32Array.from(geo.attributes.uv.array,(value,i)=>i%2?1-value:value),"VEC2",34962);const primitive={attributes:attrs};if(geo.index)primitive.indices=accessor(geo.index.array,'SCALAR',34963);geoMap.set(geo,primitive);}
      const key=geo.uuid+':'+mat.uuid;if(!meshMap.has(key)){meshMap.set(key,doc.meshes.length);doc.meshes.push({name:obj.name,primitives:[{...geoMap.get(geo),material:matMap.get(mat)}]});}node.mesh=meshMap.get(key);
    }
    if(obj.children.length)node.children=obj.children.map(visit);return index;
  }
  doc.scenes[0].nodes.push(visit(root));const buffer=new Uint8Array(bytes);let offset=0;for(const c of chunks){buffer.set(c,offset);offset+=c.length;}let binary='';for(let i=0;i<buffer.length;i+=8192)binary+=String.fromCharCode(...buffer.subarray(i,i+8192));doc.buffers.push({byteLength:bytes,uri:'data:application/octet-stream;base64,'+btoa(binary)});return JSON.stringify(doc);
}
