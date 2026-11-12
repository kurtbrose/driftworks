// Offline numeric import. Retail artwork and table prose stay outside the site.
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const archive=process.argv[2];
if(!archive)throw new Error('Usage: node tools/import-retail-missiles.cjs <Root_fs2.vp> [--check]');
const data=fs.readFileSync(archive);
if(data.toString('ascii',0,4)!=='VPVP'||data.readInt32LE(4)!==2)throw new Error('Expected VP v2');
function table(name){
    for(let i=0;i<data.readInt32LE(12);i++){
        const at=data.readInt32LE(8)+i*44;
        if(data.toString('ascii',at+8,at+40).split('\0')[0]!==name)continue;
        const raw=data.subarray(data.readInt32LE(at),data.readInt32LE(at)+data.readInt32LE(at+4));
        return {sha:crypto.createHash('sha256').update(raw).digest('hex'),text:raw.toString('latin1').replace(/\r/g,'').replace(/;[^\n]*/g,'')};
    }
    throw new Error('Missing '+name);
}
function entries(text){return text.split(/^\$Name:\s*/m).slice(1).map(block=>({name:block.split('\n')[0].trim().replace(/^@/,''),block}));}
function field(block,key){return block.match(new RegExp('^\\s*'+key.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+':\\s*([^\\n]+)','mi'))?.[1].trim()||'';}
function number(block,key,fallback){const raw=field(block,key);if(!raw&&fallback!==undefined)return fallback;const n=Number(raw);if(!raw||!Number.isFinite(n))throw new Error('Missing/bad '+key);return n;}
function list(block,key){return [...field(block,key).matchAll(/"([^"]+)"/g)].map(m=>m[1]);}
const weapons=table('weapons.tbl'),ships=table('ships.tbl');
const selected=['Rockeye','Rockeye D','Tempest','Tempest D','Hornet','Hornet D','Hornet#Weak','Harpoon','Harpoon D','Harpoon#Weak','Trebuchet','Cyclops','Cyclops#short','Rebel Bomb','Helios','Enemy MX-64','MX-52','FighterKiller','Swarmer','Unknown Bomb','Unknown Megabomb'];
const missiles=entries(weapons.text.split('#Secondary Weapons')[1].split('#End')[0]).filter(e=>selected.includes(e.name)).map(({name,block})=>({
    name,speed:number(block,'$Velocity'),damage:number(block,'$Damage'),fireWait:number(block,'$Fire Wait'),lifetime:number(block,'$Lifetime'),
    energyConsumed:number(block,'$Energy Consumed'),armorFactor:number(block,'$Armor Factor'),shieldFactor:number(block,'$Shield Factor'),cargoSize:number(block,'$Cargo Size'),
    blastForce:number(block,'$Blast Force'),innerRadius:number(block,'$Inner Radius'),outerRadius:number(block,'$Outer Radius'),shockwaveSpeed:number(block,'$Shockwave Speed',0),
    homing:field(block,'$Homing').toLowerCase()==='yes'?field(block,'+Type').toLowerCase():'none',turnTime:number(block,'+Turn Time',0),viewCone:number(block,'+View Cone',180),
    minLockTime:number(block,'+Min Lock Time',0),lockPixelsPerSec:number(block,'+Lock Pixels/Sec',0),catchupPixelsPerSec:number(block,'+Catch-up Pixels/Sec',0),catchupPenalty:number(block,'+Catch-up Penalty',0),
    swarm:number(block,'$Swarm',1),flags:list(block,'$Flags').map(f=>f.toLowerCase()),length:4,headRadius:.35,tailRadius:.15,color:[255,192,90],color2:[255,80,20]
}));
if(missiles.length!==selected.length)throw new Error('Incomplete missile selection');
const profiles=entries(ships.text).filter(e=>/^(GTF |GTB |GVF |GVB |SF |SB )/.test(e.name)&&field(e.block,'$Max Velocity')).map(({name,block})=>({
    name,defaultBanks:list(block,'$Default SBanks'),allowed:list(block,'$Allowed SBanks'),capacities:(field(block,'$SBank Capacity').match(/[\d.]+/g)||[]).map(Number),countermeasures:number(block,'$Countermeasures',0)
}));
const cm=entries(weapons.text.split('#Countermeasures')[1])[0];
const countermeasure={name:cm.name,lifetimeMin:number(cm.block,'$Lifetime Min'),lifetimeMax:number(cm.block,'$Lifetime Max')};
const result='// Numeric retail tables; regenerate with tools/import-retail-missiles.cjs.\n// weapons.tbl SHA256: '+weapons.sha+'\n// ships.tbl SHA256: '+ships.sha+'\nwindow.Driftworks.retailMissiles = '+JSON.stringify({missiles,profiles,countermeasure},null,2)+';\n';
const dest=path.join(__dirname,'../experiments/retail-missiles.js');
if(process.argv.includes('--check')){if(fs.readFileSync(dest,'utf8').replace(/\r\n/g,'\n')!==result)throw new Error('Stale retail missiles');}
else fs.writeFileSync(dest,result);
console.log('Verified '+missiles.length+' missile types and '+profiles.length+' ship magazines');
