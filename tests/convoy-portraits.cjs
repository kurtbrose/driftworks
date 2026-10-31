const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib'),vm=require('node:vm');
const root=path.resolve(__dirname,'../assets/portraits/convoy');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'runtime/manifest.json'),'utf8').replace(/^\uFEFF/,''));
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const builder=fs.readFileSync(path.resolve(__dirname,'../tools/prepare-convoy-portraits.ps1'));
assert.ok([builder,Buffer.from(builder.toString().replace(/\r\n/g,'\n')),Buffer.from(builder.toString().replace(/\r?\n/g,'\r\n'))].some(bytes=>hash(bytes)===manifest.builderSha256),'Repack convoy portraits after changing their builder');
assert.equal(manifest.tileSize,256);
assert.deepEqual(manifest.frames,['neutral','ah','oo','blink','smile','angry','afraid']);
assert.equal(Object.keys(manifest.outputs).length,7);
assert.equal(new Set(Object.values(manifest.outputs)).size,7,'Each convoy pilot needs distinct artwork');

// Minimal lossless PNG reader: validates the actual shipped animation pixels.
function rgba(bytes){
  assert.equal(bytes.subarray(1,4).toString(),'PNG');
  const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20),channels=bytes[25]===6?4:3;
  assert.equal(bytes[24],8);assert.ok(bytes[25]===6||bytes[25]===2);assert.equal(bytes[28],0);
  const parts=[];for(let p=8;p<bytes.length;){const size=bytes.readUInt32BE(p),type=bytes.toString('ascii',p+4,p+8);if(type==='IDAT')parts.push(bytes.subarray(p+8,p+8+size));p+=size+12;}
  const raw=zlib.inflateSync(Buffer.concat(parts)),stride=width*channels,out=Buffer.alloc(stride*height);
  let p=0;
  for(let y=0;y<height;y++){
    const filter=raw[p++];assert.ok(filter<=4);
    for(let x=0;x<stride;x++){
      const a=x>=channels?out[y*stride+x-channels]:0,b=y?out[(y-1)*stride+x]:0,c=y&&x>=channels?out[(y-1)*stride+x-channels]:0;
      let predict=0;if(filter===1)predict=a;else if(filter===2)predict=b;else if(filter===3)predict=Math.floor((a+b)/2);else if(filter===4){const n=a+b-c,pa=Math.abs(n-a),pb=Math.abs(n-b),pc=Math.abs(n-c);predict=pa<=pb&&pa<=pc?a:pb<=pc?b:c;}
      out[y*stride+x]=(raw[p++]+predict)&255;
    }
  }
  return {width,height,pixel:(x,y)=>out.subarray((y*width+x)*channels,(y*width+x)*channels+3)};
}
const jobs=JSON.parse(fs.readFileSync(path.join(root,'prompts.json'))).jobs;
for(const job of jobs){
  const index=job.index;
  const name=`portrait-${index}.png`,original=fs.readFileSync(path.resolve(__dirname,'..',job.source)),output=fs.readFileSync(path.join(root,'runtime',name));
  assert.equal(hash(original),manifest.sources[name],name+' source facial poses changed');
  assert.equal(hash(fs.readFileSync(path.join(root,'source',job.id+'.png'))),manifest.generated[name],name+' wardrobe source changed');
  assert.equal(hash(output),manifest.outputs[name],name+' runtime atlas changed');
  assert.notEqual(hash(output),hash(original),name+' must have its convoy wardrobe');
  const before=rgba(original),after=rgba(output);assert.equal(after.width,1792);assert.equal(after.height,256);
  for(let pose=0;pose<7;pose++){
    // Calibrated inner face, plus both eyes and mouth, must be pixel-identical.
    for(let y=106;y<=157;y++)for(let x=112;x<=143;x++)assert.ok(before.pixel(pose*256+x,y).equals(after.pixel(pose*256+x,y)),name+' changed calibrated facial animation');
    for(const [x,y] of [[99,114],[145,114],[123,156]])assert.ok(before.pixel(pose*256+x,y).equals(after.pixel(pose*256+x,y)),name+' moved an eye or mouth');
    // Headwear and clothing remain frozen when speaking or emoting.
    for(const y of [16,32,220,240])for(let x=24;x<232;x+=7)assert.ok(after.pixel(x,y).equals(after.pixel(pose*256+x,y)),name+' animates clothing');
  }
}
console.log('PASS convoy portrait assets: seven distinct wardrobes, seven original calibrated facial poses, frozen clothing and provenance hashes');

(async function(){
  const requests=[],closed=[],sources=[],callbacks={};let canvas;
  const document={createElement:()=>({width:0,height:0,dataset:{},setAttribute(){}})};
  const panel={ownerDocument:document,appendChild:value=>{canvas=value;},classList:{add(){},remove(){}}};
  const DW={assetUrl:value=>value,commsDisplay:{create:()=>({draw(){}})},faceBlend:{presets:{face:[]},create:(_target,frames)=>{sources.push(frames);return {draw(){},dispose(){}};}}};
  const window={Driftworks:DW,location:{search:'?mission=convoy'},matchMedia:()=>({matches:true}),requestIdleCallback(){},addEventListener:(name,fn)=>{callbacks[name]=fn;}};
  const box={window,document,performance:{now:()=>0},AbortController,fetch:async(url)=>{requests.push(url);return {ok:true,blob:async()=>({url})};},createImageBitmap:async blob=>({width:1792,height:256,url:blob.url,close(){closed.push(blob.url);}})};
  vm.runInNewContext(fs.readFileSync(require('node:path').resolve(__dirname,'../experiments/flight-missions.js'),'utf8'),box);

  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../experiments/flight-portraits.js'),'utf8'),box);
  const view=DW.flightPortraits.mount(panel),cast=[1,0,17,18,19,21,22],lines=[{portraitIndex:0},{portraitIndex:1},...[0,1,2,4,5].map(civilianPortraitIndex=>({civilianPortraitIndex}))];
  for(let i=0;i<7;i++){
    view.show({...lines[i],speaker:'CONVOY / RADIO'});
    for(let tick=0;tick<15;tick++)await Promise.resolve();
    assert.equal(requests.at(-1),`../assets/portraits/convoy/runtime/portrait-${cast[i]}.png`);
    assert.equal(canvas.dataset.cast,'convoy');assert.equal(canvas.hidden,false);
    assert.equal(sources.at(-1).ah.image,sources.at(-1).master.image);
    assert.equal(sources.at(-1).eh,sources.at(-1).ah);
    assert.deepEqual(Array.from(sources.at(-1).afraid.rect),[1536,0,256,256]);
  }
  view.show({portraitIndex:-1,speaker:'CONTROL / RADIO'});for(let tick=0;tick<15;tick++)await Promise.resolve();assert.equal(requests.at(-1),'../assets/portraits/dogfight/runtime/portrait-16.png');
  callbacks.pagehide();assert.equal(new Set(closed).size,8,'All seven convoy bitmaps are released on page exit');
  window.location.search='';const standard=DW.flightPortraits.mount(panel);standard.show({portraitIndex:0,speaker:'WING / RADIO'});
  for(let tick=0;tick<15;tick++)await Promise.resolve();
  assert.equal(requests.at(-1),'../assets/portraits/dogfight/runtime/portrait-1.png');assert.equal(canvas.dataset.cast,'standard');callbacks.pagehide();
  console.log('PASS convoy portrait routing: mission-only cast, stable voice slots, original animation frame layout, bounded cache and standard-cast isolation');
})().catch(error=>{console.error(error);process.exitCode=1;});
