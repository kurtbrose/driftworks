'use strict';
const assert=require('node:assert/strict');
const {createFlight}=require('../tools/headless.cjs');
const f=createFlight({mission:'evacuation',seed:29});
let c=f.snapshot().combat;
assert.equal(c.enemies.length,2);
assert.equal(c.enemies.map(e=>e.callsign).join(','),'Actual,Finch');
assert.equal(c.evacuation.reserve.length,4);
assert.equal(f.snapshot().world.asteroids.length,0);
assert.equal(f.snapshot().world.ships.length,0);
function advanceUntil(predicate,limit=120){for(let i=0;i<limit&&!predicate();i++)f.advance(1,{stop:true});assert(predicate(),'Story milestone reached within bounded flight time');}
advanceUntil(()=>c.evacuation.scene===2);
assert.equal(c.enemies.filter(e=>e.team==='enemy').length,0,'Charges exchange precedes contact');
assert(f.transcript.some(l=>l.text.includes('remain safed')));
advanceUntil(()=>c.evacuation.scene===3);
assert.equal(c.enemies.filter(e=>e.team==='enemy').length,4);
// Hold the threat gate without letting a stationary test pilot die mid-probe.
c.hull=1e6;
f.advance(100,{stop:true});
assert.equal(c.evacuation.scene,3,'A clock cannot skip surviving threats');
assert(!f.transcript.some(l=>l.text.includes('transfer complete')));
for(const enemy of c.enemies.filter(e=>e.team==='enemy'))f.DW.training.damageCraft(c,enemy,{damage:1e6,shieldFactor:1,armorFactor:1},c.player);
advanceUntil(()=>c.evacuation.complete,180);
assert(c.evacuation.complete,'First cycle completes after clear, diversion and departure');
assert.equal(c.evacuation.departure,1);
assert.equal(c.wave,1,'No generic furball wave or replacement squad');
assert.equal(f.transcript.filter(l=>l.text.includes('Station Four')).length,1);
assert.equal(f.transcript.filter(l=>l.speaker.includes('SHUTTLE SIX')).length,5);
const roster=JSON.parse(require('node:fs').readFileSync('assets/portraits/civilian-shuttle/roster.json','utf8'));
for(const [speaker,id] of [['SHUTTLE FIVE','daniel-okafor'],['SHUTTLE SIX','elena-park']]){
    const person=roster.characters.find(p=>p.id===id),lines=f.transcript.filter(l=>l.speaker===speaker);
    assert(lines.length>0);
    const voice={...f.DW.flightDialogue.pilotVoice({id:person.id,index:person.voiceIndex}),speed:.85};
    for(const line of lines){
        assert.equal(line.civilianPortraitIndex,person.civilianPortraitIndex,speaker+' always uses its civilian portrait');
        assert.equal(JSON.stringify(line.voiceSettings),JSON.stringify(voice),speaker+' uses the roster voice');
    }
}
assert(f.transcript.filter(l=>!l.speaker.startsWith('SHUTTLE ')).every(l=>l.civilianPortraitIndex===undefined),'Civilian pilot portraits are reserved for shuttle crews');
const workerRoster=JSON.parse(require('node:fs').readFileSync('assets/portraits/runway-workers/roster.json','utf8'));
const worker=workerRoster.characters.find(p=>p.id==='jo-mercer');
const workerVoice={...f.DW.flightDialogue.pilotVoice({id:worker.id,index:worker.voiceIndex}),speed:.85};
for(const line of f.transcript){
    assert.equal(line.runwayPortraitIndex,line.speaker==='DEPOT CONTROL'?worker.runwayPortraitIndex:undefined);
    if(line.speaker==='DEPOT CONTROL')assert.equal(JSON.stringify(line.voiceSettings),JSON.stringify(workerVoice));
}
assert(f.transcript.every(l=>l.voiceSettings.speed===.85),'Every scripted call uses the mission speech rate');
assert.equal(f.DW.flightDialogue.pilotVoice({id:'quip',index:1}).speed,1.12,'Shared combat quip voices retain their existing rate');
const texts=f.transcript.map(l=>l.text);
assert(texts.indexOf('Six, fuel transfer complete. Stand by for clearance.')<texts.findIndex(t=>t.includes('Station Four')));
assert(texts.findIndex(t=>t.includes('Station Four'))<texts.indexOf('Shuttle Six, cleared to depart.'));
f.reset();c=f.snapshot().combat;
assert.equal(c.evacuation.scene,0);assert.equal(c.evacuation.complete,false);assert.equal(c.enemies.length,2);
const state=c.evacuation;
state.wait=0;
assert.equal(f.DW.evacuationMission.step(c,1,true),null);assert.equal(state.line,0,'Occupied channel retains the line');
console.log('PASS evacuation Cycle A: real session, three fighters, channel occupancy, combat gates, diversion, departure and reset');
