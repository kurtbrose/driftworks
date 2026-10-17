import * as THREE from '../vendor/three/build/three.module.js';
import {geometryFromInterleaved} from './asteroid-three-bridge.js';

const DW=window.Driftworks, api=DW.scene3d;
const asteroid=DW.sim.createInitialWorld().asteroids[0];
asteroid.excavation.level=1;
const e=asteroid.excavation, metres=asteroid.radius*DW.sim.METERS_PER_UNIT;
const depth=e.depthM/metres, center=new THREE.Vector3(e.pocketOffset.x,e.pocketOffset.y,-depth);
const host=document.getElementById('view'), status=document.getElementById('status');
const renderer=new THREE.WebGLRenderer({antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setClearColor(0x090e13);
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate=false;
host.prepend(renderer.domElement);
const scene=new THREE.Scene(), camera=new THREE.PerspectiveCamera(48,1,.001,20);
camera.up.set(0,0,1);
scene.add(new THREE.AmbientLight(0xc6d6e5,.24));
const sun=new THREE.DirectionalLight(0xffecd2,2.3);sun.position.set(-2,-3,4);scene.add(sun);
sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);
Object.assign(sun.shadow.camera,{left:-1.2,right:1.2,top:1.2,bottom:-1.2,near:.01,far:10});
sun.shadow.bias=-.0001;sun.shadow.normalBias=.001;
// Camera-mounted inspection light exposes the interior without adding kit assets.
const lamp=new THREE.PointLight(0xe1edf5,0,3,2);scene.add(lamp);
const material=new THREE.MeshStandardMaterial({color:0x726c62,roughness:1,side:THREE.DoubleSide});
material.onBeforeCompile=shader=>{
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vRockPoint; attribute float excavationWall; varying float vExcavationWall;')
    .replace('#include <begin_vertex>','#include <begin_vertex>\nvRockPoint=position;vExcavationWall=excavationWall;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
varying vec3 vRockPoint;
varying float vExcavationWall;
float rockHash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
float rockNoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
return mix(mix(mix(rockHash(i),rockHash(i+vec3(1,0,0)),f.x),mix(rockHash(i+vec3(0,1,0)),rockHash(i+vec3(1,1,0)),f.x),f.y),mix(mix(rockHash(i+vec3(0,0,1)),rockHash(i+vec3(1,0,1)),f.x),mix(rockHash(i+vec3(0,1,1)),rockHash(i+vec3(1,1,1)),f.x),f.y),f.z);}`)
    .replace('#include <color_fragment>',`#include <color_fragment>
float chips=rockNoise(vRockPoint*150.);
float grit=rockNoise(vRockPoint*1400.);
vec2 jointPoint=vec2(dot(vRockPoint,vec3(1.1,.4,.7)),dot(vRockPoint,vec3(-.3,1.2,.2)))*70.;
vec2 cell=floor(jointPoint), local=fract(jointPoint);
float nearest=10.,second=10.;
for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++){
vec2 offset=vec2(float(i),float(j));
vec2 site=offset+vec2(rockHash(vec3(cell+offset,3.)),rockHash(vec3(cell+offset,9.)));
float d=dot(site-local,site-local);
if(d<nearest){second=nearest;nearest=d;}else{second=min(second,d);}}
float seam=1.-smoothstep(.004,.025,second-nearest);
float rockTone=mix(.65,1.2,chips)*mix(.8,1.12,grit)*(1.-seam*.24);
diffuseColor.rgb*=mix(vec3(1.),vec3(1.04,1.1,1.08)*rockTone,vExcavationWall);`)
    .replace('#include <normal_fragment_begin>',`#include <normal_fragment_begin>
if(vExcavationWall>.5){normal=normalize(cross(dFdx(vViewPosition),dFdy(vViewPosition)));}`);
};
let rock=null, cutaway=true, target=center.clone(), yaw=-.8, pitch=.65, distance=2.7;
const radiusInput=document.getElementById('radius');radiusInput.value=String(Math.round(e.pocketRadius*metres));
function rebuild(){
  if(rock){rock.geometry.dispose();scene.remove(rock);}
  const data=api.asteroidMesh(asteroid,112,cutaway);
  const walls=new Float32Array(data.length/6);
  const uncut=Object.assign({},asteroid,{excavation:Object.assign({},e,{level:0})});
  // The legacy renderer is two-sided. Standard materials also use winding to
  // orient lighting, so align each triangle with the field's outward normals.
  for(let i=0;i<data.length;i+=18){
    const a=new THREE.Vector3().fromArray(data,i), b=new THREE.Vector3().fromArray(data,i+6), c=new THREE.Vector3().fromArray(data,i+12);
    const normal=new THREE.Vector3(data[i+3]+data[i+9]+data[i+15],data[i+4]+data[i+10]+data[i+16],data[i+5]+data[i+11]+data[i+17]);
    if(b.sub(a).cross(c.sub(a)).dot(normal)<0){
      for(let k=0;k<6;k++){const v=data[i+6+k];data[i+6+k]=data[i+12+k];data[i+12+k]=v;}
    }
    const centroid=[(data[i]+data[i+6]+data[i+12])/3,(data[i+1]+data[i+7]+data[i+13])/3,(data[i+2]+data[i+8]+data[i+14])/3];
    const exterior=Math.abs(api.rockField(uncut,centroid,false))<.014;
    const cutFace=cutaway&&Math.abs(centroid[2]+depth)<.001;
    walls.fill(exterior||cutFace?0:1,i/6,i/6+3);
  }
  const geometry=geometryFromInterleaved(data);
  geometry.setAttribute('excavationWall',new THREE.BufferAttribute(walls,1));
  rock=new THREE.Mesh(geometry,material);
  rock.castShadow=true;rock.receiveShadow=true;renderer.shadowMap.needsUpdate=true;
  scene.add(rock);
  status.textContent=`${cutaway?'Cutaway inspection':'Roof intact'} · Chamber reference radius ${Math.round(e.pocketRadius*metres)} m · ${Math.round(rock.geometry.attributes.position.count/3).toLocaleString()} triangles`;
}
function pose(name){
  if(name!=='orbit' && cutaway){cutaway=false;document.getElementById('cut').setAttribute('aria-pressed','false');rebuild();}
  camera.fov=name==='chamber'?85:48;
  if(name==='orbit'){target.copy(center);yaw=-.8;pitch=.65;distance=2.7;lamp.intensity=0;}
  if(name==='entrance'){
    target.set(Math.cos(e.tunnelAngle)*.82,Math.sin(e.tunnelAngle)*.82,-depth);
    yaw=e.tunnelAngle;pitch=.08;distance=.48;lamp.intensity=.08;
  }
  if(name==='chamber'){
    target.copy(center);yaw=e.tunnelAngle+Math.PI;pitch=-.15;distance=e.pocketRadius*.45;lamp.intensity=.06;
  }
}
document.getElementById('orbit').onclick=()=>pose('orbit');
document.getElementById('entrance').onclick=()=>pose('entrance');
document.getElementById('chamber').onclick=()=>pose('chamber');
document.getElementById('cut').onclick=function(){cutaway=!cutaway;this.setAttribute('aria-pressed',String(cutaway));rebuild();};
document.getElementById('apply').onclick=()=>{
  const value=Number(radiusInput.value);
  if(!Number.isFinite(value)||value<300||value>1800){radiusInput.reportValidity();return;}
  e.pocketRadius=value/metres;rebuild();
};
let drag=null;
renderer.domElement.onpointerdown=event=>{drag=[event.clientX,event.clientY];renderer.domElement.setPointerCapture(event.pointerId);};
renderer.domElement.onpointermove=event=>{
  if(!drag)return;
  yaw-=(event.clientX-drag[0])*.006;pitch=Math.max(-1.5,Math.min(1.5,pitch+(event.clientY-drag[1])*.006));drag=[event.clientX,event.clientY];
};
renderer.domElement.onpointerup=renderer.domElement.onpointercancel=()=>{drag=null;};
renderer.domElement.addEventListener('wheel',event=>{event.preventDefault();distance=Math.max(.008,Math.min(5,distance*Math.exp(event.deltaY*.001)));},{passive:false});
function draw(){
  const width=host.clientWidth,height=Math.max(1,host.clientHeight);
  renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();
  camera.position.set(target.x+Math.cos(yaw)*Math.cos(pitch)*distance,target.y+Math.sin(yaw)*Math.cos(pitch)*distance,target.z+Math.sin(pitch)*distance);
  camera.lookAt(target);lamp.position.copy(camera.position);renderer.render(scene,camera);
  requestAnimationFrame(draw);
}
window.addEventListener('error',event=>{status.textContent='Study error: '+event.message;});
rebuild();draw();
