(function () {
    'use strict';
    var DW=/** @type {Required<import('../src/types').DriftworksNamespace>} */(window.Driftworks),U=DW.sim.METERS_PER_UNIT;
    /** @typedef {number[]} V */
    /** @param {V} a @param {V} b */
    function dot(a,b){return -a[0]*b[0]+a[1]*b[1]+a[2]*b[2]+a[3]*b[3];}
    /** @param {V} a @param {V} b @param {number} x @param {number} y */
    function mix(a,b,x,y){return a.map(function(v,i){return v*x+b[i]*y;});}
    var points=/** @type {WeakMap<V,{radius:number,point:V}>} */(new WeakMap());
    /** Gans chart in scene units. Directions use a radially transported orthonormal gauge.
     * @param {V} eye @param {number} radius */
    function point(eye,radius){var old=points.get(eye);if(old&&old.radius===radius)return old.point;var x=eye.map(function(v){return v*U/radius;}),p=[Math.hypot(1,...x),...x];points.set(eye,{radius:radius,point:p});return p;}
    /** @param {V} p @param {number} radius */
    function chart(p,radius){return p.slice(1).map(function(v){return v*radius/U;});}
    /** @param {V} p @param {V} v */
    function lift(p,v){var t=p.slice(1).reduce(function(s,x,i){return s+x*v[i];},0);return [t,...v.map(function(x,i){return x+p[i+1]*t/(p[0]+1);})];}
    /** @param {V} p @param {V} v */
    function lower(p,v){return v.slice(1).map(function(x,i){return x-p[i+1]*v[0]/(p[0]+1);});}
    /** Stable radial-gauge holonomy without subtracting large boosted vectors.
     * @param {V} p @param {V} q @param {V} v */
    function rotateGauge(p,q,v){
        var ax=p[1]/(p[0]+1),ay=p[2]/(p[0]+1),az=p[3]/(p[0]+1),bx=q[1]/(q[0]+1),by=q[2]/(q[0]+1),bz=q[3]/(q[0]+1);
        var x=by*az-bz*ay,y=bz*ax-bx*az,z=bx*ay-by*ax,w=1-ax*bx-ay*by-az*bz,n=Math.hypot(x,y,z,w);x/=n;y/=n;z/=n;w/=n;
        var cx=y*v[2]-z*v[1],cy=z*v[0]-x*v[2],cz=x*v[1]-y*v[0];
        return [v[0]+2*(w*cx+y*cz-z*cy),v[1]+2*(w*cy+z*cx-x*cz),v[2]+2*(w*cz+x*cy-y*cx)];
    }
    /** @param {V} from @param {V} to @param {number} radius */
    function path(from,to,radius){
        var p=point(from,radius),q=point(to,radius),c=Math.max(1,-dot(p,q)),d=Math.acosh(c),v=lower(p,mix(q,p,1,-c)),n=Math.hypot(...v);
        return {direction:v.map(function(x){return x/(n||1);}),distance:d*radius/U};
    }
    /** @param {V} from @param {V} displacement @param {number} radius */
    function offset(from,displacement,radius){
        var p=point(from,radius),n=Math.hypot(...displacement);if(n<1e-14)return from.slice();
        var v=lift(p,displacement.map(function(x){return x/n;})),s=n*U/radius;
        return chart(mix(p,v,Math.cosh(s),Math.sinh(s)),radius);
    }
    /** @param {V} from @param {V} to @param {V} vector @param {number} radius */
    function transport(from,to,vector,radius){
        return rotateGauge(point(from,radius),point(to,radius),vector);
    }
    /** @param {V} from @param {V} direction @param {number} length @param {number} radius */
    function travel(from,direction,length,radius){
        var end=offset(from,direction.map(function(v){return v*length;}),radius);
        return {point:end,direction:transport(from,end,direction,radius)};
    }
    /** Apply curvature after the existing retail acceleration/rotation calculation.
     * @param {import('./types').FlightState} pose @param {V} before */
    function move(pose,before){
        var radius=pose.curvature;if(!radius)return;
        var after=offset(before,pose.eye.map(function(v,i){return v-before[i];}),radius);
        pose.right=transport(before,after,pose.right,radius);pose.up=transport(before,after,pose.up,radius);pose.back=transport(before,after,pose.back,radius);
        pose.velocity=transport(before,after,pose.velocity,radius);pose.eye=after;
    }
    /** Shared firing parameters, geodesic target prediction and launch travel time.
     * @param {import('./types').Pose} shooter @param {import('./types').Pose & {velocity:V}} target @param {import('./types').Weapon} weapon @param {number} radius @param {number} launch
     * @returns {import('./types').FiringSolution|null} */
    function lead(shooter,target,weapon,radius,launch){
        var speed=weapon.speed/U,life=weapon.lifetime,velocity=target.velocity.map(function(v){return v/U;});
        if(!(speed>0&&life>0))return null;
        /** @param {number} time */function sample(time){var future=offset(target.eye,velocity.map(function(v){return v*time;}),radius),route=path(shooter.eye,future,radius);return {direction:route.direction,distance:route.distance,time:time,point:future,region:shooter.region||0,error:route.distance-Math.min(launch/U,route.distance*.5)-speed*time};}
        // Distance changes no faster than target speed. For an ordinary slower
        // fighter the residual is monotonic: reject unreachable shots without
        // scanning the entire lifetime for every AI on every physics tick.
        if(Math.hypot(...velocity)<speed&&sample(life).error>0)return null;
        var value=sample(0);
        for(var i=0;i<12;i++){if(Math.abs(value.error)*U<.001)return value;var next=value.time+value.error/speed;if(next<0||next>life)break;value=sample(next);}
        var previous=sample(0);
        for(var k=1;k<=64;k++){var current=sample(life*k/64);if(previous.error>=0&&current.error<=0){var lo=previous.time,hi=current.time;for(var j=0;j<32;j++){var mid=sample((lo+hi)*.5);if(mid.error>0)lo=mid.time;else hi=mid.time;}var answer=sample((lo+hi)*.5);return Math.abs(answer.error)*U<.001?answer:null;}previous=current;}
        return null;
    }
    /** Preserve authored hulls in the craft's local Klein chart: geodesics are straight.
     * @param {import('./types').Craft} craft @param {V} start @param {V} end @param {number|undefined} boltRadius @param {(craft:import('./types').Craft,start:V,end:V,radius?:number)=>import('./types').Hit|null} flat */
    function hullHit(craft,start,end,boltRadius,flat){
        var radius=craft.pose.curvature||650,center=craft.pose.eye;
        // Intrinsic swept sphere is only a broad phase. Exact authored mesh
        // collision below still decides damage and returns original surface data.
        var p=point(start,radius),q=point(end,radius),target=point(center,radius);
        // Global Klein projection contracts physical distance and maps every
        // geodesic to a straight segment. Its Euclidean sphere is conservative
        // and needs no per-candidate acosh/atanh or temporary tangent vectors.
        var dx=q[1]/q[0]-p[1]/p[0],dy=q[2]/q[0]-p[2]/p[0],dz=q[3]/q[0]-p[3]/p[0];
        var x=target[1]/target[0]-p[1]/p[0],y=target[2]/target[0]-p[2]/p[0],z=target[3]/target[0]-p[3]/p[0],span=dx*dx+dy*dy+dz*dz;
        var fraction=span?Math.max(0,Math.min(1,(x*dx+y*dy+z*dz)/span)):0;
        // collision.radius is in scene units; native bolt-head radii are metres.
        // atanH(local Klein radius) bounds the authored hull's intrinsic extent.
        // r/(1-r) is a cheap conservative upper bound for atanH(r).
        var localRadius=(DW.flightCollision.radius(craft)*U+(boltRadius||0))/radius;
        var bound=localRadius<1?localRadius/(1-localRadius):Infinity;
        if((x-dx*fraction)**2+(y-dy*fraction)**2+(z-dz*fraction)**2>bound*bound)return null;
        /** @param {V} x */function local(x){var r=path(center,x,radius),length=radius/U*Math.tanh(r.distance*U/radius);return r.direction.map(function(v){return v*length;});}
        var pose=Object.assign({},craft.pose,{eye:[0,0,0],curvature:undefined});
        var hit=flat(Object.assign({},craft,{pose:pose}),local(start),local(end),boltRadius);if(!hit)return null;
        var n=Math.hypot(...hit.point),length=radius/U*Math.atanh(Math.min(1-1e-12,n*U/radius));
        var position=offset(center,hit.point.map(function(v){return v*length/(n||1);}),radius),total=path(start,end,radius).distance;
        return Object.assign({},hit,{point:position,fraction:total?Math.min(1,path(start,position,radius).distance/total):0});
    }
    /** Convert only presentation bases; source hull buffers/materials stay shared.
     * @param {import('./types').FlightView} view */
    function presentation(view){
        var radius=view.state.curvature;if(!radius)return view;
        /** @param {import('./types').ArtCraft} c */function craft(c){var p=point(c.pose.eye,radius||650);return Object.assign({},c,{pose:Object.assign({},c.pose,{right:lift(p,c.pose.right).slice(1),up:lift(p,c.pose.up).slice(1),back:lift(p,c.pose.back).slice(1)})});}
        return Object.assign({},view,{combat:Object.assign({},view.combat,{enemies:view.combat.enemies.map(craft),wrecks:view.combat.wrecks.map(craft)})});
    }
    /** Re-express a retained trajectory sample after the observer chart moved.
     * @param {import('./types').Pose} pose @param {import('./types').Pose} camera */
    function chartPose(pose,camera){
        if(!pose.curvature||pose.spaceFrame===camera.spaceFrame)return pose;
        var identity=[[1,0,0,0],[0,1,0,0],[0,0,1,0],[0,0,0,1]],old=pose.spaceFrame||identity,current=camera.spaceFrame||identity;
        /** @param {V} v */function transform(v){var source=v.map(function(_,i){return old[i].reduce(function(s,x,j){return s+x*v[j]*(i===0?-1:1)*(j===0?-1:1);},0);});return source.map(function(_,i){return current.reduce(function(s,col,j){return s+col[i]*source[j];},0);});}
        var p=point(pose.eye,pose.curvature),q=transform(p);
        return Object.assign({},pose,{spaceFrame:camera.spaceFrame,eye:chart(q,pose.curvature),right:lower(q,transform(lift(p,pose.right))),up:lower(q,transform(lift(p,pose.up))),back:lower(q,transform(lift(p,pose.back)))});
    }
    var gridSources=/** @type {Map<string,V>} */(new Map());
    /** World-fixed 160 m normal-coordinate grid, projected through the current isometry.
     * @param {import('./types').Pose} camera @param {number} w @param {number} h */
    function grid(camera,w,h){
        var radius=camera.curvature||650,frame=camera.spaceFrame||[[1,0,0,0],[0,1,0,0],[0,0,1,0],[0,0,0,1]],p=[frame[0][0],-frame[1][0],-frame[2][0],-frame[3][0]],n=Math.hypot(...p.slice(1)),d=Math.asinh(n),center=p.slice(1).map(function(v){return Math.floor(v*d*radius/(n||1)/160);});
        /** @type {V[]} */var result=[];
        for(var x=center[0]-6;x<=center[0]+6;x++)for(var y=center[1]-6;y<=center[1]+6;y++)for(var z=center[2]-6;z<=center[2]+6;z++){
            var key=radius+','+x+','+y+','+z,source=gridSources.get(key);
            if(!source){source=point(offset([0,0,0],[x*160/U,y*160/U,z*160/U],radius),radius);if(gridSources.size>32768)gridSources.clear();gridSources.set(key,source);}
            var q=[0,1,2,3].map(function(i){return frame.reduce(function(s,col,j){return s+col[i]*(source||[])[j];},0);}),range=Math.asinh(Math.hypot(...q.slice(1)))*radius;
            if(range<20||range>960)continue;var v=q.slice(1),depth=-v.reduce(function(s,a,i){return s+a*camera.back[i];},0);if(depth<=0)continue;
            var sx=v.reduce(function(s,a,i){return s+a*camera.right[i];},0)/depth/Math.tan(Math.PI/8)/(w/h),sy=v.reduce(function(s,a,i){return s+a*camera.up[i];},0)/depth/Math.tan(Math.PI/8);
            if(Math.abs(sx)>1.05||Math.abs(sy)>1.05)continue;result.push(chart(q,radius).map(function(v){return v*U;}));
        }
        return result;
    }
    /** Exact change of chart keeps long flights numerically near the player.
     * Rebase every owner, including private AI observations and in-flight bolts.
     * @param {import('./types').Combat} combat @param {(craft:import('./types').Craft)=>{position:V;velocity:V}|undefined} track */
    function rebase(combat,track){
        var radius=combat.player.pose.curvature;if(!radius)return;
        var origin=point(combat.player.pose.eye,radius),r=radius;
        if(Math.hypot(...origin.slice(1))<1e-12)return;
        /** @param {V} v */function transform(v){var spatial=origin.slice(1).reduce(function(s,x,i){return s+x*v[i+1];},0);return [origin[0]*v[0]-spatial,...v.slice(1).map(function(x,i){return x+origin[i+1]*(spatial/(origin[0]+1)-v[0]);})];}
        var cache=/** @type {Map<V,V>} */(new Map());
        /** @param {V} v */function position(v){var found=cache.get(v);if(found)return found;var result=chart(transform(point(v,r)),r);cache.set(v,result);return result;}
        /** @param {V} v @param {V} eye */function vector(v,eye){return rotateGauge(point(eye,r),origin,v);}
        /** @param {import('./types').Pose & {velocity:V}} pose */function pose(pose){var old=pose.eye;pose.right=vector(pose.right,old);pose.up=vector(pose.up,old);pose.back=vector(pose.back,old);pose.velocity=vector(pose.velocity,old);pose.eye=position(old);}
        var participants=[combat.player,...combat.enemies];
        participants.forEach(function(c){var observation=track(c);if(observation){observation.velocity=vector(observation.velocity,observation.position);observation.position=position(observation.position);}pose(c.pose);c.goal=position(c.goal);if(c.gunGoal)c.gunGoal=position(c.gunGoal);if(c.extensionGoal)c.extensionGoal=position(c.extensionGoal);if(c.reentryGoal)c.reentryGoal=position(c.reentryGoal);});
        combat.wrecks.forEach(function(w){w.axis=vector(w.axis,w.pose.eye);pose(w.pose);});
        new Set(participants.map(function(c){return c.guns;})).forEach(function(g){g.bolts.forEach(function(b){b.direction=vector(b.direction,b.position);b.position=position(b.position);});g.impacts.forEach(function(h){h.position=position(h.position);});});
        combat.flashes.forEach(function(f){if(f.velocity)f.velocity=vector(f.velocity,f.position);f.position=position(f.position);});
        // Retain the chart transform for world-fixed grid and trajectory history.
        var sky=combat.player.pose.spaceFrame||[[1,0,0,0],[0,1,0,0],[0,0,1,0],[0,0,0,1]];
        combat.player.pose.spaceFrame=sky.map(transform);
    }
    DW.flightHyperbolic={point:point,chart:chart,lift:lift,lower:lower,path:path,offset:offset,transport:transport,travel:travel,move:move,lead:lead,hullHit:hullHit,presentation:presentation,rebase:rebase,chartPose:chartPose,grid:grid};
}());
