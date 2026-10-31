import {decodeDepot} from './depot-asset.js';
import * as timeline from './refueling-cycle.js';
import * as arms from './depot-arm.js';
(function () {
    'use strict';
    var DW=/** @type {Required<import('../src/types').DriftworksNamespace>} */(window.Driftworks),U=DW.sim.METERS_PER_UNIT;
    var assetUrl = /** @type {(value: string, base?: string) => string} */ (window.Driftworks.assetUrl);
    /** @typedef {import('./types').Batch} Batch */
    /** @typedef {import('./depot-asset').DepotBatch} SourceBatch */
    /** @typedef {{materials:Record<string,[number,number,number]>;batches:SourceBatch[]}} Asset */
    /** @type {{batches:Batch[];port:number[]}[]} */var transports=[];
    /** @type {import('./types').ArtCraft[]} */var exhaust=[];
    var status='Loading depot and civilian liners';
    var paint=new Image();paint.src=assetUrl('../assets/depots/refueling-v1/caution-paint.png');
    /** @typedef {{refuel:number[];batches:{offset:number;count:number;color:[number,number,number];opacity:number;emissive:number[]}[]}} Transport */
    /** @param {string} name */
    async function loadTransport(name){
        var root='../assets/ships/civilian-airliners/'+name+'-flight';
        var meta=/** @type {Transport} */(await (await fetch(assetUrl(root+'.json'))).json());
        var bytes=await (await fetch(assetUrl(root+'.bin'))).arrayBuffer();
        var vertices=new Float32Array(bytes);for(var i=0;i<vertices.length;i+=6)for(var axis=0;axis<3;axis++)vertices[i+axis]/=U;
        return {port:meta.refuel,batches:meta.batches.map(function(b){return /** @type {Batch} */({vertices:new Float32Array(bytes,b.offset,b.count),color:b.color,opacity:b.opacity,finish:b.emissive.some(function(v){return v>0;})?7:0,staticGeometry:true});})};
    }
    /** @param {Asset} asset */
    function buildDepot(asset){return asset.batches.map(function(b){
        var stride=b.uvs?8:6,vertices=new Float32Array(b.positions.length/3*stride);
        for(var i=0;i<b.positions.length/3;i++){var j=i*3,k=i*stride;for(var a=0;a<3;a++){vertices[k+a]=b.positions[j+a]/U;vertices[k+3+a]=b.normals[j+a];}if(b.uvs){vertices[k+6]=b.uvs[i*2];vertices[k+7]=b.uvs[i*2+1];}}
        // Blender's palette is linear RGB; study actor colors use display sRGB.
        var color=/** @type {[number,number,number]} */(asset.materials[b.material].map(function(v){return v<=.0031308?v*12.92:1.055*Math.pow(v,1/2.4)-.055;}));
        return {batch:/** @type {Batch} */({vertices:vertices,color:color,staticGeometry:true,stride:stride,texture:b.uvs?paint:undefined}),group:b.group||''};
    });}
    /** @type {ReturnType<typeof buildDepot>} */var modules=[];
    if(DW.flightMissions.current().id==='evacuation'){
        var style=document.createElement('style');style.textContent='.impact-cues{display:none!important}';document.head.appendChild(style);
        Promise.all([fetch(assetUrl('../assets/depots/refueling-v1/depot.glb')).then(function(r){if(!r.ok)throw Error(r.statusText);return r.arrayBuffer().then(decodeDepot);}),loadTransport('commuter'),loadTransport('double-decker')]).then(function(values){modules=buildDepot(values[0]);transports=[values[1],values[2]];status='Ready';}).catch(/** @param {unknown} error */function(error){status='Asset load failed: '+String(error);});
    }
    /** @type {WeakMap<import('./types').Combat,{last:number;five:import('./refueling-cycle').RefuelingCycle;six:import('./refueling-cycle').RefuelingCycle}>} */var cycles=new WeakMap();
    var dockBasis=new Float32Array([1,0,0,0,0,1,0,-1,0]);
    var panel=/** @type {HTMLElement|null} */(null);
    DW.evacuationScenery={visible:true,status:function(){return status;},effects:function(combat,view){
        if(!this.visible)return [];
        return exhaust.map(function(c){
            var large=c.index===1,w=large?30:18,l=large?180:72,h=large?16.5:11;
            var mouths=(large?[-.3,0,.3]:[-.28,.28]).map(function(x,i){
                return [x*w,-l*.532-.16,-h*.03+(large&&i===1?h*.15:0),w*(large?.14:.145)*.85];
            });
            return DW.shipRender.engineGeometry([c],'',1,U,view,combat.evacuation?combat.evacuation.elapsed:0,mouths);
        });
    },geometry:function(combat){
        exhaust=[];
        if(!combat.evacuation)return [];const s=combat.evacuation;
        if(!panel){panel=document.createElement('div');panel.id='evacuation-objective';panel.style.cssText='position:fixed;top:18px;left:20px;color:#dce9ef;background:#0a1725c9;padding:12px;pointer-events:none;font:14px system-ui;white-space:pre-line';document.body.appendChild(panel);}
        panel.textContent=status!=='Ready'?status:s.complete?'CYCLE A COMPLETE\nSix away / Eight holding. Esc to restart.':s.scene===3?'PROTECT FUEL OPERATIONS\nClear remaining hostiles / Six refueling':s.scene>=6?'COVER SHUTTLE SIX\nDeparture corridor':s.scene>=4?'HOLD THE CORRIDOR\nEight diverted / Six awaiting clearance':'HOLD STATION\nSix refueling / Demolition charges safed';
        if(!timeline||!arms||!transports.length)return [];
        var c=cycles.get(combat);
        if(!c){var five=timeline.createRefuelingCycle(),six=timeline.createRefuelingCycle(true);five.phase='depart';six.phase='fueling';c={last:0,five:five,six:six};cycles.set(combat,c);}
        var elapsed=Math.max(0,s.elapsed-c.last);c.last=s.elapsed;
        if(s.scene>=6)timeline.finishRefueling(c.six);
        var samples=[timeline.stepRefuelingCycle(c.five,elapsed),timeline.stepRefuelingCycle(c.six,elapsed)];
        if(!this.visible)return [];
        var result=modules.map(function(m){
            var match=/arm-(-?\d+)-(upper|forearm|wrist)/.exec(m.group);if(!match)return Object.assign({},m.batch,{origin:s.origin});
            var x=Number(match[1]),amount=x===0?samples[1].arm:0,side=x===112?1:-1;
            var reach=24+(44-24)*amount,height=-8+(-14+8)*amount;
            var solve=/** @type {NonNullable<typeof arms>} */(arms).solveDepotArm(reach,height,0,-1.2);
            var origin=[x,side*10,-9],point=/** @param {number[]} p */function(p){return [x+p[0],side*(10+p[1]),-9+p[2]];};
            var elbow=point(solve.elbow),wrist=point(solve.wrist),aim=[0,side*Math.cos(-1.2)*(1-amount)+side*amount,Math.sin(-1.2)*(1-amount)];
            var end=wrist.map(function(v,i){return v+aim[i]*6;});
            var points=[origin,elbow,wrist,end],k=['upper','forearm','wrist'].indexOf(match[2]);
            var axis=points[k+1].map(function(v,i){return v-points[k][i];}),len=Math.hypot.apply(null,axis);axis=axis.map(function(v){return v/len;});
            return Object.assign({},m.batch,{origin:/** @type {[number,number,number]} */(points[k].map(function(v,i){return v/U+s.origin[i];})),basis:new Float32Array([1,0,0,0,axis[1],axis[2],0,-axis[2],axis[1]])});
        });
        transports.forEach(function(ship,index){var sample=samples[index];if(sample.phase==='complete')return;
            var arm=index===0?-112:0,port=ship.port;
            // Same dock attitude, standoff, clearance and departure as the depot study.
            // Its Y-up vertical axis maps onto +Z in the flight renderer.
            var origin=/** @type {[number,number,number]} */([(arm-port[0])/U,(-61+port[2])/U,1200+(-23-port[1]+18*sample.clearance+240*sample.departure)/U]);
            exhaust.push({index:index,hp:1,pose:{eye:origin,right:[1,0,0],back:[0,0,-1],up:[0,-1,0],velocity:[0,0,0],throttle:sample.phase==='depart'?1:0}});
            ship.batches.forEach(function(b){result.push(Object.assign({},b,{origin:origin,basis:dockBasis}));});
        });
        return result;
    }};
}());
