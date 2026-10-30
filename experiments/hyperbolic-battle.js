(function(){
    'use strict';
    var DW=/** @type {Required<import('../src/types').DriftworksNamespace>} */(window.Driftworks),H=DW.flightHyperbolic,U=DW.sim.METERS_PER_UNIT;
    /** @typedef {import('./types').Vector} V */
    /** @typedef {import('./types').Pose} Pose */
    /** @typedef {import('./types').FlightState} State */
    /** @typedef {import('./types').FlightView} View */
    /** @typedef {import('./types').Batch} Batch */
    /** @param {V} a @param {V} b */function dot(a,b){return a.reduce(function(n,v,i){return n+v*b[i];},0);}
    /** @param {V} v */function unit(v){var n=Math.hypot(...v)||1;return v.map(function(x){return x/n;});}
    /** @param {V} a @param {V} b */function cross(a,b){return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];}
    /** @param {number} x @param {number} limit */function clamp(x,limit){return Math.max(-limit,Math.min(limit,x));}
    /** @param {number} x */function wrap(x){return Math.atan2(Math.sin(x),Math.cos(x));}
    /** @returns {import('./types').AegisFlightRig} */
    function create(){
        var radius=400,seconds=0,launches=0,contacts=0,hits=0,spawnGrace=0;
        var camera=/** @type {Pose} */({curvature:radius,eye:[0,0,0],right:[1,0,0],up:[0,0,1],back:[0,-1,0]});
        var asset=DW.aegisFlightAsset,gunCamera=camera;
        /** @type {WeakMap<import('./types').Craft,V>} */var contactEyes=new WeakMap();
        var bodies=[0,1].map(function(index){
            var state=/** @type {import('./types').AegisCapitalState} */({team:index?'enemy':'ally',position:[0,0,0],heading:0,velocity:[0,0,0],integrity:20000});
            var rig=DW.aegisFlight.create({state:state,opponent:state});
            var mounts=asset.turrets.map(function(source,i){return {source:source,index:i,yaw:0,elevation:0,guns:DW.flightGuns.create(),targetId:'',rest:i*.07,aimWait:i*.005,goalYaw:0,goalElevation:0,range:Infinity,sideReady:false,burst:0,settled:0};});
            return {state:state,rig:rig,mounts:mounts,frame:new Float32Array(16),canonical:/** @type {number[][]} */([]),adapters:/** @type {Map<Batch,Batch>} */(new Map()),points:/** @type {WeakMap<V,V>} */(new WeakMap()),derivatives:/** @type {WeakMap<V,V[]>} */(new WeakMap())};
        });
        /** @typedef {typeof bodies[number]} Body */
        /** @param {Body} body @param {number} index */function placement(body,index){
            var eye=H.offset([0,0,0],[0,index*900/U,index*300/U],radius),p=H.point(eye,radius),a=index*Math.PI;
            body.canonical=[p,H.lift(p,[Math.cos(a),Math.sin(a),0]),H.lift(p,[-Math.sin(a),Math.cos(a),0]),H.lift(p,[0,0,1])];
        }
        /** Canonical finite-body Fermi coordinates; local coordinates are metres.
         * @param {Body} body @param {V} local */function world(body,local){
            var cached=body.points.get(local);if(cached)return cached;
            var x=local[0]/radius,rho=Math.hypot(local[1],local[2]),s=rho/radius,k=rho?Math.sinh(s)/rho:1/radius;
            var q=[Math.cosh(s)*Math.cosh(x),Math.cosh(s)*Math.sinh(x),local[1]*k,local[2]*k];
            var result=H.chart(q.map(function(_,i){return body.canonical.reduce(function(n,col,j){return n+col[i]*q[j];},0);}),radius);body.points.set(local,result);return result;
        }
        var identityFrame=[[1,0,0,0],[0,1,0,0],[0,0,1,0],[0,0,0,1]];
        /** @type {WeakMap<number[][],WeakMap<number[][],number[][]>>} */var chartMatrices=new WeakMap();
        /** A point-only Lorentz transform; collision sweeps do not need three pose axes.
         * @param {Pose} from @param {Pose} to */function chartMatrix(from,to){
            var old=from.spaceFrame||identityFrame,current=to.spaceFrame||identityFrame,targets=chartMatrices.get(old);if(!targets){targets=new WeakMap();chartMatrices.set(old,targets);}var found=targets.get(current);if(found)return found;
            var matrix=[0,1,2,3].map(function(i){return [0,1,2,3].map(function(k){return current.reduce(function(n,col,j){return n+col[i]*old[j][k]*(j===0?-1:1)*(k===0?-1:1);},0);});});targets.set(current,matrix);return matrix;
        }
        /** @param {number[][]} matrix @param {V} v */function multiply(matrix,v){return matrix.map(function(row){return dot(row,v);});}
        /** @param {V} eye @param {Pose} from @param {Pose} to */function chart(eye,from,to){if(from.spaceFrame===to.spaceFrame)return eye;return H.chart(multiply(chartMatrix(from,to),H.point(eye,radius)),radius);}

        /** @returns {Pose} */function canonical(){return {curvature:radius,eye:[0,0,0],right:[1,0,0],up:[0,0,1],back:[0,-1,0]};}
        /** Inverse of the exact rendered Fermi placement.
         * @param {Body} body @param {V} eye */function local(body,eye){
            var q=H.point(eye,radius),v=body.canonical.map(function(col,i){var n=-col[0]*q[0]+dot(col.slice(1),q.slice(1));return i?n:-n;}),n=Math.hypot(v[2],v[3]),rho=Math.asinh(n)*radius;
            return [Math.atanh(Math.max(-1+1e-15,Math.min(1-1e-15,v[1]/v[0])))*radius,v[2]*rho/(n||1),v[3]*rho/(n||1)];
        }
        /** Physical orthonormal gauge derivative of the body map.
         * @param {Body} body @param {V} p */function jacobian(body,p){
            var cached=body.derivatives.get(p);if(cached)return cached;
            var x=p[0]/radius,rho=Math.hypot(p[1],p[2]),s=rho/radius,cx=Math.cosh(x),sx=Math.sinh(x),ch=Math.cosh(s),sh=Math.sinh(s),f=s<1e-6?1+s*s/6:sh/s,k=s<1e-6?1/(3*radius*radius):(ch-f)/(rho*rho);
            var radial=[cx*(rho?sh/rho:1/radius),sx*(rho?sh/rho:1/radius),p[1]*k,p[2]*k];
            var derivatives=[[ch*sx,ch*cx,0,0],radial.map(function(v,i){return v*p[1]+(i===2?f:0);}),radial.map(function(v,i){return v*p[2]+(i===3?f:0);})],q=H.point(world(body,p),radius);
            var result=derivatives.map(function(v){return H.lower(q,v.map(function(_,i){return body.canonical.reduce(function(n,col,j){return n+col[i]*v[j];},0);}));});body.derivatives.set(p,result);return result;
        }
        /** @param {Body} body @param {V} p @param {V} direction */function inverseDirection(body,p,direction){
            var j=jacobian(body,p),c=[cross(j[1],j[2]),cross(j[2],j[0]),cross(j[0],j[1])],det=dot(j[0],c[0]);return unit(c.map(function(v){return dot(v,direction)/det;}));
        }
        /** @param {Body} body @param {V} p @param {V} forward */function poseAt(body,p,forward){
            var j=jacobian(body,p),transform=/** @param {V} v */function(v){return unit([0,1,2].map(function(k){return j.reduce(function(n,col,i){return n+col[k]*v[i];},0);}));};
            var f=transform(forward),right=unit(cross(f,transform([0,0,1])));if(Math.hypot(...right)<.1)right=[1,0,0];
            return H.chartPose({curvature:radius,eye:world(body,p),right:right,up:unit(cross(right,f)),back:f.map(function(v){return -v;})},camera);
        }
        /** Sweep the actual geodesic in short intervals through inverse hull coordinates.
         * @param {Body} body @param {V} start @param {V} end */function hull(body,start,end){
            var a=chart(start,camera,canonical()),b=chart(end,camera,canonical()),path=H.path(a,b,radius),steps=Math.max(1,Math.ceil(path.distance*U/10)),previous=local(body,a);
            if(Math.abs(previous[0])>800+path.distance*U||Math.hypot(previous[1],previous[2])>180+path.distance*U)return null;
            for(var i=1;i<=steps;i++){
                var next=local(body,H.offset(a,path.direction.map(function(v){return v*path.distance*i/steps;}),radius));
                var point=body.rig.hit(previous.map(function(v){return v/U;}),next.map(function(v){return v/U;}));
                if(point)return chart(world(body,point.map(function(v){return v*U;})),canonical(),camera);
                previous=next;
            }return null;
        }
        /** @param {V} a @param {V} b @param {import('./types').Bolt} [bolt] */function hit(a,b,bolt){
            var best=/** @type {V|null} */(null),distance=Infinity;
            bodies.forEach(function(body){var p=hull(body,a,b);if(p){var d=H.path(a,p,radius).distance;if(d<distance){distance=d;best=p;}}});return best;
        }
        /** @param {V} point @param {number} amount @param {import('./types').Combat} combat */function damage(point,amount,combat){
            var canonicalPoint=chart(point,camera,canonical()),result=false;
            bodies.some(function(body){var p=local(body,canonicalPoint),before=body.state.integrity;
                var flashes=combat.flashes.length;result=!!(body.rig.damage&&body.rig.damage(p.map(function(v){return v/U;}),amount,combat));
                combat.flashes.slice(flashes).forEach(function(f){f.position=chart(world(body,f.position.map(function(v){return v*U;})),canonical(),camera);});
                if(result&&body.state.integrity<before)hits++;return result;
            });return result;
        }
        /** @param {Pose} view @returns {State} */function spawnPlayer(view){
            camera=view;spawnGrace=4;var p=asset.hangars&&asset.hangars[0]?asset.hangars[0].position:[-150,0,-10],pose=poseAt(bodies[0],p,[0,1,0]);
            return Object.assign({},pose,{velocity:[0,0,0],rates:[0,0,0],ramp:[0,0,0],throttle:0});
        }
        /** @param {import('./types').Combat} [combat] */function reset(combat){
            contactEyes=new WeakMap();radius=combat&&combat.player.pose.curvature||400;seconds=0;launches=0;contacts=0;hits=0;spawnGrace=0;camera=combat?combat.player.pose:canonical();
            gunCamera=Object.assign({},camera);
            bodies.forEach(function(body,i){body.state.integrity=20000;body.rig.reset();placement(body,i);body.points=new WeakMap();body.derivatives=new WeakMap();body.mounts.forEach(function(m){m.yaw=0;m.elevation=0;m.guns=DW.flightGuns.create();m.rest=m.index*.07;m.aimWait=m.index*.005;m.range=Infinity;m.burst=0;m.settled=0;});});
            if(combat){combat.hangarSupport=true;combat.enemies.forEach(function(c,i){var body=bodies[i%2],p=[(i%4-1.5)*100,(i%2?1:-1)*160,100+(i%3)*45],pose=poseAt(body,p,[0,body.state.team==='ally'?1:-1,0]);c.team=body.state.team;c.pose=Object.assign({},pose,{velocity:[0,0,0],rates:[0,0,0],ramp:[0,0,0],throttle:.6});c.goal=chart(world(bodies[1-i%2],[0,0,130]),canonical(),camera);});}
        }
        /** @param {number} elapsed @param {View} view */function step(elapsed,view){
            if(!(elapsed>0))return;var dt=Math.min(.05,elapsed),oldCamera=gunCamera;camera=view.state;gunCamera=Object.assign({},camera);seconds+=dt;var combat=view.combat;
            if(oldCamera.spaceFrame!==camera.spaceFrame)bodies.forEach(function(body){body.mounts.forEach(function(m){m.guns.bolts.forEach(function(b){var matrix=chartMatrix(oldCamera,camera),p=H.point(b.position,radius),q=multiply(matrix,p);b.direction=unit(H.lower(q,multiply(matrix,H.lift(p,b.direction))));b.position=H.chart(q,radius);});m.guns.impacts.forEach(function(h){h.position=chart(h.position,oldCamera,camera);});});});
            spawnGrace=Math.max(0,spawnGrace-dt);if(spawnGrace>0)combat.player.plotArmor=true;else delete combat.player.plotArmor;
            if(!combat.enabled)return;combat.roundOver=false;combat.countdown=999;
            DW.flightSim.collisionBatch(combat,function(){bodies.forEach(function(body,index){
                var opponent=bodies[1-index],parts=body.rig.components?body.rig.components():[],participants=DW.flightSim.participants(combat).filter(function(c){return c.hp>0&&c.team!==body.state.team&&!c.hangarLaunch;});
                body.mounts.forEach(function(m){
                    var heavy=m.source.kind==='heavy',weapon=Object.assign({},DW.retailWeapons[0],{name:heavy?'Hyperbolic main battery':'Hyperbolic point defense',speed:heavy?700:600,lifetime:8,damage:heavy?20:3,fireWait:heavy?.65:.2,length:heavy?35:4,headRadius:heavy?2.5:.2,tailRadius:heavy?2:.1});
                    var p=m.source.position;m.aimWait-=dt;
                    if(m.aimWait<=0){
                        var origin=chart(world(body,p),canonical(),camera),target=participants.length?participants[m.index%participants.length]:null;
                        var targetPoint=heavy&&opponent.state.integrity>0?chart(world(opponent,[(m.index%5-2)*100,0,0]),canonical(),camera):target?target.pose.eye:null;
                        m.targetId=heavy&&opponent.state.integrity>0?'capital-'+opponent.state.team:target?target.id:'';
                        if(target&&targetPoint===target.pose.eye){var lead=H.lead(Object.assign({},camera,{eye:origin}),target.pose,weapon,radius,0);if(lead)targetPoint=lead.point;}
                        var direction=targetPoint?H.path(world(body,p),chart(targetPoint,camera,canonical()),radius):null;
                        var d=direction?inverseDirection(body,p,direction.direction):[-1,0,0];m.goalYaw=wrap(Math.atan2(d[1],d[0])-Math.PI);m.goalElevation=Math.asin(clamp(d[2],1));m.range=direction?direction.distance*U:Infinity;m.sideReady=d[2]*m.source.side>0;m.aimWait=heavy?.25:.12;
                    }
                    var yaw=m.goalYaw,elevation=m.goalElevation;
                    m.yaw+=clamp(wrap(yaw-m.yaw),(heavy?.6:2.8)*dt);m.elevation+=clamp(elevation-m.elevation,(heavy?.5:2.2)*dt);
                    if(body.rig.setMountAim)body.rig.setMountAim(m.index,m.yaw,m.elevation);
                    var forward=[-Math.cos(m.yaw)*Math.cos(m.elevation),-Math.sin(m.yaw)*Math.cos(m.elevation),Math.sin(m.elevation)],tip=p.map(function(v,k){return v+forward[k]*(heavy?45.2:10.2);});
                    var ready=m.range<weapon.speed*weapon.lifetime&&Math.abs(wrap(yaw-m.yaw))<.025&&Math.abs(elevation-m.elevation)<.025&&m.sideReady;
                    m.rest=Math.max(0,m.rest-dt);var alive=body.state.integrity>0&&(!parts[m.index]||parts[m.index].hp>0);
                    m.settled=alive&&ready?m.settled+dt:0;
                    if(!ready&&m.burst>0){m.burst=0;m.rest=heavy?3:1;}
                    if(alive&&ready&&m.settled>.12&&m.rest<=0&&m.burst<=0)m.burst=heavy?.7:.55;
                    var fire=alive&&ready&&m.burst>0,pose=fire&&m.guns.cooldown<=dt+1e-9?poseAt(body,tip,forward):camera;
                    DW.flightGuns.step(m.guns,pose,weapon,fire,dt,function(a,b,bolt){
                        var surface=/** @type {import('./types').TerrainHit} */(function(){return hit(a,b,bolt);});surface.onImpact=function(point,round){damage(point,round.weapon.damage,combat);};
                        return DW.flightSim.trace(combat,a,b,bolt,body.state.team==='ally'?'player':'capital-enemy',surface,view.state,.25);
                    },undefined,2,[[-(heavy?7.65:1.683),0,0],[heavy?7.65:1.683,0,0]],radius);
                    if(m.burst>0){m.burst=Math.max(0,m.burst-dt);if(m.burst<=0)m.rest=heavy?3+(m.index%5)*.4:.8+(m.index%5)*.13;}
                });
                body.rig.geometry();
                if(body.state.integrity>0&&seconds%3<dt&&combat.enemies.filter(function(c){return c.hp>0&&c.team===body.state.team;}).length<8){
                    var hangar=asset.hangars&&asset.hangars[0]?asset.hangars[0].position:[-150,0,-10],pose=poseAt(body,hangar,[0,1,0]),craft=DW.flightSim.createCraft('hyper-bay-'+(++launches),Object.assign({},pose,{velocity:pose.back.map(function(v){return -v*30;}),rates:[0,0,0],ramp:[0,0,30],throttle:.6}),body.state.team);
                    craft.index=(launches-1)%8;craft.artWave=combat.wave;craft.callsign='Bay '+launches;craft.controller='ai';craft.skill=1;craft.mode='launch';craft.hangarLaunch={remaining:4};craft.goal=chart(world(body,[hangar[0],180,hangar[2]]),canonical(),camera);DW.flightSim.equip(craft,DW.arcade.profiles[0],DW.flightSim.defaultWeapon(DW.arcade.profiles[0]));if(combat.useHullModels){var selected=combat.hullModels?combat.hullModels[body.state.team]:'mixed';craft.collision={kind:'model',modelId:DW.shipPackModels.craftModel(craft,selected,combat.wave).id};}combat.enemies=combat.enemies.filter(function(c){return c.hp>0||!c.id.startsWith('hyper-bay-');});combat.enemies.push(craft);DW.flightSim.collisionChanged(combat);
                }
            });
            DW.flightSim.participants(combat).forEach(function(craft){
                if(craft.hp<=0)return;var current=chart(craft.pose.eye,camera,canonical()),previous=contactEyes.get(craft);contactEyes.set(craft,current);
                if(!previous||craft.hangarLaunch||craft===combat.player&&spawnGrace>0||H.path(previous,current,radius).distance*U<.001)return;
                var start=chart(previous,canonical(),camera),surface=hit(start,craft.pose.eye);
                if(surface){craft.pose.eye=start;craft.pose.velocity=craft.pose.velocity.map(function(v){return -.5*v;});craft.pose.ramp=[dot(craft.pose.velocity,craft.pose.right),dot(craft.pose.velocity,craft.pose.up),-dot(craft.pose.velocity,craft.pose.back)];contactEyes.set(craft,previous);DW.flightSim.collisionChanged(combat,craft);contacts++;}
            });});
        }
        /** @param {Pose} [view] */function geometry(view){
            if(view)camera=view;var result=/** @type {Batch[]} */([]);
            bodies.forEach(function(body){
                var p=H.chartPose(Object.assign({},canonical(),{eye:H.chart(body.canonical[0],radius),right:H.lower(body.canonical[0],body.canonical[1]),up:H.lower(body.canonical[0],body.canonical[2]),back:H.lower(body.canonical[0],body.canonical[3])}),camera),q=H.point(p.eye,radius);
                body.frame.set([...q,...H.lift(q,p.right),...H.lift(q,p.up),...H.lift(q,p.back)]);
                body.rig.geometry().forEach(function(source){var adapter=body.adapters.get(source);if(!adapter){adapter={vertices:source.vertices,color:source.color};body.adapters.set(source,adapter);}Object.assign(adapter,H.prepareHull(source),{origin:undefined,basis:undefined,hyperbolicRadius:radius/U,hyperbolicFrame:body.frame,hyperbolicLocalOrigin:source.origin,hyperbolicLocalBasis:source.basis});result.push(adapter);});
            });return result;
        }
        function telemetry(){return {seconds:seconds,contacts:contacts,launches:launches,hits:hits,shots:bodies.reduce(function(n,b){return n+b.mounts.reduce(function(s,m){return s+m.guns.fired;},0);},0),mounts:bodies.flatMap(function(b){return b.mounts.map(function(m){return {yaw:m.yaw,elevation:m.elevation,side:m.source.side,kind:m.source.kind,targetId:m.targetId,shots:m.guns.fired};});}),capitals:bodies.map(function(b){return {team:b.state.team,position:chart(world(b,[0,0,0]),canonical(),camera),heading:0,integrity:b.state.integrity,shots:b.mounts.reduce(function(n,m){return n+m.guns.fired;},0),hits:hits};})};}
        reset();return {reset:reset,step:step,geometry:geometry,hit:hit,damage:damage,spawnPlayer:spawnPlayer,components:function(){return bodies.flatMap(function(body){return (body.rig.components?body.rig.components():[]).map(function(p){return Object.assign({},p,{position:chart(world(body,p.position.map(function(v){return v*U;})),canonical(),camera)});});});},effects:function(pose){return bodies.flatMap(function(body){return DW.flightGuns.geometry({bolts:body.mounts.flatMap(function(m){return m.guns.bolts.map(function(b){return Object.assign({},b,{team:body.state.team});});}),impacts:body.mounts.flatMap(function(m){return m.guns.impacts;})},pose);});},telemetry:telemetry,readout:function(){return 'HYPERBOLIC CAPITAL BATTLE / R='+radius+' m\n'+bodies.map(function(b){return b.state.team.toUpperCase()+' '+Math.ceil(b.state.integrity/200)+'% integrity';}).join(' / ')+'\n'+telemetry().shots+' rounds / '+hits+' capital hits';}};
    }
    DW.hyperbolicBattle={create:create};
}());
