import * as T from 'three';
import {part,standardBay,buildConsist} from 'industrial-kit';

// Offline shipyard proposals. All positions and interfaces stay in metres.
const steel=new T.MeshStandardMaterial({color:0x485556,roughness:.7,metalness:.6});
const radiator=new T.MeshStandardMaterial({color:0x202e34,roughness:.8,metalness:.4});
const box=new T.BoxGeometry(1,1,1);
function block(root,size,pos,material=steel){const m=new T.Mesh(box,material);m.scale.set(...size);m.position.set(...pos);root.add(m);return m;}
function hardware(root,name,pos){const p=part(name);p.position.set(...pos);root.add(p);return p;}
export const inserts=['cargo','tank','habitat','empty','power','workshop','survey','stores'];
export function bay(type){
  if(!inserts.includes(type))throw new Error('Unknown fleet insert: '+type);
  if(['cargo','tank','habitat','empty'].includes(type))return standardBay(type);
  const root=standardBay('empty');root.name='DW-14 / '+type;root.userData.payload=type;
  if(type==='power'){
    for(const z of [-3,3])hardware(root,'service',[0,0,z]);
    for(const z of [-1,1]){
      block(root,[10,.3,5],[0,0,z*9],radiator);
      for(const x of [-4,4])block(root,[.25,.4,8],[x,0,z*6]);
      for(let x=-4.5;x<=4.5;x+=1)block(root,[.08,.38,4.8],[x,0,z*9]);
    }
  }else if(type==='workshop'){
    hardware(root,'cargo',[0,-2.5,0]);hardware(root,'service',[0,2,3]);
    const arm=hardware(root,'crane',[0,0,-6.3]);arm.rotation.x=-Math.PI/2;
  }else if(type==='survey'){
    hardware(root,'service',[0,-2,0]);block(root,[.4,10,.4],[0,4,0]);
    const dish=new T.Mesh(new T.SphereGeometry(3,24,12,0,Math.PI*2,0,.65),steel);dish.position.y=9;dish.rotation.z=.5;root.add(dish);
    for(const z of [-4,4]){block(root,[.2,7,.2],[3,2,z]);hardware(root,'rcs',[-4,0,z]);}
  }else{
    for(const x of [-3,3])for(const z of [-3,3])hardware(root,'service',[x,0,z]);
    hardware(root,'coupler',[0,3,0]);
  }
  const size=new T.Box3().setFromObject(root,true).getSize(new T.Vector3());
  root.userData.payloadEnvelope={length:size.x,width:size.z,height:size.y};
  root.userData.studyInsert=type;return root;
}
export const recipes=[
  {name:'Port tender',layout:'single',load:['workshop'],note:'Short service boat; open tool bay and capture arm.'},
  {name:'Local parcel boat',layout:'single',load:['cargo','empty'],note:'A partly unloaded feeder. Empty structure is part of the silhouette.'},
  {name:'Crew transfer',layout:'single',load:['habitat','stores'],note:'Pressure module plus replaceable life-support stores.'},
  {name:'Survey launch',layout:'single',load:['survey','power'],note:'Sensor mast and wide thermal cassette.'},
  {name:'Fuel distributor',layout:'single',load:['tank','tank','stores'],note:'Spherical tanks and pump/spares cassette.'},
  {name:'Long-haul mixed freight',layout:'single',load:['cargo','tank','empty','cargo','power'],note:'Uneven loading and one thermal bay interrupt the long spine.'},
  {name:'Recovery catamaran',layout:'twin',load:['workshop','empty'],note:'Parallel standard spines leave a clear central recovery slot.'},
  {name:'Expedition support',layout:'twin',load:['habitat','stores','power'],note:'Paired hulls with independent pressure cabins and drive banks.'},
  {name:'Crossbeam tank ferry',layout:'crossbeam',load:['tank'],note:'Three short standard hulls mounted across a rigid transverse carrier.'}
];
function spine(load){
  // Keep the proven terminals and locks; replace each scaffold insert as a unit.
  const root=buildConsist(load.map(()=> 'empty'));
  const old=root.children.filter(o=>o.userData.standardBay);
  old.forEach((o,i)=>{const replacement=bay(load[i]);replacement.position.copy(o.position);root.remove(o);root.add(replacement);});
  root.userData.manifest=load.slice();root.userData.bays.forEach((joint,i)=>{joint.payload=load[i];});return root;
}
export function vessel(index){
  const recipe=recipes[index];if(!recipe)throw new Error('Unknown fleet recipe');
  const root=new T.Group();root.name=recipe.name;root.userData.recipe=index;root.userData.units='metres';
  if(recipe.layout==='single')root.add(spine(recipe.load));
  else{
    const lanes=recipe.layout==='twin'?[-16,16]:[-28,0,28];
    lanes.forEach(z=>{const hull=spine(recipe.load);hull.position.z=z;root.add(hull);});
    const length=recipe.load.length*14;
    for(const x of [-9,length-4])block(root,[2,2,lanes[lanes.length-1]-lanes[0]+4],[x,0,0]);
    // Each spine keeps its independent pressure cabin and propulsion terminals.
  }
  return root;
}
export function fleet(){const root=new T.Group();recipes.forEach((r,i)=>{const ship=vessel(i);ship.position.set((i%3)*125,((i%2)*2-1)*5,Math.floor(i/3)*100);ship.rotation.y=(i%3-1)*.13;root.add(ship);});return root;}
