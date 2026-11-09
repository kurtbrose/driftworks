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
        s.evacuation={warningAt:null,incidentAt:null,bombardUntil:0,phase:'patrol',withdrawalAt:null,capitals:capitals,nextWaveAt:1000000,waves:0,reserves:12,
            entry:[0,1500/U,1200],rally:[-1600,2300,1200*U],rescueAt:1000000,bastionClearAt:1000000,
            exit:{position:[0,0,1200],normal:[0,1,0],radiusM:800,opensAt:1000000,closesAt:1000000,spawned:true},
            guns:DW.flightGuns.create(),nextSalvo:0,salvos:0,capitalHits:0,route:[0,7500,1200*U],cruise:[0,25,0]};
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
        const s=combat.convoy,e=s&&s.evacuation;if(!s||!e)return;
        if(s.complete){stepSalvos(combat,dt);return;}
        var t=s.elapsed,a=s.director.attention,ready=a.phase==='ready'&&!a.radioBusy;
        if(e.warningAt===null&&ready){e.warningAt=t;e.incidentAt=t+6;}
        if(e.incidentAt!==null&&!s.arrivalPortal&&!ready)e.incidentAt+=dt;
        if(e.incidentAt!==null&&t>=e.incidentAt&&!s.arrivalPortal){
            // A dogfight can delay opening for minutes; use the live convoy, not
            // the place it occupied when Control first detected the anomaly.
            var here=center(combat);e.entry=here.map(function(v,k){return (v+(k===1?1500:0))/U;});
            e.capitals[1].position=e.entry.map(function(v,k){return v+([0,5000,180][k])/U;});
            s.arrivalPortal={position:e.entry.slice(),normal:[0,-1,0],radiusM:650,opensAt:t,closesAt:1000000,spawned:true};e.capitals[1].present=true;e.nextWaveAt=t+4;
            e.rally=e.entry.map(function(v,k){return v*U+([-1600,800,0][k]);});
        }
        // One encounter at a time. Even a single pursued survivor can postpone a
        // fresh wave or relief; a clean fight earns cooling plus 10-30 s of rest.
        if(s.arrivalPortal&&t>=e.nextWaveAt&&ready&&t<e.rescueAt){
            if(e.waves>=4||e.waves>=2&&e.incidentAt!==null&&t-e.incidentAt>=120){
                e.rescueAt=t;e.bastionClearAt=t+20;e.exit.opensAt=t;
            }else if(e.reserves>=3){
                s.arrivalPortal.spawned=false;e.reserves-=3;e.waves++;e.nextWaveAt=t+20;e.bombardUntil=t+18;
            }
        }
        e.phase=e.warningAt===null?'patrol':!s.arrivalPortal?'warning':e.incidentAt!==null&&t<e.incidentAt+10?'ambush':t<e.rescueAt?'defense':t<e.bastionClearAt?'rescue':'extraction';
        if(t>=e.rescueAt){
            if(!e.capitals[0].present){
                var here=center(combat),forward=unit(e.cruise);e.exit.normal=forward;
                e.exit.position=DW.wormholes.separate(here.map(function(v,k){return (v+forward[k]*1100)/U;}),forward,e.exit.radiusM/U,
                    s.arrivalPortal?[{position:s.arrivalPortal.position,radius:(s.arrivalPortal.radiusM||210)/U}]:[],250/U);
                const bastion=e.capitals[0];bastion.present=true;bastion.position.splice(0,3,...e.exit.position.map(function(v,k){return v+forward[k]*900/U;}));bastion.heading=Math.atan2(forward[1],forward[0]);
                e.withdrawalAt=t;
            }
            const b=e.capitals[0];var forward=e.exit.normal,right=[forward[1],-forward[0],0],age=t-e.rescueAt;
            var goal=e.exit.position.map(function(v,k){return v*U-forward[k]*850+right[k]*(age>20?700:0);});
            var delta=goal.map(function(v,k){return v-b.position[k]*U;}),distance=Math.hypot(...delta),speed=Math.min(95,distance/2);
            b.velocity=unit(delta).map(function(v){return b.integrity>0?v*speed:0;});b.position.forEach(function(v,k){b.position[k]=v+b.velocity[k]*dt/U;});
            var arrived=0;s.ships.forEach(function(ship){
                if(ship.hull<=0||ship.arrived)return;
                var relative=ship.position.map(function(v,k){return (v-e.exit.position[k])*U;}),along=relative.reduce(function(n,v,k){return n+v*forward[k];},0),radial=Math.hypot(...relative.map(function(v,k){return v-forward[k]*along;}));
                if(t>=e.bastionClearAt&&along>=140&&radial<e.exit.radiusM-80){ship.arrived=true;ship.velocity=[0,0,0];arrived++;}
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
        if(s.complete||!s.arrivalPortal||s.elapsed>=e.bombardUntil||s.elapsed>=e.rescueAt||s.elapsed<e.nextSalvo)return;
        var cargo=s.ships.filter(function(c){return c.hull>0&&!c.arrived;}),target=cargo.filter(function(c){return c.packet===0;})[e.salvos%3]||cargo[0];if(!target)return;
        var origin=e.entry.map(function(v,k){return v+([e.salvos%2?45:-45,-550,60][k])/U;});
        var travel=Math.hypot(...target.position.map(function(v,k){return (v-origin[k])*U;}))/weapon.speed;
        var aim=target.position.map(function(v,k){return v+target.velocity[k]*travel/U+(e.salvos%4===3&&k===0?110/U:0);});
        e.guns.bolts.push({position:origin,direction:unit(aim.map(function(v,k){return v-origin[k];})),weapon:weapon,age:0,team:'enemy'});e.guns.fired++;e.salvos++;e.nextSalvo=s.elapsed+(e.waves===1?2.4:5);
    }
    /** Persistent event facts let priority warnings interrupt chatter without stale queues.
     * @param {Combat} combat @returns {{key:string;text:string;wing?:boolean;civilian?:boolean;priority?:boolean}|null} */function radio(combat){
        const s=combat.convoy,e=s&&s.evacuation;if(!s||!e)return null;var said=s.radio.said,t=s.elapsed;
        if(e.warningAt!==null&&!said.includes('discontinuity'))return {key:'discontinuity',priority:true,text:'Warning. Spatial discontinuity detected. Directly in the convoy flight path.'};
        if(t>=e.rescueAt&&!said.includes('rescue-arrival'))return {key:'rescue-arrival',priority:true,text:'Bastion to convoy. Opening your way out. Stand clear of the mouth. We are coming through.'};
        if(s.arrivalPortal&&t<e.rescueAt&&!said.includes('break-course'))return {key:'break-course',priority:true,text:'All transports, break port! Clear that mouth. Lancer, weapons free. Keep the fighters off the freighters.'};
        if(e.waves>0&&t<e.rescueAt&&['rest','ready'].includes(s.director.attention.phase)&&!said.includes('rally'))return {key:'rally',text:'Enemy capital beyond the discontinuity. New rally point marked. Bastion is inbound.'};
        if(t>=e.bastionClearAt&&!said.includes('exit-open'))return {key:'exit-open',text:'Bastion is clear. Transports, take the mouth in the opposite direction. Lancer, cover the last ships through.'};
        if(e.warningAt===null&&t>=3&&t<10&&!said.includes('status-request'))return {key:'status-request',text:'Lancer Two, Control. Report fuel and systems status.'};
        if(e.warningAt===null&&t>=10&&said.includes('status-request')&&!said.includes('status-reply'))return {key:'status-reply',wing:true,text:'Control, Lancer Two. Fuel sixty-two percent. All systems normal.'};
        return null;
    }
    DW.convoyAmbush={start:start,step:step,navigation:navigation,radio:radio};
}());
