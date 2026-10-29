'use strict';
// Development-only browser regression, using the production sky and live session.
const fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium}=require(require.resolve('playwright',{paths:[process.env.DRIFTWORKS_BROWSER_MODULES||process.cwd()]}));
function install(){
 const D=window.Driftworks,p=window.dotProbe={freeze:false};
 const create=D.flightSession.create;D.flightSession.create=function(...args){const s=create.apply(this,args),advance=s.advance;p.session=s;s.advance=function(...a){if(!p.freeze)return advance.apply(this,a);};return s;};
 const skyCreate=D.flightSkybox.create;D.flightSkybox.create=function(...args){p.sky=skyCreate.apply(this,args);return p.sky;};
}
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:!process.argv.includes('--visible')});
 const page=await browser.newPage({viewport:{width:1000,height:700},deviceScaleFactor:1}),errors=[];
 page.on('pageerror',e=>errors.push(e.stack||String(e)));
 page.on('console',m=>{if(m.type()==='error'&&!m.location().url.endsWith('/favicon.ico'))errors.push(m.text());});
 await page.route('**/flight.js?*',async route=>{const response=await route.fetch();await route.fulfill({response,body:'('+install.toString()+')();\n'+await response.text()});});
 fs.mkdirSync('output/wormhole-dots',{recursive:true});
 try{
 for(const mission of ['ellis','thin-shell']){
  await page.goto('http://localhost:8000/experiments/flight.html?mission='+mission+'&bridgeGrid=0&bridgeOutline=0');
  await page.waitForFunction(()=>window.dotProbe?.sky&&!document.querySelector('#fly').disabled,null,{timeout:120000});
  await page.selectOption('#input-mode','controller');await page.click('#fly');
  await page.evaluate(()=>{dotProbe.freeze=true;dotProbe.sky.setOpticsEnabled(false);});
  const samples=[];
  for(const side of [0,1])for(const [l,oblique] of [[1000,false],[400,false],[80,false],[.001,false],[.001,true]]){
   const sample=await page.evaluate(({side,l,mission,oblique})=>{
    const D=window.Driftworks,u=D.sim.METERS_PER_UNIT,s=dotProbe.sky;
    const r=mission==='thin-shell'?300+l:Math.hypot(300,l);
    let pose={eye:[side*12000/u,(-2000+(side?1:-1)*r)/u,1550/u],right:[side?-1:1,0,0],up:[0,0,side?-1:1],back:[0,-1,0],region:side};
    if(oblique){
     const unit=v=>{const n=Math.hypot(...v);return v.map(x=>x/n);},cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
     const n=unit([.3,-.9,.2]),t=unit(cross(n,[0,0,1])),f=n.map((v,i)=>-v*Math.cos(.45)+t[i]*Math.sin(.45));
     const right=unit(cross(f,[0,0,1])),up=cross(right,f),map=v=>side?D.flightGuns.bridgeVector(v,n):v;
     pose={eye:n.map((v,i)=>[side*12000,-2000,1550][i]/u+(side?-1:1)*v*r/u),right:map(right),up:map(up),back:map(f.map(v=>-v)),region:side};
    }
    const canvas=document.querySelector('canvas.flight-skybox'),gl=canvas.getContext('webgl');
    const timer=gl.getExtension('EXT_disjoint_timer_query');dotProbe.gpu=dotProbe.gpu||[];
    const draw=gl.drawArrays;
    gl.drawArrays=function(...args){
     const program=gl.getParameter(gl.CURRENT_PROGRAM);
     const motion=gl.getAttachedShaders(program).some(sh=>gl.getShaderSource(sh).includes('gl_FragColor=motionDots'));
     if(motion){gl.clearColor(0,0,0,1);gl.clear(gl.COLOR_BUFFER_BIT);}
     const query=motion&&timer?timer.createQueryEXT():null;
     if(query)timer.beginQueryEXT(timer.TIME_ELAPSED_EXT,query);
     const result=draw.apply(this,args);
     if(query){timer.endQueryEXT(timer.TIME_ELAPSED_EXT);dotProbe.gpu.push({query,side,l,oblique});}
     return result;
    };
    function render(opacity){s.render(pose,1,false,0,opacity);const pixels=new Uint8Array(canvas.width*canvas.height*4);gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);return pixels;}
    const base=render(0),start=performance.now(),dots=render(.85);const readbackMs=performance.now()-start;
    const mask=[];for(let i=0;i<base.length;i+=4)if(Math.max(dots[i],dots[i+1],dots[i+2])>12)mask.push(i/4);
    const image=canvas.toDataURL('image/png');gl.drawArrays=draw;
    Object.assign(dotProbe.session.snapshot().state,pose);
    return {side,l,oblique,readbackMs,pixels:mask.length,mask,image};
   },{side,l,mission,oblique});
   fs.writeFileSync(`output/wormhole-dots/${mission}-${side}-${l}${oblique?'-oblique':''}.png`,Buffer.from(sample.image.split(',')[1],'base64'));delete sample.image;
   if(l===400){await page.waitForTimeout(150);await page.screenshot({path:`output/wormhole-dots/${mission}-${side}-cockpit.png`});}
   assert(sample.pixels>20,`${mission} chart ${side} at l=${l} contains visible optical dots`);samples.push(sample);
  }
  await page.waitForTimeout(100);
  const gpu=await page.evaluate(()=>{
   const gl=document.querySelector('canvas.flight-skybox').getContext('webgl'),timer=gl.getExtension('EXT_disjoint_timer_query');
   if(!timer||gl.getParameter(timer.GPU_DISJOINT_EXT))return null;
   return dotProbe.gpu.map(({query,...fixture})=>({...fixture,ms:timer.getQueryObjectEXT(query,timer.QUERY_RESULT_AVAILABLE_EXT)?timer.getQueryObjectEXT(query,timer.QUERY_RESULT_EXT)/1e6:null}));
  });
  // Camera bases obey the same antipodal tangent transform as live traversal.
  const continuity=[];
  for(const oblique of [false,true]){
   const a=new Set(samples.find(s=>s.side===0&&s.l===.001&&s.oblique===oblique).mask),b=new Set(samples.find(s=>s.side===1&&s.l===.001&&s.oblique===oblique).mask);
   const overlap=[...a].filter(i=>b.has(i)).length,score=overlap/Math.max(a.size,b.size);
   continuity.push({oblique,score});assert(score>.9,`${mission} dots remain continuous at crossing, oblique=${oblique} (${score})`);
  }
  for(const sample of samples)delete sample.mask;
  fs.writeFileSync(`output/wormhole-dots/${mission}.json`,JSON.stringify({samples,gpu,continuity,errors},null,2)+'\n');
  console.log(JSON.stringify({mission,gpu,continuity,errors}));
 }
 assert.deepEqual(errors,[]);
 }finally{await browser.close();}
})();
