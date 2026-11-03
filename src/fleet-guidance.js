(function () {
    'use strict';
    /** All positions, velocities, radii and acceleration use SI units. No renderer or mission dependencies.
     * @typedef {{id:string,position:number[],velocity:number[],radius:number,crossRadius?:number,halfSize?:number[],forward?:number[],packet?:number,turnRate?:number,neighborIds?:string[],localGoal?:number[],cohesionError?:number,intent?:number[],targetSpeed?:number}} Body
     * @typedef {{position:number[],radius:number,weight:number}} Threat
     * @typedef {{anchor:number[],velocity:number[],offset:number[],forward:number[],slots:Record<string,number[]>,assignments:Record<string,string>,controlCountdown?:number,controls?:Record<string,Control>,settled?:boolean,cruiseRadius?:number,settleIterations?:number,settleShift?:number}} Formation
     */
    /** @typedef {{intent:number[],targetSpeed:number,neighborIds:string[],localGoal:number[],cohesionError:number}} Control */
    /** @param {number[]} v @param {number} limit */
    function capped(v,limit){var n=Math.hypot.apply(null,v);return v.map(function(x){return x*Math.min(1,limit/(n||1));});}
    /** @param {number[]} v @param {number[]} [fallback] */
    function unit(v,fallback){var n=Math.hypot.apply(null,v);return n>1e-8?v.map(function(x){return x/n;}):(fallback||[0,1,0]).slice();}
    /** Authored hulls face +Y. @param {number[]} forward */
    function frame(forward){var f=unit(forward),reference=Math.abs(f[2])<.98?[0,0,1]:[0,1,0],r=unit([f[1]*reference[2]-f[2]*reference[1],f[2]*reference[0]-f[0]*reference[2],f[0]*reference[1]-f[1]*reference[0]]);return {right:r,up:[r[1]*f[2]-r[2]*f[1],r[2]*f[0]-r[0]*f[2],r[0]*f[1]-r[1]*f[0]],back:f.map(function(v){return -v;})};}
    /** Stable opposite escape directions when a pair has no existing lateral offset.
     * @param {string} a @param {string} b @param {number[]} forward */
    function escapeSide(a,b,forward){var key=a<b?a+'|'+b:b+'|'+a,hash=2166136261;for(var i=0;i<key.length;i++)hash=Math.imul(hash^key.charCodeAt(i),16777619);var angle=(hash>>>0)/4294967296*Math.PI*2,axes=frame(forward),sign=a<b?1:-1;return axes.right.map(function(v,k){return sign*(v*Math.cos(angle)+axes.up[k]*Math.sin(angle));});}
    /** Initial geometry is a launch condition, never a persistent position target.
     * @param {Body[]} bodies @param {number[]} [forward] @param {number[][]} [template] @returns {Formation} */
    function create(bodies,forward,template){
        var anchor=[0,1,2].map(function(k){return bodies.reduce(function(n,b){return n+b.position[k];},0)/Math.max(1,bodies.length);});
        bodies.forEach(function(body){body.forward=unit(body.forward||body.velocity,forward);});
        return {anchor:anchor,velocity:[0,0,0],offset:[0,0,0],forward:unit(forward||[0,1,0]),slots:{},assignments:{}};
    }
    /** Preflight layout relaxation in a co-moving frame, not visible flight or assigned slots.
     * Infers a consensus course unless the mission supplies one. Keeps the original centroid.
     * @param {Body[]} bodies @param {{forward?:number[],speed?:number,iterations?:number}} [options] @returns {Formation} */
    function settle(bodies,options){
        options=options||{};
        var ordered=bodies.slice().sort(function(a,b){return a.id.localeCompare(b.id);}),initial=bodies.map(function(b){return b.position.slice();});
        var headings=ordered.map(function(b){return unit(b.forward||b.velocity);});
        var forward=unit(options.forward||[0,1,2].map(function(k){return headings.reduce(function(n,h){return n+h[k];},0);}),headings[0]);
        var speed=options.speed===undefined?ordered.reduce(function(n,b){return n+Math.hypot.apply(null,b.velocity);},0)/Math.max(1,bodies.length):options.speed;
        var group=create(bodies,forward),origin=group.anchor.slice(),axes=frame(forward),iterations=0;
        for(var tick=0;tick<(options.iterations===undefined?180:options.iterations);tick++){
            var changes=bodies.map(function(body){var move=[0,0,0];
                bodies.forEach(function(other){if(other===body)return;
                    var delta=body.position.map(function(v,k){return v-other.position[k];}),distance=Math.hypot.apply(null,delta),along=delta.reduce(function(n,v,k){return n+v*forward[k];},0),side=delta.map(function(v,k){return v-along*forward[k];}),width=Math.hypot.apply(null,side);
                    var beam=(body.crossRadius||body.radius)+(other.crossRadius||other.radius)+22,length=(body.halfSize?body.halfSize[1]:body.radius)+(other.halfSize?other.halfSize[1]:other.radius)+22;
                    var direction=width>1?unit(side):escapeSide(body.id,other.id,forward),q=Math.hypot(along/length,width/beam);
                    if(q<1.42)move=move.map(function(v,k){return v+direction[k]*(1.42-q)*8;});
                    var rear=other.halfSize?other.halfSize[1]:other.radius,wakeRadius=beam+Math.max(0,-along-rear)*.08;
                    if(along< -rear&&along> -rear-260&&width<wakeRadius+12)move=move.map(function(v,k){return v+direction[k]*(1-width/(wakeRadius+12))*4;});
                    var comfortable=body.packet!==undefined&&body.packet===other.packet?180:360;
                    if(distance>comfortable&&distance<700)move=move.map(function(v,k){return v-delta[k]/distance*Math.min(.12,(distance-comfortable)*.001);});
                });return capped(move,2);
            });
            var mean=[0,1,2].map(function(k){return changes.reduce(function(n,v){return n+v[k];},0)/Math.max(1,bodies.length);}),largest=0;
            bodies.forEach(function(body,i){var change=changes[i].map(function(v,k){return v-mean[k];});largest=Math.max(largest,Math.hypot.apply(null,change));body.position=body.position.map(function(v,k){return v+change[k];});});iterations=tick+1;if(largest<.025)break;
        }
        bodies.forEach(function(body){body.forward=forward.slice();body.velocity=forward.map(function(v){return v*speed;});delete body.intent;delete body.targetSpeed;delete body.localGoal;delete body.neighborIds;delete body.cohesionError;});
        group.anchor=origin;group.forward=forward;group.velocity=forward.map(function(v){return v*speed;});group.settled=true;group.settleIterations=iterations;
        group.settleShift=Math.max(0,...bodies.map(function(b,i){return Math.hypot.apply(null,b.position.map(function(v,k){return v-initial[i][k];}));}));
        group.cruiseRadius=Math.max(100,...bodies.map(function(b){var d=b.position.map(function(v,k){return v-origin[k];}),along=d.reduce(function(n,v,k){return n+v*forward[k];},0);return Math.hypot.apply(null,d)+50;}));return group;
    }
    /** Local flocking: predictive hull separation, velocity alignment, comfortable-distance
     * cohesion, route preference and directional exhaust avoidance. No per-ship slots.
     * The group centre is observed after integration; it never drags the actors.
     * @param {Formation} group @param {Body[]} bodies @param {number[]} route @param {number[]} cruise
     * @param {Threat[]} threats @param {number} dt */
    function step(group,bodies,route,cruise,threats,dt){
        if(!(dt>0)||!bodies.length)return;
        if(dt>.05){var steps=Math.ceil(dt/.05);for(var tick=0;tick<steps;tick++)step(group,bodies,route,cruise,threats,dt/steps);return;}
        var speed=Math.hypot.apply(null,cruise),travel=unit(cruise,group.forward);
        var center=[0,1,2].map(function(k){return bodies.reduce(function(n,b){return n+b.position[k];},0)/bodies.length;});
        var controls=group.controls||(group.controls={});
        bodies.forEach(function(body){var cached=controls[body.id];if(!body.intent&&cached){body.intent=cached.intent;body.targetSpeed=cached.targetSpeed;body.neighborIds=cached.neighborIds;body.localGoal=cached.localGoal;body.cohesionError=cached.cohesionError;}});
        group.controlCountdown=(group.controlCountdown||0)-dt;
        var assess=group.controlCountdown<=1e-8||bodies.some(function(b){return !b.intent;});
        if(assess){group.controlCountdown=.1;
        bodies.forEach(function(body){
            var forward=unit(body.forward||body.velocity,travel),basis=frame(forward);
            var nearby=bodies.filter(function(other){return other!==body&&Math.hypot.apply(null,other.position.map(function(v,k){return v-body.position[k];}))<500;}).sort(function(a,b){
                var da=Math.hypot.apply(null,a.position.map(function(v,k){return v-body.position[k];})),db=Math.hypot.apply(null,b.position.map(function(v,k){return v-body.position[k];}));return da-db||a.id.localeCompare(b.id);
            }).slice(0,10);
            var aligned=[0,0,0],cohesion=[0,0,0],avoid=[0,0,0],weight=0,urgency=0;
            nearby.forEach(function(other){
                var delta=body.position.map(function(v,k){return v-other.position[k];}),distance=Math.hypot.apply(null,delta),same=body.packet!==undefined&&body.packet===other.packet,w=same?2:1;
                weight+=w;aligned=aligned.map(function(v,k){return v+other.velocity[k]*w;});
                var comfortable=same?105:165,attraction=Math.max(0,distance-comfortable)*.026*w;
                cohesion=cohesion.map(function(v,k){return v-delta[k]/Math.max(1,distance)*attraction;});
                var otherForward=unit(other.forward||other.velocity,travel),relative=body.velocity.map(function(v,k){return v-other.velocity[k];}),relativeSpeed=relative.reduce(function(n,v){return n+v*v;},0);
                var horizon=Math.max(8,speed/1.2),closest=Math.max(0,Math.min(horizon,-delta.reduce(function(n,v,k){return n+v*relative[k];},0)/Math.max(.01,relativeSpeed)));
                var predicted=delta.map(function(v,k){return v+relative[k]*closest;});
                var axis=unit(forward.map(function(v,k){return v+otherForward[k]*(forward.reduce(function(n,x,j){return n+x*otherForward[j];},0)<0?-1:1);}),forward);
                var along=predicted.reduce(function(n,v,k){return n+v*axis[k];},0),side=predicted.map(function(v,k){return v-along*axis[k];}),sideLength=Math.hypot.apply(null,side);
                var beam=(body.crossRadius||body.radius)+(other.crossRadius||other.radius)+16,length=(body.halfSize?body.halfSize[1]:body.radius)+(other.halfSize?other.halfSize[1]:other.radius)+16;
                var parallel=Math.abs(forward.reduce(function(n,v,k){return n+v*otherForward[k];},0));
                var q=parallel>.8?Math.hypot(along/length,sideLength/beam):Math.hypot.apply(null,predicted)/length;
                if(q<1.35){
                    var severity=(1.35-q)*Math.max(.25,1-closest/horizon),direction=sideLength>2?unit(side):escapeSide(body.id,other.id,axis);
                    avoid=avoid.map(function(v,k){return v+direction[k]*severity*25;});urgency=Math.max(urgency,Math.min(1,severity));
                }
                // A widening aft cone discourages following another engine directly.
                var aft=delta.reduce(function(n,v,k){return n+v*otherForward[k];},0),wakeSide=delta.map(function(v,k){return v-aft*otherForward[k];}),wakeDistance=Math.hypot.apply(null,wakeSide);
                var rear=other.halfSize?other.halfSize[1]:other.radius,wakeRadius=beam+Math.max(0,-aft-rear)*.08;
                if(aft< -rear&&aft> -rear-260&&wakeDistance<wakeRadius){
                    var out=wakeDistance>2?unit(wakeSide):escapeSide(body.id,other.id,otherForward);
                    avoid=avoid.map(function(v,k){return v+out[k]*(1-wakeDistance/wakeRadius)*9;});
                }
            });
            var local=weight?aligned.map(function(v){return v/weight;}):cruise;
            cohesion=group.settled?[0,0,0]:capped(cohesion.map(function(v){return v/Math.max(1,weight);}),5);
            var routeDelta=route.map(function(v,k){return v-body.position[k];}),alongRoute=routeDelta.reduce(function(n,v,k){return n+v*travel[k];},0);
            var transverse=routeDelta.map(function(v,k){return v-alongRoute*travel[k];}),routeDistance=Math.hypot.apply(null,transverse),tube=group.settled?group.cruiseRadius||350:0;
            var corridor=capped(transverse.map(function(v){return v*.007*Math.max(0,1-tube/Math.max(1,routeDistance));}),3);
            var toFleet=center.map(function(v,k){return v-body.position[k];}),isolation=Math.hypot.apply(null,toFleet),regroup=isolation>Math.max(460,group.settled?group.cruiseRadius||0:0)?capped(toFleet.map(function(v){return v*.025;}),12):[0,0,0];
            var pressure=[0,0,0];threats.forEach(function(threat){var delta=body.position.map(function(v,k){return v-threat.position[k];}),d=Math.hypot.apply(null,delta),amount=threat.weight*Math.max(0,1-d/threat.radius);pressure=pressure.map(function(v,k){return v+delta[k]/Math.max(1,d)*amount*12;});});pressure=capped(pressure,18);
            var desired=cruise.map(function(v,k){return v*.65+local[k]*.35+cohesion[k]+corridor[k]+regroup[k]+pressure[k];});
            var safety=capped(avoid,22);desired=desired.map(function(v,k){return v+safety[k];});
            var targetSpeed=Math.min(speed*1.5,Math.hypot.apply(null,desired))*(1-urgency*.7),wanted=unit(desired,forward);
            body.intent=wanted;body.targetSpeed=targetSpeed;body.neighborIds=nearby.map(function(b){return b.id;});body.localGoal=body.position.map(function(v,k){return v+wanted[k]*200;});body.cohesionError=Math.max(0,isolation-Math.max(460,group.settled?group.cruiseRadius||0:0));controls[body.id]={intent:wanted,targetSpeed:targetSpeed,neighborIds:body.neighborIds,localGoal:body.localGoal,cohesionError:body.cohesionError};
        });var ids=new Set(bodies.map(function(b){return b.id;}));Object.keys(controls).forEach(function(id){if(!ids.has(id))delete controls[id];});}
        var states=bodies.map(function(body){
            var forward=unit(body.forward||body.velocity,travel),wanted=body.intent||travel,targetSpeed=body.targetSpeed===undefined?speed:body.targetSpeed;
            var alignment=Math.max(-1,Math.min(1,forward.reduce(function(n,v,k){return n+v*wanted[k];},0)));
            // Brake before a sharp course change. Turn only as fast as transverse
            // thrusters can bend the existing velocity, rather than crabbing sideways.
            targetSpeed*=Math.max(.25,alignment);
            var velocitySpeed=Math.hypot.apply(null,body.velocity);
            var angle=Math.acos(alignment),maxTurn=Math.min(body.turnRate||.045,.6/Math.max(5,velocitySpeed));
            var axis=[forward[1]*wanted[2]-forward[2]*wanted[1],forward[2]*wanted[0]-forward[0]*wanted[2],forward[0]*wanted[1]-forward[1]*wanted[0]];
            axis=unit(axis,frame(forward).up);var turn=Math.min(angle,maxTurn*dt),tangent=[axis[1]*forward[2]-axis[2]*forward[1],axis[2]*forward[0]-axis[0]*forward[2],axis[0]*forward[1]-axis[1]*forward[0]];
            var nose=unit(forward.map(function(v,k){return v*Math.cos(turn)+tangent[k]*Math.sin(turn);}),forward);
            var demand=nose.map(function(v,k){return (v*targetSpeed-body.velocity[k])/Math.max(.001,dt);}),longitudinal=demand.reduce(function(n,v,k){return n+v*nose[k];},0),longLimit=longitudinal<0?1.8:1.2;
            var axial=Math.max(-longLimit,Math.min(longLimit,longitudinal)),lateral=capped(demand.map(function(v,k){return v-longitudinal*nose[k];}),.75);
            var acceleration=capped(nose.map(function(v,k){return v*axial+lateral[k];}),1.83);
            return {forward:nose,velocity:body.velocity.map(function(v,k){return v+acceleration[k]*dt;})};
        });
        bodies.forEach(function(body,i){var state=states[i];body.forward=state.forward;body.velocity=state.velocity;body.position=body.position.map(function(v,k){return v+state.velocity[k]*dt;});});
        group.anchor=[0,1,2].map(function(k){return bodies.reduce(function(n,b){return n+b.position[k];},0)/bodies.length;});
        group.velocity=[0,1,2].map(function(k){return bodies.reduce(function(n,b){return n+b.velocity[k];},0)/bodies.length;});
        group.forward=travel;var error=group.anchor.map(function(v,k){return v-route[k];}),axial=error.reduce(function(n,v,k){return n+v*travel[k];},0);group.offset=error.map(function(v,k){return v-axial*travel[k];});
    }
    /** Generate coverage jobs around exposed/damaged protected ships, allocating each escort once.
     * Assignment hysteresis prevents small score changes from shuffling the entire screen.
     * @param {Formation} group @param {Body[]} protectedBodies @param {Body[]} escorts @param {Threat[]} threats
     * @returns {Record<string,number[]>} */
    function cover(group,protectedBodies,escorts,threats){
        /** @type {Record<string,number[]>} */var goals={};
        var escortIds=new Set(escorts.map(function(b){return b.id;}));
        Object.keys(group.assignments).forEach(function(id){if(!escortIds.has(id))delete group.assignments[id];});
        if(!protectedBodies.length){group.assignments={};return goals;}
        var claimed=new Set(/** @type {string[]} */([]));
        escorts.slice().sort(function(a,b){return a.id.localeCompare(b.id);}).forEach(function(escort){
            var best=protectedBodies[0],bestScore=-Infinity;
            protectedBodies.forEach(function(b){
                var danger=threats.reduce(function(n,t){return n+t.weight*Math.max(0,1-Math.hypot.apply(null,b.position.map(function(v,k){return v-t.position[k];}))/t.radius);},0);
                var exposure=Math.hypot.apply(null,b.position.map(function(v,k){return v-group.anchor[k];}));
                var travel=Math.hypot.apply(null,b.position.map(function(v,k){return v-escort.position[k];}));
                var score=danger*1800+exposure*.3-travel*.15-(claimed.has(b.id)?1200:0)+(group.assignments[escort.id]===b.id?160:0);
                if(score>bestScore){bestScore=score;best=b;}
            });
            claimed.add(best.id);group.assignments[escort.id]=best.id;
            var direction=best.position.map(function(v,k){return v-group.anchor[k];});
            if(threats.length){var nearest=threats.slice().sort(function(a,b){return Math.hypot.apply(null,a.position.map(function(v,k){return v-best.position[k];}))-Math.hypot.apply(null,b.position.map(function(v,k){return v-best.position[k];}));})[0];direction=nearest.position.map(function(v,k){return v-best.position[k];});}
            var length=Math.hypot.apply(null,direction);
            if(length<1){direction=[1,0,0];length=1;}
            direction=direction.map(function(v){return v/length;});
            // The supporting plane clears every protected hull, including interior assignments.
            var clearance=protectedBodies.reduce(function(n,b){return Math.max(n,b.position.reduce(function(sum,v,k){return sum+(v-best.position[k])*direction[k];},0)+b.radius+180);},best.radius+180);
            goals[escort.id]=best.position.map(function(v,k){return v+direction[k]*clearance+best.velocity[k]*3;});
        });return goals;
    }
    window.Driftworks.fleetGuidance={create:create,settle:settle,step:step,cover:cover,frame:frame};
}());
