'use strict';
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
async function run(){
 const created=[],requests=[];
 const context={window:{Driftworks:{assetUrl:value=>value}},document:{createElement(){const calls=[];const ctx=new Proxy({globalAlpha:1,globalCompositeOperation:'source-over',drawImage(image){calls.push({image,alpha:this.globalAlpha,operation:this.globalCompositeOperation});},createRadialGradient:()=>({addColorStop(){}})},{get:(o,k)=>k in o?o[k]:()=>{}});const canvas={calls,width:0,height:0,getContext:()=>ctx};created.push(canvas);return canvas;}},Image:class{constructor(){this.naturalWidth=this.naturalHeight=1280;}set src(value){this.file=value;requests.push(value);this.onload();}},Promise,Error,Math,Number};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../experiments/planet-impact.js'),'utf8'),context);
 const api=context.window.Driftworks.planetImpact,animation=await api.create();
 assert.equal(requests.length,7);assert.equal(animation.canvas.width,1280);
 for(const [seconds,index] of [[0,0],[.25,1],[12,2],[32,3],[60,4],[90,5],[120,6]]){const s=api.sample(seconds);assert.equal(s.from,index);assert.equal(s.alpha,0);}
 assert.equal(api.sample(22).alpha,.5);assert.equal(api.sample(-5).from,0);assert.equal(api.sample(NaN).from,0);
 assert.equal(animation.draw(22),true);const layer=created[1],out=created[0];
 assert.ok(layer.calls[0].image.file.endsWith('/12.png'));assert.ok(layer.calls[1].image.file.endsWith('/32.png'));assert.equal(layer.calls[1].alpha,.5);
 assert.equal(layer.calls[2].operation,'destination-in');assert.ok(out.calls[0].image.file.endsWith('/master.png'));
 assert.equal(animation.draw(22),false,'paused frame is cached');
 out.calls.length=0;animation.draw(22,false);assert.equal(out.calls.length,1,'pristine mode draws only frozen master');
 out.calls.length=0;animation.draw(-5,true);assert.equal(out.calls.length,1,'pre-impact draws only frozen master');
 const root=path.join(__dirname,'../assets/backgrounds/planet-hero-v1');
 for(const file of ['master.png','impact-overhead-v1/flash.png',...['12','32','60','90','120'].map(name=>'impact-overhead-v1/'+name+'.png')]){const bytes=fs.readFileSync(path.join(root,file));assert.equal(bytes.readUInt32BE(16),1254);assert.equal(bytes.readUInt32BE(20),1254);}
 console.log('PASS overhead planet impact: matched native plates, exact stages, adjacent-pair blend, frozen master, feather permission, caching and pristine comparison');
}
run().catch(error=>{console.error(error);process.exitCode=1;});
