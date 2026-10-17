import * as THREE from '../vendor/three/build/three.module.js';

// Shared original-appearance geology for the comparison and excavation study.
export function createRockMaterial(asteroid,craterTexture,{detailMode="legacy",originalResponse=true,specular=true}={}){
  const DW=window.Driftworks,api=DW.scene3d,units=DW.sim.METERS_PER_UNIT;
  let uniforms;
  const material=new THREE.MeshPhysicalMaterial({color:0xffffff,roughness:1,metalness:0,specularIntensity:specular?1:0,side:THREE.DoubleSide,flatShading:detailMode==='geometry'||detailMode==='micro'});
  const values=DW.asteroidArt.uniforms(api.visualFor(asteroid));
  uniforms=Object.fromEntries(Object.entries(values).map(([key,value])=>[key,{value}]));
  Object.assign(uniforms,{uOriginalResponse:{value:originalResponse?1:0},uSolarGate:{value:1},uCraterData:{value:craterTexture},uCraterTextureWidth:{value:1440},uCraterCount:{value:api.impactsFor(asteroid).length},uRotation:{value:0},uRockNormalMatrix:{value:new THREE.Matrix3()},uRockCut:{value:asteroid.excavation.level>0?1:0},uRockCutHeight:{value:asteroid.excavation.level>0?-Math.min(.42,Math.max(.03,asteroid.excavation.depthM/units/asteroid.radius)):0}});
  material.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,uniforms);
    shader.vertexShader='varying vec3 vRockBroadNormal;varying vec3 vRockLocal;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvRockLocal=position;vRockBroadNormal=normalMatrix*normal;');
    const geology=api.rockSurfaceShader().replace('const float PI=3.141592653589793;','');
    shader.fragmentShader='varying vec3 vRockBroadNormal;varying vec3 vRockLocal;uniform mat3 uRockNormalMatrix;uniform float uOriginalResponse,uSolarGate,uRotation,uRockCut,uRockCutHeight;\n'+shader.fragmentShader.replace('#include <common>','#include <common>\n'+geology);
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      vec3 rockSphere=normalize(vec3(vRockLocal.xy/boundary(vRockLocal.xy),vRockLocal.z/.78));
      vec4 rockCrater=${detailMode==='geometry'||detailMode==='micro'?'vec4(0.)':'globeCraters(vRockLocal)'};
      float q=length(vRockLocal.xy)/boundary(vRockLocal.xy);
      float dome=.78*sqrt(max(0.,1.-q*q));
      float exterior=uRockCut<.5?1.:step(abs(abs(vRockLocal.z)-dome),.12);
      float rockOcc=exterior>.5?rockCrater.w:clamp((uRockCutHeight-vRockLocal.z)*1.1,0.,.22);
      diffuseColor.rgb=sRGBTransferEOTF(vec4(globeColor(rockSphere),1.)).rgb${detailMode==='legacy'?'*mix(1.-rockOcc*.5,1.,uOriginalResponse)':''};`);
    // Legacy mesh normals are authoritative; triangle winding and camera handedness can differ.
    if(detailMode==='normals'||detailMode==='legacy')shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_begin>','#include <normal_fragment_begin>\nnormal=normalize(vNormal);nonPerturbedNormal=normal;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>','vec3 rockBodyNormal=normalize(vRockBroadNormal);\n#include <normal_fragment_maps>');
    // Gate only distant sunlight with the broad body normal; lamps keep their local response.
    let solarLighting=THREE.ShaderChunk.lights_fragment_begin.replace('getDirectionalLightInfo( directionalLight, directLight );',`getDirectionalLightInfo( directionalLight, directLight );
      directLight.color *= mix(1.,exterior>.5?smoothstep(-.03,.10,dot(rockBodyNormal,directLight.direction)):1.,uSolarGate);`);
    const directionalStart=solarLighting.indexOf('getDirectionalLightInfo( directionalLight, directLight );');
    const directCall='RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );';
    const directOffset=solarLighting.indexOf(directCall,directionalStart);
    if(directionalStart<0||directOffset<0)throw new Error('Three.js directional-light shader hook changed');
    solarLighting=solarLighting.slice(0,directOffset)+`if(uOriginalResponse>.5){
      float rockNdl=max(0.,dot(normal,directLight.direction));
      float rockSolarPower=directLight.color.r/PI;
      float rockFill=ambientLightColor.r*${detailMode==='legacy'?'(1.-rockOcc*.7)':'1.'};
      vec3 rockBase=globeColor(rockSphere);
      vec3 rockDisplay=rockBase*(rockFill+pow(rockNdl,.82)*rockSolarPower);
      rockDisplay+=vec3(1.,.94,.81)*pow(rockNdl,8.)*.035*rockSolarPower/.98;
      rockSolarDiffuse+=sRGBTransferEOTF(vec4(rockDisplay,1.)).rgb-sRGBTransferEOTF(vec4(rockBase*rockFill,1.)).rgb;
    }else{`+directCall+`}`+solarLighting.slice(directOffset+directCall.length);
    shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_begin>','vec3 rockSolarDiffuse=vec3(0.);\n'+solarLighting);
    shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_end>',`#include <lights_fragment_end>
      if(uOriginalResponse>.5){
        reflectedLight.directDiffuse *= ${detailMode==='legacy'?'(1.-rockOcc*.5)':'1.'};
        reflectedLight.directDiffuse += rockSolarDiffuse;
        float rockFill=ambientLightColor.r*${detailMode==='legacy'?'(1.-rockOcc*.7)':'1.'};
        reflectedLight.indirectDiffuse=sRGBTransferEOTF(vec4(globeColor(rockSphere)*rockFill,1.)).rgb;
      }`);
    if(detailMode!=='geometry')shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
      float footprint=max(.000000001,uPixelFootprint*vViewPosition.z);
      vec3 fine=rockBump(vRockLocal,footprint);
      vec3 bump=uRockNormalMatrix*${detailMode==='micro'?'fine':'(fine+rockCrater.xyz*exterior)'};
      bump-=normal*dot(bump,normal);
      normal=normalize(normal-bump*(exterior>.5?1.:.6));`);
  };
  material.customProgramCacheKey=()=> 'driftworks-shared-geology-standard-r4-'+detailMode;
  return {material,uniforms};
}
