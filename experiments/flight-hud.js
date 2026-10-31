(function () {
    'use strict';
    /** @typedef {import('../src/types').DriftworksNamespace} DriftworksNamespace */
    /** @typedef {import('./types').HudView} HudView */
    /** @typedef {import('./types').RadarContact} RadarContact */
    /** @typedef {import('./types').Vector} Vector */
    var get = /** @type {Required<DriftworksNamespace>} */ (window.Driftworks).experimentDom(document);
    var DW = /** @type {Required<DriftworksNamespace>} */ (window.Driftworks);
    /** @typedef {{ id: string, shield: number, hull: number, shieldTrail: number, hullTrail: number, shieldAge: number, hullAge: number, flash: number, time: number }} TargetStatus */
    /** @param {TargetStatus | null} previous @param {{id: string, shield?: number, maxShield?: number, hp: number, maxHp: number} | undefined} target @param {number} time @returns {TargetStatus | null} */
    function targetStatus(previous, target, time) {
        if (!target) return null;
        var shield = Math.max(0, Math.min(1, (target.shield || 0) / (target.maxShield || 1)));
        var hull = Math.max(0, Math.min(1, target.hp / Math.max(1, target.maxHp)));
        if (!previous || previous.id !== target.id || time < previous.time)
            return {id: target.id, shield: shield, hull: hull, shieldTrail: shield, hullTrail: hull, shieldAge: 0, hullAge: 0, flash: 0, time: time};
        var dt = Math.max(0, time - previous.time);
        var shieldAge = shield < previous.shield ? 0 : previous.shieldAge + dt;
        var hullAge = hull < previous.hull ? 0 : previous.hullAge + dt;
        return {id: target.id, shield: shield, hull: hull,
            shieldTrail: shieldAge >= .5 ? shield : Math.max(shield, previous.shieldTrail),
            hullTrail: hullAge >= .5 ? hull : Math.max(hull, previous.hullTrail),
            shieldAge: shieldAge, hullAge: hullAge,
            flash: previous.shield > 0 && shield === 0 ? .22 : Math.max(0, previous.flash - dt), time: time};
    }
    /** Fixed screen-pixel meters below the range label leave the target unobstructed.
     * @param {import('./gpu-ui-types').PaintContext} ctx @param {number} x @param {number} y @param {TargetStatus} status */
    function paintTargetStatus(ctx, x, y, status) {
        ctx.save();
        [{y: y + 39, value: status.shield, trail: status.shieldTrail, age: status.shieldAge, color: '#719fe0'},
         {y: y + 47, value: status.hull, trail: status.hullTrail, age: status.hullAge,
          color: status.hull <= .25 ? '#e57469' : status.hull <= .5 ? '#d8b15e' : '#82c68b'}].forEach(function (bar) {
            ctx.globalAlpha = .95;
            ctx.fillStyle = '#05090f';
            ctx.fillRect(x - 27, bar.y - 2, 54, 8);
            ctx.fillStyle = '#38424e';
            ctx.fillRect(x - 25, bar.y, 50, 4);
            ctx.globalAlpha = Math.max(0, 1 - bar.age / .5) * .7;
            ctx.fillStyle = '#d5dce5';
            ctx.fillRect(x - 25 + bar.value * 50, bar.y, Math.max(0, bar.trail - bar.value) * 50, 4);
            ctx.globalAlpha = 1;
            ctx.fillStyle = bar.color;
            ctx.fillRect(x - 25, bar.y, bar.value * 50, 4);
        });
        if (status.flash > 0) {
            ctx.globalAlpha = status.flash / .22 * .7;
            ctx.strokeStyle = '#9bbce9';
            ctx.lineWidth = 2;
            ctx.strokeRect(x - 27, y + 37, 54, 8);
        }
        ctx.restore();
    }
    /** Brief chart-crossing confirmation; the spatial lattice lives in the sky optics.
     * @param {import('./gpu-ui-types').PaintContext} ctx @param {number} w @param {number} h
     * @param {import('./types').Pose} pose @param {import('./types').EllisCue} cue */
    function paintThroatGuide(ctx,w,h,pose,cue){
        if(cue.flash<=0)return;
        ctx.save();var width=Math.min(320,w-32),x=(w-width)/2,y=h*.5+55;
        ctx.fillStyle='rgba(5,15,25,.72)';ctx.strokeStyle='rgba(174,172,245,.4)';ctx.fillRect(x,y,width,33);ctx.strokeRect(x,y,width,33);
        ctx.textAlign='center';ctx.fillStyle='#d2d1ff';ctx.font='12px monospace';
        ctx.fillText('THROAT CROSSED / '+(cue.region?'RIME':'ASTEROID'),w/2,y+21);ctx.restore();
    }
    /** @param {import('./gpu-ui-types').PaintContext} ctx @param {number} w @param {number} h @param {number} angle */
    function paintTargetBearing(ctx, w, h, angle) {
        var dx = Math.cos(angle), dy = Math.sin(angle);
        var edge = Math.min(w * .44 / Math.max(.001, Math.abs(dx)), h * .34 / Math.max(.001, Math.abs(dy)));
        ctx.save();
        ctx.translate(w / 2 + dx * edge, h / 2 + dy * edge);
        ctx.rotate(angle);
        ctx.beginPath();
        ctx.moveTo(20, 0); ctx.lineTo(-12, -12); ctx.lineTo(-6, 0); ctx.lineTo(-12, 12); ctx.closePath();
        ctx.strokeStyle = '#05090f'; ctx.lineWidth = 4; ctx.stroke();
        ctx.fillStyle = '#ffe7a3'; ctx.fill();
        ctx.restore();
        ctx.save();
        ctx.translate(w / 2 + dx * 76, h / 2 + dy * 76);
        ctx.rotate(angle);
        ctx.beginPath();
        [-7, 5].forEach(function (x) { ctx.moveTo(x - 7, -10); ctx.lineTo(x + 3, 0); ctx.lineTo(x - 7, 10); });
        ctx.strokeStyle = '#05090f'; ctx.lineWidth = 7; ctx.stroke();
        ctx.strokeStyle = '#ffe7a3'; ctx.lineWidth = 3; ctx.stroke();
        ctx.restore();
    }
    var predictFlightPath=DW.flightPrediction.predictPath;
    /** Curved road paint in transported floor/ceiling planes, clear of the crosshair.
     * @param {import('./gpu-ui-types').PaintContext} ctx @param {number} w @param {number} h
     * @param {import('./types').Pose} camera @param {number} units
     * @param {import('./types').FlightPathSample[]} path
     * @param {number} width @param {number} opacity @param {number} [phase] @param {boolean} [outerFour] */
    function paintFlightLanes(ctx,w,h,camera,units,path,width,opacity,phase,outerFour) {
        if(camera.curvature)path=path.map(function(p){return Object.assign({},p,{pose:DW.flightHyperbolic.chartPose(p.pose,camera)});});
        if(path.length<2||!(w>0&&h>0&&units>0&&opacity>0))return;
        var focal=1/Math.tan(Math.PI/8),aspect=w/h,half=Math.max(3,Math.min(24,width/2))/units;
        var floor=Math.max(3,width*.25)/units,aim=Math.max(40,Math.min(72,h*.075))+3;
        var period=20,paint=8,horizon=path[path.length-1].seconds;
        phase=((phase||0)%period+period)%period;
        /** @param {number[]} a @param {number[]} b @param {number} t */
        function between(a,b,t){return a.map(function(v,k){return v+(b[k]-v)*t;});}
        /** @param {number[]} point */
        function project(point){
            var x=(point[0]-camera.eye[0])*units,y=(point[1]-camera.eye[1])*units,z=(point[2]-camera.eye[2])*units;
            return [(x*camera.right[0]+y*camera.right[1]+z*camera.right[2])*focal/aspect,
                (x*camera.up[0]+y*camera.up[1]+z*camera.up[2])*focal,
                -(x*camera.back[0]+y*camera.back[1]+z*camera.back[2])];
        }
        /** @param {number[]} a @param {number[]} b @returns {number[][]|null} */
        function clip(a,b){
            var lo=0,hi=1,fa=[a[2]-.5,a[2]+a[0],a[2]-a[0],a[2]+a[1],a[2]-a[1]],
                fb=[b[2]-.5,b[2]+b[0],b[2]-b[0],b[2]+b[1],b[2]-b[1]];
            for(var k=0;k<5;k++){
                if(fa[k]<0&&fb[k]<0)return null;
                if(fa[k]<0)lo=Math.max(lo,fa[k]/(fa[k]-fb[k]));
                if(fb[k]<0)hi=Math.min(hi,fa[k]/(fa[k]-fb[k]));
            }
            if(lo>=hi)return null;
            var x=between(a,b,lo),y=between(a,b,hi);
            return [[(x[0]/x[2]+1)*w/2,(1-x[1]/x[2])*h/2],[(y[0]/y[2]+1)*w/2,(1-y[1]/y[2])*h/2]];
        }
        /** @param {number[]} a @param {number[]} b @returns {number[][][]} */
        function clearAim(a,b){
            var x=a[0]-w/2,y=a[1]-h/2,dx=b[0]-a[0],dy=b[1]-a[1],aa=dx*dx+dy*dy;
            if(aa<1e-10)return [];
            var bb=2*(x*dx+y*dy),cc=x*x+y*y-aim*aim,disc=bb*bb-4*aa*cc;
            if(disc<=0)return cc>=0?[[a,b]]:[];
            var first=(-bb-Math.sqrt(disc))/(2*aa),last=(-bb+Math.sqrt(disc))/(2*aa);
            if(last<=0||first>=1)return [[a,b]];
            /** @type {number[][][]} */var result=[];
            if(first>0)result.push([a,between(a,b,first)]);
            if(last<1)result.push([between(a,b,last),b]);
            return result;
        }
        ctx.save();
        var dividers=outerFour?[-2,2]:[-1,1];
        var planes=outerFour?[-1,1]:[-1];
        planes.forEach(function(plane){dividers.forEach(function(side){
            /** @type {number[][]} */var run=[];
            var runAlpha=0,runDash=-1;
            function flush(){
                if(run.length>1){
                    ctx.beginPath();ctx.moveTo(run[0][0],run[0][1]);
                    for(var n=1;n<run.length;n++)ctx.lineTo(run[n][0],run[n][1]);
                    ctx.globalAlpha=runAlpha*.85;ctx.strokeStyle='#020a12';ctx.lineWidth=5.5;if(ctx.smoothStroke)ctx.smoothStroke();else ctx.stroke();
                    ctx.globalAlpha=runAlpha;ctx.strokeStyle='#9aeeff';ctx.lineWidth=2.5;if(ctx.smoothStroke)ctx.smoothStroke();else ctx.stroke();
                }
                run=[];
            }
            /** @param {import('./types').Pose} pose */
            function lane(pose){var delta=pose.eye.map(function(_,k){return pose.right[k]*half*side+pose.up[k]*floor*plane*(outerFour?2:1);});return project(camera.curvature?DW.flightHyperbolic.offset(pose.eye,delta,camera.curvature):pose.eye.map(function(v,k){return v+delta[k];}));}
            var previous=lane(path[0].pose);
            for(var i=1;i<path.length;i++){
                var next=lane(path[i].pose),d0=path[i-1].distance,d1=path[i].distance,span=d1-d0;
                if(span<1e-8){previous=next;continue;}
                var cursor=d0;
                while(cursor<d1-1e-8){
                    var global=phase+cursor,dash=Math.floor((global+1e-8)/period),on=global-dash*period<paint-1e-8;
                    var end=Math.min(d1,dash*period+(on?paint:period)-phase);
                    if(end<=cursor+1e-8){cursor+=1e-7;continue;}
                    if(!on){flush();cursor=end;continue;}
                    var t0=(cursor-d0)/span,t1=(end-d0)/span,a=between(previous,next,t0),b=between(previous,next,t1),clipped=clip(a,b);
                    if(!clipped){flush();cursor=end;continue;}
                    var mx=(a[0]+b[0])*.5*aspect/focal,my=(a[1]+b[1])*.5/focal,mz=(a[2]+b[2])*.5;
                    var facing=mz/(Math.hypot(mx,my,mz)||1),fade=Math.max(0,Math.min(1,(facing-.57)/.37));
                    var time=path[i-1].seconds+(path[i].seconds-path[i-1].seconds)*(t0+t1)*.5;
                    var alpha=Math.min(1,opacity)*(.65+.35*(1-time/horizon))*fade*fade*(3-2*fade);
                    var parts=clearAim(clipped[0],clipped[1]);
                    if(!parts.length)flush();
                    parts.forEach(function(part){
                        var radius=Math.hypot((part[0][0]+part[1][0])*.5-w/2,(part[0][1]+part[1][1])*.5-h/2);
                        var ink=alpha*Math.max(0,Math.min(1,(radius-aim)/36));
                        if(ink<.025){flush();return;}
                        var tail=run[run.length-1];
                        if(run.length&&(runDash!==dash||Math.abs(runAlpha-ink)>.06||Math.hypot(tail[0]-part[0][0],tail[1]-part[0][1])>.1))flush();
                        if(!run.length){run=[part[0]];runAlpha=ink;runDash=dash;}
                        run.push(part[1]);
                    });
                    cursor=end;
                }
                previous=next;
            }
            flush();
        });});
        ctx.restore();
    }
    /** Paired inner/outer bracket frames; outer edges can remain visible after inner edges leave the viewport.
     * @param {import('./gpu-ui-types').PaintContext} ctx @param {number} w @param {number} h
     * @param {import('./types').Pose} camera @param {number} units
     * @param {import('./types').FlightPathSample[]} path @param {number} width @param {number} opacity @param {number} [phase] */
    function paintFlightBrackets(ctx,w,h,camera,units,path,width,opacity,phase){
        if(camera.curvature)path=path.map(function(p){return Object.assign({},p,{pose:DW.flightHyperbolic.chartPose(p.pose,camera)});});
        if(path.length<2||!(w>0&&h>0&&units>0&&opacity>0))return;
        var focal=1/Math.tan(Math.PI/8),aspect=w/h,half=Math.max(3,Math.min(24,width/2))/units;
        var aim=Math.max(40,Math.min(72,h*.075))+3,horizon=path[path.length-1].seconds;
        /** @param {number[]} a @param {number[]} b @param {number} t */
        function mix(a,b,t){return a.map(function(v,k){return v+(b[k]-v)*t;});}
        /** @param {number[]} point */
        function project(point){var x=(point[0]-camera.eye[0])*units,y=(point[1]-camera.eye[1])*units,z=(point[2]-camera.eye[2])*units;
            return [(x*camera.right[0]+y*camera.right[1]+z*camera.right[2])*focal/aspect,
                (x*camera.up[0]+y*camera.up[1]+z*camera.up[2])*focal,-(x*camera.back[0]+y*camera.back[1]+z*camera.back[2])];}
        /** @param {number[]} a @param {number[]} b @param {number} alpha @param {boolean} outer */
        function line(a,b,alpha,outer){
            var lo=0,hi=1,fa=[a[2]-.5,a[2]+a[0],a[2]-a[0],a[2]+a[1],a[2]-a[1]],fb=[b[2]-.5,b[2]+b[0],b[2]-b[0],b[2]+b[1],b[2]-b[1]];
            for(var k=0;k<5;k++){if(fa[k]<0&&fb[k]<0)return;if(fa[k]<0)lo=Math.max(lo,fa[k]/(fa[k]-fb[k]));if(fb[k]<0)hi=Math.min(hi,fa[k]/(fa[k]-fb[k]));}
            if(lo>=hi)return;
            var u=mix(a,b,lo),v=mix(a,b,hi),p=[(u[0]/u[2]+1)*w/2,(1-u[1]/u[2])*h/2],q=[(v[0]/v[2]+1)*w/2,(1-v[1]/v[2])*h/2];
            var dx=q[0]-p[0],dy=q[1]-p[1],x=p[0]-w/2,y=p[1]-h/2,aa=dx*dx+dy*dy;
            if(aa<1e-10)return;
            var bb=2*(x*dx+y*dy),cc=x*x+y*y-aim*aim,disc=bb*bb-4*aa*cc;
            /** @type {number[][][]} */var parts=[];
            if(disc<=0){if(cc>=0)parts.push([p,q]);}
            else {var first=(-bb-Math.sqrt(disc))/(2*aa),last=(-bb+Math.sqrt(disc))/(2*aa);
                if(last<=0||first>=1)parts.push([p,q]);
                else {if(first>0)parts.push([p,mix(p,q,first)]);if(last<1)parts.push([mix(p,q,last),q]);}}
            parts.forEach(function(part){
                var sx=(part[0][0]+part[1][0])*.5-w/2,sy=(part[0][1]+part[1][1])*.5-h/2;
                var ax=sx*2/(h*focal),ay=sy*2/(h*focal),facing=1/Math.sqrt(1+ax*ax+ay*ay);
                var angular=Math.max(0,Math.min(1,(facing-.57)/.37));
                var ink=alpha*angular*angular*(3-2*angular)*Math.max(0,Math.min(1,(Math.hypot(sx,sy)-aim)/36));
                if(ink<.025)return;
                ctx.beginPath();ctx.moveTo(part[0][0],part[0][1]);ctx.lineTo(part[1][0],part[1][1]);
                ctx.globalAlpha=ink*.85;ctx.lineWidth=outer?5:5.5;ctx.strokeStyle='#020a12';ctx.stroke();
                ctx.globalAlpha=ink;ctx.lineWidth=outer?2:2.5;ctx.strokeStyle=outer?'#8bd4e8':'#9aeeff';ctx.stroke();
            });
        }
        var corners=[[-1,-.65],[-.65,-1],[.65,-1],[1,-.65],[1,.65],[.65,1],[-.65,1],[-1,.65]];
        var mark=60-(((phase||0)%60+60)%60);
        ctx.save();
        for(var i=1;i<path.length;i++){
            var previous=path[i-1],next=path[i],span=next.distance-previous.distance;
            if(span<1e-8)continue;
            while(mark<=next.distance+1e-8){
                var t=Math.max(0,Math.min(1,(mark-previous.distance)/span)),eye=mix(previous.pose.eye,next.pose.eye,t),right=mix(previous.pose.right,next.pose.right,t),up=mix(previous.pose.up,next.pose.up,t);
                var nr=Math.hypot.apply(null,right)||1,nu=Math.hypot.apply(null,up)||1;
                var seconds=previous.seconds+(next.seconds-previous.seconds)*t;
                [1,2].forEach(function(scale){
                    var points=corners.map(function(c){var delta=eye.map(function(_,k){return right[k]/nr*c[0]*half*scale+up[k]/nu*c[1]*half*.75*scale;});return project(camera.curvature?DW.flightHyperbolic.offset(eye,delta,camera.curvature):eye.map(function(v,k){return v+delta[k];}));});
                    var alpha=Math.min(1,opacity)*(.65+.35*(1-seconds/horizon))*(scale===2?.8:1);
                    for(var j=0;j<8;j+=2)line(points[j],points[(j+1)%8],alpha,scale===2);
                });
                mark+=60;
            }
        }
        ctx.restore();
    }
    /** World-anchored Cartesian crosses. Grid coordinates never depend on heading or controls.
     * @param {import('./types').Pose} camera @param {number} units @param {number} w @param {number} h
     * @returns {number[][]} world positions in metres */
    function flightGridPoints(camera,units,w,h){
        if(camera.curvature)return DW.flightHyperbolic.grid(camera,w,h);
        var eye=camera.eye.map(function(v){return v*units;}),spacing=160,range=960,focal=1/Math.tan(Math.PI/8),aspect=w/h;
        /** @type {number[][]} */var points=[];
        var origin=eye.map(function(v){return Math.floor(v/spacing);});
        for(var x=origin[0]-6;x<=origin[0]+6;x++)for(var y=origin[1]-6;y<=origin[1]+6;y++)for(var z=origin[2]-6;z<=origin[2]+6;z++){
            var p=[x*spacing,y*spacing,z*spacing],v=p.map(function(n,k){return n-eye[k];}),distance=Math.hypot.apply(null,v);
            if(distance<20||distance>range)continue;
            var depth=-v.reduce(function(sum,n,k){return sum+n*camera.back[k];},0);
            if(depth<10)continue;
            var px=v.reduce(function(sum,n,k){return sum+n*camera.right[k];},0)*focal/aspect/depth;
            var py=v.reduce(function(sum,n,k){return sum+n*camera.up[k];},0)*focal/depth;
            var margin=2*focal/depth;
            if(Math.abs(px)>1+margin||Math.abs(py)>1+margin)continue;
            points.push(p);
        }
        points.sort(function(a,b){return Math.hypot(a[0]-eye[0],a[1]-eye[1],a[2]-eye[2])-Math.hypot(b[0]-eye[0],b[1]-eye[1],b[2]-eye[2]);});
        return points;
    }
    /** @param {import('./gpu-ui-types').PaintContext} ctx @param {number} w @param {number} h
     * @param {import('./types').Pose} camera @param {number} units @param {number} opacity */
    function paintFlightGrid(ctx,w,h,camera,units,opacity){
        var focal=1/Math.tan(Math.PI/8),aspect=w/h,eye=camera.eye.map(function(v){return v*units;});
        /** @param {number[]} p */function project(p){var v=p.map(function(n,k){return n-eye[k];}),depth=-v.reduce(function(sum,n,k){return sum+n*camera.back[k];},0);
            return [w/2+v.reduce(function(sum,n,k){return sum+n*camera.right[k];},0)*focal/aspect/depth*w/2,h/2-v.reduce(function(sum,n,k){return sum+n*camera.up[k];},0)*focal/depth*h/2];}
        ctx.save();flightGridPoints(camera,units,w,h).forEach(function(p){
            var distance=Math.hypot(p[0]-eye[0],p[1]-eye[1],p[2]-eye[2]);if(camera.curvature)distance=camera.curvature*Math.asinh(distance/camera.curvature);
            var center=project(p);
            var far=Math.max(0,Math.min(1,(960-distance)/480));
            var edge=Math.max(0,Math.min(1,Math.min(center[0],w-center[0],center[1],h-center[1])/48));
            var alpha=opacity*.65*far*far*(3-2*far)*edge*edge*(3-2*edge);
            var radius=Math.max(.8,Math.min(2.3,.45*focal*h/(2*distance)));
            ctx.beginPath();ctx.arc(center[0],center[1],radius+1.2,0,Math.PI*2);
            ctx.globalAlpha=alpha*.7;ctx.fillStyle='#020a12';ctx.fill();
            ctx.beginPath();ctx.arc(center[0],center[1],radius,0,Math.PI*2);
            ctx.globalAlpha=alpha;ctx.fillStyle='#9aeeff';ctx.fill();
        });ctx.restore();
    }
    /** Emit one curved eight-metre dash only at the far boundary; never refill nearby space.
     * @param {import('./types').FlightGuideBatch[]} batches @param {import('./types').FlightPathSample[]|null} path
     * @param {number} time @param {number} width @param {number} phase @param {string} style @param {number} [range]
     * @returns {import('./types').FlightGuideBatch[]} */
    function updateFlightGuide(batches,path,time,width,phase,style,range){
        batches=batches.filter(function(b){return time-b.born<b.lifetime;});
        if(path&&path.length>1){
            var end=path[path.length-1].distance;
            if(range!==undefined){
                // A tight predicted loop must not spawn paint beside the cockpit.
                var origin=path[0].pose.eye,radius=path[0].pose.curvature?path[0].pose.curvature/DW.sim.METERS_PER_UNIT*Math.sinh(range/path[0].pose.curvature):range/DW.sim.METERS_PER_UNIT;end=-1;
                for(var n=1;n<path.length;n++){
                    var p=path[n].pose.eye.map(function(v,k){return v-origin[k];});
                    if(Math.hypot.apply(null,p)<radius)continue;
                    var q=path[n-1].pose.eye.map(function(v,k){return v-origin[k];}),v=p.map(function(x,k){return x-q[k];});
                    var aa=v.reduce(function(sum,x){return sum+x*x;},0),bb=2*q.reduce(function(sum,x,k){return sum+x*v[k];},0),cc=q.reduce(function(sum,x){return sum+x*x;},0)-radius*radius;
                    var t=aa>0?(-bb+Math.sqrt(Math.max(0,bb*bb-4*aa*cc)))/(2*aa):1;
                    end=path[n-1].distance+(path[n].distance-path[n-1].distance)*Math.max(0,Math.min(1,t));break;
                }
            }
            var start=end-8;
            if(start<0||path[path.length-1].distance<end)return batches;
            /** @type {import('./types').FlightPathSample[]} */var dash=[];
            /** @param {import('./types').FlightPathSample} a @param {import('./types').FlightPathSample} b @param {number} d */
            function sample(a,b,d){var t=(d-a.distance)/(b.distance-a.distance);
                /** @param {number[]} x @param {number[]} y */function mix(x,y){return x.map(function(v,k){return v+(y[k]-v)*t;});}
                return {seconds:a.seconds+(b.seconds-a.seconds)*t,distance:d-start,pose:{curvature:a.pose.curvature,spaceFrame:a.pose.spaceFrame,eye:mix(a.pose.eye,b.pose.eye),right:mix(a.pose.right,b.pose.right),up:mix(a.pose.up,b.pose.up),back:mix(a.pose.back,b.pose.back)}};
            }
            for(var i=1;i<path.length;i++){
                var a=path[i-1],b=path[i];if(b.distance<=a.distance||b.distance<start||a.distance>end)continue;
                if(!dash.length)dash.push(sample(a,b,Math.max(start,a.distance)));
                dash.push(sample(a,b,Math.min(end,b.distance)));if(b.distance>=end)break;
            }
            if(dash.length>1)batches.push({path:dash,born:time,lifetime:Math.max(2,Math.min(20,dash[dash.length-1].seconds+1.5)),width:width,phase:0,style:style});
        }
        return batches.slice(-128);
    }
    /** @param {import('./types').FlightGuideBatch} batch @param {number} time */
    function guideStrength(batch,time){
        var t=Math.max(0,Math.min(1,(batch.lifetime-(time-batch.born))/Math.min(2,batch.lifetime*.5)));
        return t*t*(3-2*t);
    }
    /** @param {HTMLElement} host */
    function mount(host) {
        // Every flight page gets the default motion cue, even without lab guide controls.
        if(!document.getElementById('flight-lanes')){
            var settings=document.querySelector('#flight-settings section')||document.getElementById('flight-settings');
            if(settings){var motionLabel=document.createElement('label'),motionToggle=document.createElement('input');
                motionToggle.type='checkbox';motionToggle.id='flight-lanes';motionToggle.checked=true;
                motionLabel.appendChild(motionToggle);motionLabel.appendChild(document.createTextNode(' Show motion dots'));settings.appendChild(motionLabel);
            }
        }
        var telemetry = get('telemetry'), targetCamera = DW.flightTargetCamera.mount(get('target-camera'));
        /** @type {TargetStatus | null} */
        var status = null;
        var radarRanges = [1000, 2500, 5000, 10000], radarRangeIndex = 2;
        var gpu = DW.gpuUi.create(document.body), combatHud = gpu.painter, bearingHud = gpu.painter;
        document.body.classList.add('gpu-hud');
        var commsPanel = get('comms');
        var lab = document.querySelector('aside'); if (lab) lab.appendChild(telemetry);
        // Keep live text/meter semantics and portrait generation offscreen. The
        // visible play screen is composed exclusively by the GPU HUD.
        ['integrity','instruments','weapons','target-info','comms','reticle','hud-help'].forEach(function(id){
            var element=document.getElementById(id); if(element)element.classList.add('gpu-hud-source');
        });
        var targetRendered = false;
        /** @type {import('./types').FlightPathSample[]|null} */var guidePath=null;
        var guideClock=-Infinity,guideKey='',guideRange=0,guideSpawn=-Infinity,guideTravel=0,guideLastClock=-Infinity;
        /** @type {import('./types').FlightGuideBatch[]} */var guideBatches=[];
        /** @type {number[]|null} */var guideLastEye=null;
        /** @type {import('./types').Combat|null} */var guideCombat=null;
        /** @param {HudView} view */
        function render(view) {
            var state = view.state, combat = view.combat, guns = view.guns, asteroid = view.asteroid, mothership = view.mothership, units = view.units, paused = view.paused, mouse = view.mouse, shipImages = view.shipImages;
            var mission=DW.flightMissions.resolve(combat.mode), displayScale=mission.units.distanceScale*(view.distanceScale||1), distanceUnit=' '+mission.units.distanceLabel, speedScale=mission.units.speedScale, speedLabel=mission.units.speedLabel;
            var shipDistance = Math.hypot(state.eye[0] - mothership.position.x, state.eye[1] - mothership.position.y, state.eye[2]) * units;
            var distance = Math.hypot.apply(null, state.eye), speed = Math.hypot.apply(null, state.velocity);
            telemetry.textContent = (speed*speedScale).toFixed(0) + ' '+speedLabel+'   /   ' + Math.round(state.throttle * 100) + '% THR\n' + Math.round(distance * units*displayScale) + distanceUnit+' TO CENTER\n' + Math.round(asteroid.radius * 2 * units*displayScale) + distanceUnit+' BODY DIAMETER\n' + Math.round(shipDistance*displayScale) + distanceUnit+' TO MOTHERSHIP\n' + guns.fired + ' SHOTS / ' + guns.hits + ' HITS';
            if(mission.sky.wormhole){
                var mouthDistance=Math.hypot(state.eye[0]-(state.region||0)*12000/units,state.eye[1]+2000/units,state.eye[2]-1550/units)*units;
                telemetry.textContent=((state.region||0)?'RIME':'ASTEROID RANGE')+' REGION / '+Math.round(mouthDistance*(view.distanceScale||1))+' m TO THROAT\n'+guns.fired+' SHOTS / '+guns.hits+' HITS';
            }
            var w = host.clientWidth, h = host.clientHeight;
            gpu.begin(w, h);
            var guide=/** @type {HTMLInputElement|null} */(document.getElementById('flight-lanes'));
            if((!guide||guide.checked)&&!combat.dead&&!document.body.classList.contains('watch-chase')) {
                var ahead=/** @type {HTMLSelectElement|null} */(document.getElementById('flight-lanes-ahead'));
                var corridor=/** @type {HTMLSelectElement|null} */(document.getElementById('flight-lanes-width'));
                var brightness=/** @type {HTMLInputElement|null} */(document.getElementById('flight-lanes-opacity'));
                var style=/** @type {HTMLSelectElement|null} */(document.getElementById('flight-guide-style'));
                var treatment=style?style.value:'grid';
                if(treatment==='grid'){
                    guidePath=null;guideBatches=[];guideLastEye=null;
                    // Wormhole dots are finite sites traced by the sky optics;
                    // an ordinary HUD grid here would overlay a second flat copy.
                    if(!mission.sky.wormhole)paintFlightGrid(combatHud,w,h,state,units,Number(brightness?brightness.value:85)/100);
                }else if(view.flightDemand&&!mission.sky.wormhole&&!mission.weaponsDisabled&&ahead&&corridor){
                var config=JSON.stringify([ahead.value,corridor.value,treatment]);
                if(guideCombat!==combat||combat.time<guideLastClock||config!==guideKey){
                    guideTravel=0;guideLastEye=null;guidePath=null;guideBatches=[];guideRange=0;guideSpawn=-Infinity;guideKey=config;
                }
                if(guideLastEye&&combat.time>guideLastClock)guideTravel+=state.curvature?Math.hypot.apply(null,state.velocity)*(combat.time-guideLastClock):Math.hypot(state.eye[0]-guideLastEye[0],state.eye[1]-guideLastEye[1],state.eye[2]-guideLastEye[2])*units;
                guideLastEye=state.eye.slice();guideLastClock=combat.time;guideCombat=combat;
                if(!guidePath||combat.time-guideClock>=.1){
                    guidePath=predictFlightPath(Object.assign({},combat.player,{pose:state}),view.flightDemand,8);
                    guideClock=combat.time;
                }
                var lookAhead=Number(ahead.value);
                if(!guideRange){var boundary=guidePath.find(function(p){return p.seconds>=lookAhead;});guideRange=Math.max(60,boundary?boundary.distance:0);}
                if(treatment==='roads'){
                    if(guideTravel-guideSpawn>=20){
                        if(guideClock!==combat.time){guidePath=predictFlightPath(Object.assign({},combat.player,{pose:state}),view.flightDemand,8);guideClock=combat.time;}
                        guideBatches=updateFlightGuide(guideBatches,guidePath,combat.time,Number(corridor.value),0,treatment,guideRange);
                        guideSpawn=guideTravel;
                    }else guideBatches=updateFlightGuide(guideBatches,null,combat.time,0,0,treatment);
                    guideBatches.forEach(function(batch){
                        var ink=Number(brightness?brightness.value:85)/100*guideStrength(batch,combat.time);
                        if(ink>=.015)paintFlightLanes(combatHud,w,h,state,units,batch.path,batch.width,ink,0,true);
                    });
                }else if(treatment==='brackets')paintFlightBrackets(combatHud,w,h,state,units,guidePath,Number(corridor.value),Number(brightness?brightness.value:85)/100,guideTravel%60);
                else paintFlightLanes(combatHud,w,h,state,units,guidePath,Number(corridor.value),Number(brightness?brightness.value:85)/100,guideTravel%20);
                }
            }else {guidePath=null;guideLastEye=null;guideBatches=[];}

            if(mission.weaponsDisabled&&!combat.convoy){
                get('speed-value').textContent=String(Math.round(speed*speedScale));
                get('thrust-value').textContent='THRUST '+Math.round(state.throttle*100)+'%';
                get('thrust-meter').value=Math.abs(state.throttle);
                instruments(view,undefined,w,h);gpu.end();return;
            }
            var chase = document.body.classList.contains('watch-chase');
            if (!paused && view.showMouseStick) {
                var range = view.stickRange, cx = w / 2, cy = h / 2, sx = cx + mouse[0] * range, sy = cy + mouse[1] * range;
                combatHud.strokeStyle = 'rgba(166,239,222,.3)';
                combatHud.beginPath();
                // The outer guide represents full steering travel, in CSS pixels.
                combatHud.arc(cx, cy, range, 0, Math.PI * 2);
                combatHud.stroke();
                combatHud.beginPath();
                combatHud.arc(cx, cy, range * .08, 0, Math.PI * 2);
                combatHud.stroke();
                combatHud.strokeStyle = '#a6efde';
                combatHud.beginPath();
                combatHud.moveTo(cx, cy);
                combatHud.lineTo(sx, sy);
                combatHud.stroke();
                combatHud.beginPath();
                combatHud.arc(sx, sy, 5, 0, Math.PI * 2);
                combatHud.stroke();
            }
            var speakerId = view.speakerId, living = DW.flightSim.alive(combat).filter(function(e){return mission.sky.wormhole||(e.pose.region||0)===(state.region||0);}), selected = living.find(function (e) {
                return e.id === combat.targetId;
            });
            status = targetStatus(status, selected, combat.time);
            get('combat-status').textContent = !combat.enabled ? 'FREE FLIGHT' : combat.dead ? 'SORTIE OVER / ' + combat.kills + ' KILLS' : living.filter(function (e) {
                return e.team === 'enemy';
            }).length + (' '+mission.teams.enemy.status+' / ') + living.filter(function (e) {
                return e.team === 'ally';
            }).length + (' '+mission.teams.ally.status+' / ') + combat.kills + ' KILLS' + (!living.length && combat.mode === 'asteroid-patrol' ? ' / MISSION COMPLETE' : !living.length || combat.roundOver ? ' / NEXT WAVE ' + Math.max(0, Math.ceil(combat.countdown)) + 's' : '');
            if(combat.convoy){var convoy=combat.convoy,arrived=convoy.ships.filter(function(s){return s.arrived;}).length;get('combat-status').textContent=combat.dead?'SORTIE OVER / Esc to restart':(convoy.complete?'CONVOY ARRIVED':'ESCORT CONVOY')+' / '+arrived+'/30 ARRIVED / '+(living.length+1)+' FIGHTERS';}
            get('shield-meter').max = Math.max(1, combat.maxShield === undefined ? 120 : combat.maxShield);
            get('shield-meter').value = combat.shield;
            get('hull-meter').max = combat.maxHull === undefined ? 100 : combat.maxHull;
            get('hull-meter').value = combat.hull;
            get('hull-meter').dataset.condition = combat.hull / get('hull-meter').max <= .25 ? 'critical' : combat.hull / get('hull-meter').max <= .5 ? 'damaged' : 'healthy';
            get('speed-value').textContent = String(Math.round(Math.hypot.apply(null, state.velocity)*speedScale));
            var speedUnit=document.getElementById('speed-unit');if(speedUnit)speedUnit.textContent=speedLabel;
            get('thrust-value').textContent = (state.throttle < 0 ? 'REV ' : 'THRUST ') + Math.round(Math.abs(state.throttle) * 100) + '%';
            get('thrust-meter').value = Math.abs(state.throttle);
            get('weapon-name').textContent = view.weapon.name;
            var targetPanel = get('target-info');
            targetPanel.hidden = !selected;
            if (selected) {
                var selection = selected.team === 'ally' ? view.allyArt : view.enemyArt, art = DW.flightPresentation.model(selected, combat.wave, view);
                get('target-label').textContent = (combat.targetLocked ? 'LOCKED / ' : 'AUTO / ') + (selected.team === 'ally' ? mission.teams.ally.target : mission.teams.enemy.target)+' / ' + DW.flightSim.callsign(selected);
                get('target-detail').textContent = (art.name || 'Training fighter') + ' / ' + rangeText(selected)+' / ' + Math.ceil(selected.hp / selected.maxHp * 100) + '% HULL / ' + Math.ceil(selected.shield || 0) + ' SHIELD';
                get('target-hull').max = selected.maxHp;
                get('target-hull').value = selected.hp;
                get('target-hull').dataset.condition = selected.hp / selected.maxHp <= .25 ? 'critical' : selected.hp / selected.maxHp <= .5 ? 'damaged' : 'healthy';
                get('target-shield').max = Math.max(1, selected.maxShield || 1);
                get('target-shield').value = selected.shield || 0;
                targetRendered = targetCamera.update(selected, selection, combat.wave, units, shipImages, view.paint[selected.team === 'ally' ? 'ally' : 'enemy'], state, performance.now() / 1000);
            }
            if (combat.hitFlash > 0) {
                combatHud.fillStyle = 'rgba(255,55,25,' + (combat.hitFlash * .28) + ')';
                combatHud.fillRect(0, 0, w, h);
            }
            var radarContacts = /** @type {RadarContact[]} */ (living.filter(function(e){return (e.pose.region||0)===(state.region||0);}).map(function (e) {
                return { point: e.pose.eye, color: e.team === 'ally' ? '#63f58d' : '#ff655d', selected: e.id === combat.targetId, speaking: e.id === speakerId };
            }));
            if(combat.convoy)combat.convoy.ships.filter(function(s){return s.hull>0;}).forEach(function(s){radarContacts.push({point:s.position,color:'#72c8d5',landmark:true});});
            if(state.curvature)radarContacts=radarContacts.map(function(c){var route=DW.flightHyperbolic.path(state.eye,c.point,state.curvature||650);return Object.assign({},c,{point:state.eye.map(function(v,i){return v+route.direction[i]*route.distance;})});});
            if(mission.sky.thinShell){
                radarContacts=[];
                living.forEach(function(e){
                    const path=DW.thinShellOptics.primary(state.eye.map(function(v){return v*units;}),e.pose.eye.map(function(v){return v*units;}),state.region||0,e.pose.region||0);
                    if(path)radarContacts.push({point:state.eye.map(function(v,i){return v+path.direction[i]*path.length/units;}),color:e.team==='ally'?'#63f58d':'#ff655d',selected:e.id===combat.targetId,speaking:e.id===speakerId});
                });
            }
            if(!mission.emptySpace&&!combat.convoy&&!(state.region||0)){
                radarContacts.push({ point: [0, 0, 0], color: '#a6aeb7', landmark: true });
                radarContacts.push({ point: [mothership.position.x, mothership.position.y, 0], color: '#69cfff', landmark: true });
            }
            if(mission.sky.wormhole)radarContacts.push({point:[(state.region||0)*12000/units,-2000/units,1550/units],color:'#b7a6ff',landmark:true});
            DW.flightRadar.draw(combatHud, state, radarContacts, units*(view.distanceScale||1), radarRanges[radarRangeIndex], w, h, paused, combat.mode, document.body.classList.contains('touch-flight'));
            combatHud.font = '12px ui-monospace,monospace';
            combatHud.textAlign = 'center';
            /** @param {Vector} point @param {number} side */function visualDirection(point,side){
                if(mission.sky.wormhole&&DW.ellisOptics){
                    var path=(mission.sky.thinShell?DW.thinShellOptics:DW.ellisOptics).primary(state.eye.map(function(v){return v*units;}),point.map(function(v){return v*units;}),state.region||0,side);
                    return path?path.direction:null;
                }
                return point.map(function(v,i){return v-state.eye[i];});
            }
            /** @param {import('./types').Craft} craft */function rangeText(craft){
                var path=DW.flightGuns.ballisticPath(state.eye,craft.pose.eye,state.region||0,craft.pose.region||0,view.state.curvature||(mission.sky.thinShell?'thin-shell':!!mission.sky.wormhole));
                return path?Math.round(path.distance*units*displayScale)+distanceUnit:'—';
            }
            if(combat.convoy){
                var convoy=combat.convoy,remaining=Math.max(0,convoy.destinationY*units-convoy.elapsed*convoy.speedMps);
                combatHud.save();combatHud.font='14px system-ui';combatHud.textAlign='center';combatHud.fillStyle='#b9e7ed';combatHud.strokeStyle='#72c8d5';
                combatHud.fillText(convoy.complete?'ARRIVAL COMPLETE / Esc to restart':'CONVOY ROUTE / '+(remaining/1000).toFixed(1)+' km remaining / '+Math.ceil(remaining/convoy.speedMps)+' s',w/2,86);
                var nearestCargo=convoy.ships.filter(function(ship){return ship.hull>0;}).reduce(function(best,ship){var range=function(/** @type {typeof convoy.ships[number]} */s){return Math.hypot.apply(null,s.position.map(function(v,k){return v-state.eye[k];}));};return !best||range(ship)<range(best)?ship:best;},/** @type {typeof convoy.ships[number]|null} */(null));
                convoy.ships.forEach(function(ship){
                    if(ship.hull<=0)return;
                    var direction=ship.position.map(function(v,k){return v-state.eye[k];}),q=DW.flightSkybox.project(direction,state,w/h);
                    if(!q||Math.abs(q.x)>.92||Math.abs(q.y)>.75)return;
                    var x=w*(q.x+1)/2,y=h*(1-q.y)/2,distance=Math.hypot.apply(null,direction)*units;
                    combatHud.strokeRect(x-3,y-3,6,6);
                    if(ship===nearestCargo&&distance<650){combatHud.fillText(ship.callsign,x,y-17);combatHud.fillText(Math.round(distance)+' m',x,y+22);}
                });
                combatHud.restore();
            }
            var targetBearing = /** @type {number | null} */ (null);
            living.forEach(function (e) {
                var direction=visualDirection(e.pose.eye,e.pose.region||0);if(!direction)return;
                var q = DW.flightSkybox.project(direction,state,w/h), target = e.id === combat.targetId;
                combatHud.globalAlpha = 1;
                combatHud.lineWidth = 1.5;
                combatHud.strokeStyle = target ? '#ffe7a3' : e.team === 'ally' ? '#63f58d' : '#ff655d';
                combatHud.fillStyle = combatHud.strokeStyle;
                if (q && Math.abs(q.x) < .9 && Math.abs(q.y) < .78) {
                    var x = w * (q.x + 1) / 2, y = h * (1 - q.y) / 2, r = target ? 18 : 12;
                    if (e.team === 'ally') {
                        combatHud.save();
                        combatHud.strokeStyle = '#05090f';
                        combatHud.lineWidth = 3.5;
                        combatHud.strokeRect(x - r, y - r, r * 2, r * 2);
                        combatHud.restore();
                        combatHud.strokeRect(x - r, y - r, r * 2, r * 2);
                    }
                    else {
                        combatHud.beginPath();
                        combatHud.moveTo(x, y - r);
                        combatHud.lineTo(x + r, y);
                        combatHud.lineTo(x, y + r);
                        combatHud.lineTo(x - r, y);
                        combatHud.closePath();
                        combatHud.save();
                        combatHud.strokeStyle = '#05090f';
                        combatHud.lineWidth = 3.5;
                        combatHud.stroke();
                        combatHud.restore();
                        combatHud.stroke();
                    }
                    if (e.id === speakerId)
                        DW.flightRadar.speakerHalo(combatHud, x, y, r + 6);
                    if (target || e.id === speakerId) combatHud.fillText(rangeText(e), x, y + r + 15);
                    if (target) {
                        combatHud.save();
                        combatHud.strokeStyle = '#ffe7a3';
                        combatHud.lineWidth = 2;
                        combatHud.shadowColor = '#000';
                        combatHud.shadowBlur = 4;
                        [-1, 1].forEach(function (a) {
                            [-1, 1].forEach(function (b) {
                                combatHud.beginPath();
                                combatHud.moveTo(x + a * 28, y + b * 17);
                                combatHud.lineTo(x + a * 28, y + b * 28);
                                combatHud.lineTo(x + a * 17, y + b * 28);
                                combatHud.stroke();
                            });
                        });
                        combatHud.restore();
                        if (status) paintTargetStatus(combatHud, x, y, status);
                        combatHud.fillText((e.team === 'ally' ? mission.teams.ally.target : mission.teams.enemy.target)+' / ' + DW.flightSim.callsign(e), x, y - 37);
                    }
                }
                else {
                    var delta = direction, dx = delta.reduce(function (sum, v, i) {
                        return sum + v * state.right[i];
                    }, 0), dy = -delta.reduce(function (sum, v, i) {
                        return sum + v * state.up[i];
                    }, 0);
                    if (Math.abs(dx) + Math.abs(dy) < .0001)
                        dx = 1;
                    var angle = Math.atan2(dy, dx), edge = Math.min(w * .44 / Math.max(.001, Math.abs(Math.cos(angle))), h * .34 / Math.max(.001, Math.abs(Math.sin(angle))));
                    var x = w / 2 + Math.cos(angle) * edge, y = h / 2 + Math.sin(angle) * edge;
                    if (target) targetBearing = angle;
                    combatHud.save();
                    combatHud.translate(x, y);
                    combatHud.rotate(angle);
                    combatHud.beginPath();
                    combatHud.moveTo(8, 0);
                    combatHud.lineTo(-5, -5);
                    combatHud.lineTo(-5, 5);
                    combatHud.closePath();
                    combatHud.save();
                    combatHud.strokeStyle = '#05090f';
                    combatHud.lineWidth = 3.5;
                    combatHud.stroke();
                    combatHud.restore();
                    if (e.team === 'enemy') combatHud.fill();
                    combatHud.stroke();
                    combatHud.restore();
                    if (e.id === speakerId)
                        DW.flightRadar.speakerHalo(combatHud, x, y, 13);
                }
            });

            combatHud.globalAlpha = 1;
            if (selected) {
                var lead=DW.flightSim.firingSolution(combat,combat.player,selected,view.weapon),q=lead?DW.flightSkybox.project(lead.direction,state,w/h):null;
                get('target-info').dataset.leadState=lead?'valid':'unavailable';get('target-info').dataset.leadTime=lead?lead.time.toFixed(4):'';
                if(!lead){combatHud.fillStyle='#a9e5dc';combatHud.fillText(selected.team==='ally'?'FRIENDLY CONTACT':'NO FIRING SOLUTION',w/2,h/2+54);}
                if (q && Math.abs(q.x) < 1 && Math.abs(q.y) < 1) {
                    combatHud.strokeStyle = '#a9e5dc';
                    combatHud.setLineDash([2, 3]);
                    combatHud.beginPath();
                    combatHud.arc(w * (q.x + 1) / 2, h * (1 - q.y) / 2, 7, 0, Math.PI * 2);
                    combatHud.stroke();
                    combatHud.setLineDash([]);
                }
            }
            // Chase-camera projection differs from the pilot's sight line. Keep
            // instruments while suppressing pilot-relative markers and radar.
            if (chase) gpu.begin(w, h);
            instruments(view, selected, w, h);
            if (!chase && targetBearing !== null) paintTargetBearing(bearingHud, w, h, targetBearing);
            gpu.end();
        }
        /** @param {HudView} view @param {import('./types').Craft | undefined} selected @param {number} w @param {number} h */
        function instruments(view, selected, w, h) {
            var ctx = gpu.painter, combat=view.combat, mission=DW.flightMissions.resolve(combat.mode);
            if(mission.sky.wormhole&&view.bridgeCue&&!document.body.classList.contains('watch-chase'))paintThroatGuide(ctx,w,h,view.state,view.bridgeCue);
            var compact=w<760, margin=compact?12:24, pw=w<600?(w-margin*3)/2:Math.min(compact?166:224,(w-190)/2-margin*2), bottom=h-margin;
            var ink='#b9e9dc', muted='#719a98', gold='#ffe1a0';
            /** @param {number} x @param {number} y @param {number} width @param {number} height */
            function panel(x,y,width,height){ctx.fillStyle='rgba(3,15,21,.78)';ctx.strokeStyle='rgba(111,185,171,.38)';ctx.lineWidth=1;ctx.panel(x,y,width,height,8);}
            /** @param {string} text @param {number} x @param {number} y @param {number} [size] @param {string} [color] */
            function label(text,x,y,size,color){ctx.font=(size||11)+'px monospace';ctx.fillStyle=color||ink;ctx.textAlign='left';ctx.fillText(text,x,y);}
            /** @param {string} name @param {number} value @param {number} max @param {number} x @param {number} y @param {number} width @param {string} color */
            function meter(name,value,max,x,y,width,color){var fraction=Math.max(0,Math.min(1,value/Math.max(1,max)));label(name,x,y,10,muted);label(Math.round(fraction*100)+'%',x+width-27,y,10,ink);ctx.fillStyle='#233c43';ctx.fillRect(x,y+6,width,4);ctx.fillStyle=color;ctx.fillRect(x,y+6,width*fraction,4);}
            if(mission.weaponsDisabled&&!combat.convoy){
                panel(margin,bottom-65,220,65);
                label('JADE WEATHER / FREE FLIGHT',margin+12,bottom-43,10,muted);
                label(Math.round(Math.hypot.apply(null,view.state.velocity)*mission.units.speedScale)+' '+mission.units.speedLabel+' / THR '+Math.round(view.state.throttle*100)+'%',margin+12,bottom-19,12);
                return;
            }
            if (document.body.classList.contains('touch-flight')) {
                panel(12,12,Math.min(250,w-202),70);
                meter('SHIELD',combat.shield,combat.maxShield||120,24,29,86,'#79b8e7');
                meter('HULL',combat.hull,combat.maxHull||100,24,54,86,'#91d29b');
                label(Math.round(Math.hypot.apply(null,view.state.velocity)*mission.units.speedScale)+' '+mission.units.speedLabel,124,32,13);
                label('THR '+Math.round(view.state.throttle*100)+'%',124,57,13);
                label(selected ? DW.flightSim.callsign(selected) : 'NO TARGET',12,104,12,gold);
            } else {
            var leftY=bottom-162;
            panel(margin,leftY,pw,162);
            label('YOUR SHIP',margin+14,leftY+23,10,muted);
            meter('SHIELD',combat.shield,combat.maxShield||120,margin+14,leftY+44,pw-28,'#79b8e7');
            meter('HULL',combat.hull,combat.maxHull||100,margin+14,leftY+70,pw-28,combat.hull/(combat.maxHull||100)<.25?'#ff776b':'#91d29b');
            label(String(Math.round(Math.hypot.apply(null,view.state.velocity)*mission.units.speedScale)),margin+14,leftY+115,25);
            label(mission.units.speedLabel,margin+80,leftY+115,11,muted);
            label((view.state.throttle<0?'REV ':'THR ')+Math.round(Math.abs(view.state.throttle)*100)+'%',margin+14,leftY+141,11);
            label(view.weapon.name.slice(0,Math.floor((pw-28)/6.7)),margin+14,leftY-12,11,muted);
            var rightX=w-margin-pw, rightY=bottom-198;
            panel(rightX,rightY,pw,198);
            label(selected?(combat.targetLocked?'TARGET LOCK':'AUTO TARGET'):'NO TARGET',rightX+14,rightY+22,10,selected?gold:muted);
            if(selected){
                label(DW.flightSim.callsign(selected).slice(0,22),rightX+14,rightY+44,16,gold);
                var source=get('target-camera').querySelector('canvas:not(.scene3d-overlay)');
                if(source instanceof HTMLCanvasElement){var fit=Math.min((pw-24)/source.width,76/source.height);ctx.image(source,rightX+(pw-source.width*fit)/2,rightY+51,source.width*fit,source.height*fit,0,targetRendered);}
                var path=DW.flightGuns.ballisticPath(view.state.eye,selected.pose.eye,view.state.region||0,selected.pose.region||0,view.state.curvature||(mission.sky.thinShell?'thin-shell':!!mission.sky.wormhole));
                var distance=path?path.distance*view.units*mission.units.distanceScale*(view.distanceScale||1):null;
                label(distance===null?'—':Math.round(distance)+' '+mission.units.distanceLabel,rightX+14,rightY+139,11);
                meter('SHIELD',selected.shield||0,selected.maxShield||1,rightX+14,rightY+157,pw-28,'#79b8e7');
                meter('HULL',selected.hp,selected.maxHp,rightX+14,rightY+181,pw-28,'#91d29b');
            }else label('TAB / ACQUIRE',rightX+14,rightY+50,11,muted);
            }
            // Preserve the original DOM reticle's 42 CSS-pixel diameter in the GPU HUD.
            if(!document.body.classList.contains('watch-chase')){
                ctx.strokeStyle='rgba(178,232,214,.8)';ctx.lineWidth=1;
                ctx.beginPath();ctx.arc(w/2,h/2,21,0,Math.PI*2);ctx.stroke();
                ctx.beginPath();ctx.moveTo(w/2-4,h/2);ctx.lineTo(w/2+4,h/2);ctx.moveTo(w/2,h/2-4);ctx.lineTo(w/2,h/2+4);ctx.stroke();
            }
            if(combat.dead||combat.roundOver){ctx.textAlign='center';ctx.font='18px monospace';ctx.fillStyle=gold;ctx.fillText(combat.dead?'SHIP LOST':combat.kills+' KILLS / SORTIE COMPLETE',w/2,h*.29);}
            // Transmissions are temporary; no idle comms box or voice button in play.
            var subtitle=commsPanel.querySelector('[data-subtitle]'),speaker=commsPanel.querySelector('[data-speaker]');
            if(!view.paused&&!commsPanel.classList.contains('idle')&&subtitle&&subtitle.textContent){
                var mobile=document.body.classList.contains('touch-flight');
                var cw=mobile?Math.min(360,w>600?w-370:w-24):Math.min(640,w-margin*2),cx=(w-cw)/2,cy=mobile?(w>600?12:114):margin;
                if(mobile&&w>600)cx=280;
                var portrait=commsPanel.querySelector('canvas.radio-portrait'),hasPortrait=portrait instanceof HTMLCanvasElement&&!portrait.hidden;
                var portraitSize=mobile?52:Math.min(compact?112:128,h<480?96:128);
                var textX=cx+(hasPortrait?portraitSize+30:18),textWidth=cw-(hasPortrait?portraitSize+48:36),fontSize=Math.min(compact?18:32,Math.max(14,Number(get('dialogue-size').value)||22)),columns=Math.max(12,Math.floor(textWidth/(fontSize*.603)));
                if(mobile){fontSize=12;columns=Math.max(12,Math.floor(textWidth/(fontSize*.603)));}
                var words=subtitle.textContent.split(/\s+/),lines=[''];words.forEach(function(word){var last=lines.length-1;if((lines[last]+' '+word).trim().length>columns)lines.push(word);else lines[last]=(lines[last]+' '+word).trim();});
                if(mobile)lines=lines.slice(0,3);
                var ch=Math.max(hasPortrait?portraitSize+24:mobile?64:92,48+lines.length*(fontSize+5));panel(cx,cy,cw,ch);
                if(hasPortrait&&portrait instanceof HTMLCanvasElement)ctx.image(portrait,cx+12,cy+12,portraitSize,portraitSize,1);
                label((speaker&&speaker.textContent)||'COMMS',textX,cy+24,11,gold);
                lines.forEach(function(line,i){label(line,textX,cy+49+i*(fontSize+5),fontSize,ink);});
            }
        }
        return { render: render, cycleRadarRange: function () {
                radarRangeIndex = (radarRangeIndex + 1) % radarRanges.length;
            } };
    }
    DW.flightHud = { flightGridPoints:flightGridPoints, paintFlightGrid:paintFlightGrid, updateFlightGuide:updateFlightGuide, guideStrength:guideStrength, predictFlightPath:predictFlightPath, paintFlightLanes:paintFlightLanes, paintFlightBrackets:paintFlightBrackets, paintThroatGuide:paintThroatGuide, paintTargetBearing: paintTargetBearing, mount: mount, targetStatus: targetStatus, paintTargetStatus: paintTargetStatus };
}());
