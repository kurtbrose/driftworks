(function(){
    'use strict';
    var DW=/** @type {Required<import('./types').DriftworksNamespace>} */(window.Driftworks),U=DW.sim.METERS_PER_UNIT;
    var WING_SIZE=3,FIRST_CONTACT_SECONDS=60;
    // Packet centres in metres. Local slots remain orderly without shared road-like rows.
    var packets=[
        {name:'Upper',center:[-100,210,175],ship:'Wayfarer',pilot:'Mara Vale',id:'mara-vale',portrait:0,voice:1},
        {name:'Port',center:[-275,10,5],ship:'Long Haul',pilot:'Daniel Okafor',id:'daniel-okafor',portrait:1,voice:0},
        {name:'Lower',center:[55,120,-170],ship:'Keel',pilot:'Elena Park',id:'elena-park',portrait:2,voice:3},
        {name:'Starboard',center:[270,190,50],ship:'Good Measure',pilot:'Ines Duarte',id:'ines-duarte',portrait:4,voice:5},
        {name:'Rear',center:[0,-310,-20],ship:'Last Light',pilot:'Thomas Reed',id:'thomas-reed',portrait:5,voice:4}
    ];
    /** @param {import('../experiments/types').Combat} combat @param {import('../experiments/types').FlightState} player */
    function start(combat,player){
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
        combat.convoy={elapsed:0,speedMps:25,destinationY:7500/U,complete:false,raidStarted:false,radio:{wait:1,opening:0,said:[],phase:'arrival',report:0,chat:0,chatTurn:0},ships:Array.from({length:30},function(/** @type {unknown} */unused,i){
            var packet=packets[Math.floor(i/6)],local=i%6,row=Math.floor(local/2),side=local%2?1:-1;
            var slot=[(packet.center[0]+side*48+(row-1)*11)/U,(packet.center[1]+(1-row)*125+(side>0?-35:25))/U,1200+(packet.center[2]+side*32+[ -12,8,4 ][row])/U];
            return {id:'cargo-'+String(i+1).padStart(2,'0'),packet:Math.floor(i/6),callsign:local===0?packet.ship:packet.name+' '+String(local+1).padStart(2,'0'),model:['container','mixed','fluid'][i%3],slot:slot.slice(),position:slot.slice(),velocity:[0,25,0],hull:5000,maxHull:5000,arrived:false};
        })};
        targets(combat);
        combat.targetId=null;combat.roundOver=false;
    }
    /** Spawn the first approach relative to the moving convoy, after the quiet escort leg.
     * @param {import('../experiments/types').Combat} combat */
    function beginRaid(combat){
        const s=combat.convoy;if(!s||s.raidStarted)return;
        var survivors=s.ships.filter(function(ship){return ship.hull>0;});if(!survivors.length)return;
        s.raidStarted=true;
        var objective=survivors[24%survivors.length],origin=objective.position.map(function(v,k){return v+[2600,-1000,500][k]/U;});
        s.raid={phase:'approach',leaderId:'convoy-raider-1',until:0};
        for(var j=0;j<3;j++){
            var target=survivors[(24+j)%survivors.length],pose=DW.arcade.create(0);
            var delta=objective.position.map(function(v,k){return v-origin[k];}),length=Math.hypot.apply(null,delta),forward=delta.map(function(v){return v/length;});
            var horizontal=Math.hypot(forward[0],forward[1]);pose.right=[forward[1]/horizontal,-forward[0]/horizontal,0];pose.up=[pose.right[1]*forward[2],-pose.right[0]*forward[2],pose.right[0]*forward[1]-pose.right[1]*forward[0]];pose.back=forward.map(function(v){return -v;});
            pose.eye=origin.map(function(v,k){return v+(j?pose.right[k]*(j===1?-130:130)+pose.back[k]*180+pose.up[k]*(j===1?40:-40):0)/U;});
            pose.velocity=forward.map(function(v){return v*60;});pose.ramp=[0,0,60];pose.throttle=.85;
            var raider=DW.flightSim.createCraft('convoy-raider-'+(j+1),pose,'enemy');
            raider.index=2+j;raider.callsign='Raider '+(j+1);raider.controller='ai';raider.skill=1;raider.pilot='Veteran';raider.mode='approach';raider.opponentStyle='fso-breaker';
            DW.flightSim.equip(raider,DW.arcade.profiles[0],DW.flightSim.defaultWeapon(DW.arcade.profiles[0]));
            raider.convoyRaider={slot:j,role:j===2?'cover':'strike',cargoId:target.id,stage:'form',holdUntil:0,runAt:-1,fired:0};
            raider.goal=target.position.slice();raider.targetId=j===2?null:target.id;raider.retarget=.75;
            if(combat.useHullModels)raider.collision={kind:'model',modelId:DW.shipPackModels.craftModel(raider,combat.hullModels?combat.hullModels.enemy:'mixed',combat.wave).id};
            combat.enemies.push(raider);
        }
        if(!combat.targetLocked)combat.targetId='convoy-raider-1';
        DW.flightSim.collisionChanged(combat);
    }
    /** @param {import('../experiments/types').Combat} combat @param {number} dt */
    function step(combat,dt){
        const s=combat.convoy;if(!s||combat.dead||s.complete)return;
        s.elapsed=Math.min(s.destinationY*U/s.speedMps,s.elapsed+dt+1e-12);
        s.ships.forEach(function(ship){
            if(ship.hull<=0||ship.arrived)return;
            ship.position[1]=ship.slot[1]+Math.min(s.destinationY,s.elapsed*s.speedMps/U);
            if(ship.position[1]>=s.destinationY+ship.slot[1]){ship.arrived=true;ship.velocity=[0,0,0];}
        });
        if(!s.raidStarted&&s.elapsed>=FIRST_CONTACT_SECONDS)beginRaid(combat);
        updateRaid(combat);
        s.complete=!s.ships.some(function(ship){return ship.hull>0;})||(s.raidStarted&&s.ships.every(function(ship){return ship.arrived||ship.hull<=0;})&&!combat.enemies.some(function(e){return e.team==='enemy'&&e.hp>0;}));
    }
    /** @param {number[]} a @param {number[]} b */
    function range(a,b){return Math.hypot.apply(null,a.map(function(v,k){return v-b[k];}))*U;}
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
        const s=combat.convoy;if(!s||!s.raid)return;
        const raid=s.raid,members=combat.enemies.filter(function(e){return e.convoyRaider&&e.hp>0;});if(!members.length)return;
        var leader=members.find(function(e){return e.id===raid.leaderId;})||members[0];raid.leaderId=leader.id;
        if(!members.some(function(e){return e.convoyRaider&&e.convoyRaider.role==='strike';})&&leader.convoyRaider)leader.convoyRaider.role='strike';
        const cargo=s.ships.find(function(ship){return ship.id===(leader.convoyRaider&&leader.convoyRaider.cargoId)&&ship.hull>0;})||s.ships.find(function(ship){return ship.hull>0;});if(!cargo)return;
        if(raid.phase==='approach'&&(range(leader.pose.eye,cargo.position)<1400||members.some(function(e){return !!threat(combat,e)||combat.time-e.damagedAt<1.5;}))) {raid.phase='engage';raid.until=combat.time+24;}
        if(raid.phase==='engage'&&(combat.time>=raid.until||members.filter(function(e){return e.convoyRaider&&e.convoyRaider.role==='strike';}).every(function(e){return e.convoyRaider&&e.convoyRaider.stage==='extend';}))){raid.phase='regroup';raid.until=combat.time+20;}
        if(raid.phase==='regroup'){
            var rally=cargo.position.map(function(v,k){return v+[1700,-850,600][k]/U;});
            if(combat.time>=raid.until||members.every(function(e){return range(e.pose.eye,rally)<350;})){
                raid.phase='approach';members.forEach(function(e){if(e.convoyRaider){e.convoyRaider.stage='form';e.convoyRaider.runAt=-1;e.convoyRaider.fired=e.guns.fired;}});
            }
        }
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
        const s=combat.convoy,r=craft.convoyRaider;if(!s||!s.raid||!r)return false;
        const raid=s.raid,members=combat.enemies.filter(function(e){return e.convoyRaider&&e.hp>0;});
        var leader=members.find(function(e){return e.id===raid.leaderId;})||craft;
        const cargo=s.ships.find(function(ship){return ship.id===r.cargoId&&ship.hull>0;})||s.ships.find(function(ship){return ship.hull>0;});if(!cargo)return false;r.cargoId=cargo.id;
        if(raid.phase==='approach'){
            craft.mode='approach';r.stage='form';craft.targetId=r.role==='strike'?cargo.id:null;craft.retarget=.75;
            var slot=members.indexOf(craft),aim=cargo.position.map(function(v,k){return v+cargo.velocity[k]*2/U;}),speed=craft.profile.maxVelocity[2]*.9;
            if(craft!==leader){
                var station=leader.pose.eye.map(function(v,k){return v+(leader.pose.right[k]*(slot===1?-130:130)+leader.pose.back[k]*180+leader.pose.up[k]*(slot===1?40:-40))/U;});
                var error=station.map(function(v,k){return (v-craft.pose.eye[k])*U;});
                speed=Math.hypot.apply(null,leader.pose.velocity)-error.reduce(function(n,v,k){return n+v*craft.pose.back[k];},0)*.25;
                aim=station.map(function(v,k){return v+leader.pose.velocity[k]*2/U;});
            }
            flyRaider(craft,aim,speed,craft!==leader&&range(craft.pose.eye,aim)>450,dt);return true;
        }
        if(raid.phase==='regroup'||r.stage==='extend'){
            craft.mode='regroup';r.stage='extend';craft.targetId=null;craft.retarget=.75;
            var rally=cargo.position.map(function(v,k){return v+([1700,-850,600][k]+(k===1?r.slot*140:k===2?(r.slot-1)*100:0))/U;});
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
     * @param {import('../experiments/types').Craft} craft @param {import('../experiments/types').FlightState} player @param {number} index @param {number} dt */
    function stepWing(craft,player,index,dt){
        var goal=player.eye.map(function(v,k){return v+(player.right[k]*(index?90:-90)+player.back[k]*80+player.velocity[k]*1.5)/U;});
        var delta=goal.map(function(v,k){return (v-craft.pose.eye[k])*U;}),distance=Math.hypot.apply(null,delta);
        var demand=DW.flightSim.steer(craft.pose,goal),speed=Math.hypot.apply(null,player.velocity);
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
     * @param {number} radiusM @param {number[][]} [previousShips]
     * @returns {import('../experiments/types').ConvoyHit|null} */
    function trace(combat,start,end,radiusM,previousShips){
        var state=combat.convoy;if(!state)return null;
        /** @type {import('../experiments/types').ConvoyHit|null} */var best=null;
        for(var i=0;i<state.ships.length;i++){
            var ship=state.ships[i],hull=hulls[ship.model];if(ship.hull<=0||!hull)continue;
            var old=previousShips?previousShips[i]:ship.position,miss=false;
            for(var k=0;k<3;k++){
                var a=(start[k]-old[k])*U,b=(end[k]-ship.position[k])*U;
                if(Math.min(a,b)>hull.max[k]+radiusM||Math.max(a,b)<hull.min[k]-radiusM){miss=true;break;}
            }
            if(miss)continue;
            var from=start.map(function(v,k){return v-old[k];}),to=end.map(function(v,k){return v-ship.position[k];});
            const hit=DW.shipHulls.hullHit(hull.model,hullPose,from,to,U,radiusM);
            if(!hit||best&&hit.fraction>=best.fraction)continue;
            var away=from.map(function(v,k){return (v+(to[k]-v)*hit.fraction)*U-hit.local[k];}),length=Math.hypot.apply(null,away);
            var normal=length>1e-7?away.map(function(v){return v/length;}):hit.normal;
            best={shipIndex:i,shipId:ship.id,fraction:hit.fraction,point:ship.position.map(function(v,k){return v+hit.local[k]/U;}),normal:normal};
        }
        return best;
    }
    /** Heavy freighters keep their route; fighters deflect in the freighter's frame.
     * @param {import('../experiments/types').Combat} combat @param {number[][]} previousCraft
     * @param {number[][]} previousShips @param {number} dt */
    function collide(combat,previousCraft,previousShips,dt){
        const state=combat.convoy;if(!state||!combat.enabled||!(dt>0))return false;
        var playerImpact=false;
        DW.flightSim.participants(combat).forEach(function(craft,index){
            if(craft.hp<=0)return;
            var pose=craft.pose,radius=DW.flightCollision.radius(craft)*U;
            // An approach may spawn during this tick; new craft have no earlier sample.
            const hit=trace(combat,previousCraft[index]||pose.eye,pose.eye,radius,previousShips);if(!hit)return;
            var ship=state.ships[hit.shipIndex],velocity=ship.position.map(function(v,k){return (v-previousShips[hit.shipIndex][k])*U/dt;});
            var relative=pose.velocity.map(function(v,k){return v-velocity[k];}),inward=relative.reduce(function(n,v,k){return n+v*hit.normal[k];},0);
            pose.eye=hit.point.map(function(v,k){return v+hit.normal[k]*(radius+.02)/U;});
            if(inward<0)pose.velocity=pose.velocity.map(function(v,k){return v-1.2*inward*hit.normal[k];});
            var dot=/** @param {number[]} axis */function(axis){return pose.velocity.reduce(function(n,v,k){return n+v*axis[k];},0);};
            pose.ramp=[dot(pose.right),dot(pose.up),-dot(pose.back)];
            DW.flightSim.collisionChanged(combat,craft);
            if(craft===combat.player&&inward< -1)playerImpact=true;
        });
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
        views.forEach(function(c,i){c.pose.eye=state.ships[i].position;c.pose.velocity=state.ships[i].velocity;c.collision={kind:'sphere',radiusM:hulls[c.convoyModel||'']?DW.shipHulls.hullRadius(hulls[c.convoyModel||''].model):80};});
        return views.filter(function(c){return c.hp>0;});
    }
    /** @param {import('../experiments/types').Craft} craft @param {number[]} start @param {number[]} end @param {number} [radius] */
    function hitModel(craft,start,end,radius){var h=hulls[craft.convoyModel||''];return h?DW.shipHulls.hullHit(h.model,craft.pose,start,end,U,radius):null;}
    /** @param {string} name */function model(name){const hull=hulls[name];if(!hull)throw Error('Convoy hull not loaded: '+name);return hull.model;}
    /** @param {import('../experiments/types').Combat} combat @param {string} id @param {import('../experiments/types').Weapon} weapon @param {number[]} point */
    function damage(combat,id,weapon,point){
        const state=combat.convoy;if(!state)return;
        var ship=state.ships.find(function(s){return s.id===id;});if(!ship||ship.hull<=0)return;
        ship.hull=Math.max(0,ship.hull-weapon.damage*weapon.armorFactor);
        combat.flashes.push({position:point.slice(),velocity:ship.velocity.map(function(v){return v/U;}),age:0,scale:ship.hull>0?1:70,destruction:ship.hull<=0});
    }
    /** The radio channel consumes a cue only when free. Combat interrupts reports and conversation.
     * @param {import('../experiments/types').Combat} combat @param {number} dt @param {boolean} busy @returns {import('../experiments/types').Line|null} */
    function radio(combat,dt,busy){
        const s=combat.convoy;if(!s||!combat.enabled||combat.dead)return null;
        var r=s.radio;const radioShips=s.ships;
        var alive=s.ships.filter(function(ship){return ship.hull>0;}),enemies=combat.enemies.filter(function(e){return e.team==='enemy'&&e.hp>0;});
        // Observe transitions even while another transmission owns the channel.
        if(s.complete)r.phase='complete';
        else if(enemies.length){
            if(r.phase!=='combat')r.said=r.said.filter(function(key){return key!=='nearby'&&key!=='range'&&key!=='firing';});
            if(r.phase!=='combat'&&r.chatTurn){r.chat++;r.chatTurn=0;}
            r.phase='combat';r.report=0;
        }else if(r.phase==='combat'){r.phase='damage-report';r.report=0;}
        // Count silence, not time spent speaking. Urgent facts still leave a short gap.
        if(busy)return null;
        r.wait=Math.max(0,r.wait-dt);if(r.wait>25)return null;
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
        if(s.complete&&!r.said.includes('complete'))return cue('complete',alive.length?'Lancer, Control. '+alive.length+' transports through. Escort complete.':'Lancer, Control. Convoy lost. Withdraw.');
        if(r.phase==='complete')return null;
        if(r.phase==='damage-report'){
            if(r.report===0){r.report++;return cue('clear','Lancer, Control. No further contacts. Flight and convoy leads, report damage.');}
            if(r.report===1){
                r.report++;
                const wing=combat.enemies.find(function(e){return e.team==='ally'&&e.hp>0;});
                var lost=combat.enemies.filter(function(e){return e.team==='ally'&&e.hp<=0;}).length;
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
            return cue('report-complete','Copy. '+alive.length+' transports accounted for; '+alive.filter(function(ship){return ship.hull<ship.maxHull;}).length+' damaged, '+(radioShips.length-alive.length)+' lost. Maintain course and speed. Lancer, resume the screen.');
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
        var aimed=enemies.map(function(e){var ship=s.ships.find(function(ship){return ship.id===e.targetId&&ship.hull>0;});return {enemy:e,ship:ship,distance:ship?Math.hypot.apply(null,ship.position.map(function(v,k){return v-e.pose.eye[k];}))*U:Infinity};});
        var shooting=aimed.find(function(a){return a.ship&&a.enemy.fire&&a.enemy.guns.fired>0;}),ranged=aimed.find(function(a){var w=DW.retailWeapons[a.enemy.weaponIndex||0];return a.ship&&a.distance<w.speed*w.lifetime;});
        if(shooting&&shooting.ship&&!r.said.includes('firing'))return cue('firing','Lancer, Control. Bandit firing on the '+packets[shooting.ship.packet].name.toLowerCase()+' group. Engage.');
        if(ranged&&ranged.ship&&!r.said.includes('range')&&!r.said.includes('firing'))return cue('range','Lancer, Control. Bandits entering weapons range of the '+packets[ranged.ship.packet].name.toLowerCase()+' group. Intercept.');
        var contactReport=r.said.includes('range')||r.said.includes('firing');
        if(!s.raidStarted&&r.opening===0&&!contactReport){
            if(r.wait>0)return null;
            r.opening++;return cue('intro-control','Lancer flight, Control. Convoy should be in visual range now.');
        }
        if(!s.raidStarted&&r.opening>0&&!contactReport&&!r.said.includes('visual-reply')){
            const wing=combat.enemies.find(function(e){return e.team==='ally'&&e.hp>0;});
            if(wing&&alive.some(function(ship){return Math.hypot.apply(null,ship.position.map(function(v,k){return v-wing.pose.eye[k];}))*U<2000;})){
                return fighterCue('visual-reply','Affirmative, Control. Convoy in sight.',wing);
            }
        }
        if(!s.raidStarted&&r.said.includes('visual-reply')&&!contactReport&&!r.said.includes('welcome')&&s.ships[0].hull>0){r.phase='cruise';return cue('welcome','Lancer, Wayfarer. Glad to have you with us.',0);}
        if(enemies.length&&!r.said.includes('nearby')&&!contactReport)return cue('nearby','Lancer, Control. '+enemies.length+' bandit'+(enemies.length===1?'':'s')+" in one group, approaching the convoy's starboard quarter. Intercept.");
        // Do not deliver an arrival briefing after the engagement has already begun.
        if(contactReport&&r.opening===0)r.opening=1;
        if(!s.raidStarted||enemies.length||r.phase!=='cruise')return null;
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
    DW.convoyMission={stepRaider:stepRaider,radio:radio,packets:packets,hitModel:hitModel,targets:targets,model:model,damage:damage,installCollision:installCollision,trace:trace,collide:collide,start:start,step:step,stepWing:stepWing,WING_SIZE:WING_SIZE};
}());
