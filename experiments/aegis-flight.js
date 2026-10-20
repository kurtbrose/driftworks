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
        var weapon=Object.assign({},DW.retailWeapons[0],{name:'Aegis twin battery',speed:950,lifetime:3,fireWait:.7,damage:14});
        var mounts=asset.turrets.map(function(t,i){return {source:t,yaw:0,elevation:0,guns:DW.flightGuns.create()};});
        /** @type {Batch[]} */var staticBatches=asset.batches.map(function(b){return {vertices:new Float32Array(b.vertices.map(function(v,i){return i%6<3?v/U:v;})),color:b.color,origin:/** @type {[number,number,number]} */(origin),staticGeometry:true};});
        /** @type {Vector|null} */var lastEye=null;
        var seconds=0,contacts=0;
        /** @param {Vector} p */function local(p){return p.map(function(v,i){return (v-origin[i])*U;});}
        /** @param {Vector} p */function world(p){return p.map(function(v,i){return v/U+origin[i];});}
        function reset(){lastEye=null;seconds=0;contacts=0;mounts.forEach(function(m,i){m.yaw=0;m.elevation=0;m.guns=DW.flightGuns.create();m.guns.cooldown=i*.06;});}
        /** @param {number} elapsed @param {FlightView} view */
        function step(elapsed,view){
            if(!Number.isFinite(elapsed)||elapsed<=0)return;
            var dt=Math.min(.1,elapsed),combat=view.combat;seconds+=dt;
            if(lastEye){var collision=hullHit(local(lastEye),local(view.state.eye));if(collision){
                var normal=collision.normal;view.state.eye=world(collision.point.map(function(v,i){return v+normal[i]*3;}));
                view.state.velocity=[0,0,0];view.state.ramp=[0,0,0];view.state.throttle=0;contacts++;
            }}lastEye=view.state.eye.slice();
            var targets=DW.training.alive(combat).filter(function(c){return c.team!=='ally';});
            mounts.forEach(function(m){
                var p=m.source.position,side=m.source.side;
                var target=targets.filter(function(c){var d=sub(local(c.pose.eye),p);return d[2]*side>2&&Math.hypot.apply(null,d)<2400;}).sort(function(a,b){return Math.hypot.apply(null,sub(local(a.pose.eye),p))-Math.hypot.apply(null,sub(local(b.pose.eye),p));})[0];
                var goalYaw=0,goalElevation=side*.08,aim=/** @type {Vector|null} */(null);
                if(target){
                    var d=sub(local(target.pose.eye),p),flight=Math.hypot.apply(null,d)/weapon.speed;
                    aim=target.pose.eye.map(function(v,i){return v+target.pose.velocity[i]*Math.min(2,flight)/U;});
                    d=sub(local(aim),p);goalYaw=wrap(Math.atan2(d[1],d[0])-Math.PI);
                    goalElevation=side*clamp(Math.atan2(d[2]*side,Math.hypot(d[0],d[1])),0,Math.PI*.44);
                }
                m.yaw+=clamp(wrap(goalYaw-m.yaw),-.45*dt,.45*dt);
                m.elevation=approach(m.elevation,goalElevation,.3*dt);
                var yaw=m.yaw,el=m.elevation;
                var forward=[-Math.cos(yaw)*Math.cos(el),-Math.sin(yaw)*Math.cos(el),Math.sin(el)];
                var up=[Math.cos(yaw)*Math.sin(el),Math.sin(yaw)*Math.sin(el),Math.cos(el)];
                var right=[-Math.sin(yaw),Math.cos(yaw),0];
                var ready=!!target&&!!aim&&Math.abs(wrap(goalYaw-m.yaw))<.035&&Math.abs(goalElevation-el)<.035;
                if(ready&&aim){var aimDirection=sub(local(aim),p),distance=Math.hypot.apply(null,aimDirection);if(dot(forward,aimDirection)/distance<.999)ready=false;var muzzle=p.map(function(v,i){return v+forward[i]*46;});if(hullHit(muzzle,local(aim)))ready=false;}
                DW.flightGuns.step(m.guns,{eye:world(p),right:right,up:up,back:forward.map(function(v){return -v;})},weapon,combat.enabled&&ready,dt,
                    function(a,b,bolt){return DW.training.trace(combat,a,b,bolt,'player',hit,view.state);},
                    aim?function(){return aim;}:undefined,2,[[-7.65,45,-.45*side],[7.65,45,-.45*side]]);
            });
        }
        /** @returns {Batch[]} */function geometry(){
            return staticBatches.concat(mounts.flatMap(function(m){
                var cy=Math.cos(m.yaw),sy=Math.sin(m.yaw),ce=Math.cos(m.elevation),se=Math.sin(m.elevation),p=m.source.position;
                return m.source.batches.map(function(b){var data=new Float32Array(b.vertices.length);
                    for(var i=0;i<data.length;i+=3){var x=b.vertices[i],y=b.vertices[i+1],z=b.vertices[i+2];
                        var xx=x*ce+z*se,zz=-x*se+z*ce;
                        var v=[xx*cy-y*sy,xx*sy+y*cy,zz],position=i%6===0;
                        for(var k=0;k<3;k++)data[i+k]=position?(v[k]+p[k])/U:v[k];
                    }return {vertices:data,color:b.color,origin:/** @type {[number,number,number]} */(origin)};
                });
            }));
        }
        /** @param {Vector} a @param {Vector} b */function hit(a,b){var h=hullHit(local(a),local(b));return h?world(h.point):null;}
        /** @param {import('./types').Pose} pose */function effects(pose){return DW.flightGuns.geometry({bolts:mounts.flatMap(function(m){return m.guns.bolts;}),impacts:mounts.flatMap(function(m){return m.guns.impacts;})},pose);}
        function readout(){return 'AEGIS / 1,305 m / '+mounts.length+' tracking batteries / '+mounts.reduce(function(n,m){return n+m.guns.fired;},0)+' rounds\nAllied support ship · W/S throttle · fly above or below to inspect · hull contact stops the fighter\n'+seconds.toFixed(1)+' s · '+contacts+' hull contacts';}
        function telemetry(){return {seconds:seconds,contacts:contacts,shots:mounts.reduce(function(n,m){return n+m.guns.fired;},0),hits:mounts.reduce(function(n,m){return n+m.guns.hits;},0),mounts:mounts.map(function(m){return {yaw:m.yaw,elevation:m.elevation,side:m.source.side};})};}
        reset();return {reset:reset,step:step,geometry:geometry,effects:effects,readout:readout,hit:hit,telemetry:telemetry};
    }
    function load(){return new Promise(function(resolve,reject){if(DW.aegisFlightAsset){resolve(undefined);return;}var script=document.createElement('script');script.src='../assets/ships/aegis-kit/flight-rig.js';script.onload=function(){if(DW.aegisFlightAsset)resolve(undefined);else reject(new Error('Aegis rig asset did not register'));};script.onerror=function(){reject(new Error('Could not load the local Aegis rig asset'));};document.head.appendChild(script);});}
    DW.aegisFlight={create:create,load:load};
}());


