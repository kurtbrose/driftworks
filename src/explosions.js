(function () {
  'use strict';
  var DW = window.Driftworks;
  /** Camera-facing coordinates live in normals; z stores normalized lobe age.
   * @typedef {[number,number,number]} V3
   * @typedef {{position:V3,velocity?:V3,age:number,size:number,seed:number}} Blast
   * @typedef {{vertices:Float32Array,color:V3,finish:number,age:number}} Batch
   */
  var shaderSource = `
    float blastHash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
    float blastNoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(blastHash(i),blastHash(i+vec3(1,0,0)),f.x),mix(blastHash(i+vec3(0,1,0)),blastHash(i+vec3(1,1,0)),f.x),f.y),mix(mix(blastHash(i+vec3(0,0,1)),blastHash(i+vec3(1,0,1)),f.x),mix(blastHash(i+vec3(0,1,1)),blastHash(i+vec3(1,1,1)),f.x),f.y),f.z);}
    float blastFbm(vec3 p){float n=0.,a=.55;for(int j=0;j<5;j++){n+=a*blastNoise(p);p=p*2.07+vec3(7.1,3.7,1.3);a*=.48;}return n;}
    vec4 blastFire(vec2 p,float age,float phase,float offset){
      float r=length(p);vec3 q=vec3(p*3.,age*1.8+offset);
      float roll=blastFbm(q+vec3(blastFbm(q+4.),blastFbm(q-3.),0.)*2.5);
      float boundary=1.-smoothstep(.58,.95,r+(roll-.5)*.42);
      float cells=blastFbm(q*3.2+roll*2.);float heat=clamp((1.-r)*.6+roll*.65+cells*.5-phase*.85,0.,1.);
      vec3 color=mix(vec3(.19,.012,.002),vec3(1.,.12,.006),smoothstep(.18,.48,heat));
      color=mix(color,vec3(1.,.65,.035),smoothstep(.45,.7,heat));color=mix(color,vec3(1.,.97,.62),smoothstep(.7,.9,heat));
      return vec4(color,boundary*(1.-smoothstep(.65,1.,phase)));
    }
    vec4 blastWave(vec2 p,float age){float a=atan(p.y,p.x);float warp=.016*sin(a*9.+age*12.)+.012*sin(a*17.-age*8.);float r=length(p)+warp;
      float front=exp(-pow((r-.83)/.012,2.));float wake=exp(-pow((r-.79)/.055,2.))*.14*blastNoise(vec3(p*35.,age*8.));
      return vec4(1.,.72,.3,(front+wake)*pow(max(0.,1.-age/.38),1.7));}
  `;
  /** @param {Blast} blast @param {V3} right @param {V3} up @returns {Batch[]} */
  function build(blast,right,up) {
    var age=blast.age,size=blast.size;
    if(age<0||age>=5.5||size<=0)return [];
    /** @param {number} n */
    function random(n){var v=Math.sin(blast.seed*12.73+n*78.233)*43758.5453;return v-Math.floor(v);}
    /** @param {number} n @returns {V3} */
    function direction(n){var z=random(n)*2-1,a=random(n+1)*Math.PI*2,r=Math.sqrt(1-z*z);return [r*Math.cos(a),z,r*Math.sin(a)];}
    /** @param {number} n @param {number} distance @returns {V3} */
    function center(n,distance){var d=direction(n);return [blast.position[0]+(blast.velocity||[0,0,0])[0]*age+d[0]*distance,blast.position[1]+(blast.velocity||[0,0,0])[1]*age+d[1]*distance,blast.position[2]+(blast.velocity||[0,0,0])[2]*age+d[2]*distance];}
    /** @type {Batch[]} */ var batches=[];
    /** @param {number[]} data @param {V3} p @param {number} width @param {number} height @param {number} phase @param {V3} [r] @param {V3} [u] */
    function quad(data,p,width,height,phase,r,u){r=r||right;u=u||up;[-1,-1,1,-1,1,1,-1,-1,1,1,-1,1].forEach(function(_,i,coords){if(i%2)return;var x=coords[i],y=coords[i+1];data.push(p[0]+r[0]*x*width/2+u[0]*y*height/2,p[1]+r[1]*x*width/2+u[1]*y*height/2,p[2]+r[2]*x*width/2+u[2]*y*height/2,x,y,phase);});}
    /** @param {number[]} data @param {V3} color @param {number} finish @param {number} [clock] */
    function batch(data,color,finish,clock){if(data.length)batches.push({vertices:new Float32Array(data),color:color,finish:finish,age:clock===undefined?age:clock});}
    // Opaque fragments first, before translucent fire and additive light.
    /** @type {number[]} */ var hull=[];
    for(var i=0;i<22;i++){
      var p=center(i*13+900,size*(3+random(i+10)*10)*age),s=size*(i%7===0?1.1:.15+random(i+3)*.4),a=age*(i+1)*.7;
      /** @type {V3[]} */ var points=[[s*Math.cos(a),s*Math.sin(a),0],[-s*Math.sin(a),s*Math.cos(a),s*.4],[-s*Math.cos(a),-s*Math.sin(a),0],[0,0,-s*.6]];
      [[0,1,2],[0,3,1],[1,3,2],[2,3,0]].forEach(function(face){face.forEach(function(k){hull.push(p[0]+points[k][0],p[1]+points[k][1],p[2]+points[k][2],0,0,1);});});
    }batch(hull,[.12,.15,.17],0);
    for(var j=0;j<9;j++){
      var t=age-j*.017,life=.6+random(j+30)*.5;
      if(t<=0||t>=life)continue;
      var radius=size*(2+Math.sqrt(t)*8)*(.6+random(j+17)*.7);
      /** @type {number[]} */ var data=[];
      quad(data,center(j*7,size*(.2+Math.sqrt(t)*3.5)),radius,radius,t/life);batch(data,[j*13.7+blast.seed*.01,0,0],10,t);
    }
    if(age<.38){
      /** @type {number[]} */
      var wave=[];
      quad(wave,center(0,0),size*(3+age*42),size*(3+age*42),1);batch(wave,[1,.72,.3],11);
    }
    /** @type {number[]} */ var glow=[];
    if(age<.065)quad(glow,center(0,0),size*(8+age*85),size*(8+age*85),(1-age/.065)*2);
    for(var k=0;k<60;k++){
      var lifeSpark=.25+random(k+50)*1.2,hero=k%13===0;
      if(age>=lifeSpark)continue;
      var d=direction(k*9+500),speed=(hero?22:5)+random(k+80)*13;
      var length=size*(hero?2.4:.12+random(k+91)*.8)*(1-age/lifeSpark);
      quad(glow,center(k*9+500,size*speed*age),length,size*(hero?.08:.035),(1-age/lifeSpark)*(hero?1:.25+random(k+70)*.65),d,up);
    }
    if(age>.06&&age<1.9)for(var f=0;f<6;f++)for(var h=0;h<4;h++){
      var n=f*3;quad(glow,center(n*13+900,size*((3+random(n+10)*10)*age-.3-h*.45)),size*(.8+h*.22),size*(.8+h*.22),(1-age/1.9)*(.65-h*.14));
    }
    batch(glow,[1,.55,.12],9);return batches;
  }
  DW.explosions={shaderSource:shaderSource,build:build};
})();
