(function(global){
  'use strict';
  var DW=global.Driftworks;
  function rng(seed){var state=(seed>>>0)||1;return function(){state^=state<<13;state^=state>>>17;state^=state<<5;return (state>>>0)/4294967296;};}
  function sub(a,b){return a.map(function(v,i){return v-b[i];});}
  function dot(a,b){return a[0]*b[0]+a[1]*b[1]+a[2]*b[2];}
  function cross(a,b){return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];}
  function unit(a){var length=Math.hypot.apply(null,a)||1;return a.map(function(v){return v/length;});}
  // These mesh builders are study-only. All formations exist at scene creation;
  // camera movement never spawns, deletes, or repositions individual rocks.
  function createModel(kind,seed,resolution){
    var random=rng(seed),vertices=[],rocks=[],formations=[],extent=10;
    function triangle(a,b,c,color){
      var n=unit(cross(sub(b,a),sub(c,a)));
      if(Math.hypot.apply(null,cross(sub(b,a),sub(c,a)))<1e-9)return;
      [a,b,c].forEach(function(p,i){vertices.push.apply(vertices,p.concat(n,[i===0?1:0,i===1?1:0,i===2?1:0],color));});
    }
    function floor(x,y){return kind==='block'?0:.018*Math.sin(x*.61+y*.23)+.012*Math.cos(y*.83-x*.31);}
    function cellular(x,y){
      var volume=DW.scene3d.rockVolume(),q=[x*.8,y*.8,.71].map(function(v){return ((v%4+4)%4)*8-.5;});
      var cell=q.map(Math.floor),t=q.map(function(v,i){return v-cell[i];}),h=0;
      for(var z=0;z<2;z++)for(var b=0;b<2;b++)for(var a=0;a<2;a++){
        var ix=((cell[0]+a)%32+32)%32,iy=((cell[1]+b)%32+32)%32,iz=((cell[2]+z)%32+32)%32;
        var index=(((iz%8)*34+ix+1)+(Math.floor(iz/8)*34+iy+1)*volume.width)*4+3;
        h+=volume.bytes[index]/255*(a?t[0]:1-t[0])*(b?t[1]:1-t[1])*(z?t[2]:1-t[2]);
      }
      return h*.85;
    }
    function height(x,y){return kind==='cellular'?cellular(x,y):floor(x,y);}
    for(var y=0;y<resolution;y++)for(var x=0;x<resolution;x++){
      var ax=(x/resolution*2-1)*extent,bx=((x+1)/resolution*2-1)*extent,ay=(y/resolution*2-1)*extent,by=((y+1)/resolution*2-1)*extent;
      var a=[ax,ay,height(ax,ay)],b=[bx,ay,height(bx,ay)],c=[bx,by,height(bx,by)],d=[ax,by,height(ax,by)];
      triangle(a,b,c,[.23,.245,.255,.025]);triangle(a,c,d,[.23,.245,.255,.025]);
    }
    function rock(cx,cy,rx,ry,h,sides){
      var angle=random()*Math.PI*2,tiltX=(random()-.5)*.55,tiltY=(random()-.5)*.55,topScale=.38+random()*.58;
      var base=[],top=[],center=[cx,cy,h+floor(cx,cy)],shade=.21+random()*.18;
      var color=[shade*.99,shade,shade*1.025,random()>.77?.45:.035];
      for(var i=0;i<sides;i++){
        var a=angle+i/sides*Math.PI*2+(random()-.5)*.27,r=.72+random()*.5;
        var px=Math.cos(a)*rx*r,py=Math.sin(a)*ry*r;
        base.push([cx+px,cy+py,floor(cx+px,cy+py)-.05]);
        var tx=px*topScale+rx*.18,ty=py*topScale-ry*.12;
        top.push([cx+tx,cy+ty,Math.max(floor(cx+tx,cy+ty)+.12,center[2]+tiltX*tx+tiltY*ty)]);
      }
      // Preserve the structural source separately from the generated triangle buffer.
      formations.push({base:base,top:top,capCenter:center,color:color});
      for(var j=0;j<sides;j++){
        var next=(j+1)%sides;
        triangle(base[j],base[next],top[next],color);triangle(base[j],top[next],top[j],color);triangle(center,top[j],top[next],color);
      }
      rocks.push({center:[cx,cy],radius:Math.max(rx,ry),height:h,sides:sides});
    }
    if(kind==='block'){
      var color=[.36,.38,.40,.18],p=[[-1,-1,0],[1,-1,0],[1,1,0],[-1,1,0],[-1,-1,1.5],[1,-1,1.5],[1,1,1.5],[-1,1,1.5]];
      [[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7],[4,5,6,7]].forEach(function(f){triangle(p[f[0]],p[f[1]],p[f[2]],color);triangle(p[f[0]],p[f[2]],p[f[3]],color);});
    }
    if(kind==='rocks'){
      for(var attempt=0;attempt<240&&rocks.length<11;attempt++){
        var cx=(random()-.5)*14,cy=(random()-.5)*14,rx=.65+random()*1.55,ry=rx*(.6+random()*.6);
        if(rocks.some(function(r){return Math.hypot(cx-r.center[0],cy-r.center[1])<(Math.max(rx,ry)+r.radius)*.86;}))continue;
        rock(cx,cy,rx,ry,rx*(.35+random()*.65),5+Math.floor(random()*4));
      }
      for(var k=0;k<45;k++){
        var dx=(random()-.5)*17,dy=(random()-.5)*17,r=.12+random()*.36;
        if(rocks.some(function(feature){return Math.hypot(dx-feature.center[0],dy-feature.center[1])<feature.radius+r;}))continue;
        rock(dx,dy,r,r*(.6+random()*.5),r*(.6+random()*.8),5+Math.floor(random()*3));
      }
    }
    var data=new Float32Array(vertices),hash=2166136261;
    var bytes=new Uint8Array(data.buffer);for(var b=0;b<bytes.length;b++){hash^=bytes[b];hash=Math.imul(hash,16777619);}
    return {kind:kind,seed:seed,resolution:resolution,vertices:data,triangles:data.length/39,rocks:rocks,formations:formations,extent:extent,hash:(hash>>>0).toString(16),units:'meters'};
  }
  DW.terrainLab={createModel:createModel};
  if(typeof document.getElementById!=='function'||!document.getElementById('terrain-lab'))return;
  var canvas=document.getElementById('terrain-lab'),gl=canvas.getContext('webgl',{antialias:true,alpha:false});
  if(!gl){document.getElementById('metrics').textContent='WebGL is unavailable.';return;}
  var derivatives=!!gl.getExtension('OES_standard_derivatives');
  function shader(type,source){var s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s;}
  function program(v,f){var p=gl.createProgram();gl.attachShader(p,shader(gl.VERTEX_SHADER,v));gl.attachShader(p,shader(gl.FRAGMENT_SHADER,f));gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p));return p;}
  var vertex='attribute vec3 aPosition,aNormal,aBary;attribute vec4 aColor;uniform vec3 uEye,uRight,uUp,uBack;uniform float uAspect;varying vec3 vPosition,vNormal,vBary;varying vec4 vColor;void main(){vec3 p=aPosition-uEye;float d=-dot(p,uBack),near=.05,far=600.;gl_Position=vec4(dot(p,uRight)*2.41421356/uAspect,dot(p,uUp)*2.41421356,((far+near)/(far-near))*d-2.*far*near/(far-near),d);vPosition=aPosition;vNormal=aNormal;vBary=aBary;vColor=aColor;}';
  var fragment=(derivatives?'#extension GL_OES_standard_derivatives : enable\n':'')+'precision highp float;varying vec3 vPosition,vNormal,vBary;varying vec4 vColor;uniform vec3 uLight,uLightRight,uLightUp,uEye;uniform float uMode;uniform sampler2D uShadow;float visibility(){vec2 uv=vec2(dot(vPosition,uLightRight),dot(vPosition,uLightUp))/32.+.5;float depth=.5-dot(vPosition,uLight)/40.;vec2 slope=vec2(0.);'+(derivatives?'vec2 dx=dFdx(uv),dy=dFdy(uv);float zx=dFdx(depth),zy=dFdy(depth),det=dx.x*dy.y-dx.y*dy.x;if(abs(det)>1.e-16)slope=vec2(zx*dy.y-zy*dx.y,zy*dx.x-zx*dy.x)/det;':'')+'float result=0.;for(int y=0;y<2;y++)for(int x=0;x<2;x++){vec2 tap=(floor(uv*1024.)+vec2(float(x),float(y))+.5)/1024.;vec2 b=texture2D(uShadow,tap).rg;float receiver=depth+dot(slope,tap-uv)-.00006;result+=step(receiver,b.x+b.y/255.);}return result*.25;}void main(){vec3 n=normalize(vNormal);vec3 face='+ (derivatives?'normalize(cross(dFdx(vPosition),dFdy(vPosition)))':'n')+';if(dot(face,n)<0.)face=-face;if(uMode> .5&&uMode<1.5){gl_FragColor=vec4(face*.5+.5,1.);return;}if(uMode>1.5&&uMode<2.5){gl_FragColor=vec4(n*.5+.5,1.);return;}float diffuse=max(0.,dot(face,uLight));if(uMode>2.5&&uMode<3.5){vec3 edge=smoothstep(vec3(0.),'+(derivatives?'fwidth(vBary)*1.25':'vec3(.025)')+',vBary);float fill=min(edge.x,min(edge.y,edge.z));gl_FragColor=vec4(mix(vec3(.035,.11,.16),vec3(.28+.55*diffuse),fill),1.);return;}if(uMode<.5){gl_FragColor=vec4(vec3(.16+.65*diffuse),1.);return;}float shadow=visibility();vec3 halfVector=normalize(uLight+normalize(uEye-vPosition));float spec=pow(max(0.,dot(face,halfVector)),32.)*vColor.a*shadow;vec3 color=vColor.rgb*(.13+1.3*diffuse*shadow)+vec3(spec);gl_FragColor=vec4(pow(color,vec3(1./2.2)),1.);}';
  var main=program(vertex,fragment),shadowProgram=program('attribute vec3 aPosition;uniform vec3 uLight,uLightRight,uLightUp;void main(){gl_Position=vec4(dot(aPosition,uLightRight)/16.,dot(aPosition,uLightUp)/16.,-dot(aPosition,uLight)/20.,1.);}','precision highp float;void main(){vec2 bytes=fract(vec2(1.,255.)*gl_FragCoord.z);bytes.x-=bytes.y/255.;gl_FragColor=vec4(bytes,0.,1.);}');
  function uniforms(p,names){var out={};names.forEach(function(name){out[name]=gl.getUniformLocation(p,'u'+name);});return out;}
  var u=uniforms(main,['Eye','Right','Up','Back','Aspect','Light','LightRight','LightUp','Mode','Shadow']),su=uniforms(shadowProgram,['Light','LightRight','LightUp']);
  var attributes=['Position','Normal','Bary','Color'].map(function(name){return gl.getAttribLocation(main,'a'+name);}),shadowPosition=gl.getAttribLocation(shadowProgram,'aPosition');
  var buffer=gl.createBuffer(),texture=gl.createTexture(),fb=gl.createFramebuffer(),depth=gl.createRenderbuffer();
  gl.bindTexture(gl.TEXTURE_2D,texture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1024,1024,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  gl.bindFramebuffer(gl.FRAMEBUFFER,fb);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,texture,0);gl.bindRenderbuffer(gl.RENDERBUFFER,depth);gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH_COMPONENT16,1024,1024);gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,depth);
  if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw new Error('Laboratory shadow framebuffer incomplete');
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.enable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);
  var timer=gl.getExtension('EXT_disjoint_timer_query'),pending=null,gpuMs=null;
  var model,buildMs=0,shadowDirty=true,dirty=true,eye=[14,-18,13],target=[0,0,.3],light,lightRight,lightUp,drag=null,last=0,reportTime=0,meshBuilds=0,shadowBuilds=0,metrics=DW.flightPerformance.create(),benchmark=null;
  var fixture=document.getElementById('fixture'),display=document.getElementById('display'),frozen=document.getElementById('frozen'),seed=document.getElementById('seed'),resolution=document.getElementById('resolution'),sun=document.getElementById('sun'),continuous=document.getElementById('continuous');
  function sunFrame(){var angle=Number(sun.value)*Math.PI/180;light=unit([-.72*Math.cos(angle),-.69*Math.cos(angle),Math.sin(angle)]);lightRight=unit(cross([0,0,1],light));lightUp=cross(light,lightRight);document.getElementById('sun-value').textContent=sun.value+'°';shadowDirty=true;dirty=true;}
  function build(){var start=performance.now();model=createModel(fixture.value,Number(seed.value)||1729,Number(resolution.value));gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,model.vertices,gl.STATIC_DRAW);buildMs=performance.now()-start;meshBuilds++;shadowDirty=true;dirty=true;metrics=DW.flightPerformance.create();last=0;}
  function freeze(){seed.disabled=frozen.checked;resolution.disabled=frozen.checked;sun.disabled=frozen.checked;dirty=true;}
  frozen.onchange=freeze;fixture.onchange=build;seed.onchange=build;resolution.onchange=build;sun.oninput=sunFrame;display.onchange=function(){dirty=true;metrics=DW.flightPerformance.create();last=0;};continuous.onchange=function(){dirty=true;last=0;};
  function camera(kind){target=[0,0,.3];eye=kind==='far'?[0,-199,20]:kind==='middle'?[0,-19,6.5]:kind==='horizon'?[0,-8,2]:kind==='down'?[0,-.1,24]:kind==='oblique'?[8,-12,8]:[14,-18,13];dirty=true;last=0;metrics=DW.flightPerformance.create();}
  document.querySelectorAll('[data-camera]').forEach(function(button){button.onclick=function(){camera(button.dataset.camera);};});
  canvas.onpointerdown=function(event){drag={x:event.clientX,y:event.clientY,pan:event.shiftKey};canvas.setPointerCapture(event.pointerId);};
  canvas.onpointermove=function(event){if(!drag)return;var dx=event.clientX-drag.x,dy=event.clientY-drag.y,d=sub(eye,target),r=Math.hypot.apply(null,d);if(drag.pan){var right=unit(cross([0,0,1],unit(d))),offset=right.map(function(v,i){return -dx*v*r/canvas.clientHeight+(i===2?dy*r/canvas.clientHeight:0);});eye=eye.map(function(v,i){return v+offset[i];});target=target.map(function(v,i){return v+offset[i];});}else{var yaw=Math.atan2(d[1],d[0])-dx*.006,pitch=Math.max(.035,Math.min(1.54,Math.asin(d[2]/r)+dy*.006));eye=[target[0]+r*Math.cos(pitch)*Math.cos(yaw),target[1]+r*Math.cos(pitch)*Math.sin(yaw),target[2]+r*Math.sin(pitch)];}drag.x=event.clientX;drag.y=event.clientY;dirty=true;};
  canvas.onpointerup=canvas.onpointercancel=function(){drag=null;};canvas.onwheel=function(event){event.preventDefault();var scale=Math.exp(Math.max(-250,Math.min(250,event.deltaY))*.0015);eye=target.map(function(v,i){return v+(eye[i]-v)*scale;});dirty=true;};
  window.addEventListener('resize',function(){dirty=true;});document.addEventListener('visibilitychange',function(){dirty=true;last=0;});
  function lightUniforms(loc){gl.uniform3fv(loc.Light,light);gl.uniform3fv(loc.LightRight,lightRight);gl.uniform3fv(loc.LightUp,lightUp);}
  function draw(now){
    var start=performance.now(),passes=0,mode=['plain','faces','vertices','wire','material'].indexOf(display.value);
    var pixelRatio=Math.min(1.5,window.devicePixelRatio||1),w=Math.round(canvas.clientWidth*pixelRatio),h=Math.round(canvas.clientHeight*pixelRatio);
    if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
    if(timer&&pending&&timer.getQueryObjectEXT(pending,timer.QUERY_RESULT_AVAILABLE_EXT)){
      if(!gl.getParameter(timer.GPU_DISJOINT_EXT))gpuMs=timer.getQueryObjectEXT(pending,timer.QUERY_RESULT_EXT)/1e6;
      else gpuMs=null;timer.deleteQueryEXT(pending);pending=null;
    }
    var query=timer&&!pending?timer.createQueryEXT():null;if(query)timer.beginQueryEXT(timer.TIME_ELAPSED_EXT,query);
    if(mode===4&&shadowDirty){
      gl.disable(gl.DITHER);gl.bindFramebuffer(gl.FRAMEBUFFER,fb);gl.viewport(0,0,1024,1024);gl.clearColor(1,1,1,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.useProgram(shadowProgram);lightUniforms(su);
      gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.enableVertexAttribArray(shadowPosition);gl.vertexAttribPointer(shadowPosition,3,gl.FLOAT,false,52,0);gl.drawArrays(gl.TRIANGLES,0,model.vertices.length/13);shadowDirty=false;shadowBuilds++;passes++;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.enable(gl.DITHER);gl.viewport(0,0,w,h);gl.clearColor(.035,.05,.07,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.useProgram(main);
    var back=unit(sub(eye,target)),right=unit(cross([0,0,1],back)),up=cross(back,right);
    gl.uniform3fv(u.Eye,eye);gl.uniform3fv(u.Right,right);gl.uniform3fv(u.Up,up);gl.uniform3fv(u.Back,back);gl.uniform1f(u.Aspect,w/h);gl.uniform1f(u.Mode,mode);lightUniforms(u);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);gl.uniform1i(u.Shadow,0);
    gl.bindBuffer(gl.ARRAY_BUFFER,buffer);[3,3,3,4].forEach(function(size,i){gl.enableVertexAttribArray(attributes[i]);gl.vertexAttribPointer(attributes[i],size,gl.FLOAT,false,52,[0,12,24,36][i]);});
    gl.drawArrays(gl.TRIANGLES,0,model.vertices.length/13);passes++;
    if(query){timer.endQueryEXT(timer.TIME_ELAPSED_EXT);pending=query;}
    var cpu=performance.now()-start;DW.flightPerformance.record(metrics,last?now-last:0,cpu);last=now;
    if(now-reportTime>500||!continuous.checked){var m=DW.flightPerformance.summary(metrics);document.getElementById('metrics').textContent=model.triangles.toLocaleString()+' triangles | '+passes+' draw(s)\n'+w+' × '+h+' | '+model.rocks.length+' rock masses\n'+m.fps.toFixed(1)+' FPS | p95 '+m.p95.toFixed(2)+' ms\nCPU '+m.cpu.toFixed(2)+' ms | GPU '+(gpuMs===null?'unavailable':gpuMs.toFixed(2)+' ms')+'\nBuild '+buildMs.toFixed(1)+' ms\nMesh builds '+meshBuilds+' | shadow builds '+shadowBuilds;reportTime=now;}
    document.getElementById('status').textContent=(frozen.checked?'FROZEN':'FIXED until controls change')+' · seed '+seed.value+' · mesh '+model.hash+' · eye '+eye.map(function(v){return v.toFixed(2);}).join(', ')+' m · sun '+sun.value+'° · '+(derivatives?'face normals from actual triangles':'derivatives unavailable: stored-normal fallback');
    sampleBenchmark(now,cpu,passes,w,h);
  }
  function nextCase(){var b=benchmark,c=b.cases[b.index];fixture.value=c.kind;display.value=c.view;seed.value='1729';resolution.value='32';sun.value='25';sunFrame();build();camera(c.camera);b.buildMs=buildMs;b.meshHash=model.hash;b.warmup=30;b.stats=DW.flightPerformance.create();b.frames=0;b.last=0;b.stall=buildMs;b.gpu=[];}
  document.getElementById('run').onclick=function(){if(benchmark)return;benchmark={index:0,results:[],cases:[{kind:'block',view:'plain',camera:'oblique'},{kind:'block',view:'material',camera:'oblique'},{kind:'cellular',view:'material',camera:'horizon'},{kind:'rocks',view:'plain',camera:'horizon'},{kind:'rocks',view:'material',camera:'horizon'},{kind:'rocks',view:'wire',camera:'down'},{kind:'rocks',view:'material',camera:'middle'},{kind:'rocks',view:'material',camera:'far'}]};this.disabled=true;document.getElementById('download').disabled=true;continuous.checked=true;frozen.checked=true;freeze();nextCase();};
  function sampleBenchmark(now,cpu,passes,w,h){var b=benchmark;if(!b)return;if(b.warmup>0){b.stall=Math.max(b.stall,cpu);b.warmup--;b.last=now;return;}DW.flightPerformance.record(b.stats,now-b.last,cpu);b.last=now;b.frames++;if(gpuMs!==null)b.gpu.push(gpuMs);if(b.frames<90)return;var m=DW.flightPerformance.summary(b.stats),c=b.cases[b.index];b.results.push({scene:c.kind,view:c.view,camera:c.camera,eye:eye.slice(),target:target.slice(),seed:1729,light:light.slice(),sunElevation:25,resolution:32,meshHash:b.meshHash,triangles:model.triangles,width:w,height:h,frames:90,frameMs:m.frame,p95Ms:m.p95,worstMs:m.worst,cpuMs:m.cpu,gpuMs:b.gpu.length?b.gpu.reduce(function(a,v){return a+v;},0)/b.gpu.length:null,buildMs:b.buildMs,maxTransitionMs:b.stall,drawCalls:passes});b.index++;if(b.index<b.cases.length){nextCase();return;}document.getElementById('report').value=JSON.stringify({version:1,recordedAt:new Date().toISOString(),description:'Isolated fixed-patch benchmark, no main terrain changes',gpuTiming:timer?'EXT_disjoint_timer_query; disjoint samples rejected':'Unavailable; frame and CPU times are not GPU times',userAgent:navigator.userAgent,results:b.results},null,2);benchmark=null;continuous.checked=false;document.getElementById('run').disabled=false;document.getElementById('download').disabled=false;dirty=true;}
  document.getElementById('download').onclick=function(){var url=URL.createObjectURL(new Blob([document.getElementById('report').value],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='driftworks-terrain-laboratory.json';a.click();setTimeout(function(){URL.revokeObjectURL(url);},0);};
  sunFrame();build();freeze();
  function frame(now){if(!document.hidden&&(dirty||continuous.checked||benchmark)){dirty=false;draw(now);}else last=0;requestAnimationFrame(frame);}requestAnimationFrame(frame);
})(window);
