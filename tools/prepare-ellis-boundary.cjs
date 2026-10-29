'use strict';
// Actual shared GLSL, with the previous hard-cutoff shader as a negative control.
const fs=require('node:fs'),assert=require('node:assert/strict');
// Reconstruct the former hard-cutoff optics explicitly, independent of HEAD.
const currentSource=fs.readFileSync('experiments/ellis-optics.js','utf8');
const oldSource=currentSource
 .replace('return b/Math.sqrt(r2)*radialScale(r2);','return b/Math.sqrt(r2);')
 .replace(/float ellisIntegral\(float b,float u\)\{[\s\S]*?(?=EllisRay ellisInit)/,'float ellisIntegral(float b,float u){return ellisPackedIntegral(b,u); }\n')
 .replace('return normalize(radial*sqrt(max(0.,1.-s*s))+tangent*s);','return normalize(radial*(24./r)*sqrt(max(0.,1.-s*s))+tangent*s);');
assert(oldSource!==currentSource&&!oldSource.includes('return b/Math.sqrt(r2)*radialScale(r2);')&&!oldSource.includes('float phase=ellisPackedIntegral(b,min(u,edge));'),'Negative-control transformations still match production source');
function run(){
 const canvas=document.querySelector('canvas'),gl=canvas.getContext('webgl',{preserveDrawingBuffer:true}),N=32;
 if(!gl)throw Error('WebGL unavailable');
 function compile(type,source){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;}
 function program(shader){
  const p=gl.createProgram();
  gl.attachShader(p,compile(gl.VERTEX_SHADER,'attribute vec2 position;varying vec2 screen;void main(){screen=position;gl_Position=vec4(position,0.,1.);}'));
  gl.attachShader(p,compile(gl.FRAGMENT_SHADER,'precision highp float;varying vec2 screen;uniform vec3 eye,forward,right;uniform float component,spread;'+shader+'\nvoid main(){vec3 ray=normalize(forward+right*screen.x*spread+vec3(0.,0.,1.)*screen.y*spread);EllisRay e=ellisInit(eye,ray);vec3 direction=ray;float side=ellisRegion;if(e.hit>.5){direction=ellisExit(e);ellisPoint(e,1.,side);}float value=component<.5?direction.x:component<1.5?direction.y:direction.z;float encoded=floor(clamp(value*.5+.5,0.,1.)*65535.+.5);gl_FragColor=vec4(floor(encoded/256.)/255.,mod(encoded,256.)/255.,side,1.);}'));
  gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));return p;
 }
 const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);
 for(const [parameter,value] of [[gl.TEXTURE_MIN_FILTER,gl.LINEAR],[gl.TEXTURE_MAG_FILTER,gl.LINEAR],[gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE],[gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE]])gl.texParameteri(gl.TEXTURE_2D,parameter,value);
 const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
 const modern=window.Driftworks.ellisOptics;
 const previous={window:{Driftworks:{}}};new Function('window',OLD_SOURCE)(previous.window);
 function measure(optics){
  const p=program(optics.shader);gl.useProgram(p);gl.uniform1i(gl.getUniformLocation(p,'ellisTable'),0);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,512,512,0,gl.RGBA,gl.UNSIGNED_BYTE,optics.table());
  const position=gl.getAttribLocation(p,'position');gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
  function render(radius,angle,region,spread){
   gl.uniform3fv(gl.getUniformLocation(p,'eye'),[region*12000+radius,-2000,1550]);
   gl.uniform3fv(gl.getUniformLocation(p,'forward'),[Math.cos(angle),Math.sin(angle),0]);
   gl.uniform3fv(gl.getUniformLocation(p,'right'),[-Math.sin(angle),Math.cos(angle),0]);
   gl.uniform1f(gl.getUniformLocation(p,'ellisRegion'),region);gl.uniform1f(gl.getUniformLocation(p,'spread'),spread);
   const output=[];
   for(let axis=0;axis<3;axis++){
    gl.uniform1f(gl.getUniformLocation(p,'component'),axis);gl.drawArrays(gl.TRIANGLES,0,6);
    const bytes=new Uint8Array(N*N*4);gl.readPixels(0,0,N,N,gl.RGBA,gl.UNSIGNED_BYTE,bytes);
    output.push(bytes);
   }
   return output;
  }
  function compare(a,b){let max=0,mismatches=0;for(let i=0;i<N*N*4;i+=4){let error=0;for(let axis=0;axis<3;axis++){const delta=((a[axis][i]-b[axis][i])*256+a[axis][i+1]-b[axis][i+1])*2/65535;error+=delta*delta;}max=Math.max(max,Math.sqrt(error));if(a[0][i+2]!==b[0][i+2])mismatches++;}return {maxDirectionChord:max,destinationMismatches:mismatches};}
  const rows=[];
  for(const region of [0,1])for(const angle of [0,Math.PI/3,Math.PI/2,2*Math.PI/3,Math.PI]){
   rows.push({kind:'radial boundary',region,angleDegrees:angle*180/Math.PI,...compare(render(599.99,angle,region,.12),render(600.01,angle,region,.12))});
  }
  // Sweep across the silhouette of the entry sphere while keeping the eye fixed.
  const grazing=Math.PI-Math.asin(2/3);
  for(const region of [0,1])rows.push({kind:'grazing boundary',region,...compare(render(900,grazing-.00001,region,.002),render(900,grazing+.00001,region,.002))});
  gl.deleteProgram(p);return {maximum:Math.max(...rows.map(r=>r.maxDirectionChord)),rows};
 }
 const old=measure(previous.window.Driftworks.ellisOptics),current=measure(modern);
 const result={pass:current.maximum<.0005&&old.maximum>.05,units:'direction-vector chord; approximately radians for small changes',pixelsPerView:N*N,old,current};
 document.querySelector('pre').textContent=JSON.stringify(result,null,2);
 document.body.dataset.pass=String(result.pass);if(!result.pass)throw Error('Ellis boundary regression failed');
}
fs.mkdirSync('output',{recursive:true});
fs.writeFileSync('studies/ellis-boundary-continuity.html','<!doctype html><html><head><meta charset="utf-8"><title>Ellis outer-boundary continuity</title></head><body><h1>600 m boundary / actual shared GLSL</h1><p>Sky direction only: no geometry, grids or outline. Both charts; radial and grazing probes; previous shader negative control.</p><canvas width="32" height="32"></canvas><pre>Running</pre><script>window.Driftworks={};</script><script src="../experiments/ellis-optics.js"></script><script>('+run.toString().replace('OLD_SOURCE',JSON.stringify(oldSource))+')();</script></body></html>\n');
console.log('Open http://localhost:8000/studies/ellis-boundary-continuity.html');
