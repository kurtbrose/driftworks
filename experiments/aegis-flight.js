(function(){
    'use strict';
    /** @typedef {import('./types').Vector} Vector */
    /** @typedef {import('./types').Batch} Batch */
    /** @typedef {import('./types').FlightView} FlightView */
    var DW=/** @type {Required<import('../src/types').DriftworksNamespace>} */(window.Driftworks);
    var U=DW.sim.METERS_PER_UNIT;
    /** @param {Vector} a @param {Vector} b */
    function sub(a,b){return a.map(function(v,i){return v-b[i];});}
    /** @param {Vector} a @param {Vector} b */
    function dot(a,b){return a.reduce(function(n,v,i){return n+v*b[i];},0);}
    /** @param {number} n @param {number} lo @param {number} hi */
    function clamp(n,lo,hi){return Math.max(lo,Math.min(hi,n));}
    /** @param {number} angle */
    function wrap(angle){return Math.atan2(Math.sin(angle),Math.cos(angle));}
    /** @param {number} current @param {number} goal @param {number} limit */
    function approach(current,goal,limit){return current+clamp(goal-current,-limit,limit);}
    /** Earliest positive constant-velocity intercept, relative meters and m/s.
     * @param {Vector} r @param {Vector} v @param {number} speed */
    function interceptTime(r,v,speed){
        var a=dot(v,v)-speed*speed,b=2*dot(r,v),c=dot(r,r);
        if(Math.abs(a)<1e-8)return b<0?-c/b:null;
        var discriminant=b*b-4*a*c;if(discriminant<0)return null;
        var root=Math.sqrt(discriminant),one=(-b-root)/(2*a),two=(-b+root)/(2*a);
        var time=Math.min(one>0?one:Infinity,two>0?two:Infinity);return Number.isFinite(time)?time:null;
    }
    /** World-aligned proxy boxes in meters; bow narrows toward its tip. */
    var boxes=Array.from({length:8},/** @param {unknown} _ @param {number} i */function(_,i){var a=i/8,b=(i+1)/8;return {min:[-652.5+a*333,-45*Math.pow(b,.82),-36*Math.pow(b,1.2)],max:[-652.5+b*333,45*Math.pow(b,.82),36*Math.pow(b,1.2)]};});
    boxes.push({min:[-319.5,-47.5,-38],max:[697,47.5,38]},{min:[480,-27,38],max:[529,27,79]});
    /** Segment/AABB intersection, including starting inside. @param {Vector} a @param {Vector} b */
    function hullHit(a,b){
        var best=Infinity,normal=[0,0,0];
        boxes.forEach(function(box){
            var lo=0,hi=1,n=[0,0,0];
            for(var k=0;k<3;k++){
                var d=b[k]-a[k];
                if(Math.abs(d)<1e-10){if(a[k]<box.min[k]||a[k]>box.max[k])return;continue;}
                var near=(box.min[k]-a[k])/d,far=(box.max[k]-a[k])/d,sign=-1;
                if(near>far){var tmp=near;near=far;far=tmp;sign=1;}
                if(near>lo){lo=near;n=[0,0,0];n[k]=sign;}
                hi=Math.min(hi,far);if(lo>hi)return;
            }
            if(lo<=hi&&lo>=0&&lo<=1&&lo<best){best=lo;normal=n;}
        });
        return best===Infinity?null:{fraction:best,point:a.map(function(v,i){return v+(b[i]-v)*best;}),normal:normal};
    }
    /** @returns {import('./types').AegisFlightRig} */
    function create(){
        var asset=DW.aegisFlightAsset,origin=[0,0,1200];
        var weapon=Object.assign({},DW.retailWeapons[0],{name:'Aegis point defense',speed:2200,lifetime:.9,fireWait:.16,damage:3});
        /** @type {Map<string,Float32Array>} */var sharedVertices=new Map();
        var mounts=asset.turrets.map(function(t){
            var basis=new Float32Array([1,0,0,0,1,0,0,0,1]),pivot=/** @type {[number,number,number]} */(t.position.map(function(v,i){return v/U+origin[i];}));
            var batches=t.batches.map(function(b){
                var key=b.vertices.join(','),vertices=sharedVertices.get(key);
                if(!vertices){vertices=new Float32Array(b.vertices.map(function(v,i){return i%6<3?v/U:v;}));sharedVertices.set(key,vertices);}
                return {vertices:vertices,color:b.color,origin:pivot,basis:basis,staticGeometry:true};
            });
            return {source:t,yaw:0,elevation:0,targetId:'',guns:DW.flightGuns.create(),basis:basis,batches:batches};
        });
        sharedVertices.clear();
        /** @type {Batch[]} */var staticBatches=asset.batches.map(function(b){return {vertices:new Float32Array(b.vertices.map(function(v,i){return i%6<3?v/U:v;})),color:b.color,origin:/** @type {[number,number,number]} */(origin),staticGeometry:true};});
        /** @type {Vector|null} */var lastEye=null;
        var seconds=0,contacts=0,confirmedHits=0;
        /** @param {Vector} p */function local(p){return p.map(function(v,i){return (v-origin[i])*U;});}
        /** @param {Vector} p */function world(p){return p.map(function(v,i){return v/U+origin[i];});}
        function reset(){lastEye=null;seconds=0;contacts=0;confirmedHits=0;mounts.forEach(function(m,i){m.yaw=0;m.elevation=0;m.targetId='';m.guns=DW.flightGuns.create();m.guns.cooldown=i*.013;});}
        /** @param {number} elapsed @param {FlightView} view */
        function step(elapsed,view){
            if(!Number.isFinite(elapsed)||elapsed<=0)return;
            var dt=Math.min(.1,elapsed),combat=view.combat;seconds+=dt;
            if(lastEye){var collision=hullHit(local(lastEye),local(view.state.eye));if(collision){
                var normal=collision.normal;view.state.eye=world(collision.point.map(function(v,i){return v+normal[i]*3;}));
                view.state.velocity=[0,0,0];view.state.ramp=[0,0,0];view.state.throttle=0;contacts++;
            }}lastEye=view.state.eye.slice();
            var targets=DW.training.alive(combat).filter(function(c){return c.team!=='ally';}).map(function(c){return {craft:c,position:local(c.pose.eye)};});
            mounts.forEach(function(m){
                // Main batteries await capital targets; fighter threats belong to small PD mounts.
                if(m.source.kind==='heavy')return;
                var p=m.source.position,side=m.source.side;
                // Convert each contact once, preserve a valid lock, otherwise choose nearest.
                var target=/** @type {import('./types').Craft|null} */(null),nearest=Infinity;
                for(var candidate of targets){
                    var q=candidate.position,dx=q[0]-p[0],dy=q[1]-p[1],dz=q[2]-p[2],distance2=dx*dx+dy*dy+dz*dz;
                    if(dz*side<=2||distance2>=1800*1800)continue;
                    if(candidate.craft.id===m.targetId){target=candidate.craft;break;}
                    if(distance2<nearest){nearest=distance2;target=candidate.craft;}
                }
                m.targetId=target?target.id:'';
                var goalYaw=0,goalElevation=side*.08,aim=/** @type {Vector|null} */(null);
                if(target){
                    var d=sub(local(target.pose.eye),p),flight=interceptTime(d,target.pose.velocity,weapon.speed);
                    if(flight!==null&&flight<=weapon.lifetime){
                        var travelTime=flight,velocity=target.pose.velocity;aim=target.pose.eye.map(function(v,i){return v+velocity[i]*travelTime/U;});
                        d=sub(local(aim),p);goalYaw=wrap(Math.atan2(d[1],d[0])-Math.PI);
                        goalElevation=side*clamp(Math.atan2(d[2]*side,Math.hypot(d[0],d[1])),0,Math.PI*.47);
                    }
                }
                m.yaw+=clamp(wrap(goalYaw-m.yaw),-2.8*dt,2.8*dt);
                m.elevation=approach(m.elevation,goalElevation,2.2*dt);
                var yaw=m.yaw,el=m.elevation;
                var forward=[-Math.cos(yaw)*Math.cos(el),-Math.sin(yaw)*Math.cos(el),Math.sin(el)];
                var up=[Math.cos(yaw)*Math.sin(el),Math.sin(yaw)*Math.sin(el),Math.cos(el)];
                var right=[-Math.sin(yaw),Math.cos(yaw),0];
                var ready=!!target&&!!aim&&Math.abs(wrap(goalYaw-m.yaw))<.035&&Math.abs(goalElevation-el)<.035;
                if(ready&&aim){var aimDirection=sub(local(aim),p),distance=Math.hypot.apply(null,aimDirection);if(dot(forward,aimDirection)/distance<.999)ready=false;var muzzle=p.map(function(v,i){return v+forward[i]*10.12;});if(hullHit(muzzle,local(aim)))ready=false;}
                DW.flightGuns.step(m.guns,{eye:world(p),right:right,up:up,back:forward.map(function(v){return -v;})},weapon,combat.enabled&&ready,dt,
                    function(a,b,bolt){
                        return DW.training.trace(combat,a,b,bolt,'player',hit,view.state,.25,function(){confirmedHits++;});
                    },
                    aim?function(){return aim;}:undefined,2,[[-1.683,9.9,-.099*side],[1.683,9.9,-.099*side]]);
            });
        }
        var renderBatches=staticBatches.concat(mounts.flatMap(function(m){return m.batches;}));
        /** @returns {Batch[]} */function geometry(){
            mounts.forEach(function(m){
                var cy=Math.cos(m.yaw),sy=Math.sin(m.yaw),ce=Math.cos(m.elevation),se=Math.sin(m.elevation),b=m.basis;
                // Column-major Rz(yaw) * Ry(elevation), shared by all material batches.
                b[0]=cy*ce;b[1]=sy*ce;b[2]=-se;b[3]=-sy;b[4]=cy;b[5]=0;b[6]=cy*se;b[7]=sy*se;b[8]=ce;
            });
            return renderBatches;
        }
        /** @param {Vector} a @param {Vector} b */function hit(a,b){var h=hullHit(local(a),local(b));return h?world(h.point):null;}
        /** @param {import('./types').Pose} pose */function effects(pose){return DW.flightGuns.geometry({bolts:mounts.flatMap(function(m){return m.guns.bolts;}),impacts:mounts.flatMap(function(m){return m.guns.impacts;})},pose);}
        function readout(){var shots=mounts.reduce(function(n,m){return n+m.guns.fired;},0);return 'AEGIS / 1,305 m\n12 heavy batteries standing by · 12 point-defense mounts\nPD: '+shots+' rounds / '+confirmedHits+' confirmed hits\n'+seconds.toFixed(1)+' s · '+contacts+' hull contacts';}
        function telemetry(){return {seconds:seconds,contacts:contacts,shots:mounts.reduce(function(n,m){return n+m.guns.fired;},0),hits:confirmedHits,mounts:mounts.map(function(m){return {yaw:m.yaw,elevation:m.elevation,side:m.source.side,kind:m.source.kind};})};}
        reset();return {reset:reset,step:step,geometry:geometry,effects:effects,readout:readout,hit:hit,telemetry:telemetry};
    }
    function load(){return new Promise(function(resolve,reject){if(DW.aegisFlightAsset){resolve(undefined);return;}var script=document.createElement('script');script.src='../assets/ships/aegis-kit/flight-rig.js';script.onload=function(){if(DW.aegisFlightAsset)resolve(undefined);else reject(new Error('Aegis rig asset did not register'));};script.onerror=function(){reject(new Error('Could not load the local Aegis rig asset'));};document.head.appendChild(script);});}
    DW.aegisFlight={create:create,load:load};
}());
