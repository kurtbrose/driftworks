(function(){
    'use strict';
    var DW=/** @type {Required<import('./types').DriftworksNamespace>} */(window.Driftworks),U=DW.sim.METERS_PER_UNIT;
    /** @typedef {import('../experiments/types').Combat} Combat */
    /** @typedef {import('../experiments/types').ConvoyBattleOrder} Order */
    var layout=[{name:'Port screen',offset:[-1800,2100,400],packet:1,count:15},{name:'Starboard screen',offset:[1800,2700,-350],packet:3,count:15},{name:'Forward screen',offset:[-700,4200,800],packet:0,count:12},{name:'Rear picket',offset:[0,-2400,-650],packet:4,count:12}];
    /** @param {number[]} a @param {number[]} b */function range(a,b){return Math.hypot.apply(null,a.map(function(v,k){return v-b[k];}))*U;}
    /** @param {import('../experiments/types').FlightState} pose @param {number[]} direction */
    function face(pose,direction){var length=Math.hypot.apply(null,direction),f=direction.map(function(v){return v/length;}),h=Math.hypot(f[0],f[1]);pose.right=[f[1]/h,-f[0]/h,0];pose.up=[pose.right[1]*f[2],-pose.right[0]*f[2],pose.right[0]*f[1]-pose.right[1]*f[0]];pose.back=f.map(function(v){return -v;});pose.velocity=f.map(function(v){return v*50;});pose.ramp=[0,0,50];pose.throttle=.8;}
    /** Real opposing screens exist from launch; no index-proportional AI startup delay.
     * @param {Combat} combat */
    function start(combat){
        const s=combat.convoy;if(!s)return;
        s.battle={fronts:layout.map(function(def,i){return {id:i,name:def.name,offset:def.offset.slice(),center:[def.offset[0]/U,def.offset[1]/U,1200+def.offset[2]/U],packet:def.packet,radiusM:1100,allies:def.count,enemies:def.count,alliedHull:1,released:false};}),nextAssessment:0,nextDispatch:0,order:null,pending:false,lastCall:-100};
        var serial=0;
        s.battle.fronts.forEach(function(front){var count=layout[front.id].count;
            for(var side=0;side<2;side++)for(var i=0;i<count;i++){
                var wing=Math.floor(i/3),slot=i%3,pose=DW.arcade.create(0),sign=side?1:-1;
                pose.eye=front.center.map(function(v,k){return v+(k===0?sign*(350+slot*65):k===1?(wing-(count/3-1)/2)*170:(slot-1)*90+(wing%2?100:-100))/U;});face(pose,[-sign,0,.05*(slot-1)]);
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
        b.fronts.forEach(function(front){front.center[1]=(front.offset[1]+s.elapsed*s.speedMps)/U;});
        combat.enemies.forEach(function(c){if(c.convoyBattle&&c.battleZone){var front=b.fronts[c.convoyBattle.front];for(var k=0;k<3;k++)c.battleZone.center[k]=front.center[k];}});
        if(combat.time<b.nextAssessment)return;b.nextAssessment=combat.time+.5;
        b.fronts.forEach(function(front){
            var members=combat.enemies.filter(function(c){return c.hp>0&&c.convoyBattle&&c.convoyBattle.front===front.id;}),allies=members.filter(function(c){return c.team==='ally';}),enemies=members.filter(function(c){return c.team==='enemy';});
            front.allies=allies.length;front.enemies=enemies.length;front.alliedHull=allies.length?allies.reduce(function(n,c){return n+c.hp/c.maxHp;},0)/allies.length:0;
            if(!front.released&&s.elapsed>=60&&s.elapsed<230&&enemies.length>=3&&enemies.length-allies.length>=4){
                var lead=enemies[0],wing=lead.convoyBattle&&lead.convoyBattle.wing,breaking=enemies.filter(function(c){return c.convoyBattle&&c.convoyBattle.wing===wing;}).slice(0,3);if(breaking.length<3)return;
                var id=s.raids.length;const cargo=s.ships.find(function(ship){return ship.packet===front.packet&&ship.hull>0;});if(!cargo)return;
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
            var members=combat.enemies.filter(function(e){return e.hp>0&&e.convoyRaider&&e.convoyRaider.wing===group.id;}),cargo=s.ships.filter(function(ship){return ship.hull>0;});if(!members.length||!cargo.length)return;
            var focus=members[0],ship=cargo[0],distance=Infinity;
            members.forEach(function(e){cargo.forEach(function(c){var d=range(e.pose.eye,c.position);if(d<distance){distance=d;focus=e;ship=c;}});});
            var weapon=DW.retailWeapons[focus.weaponIndex||0],firing=members.some(function(e){return e.fire&&e.guns.fired>0&&cargo.some(function(c){return c.id===e.targetId;});});
            var priority=(firing?650:distance<weapon.speed*weapon.lifetime?500:distance<1800?360:250)+(1-ship.hull/ship.maxHull)*80-range(combat.player.pose.eye,focus.pose.eye)*.003;
            list.push({id:'raid-'+group.id,kind:'intercept',front:null,packet:ship.packet,targetId:focus.id,position:ship.position.map(function(v,k){return v+(focus.pose.eye[k]-v)*.6+ship.velocity[k]*8/U;}),label:DW.convoyMission.packets[ship.packet].name+' group',priority:priority,since:combat.time});
        });
        b.fronts.forEach(function(front){var deficit=front.enemies-front.allies;
            if(!front.enemies||!(deficit>=2||front.alliedHull<.65))return;
            var target=combat.enemies.find(function(e){return e.hp>0&&e.team==='enemy'&&e.convoyBattle&&e.convoyBattle.front===front.id;});if(!target)return;
            var priority=Math.min(220,80+Math.max(0,deficit)*18+(1-front.alliedHull)*45)-range(combat.player.pose.eye,front.center)*.002;
            list.push({id:'front-'+front.id,kind:'assist',front:front.id,packet:front.packet,targetId:target.id,position:front.center.slice(),label:front.name,priority:priority,since:combat.time});
        });return list.sort(function(a,b){return b.priority-a.priority||a.id.localeCompare(b.id);});
    }
    /** Bounded dispatch with urgency preemption and assignment hysteresis; never changes the player's target.
     * @param {Combat} combat */
    function dispatch(combat){
        const s=combat.convoy,b=s&&s.battle;if(!s||!b)return;
        if(combat.time>=b.nextDispatch){b.nextDispatch=combat.time+.5;
            if(s.elapsed>=25){
                var choices=tasks(combat),best=choices[0];const old=b.order;var current=old&&choices.find(function(c){return c.id===old.id;});
                if(old&&current&&best&&best.id!==old.id&&best.priority<500&&(combat.time-old.since<18||best.priority<current.priority+55))best=current;
                if(best){best.since=old&&old.id===best.id?old.since:combat.time;if(!old||old.id!==best.id)b.pending=true;b.order=best;}
                else {if(old)b.pending=true;b.order=null;}
            }
        }
        if(b.order){const order=b.order;s.director.waypoint={kind:order.kind,front:order.front,label:order.label,packet:order.packet,position:order.position.slice(),targetId:order.targetId};}
    }
    DW.convoyBattle={start:start,update:update,dispatch:dispatch,tasks:tasks};
}());
