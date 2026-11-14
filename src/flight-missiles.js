(function () {
    'use strict';
    /** @typedef {import('../experiments/types').Craft} Craft */
    /** @typedef {import('../experiments/types').Combat} Combat */
    /** @typedef {import('../experiments/types').Vector} Vector */
    /** @typedef {import('../experiments/missile-types').Missile} Missile */
    /** @typedef {import('../experiments/missile-types').MissileRack} Rack */
    /** @typedef {import('../experiments/missile-types').MissileWeapon} Weapon */
    /** @typedef {import('../experiments/missile-types').Decoy} Decoy */
    var DW=/** @type {Required<import('../src/types').DriftworksNamespace>} */(window.Driftworks),U=DW.sim.METERS_PER_UNIT;
    var catalog=DW.retailMissiles;
    /** @param {Vector} a @param {Vector} b */function dot(a,b){return a.reduce(function(s,v,i){return s+v*b[i];},0);}
    /** @param {Vector} a @param {Vector} b */function sub(a,b){return a.map(function(v,i){return v-b[i];});}
    /** @param {Vector} a @param {Vector} b @param {number} k */function add(a,b,k){return a.map(function(v,i){return v+b[i]*k;});}
    /** @param {Vector} a */function norm(a){var n=Math.hypot.apply(null,a);return n>1e-12?a.map(function(v){return v/n;}):[0,1,0];}
    /** @param {Vector} origin @param {Vector} target @param {number} [curvature] */
    function spaceDelta(origin,target,curvature){if(!curvature)return sub(target,origin);var p=DW.flightHyperbolic.path(origin,target,curvature);return p.direction.map(function(v){return v*p.distance;});}
    /** @param {string} name */function find(name){return catalog.missiles.find(function(w){return w.name===name;})||null;}
    /** @param {Combat} t */function state(t){
        if(!t.missileState)t.missileState={serial:0,rng:1729,missiles:[],decoys:[],shockwaves:[]};
        return t.missileState;
    }
    /** @param {Combat} t */function random(t){var s=state(t);s.rng=(Math.imul(s.rng,1664525)+1013904223)>>>0;return s.rng/4294967296;}
    /** @param {Craft} c */function reset(c){delete c.missileRack;}
    /** @param {Craft} c @returns {Rack} */function rack(c){
        if(c.missileRack&&c.missileRack.profile===c.profile.name)return c.missileRack;
        var p=catalog.profiles.find(function(p){return p.name===c.profile.name;});
        c.missileRack={fired:0,profile:c.profile.name,banks:p?p.defaultBanks.map(function(name,i){var w=find(name),capacity=p ? p.capacities[i]||0 : 0;return {name:name,capacity:capacity,ammo:w?Math.floor(capacity/w.cargoSize+.5):0};}):[],
            bank:0,countermeasures:p?p.countermeasures:0,cooldown:0,cmCooldown:0,targetId:null,lock:0,locked:false,indicator:null,catching:false,penalty:0,
            secondary:false,decoy:false,cycle:false,cycleHeld:false,salvo:0,salvoWait:0,salvoTarget:null};
        return c.missileRack;
    }
    /** @param {Craft} c */function weapon(c){var r=rack(c),b=r.banks[r.bank];return b?find(b.name):null;}
    /** Bank changes preserve remaining cargo; the pause menu cannot refill a magazine.
     * @param {Craft} c @param {number} index @param {string} name */
    function equipBank(c,index,name){
        var r=rack(c),bank=r.banks[index],w=find(name),p=catalog.profiles.find(function(p){return p.name===c.profile.name;});
        if(!bank||!w||!p||!p.allowed.includes(name))return false;
        var old=find(bank.name),remaining=old?bank.ammo*old.cargoSize:bank.capacity;
        bank.name=name;bank.ammo=Math.min(Math.floor(bank.capacity/w.cargoSize+.5),Math.floor(remaining/w.cargoSize));
        r.salvo=0;clearLock(r);return true;
    }
    /** @param {Craft} c @param {import('../experiments/types').Demand} controls */function input(c,controls){
        var r=rack(c);r.secondary=!!controls.secondary;r.decoy=!!controls.countermeasure;r.cycle=!!controls.nextMissileBank;
    }
    /** @param {Combat} t @param {Craft} c */function incoming(t,c){return state(t).missiles.filter(function(m){return m.targetId===c.id&&m.team!==c.team&&m.region===(c.pose.region||0);});}
    /** @param {Rack} r */function clearLock(r){r.lock=0;r.locked=false;r.indicator=null;r.catching=false;r.penalty=0;}
    /** Source reference and deliberate adaptations: docs/flight-missiles.md.
     * The indicator moves on FSO's virtual 640x480 plane, independent of display resolution.
     * @param {Craft} c @param {Craft|undefined} target @param {Weapon} w @param {number} dt */
    function lock(c,target,w,dt){
        var r=rack(c);
        if(r.targetId!==(target?target.id:null)){clearLock(r);r.targetId=target?target.id:null;}
        if(w.homing!=='aspect'){r.locked=false;return;}
        var d=target?spaceDelta(c.pose.eye,target.pose.eye,c.pose.curvature):[0,0,0],distance=Math.hypot.apply(null,d),forward=c.pose.back.map(function(v){return -v;}),facing=dot(norm(d),forward);
        var valid=target&&target.hp>0&&target.team!==c.team&&(target.pose.region||0)===(c.pose.region||0)&&distance*U<w.speed*w.lifetime&&facing>.85;
        if(!valid){r.lock=Math.max(0,r.lock-dt);r.locked=false;r.indicator=null;r.catching=false;return;}
        var z=dot(d,forward),point=[dot(d,c.pose.right)/z*320,dot(d,c.pose.up)/z*320,0];
        if(!r.indicator){r.indicator=[point[0]+(w.minLockTime-r.lock)*w.lockPixelsPerSec,point[1],0];r.penalty=0;}
        if(r.locked){r.indicator=point;return;}
        var delta=sub(point,r.indicator),span=Math.hypot.apply(null,delta);
        // A rapidly moving target outruns normal lock motion and incurs catch-up travel.
        if(span>w.minLockTime*w.lockPixelsPerSec+2&&!r.catching){r.catching=true;r.penalty=w.catchupPenalty;}
        var movement=(r.catching?w.catchupPixelsPerSec:w.lockPixelsPerSec)*dt;
        r.indicator=add(r.indicator,norm(delta),Math.min(span,movement));
        if(r.catching){if(span<=movement+2)r.catching=false;}
        else {r.lock=Math.min(w.minLockTime,r.lock+dt);r.penalty=Math.max(0,r.penalty-movement);}
        r.locked=r.lock+1e-8>=w.minLockTime&&span<=movement+2&&r.penalty===0;
    }
    /** @param {Vector} direction @param {Vector} goal @param {number} radians */
    function turn(direction,goal,radians){
        var cosine=Math.max(-1,Math.min(1,dot(direction,goal))),angle=Math.acos(cosine);
        if(angle<=radians)return goal;
        var tangent=sub(goal,direction.map(function(v){return v*cosine;}));
        if(Math.hypot.apply(null,tangent)<1e-8)tangent=Math.abs(direction[0])<.9?[1,0,0]:[0,1,0];
        tangent=norm(sub(tangent,direction.map(function(v){return v*dot(tangent,direction);})));return norm(add(direction.map(function(v){return v*Math.cos(radians);}),tangent,Math.sin(radians)));
    }
    /** @param {Combat} t @param {Craft} c @param {Weapon} w @param {string|null} targetId @param {boolean} locked */
    function launch(t,c,w,targetId,locked){
        rack(c).fired++;
        var s=state(t),direction=c.pose.back.map(function(v){return -v;}),launchM=DW.flightCollision.radius(c)*U+2;
        var muzzle=c.pose.curvature?DW.flightHyperbolic.travel(c.pose.eye,direction,launchM/U,c.pose.curvature):null;
        s.missiles.push({curvature:c.pose.curvature,id:'missile-'+(++s.serial),owner:c.id,team:c.team||'enemy',targetId:targetId,originalTarget:targetId,weapon:w,
            position:muzzle?muzzle.point:add(c.pose.eye,direction,launchM/U),direction:muzzle?muzzle.direction:direction,region:c.pose.region||0,age:0,life:w.lifetime,speed:w.homing==='none'?w.speed:Math.max(w.speed*.25,dot(c.pose.velocity,direction)+w.speed*.25),locked:locked,seen:[],zigAt:0,zig:[0,0,0]});
    }
    /** @param {Combat} t @param {Craft} c */function deploy(t,c){
        var r=rack(c);if(r.countermeasures<=0||r.cmCooldown>1e-8)return;
        var s=state(t),cm=catalog.countermeasure;r.countermeasures--;r.cmCooldown=.5;
        var jitter=norm([random(t)-.5,random(t)-.5,random(t)-.5]);
        s.decoys.push({curvature:c.pose.curvature,id:'decoy-'+(++s.serial),owner:c.id,team:c.team||'enemy',position:add(c.pose.eye,c.pose.back,(DW.flightCollision.radius(c)*U+2)/U),velocity:add(add(c.pose.velocity,c.pose.back,25),jitter,2),region:c.pose.region||0,age:0,life:cm.lifetimeMin+random(t)*(cm.lifetimeMax-cm.lifetimeMin),pulses:2});
    }
    /** @param {Combat} t @param {Missile} m @param {Craft[]} roster */function acquire(t,m,roster){
        var best=Infinity; m.targetId=null;
        roster.forEach(function(c){
            if(c.hp<=0||c.id===m.owner||c.team===m.team||(c.pose.region||0)!==m.region)return;
            var d=spaceDelta(m.position,c.pose.eye,m.curvature),dist=Math.hypot.apply(null,d)*U;
            if(dot(norm(d),m.direction)>Math.cos(m.weapon.viewCone*Math.PI/360)&&dist<best&&dist<m.weapon.speed*m.life){best=dist;m.targetId=c.id;}
        });
    }
    /** @param {Combat} t @param {Missile} m @param {Craft[]} roster @param {number} dt */
    function guide(t,m,roster,dt){
        var w=m.weapon,s=state(t);if(w.homing==='aspect'&&!m.locked)return;
        var target=roster.find(function(c){return c.id===m.targetId&&c.hp>0&&(c.pose.region||0)===m.region;});
        var cm=s.decoys.find(function(c){return c.id===m.targetId&&c.region===m.region;});
        // FSO makes one effectiveness roll per missile/decoy pair, on launch pulses.
        var bestDecoyDot=Math.cos(w.viewCone*Math.PI/360);
        s.decoys.forEach(function(d){
            if(d.pulses<=0||d.region!==m.region||d.team===m.team||m.seen.includes(d.id)||Math.hypot.apply(null,sub(d.position,m.position))*U>=300)return;
            m.seen.push(d.id);
            var decoyDot=dot(norm(sub(d.position,m.position)),m.direction);
            if(random(t)<1/(w.homing==='aspect'?2:3)&&decoyDot>bestDecoyDot){
                bestDecoyDot=decoyDot;m.targetId=d.id;cm=d;target=undefined;
            }
        });
        if(w.homing==='heat'&&!target&&!cm&&m.age>=.5){acquire(t,m,roster);target=roster.find(function(c){return c.id===m.targetId;});}
        if(m.age<.25||(!target&&!cm))return;
        var position=cm?cm.position:target?target.pose.eye:m.position,delta=spaceDelta(m.position,position,m.curvature),distance=Math.hypot.apply(null,delta)*U,direction=norm(delta),facing=dot(direction,m.direction);
        if(w.homing==='heat'&&facing<Math.cos(w.viewCone*Math.PI/360)&&distance>w.innerRadius*1.1){acquire(t,m,roster);return;}
        if(w.homing==='aspect'&&target&&facing>.1&&distance/w.speed>.1)direction=norm(add(delta,target.pose.velocity,Math.min(2,distance/w.speed)/U));
        m.life-=dt*Math.max(0,.95-facing);
        m.speed=(facing<.9?w.speed*.75:w.speed)*(m.age<1?m.age*m.age:1);
        if(w.swarm>1){
            if(m.age>=m.zigAt){
                var interval=.3+random(t)*.2;m.zigAt=m.age+interval;
                if(distance/Math.max(1,m.speed)<=interval*4)m.zig=[0,0,0];
                else {
                    var axis=Math.abs(m.direction[2])<.9?[0,0,1]:[1,0,0],right=norm([m.direction[1]*axis[2]-m.direction[2]*axis[1],m.direction[2]*axis[0]-m.direction[0]*axis[2],m.direction[0]*axis[1]-m.direction[1]*axis[0]]);
                    var up=norm([right[1]*m.direction[2]-right[2]*m.direction[1],right[2]*m.direction[0]-right[0]*m.direction[2],right[0]*m.direction[1]-right[1]*m.direction[0]]),angle=random(t)*Math.PI*2;
                    var radius=Math.tan(Math.asin(Math.min(1,2/Math.max(2,m.speed*interval))))*distance/U;
                    m.zig=add(right.map(function(v){return v*Math.cos(angle)*radius;}),up,Math.sin(angle)*radius);
                }
            }
            direction=norm(add(delta,m.zig,1));
        }
        m.direction=turn(m.direction,direction,Math.PI*2*dt/w.turnTime);
        if(!cm&&facing<Math.cos(w.viewCone*Math.PI/360)&&distance<m.speed*dt*4+10)m.life=0;
    }
    /** @param {Combat} t @param {Missile} m @param {Craft[]} roster @param {import('../experiments/types').TerrainHit} [terrain] */
    function explode(t,m,roster,terrain){
        var w=m.weapon;
        t.flashes.push({position:m.position.slice(),region:m.region,age:0,scale:Math.min(28,Math.max(3,Math.sqrt(w.innerRadius)*1.6)),warhead:true,trail:m.trail,destruction:false});
        if(w.shockwaveSpeed>0)state(t).shockwaves.push({missile:m,radius:0,hitIds:[]});
        else blast(t,m,roster,Infinity,[],terrain);
    }
    /** @param {Combat} t @param {Missile} m @param {Craft[]} roster @param {number} radius @param {string[]} hitIds @param {import('../experiments/types').TerrainHit} [terrain] */
    function blast(t,m,roster,radius,hitIds,terrain){
        var w=m.weapon;
        roster.forEach(function(c){
            if(c.hp<=0||(c.pose.region||0)!==m.region||hitIds.includes(c.id))return;
            var distance=Math.max(0,Math.hypot.apply(null,spaceDelta(m.position,c.pose.eye,m.curvature))*U-DW.flightCollision.radius(c)*U);
            if(distance>=w.outerRadius||distance>radius)return;
            if(terrain&&terrain(m.position,c.pose.eye,{position:m.position,direction:norm(spaceDelta(m.position,c.pose.eye,m.curvature)),weapon:w,age:m.age,region:m.region}))return;
            hitIds.push(c.id);
            var factor=distance<=w.innerRadius?1:(w.outerRadius-distance)/(w.outerRadius-w.innerRadius);
            var damage=Object.assign({},w,{damage:w.damage*factor*factor});
            if(c.convoyModel)DW.convoyMission.damage(t,c.id,damage,m.position);
            else DW.flightCombat.damageCraft(t,c,damage,m.owner);
        });
    }
    /** @param {Combat} t @param {number} dt @param {import('../experiments/types').TerrainHit} [terrain] @param {import('../experiments/types').ShotSpace} [space] */
    function step(t,dt,terrain,space){
        if(t.missilesEnabled===false)return;
        var s=state(t),roster=[t.player].concat(t.enemies).concat(t.convoy?DW.convoyMission.targets(t):[]),definition=DW.flightMissions.resolve(t.mode),disabled=!!definition.weaponsDisabled;
        s.shockwaves=s.shockwaves.filter(function(wave){wave.radius+=wave.missile.weapon.shockwaveSpeed*dt;blast(t,wave.missile,roster,wave.radius,wave.hitIds,terrain);return wave.radius<wave.missile.weapon.outerRadius;});
        roster.filter(function(c){return !c.convoyModel;}).forEach(function(c){
            var r=rack(c);r.cooldown=Math.max(0,r.cooldown-dt);r.cmCooldown=Math.max(0,r.cmCooldown-dt);r.salvoWait-=dt;
            if(c.hp<=0){r.salvo=0;clearLock(r);return;}
            if(r.cycle&&!r.cycleHeld){r.bank=(r.bank+1)%Math.max(1,r.banks.length);r.salvo=0;clearLock(r);}r.cycleHeld=r.cycle;
            var threats=incoming(t,c);
            if(!disabled&&(r.decoy||c.controller==='ai'&&threats.some(function(m){return Math.hypot.apply(null,sub(m.position,c.pose.eye))*U<m.speed*2;})))deploy(t,c);
            if(c.controller==='ai'&&r.banks.length&&r.banks[r.bank].ammo<=0){var next=r.banks.findIndex(function(b){return b.ammo>0&&!!find(b.name);});if(next>=0&&next!==r.bank){r.bank=next;clearLock(r);}}
            var w=weapon(c);if(!w)return;
            var id=c===t.player?t.targetId:c.targetId,target=roster.find(function(other){return other.id===id;});
            if(c.controller==='ai'&&!target)target=roster.find(function(other){return other.hp>0&&other.team!==c.team&&(other.pose.region||0)===(c.pose.region||0);});
            lock(c,target,w,dt);
            var bank=r.banks[r.bank],targetDistance=target?Math.hypot.apply(null,spaceDelta(c.pose.eye,target.pose.eye,c.pose.curvature))*U:Infinity;
            var ai=c.controller==='ai'&&target&&targetDistance<w.speed*w.lifetime*.8&&targetDistance>w.outerRadius+DW.flightCollision.radius(c)*U&&dot(norm(spaceDelta(c.pose.eye,target.pose.eye,c.pose.curvature)),c.pose.back)<-.9;
            var trigger=c.controller==='ai'?ai:r.secondary;
            if(!disabled&&trigger&&bank.ammo>0&&r.cooldown<=1e-8&&!r.salvo){
                var locked=w.homing==='aspect'&&r.locked;
                // Aspect missiles can dumbfire, except explicitly prohibited bombs.
                if((c.controller!=='ai'||w.homing!=='aspect'||locked)&&(!w.flags.includes('no dumbfire')||locked)){
                    r.salvo=Math.min(w.swarm,bank.ammo);r.salvoWait=0;r.salvoTarget=locked||w.homing==='heat'&&target?target?target.id:null:null;r.cooldown=w.fireWait;
                }
            }
            if(!disabled&&r.salvo>0&&r.salvoWait<=1e-8&&bank.ammo>0){launch(t,c,w,r.salvoTarget,w.homing==='aspect'&&!!r.salvoTarget);bank.ammo--;r.salvo--;r.salvoWait=.15;}
        });
        /** @type {{position:Vector;region:number;team:string}[]} */var decoyDetonations=[];
        s.missiles=s.missiles.filter(function(m){
            if(m.torpedo&&(m.hp||0)<=0)return false;
            var w=m.weapon,travel=Math.min(dt,m.life);
            if(m.torpedo&&m.targetPoint&&m.age>.6){m.speed=Math.min(w.speed,m.speed+80*dt);m.direction=turn(m.direction,norm(sub(m.targetPoint,m.position)),dt*.55);}
            if(!m.torpedo&&w.homing!=='none')guide(t,m,roster,dt);
            var cm=s.decoys.find(function(d){return d.id===m.targetId&&d.region===m.region;});
            var start=m.position.slice();
            /** @type {{point:Vector;direction:Vector;region:number;segments:{start:Vector;end:Vector;region:number;direction:Vector}[]}} */var journey;
            if(typeof space==='object')journey=DW.wormholes.advanceRay(space.links,start,m.direction,m.speed*travel/U,m.region,space.time,U);
            else if(typeof space==='number'){
                var move=DW.flightHyperbolic.travel(start,m.direction,m.speed*travel/U,space);journey={point:move.point,direction:move.direction,region:m.region,segments:[{start:start,end:move.point,region:m.region,direction:m.direction}]};
            }else if(space){var bridge=DW.flightGuns.bridgeTravel(start,m.direction.map(function(v){return v*m.speed*travel/U;}),m.region);journey={point:bridge.point,region:bridge.region,direction:bridge.normal?DW.flightGuns.bridgeVector(m.direction,bridge.normal):m.direction,segments:bridge.segments.map(function(segment){return Object.assign({direction:m.direction},segment);})};}
            else {var end=add(start,m.direction,m.speed*travel/U);journey={point:end,region:m.region,direction:m.direction,segments:[{start:start,end:end,region:m.region,direction:m.direction}]};}
            var hit=false,environmentContact=false;
            for(var segment of journey.segments){
                m.region=segment.region;
                var contact=terrain&&(terrain.allRegions||!m.region)?terrain(segment.start,segment.end,{position:segment.start,direction:m.direction,weapon:w,age:m.age,region:m.region}):null,best=contact?Math.hypot.apply(null,sub(contact,segment.start)):Infinity;
                environmentContact=!!contact;
                roster.forEach(function(c){
                    if(c.id===m.owner||c.hp<=0||(c.pose.region||0)!==m.region)return;
                    var broad=c.pose.curvature||DW.flightCollision.sphereHit(segment.start,segment.end,c.pose.eye,DW.flightCollision.radius(c)+w.headRadius/U);
                    var collision=broad?DW.flightCollision.hullHit(c,segment.start,segment.end,w.headRadius):null,range=collision?Math.hypot.apply(null,sub(collision.point,segment.start)):Infinity;
                    if(collision&&range<best){best=range;contact=collision.point;environmentContact=false;}
                });
                if(cm){var decoyHit=segment.region===cm.region?DW.flightCollision.sphereHit(segment.start,segment.end,cm.position,40/U):null;if(decoyHit){m.position=decoyHit.point;decoyDetonations.push({position:cm.position,region:cm.region,team:cm.team});hit=true;break;}}
                if(contact){m.position=contact;hit=true;break;}
            }
            if(!hit){m.position=journey.point;m.direction=journey.direction;m.region=journey.region;}
            // Store actual flight history, bounded in time and count; never interpolate across charts.
            var trail=m.trail||(m.trail=[]);trail.forEach(function(p){p.age+=travel;});
            m.trail=trail.filter(function(p){return p.age<.85;}).slice(-47);
            if(!m.trail.length||m.region!==m.trail[m.trail.length-1].region||m.age-(m.trailClock||0)>=.025){m.trail.push({position:m.position.slice(),region:m.region,age:0});m.trailClock=m.age;}
            m.age+=travel;m.life-=travel;
            if(hit&&environmentContact){
                if(terrain&&terrain.onImpact)terrain.onImpact(m.position,{position:m.position,direction:m.direction,weapon:w,age:m.age,region:m.region},t);
                if(t.onTerrainImpact)t.onTerrainImpact(m.position);
            }
            if(hit||m.life<=0){explode(t,m,roster,terrain);return false;}return true;
        });
        s.missiles=s.missiles.filter(function(m){if(decoyDetonations.some(function(d){return d.region===m.region&&d.team!==m.team&&Math.hypot.apply(null,sub(d.position,m.position))*U<40;})){explode(t,m,roster,terrain);return false;}return true;});
        s.decoys=s.decoys.filter(function(d){d.pulses--;d.age+=dt;if(d.curvature){var speed=Math.hypot.apply(null,d.velocity),move=DW.flightHyperbolic.travel(d.position,norm(d.velocity),speed*dt/U,d.curvature);d.position=move.point;d.velocity=move.direction.map(function(v){return v*speed;});}else d.position=add(d.position,d.velocity,dt/U);return d.age<d.life;});
    }
    // Capital ordnance shares missile trajectories, rendering and environment impacts.
    /** @param {Combat} t @param {string} owner @param {string} team @param {Vector} position @param {Vector} direction @param {Vector} target @param {number} region */
    function launchTorpedo(t,owner,team,position,direction,target,region){
        var s=state(t),base=find('Cyclops');if(!base)return;
        var w=Object.assign({},base,{name:'Capital torpedo',speed:180,lifetime:45,damage:650,length:12,headRadius:1.8,tailRadius:1.1,shockwaveSpeed:0,innerRadius:30,outerRadius:90});
        s.missiles.push({id:'torpedo-'+(++s.serial),owner:owner,team:team,targetId:null,originalTarget:null,weapon:w,position:position,direction:direction,region:region,age:0,life:w.lifetime,speed:65,locked:true,seen:[],zigAt:0,zig:[0,0,0],torpedo:true,hp:12,targetPoint:target.slice()});
    }
    /** @type {WeakMap<Missile,Craft>} */var torpedoContacts=new WeakMap();
    /** @param {Combat} t @param {string} team @param {number} region */
    function torpedoTargets(t,team,region){
        return state(t).missiles.filter(function(m){return m.torpedo&&(m.hp||0)>0&&m.team!==team&&m.region===region;}).map(function(m){
            var c=torpedoContacts.get(m);if(!c){c=DW.flightSim.createCraft(m.id,DW.arcade.create(0),m.team);c.shield=0;c.collision={kind:'sphere',radiusM:3};torpedoContacts.set(m,c);}
            var pose=c.pose;pose.eye=m.position;pose.velocity=m.direction.map(function(v){return v*m.speed;});pose.back=m.direction.map(function(v){return -v;});pose.region=m.region;
            c.hp=m.hp||0;return c;
        });
    }
    /** Swept gun contact, clipped by the caller's nearest hull/environment hit.
     * @param {Combat} t @param {Vector} a @param {Vector} b @param {import('../experiments/types').Bolt} bolt @param {string} team */
    function interceptTorpedo(t,a,b,bolt,team){
        /** @type {{fraction:number;point:Vector}|null} */var best=null;
        /** @type {Missile|null} */var victim=null;
        for(var m of state(t).missiles){if(!m.torpedo||(m.hp||0)<=0||m.team===team||m.region!==(bolt.region||0))continue;
            var h=DW.flightCollision.sphereHit(a,b,m.position,(3+(bolt.weapon.headRadius||0))/U);
            if(h&&(!best||h.fraction<best.fraction)){best=h;victim=m;}
        }
        if(!victim||!best)return null;
        victim.hp=(victim.hp||0)-bolt.weapon.damage;
        if(victim.hp<=0)t.flashes.push({position:victim.position.slice(),region:victim.region,age:0,scale:8,warhead:true,destruction:false});
        return best.point;
    }
    DW.flightMissiles={launchTorpedo:launchTorpedo,torpedoTargets:torpedoTargets,interceptTorpedo:interceptTorpedo,equipBank:equipBank,rack:rack,weapon:weapon,reset:reset,input:input,step:step,state:state,incoming:incoming};
}());
