'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {compile,briefs}=require('../tools/build-character-cast.cjs');
const recipes=JSON.parse(fs.readFileSync('assets/characters/crew-cast/recipes.json','utf8'));
const roster=JSON.parse(fs.readFileSync(recipes.sourceRoster,'utf8'));
const cast=compile(recipes,roster);assert.equal(cast.length,6);assert.equal(cast[0].voiceIndex,roster.characters[0].voiceIndex);
assert(briefs(cast[0]).comms.includes(cast[0].name)&&briefs(cast[0]).skin.includes(cast[0].name));
assert.throws(()=>compile({characters:[recipes.characters[0],recipes.characters[0]]},roster),/Duplicate/);
assert.throws(()=>compile({characters:[{...recipes.characters[0],id:'unknown'}]},roster),/Unknown/);
const generatedPeople=Array.from({length:100},(_,i)=>({...roster.characters[i%6],id:'fixture-'+i}));
const generatedRecipes=generatedPeople.map((p,i)=>({...recipes.characters[i%6],id:p.id}));
assert.equal(new Set(compile({characters:generatedRecipes},{characters:generatedPeople}).map(p=>p.id)).size,100,'Synthetic 100-record identity fixture');
for(const kind of ['female','male']){
 const dir='assets/characters/quaternius-universal-base-characters/runtime/';
 const source=JSON.parse(fs.readFileSync(dir+kind+'-head.json','utf8')),header=JSON.parse(fs.readFileSync(dir+'packed/'+kind+'-head.json','utf8'));
 const bytes=fs.readFileSync(dir+'packed/'+kind+'-head.bin');
 for(let g=0;g<source.groups.length;g++){
  const part=source.groups[g],packed=header.groups[g];assert.equal(packed.indexCount,part.positions.length/3);
  for(let i=0;i<packed.indexCount;i++){
   const index=bytes.readUInt16LE(packed.indexOffset+i*2);assert(index<packed.vertexCount);
   const offset=packed.vertexOffset+index*32;
   const original=[...part.positions.slice(i*3,i*3+3),...part.normals.slice(i*3,i*3+3),...part.uvs.slice(i*2,i*2+2)];
   for(let j=0;j<8;j++)assert(Math.abs(bytes.readFloatLE(offset+j*4)-original[j])<1e-6,'Packing preserves positions, normals and UVs');
  }
 }
 assert(bytes.length<fs.statSync(dir+kind+'-head.json').size/5);
}
(async()=>{
 const html=fs.readFileSync('experiments/crew-deck.html','utf8');
 const cache=new Map(),disposed=[];
 class TextureLoader{async loadAsync(url){return {dispose(){disposed.push(url);}};}}
 const fn=vm.runInNewContext('('+html.match(/async function acquireSkin\(path\)\{[\s\S]*?\n\}/)[0]+')',{skinCache:cache,T:{TextureLoader},rootURL:p=>p});
 const pinned=await fn('pinned');
 for(let i=0;i<100;i++){await fn('fixture-'+i);cache.get('fixture-'+i).refs--;assert(cache.size<=8);}
 assert(cache.has('pinned'),'Active texture never evicted');assert(disposed.length>=93);assert.equal(cache.get('pinned').refs,1);assert(pinned);
 console.log('PASS cast pipeline: shared comms/3D identity, synthetic 100-record compile, duplicate rejection, geometry/UV parity and bounded 100-texture traversal');
})().catch(error=>{console.error(error);process.exitCode=1;});
