const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
// Decode the shipped PNGs so static/duplicated faces cannot pass as animation.
function pixels(bytes){
 const zlib=require('node:zlib'),width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20),channels=bytes[25]===6?4:3,parts=[];
 assert.equal(bytes[24],8);assert.ok(bytes[25]===6||bytes[25]===2);assert.equal(bytes[28],0);
 for(let p=8;p<bytes.length;){const size=bytes.readUInt32BE(p);if(bytes.toString('ascii',p+4,p+8)==='IDAT')parts.push(bytes.subarray(p+8,p+8+size));p+=size+12;}
 const raw=zlib.inflateSync(Buffer.concat(parts)),stride=width*channels,data=Buffer.alloc(stride*height);let p=0;
 for(let y=0;y<height;y++){
  const filter=raw[p++];assert.ok(filter<=4);
  for(let x=0;x<stride;x++){
   const a=x>=channels?data[y*stride+x-channels]:0,b=y?data[(y-1)*stride+x]:0,c=y&&x>=channels?data[(y-1)*stride+x-channels]:0;
   let predict=0;if(filter===1)predict=a;else if(filter===2)predict=b;else if(filter===3)predict=Math.floor((a+b)/2);else if(filter===4){const n=a+b-c,pa=Math.abs(n-a),pb=Math.abs(n-b),pc=Math.abs(n-c);predict=pa<=pb&&pa<=pc?a:pb<=pc?b:c;}
   data[y*stride+x]=(raw[p++]+predict)&255;
  }
 }
 return {data,width,channels};
}
function changed(image,frame,x0,y0,x1,y1){
 let count=0;for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){
  const a=(y*image.width+x)*image.channels,b=a+frame*256*image.channels;
  if(Math.abs(image.data[a]-image.data[b])+Math.abs(image.data[a+1]-image.data[b+1])+Math.abs(image.data[a+2]-image.data[b+2])>30)count++;
 }return count;
}
for(const [pool,indexField,category] of [['civilian-shuttle','civilianPortraitIndex','civilian-shuttle-pilot'],['runway-workers','runwayPortraitIndex','runway-worker']]){
const root=path.resolve(__dirname,'../assets/portraits',pool);
const roster=JSON.parse(fs.readFileSync(path.join(root,'roster.json'),'utf8'));
const manifest=JSON.parse(fs.readFileSync(path.join(root,'runtime/manifest.json'),'utf8'));
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
assert.equal(roster.characters.length,6);
assert.equal(new Set(roster.characters.map(p=>p.id)).size,6);
if(pool==='runway-workers'){
 assert.equal(roster.characters.filter(p=>p.age>=18&&p.age<30).length,3,'Ground crew should include three young adults');
 assert.ok(roster.characters.some(p=>p.age>=50),'Keep an older veteran in the mixed-age crew');
}
assert.deepEqual(roster.characters.map(p=>p[indexField]),[0,1,2,3,4,5]);
assert.deepEqual(manifest.frames,['neutral','ah','oo','blink','smile','angry','afraid']);
const builder=fs.readFileSync(path.resolve(__dirname,'../tools/prepare-civilian-portraits.ps1'));
assert.equal(hash(Buffer.from(builder.toString().replace(/\r\n/g,'\n'))),manifest.builderSha256);
for(const [name,expected] of Object.entries(manifest.sources))assert.equal(hash(fs.readFileSync(path.join(root,name))),expected);
for(const person of roster.characters){
 assert.ok(person.age>=(pool==='runway-workers'?18:30));assert.equal(person.category,category);
 assert.ok(roster.categories.some(category=>category.id===person.category));
 const name=`portrait-${person[indexField]}.png`,bytes=fs.readFileSync(path.join(root,'runtime',name));
 assert.equal(hash(bytes),manifest.outputs[name]);assert.equal(bytes.subarray(1,4).toString(),'PNG');
 assert.equal(bytes.readUInt32BE(16),1792);assert.equal(bytes.readUInt32BE(20),256);
 const image=pixels(bytes);
 for(const frame of [1,2])assert.ok(changed(image,frame,95,139,150,175)>20,person.id+' must have distinct speech-mouth pixels');
 for(const [left,right] of [[84,112],[132,157]])assert.ok(changed(image,3,left,104,right,123)>20,person.id+' must blink both eyes');
}
assert.equal(new Set(Object.values(manifest.outputs)).size,6);
console.log(`PASS ${pool} portraits: six categorized adults, stable IDs/slots, seven-pose atlases and source hashes`);
}
