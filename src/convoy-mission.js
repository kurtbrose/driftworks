(function(){
    'use strict';
    var DW=/** @type {Required<import('./types').DriftworksNamespace>} */(window.Driftworks),U=DW.sim.METERS_PER_UNIT;
    var WING_SIZE=3;
    /** @param {import('../experiments/types').Combat} combat @param {import('../experiments/types').FlightState} player */
    function start(combat,player){
        player.eye=[0,-225/U,1200+50/U];player.right=[1,0,0];player.up=[0,0,1];player.back=[0,-1,0];
        player.velocity=[0,25,0];player.ramp=[0,0,25];player.throttle=25/combat.player.profile.maxVelocity[2];
        combat.enemies.forEach(function(c,i){
            DW.flightSim.equip(c,combat.player.profile,DW.flightSim.defaultWeapon(combat.player.profile));
            c.team='ally';c.callsign=['Lancer Two','Lancer Three'][i];
            c.pose.eye=[(i?90:-90)/U,player.eye[1]-80/U,player.eye[2]];
            c.pose.right=player.right.slice();c.pose.up=player.up.slice();c.pose.back=player.back.slice();
            c.pose.velocity=player.velocity.slice();c.pose.ramp=[0,0,25];c.pose.throttle=25/c.profile.maxVelocity[2];
            c.mode='escort';c.targetId=null;
        });
        combat.convoy={elapsed:0,speedMps:25,destinationY:7500/U,complete:false,ships:Array.from({length:30},function(/** @type {unknown} */unused,i){
            var slot=[(i%3-1)*45/U,(4-Math.floor(i/6))*110/U,1200+(Math.floor(i/3)%2?17.5:-17.5)/U];
            return {id:'cargo-'+String(i+1).padStart(2,'0'),callsign:'Cargo '+String(i+1).padStart(2,'0'),model:['container','mixed','fluid'][i%3],slot:slot.slice(),position:slot.slice(),velocity:[0,25,0],hull:100,maxHull:100,arrived:false};
        })};
        combat.targetId=null;combat.roundOver=false;
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
        s.complete=s.ships.every(function(ship){return ship.arrived||ship.hull<=0;});
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
            const hit=trace(combat,previousCraft[index],pose.eye,radius,previousShips);if(!hit)return;
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
    DW.convoyMission={installCollision:installCollision,trace:trace,collide:collide,start:start,step:step,stepWing:stepWing,WING_SIZE:WING_SIZE};
}());
