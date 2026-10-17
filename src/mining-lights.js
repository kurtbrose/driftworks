(function(global){
  'use strict';
  /** @typedef {import('./types').RigLighting} RigLighting */
  /** @typedef {import('./types').RigLightMount} RigLightMount */
  /** @type {RigLightMount[]} */
  var mounts=[
    {id:'cargo-port',position:[-5.6,-2.6,7.0],target:[-1,0,4.6],anchor:[-4.6,-2.6,7.6],range:18,power:2.2},
    {id:'cargo-starboard',position:[5.6,2.6,7.0],target:[1,0,4.6],anchor:[4.6,2.6,7.6],range:18,power:2.2}
  ];
  [-1,1].forEach(function(x){[-1,1].forEach(function(y){mounts.push({id:'tower-'+x+'-'+y,position:[x*5.8,y*4.6,12.2],target:[x*21,y*15,0],anchor:[x*4.6,y*3.8,12.0],range:40,power:3.6});});});
  /** @param {number[]} direction */
  function basis(direction){var length=Math.hypot.apply(null,direction)||1,z=direction.map(function(v){return v/length;}),h=Math.hypot(z[0],z[1]);
    var x=h>1e-8?[-z[1]/h,z[0]/h,0]:[1,0,0];
    return [x,[z[1]*x[2]-z[2]*x[1],z[2]*x[0]-z[0]*x[2],z[0]*x[1]-z[1]*x[0]],z];
  }
  // Visible fixtures and lighting proxies are deliberately separate systems.
  var fields=[
    {id:'cargo',center:[0,0,6.2],radii:[20,14,5],power:.95,color:[1,.94,.82]},
    {id:'apron',center:[0,0,1],radii:[34,27,12],power:.85,color:[1,.90,.72]},
    {id:'docking',center:[0,0,13.4],radii:[8,7,4],power:.7,color:[.67,.85,1]}
  ];
  /** @param {{world:(p:number[])=>number[];rotate:(p:number[])=>number[]}} pose @param {number} scale @param {number} [power] @returns {RigLighting} */
  function rig(pose,scale,power){return {origin:pose.world([0,0,0]),right:pose.rotate([1,0,0]),forward:pose.rotate([0,1,0]),up:pose.rotate([0,0,1]),scale:scale,power:power===undefined?1:power};}
  /** @param {number} a @param {number} b @param {number} v */
  function smooth(a,b,v){var t=Math.max(0,Math.min(1,(v-a)/(b-a)));return t*t*(3-2*t);}
  /** Broad light fields with coarse structural occlusion; no rays per fixture.
   * @param {RigLighting} rig @param {number[]} point @param {number[]} normal */
  function irradiance(rig,point,normal){
    var delta=point.map(function(v,k){return (v-rig.origin[k])/rig.scale;}),axes=[rig.right,rig.forward,rig.up];
    var p=axes.map(function(axis){return delta.reduce(function(sum,v,k){return sum+v*axis[k];},0);});
    var nz=normal.reduce(function(sum,v,k){return sum+v*rig.up[k];},0),weight=.65+.35*Math.max(0,nz);
    var under=(1-smooth(14.5,17,Math.abs(p[0])))*(1-smooth(9,11,Math.abs(p[1])))*(1-smooth(4.25,4.55,p[2]));
    var pod=(1-smooth(4.4,5.1,Math.abs(p[0])))*(1-smooth(3.1,3.8,Math.abs(p[1])))*smooth(7.25,7.55,p[2])*(1-smooth(13.4,13.8,p[2]));
    var gates=[smooth(4.4,4.55,p[2])*(1-pod*.94),1-under*.96,smooth(11.8,13.2,p[2])];
    var sum=[0,0,0];fields.forEach(function(field,i){var radius=Math.hypot.apply(null,p.map(function(v,k){return (v-field.center[k])/field.radii[k];}));var amount=(1-smooth(.5,1.15,radius))*field.power*gates[i]*weight*rig.power;for(var k=0;k<3;k++)sum[k]+=field.color[k]*amount;});
    return sum.map(function(v){return 1-Math.exp(-v);});
  }
  /** Fixed roof lighting is stored separately from albedo and sunlight.
   * Cache by local vertex/normal so deployment rebuilds reuse the same samples. */
  /** @type {Map<string,number[]>} */ var dockingSamples=new Map();
  /** @type {WeakMap<object,Float32Array>} */ var dockingBakes=new WeakMap();
  /** @param {ArrayLike<number>} data @returns {Float32Array} */
  function bakeDocking(data){
    var cached=dockingBakes.get(data);if(cached)return cached;
    var out=new Float32Array(data.length/6*3),field=fields[2];
    for(var i=0;i<data.length;i+=6){
      // The docking wash belongs to the fixed upper pod, not moving bay leaves.
      if(data[i+2]<11.8 || Math.abs(data[i])>5.2 || Math.abs(data[i+1])>3.9)continue;
      var key=[data[i],data[i+1],data[i+2],data[i+3],data[i+4],data[i+5]].join(','),value=dockingSamples.get(key);
      if(!value){var radius=Math.hypot((data[i]-field.center[0])/field.radii[0],(data[i+1]-field.center[1])/field.radii[1],(data[i+2]-field.center[2])/field.radii[2]);
        var amount=(1-smooth(.5,1.15,radius))*field.power*smooth(11.8,13.2,data[i+2])*(.65+.35*Math.max(0,data[i+5]));
        value=field.color.map(function(c){return 1-Math.exp(-c*amount);});dockingSamples.set(key,value);
      }out.set(value,i/2);
    }dockingBakes.set(data,out);return out;
  }
  var model=rig({world:function(p){return p.slice();},rotate:function(p){return p.slice();}},1);
  /** @param {RigLighting[]} rigs @param {number[]} origin @param {number} angle @param {number} scale */
  function uniforms(rigs,origin,angle,scale){
    var result={uRigCount:Math.min(2,rigs.length),uRigProjected:0,uRigPower:new Float32Array(2),uRigOrigin:new Float32Array(8),uRigX:new Float32Array(6),uRigY:new Float32Array(6),uRigZ:new Float32Array(6)};
    var c=Math.cos(angle),s=Math.sin(angle);
    /** @param {number[]} p */
    function direction(p){return [p[0]*c+p[1]*s,-p[0]*s+p[1]*c,p[2]];}
    rigs.slice(0,2).forEach(function(rig,index){var position=direction(rig.origin.map(function(v,k){return v-origin[k];})).map(function(v){return v/scale;});
      result.uRigOrigin.set(position.concat([rig.scale/scale]),index*4);result.uRigX.set(direction(rig.right),index*3);result.uRigY.set(direction(rig.forward),index*3);result.uRigZ.set(direction(rig.up),index*3);result.uRigPower[index]=rig.power;
    });return result;
  }
  /** @type {import('./types').DriftworksNamespace} */
  var DW=global.Driftworks=global.Driftworks || {};
  DW.miningLights={bakeDocking:bakeDocking,mounts:mounts,fields:fields,fixtureCounts:{main:6,cargo:12,anchors:8,ramps:16,docking:9},basis:basis,rig:rig,irradiance:irradiance,model:model,uniforms:uniforms,shaderSource:"uniform vec4 uRigOrigin[2];uniform vec3 uRigX[2],uRigY[2],uRigZ[2];uniform float uRigPower[2],uRigCount,uRigProjected,uRigBaked;\nfloat rigField(vec3 p,vec3 center,vec3 radii){return 1.-smoothstep(.5,1.15,length((p-center)/radii));}\nvec3 rigIllumination(vec3 point,vec3 n){vec3 sum=vec3(0.);for(int i=0;i<2;i++){if(float(i)>=uRigCount)break;vec3 x=uRigX[i],y=uRigY[i],z=uRigZ[i];vec4 origin=uRigOrigin[i];vec3 receiver=point;if(uRigProjected>.5)receiver.z=origin.z+1.4*origin.w-(z.x*(point.x-origin.x)+z.y*(point.y-origin.y))/max(.2,z.z);vec3 d=(receiver-origin.xyz)/origin.w;vec3 p=vec3(dot(d,x),dot(d,y),dot(d,z));float weight=.65+.35*max(0.,dot(n,z));float under=(1.-smoothstep(14.5,17.,abs(p.x)))*(1.-smoothstep(9.,11.,abs(p.y)))*(1.-smoothstep(4.25,4.55,p.z));float pod=(1.-smoothstep(4.4,5.1,abs(p.x)))*(1.-smoothstep(3.1,3.8,abs(p.y)))*smoothstep(7.25,7.55,p.z)*(1.-smoothstep(13.4,13.8,p.z));vec3 glow=vec3(0.);\nglow+=vec3(1.0,0.94,0.82)*rigField(p,vec3(0.0,0.0,6.2),vec3(20.0,14.0,5.0))*0.95*smoothstep(4.4,4.55,p.z)*(1.-pod*.94);\nglow+=vec3(1.0,0.9,0.72)*rigField(p,vec3(0.0,0.0,1.0),vec3(34.0,27.0,12.0))*0.85*(1.-under*.96);\nif(uRigBaked<.5)glow+=vec3(0.67,0.85,1.0)*rigField(p,vec3(0.0,0.0,13.4),vec3(8.0,7.0,4.0))*0.7*smoothstep(11.8,13.2,p.z);\nsum+=glow*weight*uRigPower[i];}return vec3(1.)-exp(-sum);}\n"};
})(window);
