(function probe(){
 const DW=window.Driftworks,params=new URLSearchParams(location.search),mode=params.get('bridge')||'new',view=params.get('view')||'approach',fly=params.has('fly'),firing=params.has('fire'),live=params.has('live')||fly||firing;
 if(params.has('hoist')){
  DW.ellisOptics.shader=DW.ellisOptics.shader.replace('float inward;};','float inward;float root;float start;float finish;};')
   .replace('return EllisRay(radial,tangent,b,u,ellisIntegral(b,u),entry*300.,side,hit,cosine<0.?1.:0.);',`float end=b<1.?ellisAsinh(24./root):ellisAcosh(max(1.,24./root));
    float inward=cosine<0.?1.:0.;
    return EllisRay(radial,tangent,b,u,ellisIntegral(b,u),entry*300.,side,hit,inward,root,inward>.5&&b>=1.?-u:u,inward>.5&&b<1.?-end:end);`)
   .replace(/float root=sqrt\(max\(\.0000001,abs\(1\.-e\.b\*e\.b\)\)\);[\s\S]*?float u=mix\(start,finish,t\);/,'float root=e.root;float u=mix(e.start,e.finish,t);');
 }
 if(params.get('quality')==='coarse'){
  const Raw=window.THREE.RawShaderMaterial;
  window.THREE.RawShaderMaterial=class extends Raw {constructor(options){
   if(options.fragmentShader.includes('float shellGap'))options={...options,fragmentShader:options.fragmentShader.replace(/\/\/ A sample behind[\s\S]*?(?= return vec3\(0\.\);)/,`for(int i=0;i<64;i++){
    float side;vec3 p=ellisPoint(e,(float(i)+.5)/64.,side);
    if(shellGap(p,side)>=0.)return vec3((float(i)+.5)/64.,side,1.);
   }
`)};
   super(options);
  }};
 }
 let compareRequested=false;
 const contexts=new WeakMap();
 let stages={},gpuRows=[],gpuInvalid=0,contextLosses=0,activeRow=null,lastSimMs=0;
 const diagnosticsMount=DW.flightDiagnostics.mount;
 DW.flightDiagnostics.mount=function(...args){
  const diagnostics=diagnosticsMount(...args),begin=diagnostics.beginFrame,end=diagnostics.endFrame;
  diagnostics.beginFrame=function(...values){const frame=begin(...values);if(frame){stages={};activeRow=null;}return frame;};
  diagnostics.endFrame=function(frame,...values){if(activeRow){activeRow.fullCpu=performance.now()-frame.started;activeRow.rafFrame=frame.actualElapsed*1000;}return end(frame,...values);};
  return diagnostics;
 };
 for(const [object,key,stage] of [[DW.ellisOptics,'primary','opticalInverse'],[DW.flightGuns,'geometry','boltGeometry'],[DW.shipPackModels,'engineGeometry','engines']]){
  const original=object[key];object[key]=function(...args){const start=performance.now();try{return original(...args);}finally{const row=stages[stage]||(stages[stage]={calls:0,triangles:0,cpu:0});row.calls++;row.cpu+=performance.now()-start;}};
 }
 function timer(gl){
  if(gl)gl.canvas.addEventListener('webglcontextlost',()=>{contextLosses++;});
  const modern=gl&&gl.getExtension('EXT_disjoint_timer_query_webgl2'),ext=modern||gl&&gl.getExtension('EXT_disjoint_timer_query'),pending=[];
  if(!ext||!params.has('gpu'))return ()=>()=>{};
  return stage=>{
   if(contextLosses)return ()=>{};
   if(gl.getParameter(ext.GPU_DISJOINT_EXT)){gpuInvalid+=pending.length;pending.splice(0).forEach(p=>modern?gl.deleteQuery(p.q):ext.deleteQueryEXT(p.q));}
   while(pending.length){const p=pending[0],available=modern?gl.getQueryParameter(p.q,gl.QUERY_RESULT_AVAILABLE):ext.getQueryObjectEXT(p.q,ext.QUERY_RESULT_AVAILABLE_EXT);if(!available)break;
    const ns=modern?gl.getQueryParameter(p.q,gl.QUERY_RESULT):ext.getQueryObjectEXT(p.q,ext.QUERY_RESULT_EXT);gpuRows.push({stage:p.stage,ms:ns/1e6});modern?gl.deleteQuery(p.q):ext.deleteQueryEXT(p.q);pending.shift();
   }
   if(!collect)return ()=>{};
   const q=modern?gl.createQuery():ext.createQueryEXT();modern?gl.beginQuery(ext.TIME_ELAPSED_EXT,q):ext.beginQueryEXT(ext.TIME_ELAPSED_EXT,q);
   return ()=>{modern?gl.endQuery(ext.TIME_ELAPSED_EXT):ext.endQueryEXT(ext.TIME_ELAPSED_EXT);pending.push({q,stage});};
  };
 }
 const makeSky=DW.flightSkybox.create;
 DW.flightSkybox.create=function(host,...args){
  if(params.get('ablate')==='geometry-only')return {render(){},getRenderStats(){return {drawCalls:0,triangles:0,points:0,meshes:0,materials:0};}};
  const sky=makeSky(host,...args),render=sky.render,canvas=host.querySelector('canvas.flight-skybox'),gl=canvas.getContext('webgl'),clock=timer(gl);contexts.set(canvas,gl);
  sky.render=function(...args){const end=clock('sky');render(...args);end();};return sky;
 };
 function timedMethod(object,key,stage){const original=object[key];object[key]=function(...args){const start=performance.now();try{return original.apply(this,args);}finally{const row=stages[stage]||(stages[stage]={calls:0,triangles:0,cpu:0});row.calls++;row.cpu+=performance.now()-start;}};}
 for(const [object,key,methods] of [[DW.flightHud,'mount',[['render','hud']]],[DW.flightComms,'mount',[['update','radio']]],[DW.flightPortraits,'mount',[['show','portraitShow'],['update','portraitUpdate']]],[DW.aegisFlight,'createEllisPatrol',[['step','capitalStep'],['geometry','capitalGeometry']]]]){
  const factory=object[key];object[key]=function(...args){const result=factory.apply(this,args);for(const [method,stage] of methods)timedMethod(result,method,stage);return result;};
 }
 for(const [key,stage] of [['analyze','speechPlan'],['render','speechSynthesis'],['radioNoise','radioNoise'],['transmit','radioTransmit']])timedMethod(DW.mumble,key,stage);
 const Renderer=window.THREE.WebGLRenderer;
 window.THREE.WebGLRenderer=class extends Renderer {constructor(...args){
  super(...args);let target=null,captured=0,fastScene=null,referenceMaterial=null;const clock=timer(this.getContext());contexts.set(this.domElement,this.getContext());
  const set=this.setRenderTarget.bind(this),clear=this.clear.bind(this),render=this.render.bind(this);
  this.setRenderTarget=(t,...rest)=>{target=t;return set(t,...rest);};
  const atlas=()=>target&&target.width===1152&&target.height===768;
  const skip=()=>params.get('ablate')==='captures'&&atlas()&&captured>=12;
  this.clear=(...args)=>{if(!skip())return clear(...args);};
  this.render=(scene,camera)=>{
   if(params.get('ablate')==='sky-only')return;
   if(skip())return;
   const stage=scene.children.some(o=>o.material&&o.material.fragmentShader&&o.material.fragmentShader.startsWith('#define ELLIS_REFINE_PASS'))?'refinement':scene.children.some(o=>o.material&&o.material.fragmentShader&&o.material.fragmentShader.includes('ELLIS_HIT_MAP_PASS'))?'hitMap':atlas()?'captures':target?'primary':scene.children.some(o=>o.material&&o.material.uniforms&&o.material.uniforms.sourceDepth)?'compositor':params.get('bridgeGeometry')==='objects'&&scene.children.some(o=>o.material&&o.material.uniforms&&o.material.uniforms.uLensEnabled)?'objectWarp':'screen',t=performance.now(),end=clock(stage);
   render(scene,camera);end();if(atlas())captured++;
   if(stage==='compositor')fastScene=scene;
   if(params.get('bridgeTemporal')==='1'&&compareRequested){compareRequested=false;document.querySelector('#bench-result').textContent='Temporal validation uses separate matched runs; synchronous comparison is disabled.';}
   if((compareRequested==='map'&&stage==='refinement')||(compareRequested==='angle'&&stage==='compositor')){
    const comparison=compareRequested;compareRequested=false;const gl=this.getContext(),w=gl.drawingBufferWidth,h=gl.drawingBufferHeight,obj=fastScene.children.find(o=>o.material&&o.material.uniforms&&o.material.uniforms.useHitMap),original=obj.material;
    if(!referenceMaterial)referenceMaterial=new window.THREE.RawShaderMaterial({vertexShader:original.vertexShader,fragmentShader:'#define ELLIS_FULL_PASS\n'+original.fragmentShader,uniforms:original.uniforms,side:window.THREE.DoubleSide,transparent:false,depthTest:false,depthWrite:false,blending:window.THREE.NoBlending,defaultAttributeValues:{}});
    if(!w||!h||gl.isContextLost()){document.querySelector('#bench-result').textContent='Comparison invalid: WebGL context unavailable';return;}
    const oldAngle=original.uniforms.maxGeometryAngle.value,a=new Uint8Array(w*h*4),b=new Uint8Array(a.length);
    gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,b);
    if(comparison==='angle')original.uniforms.maxGeometryAngle.value=1e6;
    obj.material=referenceMaterial;render(fastScene,camera);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,a);
    original.uniforms.maxGeometryAngle.value=oldAngle;obj.material=original;render(fastScene,camera);if(comparison==='map')render(scene,camera);
    let missing=0,extra=0,changed=0,maximum=0,error=0,opaque=0;
    for(let i=0;i<a.length;i+=4){if(a[i+3]>127)opaque++;if(a[i+3]>127&&b[i+3]<128)missing++;if(a[i+3]<128&&b[i+3]>127)extra++;let delta=0;for(let k=0;k<4;k++){delta=Math.max(delta,Math.abs(a[i+k]-b[i+k]));error+=Math.abs(a[i+k]-b[i+k]);}if(delta>8)changed++;maximum=Math.max(maximum,delta);}
    document.querySelector('#bench-result').textContent=JSON.stringify({comparison,valid:opaque>0,view,width:w,height:h,opaque,missing,extra,changed,maximum,meanChannelError:error/a.length},null,2);
   }
   const row=stages[stage]||(stages[stage]={calls:0,triangles:0,cpu:0});
   row.calls+=this.info.render.calls;row.triangles+=this.info.render.triangles;row.cpu+=performance.now()-t;
  };
 }};
 if(params.get('ablate')==='direct'){
  DW.ellisRenderer.create=function(THREE,renderer){return {invalidate(){},dispose(){},render(scene,camera,entries,pose,focal,far,width,height){
   const visibility=entries.map(e=>e.object.visible);entries.forEach((e,i)=>{e.object.visible=visibility[i]&&(e.region||0)===(pose.region||0);});
   try{if(DW.gpuDiagnostics)DW.gpuDiagnostics.mark('isolation.direct');renderer.setRenderTarget(null);renderer.setViewport(0,0,width,height);renderer.setClearColor(0,0);renderer.clear();renderer.render(scene,camera);}
   finally{entries.forEach((e,i)=>{e.object.visible=visibility[i];});}
   return {objectPaths:0,objectPatches:0,objectError:0,objectBad:0,compositionPasses:0,historyValid:0,extraPasses:0,captures:0,cpuMs:0};
  }};};
 }
 if(params.get('ablate')==='geometry'){
  const Raw=window.THREE.RawShaderMaterial;
  window.THREE.RawShaderMaterial=class extends Raw {constructor(o){super({...o,fragmentShader:o.fragmentShader.replace('vec4 base=lens();','vec4 base=texture2D(sourceColor,screen*.5+.5);')});}};
 }
 let sampleStart;
 let frozen=false;
 let session,presentation,rows=[],collect=false,last=0,ready=false;
 const create=DW.flightSession.create;
 DW.flightSession.create=function(environment){
  const result=create({...environment,seed:29}),reset=result.reset;
  result.reset=function(config){const s=reset(config),u=DW.sim.METERS_PER_UNIT;
   if(params.has('slow'))config.profile.maxVelocity[2]=2;
   let eye=[0,-3250,1550],f=[0,1,0];
   if(view==='transit'||view==='warped')eye=[0,-2400,1550];
   if(view==='limb'){eye=[80,-2320,1550];f=[.35,Math.sqrt(1-.35*.35),0];}
   if(view==='before-throat')eye=[0,-2300.000003,1550];
   if(view==='after-throat')eye=[12000,-1699.999994666667,1550];
   if(view==='return-transit'){eye=[12000,-1600,1550];f=[0,-1,0];}
   if(view==='rim'){eye=[550,-2200,1550];const d=Math.hypot(550,200);f=[-550/d,200/d,0];}
   if(view==='moon'){eye=[12000,-1250,1550];f=[0,-1,0];}
   if(view==='moon-away'){eye=[12000,-1250,1550];f=[0,1,0];}
   Object.assign(s.state,{eye:eye.map(x=>x/u),right:[f[1],-f[0],0],up:[0,0,1],back:f.map(x=>-x),velocity:[0,0,0],ramp:[0,0,0],throttle:0});
   if(view==='after-throat'){s.state.right=[-1,0,0];s.state.up=[0,0,-1];}
   s.state.region=['moon','moon-away','return-transit','after-throat'].includes(view)?1:0;
   if(view==='warped'){s.combat.enemies[0].pose.region=1;s.combat.enemies[0].pose.eye=[12040/u,-1650/u,1570/u];s.combat.enemies[0].pose.back=[0,-1,0];s.combat.enemies[0].pose.right=[1,0,0];s.combat.enemies[0].pose.up=[0,0,1];}
   if(view==='foreground'){s.combat.enemies[0].pose.eye=[0,-3150/u,1550/u];s.combat.enemies[0].pose.back=[0,-1,0];s.combat.enemies[0].pose.right=[1,0,0];s.combat.enemies[0].pose.up=[0,0,1];}
   return s;
  };
  const advance=result.advance;result.advance=function(dt,controls,config){const start=performance.now();try{return live&&!frozen?advance(dt,{...controls,stop:!fly,throttle:fly?1:null,fire:firing},config):result.snapshot();}finally{lastSimMs=performance.now()-start;}};
  const scenery=result.advanceScenery;result.advanceScenery=function(dt){if(live&&!frozen)scenery(dt);};
  session=result;return result;
 };
 const mount=DW.flightPresentation.mount;
 DW.flightPresentation.mount=function(...args){const result=mount(...args),render=result.render;
  let panAngle=0;
  result.render=function(...args){
   if(params.has('pan')){panAngle+=params.get('pan')==='fast'?.1:.001;const s=args[0].state;s.right=[Math.cos(panAngle),-Math.sin(panAngle),0];s.back=[-Math.sin(panAngle),-Math.cos(panAngle),0];result.pose(s);args[0]={...args[0],world:session.snapshot().world};}
   const t=performance.now();render(...args);if(collect){const now=performance.now(),s=result.renderStats().scene,snapshot=session.snapshot(),bolts=snapshot.guns.bolts.length+snapshot.combat.enemies.reduce((sum,craft)=>sum+craft.guns.bolts.length,0);activeRow={frame:now-last,cpu:now-t,fullCpu:0,rafFrame:0,sim:lastSimMs,bolts:bolts,historyValid:s.bridgeHistoryValid||0,draws:s.drawCalls,triangles:s.triangles,captures:s.bridgeCaptures||0,bridgeCpu:s.bridgeCpuMs||0,stages};rows.push(activeRow);last=now;}};
  presentation=result;return result;
 };
 const panel=document.createElement('details');panel.open=true;panel.id='ellis-benchmark';
 panel.style.cssText='position:fixed;z-index:100;top:8px;right:8px;max-width:500px;background:#06131eef;padding:12px;color:white;font:12px monospace;';
 panel.innerHTML='<summary>Ellis matched benchmark</summary><button id="measure">Measure (2 s warmup + 8 s sample)</button> <button id="preview">Preview only</button> <button id="snapshot">Snapshot state</button> <button id="freeze">Freeze</button> <button id="gpu-caps">GPU capabilities</button> <button id="compare">Compare hit map</button> <button id="compare-angle">Compare angular cutoff</button><pre id="bench-result">'+mode+' / '+view+' / '+(live?'live':'frozen simulation')+'</pre>';
 document.body.appendChild(panel);
 function start(){if(!session||!presentation){document.querySelector('#bench-result').textContent='Flight is still loading';return false;}if(!ready){document.querySelector('#input-mode').value='controller';document.querySelector('#input-mode').dispatchEvent(new Event('change'));document.querySelector('#fps-cap').value=params.get('cap')||'0';document.querySelector('#fps-cap').dispatchEvent(new Event('change'));document.querySelector('#render-scale').value=params.get('scale')||'1';document.querySelector('#render-scale').dispatchEvent(new Event('change'));document.querySelector('#fly').click();ready=true;}return true;}
 document.querySelector('#gpu-caps').onclick=()=>{document.querySelector('#bench-result').textContent=JSON.stringify(Array.from(document.querySelectorAll('#viewer canvas')).map(c=>{const gl=contexts.get(c);return {className:c.className,width:c.width,height:c.height,webgl:!!gl,timer:gl?!!(gl.getExtension('EXT_disjoint_timer_query_webgl2')||gl.getExtension('EXT_disjoint_timer_query')):false};}),null,2);};
 document.querySelector('#compare').onclick=()=>{if(params.get('bridgeGeometry')!=='adaptive'){document.querySelector('#bench-result').textContent='Compare requires bridgeGeometry=adaptive';return;}if(!start())return;document.querySelector('#bench-result').textContent='Warming up for comparison';setTimeout(()=>{compareRequested='map';},2000);};
 document.querySelector('#compare-angle').onclick=()=>{if(params.get('bridgeGeometry')==='adaptive'){document.querySelector('#bench-result').textContent='Angular comparison requires bridgeGeometry=full';return;}if(!start())return;document.querySelector('#bench-result').textContent='Warming up for comparison';setTimeout(()=>{compareRequested='angle';},2000);};
 document.querySelector('#freeze').onclick=()=>{frozen=!frozen;};
 document.querySelector('#snapshot').onclick=()=>{const s=session.snapshot(),u=DW.sim.METERS_PER_UNIT;document.querySelector('#bench-result').textContent=JSON.stringify({view,fired:s.guns.fired,bolts:s.guns.bolts.map(b=>({position:b.position.map(x=>x*u),direction:b.direction})),positionMeters:s.state.eye.map(x=>x*u),velocity:s.state.velocity,scene:presentation.renderStats().scene},null,2);};
 document.querySelector('#preview').onclick=()=>{if(start())panel.open=false;};
 document.querySelector('#measure').onclick=()=>{
  if(!start())return;document.querySelector('#bench-result').textContent='Warming up';rows=[];gpuRows=[];gpuInvalid=0;collect=false;
  setTimeout(()=>{last=performance.now();sampleStart=new Date().toISOString();collect=true;document.querySelector('#bench-result').textContent='Measuring';setTimeout(()=>{
   collect=false;const stat=k=>{const a=rows.map(r=>r[k]).sort((a,b)=>a-b);return {mean:a.reduce((a,b)=>a+b,0)/a.length,p50:a[Math.floor(a.length*.5)],p95:a[Math.min(a.length-1,Math.floor(a.length*.95))],p99:a[Math.min(a.length-1,Math.floor(a.length*.99))],max:a[a.length-1]};};
   const canvas=document.querySelector('#viewer canvas'),gl=contexts.get(canvas),ext=gl.getExtension('WEBGL_debug_renderer_info');
   const stageStats={};for(const name of ['captures','primary','hitMap','compositor','refinement','objectWarp','screen','opticalInverse','boltGeometry','engines','hud','radio','capitalStep','capitalGeometry','portraitShow','portraitUpdate','speechPlan','speechSynthesis','radioNoise','radioTransmit']){stageStats[name]={};for(const key of ['calls','triangles','cpu']){const a=rows.map(r=>(r.stages[name]||{})[key]||0).sort((a,b)=>a-b);stageStats[name][key]={mean:a.reduce((a,b)=>a+b,0)/a.length,p95:a[Math.floor(a.length*.95)]};}}
   const gpu={valid:contextLosses===0,contextLosses,invalid:gpuInvalid,stages:{}};for(const stage of ['sky','captures','primary','hitMap','compositor','refinement','objectWarp','screen']){const a=gpuRows.filter(r=>r.stage===stage).map(r=>r.ms).sort((a,b)=>a-b);gpu.stages[stage]={samples:a.length,mean:a.length?a.reduce((a,b)=>a+b,0)/a.length:null,p50:a.length?a[Math.floor(a.length*.5)]:null,p95:a.length?a[Math.floor(a.length*.95)]:null};}
   const result={lattice:params.get('bridgeGrid')!=='0',temporalTile:params.get('bridgeTemporalTile')==='1'?1:8,temporal:params.get('bridgeTemporal')==='1',pan:params.get('pan'),historyValid:stat('historyValid'),geometryAngle:params.get('bridgeAngle')||'unlimited',geometry:params.get('bridgeGeometry')||'full',hoist:params.has('hoist'),gpu,sampleStart,sampleEnd:new Date().toISOString(),stageStats,ablation:params.get('ablate'),cap:params.get('cap')||'0',scale:params.get('scale')||'1',mode,view,quality:params.get('quality')||'refined',live,samples:rows.length,visibility:document.visibilityState,viewport:[innerWidth,innerHeight],dpr:devicePixelRatio,backing:[canvas.width,canvas.height],renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):'unavailable',gpuTimerAvailable:!!(gl.getExtension('EXT_disjoint_timer_query_webgl2')||gl.getExtension('EXT_disjoint_timer_query')),frame:stat('frame'),rafFrame:stat('rafFrame'),fullCpu:stat('fullCpu'),sim:stat('sim'),bolts:stat('bolts'),cpu:stat('cpu'),draws:stat('draws'),triangles:stat('triangles'),captures:stat('captures'),bridgeCpu:stat('bridgeCpu'),actors:session.snapshot().combat.enemies.filter(c=>c.hp>0).length,scene:presentation.renderStats().scene};
   result.worstFrames=rows.slice().sort((a,b)=>b.fullCpu-a.fullCpu).slice(0,12);
   document.querySelector('#bench-result').textContent=JSON.stringify(result,null,2);document.querySelector('#bench-result').dataset.complete='true';
  },8000);},2000);
 };
})();
