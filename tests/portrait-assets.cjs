const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../assets/portraits/dogfight'),runtime=path.join(root,'runtime');
const manifest=JSON.parse(fs.readFileSync(path.join(runtime,'manifest.json'),'utf8').replace(/^\uFEFF/,''));
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
assert.equal(manifest.version,1);assert.equal(manifest.tileSize,256);
assert.deepEqual(manifest.frames,['neutral','ah','oo','blink','smile','angry','afraid']);
// Git may normalize the preparation script's line endings across hosts.
const builder=fs.readFileSync(path.resolve(__dirname,'../tools/prepare-flight-portraits.ps1'));
assert.ok([builder,Buffer.from(builder.toString().replace(/\r\n/g,'\n')),Buffer.from(builder.toString().replace(/\r?\n/g,'\r\n'))].some(bytes=>hash(bytes)===manifest.builderSha256),'Asset builder changed: regenerate checked-in portrait assets');
let originalBytes=0,packedBytes=0;
for(const [name,expected] of Object.entries(manifest.sources)){const bytes=fs.readFileSync(path.join(root,name));assert.equal(hash(bytes),expected,`${name} changed: regenerate runtime portraits`);originalBytes+=bytes.length;}
assert.equal(Object.keys(manifest.outputs).length,17);
for(let i=0;i<17;i++){
  const name=`portrait-${i}.png`,bytes=fs.readFileSync(path.join(runtime,name));
  assert.equal(hash(bytes),manifest.outputs[name],`${name} differs from prepared output`);
  assert.equal(bytes.subarray(1,4).toString(),'PNG');assert.equal(bytes.readUInt32BE(16),1792);assert.equal(bytes.readUInt32BE(20),256);
  packedBytes+=bytes.length;
}
assert.ok(packedBytes<originalBytes*.5,'Runtime portraits must remain substantially smaller than the source atlases');
console.log(`PASS portrait assets: seventeen packed characters, source/builder hashes, 256px poses; ${(packedBytes/1048576).toFixed(2)} MiB vs ${(originalBytes/1048576).toFixed(2)} MiB sources`);
