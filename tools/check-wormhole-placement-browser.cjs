'use strict';
// Development-only GPU regression. Serve the repository on localhost:8000 first.
// No browser package is shipped or required by the static site.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(require.resolve('playwright',{paths:[process.env.DRIFTWORKS_BROWSER_MODULES||process.cwd()]}));
const root=path.resolve(__dirname,'..'),scratch=path.join(root,'.scratch/wormhole-placement'),output=path.join(root,'output/wormhole-placement');
fs.mkdirSync(scratch,{recursive:true});fs.mkdirSync(output,{recursive:true});
const scripts=require('./script-manifest.cjs').files('threeTests');
const html=`<!doctype html><style>html,body{margin:0;background:black}#view{width:640px;height:480px}</style><div id="view"></div><script>window.DRIFTWORKS_TEST_MODE=true;</script>${scripts.map(f=>`<script src="../../${f}"></script>`).join('\n')}`;
fs.writeFileSync(path.join(scratch,'browser.html'),html);
(async()=>{
 const browser=await chromium.launch({channel:process.env.DRIFTWORKS_BROWSER_CHANNEL||(process.platform==='win32'?'chrome':undefined),headless:!process.argv.includes('--visible'),args:process.env.CI?['--use-angle=swiftshader','--enable-unsafe-swiftshader']:[]});
 const page=await browser.newPage({viewport:{width:640,height:480},deviceScaleFactor:1}),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error'&&!m.location().url.endsWith('/favicon.ico'))errors.push(m.location().url+': '+m.text());});
 try{
  await page.goto('http://localhost:8000/.scratch/wormhole-placement/browser.html');
  const results=await page.evaluate(()=>{
   const D=window.Driftworks;let w=D.sim.createInitialWorld();Object.assign(w,{asteroids:[],ships:[],platforms:[],wrecks:[],packets:[],selectedShipIds:[]});w.combat.drones=[];
   const host=document.querySelector('#view'),viewer=D.scene3d.create(host,()=>w,next=>{w=next;},{study:true});
   const owner={},data=new Float32Array([-2,0,-2,0,0,1,2,0,-2,0,0,1,2,0,2,0,0,1,-2,0,-2,0,0,1,2,0,2,0,0,1,-2,0,2,0,0,1]);
   const hull={vertices:data,color:[1,0,0],finish:0,placement:owner},effect={vertices:data,color:[0,1,0],placement:owner};
   const canvas=host.querySelector('canvas.scene3d-canvas')||host.querySelector('canvas'),gl=canvas.getContext('webgl2');
   if(!gl)throw Error('Expected production WebGL2 renderer');
   function pixels(actors,effects){viewer.setStudyActors(actors);viewer.setStudyEffects(effects);viewer.render(w,1,0,0);const p=new Uint8Array(canvas.width*canvas.height*4);gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,p);return p;}
   function mask(p){const a=[];for(let i=0;i<p.length;i+=4)a.push(p[i]>8||p[i+1]>8||p[i+2]>8);return a;}
   const rows=[];
   for(const degrees of [-55,0,55]){
    const a=degrees*Math.PI/180,back=[Math.sin(a),-Math.cos(a),0];viewer.setSurfaceCamera({eye:back.map(v=>v*10),right:[-back[1],back[0],0],up:[0,0,1],back});
    owner.visible=true;owner.clipPlane=undefined;owner.portalClip=undefined;const full=mask(pixels([hull],[])).filter(Boolean).length;
    if(full<1000)throw Error('Empty/undersized GPU fixture');
    for(const mode of ['front','back','aperture'])for(const offset of [-.5,0,.5]){
     D.wormholes.mouth(owner,[offset,mode==='aperture'?-1:0,0],[1,0,0],.35,mode);
     const h=mask(pixels([hull],[])),e=mask(pixels([],[effect]));let mismatch=0,hits=0;
     for(let i=0;i<h.length;i++){if(h[i]!==e[i])mismatch++;if(h[i])hits++;}
     if(mismatch>Math.max(12,full*.02))throw Error('Hull/effect pixel masks differ: '+JSON.stringify({degrees,mode,offset,mismatch,full,hits}));
     if(hits===0||hits>=full)throw Error('Fixture did not exercise partial visibility');
     rows.push({degrees,mode,offset,mismatch,full,hits});
    }
   }
   // A closed aperture must not reveal an unmasked remote object. Also check
   // that a tiny opening reveals only a small fraction of its final image.
   const opening=[];
   for(const time of [9,10,10.5,11,12,13,19,20,21]){
    const phase=D.wormholes.phase(time,{opensAt:10,closesAt:20});
    owner.visible=true;D.wormholes.mouth(owner,[0,-1,0],[1,0,0],.35*phase.amount,'aperture');
    const count=mask(pixels([hull],[effect])).filter(Boolean).length;
    if(!phase.visible&&count)throw Error('Closed aperture leaked remote pixels at '+time);
    opening.push({time,amount:phase.amount,count});
   }
   if(!(opening[2].count<opening[5].count&&opening[5].count>0))throw Error('Growing aperture did not bound the remote image');
   owner.visible=true;
   // A source-side mask must never slice geometry outside the mouth silhouette.
   D.wormholes.clear(owner);const uncut=mask(pixels([hull],[]));
   D.wormholes.mouth(owner,[100,0,0],[1,0,0],.35,'front');
   const outside=mask(pixels([hull],[]));
   if(outside.some((v,i)=>v!==uncut[i]))throw Error('Offscreen mouth sliced an unrelated hull');
   // Negative control: the old missing-effect-owner bug must fail this oracle.
   D.wormholes.mouth(owner,[0,0,0],[1,0,0],.35,'front');
   const correct=mask(pixels([hull],[]));effect.placement=undefined;
   const escaped=mask(pixels([],[effect]));let negativeControl=0;
   for(let i=0;i<correct.length;i++)if(correct[i]!==escaped[i])negativeControl++;
   if(negativeControl<100)throw Error('GPU oracle did not detect detached effect ownership');
   effect.placement=owner;
   owner.visible=false;const hidden=mask(pixels([hull],[effect])).filter(Boolean).length;if(hidden)throw Error('Hidden owner leaked pixels');
   owner.visible=true;owner.clipPlane=undefined;owner.portalClip=undefined;pixels([hull],[effect]);
   return {rows,opening,hidden,negativeControl,width:canvas.width,height:canvas.height};
  });
  assert.equal(results.rows.length,27);assert.deepEqual(errors,[]);
  await page.screenshot({path:path.join(output,'gpu-fixture.png')});fs.writeFileSync(path.join(output,'gpu.json'),JSON.stringify({results,errors},null,2)+'\n');
  console.log('PASS shared wormhole GPU placement: 27 hull/effect pixel-mask comparisons and hidden-owner suppression');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
