const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const draws=[],fills=[];let sample=.8,randomCalls=0;
const ctx={clearRect(){},drawImage(...args){draws.push(args);},fillRect(...args){fills.push(args);},createRadialGradient(){return {addColorStop(){}};}};
const document={createElement(){return {width:0,height:0,ownerDocument:document,getContext:()=>ctx};}};
const DW={mumble:{radioNoiseAt:(pattern,time)=>({strength:time>=0&&time<.01?.5:0})}};
const math=Object.create(Math);math.random=()=>{randomCalls++;return sample;};
const box={window:{Driftworks:DW},Math:math};vm.createContext(box);vm.runInContext(fs.readFileSync('experiments/comms-display.js','utf8'),box);
const display=DW.commsDisplay.create(document.createElement('canvas')),source={},pattern={lead:400,sampleRate:1000};
display.draw(source,pattern,.12,1);let strip=draws.find(args=>args.length===9);assert.ok(strip,'Opening latch remains visible after its millisecond spike');const first=strip.slice(1);
draws.length=0;sample=.2;display.draw(source,pattern,.12,1);strip=draws.find(args=>args.length===9);assert.notDeepEqual(strip.slice(1),first,'Visual strip geometry uses fresh random samples');
draws.length=0;display.draw(source,pattern,.5,1);assert.ok(!draws.some(args=>args.length===9),'Edge hold does not smear into the middle of speech');
draws.length=0;const before=randomCalls;display.draw(source,pattern,.005,1,{reduced:true});assert.equal(randomCalls,before,'Reduced motion suppresses random animation');assert.ok(!draws.some(args=>args.length===9));
assert.ok(fills.length>0);
draws.length=0;display.draw(source,null,.1,0,{breakup:0});assert.equal(draws.filter(args=>args.length===9).length,0);
draws.length=0;fills.length=0;display.draw(source,null,.1,0,{breakup:1});assert.ok(draws.filter(args=>args.length===9).every(args=>Math.abs(args[5])<=16),'Sign-off horizontal displacement remains modest');assert.ok(fills.length>12000,'Final static obscures the portrait');
draws.length=0;display.draw(source,null,.1,0,{breakup:1,reduced:true});assert.equal(draws.filter(args=>args.length===9).length,0,'Sign-off respects reduced motion');
// A later packet can briefly clear even as sign-off progress increases.
let values=[.8,.9,.4,.5,.5];math.random=()=>values.length?values.shift():.5;
fills.length=0;display.draw(source,null,1,0,{breakup:.4});const loud=fills.length;
values=[.1,.1,.4,.5,.5];fills.length=0;display.draw(source,null,1.2,0,{breakup:.6});assert.ok(fills.length<loud/4,'Noise can recede instead of following a perfect ramp');
function texturePacket(mode,time){let packet=[.8,.9,mode,.5];math.random=()=>packet.length?packet.shift():.5;fills.length=0;display.draw(source,null,time,0,{breakup:.8});return fills.filter(rect=>rect[2]<100&&rect[3]<20);}
const fine=texturePacket(.1,2),coarse=texturePacket(.5,3),streaks=texturePacket(.9,4);
assert.ok(fine.length&&fine.every(rect=>rect[2]<=4&&rect[3]<=3),'Fine snow uses small grains');
assert.ok(coarse.some(rect=>rect[2]>5&&rect[3]>5),'Coarse static includes larger grains');
assert.ok(streaks.some(rect=>rect[2]>30&&rect[3]<=4),'Broken streaks are wide and thin');
console.log('PASS comms display: visible edge peaks, fresh random geometry, clean speech intervals and reduced motion');
