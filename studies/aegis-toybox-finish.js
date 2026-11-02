import * as T from 'three';
import {armor,pale,dark,trim,gold} from 'aegis-parts';
import {ventBaseMaterial,ventCandidateMaterial} from 'aegis-vents';

// Review-only material experiment. One shared pair of 256px maps, no mesh additions.
export const finishNotes={
 'prow-lance':['Candidate: louvered vent texture on the sixteen existing roof inserts. Switch to Original to compare.','A shared tile supplies recessed slots, metal lips and corner fasteners, aligned inside each insert.'],
 'prow-command':['Use the same armor finish as the long prow so both belong to one shipyard.','A small crest or service stencil would distinguish its broad side faces.'],
 'hull-standard':['Highest reuse: improve the shared armor and recessed service-band finish first.','Keep the broad panels quiet; the existing ribs, hatches and windows already supply scale.'],
 'hull-hangar':['Keep the exterior armor consistent with the standard hull.','Next targeted texture: directional deck paint and darker bulkhead recesses inside the open passage.'],
 'hull-utility':['Separate painted tanks, bare restraints and dark machinery by roughness.','A pump/service label would help identify the exposed equipment without more pipes.'],
 'hull-missile':['Give launch covers subtle paint variation without obscuring their repeated grid.','Next targeted texture: cell numbers and a restrained perimeter safety band.'],
 'hull-operations':['Differentiate the control galleries from the hangar armor with a finish change.','Next targeted texture: gallery glazing and a small flight-control identifier.'],
 'hull-reactor':['Use a matte finish on the cooling panels and a more metallic finish on their frame.','Next targeted texture: directional radiator ribs; skip dense labels on the cooling surface.'],
 'hull-sensor':['Keep the sensor cheeks dark and non-glowing, with metal support frames.','Next targeted texture: fine planar array pattern rather than additional antenna geometry.'],
 'drive-standard':['Separate painted armor from bare engine collars and darker heat-resistant throats.','Next targeted texture: axial collar seams and restrained heat staining around the exhaust.'],
 'drive-heavy':['Share the standard drive finishes across all five engines.','Keep heat staining localized; a whole dark stern would lose the engine silhouette.'],
 'attachment-battery':['Use painted turret armor and smoother exposed barrels as separate material roles.','Next targeted texture: mounting-ring wear and a small battery identifier.'],
 'attachment-main':['The broad turret cheeks benefit from restrained paint and roughness breakup.','Keep barrel interiors dark; add heat discoloration locally rather than dirtying the whole turret.'],
 'attachment-pd':['Reuse the main battery finish; avoid bespoke tiny texture assets.','Judge the small turret at fleet distance before spending time on fine stencils.'],
 'attachment-sensor':['Broad armored tiers and inset array faces replace exposed aerials.','The same assembly is reused on sensor hulls and upper/lower sensor sockets.'],
 'attachment-cargo':['Use a painted casing with more metallic restraint bands.','Next targeted texture: access-panel seams and one service identifier.'],
 'attachment-empty':['Use a darker mounting face and a more metallic perimeter.','A socket index and alignment marks would make the bare plate useful as assembly language.'],
 'structure-bridge':['Window banks wrap the occupied tiers on all four sides, with a mix of lit and dark panes.','A compact enclosed mast and solid bridge wings give the command decks a naval silhouette.'],
 'structure-coupler':['Use bare-metal locks against a duller collar face.','Next targeted texture: alignment ticks and a few fastener heads instead of more ring geometry.']
};
let maps;
function surfaceMaps(){
 if(maps)return maps;
 const size=256,color=new Uint8Array(size*size*4),rough=new Uint8Array(size*size*4);let seed=417;
 const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const i=(y*size+x)*4,grain=random();
  const value=Math.round(247+(grain-.5)*7);
  color[i]=color[i+1]=color[i+2]=value;color[i+3]=255;
  rough[i]=rough[i+1]=rough[i+2]=Math.round(225+(grain-.5)*22);rough[i+3]=255;
 }
 function texture(data,srgb){const t=new T.DataTexture(data,size,size,T.RGBAFormat);t.wrapS=t.wrapT=T.RepeatWrapping;t.magFilter=T.LinearFilter;t.minFilter=T.LinearMipmapLinearFilter;t.generateMipmaps=true;t.colorSpace=srgb?T.SRGBColorSpace:T.NoColorSpace;t.needsUpdate=true;return t;}
 maps={color:texture(color,true),rough:texture(rough,false)};return maps;
}
const candidates=new WeakMap();
function candidate(original){
 if(original===ventBaseMaterial)return ventCandidateMaterial();
 if(candidates.has(original))return candidates.get(original);
 if(original!==armor&&original!==pale&&original!==dark&&original!==trim&&original!==gold)return original;
 const material=original.clone(),textures=surfaceMaps();
 material.map=textures.color;material.roughnessMap=textures.rough;
 if(original===armor||original===pale){material.metalness=.3;material.roughness=.78;}
 else if(original===dark){material.metalness=.25;material.roughness=.92;}
 else{material.metalness=.78;material.roughness=.5;}
 material.name='Toybox surface candidate';candidates.set(original,material);return material;
}
function projectedUV(geometry){
 if(geometry.attributes.uv)return;
 const p=geometry.attributes.position,uv=new Float32Array(p.count*2),a=new T.Vector3(),b=new T.Vector3(),c=new T.Vector3(),n=new T.Vector3();
 // Review batches are non-indexed. Pick one projection per triangle, avoiding
 // interpolation between unrelated UV axes on the smooth barrel surfaces.
 for(let i=0;i<p.count;i+=3){a.fromBufferAttribute(p,i);b.fromBufferAttribute(p,i+1);c.fromBufferAttribute(p,i+2);n.crossVectors(b.sub(a),c.sub(a));
  const abs=[Math.abs(n.x),Math.abs(n.y),Math.abs(n.z)],axis=abs.indexOf(Math.max(...abs)),axes=[0,1,2].filter(k=>k!==axis);
  for(let j=0;j<3;j++){uv[(i+j)*2]=p.array[(i+j)*3+axes[0]]/64;uv[(i+j)*2+1]=p.array[(i+j)*3+axes[1]]/64;}
 }
 geometry.setAttribute('uv',new T.BufferAttribute(uv,2));
}
export function applyReviewFinish(root,enabled){
 root.traverse(o=>{if(!o.isMesh)return;o.userData.originalFinish||=o.material;if(enabled)projectedUV(o.geometry);o.material=enabled?candidate(o.userData.originalFinish):o.userData.originalFinish;});
}
export const finishCost={textureBytes:2*256*256*4*4/3,extraTriangles:0,extraDraws:0};
