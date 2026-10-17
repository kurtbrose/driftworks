// Dependency-free, deterministic flight-AI evaluation. No browser or gameplay boot.
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
global.window=global;global.DRIFTWORKS_TEST_MODE=true;
const sources={};
for(const file of ['src/propulsion.js','src/combat.js','src/logistics.js','src/formations.js','src/sim.js','experiments/retail-profiles.js','experiments/retail-weapons.js','experiments/guns.js','experiments/training.js','experiments/flight-model.js','experiments/flight-ai.js','tests/flight-duel.js']) {
    const bytes=fs.readFileSync(path.join(root,file));
    sources[file]=crypto.createHash('sha256').update(bytes.toString('utf8').replace(/\r\n/g,'\n')).digest('hex');
    vm.runInThisContext(bytes.toString('utf8'),{filename:file});
}
const api=global.Driftworks.flightDuel;
const args=process.argv.slice(2);
function value(flag,fallback) {const i=args.indexOf(flag);if(i<0)return fallback;if(!args[i+1]||args[i+1].startsWith('--'))throw new Error('Missing '+flag+' value');return args[i+1];}
const replayPath=value('--replay','');
let output;
if(replayPath) {
    const record=JSON.parse(fs.readFileSync(replayPath,'utf8'));
    if(record.sources && Object.keys(sources).some(file=>record.sources[file]!==sources[file]))throw new Error('Replay source revision differs; use the recorded source revision');
    output=api.replay(record).summary();
} else {
    const duration=Number(value('--seconds','30')),seed=Number(value('--seed','1'));
    if(!Number.isSafeInteger(seed)||seed<0)throw new Error('Seed must be a nonnegative integer');
    const starts=value('--start','all')==='all'?api.starts:[value('--start','all')];
    const categories=value('--category','all')==='all'?['perfect','human']:[value('--category','all')];
    const flavors=value('--flavor','all')==='all'?['novice','practiced','expert']:[value('--flavor','all')];
    const skills=value('--skill','all')==='all'?[0,1,2]:[Number(value('--skill','all'))];
    const rows=[];let last;
    for(const start of starts)for(const category of categories)for(const flavor of category==='perfect'?['practiced']:flavors)for(const skill of skills) {
        last=api.run({start,category,flavor,skill,duration,seed});rows.push(last.summary());
    }
    const recordPath=value('--record','');
    if(recordPath) {
        if(rows.length!==1)throw new Error('--record requires a single start/category/flavor/skill');
        fs.writeFileSync(recordPath,JSON.stringify(Object.assign({},last.replay,{sources}))+'\n');
    }
    output={schema:1,policy:global.Driftworks.flightAI.version,opponentPolicy:'experiments/training.js',sources,observation:'visible-position-velocity-v1',cadence:api.dt,
        note:'Open-space training rules: shielded player vs unshielded opponent; initial human presets are uncalibrated; perfect is bounded search, not optimal.',rows};
}
process.stdout.write(JSON.stringify(output,null,2)+'\n');
