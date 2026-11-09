(function(){
    'use strict';
    var DW=/** @type {Required<import('./types').DriftworksNamespace>} */(window.Driftworks),U=DW.sim.METERS_PER_UNIT;
    /** @typedef {import('../experiments/types').Combat} Combat */
    /** @param {number[]} v */function unit(v){var n=Math.hypot(...v)||1;return v.map(function(x){return x/n;});}
    /** @param {Combat} combat */function center(combat){const s=combat.convoy;var ships=s?s.ships.filter(function(c){return c.hull>0&&!c.arrived;}):[];return [0,1,2].map(function(k){return ships.reduce(function(n,c){return n+c.position[k]*U;},0)/Math.max(1,ships.length);});}
    /** @param {Combat} combat */function start(combat){
        const s=combat.convoy;if(!s)return;
        var capitals=DW.convoyBattle.capitals();
        capitals.forEach(function(c,i){c.present=false;c.remote=i===1;});
        capitals[1].position.splice(0,3,0,6500/U,1200+180/U);capitals[1].heading=Math.PI/2;
        s.evacuation={phase:'patrol',withdrawalAt:null,capitals:capitals,nextWaveAt:32,waves:0,reserves:12,
            entry:[0,1500/U,1200],rally:[-1600,2300,1200*U],rescueAt:96,bastionClearAt:116,
            exit:{position:[0,0,1200],normal:[0,1,0],radiusM:800,opensAt:96,closesAt:1000000,spawned:true},
            guns:DW.flightGuns.create(),nextSalvo:32,salvos:0,capitalHits:0,route:[0,7500,1200*U],cruise:[0,25,0]};
        s.arrivalFleet=[];s.battle={fronts:[],nextAssessment:0,nextDispatch:0,order:null,pending:false,lastCall:-100};
        s.radio.opening=2;s.radio.said.push('intro-control','visual-reply','welcome');
    }
    /** SI route intent; guidance retains physical turning, separation and avoidance.
     * @param {Combat} combat */function navigation(combat){
        const s=combat.convoy,e=s&&s.evacuation;if(!s||!e)return null;
        var here=center(combat),goal=e.phase==='patrol'||e.phase==='warning'?[0,7500,1200*U]:e.rally;
        if(e.phase==='rescue'||e.phase==='extraction')goal=e.exit.position.map(function(v,k){return v*U+e.exit.normal[k]*1800;});
        var delta=goal.map(function(v,k){return v-here[k];}),distance=Math.hypot(...delta),forward=unit(delta),speed=e.phase==='patrol'||e.phase==='warning'?25:35;
        if((e.phase==='ambush'||e.phase==='defense')&&distance<400){forward=unit([-delta[1]-100,delta[0],0]);speed=22;}
        e.route=goal;e.cruise=forward.map(function(v){return v*speed;});return {route:goal,cruise:e.cruise};
    }
    /** @param {Combat} combat @param {number} dt */function step(combat,dt){
        const s=combat.convoy,e=s&&s.evacuation;if(!s||!e||s.complete)return;
        var t=s.elapsed;
        e.phase=t<22?'patrol':t<28?'warning':t<38?'ambush':t<e.rescueAt?'defense':t<e.bastionClearAt?'rescue':'extraction';
        if(t>=28&&!s.arrivalPortal){s.arrivalPortal={position:e.entry.slice(),normal:[0,-1,0],radiusM:650,opensAt:28,closesAt:1000000,spawned:true};e.capitals[1].present=true;}
        // Keep no more than two fresh three-ship strike wings active together.
        var active=combat.enemies.filter(function(c){return c.hp>0&&c.convoyRaider&&s.raids.some(function(r){return !!c.convoyRaider&&r.id===c.convoyRaider.wing&&!['withdraw','departed','hold'].includes(r.phase);});});
        if(t>=e.nextWaveAt&&t<e.rescueAt+10&&e.reserves>=3&&active.length<=3&&s.arrivalPortal){
            s.arrivalPortal.spawned=false;e.reserves-=3;e.waves++;e.nextWaveAt=t+20;
        }
        if(t>=e.rescueAt){
            if(!e.capitals[0].present){
                var here=center(combat),forward=unit(e.cruise);e.exit.normal=forward;
                e.exit.position=here.map(function(v,k){return (v+forward[k]*1100)/U;});
                const bastion=e.capitals[0];bastion.present=true;bastion.position.splice(0,3,...e.exit.position.map(function(v,k){return v+forward[k]*900/U;}));bastion.heading=Math.atan2(forward[1],forward[0]);
                e.withdrawalAt=t;
            }
            const b=e.capitals[0];var forward=e.exit.normal,right=[forward[1],-forward[0],0],age=t-e.rescueAt;
            var goal=e.exit.position.map(function(v,k){return v*U-forward[k]*1050+right[k]*(age>12?1450:0);});
            var delta=goal.map(function(v,k){return v-b.position[k]*U;}),distance=Math.hypot(...delta),speed=Math.min(95,distance/2);
            b.velocity=unit(delta).map(function(v){return b.integrity>0?v*speed:0;});b.position.forEach(function(v,k){b.position[k]=v+b.velocity[k]*dt/U;});
            var arrived=0;s.ships.forEach(function(ship){
                if(ship.hull<=0||ship.arrived)return;
                var relative=ship.position.map(function(v,k){return (v-e.exit.position[k])*U;}),along=relative.reduce(function(n,v,k){return n+v*forward[k];},0),radial=Math.hypot(...relative.map(function(v,k){return v-forward[k]*along;}));
                if(t>=e.bastionClearAt&&along>=0&&radial<e.exit.radiusM-80){ship.arrived=true;ship.velocity=[0,0,0];arrived++;}
            });if(arrived)DW.flightSim.collisionChanged(combat);
        }
        stepSalvos(combat,dt);
        if(s.ships.every(function(ship){return ship.hull<=0||ship.arrived;})){s.complete=true;e.phase='complete';s.director.waypoint=null;if(s.battle)s.battle.order=null;}
    }
    /** Real finite-speed shots emerge from the hostile aperture; no scripted cargo kills.
     * @param {Combat} combat @param {number} dt */function stepSalvos(combat,dt){
        const s=combat.convoy,e=s&&s.evacuation;if(!s||!e)return;
        var weapon=Object.assign({},DW.retailWeapons[0],{name:'Harrow portal battery',speed:850,lifetime:7,damage:1800,armorFactor:1,length:65,headRadius:2.6,tailRadius:1.7,fireWait:2.4});
        e.guns.bolts=e.guns.bolts.filter(function(bolt){
            var end=bolt.position.map(function(v,k){return v+bolt.direction[k]*weapon.speed*dt/U;}),hit=DW.convoyMission.trace(combat,bolt.position,end,2.6);
            bolt.age+=dt;
            if(hit){DW.convoyMission.damage(combat,hit.shipId,weapon,hit.point);e.capitalHits++;e.guns.hits++;return false;}
            bolt.position=end;return bolt.age<weapon.lifetime;
        });
        if(s.elapsed<32||s.elapsed>=e.rescueAt+16||s.elapsed<e.nextSalvo)return;
        var cargo=s.ships.filter(function(c){return c.hull>0&&!c.arrived;}),target=cargo.filter(function(c){return c.packet===0;})[e.salvos%3]||cargo[0];if(!target)return;
        var origin=e.entry.map(function(v,k){return v+([e.salvos%2?45:-45,-550,60][k])/U;});
        var travel=Math.hypot(...target.position.map(function(v,k){return (v-origin[k])*U;}))/weapon.speed;
        var aim=target.position.map(function(v,k){return v+target.velocity[k]*travel/U+(e.salvos%4===3&&k===0?110/U:0);});
        e.guns.bolts.push({position:origin,direction:unit(aim.map(function(v,k){return v-origin[k];})),weapon:weapon,age:0,team:'enemy'});e.guns.fired++;e.salvos++;e.nextSalvo=s.elapsed+(s.elapsed<48?2.4:5);
    }
    /** Persistent event facts let priority warnings interrupt chatter without stale queues.
     * @param {Combat} combat @returns {{key:string;text:string;wing?:boolean;civilian?:boolean;priority?:boolean}|null} */function radio(combat){
        const s=combat.convoy,e=s&&s.evacuation;if(!s||!e)return null;var said=s.radio.said,t=s.elapsed;
        if(t>=22&&!said.includes('discontinuity'))return {key:'discontinuity',priority:true,text:'Warning. Spatial discontinuity detected. Directly in the convoy flight path.'};
        if(t>=e.rescueAt&&!said.includes('rescue-arrival'))return {key:'rescue-arrival',priority:true,text:'Bastion to convoy. Opening your way out. Stand clear of the mouth. We are coming through.'};
        if(t>=28&&t<e.rescueAt&&!said.includes('break-course'))return {key:'break-course',priority:true,text:'All transports, break port! Clear that mouth. Lancer, weapons free. Keep the fighters off the freighters.'};
        if(t>=38&&t<e.rescueAt&&!said.includes('rally'))return {key:'rally',text:'Enemy capital firing through the discontinuity. New rally point marked. Bastion is inbound, one minute out. Lancer, hold them off.'};
        if(t>=e.bastionClearAt&&!said.includes('exit-open'))return {key:'exit-open',text:'Bastion is clear. Transports, take the mouth in the opposite direction. Lancer, cover the last ships through.'};
        if(t>=3&&t<10&&!said.includes('bored-wing'))return {key:'bored-wing',wing:true,text:'Six hours. Same clouds. Same cargo. I think that storm has lapped us twice.'};
        if(t>=11&&t<22&&!said.includes('bored-cargo'))return {key:'bored-cargo',civilian:true,text:'Wayfarer. You can have my next watch if you are enjoying the view that much.'};
        return null;
    }
    DW.convoyAmbush={start:start,step:step,navigation:navigation,radio:radio};
}());
