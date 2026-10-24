'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib');
const root=path.resolve(__dirname,'..'),read=name=>fs.readFileSync(path.join(root,name)),hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const registration=JSON.parse(read('assets/portraits/registration.json'));
assert.equal(registration.version,1);
function decode(bytes){
 const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20),channels=bytes[25]===6?4:3,parts=[];
 assert.equal(bytes[24],8);assert.ok(bytes[25]===6||bytes[25]===2);assert.equal(bytes[28],0);
 for(let p=8;p<bytes.length;){const size=bytes.readUInt32BE(p);if(bytes.toString('ascii',p+4,p+8)==='IDAT')parts.push(bytes.subarray(p+8,p+8+size));p+=size+12;}
 const raw=zlib.inflateSync(Buffer.concat(parts)),stride=width*channels,data=Buffer.alloc(stride*height);let p=0;
 for(let y=0;y<height;y++){const filter=raw[p++];assert.ok(filter<=4);for(let x=0;x<stride;x++){
  const a=x>=channels?data[y*stride+x-channels]:0,b=y?data[(y-1)*stride+x]:0,c=y&&x>=channels?data[(y-1)*stride+x-channels]:0;
  let predict=0;if(filter===1)predict=a;else if(filter===2)predict=b;else if(filter===3)predict=Math.floor((a+b)/2);else if(filter===4){const n=a+b-c,pa=Math.abs(n-a),pb=Math.abs(n-b),pc=Math.abs(n-c);predict=pa<=pb&&pa<=pc?a:pb<=pc?b:c;}
  data[y*stride+x]=(raw[p++]+predict)&255;
 }}return {data,width,channels};
}
function error(image,frame,dx,dy){
 let total=0;for(let y=123;y<146;y++)for(let x=115;x<133;x++)for(let c=0;c<3;c++){
  const a=image.data[(y*image.width+x)*image.channels+c],b=image.data[((y-dy)*image.width+frame*256+x-dx)*image.channels+c];total+=(a-b)**2;
 }return total;
}
for(const [pool,sources] of Object.entries(registration.sources)){
 const manifest=JSON.parse(read(`assets/portraits/${pool}/runtime/manifest.json`).toString().replace(/^\uFEFF/,''));
 assert.equal(manifest.registrationApplied,true,'Do not ship unregistered source exports');
 assert.equal(manifest.registrationSha256,hash(read('assets/portraits/registration.json')),'Repack after registration changes');
 assert.equal(manifest.registrationHelperSha256,hash(read('tools/portrait-registration.ps1')),'Repack after registration helper changes');
 for(const [name,expected] of Object.entries(sources))assert.equal(hash(read(`assets/portraits/${pool}/${name}`)),expected,'Registration needs new source measurements');
}
for(const [key,entry] of Object.entries(registration.characters)){
 assert.equal(entry.offsets.length,7);assert.deepEqual(entry.offsets[0],[0,0]);
 const [pool,index]=key.split('/'),image=decode(read(`assets/portraits/${pool}/runtime/portrait-${index}.png`));
 for(let frame=1;frame<7;frame++){
  let best=[error(image,frame,0,0),0,0];
  for(let dy=-3;dy<=3;dy++)for(let dx=-3;dx<=3;dx++){const cost=error(image,frame,dx,dy);if(cost<best[0])best=[cost,dx,dy];}
  assert.ok(Math.abs(best[1])<=1&&Math.abs(best[2])<=1,`${key}/${frame}: stable nose still displaced by ${best.slice(1)}`);
 }
}
// Negative control: the previously observed seven-pixel row displacement must
// not be accepted by the stable-feature metric. This is not an anatomy test.
const tammy=decode(read('assets/portraits/dogfight/runtime/portrait-9.png'));
assert.ok(error(tammy,4,0,-7)>error(tammy,4,0,0)*2,'Detect the reported row displacement');
console.log('PASS portrait registration mechanics: source-bound offsets, packer provenance, stable-nose residuals and seven-pixel negative control; visual approval remains separate');
