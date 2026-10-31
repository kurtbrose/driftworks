import * as T from 'three';

// Frozen local reference assets. No simulation or export ownership.
function meshGroup(batches,convert){
  const group=new T.Group();
  for(const batch of batches){
    const positions=[],normals=[];
    for(let i=0;i<batch.vertices.length;i+=6){const v=batch.vertices;positions.push(...convert(v.slice(i,i+3),false));normals.push(...convert(v.slice(i+3,i+6),true));}
    const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.setAttribute('normal',new T.Float32BufferAttribute(normals,3));
    const material=new T.MeshStandardMaterial({color:new T.Color(...batch.color),metalness:.2,roughness:.7});
    const mesh=new T.Mesh(geometry,material);mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);
  }
  return group;
}

export function makeReferenceTemplates(crewBatches,fighterData){
  // The shared sampled astronaut poses use Z up, with one unit of height.
  const crew=meshGroup(crewBatches,(v)=>[v[0],v[2],-v[1]]);
  // High-visibility outer suits stay readable against the ivory hull panels.
  crew.traverse(o=>{if(o.isMesh&&o.material.color.r>.8&&o.material.color.g>.8)o.material.color.setRGB(.75,.24,.045);});
  const bounds=new T.Box3().setFromObject(crew,true),height=bounds.max.y-bounds.min.y;
  if(!(height>0))throw new Error('Scale crew has no height');
  const factor=1.8/height;
  crew.traverse(o=>{if(o.isMesh){o.geometry.translate(0,-bounds.min.y,0);o.geometry.scale(factor,factor,factor);}});
  crew.name='Suited astronaut / 1.80 m';crew.userData.heightMeters=1.8;
  // Preserve the existing reference fighter's authored conversion, including normals.
  const units=fighterData.source.metersPerUnit;
  const fighter=meshGroup(fighterData.batches,(v,normal)=>{const scale=normal?1:units;return [-v[0]*scale,v[2]*scale,v[1]*scale];});
  fighter.name='Spitfire reference fighter / 12 m';
  const fighterBounds=new T.Box3().setFromObject(fighter,true);
  const length=fighterBounds.max.x-fighterBounds.min.x;
  if(Math.abs(length-fighterData.source.lengthMeters)>.01)throw new Error('Reference fighter metre calibration changed');
  fighter.userData.lengthMeters=length;
  return {crew,fighter};
}

const placements={
modular:[[-2,8.7,1],[14,0,8.8],[-15,3.5,-3.3]],
hauler:[[-3,4.2,7.8],[11,-.2,-7.2],[-16,3.8,-3.3]],
tug:[[-8,5.1,-2.8],[0,4.7,3.8],[-7,-3.8,3.5]],
tanker:[[-3.5,7.8,1.1],[10.2,2,7.4],[-16.4,3.8,-3.3]],
salvager:[[8,1.7,0],[9.8,-.6,-1.9],[-11.6,4.2,2.2]],
bulkCarrier:[[-5,7.6,2],[31,1.2,9.5],[-22.2,3.5,-3.3]],
bulkTank:[[-5,7.6,1.5],[8,3.8,7.6],[7.5,-4,8.3]],
latticeCrane:[[2,3,2],[7,-2,3],[12,3,-3]]
};
export function createScaleReferences(model,kind,templates){
  const group=new T.Group();group.name='Scale references / viewer only';
  function crewFor(ship,type){
    for(const [i,p] of placements[type].entries()){const actor=new T.Group(),crew=templates.crew.clone(true);crew.position.y=-.9;actor.add(crew);actor.position.set(...p).add(ship.position);actor.rotation.set(...[[.35,.25,-.65],[-.45,-.9,1.15],[.85,1.3,-1.4]][i]);actor.userData.heightMeters=1.8;actor.name='Free-floating EVA crew';group.add(actor);}
  }
  if(kind==='fleet')for(const ship of model.children)crewFor(ship,ship.name);
  else if(placements[kind])crewFor(model,kind);
  else return group;
  const bounds=new T.Box3().setFromObject(model,true),fighter=templates.fighter.clone(true);
  fighter.position.set(bounds.min.x+8,-1.5,bounds.max.z+11);group.add(fighter);
  group.userData.crewHeightMeters=1.8;group.userData.fighterLengthMeters=templates.fighter.userData.lengthMeters;
  return group;
}
