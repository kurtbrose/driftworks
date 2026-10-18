// Offline numeric import only. No retail models, textures, prose or sounds are copied.
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const archive=process.argv[2];
if(!archive)throw new Error('Usage: node tools/import-retail-flight.cjs <Root_fs2.vp> [--check]');
const data=fs.readFileSync(archive);
if(data.toString('ascii',0,4)!=='VPVP'||data.readInt32LE(4)!==2)throw new Error('Expected retail VP version 2');
function table(name){
    const offset=data.readInt32LE(8),count=data.readInt32LE(12);
    for(let i=0;i<count;i++){
        const at=offset+i*44,label=data.toString('ascii',at+8,at+40).split('\0')[0];
        if(label===name){const raw=data.subarray(data.readInt32LE(at),data.readInt32LE(at)+data.readInt32LE(at+4));return {sha:crypto.createHash('sha256').update(raw).digest('hex'),text:raw.toString('latin1').replace(/\r/g,'').replace(/;[^\n]*/g,'')};}
    }
    throw new Error('Missing '+name);
}
function entries(text){return text.split(/^\$Name:\s*/m).slice(1).map(block=>({name:block.split('\n')[0].trim().replace(/^@/,''),block}));}
function field(block,label,optional){
    const escaped=label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const match=block.match(new RegExp('^\\s*'+escaped+':\\s*([^\\n]+)','mi'));
    if(!match&&!optional)throw new Error('Missing '+label);
    return match?match[1].trim():'';
}
function scalar(block,label,optional){const value=field(block,label,optional);if(!value&&optional)return undefined;const n=Number(value);if(!Number.isFinite(n))throw new Error('Bad '+label+': '+value);return n;}
function vector(block,label,optional){const raw=field(block,label,optional);if(!raw&&optional)return undefined;const v=raw.split(/[,\s]+/).map(Number);if(v.length!==3||v.some(n=>!Number.isFinite(n)))throw new Error('Bad vector '+label);return v;}
function names(block,label){return [...field(block,label,true).matchAll(/"([^"]+)"/g)].map(m=>m[1]);}
const ships=table('ships.tbl'),weapons=table('weapons.tbl');
const modelFlag=process.argv.indexOf('--models');
const modelArchive=modelFlag<0?path.join(path.dirname(archive),'sparky_fs2.vp'):process.argv[modelFlag+1];
const gunMounts=require('./retail-gun-mounts.cjs').openCatalog(modelArchive);
const first=['GTF Ulysses','GTF Hercules','GTF Myrmidon','GTB Medusa'];
const profiles=entries(ships.text).filter(e=>/^(GTF |GTB |GVF |GVB |SF |SB )/.test(e.name)&&field(e.block,'$Max Velocity',true)).map(({name,block})=>({
    name,role:field(block,'+Type',true).match(/XSTR\(\s*"([^"]+)"/)?.[1]||(/^(GTB|GVB|SB) /.test(name)?'Bomber':'Fighter'),species:field(block,'$Species'),
    damp:scalar(block,'$Damp'),rotdamp:scalar(block,'$Rotdamp'),maxVelocity:vector(block,'$Max Velocity'),rotationTime:vector(block,'$Rotation time'),
    rearVelocity:scalar(block,'$Rear Velocity'),forwardAccel:scalar(block,'$Forward accel'),forwardDecel:scalar(block,'$Forward decel'),slideAccel:scalar(block,'$Slide accel'),slideDecel:scalar(block,'$Slide decel'),
    overclockSpeed:scalar(block,'$Max Oclk Speed'),afterburnerVelocity:vector(block,'+Aburn Max Vel',true)||vector(block,'$Max Velocity'),afterburnerAccel:scalar(block,'+Aburn For accel',true)||scalar(block,'$Forward accel'),
    hull:scalar(block,'$Hitpoints'),shield:scalar(block,'$Shields'),powerOutput:scalar(block,'$Power Output'),defaultWeapons:names(block,'$Default PBanks'),
    afterburnerFuel:scalar(block,'+Aburn Fuel',true)||0,afterburnerBurnRate:scalar(block,'+Aburn Burn Rate',true)||0,afterburnerRecoveryRate:scalar(block,'+Aburn Rec Rate',true)||0,
    ...gunMounts(field(block,'$POF file'))
}));
profiles.sort((a,b)=>{const ai=first.indexOf(a.name),bi=first.indexOf(b.name);return (ai<0?100:ai)-(bi<0?100:bi)||a.name.localeCompare(b.name);});
const selected=['Subach HL-7','Prometheus R','Prometheus S','UD-8 Kayser','Maxim','Mekhu HL-7','Shivan Light Laser','Shivan Heavy Laser','Shivan Mega Laser','Vasudan Light Laser'];
const catalog=entries(weapons.text).filter(e=>selected.includes(e.name)).map(({name,block})=>({
    name,speed:scalar(block,'$Velocity'),fireWait:scalar(block,'$Fire Wait'),lifetime:scalar(block,'$Lifetime'),damage:scalar(block,'$Damage'),armorFactor:scalar(block,'$Armor Factor'),shieldFactor:scalar(block,'$Shield Factor'),energyConsumed:scalar(block,'$Energy Consumed'),
    length:scalar(block,'@Laser Length'),headRadius:scalar(block,'@Laser Head Radius'),tailRadius:scalar(block,'@Laser Tail Radius'),color:vector(block,'@Laser Color'),color2:vector(block,'@Laser Color2'),
    flags:names(block,'$Flags')
})).sort((a,b)=>selected.indexOf(a.name)-selected.indexOf(b.name));
if(first.some(n=>!profiles.some(p=>p.name===n))||catalog.length!==selected.length)throw new Error('Incomplete selection');
for(const [filename,variable,source,rows] of [['retail-profiles.js','retailFlightProfiles',ships,profiles],['retail-weapons.js','retailWeapons',weapons,catalog]]){
    const text='// Numeric fields extracted from retail Root_fs2.vp / '+(filename==='retail-profiles.js'?'ships.tbl':'weapons.tbl')+'.\n// SHA256: '+source.sha+'\n'+(filename==='retail-profiles.js'?'// Primary gun counts from sparky_fs2.vp POF GPNT records; per-model hashes below.\n':'')+'// Regenerate with tools/import-retail-flight.cjs; see docs/retail-flight-loadouts.md.\nwindow.Driftworks.'+variable+' = '+JSON.stringify(rows,null,2)+';\n';
    const dest=path.join(root,'experiments',filename);
    if(process.argv.includes('--check')){if(fs.readFileSync(dest,'utf8').replace(/\r\n/g,'\n')!==text)throw new Error('Stale '+filename);}
    else fs.writeFileSync(dest,text);
}
console.log('Imported '+profiles.length+' fighter/bomber profiles and '+catalog.length+' bolt weapons; table hashes '+ships.sha+' / '+weapons.sha);
