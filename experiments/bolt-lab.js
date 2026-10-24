(function () {
  'use strict';
  /** @typedef {import('./bolt-lab-types').V3} V3 */
  /** @typedef {import('./bolt-lab-types').Basis} Basis */
  /** @typedef {import('../src/three-types').Object3D} Object3D */
  /** @typedef {import('../src/three-types').Material} Material */
  /** @type {import('../src/three-types').Three} */
  const THREE = window.THREE;
  const model = /** @type {import('./bolt-lab-types').BoltRangeModel} */ (window.Driftworks.boltRangeModel);
  /** @param {string} id */
  function el(id) {const found = document.getElementById(id);if (!found) throw new Error(id);return found;}
  /** @param {string} id */
  function value(id) {return /** @type {HTMLInputElement | HTMLSelectElement} */ (el(id)).value;}
  const canvas = /** @type {HTMLCanvasElement} */ (el('range'));
  const auto = /** @type {HTMLInputElement} */ (el('auto'));
  const atlas = /** @type {HTMLImageElement} */ (el('atlas'));
  const renderer = new THREE.WebGLRenderer({canvas, antialias:true, alpha:false, premultipliedAlpha:false});
  renderer.setClearColor(0x03070c, 1);
  const scene = new THREE.Scene(), camera = new THREE.Camera();
  camera.matrixAutoUpdate = false;
  const texture = new THREE.Texture(atlas);texture.flipY = false;texture.minFilter = THREE.LinearFilter;texture.magFilter = THREE.LinearFilter;
  let width = 1, height = 1, time = 0, last = 0, next = 0, paused = false, held = false, burst = 0, volley = 0;
  let aim = {x:0, y:0};
  let frameSeconds = 0, frameCount = 0, measuredFps = 0, flightInterval = 1/60;
  /** @type {V3} */ let eye = [0,0,0];
  let basis = model.basis(0,0,0);
  /** @type {(import('./bolt-lab-types').BallisticShot & {mesh:Object3D;material:Material;life:number;variant:number})[]} */
  const shots = [];
  const names = ['Cyan confinement', 'Green pulse', 'Red laser pulse', 'Amber plasma'];
  /** @param {number[]} points @param {number[]} [colors] */
  function geometry(points, colors) {
    const geo = new THREE.BufferGeometry();geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(points), 3));
    if(colors)geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colors),3));return geo;
  }
  const quad = geometry([-1,-1,0, 1,-1,0, 1,1,0, -1,-1,0, 1,1,0, -1,1,0]);
  // A flight-aligned luminous body, viewed through the current camera.
  // Camera angular velocity never contributes to its world-space length.
  const vertex = `precision highp float;
attribute vec3 position;
uniform mat4 projectionMatrix;
uniform float diameter;uniform vec3 viewCenter;uniform vec2 viewSpan;
varying vec2 uv;
void main(){
 uv=position.xy*.5+.5;
 float projected=length(viewSpan);
 vec2 along=projected>.0001?viewSpan/projected:vec2(1.,0.);
 vec2 side=vec2(-along.y,along.x);
 vec4 p=vec4(viewCenter,1.);
 p.xy+=along*position.x*(diameter+projected)*.5+side*position.y*diameter*.5;
 gl_Position=projectionMatrix*p;
}`;
  const fragment = `precision highp float;
uniform sampler2D atlas;uniform float frame;uniform float row;
varying vec2 uv;
void main(){
 vec4 c=texture2D(atlas,(vec2(frame,row)+vec2(uv.x,1.-uv.y))*.25);
 c.a*=1.-smoothstep(.43,.5,length(uv-.5));
 if(c.a<.002)discard;gl_FragColor=c;
}`;
  /** @param {number} style */
  function shotMaterial(style) {return new THREE.RawShaderMaterial({vertexShader:vertex,fragmentShader:fragment,uniforms:{atlas:{value:texture},frame:{value:0},row:{value:style},diameter:{value:6},viewCenter:{value:[0,0,-1]},viewSpan:{value:[0,0]}},side:THREE.DoubleSide,transparent:true,depthTest:true,depthWrite:false,blending:THREE.AdditiveBlending,defaultAttributeValues:{}});}
  const flat = new THREE.RawShaderMaterial({vertexShader:'precision highp float;attribute vec3 position;attribute vec3 color;uniform mat4 modelViewMatrix;uniform mat4 projectionMatrix;varying vec3 col;void main(){col=color;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'precision highp float;varying vec3 col;void main(){gl_FragColor=vec4(col,1.);}',uniforms:{},side:THREE.DoubleSide,transparent:false,depthWrite:true,blending:THREE.NoBlending,defaultAttributeValues:{color:[.3,.36,.43]}});
  /** @param {Object3D} object @param {V3} position @param {Basis} [rotation] */
  function place(object, position, rotation) {
    const b = rotation || model.basis(0,0,0);
    object.matrixAutoUpdate = false;object.matrix.fromArray([...b.right,0,...b.up,0,...b.back,0,...position,1]);
    object.matrixWorld.copy(object.matrix);
  }
  // Opaque 12 m silhouettes provide flight-scale and real depth occlusion cues.
  const fighterGeometry = geometry([0,0,-7, -1.5,1,4, 1.5,1,4, 0,0,-7, 1.5,1,4, 0,-1.3,5, 0,0,-7, 0,-1.3,5, -1.5,1,4, -6,-.1,4, -1,0,-2, 6,-.1,4, -1.5,1,4, 0,3,5, 1.5,1,4]);
  const fighters = Array.from({length:4}, () => {const mesh = new THREE.Mesh(fighterGeometry,flat);scene.add(mesh);return mesh;});
  const gunGeometry = geometry([-1,-1,0, 1,-1,0, 1,1,-5, -1,-1,0, 1,1,-5, -1,1,-5]);
  const guns = [-1,1].map(side => {const mesh = new THREE.Mesh(gunGeometry,flat);scene.add(mesh);return {mesh, side};});
  /** @type {number[]} */ const stars = [];
  /** @type {number[]} */ const starColors = [];
  for(let i=0;i<2200;i++) {const a=i*2.39996,z=1-2*(i+.5)/2200,r=Math.sqrt(1-z*z),x=Math.cos(a)*r*9000,y=Math.sin(a)*r*9000,d=z*9000;stars.push(x-3,y-3,d,x+3,y-3,d,x,y+3,d);for(let j=0;j<3;j++)starColors.push(.2+(i%5)*.085,.24+(i%5)*.085,.28+(i%5)*.085);}
  const starGeometry = geometry(stars,starColors), starMesh = new THREE.Mesh(starGeometry,flat);place(starMesh,[0,0,0]);scene.add(starMesh);
  /** @param {V3} a @param {V3} b @returns {V3} */
  function add(a,b) {return [a[0]+b[0],a[1]+b[1],a[2]+b[2]];}
  /** @param {V3} p @returns {V3} */
  function normalize(p) {const length=Math.hypot(...p)||1;return [p[0]/length,p[1]/length,p[2]/length];}
  /** @param {V3} position @param {V3} direction @param {number} style @param {number} life */
  function spawn(position,direction,style,life) {
    if(shots.length>=160)remove(0);
    const material=shotMaterial(style), mesh=new THREE.Mesh(quad,material);mesh.frustumCulled=false;place(mesh,position);scene.add(mesh);
    const speed=+value('velocity');shots.push({position,velocity:[direction[0]*speed,direction[1]*speed,direction[2]*speed],age:0,style,mesh,material,life,variant:Math.floor(Math.random()*4)});
  }
  /** @param {number} index */
  function remove(index) {const shot=shots[index];scene.remove(shot.mesh);shot.material.dispose();shots.splice(index,1);}
  function clear() {while(shots.length)remove(shots.length-1);burst=0;}
  function fire() {
    const view=value('view'), distance=+value('distance'), selected=+value('style');
    const styles = value('palette') === 'all' ? [0,1,2,3] : [selected];
    const life=Math.max(1,distance*2.2/+value('velocity'));
    styles.forEach((style,index) => {
      const lane = styles.length>1 ? (index-1.5)*distance*.09 : 0;
      if(view==='pilot'||view==='dogfight') {
        const target=model.local(basis,[lane,0,-distance]);
        [-1,1].forEach(side=>{const origin=add(eye,model.local(basis,[side*2.4,-1.7,-7]));spawn(origin,normalize([target[0]+eye[0]-origin[0],target[1]+eye[1]-origin[1],target[2]+eye[2]-origin[2]]),style,life);});
      }
      if(view==='crossing'||view==='dogfight') {
        const depths=view==='crossing'?[distance*.4,distance,distance*1.8]:[distance];
        depths.forEach((depth,i)=>{const path=model.crossing(depth,time+i);path.position[1]+=lane+(i-1)*depth*.08;spawn(path.position,path.direction,style,life);});
      }
      if(view==='incoming'||view==='dogfight') {
        const origin=/** @type {V3} */ ([Math.sin(time*.8)*distance*.15+lane,Math.cos(time*.7)*distance*.08,-distance]);
        const pass=add(eye,[18+lane*.05,-9,45]);spawn(origin,normalize([pass[0]-origin[0],pass[1]-origin[1],pass[2]-origin[2]]),view==='dogfight'?(style+2)%4:style,life);
      }
    });volley++;
  }
  function resize() {const r=canvas.getBoundingClientRect();width=r.width;height=r.height;const dpr=Math.min(devicePixelRatio,2);renderer.setSize(Math.round(width*dpr),Math.round(height*dpr),false);const near=.5,top=near*Math.tan(70*Math.PI/360),right=top*width/height;camera.projectionMatrix.makePerspective(-right,right,top,-top,near,20000);camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();}
  function updateCamera() {
    const moving=/** @type {HTMLInputElement} */ (el('maneuver')).checked;
    const yaw=-aim.x*.45+(moving?Math.sin(time*.43)*.09:0),pitch=-aim.y*.3+(moving?Math.sin(time*.61)*.045:0),roll=moving?Math.sin(time*.43)*.18:0;
    basis=model.basis(yaw,pitch,roll);eye=moving?[Math.sin(time*.3)*12,Math.sin(time*.4)*6,Math.sin(time*.22)*16]:[0,0,0];
    place(camera,eye,basis);camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
    guns.forEach(gun=>place(gun.mesh,add(eye,model.local(basis,[gun.side*2.4,-2.4,-4])),basis));
    const d=+value('distance');
    fighters.forEach((fighter,i)=>{const phase=time*.42+i*1.8;place(fighter,[Math.sin(phase)*d*(i===0?.14:.42),Math.cos(phase*.9)*d*.15,-d*(.65+i*.35)],model.basis(Math.sin(phase)*.5,Math.cos(phase)*.2,Math.sin(phase)*.7));});
  }
  /** @param {number} ms */
  function tick(ms) {
    const elapsed=(ms-last)/1000||0;
    if(last && elapsed>0 && elapsed<.5){frameSeconds+=elapsed;frameCount++;if(frameSeconds>=.5){measuredFps=frameCount/frameSeconds;frameSeconds=0;frameCount=0;}}
    const dt=Math.min(elapsed,.05);last=ms;const step=paused?0:dt*+value('speed');time+=step;if(!paused && dt>0)flightInterval=step;updateCamera();
    if(!paused&&(auto.checked||held||burst>0)&&time>=next){fire();next=time+ +value('cadence');if(burst>0)burst--;}
    for(let i=shots.length-1;i>=0;i--) {const shot=shots[i];model.advance(shot,step);if(shot.age>shot.life){remove(i);continue;}place(shot.mesh,shot.position);shot.material.uniforms.frame.value=value('animation')==='same'?0:shot.variant;shot.material.uniforms.diameter.value=6*+value('size');const body=model.projectedBody(shot.position,shot.velocity,eye,basis,model.bodyLength(Math.hypot(...shot.velocity),flightInterval,6*+value('size'),+value('stretch')),6*+value('size'));shot.mesh.visible=!!body;if(body){shot.material.uniforms.viewCenter.value=body.center;shot.material.uniforms.viewSpan.value=body.span;}shot.material.blending=value('blend')==='lighter'?THREE.AdditiveBlending:THREE.NormalBlending;}
    renderer.render(scene,camera);el('stats').textContent=(paused?'PAUSED · ':'')+shots.length+' bolts · '+volley+' volleys / '+measuredFps.toFixed(0)+' fps / '+(measuredFps?1000/measuredFps:0).toFixed(1)+' ms / '+(measuredFps?+value('velocity')*+value('speed')/measuredFps:0).toFixed(1)+' m per frame';
    el('caption').textContent='3D / 70° FOV · '+value('velocity')+' m/s · '+(value('palette')==='all'?'CYAN / GREEN / RED / AMBER':names[+value('style')]);requestAnimationFrame(tick);
  }
  function pause() {paused=!paused;el('pause').textContent=paused?'Resume':'Pause';}
  canvas.addEventListener('pointermove',event=>{const r=canvas.getBoundingClientRect();aim={x:(event.clientX-r.left)/width*2-1,y:(event.clientY-r.top)/height*2-1};});
  canvas.addEventListener('pointerdown',event=>{held=true;canvas.setPointerCapture(event.pointerId);canvas.focus();});
  canvas.addEventListener('pointerleave',()=>{if(!held)aim={x:0,y:0};});
  window.addEventListener('pointerup',()=>{held=false;});window.addEventListener('blur',()=>{held=false;});
  document.addEventListener('visibilitychange',()=>{if(document.hidden){held=false;paused=true;el('pause').textContent='Resume';}});
  window.addEventListener('keydown',event=>{if(/INPUT|SELECT|BUTTON/.test(document.activeElement?document.activeElement.tagName:''))return;if(event.code==='Space'){event.preventDefault();held=true;}if(event.code==='KeyP'&&!event.repeat)pause();});
  window.addEventListener('keyup',event=>{if(event.code==='Space')held=false;});
  el('pause').onclick=pause;el('clear').onclick=clear;el('fire').onclick=()=>{burst=6;paused=false;el('pause').textContent='Pause';};
  el('view').onchange=clear;el('palette').onchange=clear;
  function readouts(){el('distance-value').textContent=value('distance')+' m';el('size-value').textContent=(+value('size')).toFixed(1)+'×';}
  el('distance').oninput=readouts;el('size').oninput=readouts;
  function loaded(){texture.needsUpdate=true;el('status').textContent='Round plasma atlas loaded · world-space ballistics, perspective scaling, depth occlusion. 12 m fighter silhouettes for scale.';}
  atlas.onload=loaded;atlas.onerror=()=>{el('status').textContent='Plasma atlas failed to load.';};if(atlas.complete&&atlas.naturalWidth)loaded();
  window.addEventListener('resize',resize);readouts();resize();requestAnimationFrame(tick);
})();
