'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict'),{createFlight,dt}=require('./headless.cjs');
const reverse=process.argv.includes('--return');
const f=createFlight({mission:'ellis',enabled:false}),s=f.snapshot().state,U=f.DW.sim.METERS_PER_UNIT;
s.eye=reverse?[12000/U,-1699.999997/U,1550/U]:[0,-2300.000003/U,1550/U];s.velocity=[0,reverse?-.001:.001,0];
if(reverse){s.right=[-1,0,0];s.back=[0,1,0];}s.ramp[2]=.001;f.config.profile.maxVelocity[2]=.001;
s.region=reverse?1:0;
const before=JSON.parse(JSON.stringify(s));f.advance(dt,{throttle:1});const after=JSON.parse(JSON.stringify(s));
assert(Math.abs(after.eye[0]*U-(reverse?0:12000))<1e-6,'production session crossed');
function run(){
 const fixtures=FIXTURES,DW=window.Driftworks,size=64;
 const canvas=document.querySelector('canvas'),gl=canvas.getContext('webgl',{preserveDrawingBuffer:true});
 function compile(type,source){const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(shader));return shader;}
 const program=gl.createProgram();
 gl.attachShader(program,compile(gl.VERTEX_SHADER,'attribute vec2 position;varying vec2 screen;void main(){screen=position;gl_Position=vec4(position,0.,1.);}'));
 gl.attachShader(program,compile(gl.FRAGMENT_SHADER,'precision highp float;varying vec2 screen;uniform vec3 eye,right,up,back;uniform float unbend;'+DW.ellisOptics.shader+'\nvoid main(){vec3 ray=normalize(-back+right*screen.x*.8+up*screen.y*.8);EllisRay e=ellisInit(eye,ray);float side;ellisPoint(e,1.,side);vec3 exitRay=e.hit>.5&&unbend<.5?ellisExit(e):ray;gl_FragColor=vec4(exitRay*.5+.5,side);}'));
 gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));gl.useProgram(program);
 const data=DW.ellisOptics.table(),texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,512,512,0,gl.RGBA,gl.UNSIGNED_BYTE,data);
 gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
 gl.bindBuffer(gl.ARRAY_BUFFER,gl.createBuffer());gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);const position=gl.getAttribLocation(program,'position');gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
 function render(pose,unbend=0){gl.uniform1f(gl.getUniformLocation(program,'ellisRegion'),pose.region||0);gl.uniform1f(gl.getUniformLocation(program,'unbend'),unbend);for(const name of ['eye','right','up','back'])gl.uniform3fv(gl.getUniformLocation(program,name),pose[name].map(x=>name==='eye'?x*fixtures.units:x));gl.drawArrays(gl.TRIANGLES,0,6);const pixels=new Uint8Array(size*size*4);gl.readPixels(0,0,size,size,gl.RGBA,gl.UNSIGNED_BYTE,pixels);return pixels;}
 const a=render(fixtures.before),b=render(fixtures.after);let maximum=0,mismatch=0,mean=0;
 for(let i=0;i<a.length;i+=4){if(a[i+3]!==b[i+3])mismatch++;for(let j=0;j<3;j++){const delta=Math.abs(a[i+j]-b[i+j]);maximum=Math.max(maximum,delta);mean+=delta;}}
 const unbent=render(fixtures.after,1),untransported=render({...fixtures.after,right:fixtures.before.right,up:fixtures.before.up,back:fixtures.before.back});
 let unbentMax=0,frameMax=0;
 for(let i=0;i<a.length;i++)if(i%4!==3){unbentMax=Math.max(unbentMax,Math.abs(a[i]-unbent[i]));frameMax=Math.max(frameMax,Math.abs(a[i]-untransported[i]));}
 const result={direction:fixtures.direction,pass:maximum<=2&&mismatch===0&&unbentMax>10&&frameMax>10,unbentNegativeControl:unbentMax,untransportedNegativeControl:frameMax,pixels:size*size,maxChannelDifference:maximum,meanChannelDifference:mean/(size*size*3),destinationMismatches:mismatch,beforeMeters:fixtures.before.eye.map(x=>x*fixtures.units),afterMeters:fixtures.after.eye.map(x=>x*fixtures.units)};
 document.querySelector('pre').textContent=JSON.stringify(result,null,2);
 if(!result.pass)throw Error('Ellis crossing is discontinuous');
}
const fixtures={before,after,units:U,direction:reverse?'return':'forward'};
const output=reverse?'ellis-continuity-return.html':'ellis-continuity.html';
fs.mkdirSync('output',{recursive:true});fs.writeFileSync('output/'+output,'<!doctype html><html><head><meta charset="utf-8"><title>Ellis crossing continuity</title></head><body><h1>Real GLSL / production-session crossing</h1><canvas width="64" height="64"></canvas><pre>Running</pre><script>window.Driftworks={};</script><script src="../experiments/ellis-optics.js"></script><script>('+run.toString().replace('FIXTURES',JSON.stringify(fixtures))+')();</script></body></html>');
console.log('Open http://localhost:8000/output/'+output);
