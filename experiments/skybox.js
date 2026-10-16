(function(){
  'use strict';
  var focal=1/Math.tan(Math.PI/8);
  function stars(){
    var data=[],seed=58319;
    function random(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;}
    for(var i=0;i<3200;i++){
      var z=random()*2-1,angle=random()*Math.PI*2,r=Math.sqrt(1-z*z);
      data.push(r*Math.cos(angle),r*Math.sin(angle),z,.4+Math.pow(random(),3)*.6);
    }
    return new Float32Array(data);
  }
  function project(direction,pose,aspect){
    function dot(a,b){return a.reduce(function(sum,x,i){return sum+x*b[i];},0);}
    var depth=-dot(direction,pose.back);
    return depth>0?{x:dot(direction,pose.right)*focal/aspect/depth,y:dot(direction,pose.up)*focal/depth}:null;
  }
  function create(host){
    var canvas=document.createElement('canvas');canvas.className='flight-skybox';canvas.setAttribute('aria-hidden','true');host.prepend(canvas);
    var gl=canvas.getContext('webgl',{alpha:false,antialias:false});
    if(!gl)throw new Error('Flight skybox requires WebGL');
    function shader(type,source){var sh=gl.createShader(type);gl.shaderSource(sh,source);gl.compileShader(sh);if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(sh));return sh;}
    function program(vertex,fragment){var p=gl.createProgram();gl.attachShader(p,shader(gl.VERTEX_SHADER,vertex));gl.attachShader(p,shader(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p));return p;}
    var sky=program('attribute vec2 position; varying vec2 screen; void main(){screen=position;gl_Position=vec4(position,0.,1.);}',
      'precision highp float; varying vec2 screen; uniform vec3 right,up,back; uniform float aspect,focal; uniform sampler2D panorama; void main(){vec3 ray=normalize(-back+right*screen.x*aspect/focal+up*screen.y/focal); vec2 uv=vec2(atan(ray.y,ray.x)/6.28318530718+.5,acos(clamp(ray.z,-1.,1.))/3.14159265359); vec3 color=texture2D(panorama,uv).rgb;gl_FragColor=vec4(color*.65,1.);}');
    var points=program('attribute vec4 star;uniform vec3 right,up,back; uniform float aspect,focal,pixelRatio;varying float brightness;void main(){float depth=-dot(star.xyz,back);brightness=star.w;gl_Position=depth>0.?vec4(dot(star.xyz,right)*focal/aspect,dot(star.xyz,up)*focal,0.,depth):vec4(2.,2.,2.,1.);gl_PointSize=(1.3+star.w*2.)*pixelRatio;}',
      'precision mediump float;varying float brightness;void main(){float r=length(gl_PointCoord-.5)*2.;float alpha=(1.-smoothstep(.15,1.,r))*brightness;gl_FragColor=vec4(.82,.9,1.,alpha);}');
    var quad=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,quad);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
    var starData=stars(),starBuffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,starBuffer);gl.bufferData(gl.ARRAY_BUFFER,starData,gl.STATIC_DRAW);
    var texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB,1,1,0,gl.RGB,gl.UNSIGNED_BYTE,new Uint8Array([2,4,8]));
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    var image=new Image();image.onload=function(){gl.bindTexture(gl.TEXTURE_2D,texture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB,gl.RGB,gl.UNSIGNED_BYTE,image);canvas.dataset.panorama='ready';};image.src='../assets/backgrounds/all-sky-milky-way.jpg';
    function uniforms(p,pose,aspect,dpr){gl.useProgram(p);['right','up','back'].forEach(function(key){gl.uniform3fv(gl.getUniformLocation(p,key),pose[key]);});gl.uniform1f(gl.getUniformLocation(p,'aspect'),aspect);gl.uniform1f(gl.getUniformLocation(p,'focal'),focal);gl.uniform1f(gl.getUniformLocation(p,'pixelRatio'),dpr);}
    return {render:function(pose){
      var dpr=Math.min(2,window.devicePixelRatio||1),width=Math.round(host.clientWidth*dpr),height=Math.round(host.clientHeight*dpr);if(!width||!height)return;
      if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}gl.viewport(0,0,width,height);
      gl.disable(gl.BLEND);uniforms(sky,pose,width/height,dpr);gl.bindBuffer(gl.ARRAY_BUFFER,quad);var a=gl.getAttribLocation(sky,'position');gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,2,gl.FLOAT,false,0,0);gl.bindTexture(gl.TEXTURE_2D,texture);gl.drawArrays(gl.TRIANGLES,0,6);gl.disableVertexAttribArray(a);
      uniforms(points,pose,width/height,dpr);gl.bindBuffer(gl.ARRAY_BUFFER,starBuffer);a=gl.getAttribLocation(points,'star');gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,4,gl.FLOAT,false,0,0);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE);gl.drawArrays(gl.POINTS,0,starData.length/4);gl.disableVertexAttribArray(a);
    }};
  }
  window.Driftworks.flightSkybox={create:create,stars:stars,project:project};
}());
