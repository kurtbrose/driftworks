import * as T from 'three';
import {mid,wedge,drive,attach,bridge,box,loft,sensor,armor,pale,dark,trim,blue,amber} from 'aegis-parts';

// Authoring units are exactly nine metres; all final roots use that conversion.
export const hullTypes=['standard','hangar','utility','missile','operations','reactor','sensor'];
export function socketChoices(type,bank){return type==='missile'||(bank==='upper'&&['sensor','operations'].includes(type))?['none']:['none','turret','sensor','cargo'];}
export const labels={standard:'Armor / battery',hangar:'Through hangar',utility:'Utility / replenishment',missile:'Missile magazine',operations:'Flight operations',reactor:'Reactor / cooling',sensor:'Picket / sensor'};
export function section(type){
 if(!hullTypes.includes(type))throw new Error('Unknown Aegis section: '+type);
 const g=new T.Group();g.name='Section / '+type;g.userData={type,pitchMetres:144,sockets:{forward:[-72,0,0],aft:[72,0,0]}};
 if(['standard','hangar','utility'].includes(type))mid(g,type);
 if(type==='missile'){
  mid(g,'standard');
  for(const side of [-1,1]){
   const rack=new T.Group();rack.name=side>0?'dorsal missile cassette':'ventral missile cassette';rack.rotation.x=side>0?0:Math.PI;g.add(rack);
   box(rack,0,4.7,0,11,1.1,6,trim);
   for(const x of [-4,-2,0,2,4])for(const z of [-2,0,2]){
    box(rack,x,5.35,z,1.7,.3,1.7,dark);box(rack,x,5.55,z,1.45,.12,1.45,pale);box(rack,x-.5,5.65,z,.12,.08,1.1,amber);
   }
  }
 }
 if(type==='operations'){
  mid(g,'hangar');
  // Outboard control galleries preserve the entire original through passage.
  for(const side of [-1,1]){
   const p=loft(g,[[-5,2,1.8],[-4,3,2.4],[4,3,2.4],[5,2,1.8]],armor);p.position.set(0,5.2,side*5.4);
   for(const x of [-2.8,-1.4,0,1.4,2.8])box(g,x,5.4,side*7, .65,.22,.08,blue);
  }
 }
 if(type==='reactor'){
  mid(g,'utility');
  for(const side of [-1,1]){
   box(g,0,0,side*9,11,.45,6,dark);
   for(const x of [-4,0,4]){box(g,x,0,side*7,.35,.7,8,trim);}
   for(let x=-5;x<=5;x+=1)box(g,x,.3,side*9,.12,.12,5.5,trim);
   box(g,0,.2,side*12,11,.3,.3,armor);
  }
 }
 if(type==='sensor'){
  mid(g,'standard');sensor(g,0,4.1,0);
  for(const side of [-1,1]){
   box(g,0,2,side*7,6,3,.6,trim);
   box(g,0,2,side*7.4,5.5,2.5,.15,dark);
   for(const x of [-2,-1,0,1,2])box(g,x,2,side*7.51,.12,2.2,.05,pale);
   box(g,0,2,side*5.8,2,1,3,armor);
  }
 }
 return g;
}
export const recipes=[
 {name:'Picket frigate',prow:'command',drive:'standard',modules:['sensor','standard'],upper:['none','turret'],lower:['none','none'],note:'Short hull, broad sensor cheeks and a restrained gun fit. A screen ship with a different profile from the line combatants.'},
 {name:'Missile destroyer',prow:'lance',drive:'standard',modules:['standard','missile','missile'],upper:['turret','none','none'],lower:['none','none','none'],note:'Long lance prow and two magazine cassettes. Repeated cell covers replace the repeated turret silhouette.'},
 {name:'Fleet cruiser',prow:'lance',drive:'standard',modules:['standard','hangar','reactor','standard'],upper:['turret','none','none','turret'],lower:['turret','none','none','none'],note:'The familiar general-purpose hull, with one open hangar and one cooling section breaking the armor rhythm.'},
 {name:'Escort carrier',prow:'command',drive:'standard',modules:['operations','hangar','hangar','reactor'],upper:['none','none','none','none'],lower:['none','none','none','none'],note:'A compact aviation hull: one flight-control bay, two open hangars and a cooling cassette, with sparse raised weapons.'},
 {name:'Battlecruiser',prow:'lance',drive:'heavy',modules:['standard','missile','standard','reactor','standard'],upper:['turret','none','turret','none','turret'],lower:['turret','none','turret','none','none'],note:'A long gun-bearing spine with one missile section and exposed thermal wings. Heavy drive hardware is reused unchanged.'},
 {name:'Fleet carrier',prow:'command',drive:'heavy',modules:['sensor','operations','hangar','hangar','hangar','reactor'],upper:['none','none','none','none','none','none'],lower:['none','none','none','none','none','none'],note:'Three consecutive through bays create a sustained open-sided silhouette. Sensors and flight control sit forward of the launch cluster.'},
 {name:'Arsenal dreadnaught',prow:'lance',drive:'heavy',modules:['standard','missile','standard','missile','reactor','standard','standard'],upper:['turret','none','turret','none','none','turret','turret'],lower:['turret','none','turret','none','none','turret','none'],note:'A heavier line ship from the same armor, magazine and drive parts. Upper and lower fits deliberately differ.'},
 {name:'Command / support cruiser',prow:'command',drive:'heavy',modules:['sensor','standard','operations','utility','reactor'],upper:['none','sensor','none','cargo','none'],lower:['none','none','none','cargo','none'],note:'Sensor arrays, flight control and service stores give the fleet a supporting capital ship instead of another all-gun hull.'}
];
export function vessel(index,options={}){
 const preset=recipes[index];if(!preset)throw new Error('Unknown Aegis recipe');
 const r={...preset,modules:options.modules||preset.modules,upper:options.upper||preset.upper,lower:options.lower||preset.lower};
 if(r.modules.length!==preset.modules.length||r.modules.some(t=>!hullTypes.includes(t)))throw new Error('Invalid section manifest');
 for(const bank of [r.upper,r.lower])if(bank.length!==r.modules.length||bank.some(t=>!['none','turret','cargo','sensor'].includes(t)))throw new Error('Invalid socket manifest');
 for(const bank of ['upper','lower'])if(r[bank].some((kind,i)=>!socketChoices(r.modules[i],bank).includes(kind)))throw new Error('Socket reserved by mission equipment');
 const root=new T.Group();root.name=r.name;root.userData={units:'metres',recipe:index,manifest:r.modules.slice()};
 const nose=r.prow==='lance'?37:26,total=nose+r.modules.length*16+12,gap=Math.max(0,Math.min(12,Number(options.separation)||0));
 let cursor=-total/2,slot=0;
 function add(name,length,build){const g=new T.Group();g.name=name;g.position.x=cursor+length/2+(slot++-(r.modules.length+1)/2)*gap;root.add(g);build(g);cursor+=length;return g;}
 add('P_'+r.prow,nose,g=>wedge(g,nose));
 r.modules.forEach((type,i)=>add('M_'+(i+1)+'_'+type,16,g=>{
  g.add(section(type));
  attach(g,r.upper[i],1,0,false);attach(g,r.lower[i],-1,0,false);
 }));
 add('E_'+r.drive,12,g=>{drive(g,r.drive==='heavy');const command=new T.Group();command.name='terminal command mount';command.position.x=-3.5;g.add(command);bridge(command);});root.scale.setScalar(9);root.userData.nominalLengthMetres=total*9;return root;
}
export function partsBench(){const root=new T.Group();hullTypes.forEach((type,i)=>{const g=section(type);g.scale.setScalar(9);g.position.set((i%4)*240,0,Math.floor(i/4)*320);root.add(g);});return root;}
export function fleet(){const root=new T.Group();recipes.forEach((r,i)=>{const ship=vessel(i);ship.position.set((i%2)*1950,0,Math.floor(i/2)*600);root.add(ship);});return root;}
// Static study copy only. Preserve editable part and turret trees above.
export function batchStatic(root){
 root.updateMatrixWorld(true);const buckets=new Map(),v=new T.Vector3(),n=new T.Vector3();
 root.traverse(o=>{if(!o.isMesh)return;const geo=o.geometry,p=geo.attributes.position,normals=geo.attributes.normal,nm=new T.Matrix3().getNormalMatrix(o.matrixWorld);let b=buckets.get(o.material);if(!b)buckets.set(o.material,b={positions:[],normals:[]});
 const count=geo.index?geo.index.count:p.count,flip=o.matrixWorld.determinant()<0;
 for(let j=0;j<count;j++){const order=flip?Math.floor(j/3)*3+[0,2,1][j%3]:j,k=geo.index?geo.index.getX(order):order;v.fromBufferAttribute(p,k).applyMatrix4(o.matrixWorld);n.fromBufferAttribute(normals,k).applyNormalMatrix(nm);b.positions.push(v.x,v.y,v.z);b.normals.push(n.x,n.y,n.z);}
 });
 const result=new T.Group();for(const [material,b] of buckets){const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(b.positions,3));geo.setAttribute('normal',new T.Float32BufferAttribute(b.normals,3));result.add(new T.Mesh(geo,material));}return result;
}
export function disposeBatch(root){root.traverse(o=>{if(o.isMesh)o.geometry.dispose();});}
