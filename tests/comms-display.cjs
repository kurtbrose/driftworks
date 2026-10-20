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
// Sign-off severity only rises, even with a frozen playback clock.
function progression(value) {
  math.random=()=>value;
  display.draw(source,null,1,0,{breakup:0});
  const counts=[];
  for(let i=1;i<=20;i++) {
    fills.length=0;display.draw(source,null,1,0,{breakup:i/20});counts.push(fills.length);
  }
  assert.ok(counts.every((count,i)=>!i||count>=counts[i-1]),'Static must never recover');
  return counts;
}
let seed=1;math.random=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
display.draw(source,null,1,0,{breakup:0});
fills.length=0;display.draw(source,null,1,0,{breakup:.4});const firstRamp=fills.length;
seed=42;display.draw(source,null,1,0,{breakup:0});
fills.length=0;display.draw(source,null,1,0,{breakup:.4});assert.notEqual(fills.length,firstRamp,'Each sign-off gets a different progression');
progression(.2);progression(.8);
console.log('PASS comms display: visible edge peaks, random monotonic sign-off and reduced motion');
