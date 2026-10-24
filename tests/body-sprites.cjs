const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('experiments/body-sprites.html','utf8');
const direction=vm.runInNewContext('('+html.match(/function bodyDirection\([^\n]+/)[0]+')');
const cell=vm.runInNewContext('('+html.match(/function bodyCell\([^\n]+/)[0]+')');
for(let i=-24;i<=24;i++)assert.equal(direction(i*Math.PI/4),((i%8)+8)%8);
assert.equal(direction(Math.PI/8+.02,0),0);assert.equal(direction(Math.PI/8+.04,0),1);
assert.equal(direction(-.01,0),0);
for(let d=0;d<8;d++){const c=cell(d,0,4,1);assert.equal(c.x,d%4);assert.equal(c.y,Math.floor(d/4));}
const png=fs.readFileSync('assets/characters/crew-cast/body-sprites/jo-standing-v1.png');
assert.equal(png.subarray(1,4).toString(),'PNG');assert.equal(png.readUInt32BE(16),png.readUInt32BE(20),'Square sheet containing 4 by 2 portrait cells');
for(const file of ['jo-standing-v1','jo-walk-v1','jo-walk-v2']){
 const record=JSON.parse(fs.readFileSync('assets/characters/crew-cast/body-sprites/'+file+'-generation.json'));
 assert(record.prompt.length>100);assert.equal(record.tool,'built-in image_gen');assert(fs.existsSync('assets/characters/crew-cast/body-sprites/'+record.output));
}
console.log('PASS body sprites: stable eight-bearing switching, complete static atlas addressing and retained generation provenance');
const entryScript=html.match(/<script>(if\(!new URLSearchParams[\s\S]*?)<\/script>/)[1];
const destinations=[];
for(const [query,expected] of [['',1],['?inspect=1',0]]){
 const before=destinations.length;vm.runInNewContext(entryScript,{URLSearchParams,location:{search:query,replace:url=>destinations.push(url)}});
 assert.equal(destinations.length-before,expected);
}
assert.equal(destinations[0],'crew-deck.html?comparison=1');
console.log('PASS body sprite entry: walkable room by default, explicit inspector retained');
