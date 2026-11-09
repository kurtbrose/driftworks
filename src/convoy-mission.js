(function(){
    'use strict';
    var DW=/** @type {Required<import('./types').DriftworksNamespace>} */(window.Driftworks),U=DW.sim.METERS_PER_UNIT;
    var WING_SIZE=3,FIRST_CONTACT_SECONDS=60;
    // Authored launch centres in metres; local flocking takes over after launch.
    var packets=[
        {name:'Upper',center:[-100,210,175],ship:'Wayfarer',pilot:'Mara Vale',id:'mara-vale',portrait:0,voice:1},
        {name:'Port',center:[-275,10,5],ship:'Long Haul',pilot:'Daniel Okafor',id:'daniel-okafor',portrait:1,voice:0},
        {name:'Lower',center:[55,120,-170],ship:'Keel',pilot:'Elena Park',id:'elena-park',portrait:2,voice:3},
        {name:'Starboard',center:[270,190,50],ship:'Good Measure',pilot:'Ines Duarte',id:'ines-duarte',portrait:4,voice:5},
        {name:'Rear',center:[0,-310,-20],ship:'Last Light',pilot:'Thomas Reed',id:'thomas-reed',portrait:5,voice:4}
    ];
    /** Stationary reception ships flank the arrival corridor; source Aegis geometry stays in metres. */
    function arrivalFleet(){return [-1,1].map(function(side,i){return {id:'reception-'+i,callsign:i?'Vigilant':'Bastion',position:[side*1450/U,(7500+(i?450:950))/U,1200+(i?110:-70)/U],heading:Math.PI/2};});}
    /** @param {import('../experiments/types').Combat} combat @param {import('../experiments/types').FlightState} player @param {boolean} [battlefield] */
    function start(combat,player,battlefield){
        player.eye=[0,-680/U,1200+80/U];player.right=[1,0,0];player.up=[0,0,1];player.back=[0,-1,0];
        player.velocity=[0,25,0];player.ramp=[0,0,25];player.throttle=25/combat.player.profile.maxVelocity[2];
        combat.enemies.forEach(function(c,i){
            DW.flightSim.equip(c,combat.player.profile,DW.flightSim.defaultWeapon(combat.player.profile));
            c.team='ally';c.callsign=['Lancer Two','Lancer Three'][i];
            c.pose.eye=[(i?90:-90)/U,player.eye[1]-80/U,player.eye[2]];
            c.pose.right=player.right.slice();c.pose.up=player.up.slice();c.pose.back=player.back.slice();
            c.pose.velocity=player.velocity.slice();c.pose.ramp=[0,0,25];c.pose.throttle=25/c.profile.maxVelocity[2];
            c.mode='escort';c.targetId=null;
            if(combat.useHullModels)c.collision={kind:'model',modelId:DW.shipPackModels.craftModel(c,combat.hullModels?combat.hullModels.ally:'mixed',combat.wave).id};
        });
        combat.convoy={elapsed:0,speedMps:25,destinationY:7500/U,complete:false,raidStarted:false,arrivalFleet:arrivalFleet(),raids:[],director:{phase:'opening',raids:0,reservePlanned:false,overload:0,withdrawn:0,events:[],nextRaidAt:FIRST_CONTACT_SECONDS,pressure:0,lastHull:150000,lastDamageAt:-100,quietSince:0,patrol:0,stationAt:0,waypoint:null},radio:{wait:1,opening:0,said:[],phase:'arrival',report:0,chat:0,chatTurn:0},ships:Array.from({length:30},function(/** @type {unknown} */unused,i){
            var packet=packets[Math.floor(i/6)],local=i%6,row=Math.floor(local/2),side=local%2?1:-1;
            var slot=[(packet.center[0]+side*48+(row-1)*11)/U,(packet.center[1]+(1-row)*125+(side>0?-35:25))/U,1200+(packet.center[2]+side*32+[ -12,8,4 ][row])/U];
            return {id:'cargo-'+String(i+1).padStart(2,'0'),packet:Math.floor(i/6),callsign:local===0?packet.ship:packet.name+' '+String(local+1).padStart(2,'0'),model:['container','mixed','fluid'][i%3],slot:slot.slice(),position:slot.slice(),velocity:[0,25,0],hull:5000,maxHull:5000,arrived:false};
        })};
        var bodies=freighters(combat);
        var navigation=DW.fleetGuidance.settle(bodies,{forward:[0,1,0],speed:25});combat.convoy.navigation=navigation;
        var settledShips=combat.convoy.ships;
        bodies.forEach(function(body){var ship=settledShips.find(function(s){return s.id===body.id;});if(ship){ship.position=body.position.map(function(v){return v/U;});ship.forward=body.forward;ship.velocity=body.velocity;}});
        // Begin as an established cruise; startup spacing relaxation happens before time zero.
        if(battlefield!==false&&combat.mode!=='fleet-evacuation')DW.convoyBattle.start(combat);
        if(combat.mode==='fleet-evacuation')DW.convoyBattle.startEvacuation(combat);
        targets(combat);
        combat.targetId=null;combat.roundOver=false;
    }
    /** Spawn one coherent approach relative to the moving convoy.
     * @param {import('../experiments/types').Combat} combat @param {boolean} [reserve] */
    function beginRaid(combat,reserve){
        const s=combat.convoy;if(!s||s.director.raids>=(s.evacuation?4:3))return;
        var survivors=s.ships.filter(function(ship){return ship.hull>0&&(!s.evacuation||!ship.arrived);});if(!survivors.length)return;
        s.raidStarted=true;
        var wave=s.director.raids++,wingId=s.raids.length,base=wave*3,packet=s.evacuation?[0,3,4,1][wave]:[4,0,1][wave],offset=[[2600,-1000,500],[-2600,900,650],[2100,1800,-700]][wave%3];
        if(reserve)offset=offset.map(function(v){return v*1.7;});
        var portal=!reserve&&s.arrivalPortal&&!s.arrivalPortal.spawned?s.arrivalPortal:null;
        var objective=survivors.find(function(ship){return ship.packet===packet;})||survivors[0],origin=objective.position.map(function(v,k){return v+offset[k]/U;});
        if(portal){origin=portal.position.slice();portal.spawned=true;offset=origin.map(function(v,k){return (v-objective.position[k])*U;});}
        var raid={id:wingId,phase:reserve?'hold':'approach',leaderId:'convoy-raider-'+(base+1),until:0,offset:offset,packet:objective.packet,createdAt:combat.time,committedAt:reserve?-1:combat.time,passes:0};
        s.raids.push(/** @type {import('../experiments/types').ConvoyRaid} */(raid));
        s.director.phase='contact';s.director.quietSince=-1;
        for(var j=0;j<3;j++){
            var target=survivors.find(function(ship){return ship.id===s.ships[objective.packet*6+j].id;})||objective,pose=DW.arcade.create(0);
            var delta=objective.position.map(function(v,k){return v-origin[k];}),length=Math.hypot.apply(null,delta),forward=delta.map(function(v){return v/length;});
            var horizontal=Math.hypot(forward[0],forward[1]);pose.right=[forward[1]/horizontal,-forward[0]/horizontal,0];pose.up=[pose.right[1]*forward[2],-pose.right[0]*forward[2],pose.right[0]*forward[1]-pose.right[1]*forward[0]];pose.back=forward.map(function(v){return -v;});
            pose.eye=origin.map(function(v,k){return v+(j?pose.right[k]*(j===1?-130:130)+pose.back[k]*180+pose.up[k]*(j===1?40:-40):0)/U;});
            pose.velocity=forward.map(function(v){return v*60;});pose.ramp=[0,0,60];pose.throttle=.85;
            var raider=DW.flightSim.createCraft('convoy-raider-'+(base+j+1),pose,'enemy');
            raider.index=2+j;raider.callsign='Raider '+(base+j+1);raider.controller='ai';raider.skill=1;raider.pilot='Veteran';raider.mode='approach';raider.opponentStyle='fso-breaker';
            DW.flightSim.equip(raider,DW.arcade.profiles[0],DW.flightSim.defaultWeapon(DW.arcade.profiles[0]));
            raider.convoyRaider={wing:wingId,slot:j,role:j===2?'cover':'strike',cargoId:target.id,stage:'form',holdUntil:0,runAt:-1,fired:0};
            raider.goal=target.position.slice();raider.targetId=j===2?null:target.id;raider.retarget=.75;
            if(combat.useHullModels)raider.collision={kind:'model',modelId:DW.shipPackModels.craftModel(raider,combat.hullModels?combat.hullModels.enemy:'mixed',combat.wave).id};
            combat.enemies.push(raider);
        }
        if(!reserve&&!combat.targetLocked)combat.targetId='convoy-raider-'+(base+1);
        DW.flightSim.collisionChanged(combat);if(!reserve)direct(combat,0);
    }
    /** Director toolkit: a fixed, telegraphed arrival ahead of the current flight path.
     * @param {import('../experiments/types').Combat} combat @returns {boolean} */
    function openReinforcementPortal(combat){
        const s=combat.convoy;if(!s||s.evacuation||combat.dead||s.complete||s.elapsed<60||s.elapsed>=206||s.director.raids>=3||s.director.pressure>=.5||combat.player.hp/combat.player.maxHp<.5||s.ships.every(function(ship){return ship.hull<=0||ship.arrived;}))return false;
        if(s.arrivalPortal&&combat.time<s.arrivalPortal.closesAt)return false;
        var pose=combat.player.pose,position=pose.eye.map(function(v,k){return v+(-pose.back[k]*1100+pose.right[k]*350)/U;});
        // Keep the mouth clear of freighters, reception hulls and existing fighters.
        if(s.ships.some(function(ship){return ship.hull>0&&range(position,ship.position)<600;})||s.arrivalFleet.some(function(ship){return range(position,ship.position)<1700;})||DW.flightSim.participants(combat).some(function(c){return c.hp>0&&range(position,c.pose.eye)<500;}))return false;
        s.arrivalPortal={position:position,opensAt:combat.time,closesAt:combat.time+13,spawned:false};
        s.director.events.push({wing:-1,kind:'portal'});return true;
    }
    /** @param {import('../experiments/types').Combat} combat @param {number} dt */
    function step(combat,dt){
        const s=combat.convoy;if(!s||combat.dead||s.complete)return;
        s.elapsed=Math.min((s.destinationY*U+(s.evacuation?1400:0))/s.speedMps,s.elapsed+dt+1e-12);
        var bodies=freighters(combat),navigation=s.navigation;
        if(navigation){
            var route=[0,Math.min(s.destinationY*U+(s.evacuation?1400:0),s.elapsed*s.speedMps),1200*U];
            var ambush=DW.convoyAmbush.navigation(combat);
            DW.fleetGuidance.step(navigation,bodies,ambush?ambush.route:route,ambush?ambush.cruise:[0,s.speedMps,0],navigationThreats(combat),dt);

            bodies.forEach(function(body){
                var ship=s.ships.find(function(candidate){return candidate.id===body.id;});if(!ship)return;
                ship.position=body.position.map(function(v){return v/U;});ship.velocity=body.velocity;ship.forward=body.forward;

            });
            if(!s.evacuation&&s.elapsed*s.speedMps>=s.destinationY*U&&s.ships.every(function(ship){return ship.hull<=0||ship.position[1]>=s.destinationY;}))s.ships.forEach(function(ship){if(ship.hull>0){ship.arrived=true;ship.velocity=[0,0,0];}});
            if(combat.time>=(s.nextCoverage||0)){
                s.nextCoverage=combat.time+1;
                var escorts=DW.flightSim.participants(combat).filter(function(c){return c.team==='ally'&&c.hp>0&&c!==combat.player&&!c.convoyBattle;}).map(function(c){return {id:c.id,position:c.pose.eye.map(function(v){return v*U;}),velocity:c.pose.velocity,radius:10};});
                s.coverage=DW.fleetGuidance.cover(navigation,bodies,escorts,navigationThreats(combat));
            }
        }
        DW.convoyBattle.updateEvacuation(combat,dt);
        if(s.complete)return;
        if(s.arrivalPortal&&!s.arrivalPortal.spawned&&combat.time>=s.arrivalPortal.opensAt+4)beginRaid(combat);
        DW.convoyBattle.update(combat);
        direct(combat,dt);
        updateRaid(combat);
        DW.convoyBattle.dispatch(combat);
        if(!s.evacuation)s.complete=!s.ships.some(function(ship){return ship.hull>0&&(!s.evacuation||!ship.arrived);})||(s.ships.every(function(ship){return ship.arrived||ship.hull<=0;})&&!combat.enemies.some(function(e){return e.team==='enemy'&&e.hp>0&&!e.convoyBattle;}));
    }
    /** Adapt mission entities to the reusable SI guidance contract.
     * @param {import('../experiments/types').Combat} combat */
    function freighters(combat){return combat.convoy?combat.convoy.ships.filter(function(s){return s.hull>0&&!s.arrived;}).map(function(s){var hull=hulls[s.model],halfSize=hull?hull.max.map(function(v,k){return Math.max(Math.abs(v),Math.abs(hull.min[k]));}):[9,61,7];return {id:s.id,position:s.position.map(function(v){return v*U;}),velocity:s.velocity.slice(),radius:hull?DW.shipHulls.hullRadius(hull.model):80,crossRadius:Math.hypot(halfSize[0],halfSize[2]),halfSize:halfSize,packet:s.packet,forward:s.forward,turnRate:.035+12/(halfSize[1]*20)};}):[];}
    /** Only attackers committed to the cargo influence its route; distant screen fights do not.
     * @param {import('../experiments/types').Combat} combat */
    function navigationThreats(combat){var threats=combat.enemies.filter(function(c){return c.hp>0&&c.team==='enemy'&&!!c.convoyRaider&&!!combat.convoy&&combat.convoy.raids.some(function(r){return !!c.convoyRaider&&r.id===c.convoyRaider.wing&&r.phase!=='hold'&&r.phase!=='withdraw'&&r.phase!=='departed';});}).map(function(c){return {position:c.pose.eye.map(function(v){return v*U;}),radius:2500,weight:1};});const state=combat.convoy,e=state&&state.evacuation;if(e){if(state.arrivalPortal)threats.push({position:e.entry.map(function(v){return v*U;}),radius:2000,weight:3});const b=e.capitals[0];if(b.present&&b.integrity>0)threats.push({position:b.position.map(function(v){return v*U;}),radius:1300,weight:2});}return threats;}
    /** @param {number[]} a @param {number[]} b */
    function range(a,b){return Math.hypot.apply(null,a.map(function(v,k){return v-b[k];}))*U;}
    /** Observe the real battle; pacing never changes damage, aim, shields or existing positions.
     * @param {import('../experiments/types').Combat} combat @param {number} dt */
    function direct(combat,dt){
        const s=combat.convoy;if(!s)return;const d=s.director;
        const cargo=s.ships.filter(function(ship){return ship.hull>0&&(!s.evacuation||!ship.arrived);}),hostiles=combat.enemies.filter(function(e){return e.team==='enemy'&&e.hp>0&&!e.convoyBattle;});
        var hull=s.ships.reduce(function(n,ship){return n+ship.hull;},0);if(hull<d.lastHull)d.lastDamageAt=s.elapsed;d.lastHull=hull;
        var nearest=Infinity,focus=hostiles[0],objective=cargo[0],firing=false,inRange=false;
        hostiles.forEach(function(enemy){var weapon=DW.retailWeapons[enemy.weaponIndex||0];cargo.forEach(function(ship){var distance=range(enemy.pose.eye,ship.position);if(distance<nearest){nearest=distance;focus=enemy;objective=ship;}if(distance<weapon.speed*weapon.lifetime)inRange=true;if(enemy.targetId===ship.id&&enemy.fire&&enemy.guns.fired>0)firing=true;});});
        var recent=s.elapsed-d.lastDamageAt<10,health=combat.player.hp/combat.player.maxHp,wing=combat.enemies.filter(function(e){return e.team==='ally'&&e.hp>0&&!e.convoyBattle;}).length;
        var observed=hostiles.length?Math.min(1,.15+(inRange?.25:0)+(firing?.3:0)+(recent?.2:0)+(health<.5?.2:0)+(wing<2?.1:0)):0;
        d.pressure+=(observed-d.pressure)*Math.min(1,dt/3);
        if(!cargo.length){d.waypoint=null;return;}
        d.overload=d.pressure>.62?d.overload+dt:Math.max(0,d.overload-dt*2);
        var groups=s.raids.filter(function(group){return group.phase!=='departed'&&hostiles.some(function(e){return e.convoyRaider&&e.convoyRaider.wing===group.id;});});
        var active=groups.filter(function(group){return group.phase!=='hold'&&group.phase!=='withdraw';});
        /** @param {import('../experiments/types').ConvoyRaid} group @param {string} kind */
        function event(group,kind){if(d.events.length<10)d.events.push({wing:group.id,kind:kind});}
        groups.forEach(function(group){
            var members=hostiles.filter(function(e){return e.convoyRaider&&e.convoyRaider.wing===group.id;});
            var depleted=members.length===1||members.reduce(function(n,e){return n+e.hp/e.maxHp;},0)/members.length<.45;
            if(group.phase==='hold'&&depleted){group.phase='withdraw';group.until=combat.time;event(group,'withdraw');}
            if(group.phase==='hold'){
                if(members.some(function(e){return !!threat(combat,e)||combat.time-e.damagedAt<2;})){
                    group.phase='engage';group.until=combat.time+24;group.committedAt=combat.time;event(group,'commit');
                }else if(!active.length&&combat.time-group.createdAt>6){group.phase='withdraw';group.until=combat.time;event(group,'withdraw');}
                else if(combat.time-group.createdAt>=20&&d.pressure<.5){
                    var escorts=DW.flightSim.participants(combat).filter(function(e){return e.team==='ally'&&e.hp>0&&!e.convoyBattle;});
                    var exposed=cargo.reduce(function(best,ship){var gap=Math.min.apply(null,escorts.map(function(e){return range(e.pose.eye,ship.position);}));return gap>best.gap?{ship:ship,gap:gap}:best;},{ship:cargo[0],gap:0});
                    if(exposed.ship&&exposed.gap>1400){
                        group.packet=exposed.ship.packet;group.phase='approach';group.committedAt=combat.time;
                        members.forEach(function(e){if(e.convoyRaider)e.convoyRaider.cargoId=exposed.ship.id;});event(group,'commit');
                    }
                }
            }else if(group.phase!=='withdraw'&&(depleted||group.passes>=2||d.overload>=6)){
                group.phase='withdraw';group.until=combat.time;event(group,'withdraw');
            }
            if(group.phase==='withdraw'&&combat.time-group.until>3&&members.every(function(e){return cargo.every(function(ship){return range(e.pose.eye,ship.position)>5500;});})){
                var leaving=members.map(function(e){return e.id;});combat.enemies=combat.enemies.filter(function(e){return !leaving.includes(e.id);});group.phase='departed';d.withdrawn+=members.length;DW.flightSim.collisionChanged(combat);
            }
        });
        if(!s.evacuation&&!d.reservePlanned&&d.raids===1&&active.some(function(group){return group.phase!=='withdraw';})&&combat.time-s.raids[0].createdAt>=18&&s.elapsed<180){d.reservePlanned=true;beginRaid(combat,true);event(s.raids[s.raids.length-1],'hold');}
        if(!cargo.length||(!hostiles.length&&cargo.every(function(ship){return ship.arrived;}))){d.waypoint=null;return;}
        // Holding and departing groups remain real, interceptable ships, but are not an attack order.
        var threats=hostiles.filter(function(e){var group=s.raids.find(function(group){return e.convoyRaider&&group.id===e.convoyRaider.wing;});return !group||group.phase!=='hold'&&group.phase!=='withdraw'&&group.phase!=='departed';});
        if(threats.length){nearest=Infinity;threats.forEach(function(e){cargo.forEach(function(ship){var distance=range(e.pose.eye,ship.position);if(distance<nearest){nearest=distance;focus=e;objective=ship;}});});}

        if(threats.length){
            d.phase=firing||recent?'under-fire':inRange?'threatened':'contact';d.quietSince=-1;
            d.waypoint={kind:'intercept',packet:objective.packet,position:objective.position.map(function(v,k){return v+(focus.pose.eye[k]-v)*.6+objective.velocity[k]*8/U;}),targetId:focus.id};
            return;
        }
        if(hostiles.length){d.quietSince=-1;}
        if(!hostiles.length&&d.quietSince<0){
            d.quietSince=s.elapsed;d.nextRaidAt=s.elapsed+45+Math.max(d.pressure,recent?.8:0,1-health)*40;
        }
        d.phase=hostiles.length?'recovery':!s.raidStarted?'opening':s.elapsed<d.nextRaidAt?'recovery':'patrol';
        var packet=packets[d.patrol%packets.length],group=cargo.filter(function(ship){return ship.packet===d.patrol%packets.length;});if(!group.length)group=cargo;
        var center=[0,1,2].map(function(k){return group.reduce(function(n,ship){return n+ship.position[k];},0)/group.length;});
        var station=center.map(function(v,k){return v+([0,-500,300][k]+(k===0?packet.center[0]*.8:0))/U;});
        if((s.elapsed-d.stationAt>22&&range(combat.player.pose.eye,station)<220)||s.elapsed-d.stationAt>40){d.patrol++;d.stationAt=s.elapsed;}
        d.waypoint={kind:'patrol',packet:group[0].packet,position:station,targetId:null};
        // No new wing while an attack survives, during reports, or near arrival.
        if(!s.evacuation&&(!s.arrivalPortal||s.arrivalPortal.spawned)&&!hostiles.length&&d.raids<3&&s.elapsed>=d.nextRaidAt&&s.elapsed<206&&s.radio.phase!=='damage-report'){
            if(d.raids===0)beginRaid(combat);
            else openReinforcementPortal(combat);
        }
    }
    /** Observe proximity, facing and real rounds/damage, never the player's selected target or future input.
     * @param {import('../experiments/types').Combat} combat @param {import('../experiments/types').Craft} raider */
    function threat(combat,raider){
        var best=/** @type {import('../experiments/types').Craft|undefined} */(undefined),nearest=Infinity;
        DW.flightSim.participants(combat).forEach(function(other){
            if(other.team!=='ally'||other.hp<=0)return;
            var distance=range(other.pose.eye,raider.pose.eye),direction=raider.pose.eye.map(function(v,k){return v-other.pose.eye[k];}),length=Math.hypot.apply(null,direction)||1;
            var facing=-other.pose.back.reduce(function(n,v,k){return n+v*direction[k]/length;},0);
            var dangerous=distance<350||distance<850&&facing>.7||combat.time-raider.damagedAt<2&&distance<1500||distance<1200&&facing>.85&&other.guns.bolts.length>0;
            if(dangerous&&distance<nearest){best=other;nearest=distance;}
        });return best;
    }
    /** @param {import('../experiments/types').Combat} combat */
    function updateRaid(combat){
        const s=combat.convoy;if(!s)return;
        s.raids.forEach(function(raid){
        const members=combat.enemies.filter(function(e){return e.convoyRaider&&e.convoyRaider.wing===raid.id&&e.hp>0;});if(!members.length)return;
        var leader=members.find(function(e){return e.id===raid.leaderId;})||members[0];raid.leaderId=leader.id;
        if(!members.some(function(e){return e.convoyRaider&&e.convoyRaider.role==='strike';})&&leader.convoyRaider)leader.convoyRaider.role='strike';
        const cargo=s.ships.find(function(ship){return ship.id===(leader.convoyRaider&&leader.convoyRaider.cargoId)&&ship.hull>0&&(!s.evacuation||!ship.arrived);})||s.ships.find(function(ship){return ship.hull>0&&(!s.evacuation||!ship.arrived);});if(!cargo)return;
        if(raid.phase==='approach'&&(range(leader.pose.eye,cargo.position)<1400||members.some(function(e){return !!threat(combat,e)||combat.time-e.damagedAt<1.5;}))) {raid.phase='engage';raid.until=combat.time+24;}
        if(raid.phase==='engage'&&(combat.time>=raid.until||members.filter(function(e){return e.convoyRaider&&e.convoyRaider.role==='strike';}).every(function(e){return e.convoyRaider&&e.convoyRaider.stage==='extend';}))){raid.phase='regroup';raid.until=combat.time+20;}
        if(raid.phase==='regroup'){
            var rally=cargo.position.map(function(v,k){return v+raid.offset[k]*.65/U;});
            if(combat.time>=raid.until||members.every(function(e){return range(e.pose.eye,rally)<350;})){
                raid.phase='approach';raid.passes++;members.forEach(function(e){if(e.convoyRaider){e.convoyRaider.stage='form';e.convoyRaider.runAt=-1;e.convoyRaider.fired=e.guns.fired;}});
            }
        }
        });
    }
    /** Shared physical steering, without directly replacing position or velocity.
     * @param {import('../experiments/types').Craft} craft @param {number[]} goal @param {number} speed @param {boolean} boost @param {number} dt */
    function flyRaider(craft,goal,speed,boost,dt){
        craft.goal=goal;craft.fire=false;
        var demand=DW.flightSim.steer(craft.pose,goal);
        DW.flightSim.stepInput(craft,Object.assign({},demand,{throttle:Math.max(.35,Math.min(1,speed/craft.profile.maxVelocity[2])),throttleRate:0,fire:false,boost:boost}),dt);
    }
    /** Return true when formation/extension movement replaces the generic combat step.
     * @param {import('../experiments/types').Combat} combat @param {import('../experiments/types').Craft} craft @param {number} dt */
    function stepRaider(combat,craft,dt){
        const s=combat.convoy,r=craft.convoyRaider;if(!s||!r)return false;
        const raid=s.raids.find(function(group){return group.id===r.wing;});if(!raid)return false;
        const members=combat.enemies.filter(function(e){return e.convoyRaider&&e.convoyRaider.wing===raid.id&&e.hp>0;});
        var leader=members.find(function(e){return e.id===raid.leaderId;})||craft;
        const cargo=s.ships.find(function(ship){return ship.id===r.cargoId&&ship.hull>0&&(!s.evacuation||!ship.arrived);})||s.ships.find(function(ship){return ship.hull>0&&(!s.evacuation||!ship.arrived);});if(!cargo)return false;r.cargoId=cargo.id;
        if(raid.phase==='withdraw'){
            craft.mode='withdraw';craft.targetId=null;r.stage='extend';craft.retarget=.75;
            flyRaider(craft,cargo.position.map(function(v,k){return v+raid.offset[k]*3/U;}),craft.profile.maxVelocity[2],true,dt);return true;
        }
        if(raid.phase==='hold'){
            craft.mode='holding';craft.targetId=null;craft.retarget=.75;
            var angle=(combat.time-raid.createdAt)/12+r.slot*.2;
            var holding=cargo.position.map(function(v,k){return v+(raid.offset[k]+(k===0?Math.cos(angle)*500:k===1?Math.sin(angle)*500:r.slot*100))/U;});
            flyRaider(craft,holding,craft.profile.maxVelocity[2]*.65,false,dt);return true;
        }
        if(raid.phase==='approach'){
            craft.mode='approach';r.stage='form';craft.targetId=r.role==='strike'?cargo.id:null;craft.retarget=.75;
            var destination=cargo.position.map(function(v,k){return v+cargo.velocity[k]*2/U;});
            var travel=DW.flightOpponent.wingTravel(craft,members,destination);
            flyRaider(craft,travel.goal,travel.speed,false,dt);return true;
        }
        if(raid.phase==='regroup'||r.stage==='extend'){
            craft.mode='regroup';r.stage='extend';craft.targetId=null;craft.retarget=.75;
            var rally=cargo.position.map(function(v,k){return v+(raid.offset[k]*.65+(k===1?r.slot*140:k===2?(r.slot-1)*100:0))/U;});
            flyRaider(craft,rally,craft.profile.maxVelocity[2],range(craft.pose.eye,rally)>500,dt);return true;
        }
        var danger=threat(combat,craft),opponent=/** @type {import('../experiments/types').Craft|undefined} */(undefined);
        if(r.role==='strike'&&danger&&range(danger.pose.eye,craft.pose.eye)>450&&combat.time-craft.damagedAt>=2&&!danger.guns.bolts.length)danger=undefined;
        if(r.role==='cover'){
            members.forEach(function(e){var candidate=threat(combat,e);if(candidate&&(!opponent||range(candidate.pose.eye,craft.pose.eye)<range(opponent.pose.eye,craft.pose.eye)))opponent=candidate;});
        }else opponent=danger;
        if(opponent){r.stage='defend';r.holdUntil=combat.time+3;}
        else if(r.stage==='defend'&&combat.time<r.holdUntil)opponent=DW.flightSim.participants(combat).find(function(e){return e.id===craft.targetId&&e.hp>0&&e.team==='ally';});
        if(craft.hp<craft.maxHp*.4&&combat.time-craft.damagedAt<2){r.stage='extend';return stepRaider(combat,craft,dt);}
        if(!opponent&&r.role==='cover'){
            craft.mode='cover';craft.targetId=null;
            var station=leader.pose.eye.map(function(v,k){return v+(leader.pose.right[k]*180+leader.pose.back[k]*200+leader.pose.up[k]*80)/U;});
            flyRaider(craft,station,Math.hypot.apply(null,leader.pose.velocity)+Math.max(0,range(craft.pose.eye,station)-100)*.2,range(craft.pose.eye,station)>600,dt);return true;
        }
        var targetId=opponent?opponent.id:cargo.id;
        if(!opponent){
            if(r.stage!=='attack'){r.stage='attack';r.runAt=-1;r.fired=craft.guns.fired;}
            if(craft.guns.fired>r.fired&&r.runAt<0)r.runAt=combat.time;
            if(range(craft.pose.eye,cargo.position)<260||r.runAt>=0&&combat.time-r.runAt>5){r.stage='extend';return stepRaider(combat,craft,dt);}
        }
        if(craft.targetId!==targetId){craft.targetId=targetId;craft.decision=0;craft.until=0;craft.mode='approach';craft.gunGoal=undefined;DW.flightOpponent.forget(craft);}
        craft.retarget=.75;return false;
    }
    /** Follow a moving slot using ordinary fighter steering and acceleration.
     * @param {import('../experiments/types').Craft} craft @param {import('../experiments/types').FlightState} player @param {number} index @param {number} dt @param {import('../experiments/types').Combat} [combat] */
    function stepWing(craft,player,index,dt,combat){
        var goal=player.eye.map(function(v,k){return v+(player.right[k]*(index?90:-90)+player.back[k]*80+player.velocity[k]*1.5)/U;});
        var coverage=combat&&combat.convoy&&combat.convoy.coverage;
        if(coverage&&coverage[craft.id])goal=coverage[craft.id].map(function(v){return v/U;});
        var delta=goal.map(function(v,k){return (v-craft.pose.eye[k])*U;}),distance=Math.hypot.apply(null,delta);
        var convoy=combat&&combat.convoy,followVelocity=coverage&&convoy&&convoy.navigation?convoy.navigation.velocity:player.velocity;
        var demand=DW.flightSim.steer(craft.pose,goal),speed=Math.hypot.apply(null,followVelocity);
        craft.goal=goal;craft.mode='escort';craft.fire=false;
        demand.boost=distance>350||speed>craft.profile.maxVelocity[2]+5;
        craft.pose.throttle=Math.min(1,Math.max(0,(speed+(distance-90)*.4)/craft.profile.maxVelocity[2]));
        DW.flightSim.stepInput(craft,Object.assign({throttle:craft.pose.throttle,throttleRate:0,fire:false},demand),dt);
    }
    /** @type {Record<string,{model:import('../experiments/types').Model;min:number[];max:number[]}>} */var hulls={};
    var hullPose={eye:[0,0,0],right:[1,0,0],up:[0,0,1],back:[0,-1,0]};
    /** One shared triangle index per authored variant, independent of rendering.
     * @param {import('../experiments/types').ConvoyAsset} meta @param {ArrayBuffer} bytes */
    function installCollision(meta,bytes){
        hulls={};
        Object.keys(meta.variants).forEach(function(name){
            /** @type {number[]} */var vertices=[];
            var min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
            meta.variants[name].batches.forEach(function(batch){
                var source=new Float32Array(bytes,batch.offset,batch.count);
                for(var i=0;i<source.length;i+=8){
                    for(var k=0;k<6;k++)vertices.push(source[i+k]);
                    for(var axis=0;axis<3;axis++){min[axis]=Math.min(min[axis],source[i+axis]);max[axis]=Math.max(max[axis],source[i+axis]);}
                }
            });
            var model={id:'convoy-'+name,name:name,vertices:vertices,triangles:vertices.length/18,hullIndex:meta.variants[name].collision};
            // Warm the existing shared hull BVH before the sortie can start.
            DW.shipHulls.hullHit(model,hullPose,[0,-1000,0],[0,1000,0],1,.01);
            hulls[name]={model:model,min:min,max:max};
        });
    }
    /** Sweep in each freighter's moving frame. Inputs and output points use scene units.
     * @param {import('../experiments/types').Combat} combat @param {number[]} start @param {number[]} end
     * @param {number} radiusM @param {number[][]} [previousShips] @param {number[]} [shipIndices]
     * @returns {import('../experiments/types').ConvoyHit|null} */
    function trace(combat,start,end,radiusM,previousShips,shipIndices){
        var state=combat.convoy;if(!state)return null;
        /** @type {import('../experiments/types').ConvoyHit|null} */var best=null;
        for(var j=0;j<(shipIndices?shipIndices.length:state.ships.length);j++){
            var i=shipIndices?shipIndices[j]:j,ship=state.ships[i],hull=hulls[ship.model];if(ship.hull<=0||state.evacuation&&ship.arrived||!hull)continue;
            var old=previousShips?previousShips[i]:ship.position,axes=DW.fleetGuidance.frame(ship.forward||[0,1,0]),forward=axes.back.map(function(v){return -v;});
            var local=function(/** @type {number[]} */point,/** @type {number[]} */origin){var delta=point.map(function(v,k){return v-origin[k];});return [axes.right,forward,axes.up].map(function(axis){return delta.reduce(function(n,v,k){return n+v*axis[k];},0);});};
            var from=local(start,old),to=local(end,ship.position);
            var miss=[0,1,2].some(function(k){return Math.min(from[k],to[k])*U>hull.max[k]+radiusM||Math.max(from[k],to[k])*U<hull.min[k]-radiusM;});if(miss)continue;
            const hit=DW.shipHulls.hullHit(hull.model,hullPose,from,to,U,radiusM);
            if(!hit||best&&hit.fraction>=best.fraction)continue;
            var away=from.map(function(v,k){return (v+(to[k]-v)*hit.fraction)*U-hit.local[k];}),length=Math.hypot.apply(null,away);
            var normal=length>1e-7?away.map(function(v){return v/length;}):hit.normal;
            best={shipIndex:i,shipId:ship.id,fraction:hit.fraction,point:ship.position.map(function(v,k){return v+(axes.right[k]*hit.local[0]+forward[k]*hit.local[1]+axes.up[k]*hit.local[2])/U;}),normal:normal.map(function(v,k){return axes.right[k]*normal[0]+forward[k]*normal[1]+axes.up[k]*normal[2];})};
        }
        return best;
    }
    /** Heavy freighters keep their route; fighters deflect in the freighter's frame.
     * @param {import('../experiments/types').Combat} combat @param {number[][]} previousCraft
     * @param {number[][]} previousShips @param {number} dt */
    function collide(combat,previousCraft,previousShips,dt){
        const state=combat.convoy;if(!state||!combat.enabled||!(dt>0))return false;
        var playerImpact=false,maxMotion=state.ships.reduce(function(n,ship,i){return Math.max(n,Math.hypot.apply(null,ship.position.map(function(v,k){return v-previousShips[i][k];}))*U);},0);
        DW.flightCollision.batch(combat,function(){DW.flightSim.participants(combat).forEach(function(craft,index){
            if(craft.hp<=0)return;
            var pose=craft.pose,radius=DW.flightCollision.radius(craft)*U;
            // An approach may spawn during this tick; new craft have no earlier sample.
            var from=previousCraft[index]||pose.eye,indices=DW.flightCollision.sweep(combat,from,pose.eye,radius+maxMotion).filter(function(entry){return !!entry.craft.convoyModel;}).map(function(entry){return entry.craft.index;});
            const hit=trace(combat,from,pose.eye,radius,previousShips,indices);if(!hit)return;
            var ship=state.ships[hit.shipIndex],velocity=ship.position.map(function(v,k){return (v-previousShips[hit.shipIndex][k])*U/dt;});
            var relative=pose.velocity.map(function(v,k){return v-velocity[k];}),inward=relative.reduce(function(n,v,k){return n+v*hit.normal[k];},0);
            pose.eye=hit.point.map(function(v,k){return v+hit.normal[k]*(radius+.02)/U;});
            if(inward<0)pose.velocity=pose.velocity.map(function(v,k){return v-1.2*inward*hit.normal[k];});
            var dot=/** @param {number[]} axis */function(axis){return pose.velocity.reduce(function(n,v,k){return n+v*axis[k];},0);};
            pose.ramp=[dot(pose.right),dot(pose.up),-dot(pose.back)];
            DW.flightSim.collisionChanged(combat,craft);
            if(craft===combat.player&&inward< -1)playerImpact=true;
        });});
        return playerImpact;
    }
    /** Derived target views alias cargo health; they never enter the fighter renderer or movement roster. */
    /** @type {WeakMap<import('../experiments/types').ConvoyState,import('../experiments/types').Craft[]>} */var targetViews=new WeakMap();
    /** @param {import('../experiments/types').Combat} combat */
    function targets(combat){
        const state=combat.convoy;if(!state)return [];
        var views=targetViews.get(state);
        if(!views){views=state.ships.map(function(ship,index){
            var craft=DW.flightSim.createCraft(ship.id,DW.arcade.create(0),'ally');
            craft.index=index;craft.callsign=ship.callsign;craft.convoyModel=ship.model;craft.maxShield=0;craft.shield=0;
            Object.defineProperties(craft,{hp:{get:function(){return ship.hull;},set:function(/** @type {number} */v){ship.hull=v;}},maxHp:{get:function(){return ship.maxHull;}}});return craft;
        });targetViews.set(state,views);}
        views.forEach(function(c,i){c.pose.eye=state.ships[i].position;c.pose.velocity=state.ships[i].velocity;var axes=DW.fleetGuidance.frame(state.ships[i].forward||[0,1,0]);c.pose.right=axes.right;c.pose.up=axes.up;c.pose.back=axes.back;c.collision={kind:'sphere',radiusM:hulls[c.convoyModel||'']?DW.shipHulls.hullRadius(hulls[c.convoyModel||''].model):80};});
        return views.filter(function(c,i){return c.hp>0&&(!state.evacuation||!state.ships[i].arrived);});
    }
    /** @param {import('../experiments/types').Craft} craft @param {number[]} start @param {number[]} end @param {number} [radius] */
    function hitModel(craft,start,end,radius){var h=hulls[craft.convoyModel||''];return h?DW.shipHulls.hullHit(h.model,craft.pose,start,end,U,radius):null;}
    /** @param {string} name */function model(name){const hull=hulls[name];if(!hull)throw Error('Convoy hull not loaded: '+name);return hull.model;}
    /** @param {import('../experiments/types').Combat} combat @param {string} id @param {import('../experiments/types').Weapon} weapon @param {number[]} point */
    function damage(combat,id,weapon,point){
        const state=combat.convoy;if(!state)return;
        var ship=state.ships.find(function(s){return s.id===id;});if(!ship||ship.hull<=0||state.evacuation&&ship.arrived)return;
        ship.hull=Math.max(0,ship.hull-weapon.damage*weapon.armorFactor);
        combat.flashes.push({position:point.slice(),velocity:ship.velocity.map(function(v){return v/U;}),age:0,scale:ship.hull>0?1:70,destruction:ship.hull<=0});
    }
    /** The radio channel consumes a cue only when free. Combat interrupts reports and conversation.
     * @param {import('../experiments/types').Combat} combat @param {number} dt @param {boolean} busy @returns {import('../experiments/types').Line|null} */
    function radio(combat,dt,busy){
        const s=combat.convoy;if(!s||!combat.enabled||combat.dead)return null;
        var r=s.radio;const radioShips=s.ships;
        var alive=s.ships.filter(function(ship){return ship.hull>0;}),enemies=combat.enemies.filter(function(e){return e.team==='enemy'&&e.hp>0&&!e.convoyBattle;});
        var nearFight=combat.enemies.some(function(e){return e.hp>0&&e.team==='enemy'&&e.convoyBattle&&range(e.pose.eye,combat.player.pose.eye)<1400;});
        // Observe transitions even while another transmission owns the channel.
        if(s.complete)r.phase='complete';
        else if(enemies.length||nearFight){
            if(r.phase!=='combat')r.said=r.said.filter(function(key){return key!=='nearby'&&key!=='range'&&key!=='firing';});
            if(r.phase!=='combat'&&r.chatTurn){r.chat++;r.chatTurn=0;}
            r.phase='combat';r.report=0;
        }else if(r.phase==='combat'){r.phase='damage-report';r.report=0;}
        // Count silence, not time spent speaking. Urgent facts still leave a short gap.
        if(busy&&!s.evacuation)return null;
        r.wait=Math.max(0,r.wait-dt);if(r.wait>25&&!s.evacuation)return null;
        /** @param {string} key @param {string} text @param {number} [packetIndex] */
        function cue(key,text,packetIndex){
            r.said.push(key);r.wait=28;
            var p=typeof packetIndex==='number'?packets[packetIndex]:null,index=p?p.voice:6;
            return {text:text,speaker:p?p.ship+' / Captain '+p.pilot:'CONTROL / Rook',voice:'Scout',hostile:false,seed:211+index*37,radioSeed:r.said.length*7919,
                voiceSettings:DW.flightDialogue.pilotVoice(/** @type {import('../experiments/types').Craft} */({id:p?p.id:'convoy-control-rook',index:index})),
                portraitIndex:-1,civilianPortraitIndex:p?p.portrait:undefined,craftId:p?radioShips[(packetIndex||0)*6].id:'control',event:'convoyRadio'};
        }
        /** @param {string} key @param {string} text @param {import('../experiments/types').Craft} wing */
        function fighterCue(key,text,wing){
            var reply=cue(key,text);reply.speaker=wing.callsign+' / FLIGHT';reply.craftId=wing.id;reply.portraitIndex=wing.index;reply.voiceSettings=DW.flightDialogue.pilotVoice(wing);reply.seed=reply.voiceSettings.seed;return reply;
        }
        /** @param {number} index */
        function condition(index){
            var ships=radioShips.filter(function(ship){return ship.packet===index;});
            return {damaged:ships.filter(function(ship){return ship.hull>0&&ship.hull<ship.maxHull;}).length,lost:ships.filter(function(ship){return ship.hull<=0;}).length};
        }
        if(s.evacuation){
            var story=DW.convoyAmbush.radio(combat);
            if(story&&(!busy||story.priority)){
                var line=story.wing?fighterCue(story.key,story.text,combat.enemies.find(function(c){return c.team==='ally'&&c.hp>0;})||combat.player):cue(story.key,story.text,story.civilian?0:undefined);r.wait=6;return line;
            }
            if(busy)return null;
            if(s.complete&&!r.said.includes('complete'))return cue('complete',alive.length?'Lancer, Control. '+alive.length+' transports through. You got them out.':'Lancer, Control. Convoy lost. Withdraw.');
            if(s.elapsed<32||s.complete||r.wait>0)return null;
            const battle=s.battle;
            if(battle&&battle.pending&&combat.time-battle.lastCall>=8){battle.pending=false;battle.lastCall=combat.time;const order=battle.order;if(order){r.wait=8;return cue('task-'+order.id+'-'+Math.floor(combat.time),'Lancer, Control. '+(order.kind==='intercept'?'Intercept the marked wing. Keep them off the '+order.label.toLowerCase()+'.':'Cover the transports to the marked rally.'));}}
            return null;
        }
        if(s.complete&&!r.said.includes('complete'))return cue('complete',alive.length?'Lancer, Control. '+alive.length+' transports through. Escort complete.':'Lancer, Control. Convoy lost. Withdraw.');
        if(r.phase==='complete')return null;
        const battle=s.battle;
        if(battle&&battle.pending&&combat.time-battle.lastCall>=8){
            battle.pending=false;battle.lastCall=combat.time;const order=battle.order;
            if(order)return cue('task-'+order.id+'-'+Math.floor(combat.time),'Lancer, Control. '+(order.kind==='escort'?'Cover the marked transports through the crossing. Stay close enough to intercept.':order.kind==='assist'?order.label+' needs support. Reinforce the marked position.':'Bandits threatening the '+order.label.toLowerCase()+'. Break off and intercept at the mark.'));
            return cue('screen-stable-'+Math.floor(combat.time),'Lancer, Control. Immediate screen stabilized. Resume marked patrol.');
        }
        if(r.phase==='damage-report'){
            if(r.report===0){r.report++;return cue('clear',s.battle?'Lancer, Control. Local screen clear. Flight and convoy leads, report damage.':'Lancer, Control. No further contacts. Flight and convoy leads, report damage.');}
            if(r.report===1){
                r.report++;
                const wing=combat.enemies.find(function(e){return e.team==='ally'&&e.hp>0&&!e.convoyBattle;});
                var lost=combat.enemies.filter(function(e){return e.team==='ally'&&e.hp<=0&&!e.convoyBattle;}).length;
                if(wing)return fighterCue('flight-report',(lost?lost+' fighter lost. ':'')+(wing.hp<wing.maxHp?'Hull at '+Math.ceil(wing.hp/wing.maxHp*100)+' percent.':(wing.shield||0)<(wing.maxShield||0)?'Hull intact. Shields recovering.':'No damage.')+' Remaining on station.',wing);
                return cue('flight-report','Control. No wingman response. Lancer, maintain escort.');
            }
            if(r.report===2){
                r.report++;
                var index=0;packets.forEach(function(p,i){var a=condition(i),b=condition(index);if(a.lost*10+a.damaged>b.lost*10+b.damaged)index=i;});
                var damage=condition(index),lead=radioShips[index*6];
                return lead.hull>0?cue('convoy-report',packets[index].ship+'. '+packets[index].name+' group: '+(damage.damaged||damage.lost?damage.damaged+' damaged, '+damage.lost+' lost. We are checking the holds.':'no damage reported.'),index):cue('convoy-report','Control. '+packets[index].name+' group: '+damage.damaged+' damaged, '+damage.lost+' lost.');
            }
            r.phase='cruise';
            packets.forEach(function(p,i){var key='loss-packet-'+i;if(condition(i).lost&&!r.said.includes(key))r.said.push(key);});
            return cue('report-complete','Copy. '+alive.length+' transports accounted for; '+alive.filter(function(ship){return ship.hull<ship.maxHull;}).length+' damaged, '+(radioShips.length-alive.length)+' lost. Maintain course and speed. Lancer, resume marked patrol.');
        }
        for(var ship of s.ships){
            var lossKey='loss-packet-'+ship.packet,hitKey='hit-packet-'+ship.packet;
            if(enemies.length&&ship.hull<=0&&!r.said.includes(lossKey))return cue(lossKey,'Lancer, Control. Transport lost in the '+packets[ship.packet].name.toLowerCase()+' group. Cover the remaining ships.');
            if(enemies.length&&ship.hull>0&&ship.hull<ship.maxHull*.9&&!r.said.includes(hitKey)){
                var lead=s.ships[ship.packet*6],p=packets[ship.packet];
                var distress=[
                    "Wayfarer here. We're getting hit up here. Can you get them off us?",
                    "Long Haul. They're putting holes in the cargo. Could use a hand, Lancer.",
                    'Keel to Lancer. Hits in the lower group. Request immediate cover.',
                    "Good Measure! I've got crews aboard these ships. Get those fighters away from us!",
                    "Last Light! They're on the rear group. Lancer, we need help back here!"
                ];
                return lead.hull>0?cue(hitKey,distress[ship.packet],ship.packet):cue(hitKey,'Lancer, Control. '+p.name+' group taking damage. Provide cover.');
            }
        }
        var aimed=enemies.map(function(e){var ship=s.ships.find(function(ship){return ship.id===e.targetId&&ship.hull>0&&(!s.evacuation||!ship.arrived);});return {enemy:e,ship:ship,distance:ship?Math.hypot.apply(null,ship.position.map(function(v,k){return v-e.pose.eye[k];}))*U:Infinity};});
        var shooting=aimed.find(function(a){return a.ship&&a.enemy.fire&&a.enemy.guns.fired>0;}),ranged=aimed.find(function(a){var w=DW.retailWeapons[a.enemy.weaponIndex||0];return a.ship&&a.distance<w.speed*w.lifetime;});
        if(shooting&&shooting.ship&&!r.said.includes('firing'))return cue('firing','Lancer, Control. Bandit firing on the '+packets[shooting.ship.packet].name.toLowerCase()+' group. Engage.');
        if(ranged&&ranged.ship&&!r.said.includes('range')&&!r.said.includes('firing'))return cue('range','Lancer, Control. Bandits entering weapons range of the '+packets[ranged.ship.packet].name.toLowerCase()+' group. Intercept.');
        while(s.director.events.length){
            const instruction=s.director.events.shift();if(!instruction)break;
            if(instruction.kind==='portal'&&s.arrivalPortal&&combat.time<s.arrivalPortal.closesAt)return cue('portal-'+s.arrivalPortal.opensAt,s.evacuation?'Lancer, Control. Enemy entry mouth opening on the far side of the crossing. Reinforcements incoming.':'Lancer, Control. Wormhole opening ahead of you. Enemy reinforcements incoming.');
            const group=s.raids.find(function(group){return group.id===instruction.wing;});if(!group)continue;
            if(instruction.kind==='breakthrough'&&group.phase!=='withdraw'&&group.phase!=='departed')return cue('breakthrough-'+group.id,'Lancer, Control. Bandits through the '+packets[group.packet].name.toLowerCase()+' screen. Intercept before they reach the convoy.');
            if(instruction.kind==='hold'&&group.phase==='hold'){var waiting=enemies.filter(function(e){return e.convoyRaider&&e.convoyRaider.wing===group.id;}).length;return cue('reserve-'+group.id,'Lancer, Control. '+waiting+' additional contacts holding outside the convoy. Maintain the screen.');}
            if(instruction.kind==='commit'&&group.phase!=='hold'&&group.phase!=='withdraw'&&group.phase!=='departed')return cue('commit-'+group.id,'Lancer, Control. Reserve bandits turning toward the '+packets[group.packet].name.toLowerCase()+' group. Shift to the marked intercept.');
            if(instruction.kind==='withdraw'&&(group.phase==='withdraw'||group.phase==='departed'))return cue('withdraw-'+group.id,'Lancer, Control. Bandit wing breaking off. Stay with the convoy.');
        }
        if(s.elapsed>=240&&!r.said.includes('reception'))return cue('reception',s.evacuation?'Lancer, Control. Exit mouth in sight. Cover the remaining transports until they cross.':'Lancer, Control. Reception fleet in sight. Bastion and Vigilant are holding the arrival corridor.');
        var contactReport=r.said.includes('range')||r.said.includes('firing');
        if(!s.raidStarted&&r.opening===0&&!contactReport){
            if(r.wait>0)return null;
            r.opening++;return cue('intro-control','Lancer flight, Control. Convoy should be in visual range now.');
        }
        if(!s.raidStarted&&r.opening>0&&!contactReport&&!r.said.includes('visual-reply')){
            const wing=combat.enemies.find(function(e){return e.team==='ally'&&e.hp>0&&!e.convoyBattle;});
            if(wing&&alive.some(function(ship){return Math.hypot.apply(null,ship.position.map(function(v,k){return v-wing.pose.eye[k];}))*U<2000;})){
                return fighterCue('visual-reply','Affirmative, Control. Convoy in sight.',wing);
            }
        }
        if(!s.raidStarted&&r.said.includes('visual-reply')&&!contactReport&&!r.said.includes('welcome')&&s.ships[0].hull>0){r.phase='cruise';return cue('welcome','Lancer, Wayfarer. Glad to have you with us.',0);}
        if(enemies.length&&!r.said.includes('nearby')&&!contactReport){var assignment=s.director.waypoint,packetName=assignment?packets[assignment.packet].name.toLowerCase():'rear';const contact=enemies.find(function(e){return assignment&&e.id===assignment.targetId;});var count=contact&&contact.convoyRaider?enemies.filter(function(e){return e.convoyRaider&&contact.convoyRaider&&e.convoyRaider.wing===contact.convoyRaider.wing;}).length:enemies.length;return cue('nearby','Lancer, Control. '+count+' bandits in one group, approaching the '+packetName+' group. Proceed to the marked intercept.');}
        // Do not deliver an arrival briefing after the engagement has already begun.
        if(contactReport&&r.opening===0)r.opening=1;
        if(!s.raidStarted||enemies.length||nearFight||s.battle&&s.battle.order||r.phase!=='cruise')return null;
        /** @type {{speakers:number[];lines:string[]}[]} */var conversations=[
            {speakers:[1,0],lines:["Wayfarer, you know if the dockside diner still does breakfast all shift?","If you're buying, I'm willing to find out."]},
            {speakers:[4,1],lines:["Long Haul, is that rattle yours or mine?","Mine. If it stops, then we worry."]},
            {speakers:[3,2],lines:["Keel, remind me to stop taking jobs marked 'routine delivery.'","You said that on the last one, Good Measure."]}
        ];
        while(r.chat<conversations.length){
            var conversation=conversations[r.chat];
            if(conversation.speakers.some(function(i){return radioShips[i*6].hull<=0;})){r.chat++;r.chatTurn=0;continue;}
            if(!r.chatTurn&&r.wait>0)return null;
            var turn=r.chatTurn,chat=r.chat,line=cue('chat-'+chat+'-'+turn,conversation.lines[turn],conversation.speakers[turn]);
            if(turn){r.chat++;r.chatTurn=0;}else r.chatTurn=1;
            return line;
        }
        return null;
    }
    DW.convoyMission={openReinforcementPortal:openReinforcementPortal,arrivalFleet:arrivalFleet,stepRaider:stepRaider,radio:radio,packets:packets,hitModel:hitModel,targets:targets,model:model,damage:damage,installCollision:installCollision,trace:trace,collide:collide,start:start,step:step,stepWing:stepWing,WING_SIZE:WING_SIZE};
}());
