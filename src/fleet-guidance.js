(function () {
    'use strict';
    /** All positions, velocities, radii and acceleration use SI units. No renderer or mission dependencies.
     * @typedef {{id:string,position:number[],velocity:number[],radius:number}} Body
     * @typedef {{position:number[],radius:number,weight:number}} Threat
     * @typedef {{anchor:number[],velocity:number[],offset:number[],forward:number[],slots:Record<string,number[]>,assignments:Record<string,string>}} Formation
     */
    /** @param {number[]} v @param {number} limit */
    function capped(v,limit){var n=Math.hypot.apply(null,v);return v.map(function(x){return x*Math.min(1,limit/(n||1));});}
    /** Compact ball with unique transverse exhaust corridors. The caller supplies ship-forward;
     * projected clearance is conservative for every fore/aft pair, irrespective of wash length.
     * @param {Body[]} bodies @param {number[]} [forward] @returns {Formation} */
    function create(bodies,forward){
        var axis=forward||[0,1,0],length=Math.hypot.apply(null,axis)||1;axis=axis.map(function(v){return v/length;});
        if(Math.hypot.apply(null,axis)<.5)axis=[0,1,0];
        var reference=Math.abs(axis[2])<.9?[0,0,1]:[0,1,0];
        var right=[axis[1]*reference[2]-axis[2]*reference[1],axis[2]*reference[0]-axis[0]*reference[2],axis[0]*reference[1]-axis[1]*reference[0]],size=Math.hypot.apply(null,right);
        right=right.map(function(v){return v/size;});
        var up=[right[1]*axis[2]-right[2]*axis[1],right[2]*axis[0]-right[0]*axis[2],right[0]*axis[1]-right[1]*axis[0]];
        var anchor=[0,1,2].map(function(k){return bodies.reduce(function(n,b){return n+b.position[k];},0)/Math.max(1,bodies.length);});
        var spacing=2*bodies.reduce(function(n,b){return Math.max(n,b.radius);},0)+80,ring=Math.ceil(Math.sqrt(bodies.length));
        /** @type {number[][]} */var cells=[];
        for(var row=-ring;row<=ring;row++)for(var col=-ring;col<=ring;col++)cells.push([(col+row*.5)*spacing,row*Math.sqrt(3)/2*spacing]);
        cells.sort(function(a,b){return Math.hypot.apply(null,a)-Math.hypot.apply(null,b)||a[0]-b[0]||a[1]-b[1];});cells=cells.slice(0,bodies.length);
        var radius=cells.reduce(function(n,p){return Math.max(n,Math.hypot.apply(null,p));},0)+spacing*.5;
        var available=cells.map(function(p,i){var depth=Math.sin(i*2.399963)*Math.sqrt(Math.max(0,radius*radius-p[0]*p[0]-p[1]*p[1]))*.85;return axis.map(function(v,k){return right[k]*p[0]+up[k]*p[1]+v*depth;});});
        var centroid=[0,1,2].map(function(k){return available.reduce(function(n,p){return n+p[k];},0)/Math.max(1,available.length);});
        available=available.map(function(p){return p.map(function(v,k){return v-centroid[k];});});
        /** @type {Record<string,number[]>} */var slots={};
        bodies.slice().sort(function(a,b){return a.id.localeCompare(b.id);}).forEach(function(b){
            var best=0,cost=Infinity;available.forEach(function(p,i){var d=Math.hypot.apply(null,p.map(function(v,k){return anchor[k]+v-b.position[k];}));if(d<cost){cost=d;best=i;}});
            slots[b.id]=available.splice(best,1)[0];
        });
        return {anchor:anchor,velocity:[0,0,0],offset:[0,0,0],forward:axis,slots:slots,assignments:{}};
    }
    /** A threat-weighted diversion in the plane perpendicular to travel. Symmetric threats cancel.
     * @param {Formation} group @param {Threat[]} threats @param {number[]} forward */
    function diversion(group,threats,forward){
        var out=[0,0,0];threats.forEach(function(t){
            var delta=group.anchor.map(function(v,k){return v-t.position[k];}),distance=Math.hypot.apply(null,delta),along=delta.reduce(function(n,v,k){return n+v*forward[k];},0);
            if(distance>t.radius||distance<1)return;
            var lateral=delta.map(function(v,k){return v-forward[k]*along;}),length=Math.hypot.apply(null,lateral);
            if(length<1)return;
            var amount=t.weight*(1-distance/t.radius)*350;
            out=out.map(function(v,k){return v+lateral[k]/length*amount;});
        });return capped(out,350);
    }
    /** Bounded acceleration, feed-forward slot pursuit and predictive clearance. Actors never teleport.
     * The caller supplies a route point/velocity, not per-ship positions.
     * @param {Formation} group @param {Body[]} bodies @param {number[]} route @param {number[]} cruise
     * @param {Threat[]} threats @param {number} dt */
    function step(group,bodies,route,cruise,threats,dt){
        if(!(dt>0)||!bodies.length)return;
        var memberIds=new Set(bodies.map(function(b){return b.id;}));
        Object.keys(group.slots).forEach(function(id){if(!memberIds.has(id))delete group.slots[id];});
        var missing=bodies.filter(function(b){return !group.slots[b.id];});
        if(missing.length){
            var proposal=create(bodies,group.forward),spacing=2*bodies.reduce(function(n,b){return Math.max(n,b.radius);},0)+80;
            var axis=Math.abs(group.forward[0])<.9?[1,0,0]:[0,1,0],dot=axis.reduce(function(n,v,k){return n+v*group.forward[k];},0);
            var right=axis.map(function(v,k){return v-dot*group.forward[k];}),length=Math.hypot.apply(null,right);right=right.map(function(v){return v/length;});
            var up=[right[1]*group.forward[2]-right[2]*group.forward[1],right[2]*group.forward[0]-right[0]*group.forward[2],right[0]*group.forward[1]-right[1]*group.forward[0]];
            missing.forEach(function(b){
                var occupied=Object.keys(group.slots).map(function(id){return group.slots[id];});
                var candidates=occupied.flatMap(function(p){return [0,1,2,3,4,5].map(function(i){return p.map(function(v,k){return v+(right[k]*Math.cos(i*Math.PI/3)+up[k]*Math.sin(i*Math.PI/3))*spacing;});});});
                if(!candidates.length)candidates.push(proposal.slots[b.id]);
                candidates=candidates.filter(function(slot){return occupied.every(function(p){var delta=slot.map(function(v,k){return v-p[k];}),along=delta.reduce(function(n,v,k){return n+v*group.forward[k];},0);return Math.hypot.apply(null,delta.map(function(v,k){return v-along*group.forward[k];}))>=spacing-1e-6;});});
                // Expand the compact perimeter, rather than append newcomers down a trailing column.
                candidates.sort(function(a,b){return Math.hypot.apply(null,a)-Math.hypot.apply(null,b);});
                group.slots[b.id]=candidates[0]||proposal.slots[b.id];
            });
        }
        if(dt>.1){var count=Math.ceil(dt/.1);for(var tick=0;tick<count;tick++)step(group,bodies,route,cruise,threats,dt/count);return;}
        var speed=Math.hypot.apply(null,cruise),forward=cruise.map(function(v){return v/(speed||1);}),avoid=diversion(group,threats,forward);
        group.offset=group.offset.map(function(v,k){return v+(avoid[k]-v)*(1-Math.exp(-dt/12));});
        var error=bodies.reduce(function(n,b){var p=group.slots[b.id];return p?Math.max(n,Math.hypot.apply(null,p.map(function(v,k){return group.anchor[k]+v-b.position[k];}))):n;},0);
        var cohesion=Math.max(0,1-Math.max(0,error-100)/500);
        var desired=capped(route.map(function(v,k){return cruise[k]*cohesion+(v+group.offset[k]-group.anchor[k])*.08;}),speed*1.15*cohesion);
        var change=capped(desired.map(function(v,k){return v-group.velocity[k];}),.7*dt);
        group.velocity=group.velocity.map(function(v,k){return v+change[k];});
        group.anchor=group.anchor.map(function(v,k){return v+group.velocity[k]*dt;});
        var velocities=bodies.map(function(b){
            var slot=group.slots[b.id];if(!slot)return b.velocity.slice();
            var wanted=slot.map(function(v,k){return group.velocity[k]+(group.anchor[k]-group.velocity[k]*dt+v-b.position[k])*.12;});
            bodies.forEach(function(other){if(other===b)return;
                var delta=b.position.map(function(v,k){return v-other.position[k]+(b.velocity[k]-other.velocity[k])*3;}),distance=Math.hypot.apply(null,delta),safe=b.radius+other.radius+25;
                if(distance<safe&&distance>1e-6)wanted=wanted.map(function(v,k){return v+delta[k]/distance*(safe-distance)*.5;});
            });
            wanted=capped(wanted,speed*1.6);
            var acceleration=capped(wanted.map(function(v,k){return v-b.velocity[k];}),1.2*dt);
            return b.velocity.map(function(v,k){return v+acceleration[k];});
        });
        bodies.forEach(function(b,i){b.velocity=velocities[i];b.position=b.position.map(function(v,k){return v+b.velocity[k]*dt;});});
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
    window.Driftworks.fleetGuidance={create:create,step:step,cover:cover};
}());
