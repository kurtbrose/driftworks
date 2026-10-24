const fs=require('fs');
const source=fs.readFileSync('experiments/ellis-renderer.js','utf8');
const linear=source.slice(source.indexOf('float linearDepth('),source.indexOf('vec2 atlasUV('));
const helper=source.slice(source.indexOf('float shellDepth('),source.indexOf('float shellGap(')).replaceAll('texture2D(','texture(');
function run(){
 const gl=document.querySelector('canvas').getContext('webgl2',{preserveDrawingBuffer:true});if(!gl)throw Error('WebGL2 unavailable');
 function compile(type,source){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;}
 const p=gl.createProgram();gl.attachShader(p,compile(gl.VERTEX_SHADER,'#version 300 es\nin vec2 position;void main(){gl_Position=vec4(position,0,1);}'));
 gl.attachShader(p,compile(gl.FRAGMENT_SHADER,'#version 300 es\nprecision highp float;uniform sampler2D depthMap;uniform float smoothShell,units,guard;out vec4 color;'+SHADER+'void main(){vec2 uv=(vec2(498.1,298.2)+gl_FragCoord.xy*.213)/vec2(1152.,768.);if(guard>.5)uv=vec2(500.25,300.25)/vec2(1152.,768.);float z=shellDepth(depthMap,uv);float exact=.997+8.e-7*uv.x*1152.+4.e-7*uv.y*768.;float error=abs(linearDepth(z,30000.)-linearDepth(exact,30000.))*units;if(guard>.5)error=abs(z-texture(depthMap,uv).r);color=vec4(clamp(error/.5,0.,1.),0,0,1);}'));
 gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));gl.useProgram(p);
 const vertices=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,vertices);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);const loc=gl.getAttribLocation(p,'position');gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0);
 const depth=new Float32Array(1152*768);for(let y=0;y<768;y++)for(let x=0;x<1152;x++)depth[y*1152+x]=.997+8e-7*(x+.5)+4e-7*(y+.5);
 const tex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,tex);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texImage2D(gl.TEXTURE_2D,0,gl.R32F,1152,768,0,gl.RED,gl.FLOAT,depth);gl.uniform1f(gl.getUniformLocation(p,'units'),10000/600);gl.viewport(0,0,32,32);
 function measure(smooth,guard){gl.uniform1f(gl.getUniformLocation(p,'smoothShell'),smooth);gl.uniform1f(gl.getUniformLocation(p,'guard'),guard);gl.drawArrays(gl.TRIANGLES,0,6);const out=new Uint8Array(32*32*4);gl.readPixels(0,0,32,32,gl.RGBA,gl.UNSIGNED_BYTE,out);let total=0,max=0;for(let i=0;i<out.length;i+=4){const e=out[i]/255*.5;total+=e;max=Math.max(max,e);}return {mean:total/1024,max};}
 const nearest=measure(0,0),smooth=measure(1,0);gl.texSubImage2D(gl.TEXTURE_2D,0,500,300,1,1,gl.RED,gl.FLOAT,new Float32Array([1]));const guard=measure(1,1);
 if(!(nearest.mean>smooth.mean*3&&smooth.max<.04&&guard.max===0))throw Error(JSON.stringify({nearest,smooth,guard}));
 document.querySelector('#result').textContent='PASS actual shellDepth GLSL / tilted continuous plane\n'+JSON.stringify({nearest,smooth,guard},null,2)+'\nErrors in metres. Empty depth pixels preserve the original silhouette.';
}
fs.writeFileSync('output/ellis-surface-regression.html','<!doctype html><meta charset="utf-8"><title>Ellis surface continuity regression</title><style>body{background:#09141c;color:#cee5ed;font:16px monospace}pre{white-space:pre-wrap}</style><canvas width="32" height="32"></canvas><pre id="result">Running…</pre><script>const SHADER='+JSON.stringify(linear+helper)+';('+run.toString()+')();</script>');
