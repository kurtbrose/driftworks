(function(){
    'use strict';
    var DW=/** @type {Required<import('./types').DriftworksNamespace>} */(window.Driftworks),U=DW.sim.METERS_PER_UNIT;
    /** @typedef {import('../experiments/types').Combat} Combat */
    /** @typedef {import('../experiments/types').ConvoyBattleOrder} Order */
    var layout=[{name:'Port screen',offset:[-1800,2100,400],packet:1,count:3},{name:'Starboard screen',offset:[1800,2700,-350],packet:3,count:3},{name:'Forward screen',offset:[-700,4200,800],packet:0,count:3},{name:'Rear picket',offset:[0,-2400,-650],packet:4,count:3}];
    /** @param {number[]} a @param {number[]} b */function range(a,b){return Math.hypot.apply(null,a.map(function(v,k){return v-b[k];}))*U;}
    /** @param {import('../experiments/types').FlightState} pose @param {number[]} direction */
    function face(pose,direction){var length=Math.hypot.apply(null,direction),f=direction.map(function(v){return v/length;}),h=Math.hypot(f[0],f[1]);pose.right=[f[1]/h,-f[0]/h,0];pose.up=[pose.right[1]*f[2],-pose.right[0]*f[2],pose.right[0]*f[1]-pose.right[1]*f[0]];pose.back=f.map(function(v){return -v;});pose.velocity=f.map(function(v){return v*50;});pose.ramp=[0,0,50];pose.throttle=.8;}
    /** Real opposing screens exist from launch; no index-proportional AI startup delay.
     * @param {Combat} combat */
    function start(combat){
        const s=combat.convoy;if(!s)return;
        var fronts=combat.mode==='fleet-evacuation'?layout.slice(0,3):layout;
        s.battle={fronts:fronts.map(function(def,i){return {id:i,name:def.name,offset:def.offset.slice(),center:[def.offset[0]/U,def.offset[1]/U,1200+def.offset[2]/U],packet:def.packet,radiusM:1100,allies:def.count,enemies:def.count,alliedHull:1,released:false};}),nextAssessment:0,nextDispatch:0,order:null,pending:false,lastCall:-100};
        var serial=0;
        s.battle.fronts.forEach(function(front){var count=layout[front.id].count;
            for(var side=0;side<2;side++)for(var i=0;i<count;i++){
                var wing=Math.floor(i/3),slot=i%3,pose=DW.arcade.create(0),sign=side?1:-1;
                pose.eye=front.center.map(function(v,k){return v+(k===0?sign*(900+slot*60):k===1?(slot-1)*120:(slot-1)*90+(wing%2?100:-100))/U;});face(pose,[-sign,0,.05*(slot-1)]);
                var craft=DW.flightSim.createCraft('screen-'+front.id+'-'+side+'-'+i,pose,side?'enemy':'ally');craft.index=2+serial++;craft.callsign=(side?'Bandit ':'Screen ')+front.id+'-'+(i+1);craft.controller='ai';craft.skill=1+(i%5===0?1:0);craft.pilot=craft.skill===2?'Ace':'Veteran';craft.opponentStyle='fso-breaker';craft.mode='approach';craft.decision=(i%7)*.04;craft.retarget=(i%3)*.1;
                craft.convoyBattle={front:front.id,wing:wing,slot:slot};craft.battleZone={id:front.id,center:front.center.slice(),radiusM:front.radiusM};
                DW.flightSim.equip(craft,DW.arcade.profiles[i%3],DW.flightSim.defaultWeapon(DW.arcade.profiles[i%3]));
                if(combat.useHullModels)craft.collision={kind:'model',modelId:DW.shipPackModels.craftModel(craft,combat.hullModels?combat.hullModels[craft.team==='ally'?'ally':'enemy']:'mixed',combat.wave).id};combat.enemies.push(craft);
            }
        });DW.flightSim.collisionChanged(combat);
    }
    /** Move zone goals, not actors. Loss of a real friendly screen can release an existing enemy wing.
     * @param {Combat} combat */
    function update(combat){
        const s=combat.convoy,b=s&&s.battle;if(!s||!b)return;
        b.fronts.forEach(function(front){front.center=front.offset.map(function(v,k){return (v+(s.navigation?s.navigation.anchor[k]:[0,s.elapsed*s.speedMps,1200*U][k]))/U;});});
        combat.enemies.forEach(function(c){if(c.convoyBattle&&c.battleZone){var front=b.fronts[c.convoyBattle.front];for(var k=0;k<3;k++)c.battleZone.center[k]=front.center[k];}});
        if(combat.time<b.nextAssessment)return;b.nextAssessment=combat.time+.5;
        b.fronts.forEach(function(front){
            var members=combat.enemies.filter(function(c){return c.hp>0&&c.convoyBattle&&c.convoyBattle.front===front.id;}),allies=members.filter(function(c){return c.team==='ally';}),enemies=members.filter(function(c){return c.team==='enemy';});
            front.allies=allies.length;front.enemies=enemies.length;front.alliedHull=allies.length?allies.reduce(function(n,c){return n+c.hp/c.maxHp;},0)/allies.length:0;
            if(!front.released&&s.elapsed>=60&&s.elapsed<230&&enemies.length>=3&&enemies.length-allies.length>=2){
                var lead=enemies[0],wing=lead.convoyBattle&&lead.convoyBattle.wing,breaking=enemies.filter(function(c){return c.convoyBattle&&c.convoyBattle.wing===wing;}).slice(0,3);if(breaking.length<3)return;
                var id=s.raids.length;const cargo=s.ships.find(function(ship){return ship.packet===front.packet&&ship.hull>0&&(!s.evacuation||!ship.arrived);});if(!cargo)return;
                s.raids.push({id:id,phase:'approach',leaderId:lead.id,until:0,offset:front.offset.slice(),packet:front.packet,createdAt:combat.time,committedAt:combat.time,passes:0});
                breaking.forEach(function(c,i){delete c.convoyBattle;delete c.battleZone;c.convoyRaider={wing:id,slot:i,role:i===2?'cover':'strike',cargoId:cargo.id,stage:'form',holdUntil:0,runAt:-1,fired:c.guns.fired};c.targetId=cargo.id;c.retarget=.75;c.decision=0;});front.released=true;s.raidStarted=true;s.director.events.push({wing:id,kind:'breakthrough'});DW.flightSim.collisionChanged(combat);
            }
        });
    }
    /** @param {Combat} combat @returns {Order[]} */
    function tasks(combat){
        const s=combat.convoy,b=s&&s.battle;if(!s||!b)return [];
        /** @type {Order[]} */var list=[];
        s.raids.forEach(function(group){if(group.phase==='hold'||group.phase==='withdraw'||group.phase==='departed')return;
            var members=combat.enemies.filter(function(e){return e.hp>0&&e.convoyRaider&&e.convoyRaider.wing===group.id;}),cargo=s.ships.filter(function(ship){return ship.hull>0&&(!s.evacuation||!ship.arrived);});if(!members.length||!cargo.length)return;
            var focus=members[0],ship=cargo[0],distance=Infinity;
            members.forEach(function(e){cargo.forEach(function(c){var d=range(e.pose.eye,c.position);if(d<distance){distance=d;focus=e;ship=c;}});});
            var weapon=DW.retailWeapons[focus.weaponIndex||0],firing=members.some(function(e){return e.fire&&e.guns.fired>0&&cargo.some(function(c){return c.id===e.targetId;});});
            var priority=(firing?650:distance<weapon.speed*weapon.lifetime?500:distance<1800?360:250)+(1-ship.hull/ship.maxHull)*80-range(combat.player.pose.eye,focus.pose.eye)*.003;
            list.push({id:'raid-'+group.id,kind:'intercept',front:null,packet:ship.packet,targetId:focus.id,position:ship.position.map(function(v,k){return v+(focus.pose.eye[k]-v)*.6+ship.velocity[k]*8/U;}),label:DW.convoyMission.packets[ship.packet].name+' group',priority:priority,since:combat.time});
        });
        b.fronts.forEach(function(front){var deficit=front.enemies-front.allies;
            if(!front.enemies||!(deficit>=2||front.alliedHull<.65))return;
            if(s.evacuation&&!combat.enemies.some(function(c){return c.hp>0&&c.team==='ally'&&c.convoyBattle&&c.convoyBattle.front===front.id&&c.mode!=='withdraw'&&c.mode!=='departed';}))return;
            var target=combat.enemies.find(function(e){return e.hp>0&&e.team==='enemy'&&e.convoyBattle&&e.convoyBattle.front===front.id;});if(!target)return;
            var priority=Math.min(220,80+Math.max(0,deficit)*18+(1-front.alliedHull)*45)-range(combat.player.pose.eye,front.center)*.002;
            list.push({id:'front-'+front.id,kind:'assist',front:front.id,packet:front.packet,targetId:target.id,position:front.center.slice(),label:front.name,priority:priority,since:combat.time});
        });
        if(s.evacuation){
            var cargo=s.ships.filter(function(ship){return ship.hull>0&&!ship.arrived;}),ship=cargo[0];
            if(ship)list.push({id:'crossing-cover',kind:'escort',front:null,packet:ship.packet,targetId:ship.id,position:ship.position.map(function(v,k){return v+([0,-350,220][k])/U;}),label:s.evacuation.phase==='withdrawal'?'Final transports':'Evacuation crossing',priority:20,since:combat.time});
        }
        return list.sort(function(a,b){return b.priority-a.priority||a.id.localeCompare(b.id);});
    }
    /** Resolve live assignment members, including survivors after the original focus dies.
     * Derived views only: orders keep IDs rather than craft references.
     * @param {Combat} combat @returns {import('../experiments/types').Craft[]} */
    function assignmentTargets(combat){
        const s=combat.convoy;if(!s||s.complete)return [];
        const order=s.battle&&s.battle.order,waypoint=order||s.director.waypoint;
        if(!waypoint||waypoint.kind!=='intercept'&&waypoint.kind!=='assist')return [];
        var focus=combat.enemies.find(function(c){return c.id===waypoint.targetId;});
        var raid=order?s.raids.find(function(group){return order.id==='raid-'+group.id;}):undefined;
        if(!raid&&focus&&focus.convoyRaider){const wing=focus.convoyRaider.wing;raid=s.raids.find(function(group){return group.id===wing;});}
        if(raid&&['hold','withdraw','departed'].includes(raid.phase))return [];
        const group=raid;
        return combat.enemies.filter(function(c){
            if(c.hp<=0||c.team!=='enemy'||c.mode==='withdraw'||c.mode==='departed')return false;
            if(group)return !!c.convoyRaider&&c.convoyRaider.wing===group.id;
            if(waypoint.kind==='assist'&&typeof waypoint.front==='number')return !!c.convoyBattle&&c.convoyBattle.front===waypoint.front;
            return c.id===waypoint.targetId;
        });
    }
    /** Bounded dispatch with urgency preemption and assignment hysteresis; never changes the player's target.
     * @param {Combat} combat */
    function dispatch(combat){
        const s=combat.convoy,b=s&&s.battle;if(!s||!b)return;
        if(combat.time>=b.nextDispatch){b.nextDispatch=combat.time+.5;
            if(s.elapsed>=(s.evacuation?5:25)){
                var choices=tasks(combat),best=choices[0];const old=b.order;var current=old&&choices.find(function(c){return c.id===old.id;});
                if(old&&current&&best&&best.id!==old.id&&best.priority<500&&(combat.time-old.since<18||best.priority<current.priority+55))best=current;
                if(best){best.since=old&&old.id===best.id?old.since:combat.time;if(!old||old.id!==best.id)b.pending=true;b.order=best;}
                else {if(old)b.pending=true;b.order=null;}
            }
        }
        if(b.order){const order=b.order;s.director.waypoint={kind:order.kind,front:order.front,label:order.label,packet:order.packet,position:order.position.slice(),targetId:order.targetId};}
    }
    /** Battle plan uses SI velocities and scene-unit positions, shared by headless and browser.
     * @returns {import('../experiments/types').EvacuationCapital[]} */
    function capitals(){return [
        {id:'evac-bastion',callsign:'Bastion',team:'ally',position:[-1800/U,1700/U,1200+200/U],heading:-Math.PI/2,velocity:[0,0,0],integrity:20000,mainBatteryClear:true},
        {id:'evac-harrow',callsign:'Harrow',team:'enemy',position:[1900/U,3300/U,1200+650/U],heading:Math.PI/2,velocity:[0,0,0],integrity:20000,mainBatteryClear:true}
    ];}
    /** @param {Combat} combat */
    function startEvacuation(combat){
        const s=combat.convoy;if(!s)return;
        s.evacuation={phase:'crossing',withdrawalAt:null,capitals:capitals(),nextWaveAt:45,waves:0,reserves:9,
            entry:[3000/U,4000/U,1200+650/U],exit:{position:[0,7500/U,1200],opensAt:-3,closesAt:1000000,spawned:true}};
        s.arrivalFleet=s.evacuation.capitals;
        // The battle briefing replaces the convoy rendezvous exchange.
        s.radio.opening=2;s.radio.said.push('intro-control','visual-reply','welcome');
    }
    /** Advance towards tactical stations; damaged capitals fall back, never orbit forever.
     * @param {Combat} combat @param {number} dt */
    function updateEvacuation(combat,dt){
        const s=combat.convoy,e=s&&s.evacuation;if(!s||!e)return;
        var count=combat.enemies.length;combat.enemies=combat.enemies.filter(function(c){return c.mode!=='departed';});if(count!==combat.enemies.length)DW.flightSim.collisionChanged(combat);
        if(e.withdrawalAt===null&&(s.elapsed>=210||e.capitals[0].integrity<=0))e.withdrawalAt=s.elapsed;
        e.phase=s.complete?'complete':e.withdrawalAt!==null?'withdrawal':s.elapsed>=90?'pressure':'crossing';
        var anchor=s.navigation?s.navigation.anchor[1]:s.elapsed*s.speedMps;
        e.capitals.forEach(function(ship,i){
            var retreat=e.phase==='withdrawal'||ship.integrity<7000;
            var goal=[i?1900:-1800,i?(retreat?anchor+3500:anchor+2300):(retreat?Math.min(8700,anchor+1600):anchor+1100),1200*U+(i?650:200)];
            var delta=goal.map(function(v,k){return v-ship.position[k]*U;}),distance=Math.hypot.apply(null,delta),speed=Math.min(retreat?38:30,distance/4);
            ship.velocity=delta.map(function(v){return ship.integrity>0&&distance>1?v/distance*speed:0;});
            ship.position.forEach(function(v,k){ship.position[k]=v+ship.velocity[k]*dt/U;});
        });
        // Individual arrivals leave the active scene. Pursuers cannot hold the outcome hostage.
        var arrived=0;s.ships.forEach(function(ship){if(ship.hull>0&&!ship.arrived&&ship.position[1]>=s.destinationY){ship.arrived=true;ship.velocity=[0,0,0];arrived++;}});
        if(arrived)DW.flightSim.collisionChanged(combat);
        if(s.ships.every(function(ship){return ship.hull<=0||ship.arrived;})){s.complete=true;e.phase='complete';s.director.waypoint=null;if(s.battle)s.battle.order=null;return;}
        // Finite, announced three-ship packets. Never accumulate more than two active raid wings.
        var attackers=combat.enemies.filter(function(c){return c.hp>0&&c.convoyRaider&&s.raids.some(function(r){return !!c.convoyRaider&&r.id===c.convoyRaider.wing&&r.phase!=='departed'&&r.phase!=='withdraw';});});
        if(e.reserves>0&&s.elapsed>=e.nextWaveAt&&s.elapsed<235&&attackers.length<=3&&(!s.arrivalPortal||combat.time>=s.arrivalPortal.closesAt)){
            s.arrivalPortal={position:e.entry.slice(),opensAt:combat.time,closesAt:combat.time+14,spawned:false};
            e.reserves-=3;e.waves++;e.nextWaveAt=s.elapsed+65;s.director.events.push({wing:-1,kind:'portal'});
        }
        // Screens advance with the crossing, then fall back to cover the final extraction.
        if(s.battle)s.battle.fronts.forEach(function(front){front.offset[1]=layout[front.id].offset[1]+(e.phase==='withdrawal'?-1200:0);});
    }
    /** Depleted screens and relieved wings leave through ordinary flight physics.
     * @param {Combat} combat @param {import('../experiments/types').Craft} craft @param {number} dt */
    function stepEvacuationWing(combat,craft,dt){
        const s=combat.convoy,e=s&&s.evacuation,wing=craft.convoyBattle;if(!s||!e||!wing)return false;
        var members=combat.enemies.filter(function(c){return c.hp>0&&c.team===craft.team&&c.convoyBattle&&c.convoyBattle.front===wing.front;});
        var damaged=members.reduce(function(n,c){return n+c.hp/c.maxHp;},0)<members.length*.45;
        var opposition=combat.enemies.some(function(c){return c.hp>0&&c.team!==craft.team&&c.convoyBattle&&c.convoyBattle.front===wing.front;});
        if(craft.mode!=='withdraw'&&!damaged&&opposition&&!(e.withdrawalAt!==null&&s.elapsed>=e.withdrawalAt+wing.front*15))return false;
        craft.mode='withdraw';craft.targetId=null;craft.fire=false;craft.retarget=.75;
        var goal=craft.team==='ally'?[(-1800+wing.front*120)/U,8700/U,1200+300/U]:e.entry.map(function(v,k){return v+(k===1?2500/U:0);});
        DW.flightSim.stepInput(craft,Object.assign({},DW.flightSim.steer(craft.pose,goal),{throttle:1,throttleRate:0,fire:false,boost:true}),dt);
        if(range(craft.pose.eye,goal)<300&&!craft.guns.bolts.length)craft.mode='departed';
        return true;
    }
    DW.convoyBattle={start:start,update:update,dispatch:dispatch,tasks:tasks,assignmentTargets:assignmentTargets,capitals:capitals,startEvacuation:startEvacuation,updateEvacuation:updateEvacuation,stepEvacuationWing:stepEvacuationWing};
}());
