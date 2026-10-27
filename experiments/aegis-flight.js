(function(){
    'use strict';
    var assetUrl = /** @type {(value: string, base?: string) => string} */ (window.Driftworks.assetUrl);
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
    /** Segment/AABB intersection, including starting inside. @param {Vector} a @param {Vector} b @param {{min:number[];max:number[]}[]} boxes */
    function traceBoxes(a,b,boxes){
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
    /** Immutable mesh buffers are shared across both capital ships and all mounts. */
    var smokeTexture=/** @type {HTMLImageElement|undefined} */(undefined);
    var surfaceTexture=/** @type {HTMLImageElement|undefined} */(undefined);
    /** @type {Promise<void>|null} */var surfaceLoad=null;
    /** @type {WeakMap<Float32Array,Float32Array>} */var surfaceBuffers=new WeakMap();
    var cachedAsset=/** @type {import('./types').AegisFlightAsset|null} */(null);
    /** @type {Map<string,Float32Array>} */var vertexCache=new Map();
    /** Shared prepared resource, invalidated with its authored asset revision. */
    var idleAsset=/** @type {import('./types').AegisFlightAsset|null} */(null);
    /** Fixed turrets can join the hull; armed mounts retain independent pivots.
     * @param {import('./types').AegisFlightAsset} source */
    function prepareIdleAsset(source){
        if(idleAsset)return idleAsset;
        /** @type {Map<string,{color:[number,number,number];vertices:number[]}>} */var groups=new Map();
        /** @type {Map<string,number[]>} */var idleUV=new Map();
        /** @param {{color:[number,number,number];vertices:number[]}} batch @param {Vector} pivot @param {number[]=} uv */
        function add(batch,pivot,uv){
            var key=batch.color.join(','),group=groups.get(key);
            if(!group){group={color:batch.color,vertices:[]};groups.set(key,group);}
            var index=source.batches.findIndex(function(b){return b.color.join(',')===key;}),finish=source.surface&&source.surface.batches[index];
            var mapped=idleUV.get(key);if(finish&&!mapped){mapped=[];idleUV.set(key,mapped);}
            for(var k=0;k<batch.vertices.length;k+=6){
                for(var axis=0;axis<3;axis++)group.vertices.push(batch.vertices[k+axis]+pivot[axis]);
                group.vertices.push(batch.vertices[k+3],batch.vertices[k+4],batch.vertices[k+5]);
                if(finish&&mapped)mapped.push(uv?uv[k/3]:finish.plainUV[0],uv?uv[k/3+1]:finish.plainUV[1]);
            }
        }
        source.batches.forEach(function(b,i){add(b,[0,0,0],source.surface&&source.surface.batches[i]?.uv);});
        (source.engines||[]).forEach(function(e){e.batches.forEach(function(b){add(b,e.position);});});
        source.turrets.forEach(function(t){t.batches.forEach(function(b){add(b,t.position);});});
        idleAsset=Object.assign({},source,{batches:Array.from(groups.values()),turrets:[],engines:[]});
        if(source.surface)idleAsset.surface={atlas:source.surface.atlas,batches:idleAsset.batches.map(function(b){var index=source.batches.findIndex(function(s){return s.color.join(',')===b.color.join(',');}),finish=source.surface&&source.surface.batches[index];return finish?Object.assign({},finish,{uv:idleUV.get(b.color.join(','))||[]}):null;})};
        return idleAsset;
    }
    /** @param {import('./types').AegisRigOptions} [options] @returns {import('./types').AegisFlightRig} */
    function create(options){
        var sourceAsset=DW.aegisFlightAsset,unarmed=!!(options&&options.unarmed),origin=options?options.state.position:[0,0,1200],team=options?options.state.team:'ally';
        if(cachedAsset!==sourceAsset){cachedAsset=sourceAsset;vertexCache.clear();surfaceBuffers=new WeakMap();idleAsset=null;}
        var asset=unarmed?prepareIdleAsset(sourceAsset):sourceAsset;
        /** @param {number[]} values */function vertices(values){var key=values.join(','),buffer=vertexCache.get(key);if(!buffer){buffer=new Float32Array(values.map(function(v,i){return i%6<3?v/U:v;}));vertexCache.set(key,buffer);}return buffer;}
        /** @param {[number,number,number]} color @returns {[number,number,number]} */function livery(color){return team==='enemy'&&color[2]>color[0]*1.25?[Math.max(.45,color[2]),color[1]*.22,color[0]*.3]:color;}
        /** @param {Vector} p @param {boolean} [inverse] */function rotate(p,inverse){var a=(options?options.state.heading:0)*(inverse?-1:1),c=Math.cos(a),s=Math.sin(a);return [c*p[0]-s*p[1],s*p[0]+c*p[1],p[2]];}
        var hangars=asset.hangars||[],collisionBoxes=boxes.slice();
        if(!unarmed)collisionBoxes[8]={min:boxes[8].min,max:[652.5,47.5,38]};
        hangars.forEach(function(h){
            /** @type {typeof boxes} */var cut=[];
            collisionBoxes.forEach(function(box){
                var lo=Math.max(box.min[0],h.position[0]-h.halfWidth),hi=Math.min(box.max[0],h.position[0]+h.halfWidth),bottom=h.position[2]-h.halfHeight,top=h.position[2]+h.halfHeight;
                if(lo>=hi||top<=box.min[2]||bottom>=box.max[2]){cut.push(box);return;}
                if(box.min[0]<lo)cut.push({min:box.min.slice(),max:[lo,box.max[1],box.max[2]]});
                if(hi<box.max[0])cut.push({min:[hi,box.min[1],box.min[2]],max:box.max.slice()});
                if(bottom>box.min[2])cut.push({min:[lo,box.min[1],box.min[2]],max:[hi,box.max[1],bottom]});
                if(top<box.max[2])cut.push({min:[lo,box.min[1],top],max:[hi,box.max[1],box.max[2]]});
            });collisionBoxes=cut;
        });
        /** @param {Vector} a @param {Vector} b */function hullHit(a,b){return traceBoxes(a,b,collisionBoxes);}
        var launchClock=1,launched=0;
        var weapon=Object.assign({},DW.retailWeapons[0],{name:'Aegis point defense',fireWait:.16,damage:3});
        var heavyWeapon=Object.assign({},weapon,{name:'Aegis main battery',speed:700,lifetime:8,length:35,headRadius:2.5,tailRadius:2,damage:20,fireWait:.55});
        var mounts=asset.turrets.map(function(t,index){
            var basis=new Float32Array([1,0,0,0,1,0,0,0,1]),pivot=/** @type {[number,number,number]} */(t.position.map(function(v,i){return v/U+origin[i];}));
            var batches=t.batches.map(function(b){
                return {vertices:vertices(b.vertices),color:livery(b.color),origin:pivot,basis:basis,staticGeometry:true};
            });
            return {source:t,routeWait:0,route:/** @type {{direction:Vector;distance:number}|null} */(null),aimOffset:[0,0,0],yaw:0,elevation:0,targetId:'',randomState:(Math.imul(index+1,2654435761)>>>0),settled:0,burst:0,rest:0,specWait:0,specPause:2.8+(index%7)*.3,burstLength:.55+(index%3)*.05,burstPause:.8+(index%5)*.13,guns:DW.flightGuns.create(),basis:basis,batches:batches};
        });
        var engines=(asset.engines||[]).map(function(e){return {source:e,batches:e.batches.map(function(b){return {vertices:vertices(b.vertices),color:livery(b.color),origin:/** @type {[number,number,number]} */(worldEngine(e.position)),basis:new Float32Array([1,0,0,0,1,0,0,0,1]),staticGeometry:true};})};});
        /** @param {Vector} p */function worldEngine(p){return rotate(p).map(function(v,i){return v/U+origin[i];});}
        // Tiny cached local bounds are independent of visual triangle count.
        var parts=mounts.map(function(m){return makePart(m.source.id,m.source.kind,m.source.position,m.batches,m);}).concat(engines.map(function(e){return makePart(e.source.id,'engine',e.source.position,e.batches,null);}));
        /** @param {string} id @param {string} kind @param {Vector} position @param {Batch[]} batches @param {typeof mounts[number]|null} mount */
        function makePart(id,kind,position,batches,mount){
            var lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
            batches.forEach(function(b){for(var i=0;i<b.vertices.length;i+=6)for(var k=0;k<3;k++){lo[k]=Math.min(lo[k],b.vertices[i+k]*U);hi[k]=Math.max(hi[k],b.vertices[i+k]*U);}});
            return {id:id,kind:kind,position:position,hp:kind==='heavy'?180:kind==='engine'?240:70,maxHp:kind==='heavy'?180:kind==='engine'?240:70,batches:batches,mount:mount,box:{min:lo,max:hi},original:batches.map(function(b){return {vertices:b.vertices,color:b.color};})};
        }
        var lastSurface=/** @type {{point:Vector;part:typeof parts[number]|null}|null} */(null);
        /** @param {typeof parts[number]} part @param {Vector} p */
        function partLocal(part,p){
            var d=sub(p,part.position),m=part.mount;if(!m)return d;
            var c=Math.cos(m.yaw),sn=Math.sin(m.yaw),ce=Math.cos(m.elevation),se=Math.sin(m.elevation),x=c*d[0]+sn*d[1];
            return [ce*x-se*d[2],-sn*d[0]+c*d[1],se*x+ce*d[2]];
        }
        /** @param {Vector} a @param {Vector} b @param {typeof mounts[number]} [ignore] */
        function partHit(a,b,ignore){
            var best=/** @type {{part:typeof parts[number];fraction:number}|null} */(null);
            parts.forEach(function(p){
                if(ignore&&p.mount===ignore)return;
                var start=partLocal(p,a),end=partLocal(p,b);if(!traceBoxes(start,end,[p.box]))return;
                var d=sub(end,start),fraction=Infinity;
                p.original.forEach(function(batch){var v=batch.vertices;
                    for(var i=0;i<v.length;i+=18){
                        var ax=v[i]*U,ay=v[i+1]*U,az=v[i+2]*U,ex=v[i+6]*U-ax,ey=v[i+7]*U-ay,ez=v[i+8]*U-az,fx=v[i+12]*U-ax,fy=v[i+13]*U-ay,fz=v[i+14]*U-az;
                        var px=d[1]*fz-d[2]*fy,py=d[2]*fx-d[0]*fz,pz=d[0]*fy-d[1]*fx,det=ex*px+ey*py+ez*pz;if(Math.abs(det)<1e-9)continue;
                        var tx=start[0]-ax,ty=start[1]-ay,tz=start[2]-az,u=(tx*px+ty*py+tz*pz)/det;if(u<0||u>1)continue;
                        var qx=ty*ez-tz*ey,qy=tz*ex-tx*ez,qz=tx*ey-ty*ex,w=(d[0]*qx+d[1]*qy+d[2]*qz)/det;if(w<0||u+w>1)continue;
                        var t=(fx*qx+fy*qy+fz*qz)/det;if(t>=0&&t<=1&&t<fraction)fraction=t;
                    }
                });
                if(fraction<Infinity&&(!best||fraction<best.fraction))best={part:p,fraction:fraction};
            });return best;
        }
        /** Finalized projectile impacts only: visibility/convergence probes never mutate health.
         * @param {Vector} point @param {number} amount @param {import('./types').Combat} combat */
        function damage(point,amount,combat){
            if(unarmed||!Number.isFinite(amount)||amount<=0)return false;
            var p=local(point),part=lastSurface&&Math.hypot(...sub(point,lastSurface.point))<1e-7?lastSurface.part:parts.find(function(part){var q=partLocal(part,p);return q.every(function(v,k){return v>=part.box.min[k]-.05&&v<=part.box.max[k]+.05;});});
            if(!part&&!collisionBoxes.some(function(box){return p.every(function(v,k){return v>=box.min[k]-.05&&v<=box.max[k]+.05;});}))return false;
            if(DW.combatShields&&DW.aegisShieldEnvelope&&(!options||options.state.integrity>0)){shieldHits.push({anchor:DW.combatShields.anchor(DW.aegisShieldEnvelope,p),time:seconds,heavy:amount>=20});if(shieldHits.length>32)shieldHits.shift();}
            if(options)options.state.integrity=Math.max(0,options.state.integrity-amount);
            if(!part||part.hp<=0)return !!options;
            part.hp=Math.max(0,part.hp-amount);
            if(part.hp===0){
                if(part.mount){part.mount.targetId='';part.mount.burst=0;}
                part.batches.forEach(function(b,i){
                    var v=b.vertices,out=/** @type {number[]} */([]);
                    // Planar UVs follow each face's dominant normal; buffers change once on destruction.
                    for(var j=0;j<v.length;j+=6){var axis=Math.abs(v[j+3])>Math.abs(v[j+4])?0:1;if(Math.abs(v[j+5])>Math.abs(v[j+3+axis]))axis=2;out.push(v[j],v[j+1],v[j+2],v[j+3],v[j+4],v[j+5],(v[j+(axis===0?1:0)]*U/28)%1+.5,(v[j+(axis===2?1:2)]*U/28)%1+.5);}
                    b.vertices=new Float32Array(out);b.stride=8;b.texture=smokeTexture;b.color=[.24,.22,.20];
                });
                combat.flashes.push({position:world(part.position),velocity:options?options.state.velocity.map(function(v){return v/U;}):[0,0,0],age:0,scale:part.kind==='heavy'?6:4,destruction:true});
            }
            return true;
        }
        function components(){return parts.map(function(p){return {id:'capital-'+team+'-'+p.id,kind:p.kind,hp:p.hp,maxHp:p.maxHp,position:world(p.position)};});}
        var hullBasis=new Float32Array([1,0,0,0,1,0,0,0,1]);
        /** @type {Batch[]} */var staticBatches=asset.batches.map(function(b){return {vertices:vertices(b.vertices),color:livery(b.color),origin:/** @type {[number,number,number]} */(origin),basis:hullBasis,staticGeometry:true};});
        var surfaceStates=staticBatches.map(function(b,i){
            var finish=asset.surface&&asset.surface.batches[i];if(!finish||!surfaceTexture)return null;
            var prepared=surfaceBuffers.get(b.vertices);
            if(!prepared){prepared=new Float32Array(b.vertices.length/6*8);for(var k=0,j=0;k<b.vertices.length;k+=6,j+=8){prepared.set(b.vertices.subarray(k,k+6),j);prepared[j+6]=finish.uv[k/3];prepared[j+7]=finish.uv[k/3+1];}surfaceBuffers.set(b.vertices,prepared);}
            return {batch:b,original:b.vertices,color:b.color,prepared:prepared,finish:livery(finish.color)};
        });
        /** Review/benchmark switch; keeps actor arrays, poses and damage ownership stable.
         * @param {boolean} enabled */function setSurfaceDetail(enabled){surfaceStates.forEach(function(s){if(!s)return;s.batch.vertices=enabled?s.prepared:s.original;s.batch.color=enabled?s.finish:s.color;if(enabled){s.batch.stride=8;s.batch.texture=surfaceTexture;}else{delete s.batch.stride;delete s.batch.texture;}});}
        setSurfaceDetail(true);
        /** @type {Vector|null} */var lastEye=null;
        var seconds=0,contacts=0,confirmedHits=0;
        /** @type {{anchor:number;time:number;heavy:boolean}[]} */var shieldHits=[];
        /** @param {Vector} p */function local(p){return rotate(p.map(function(v,i){return (v-origin[i])*U;}),true);}
        /** @param {Vector} p */function world(p){return rotate(p).map(function(v,i){return v/U+origin[i];});}
        /** Independent continuous hull aim coordinates in the opposing ship's frame.
         * @param {typeof mounts[number]} m */function randomAim(m){
            /** @returns {number} */function random(){m.randomState=(Math.imul(m.randomState,1664525)+1013904223)>>>0;return m.randomState/4294967296;}
            m.aimOffset=[-300+random()*920,-40+random()*80,-32+random()*64];
            // Avoid deliberately aiming down an empty through-hangar passage.
            hangars.forEach(function(h){if(Math.abs(m.aimOffset[0]-h.position[0])<h.halfWidth&&Math.abs(m.aimOffset[2]-h.position[2])<h.halfHeight)m.aimOffset[0]=h.position[0]+h.halfWidth+10+random()*25;});
        }
        /** @param {import('./types').Combat} [combat] */
        function reset(combat){shieldHits=[];lastSurface=null;parts.forEach(function(p){p.hp=p.maxHp;p.batches.forEach(function(b,i){b.vertices=p.original[i].vertices;b.color=p.original[i].color;delete b.stride;delete b.texture;});});launchClock=1;launched=0;if(!unarmed&&combat&&hangars.length){combat.hangarSupport=true;combat.enemies=combat.enemies.filter(function(e){return e.team!=='ally';});}lastEye=null;seconds=0;contacts=0;confirmedHits=0;mounts.forEach(function(m,i){m.routeWait=-(i%12)*.01;m.route=null;m.yaw=0;m.elevation=0;m.targetId='';m.settled=0;m.burst=0;m.specWait=m.specPause;m.randomState=Math.imul(i+1+(team==='enemy'?97:0),2654435761)>>>0;m.rest=m.source.kind==='heavy'?.15+m.randomState/4294967296*3.5:i*.037;if(m.source.kind==='heavy')randomAim(m);m.guns=DW.flightGuns.create();m.guns.cooldown=i*.013;});}
        /** Main batteries engage the opposing hull, never the fighter roster.
         * @param {typeof mounts[number]} m @param {number} dt @param {FlightView} view */
        function stepHeavy(m,dt,view){
            if(!options)return;
            var opponent=options.opponent,p=m.source.position,side=m.source.side;
            var ch=Math.cos(opponent.heading),sh=Math.sin(opponent.heading),offset=m.aimOffset;
            var target=opponent.position.map(function(v,i){return v+(i===0?ch*offset[0]-sh*offset[1]:i===1?sh*offset[0]+ch*offset[1]:offset[2])/U;});
            var bridge=!!options.bridge,path=/** @type {{direction:Vector;distance:number}|null} */(null);
            if(bridge){
                m.routeWait-=dt;
                if(m.routeWait<=0){
                    var start=world(p),route=DW.flightGuns.ballisticPath(start,target,options.state.region||0,opponent.region||0,true);
                    if(route){var travel=route.distance*U/heavyWeapon.speed;target=target.map(function(v,i){return v+opponent.velocity[i]*travel/U;});route=DW.flightGuns.ballisticPath(start,target,options.state.region||0,opponent.region||0,true);}
                    m.route=route;m.routeWait+=.12;
                }
                path=m.route;
            }
            if(bridge&&path){const route=path;target=world(p).map(function(v,i){return v+route.direction[i]*route.distance;});}
            var relative=sub(local(target),p),velocity=bridge?[0,0,0]:rotate(opponent.velocity,true),time=interceptTime(relative,velocity,heavyWeapon.speed);
            var travelTime=time===null?0:time;
            var aim=time!==null&&time<=heavyWeapon.lifetime?target.map(function(v,i){return v+(bridge?0:opponent.velocity[i]*travelTime/U);}):null;
            var d=aim?sub(local(aim),p):relative,goalYaw=wrap(Math.atan2(d[1],d[0])-Math.PI),goalElevation=side*clamp(Math.atan2(d[2]*side,Math.hypot(d[0],d[1])),bridge?-.2:0,Math.PI*.47);
            m.targetId='capital-'+opponent.team;
            m.yaw+=clamp(wrap(goalYaw-m.yaw),-.35*dt,.35*dt);m.elevation=approach(m.elevation,goalElevation,.25*dt);
            var cy=Math.cos(m.yaw),sy=Math.sin(m.yaw),ce=Math.cos(m.elevation),se=Math.sin(m.elevation),forward=[-cy*ce,-sy*ce,se];
            var clear=!!aim&&(bridge||d[2]*side>0)&&Math.abs(wrap(goalYaw-m.yaw))<.018&&Math.abs(goalElevation-m.elevation)<.018&&!hullHit(p.map(function(v,i){return v+forward[i]*45.1;}),local(aim));
            var active=options.state.mainBatteryClear!==false&&view.combat.enabled&&!view.combat.dead&&!view.combat.roundOver&&options.state.integrity>0&&opponent.integrity>0;
            if(clear)m.rest=Math.max(0,m.rest-dt);m.settled=clear?m.settled+dt:0;
            if(!clear&&m.burst>0){m.burst=0;m.rest=3;}
            if(active&&clear&&m.settled>.25&&m.rest<=0&&m.burst<=0)m.burst=.7;
            DW.flightGuns.step(m.guns,{region:options&&options.state.region||0,eye:world(p),right:rotate([-sy,cy,0]),up:rotate([cy*se,sy*se,ce]),back:rotate(forward.map(function(v){return -v;}))},heavyWeapon,active&&clear&&m.burst>0,dt,
                function(a,b,bolt){return traceRound(m,view,a,b,bolt);},aim?function(){return aim;}:undefined,2,[[-7.65,45.09,-.45*side],[7.65,45.09,-.45*side]],bridge);
            if(m.burst>0){m.burst=Math.max(0,m.burst-dt);if(m.burst<=0){
                m.randomState=(Math.imul(m.randomState,1664525)+1013904223)>>>0;
                m.rest=2.8+m.randomState/4294967296*2.4;
                randomAim(m);
            }}
        }
        /** Already-fired rounds retain their damage after a mount is destroyed.
         * @param {typeof mounts[number]} m @param {FlightView} view @param {Vector} a @param {Vector} b @param {import('./types').Bolt} bolt */
        function traceRound(m,view,a,b,bolt){
            var own=options&&options.bridge&&(bolt.region||0)!==(options.state.region||0)?null:hit(a,b,m),opponentRig=options&&options.opponentRig,other=opponentRig&&(!options||!options.bridge||(bolt.region||0)===(options.opponent.region||0))?opponentRig.hit(a,b):null;
            var point=other&&(!own||Math.hypot(...sub(other,a))<Math.hypot(...sub(own,a)))?other:own;
            if(m.source.kind==='heavy'){
                if(point===other&&other&&options){
                    if(opponentRig&&opponentRig.damage)opponentRig.damage(other,bolt.weapon.damage,view.combat);else options.opponent.integrity=Math.max(0,options.opponent.integrity-bolt.weapon.damage);
                    confirmedHits++;view.combat.flashes.push({position:other.slice(),velocity:options.opponent.velocity.map(function(v){return v/U;}),age:0,scale:5,destruction:true,region:options.opponent.region||0});
                }return point;
            }
            /** @type {import('./types').TerrainHit} */var surface=function(){return point;};
            surface.onImpact=function(p,round){if(opponentRig&&opponentRig.damage&&opponentRig.damage(p,round.weapon.damage,view.combat))confirmedHits++;};
            return DW.training.trace(view.combat,a,b,bolt,team==='ally'?'player':'capital-enemy',surface,view.state,.25,function(){confirmedHits++;});
        }
        /** @param {number} elapsed @param {FlightView} view */
        function step(elapsed,view){
            if(!Number.isFinite(elapsed)||elapsed<=0)return;
            var dt=Math.min(.1,elapsed),combat=view.combat;seconds+=dt;
            if(lastEye){var collision=hullHit(lastEye,local(view.state.eye));if(collision){
                var normal=collision.normal;view.state.eye=world(collision.point.map(function(v,i){return v+normal[i]*3;}));
                view.state.velocity=[0,0,0];view.state.ramp=[0,0,0];view.state.throttle=0;contacts++;
            }}lastEye=local(view.state.eye);
            if(!unarmed&&(team==='ally'||options&&options.bridge)&&combat.hangarSupport&&hangars.length&&combat.enabled&&!combat.dead&&!combat.roundOver&&(!options||options.state.integrity>0)){
                launchClock=Math.max(0,launchClock-dt);
                var allies=combat.enemies.filter(function(e){return e.hp>0&&e.team===team;});
                if(launchClock<=0&&allies.length<8){
                    var hangar=hangars[Math.floor(launched/2)%hangars.length],side=launched%2?1:-1,pose=DW.arcade.create(0);
                    pose.eye=world(hangar.position);pose.right=rotate([side,0,0]);pose.up=[0,0,1];pose.back=rotate([0,-side,0]);pose.velocity=rotate([0,side*60,0]).map(function(v,i){return v+(options?options.state.velocity[i]:0);});pose.throttle=.7;pose.ramp=[0,0,0];pose.region=options&&options.state.region||0;
                    var craft=DW.training.createCraft('aegis-launch-'+(options&&options.bridge?team+'-':'')+(++launched),pose,team);
                    craft.index=(launched-1)%8;craft.artWave=combat.wave;craft.callsign='Bay '+launched;craft.controller='ai';craft.opponentStyle=options&&options.bridge?'fso-breaker':combat.opponentStyle||'baseline';if(options&&options.bridge)craft.skill=2;craft.mode='launch';craft.goal=world([hangar.position[0],side*160,hangar.position[2]]);craft.hangarLaunch={remaining:2.2};
                    DW.training.equip(craft,DW.arcade.profiles[0],DW.training.defaultWeapon(DW.arcade.profiles[0]));
                    if(combat.useHullModels){var selection=combat.hullModels?combat.hullModels[team]:'mixed';craft.collision={kind:'model',modelId:DW.shipPackModels.craftModel(craft,selection,combat.wave).id};}
                    combat.enemies=combat.enemies.filter(function(e){return e.hp>0||!e.id.startsWith('aegis-launch-');});
                    combat.enemies.push(craft);launchClock=3;
                }
            }
            if(unarmed)return;
            var roster=DW.training.alive(combat);if(team==='enemy'&&combat.player.hp>0)roster=roster.concat([combat.player]);
            var targets=roster.filter(function(c){return (c.team||'enemy')!==team&&(!options||!options.bridge||(c.pose.region||0)===(options.state.region||0));}).map(function(c){return {craft:c,position:local(c.pose.eye)};});
            DW.training.collisionBatch(combat,function(){mounts.forEach(function(m){
                var part=parts.find(function(p){return p.mount===m;});
                if(part&&part.hp<=0){DW.flightGuns.step(m.guns,view.state,m.source.kind==='heavy'?heavyWeapon:weapon,false,dt,function(a,b,bolt){return traceRound(m,view,a,b,bolt);},undefined,undefined,undefined,!!(options&&options.bridge));return;}
                if(m.source.kind==='heavy'){stepHeavy(m,dt,view);return;}
                var p=m.source.position,side=m.source.side;
                // Retain a valid lock; each mount independently samples a new contact.
                var range2=weapon.speed*weapon.speed*weapon.lifetime*weapon.lifetime;
                /** @param {{position:Vector}} candidate */
                function eligible(candidate){var q=candidate.position,dx=q[0]-p[0],dy=q[1]-p[1],dz=q[2]-p[2];return dz*side>2&&dx*dx+dy*dy+dz*dz<range2;}
                var retained=targets.find(function(candidate){return candidate.craft.id===m.targetId;});
                var target=/** @type {import('./types').Craft|null} */(retained&&eligible(retained)?retained.craft:null),count=0;
                if(!target)for(var candidate of targets){
                    if(!eligible(candidate))continue;
                    count++;
                    // Seeded per-mount reservoir sampling avoids nearest-target dogpiles
                    // and candidate arrays/sorts, while keeping resets reproducible.
                    m.randomState=(Math.imul(m.randomState,1664525)+1013904223)>>>0;
                    if(m.randomState/4294967296<1/count)target=candidate.craft;
                }
                m.targetId=target?target.id:'';
                var goalYaw=0,goalElevation=side*.08,aim=/** @type {Vector|null} */(null);
                if(target){
                    var d=sub(local(target.pose.eye),p),flight=interceptTime(d,rotate(target.pose.velocity,true),weapon.speed);
                    if(flight!==null&&flight<=weapon.lifetime){
                        var travelTime=flight,velocity=target.pose.velocity;aim=target.pose.eye.map(function(v,i){return v+velocity[i]*travelTime/U;});
                        d=sub(local(aim),p);goalYaw=wrap(Math.atan2(d[1],d[0])-Math.PI);
                        goalElevation=side*clamp(Math.atan2(d[2]*side,Math.hypot(d[0],d[1])),0,Math.PI*.47);
                    }
                }
                var previousYaw=m.yaw,previousElevation=m.elevation;
                m.yaw+=clamp(wrap(goalYaw-m.yaw),-2.8*dt,2.8*dt);
                m.elevation=approach(m.elevation,goalElevation,2.2*dt);
                var yaw=m.yaw,el=m.elevation;
                var forward=[-Math.cos(yaw)*Math.cos(el),-Math.sin(yaw)*Math.cos(el),Math.sin(el)];
                var up=[Math.cos(yaw)*Math.sin(el),Math.sin(yaw)*Math.sin(el),Math.cos(el)];
                var right=[-Math.sin(yaw),Math.cos(yaw),0];
                var ready=!!target&&!!aim&&Math.abs(wrap(goalYaw-m.yaw))<.035&&Math.abs(goalElevation-el)<.035;
                if(ready&&aim){var aimDirection=sub(local(aim),p),distance=Math.hypot.apply(null,aimDirection);if(dot(forward,aimDirection)/distance<.999)ready=false;var muzzle=p.map(function(v,i){return v+forward[i]*10.12;});if(hullHit(muzzle,local(aim)))ready=false;}
                // Fire only after the mount settles; track through the pauses.
                var slewRate=Math.hypot(m.yaw-previousYaw,m.elevation-previousElevation)/dt;
                var stable=combat.enabled&&(!options||options.state.integrity>0)&&ready&&slewRate<=.8;
                m.rest=Math.max(0,m.rest-dt);
                m.settled=stable?m.settled+dt:0;
                if(!stable&&m.burst>0){m.burst=0;m.rest=m.burstPause;}
                if(stable&&m.settled>=.12&&m.burst<=0&&m.rest<=0)m.burst=m.burstLength;
                // A quiet mount can occasionally loose one twin volley along its barrels.
                // Never redirect this imperfect shot to the target or sweep a continuous hose.
                if(combat.enabled&&target)m.specWait=Math.max(0,m.specWait-dt);
                var speculative=false;
                if(combat.enabled&&(!options||options.state.integrity>0)&&target&&!stable&&m.burst<=0&&m.rest<=0&&m.specWait<=0&&m.guns.cooldown<=1e-9){
                    var toward=sub(local(aim||target.pose.eye),p),span=Math.hypot.apply(null,toward);
                    if(span>0&&dot(forward,toward)/span>=.70710678){
                        var launch=p.map(function(v,k){return v+forward[k]*9.9;}),end=p.map(function(v,k){return v+forward[k]*weapon.speed*weapon.lifetime;});
                        speculative=!hullHit(launch,end);
                    }
                }
                var firedBefore=m.guns.fired;
                DW.flightGuns.step(m.guns,{region:options&&options.state.region||0,eye:world(p),right:rotate(right),up:rotate(up),back:rotate(forward.map(function(v){return -v;}))},weapon,(stable&&m.burst>0)||speculative,dt,
                    function(a,b,bolt){
                        return traceRound(m,view,a,b,bolt);
                    },
                    !speculative&&aim?function(){return aim;}:undefined,2,[[-1.683,9.9,-.099*side],[1.683,9.9,-.099*side]],!!(options&&options.bridge));
                if(m.guns.fired>firedBefore){m.specWait=m.specPause;if(speculative)m.rest=m.burstPause;}
                if(m.burst>0){m.burst=Math.max(0,m.burst-dt);if(m.burst<=0)m.rest=m.burstPause;}
            });});
        }
        var renderBatches=staticBatches.concat(mounts.flatMap(function(m){return m.batches;}),engines.flatMap(function(e){return e.batches;}));
        /** @returns {Batch[]} */function geometry(){
            var heading=options?options.state.heading:0,ch=Math.cos(heading),sh=Math.sin(heading);
            hullBasis.set([ch,sh,0,-sh,ch,0,0,0,1]);
            engines.forEach(function(e){var p=world(e.source.position);e.batches.forEach(function(b){b.basis.set(hullBasis);b.origin.splice(0,3,...p);});});
            mounts.forEach(function(m){
                var cy=Math.cos(m.yaw+heading),sy=Math.sin(m.yaw+heading),ce=Math.cos(m.elevation),se=Math.sin(m.elevation),b=m.basis,pivot=world(m.source.position);
                m.batches.forEach(function(batch){if(batch.origin)for(var k=0;k<3;k++)batch.origin[k]=pivot[k];});
                // Column-major Rz(yaw) * Ry(elevation), shared by all material batches.
                b[0]=cy*ce;b[1]=sy*ce;b[2]=-se;b[3]=-sy;b[4]=cy;b[5]=0;b[6]=cy*se;b[7]=sy*se;b[8]=ce;
            });
            if(options&&options.bridge)renderBatches.forEach(function(b){b.region=options.state.region||0;b.lensCenter=options.state.position;b.lensRadius=750;});
            return renderBatches;
        }
        /** @param {Vector} a @param {Vector} b @param {typeof mounts[number]} [ignore] */function hit(a,b,ignore){
            var la=local(a),lb=local(b),h=hullHit(la,lb),p=partHit(la,lb,ignore),component=p&&(!h||p.fraction<h.fraction)?p:null;
            var fraction=component?component.fraction:h?h.fraction:Infinity;
            var point=Number.isFinite(fraction)?a.map(function(v,i){return v+(b[i]-v)*fraction;}):null;
            lastSurface=point?{point:point.slice(),part:component?component.part:null}:null;return point;
        }
        /** @param {import('./types').Pose} pose @param {boolean=} shields */function effects(pose,shields){var batches=DW.flightGuns.geometry({bolts:mounts.flatMap(function(m){return m.guns.bolts.map(function(b){return Object.assign({},b,{team:team});});}),impacts:mounts.flatMap(function(m){return m.guns.impacts;})},pose,!!(options&&options.bridge));shieldHits=shieldHits.filter(function(h){return seconds-h.time<(h.heavy?.65:.36);});if(shields!==false&&shieldHits.length&&DW.combatShields&&DW.aegisShieldEnvelope)batches=batches.concat(DW.combatShields.capital(DW.aegisShieldEnvelope,shieldHits,seconds,origin,options?options.state.heading:0,options&&options.state.region||0));return batches;}
        function readout(){if(unarmed)return 'AEGIS / 1,305 m · UNARMED';var shots=mounts.reduce(function(n,m){return n+m.guns.fired;},0);return 'AEGIS / 1,305 m\n12 heavy batteries standing by · 12 point-defense mounts\nPD: '+shots+' rounds / '+confirmedHits+' confirmed hits\n'+seconds.toFixed(1)+' s · '+contacts+' hull contacts'+(hangars.length?'\nHangar: '+launched+' fighters launched':'');}
        function telemetry(){return {seconds:seconds,contacts:contacts,launches:launched,shots:mounts.reduce(function(n,m){return n+m.guns.fired;},0),hits:confirmedHits,mounts:mounts.map(function(m){return {yaw:m.yaw,elevation:m.elevation,side:m.source.side,kind:m.source.kind,targetId:m.targetId,shots:m.guns.fired,aimPoint:m.source.kind==='heavy'?m.aimOffset.slice():undefined};})};}
        reset();return {setSurfaceDetail:setSurfaceDetail,reset:reset,step:step,geometry:geometry,effects:effects,readout:readout,hit:hit,damage:damage,components:components,telemetry:telemetry};
    }
    /** Two runtime rigs share meshes; their mutable transforms and weapons remain independent.
     * @param {{battlefield?:boolean;bridge?:boolean}} [options] @returns {import('./types').AegisFlightRig} */
    function createBattle(options){
        /** @type {import('./types').AegisCapitalState[]} */var states=[{team:'ally',position:[0,0,1200],heading:0,velocity:[0,0,0],integrity:20000},{team:'enemy',position:[120/U,1500/U,1200+180/U],heading:Math.PI,velocity:[0,0,0],integrity:20000}];
        if(options&&options.bridge){states[0].position=[0,-2675/U,1550/U];states[1].position=[12000/U,-1325/U,1550/U];states.forEach(function(s,i){s.region=i;s.heading=i*Math.PI;s.mainBatteryClear=true;});}
        var motion=[0,0];
        var starts=states.map(function(s){return {position:s.position.slice(),heading:s.heading};}),seconds=0;
        var configs=states.map(function(state,i){return {state:state,bridge:!!(options&&options.bridge),opponent:states[1-i],opponentRig:/** @type {import('./types').AegisFlightRig|undefined} */(undefined)};});
        var rigs=configs.map(function(config){return create(config);});configs.forEach(function(config,i){config.opponentRig=rigs[1-i];});
        var renderBatches=rigs.flatMap(function(rig){return rig.geometry();});
        /** @param {import('./types').Combat} [combat] */function reset(combat){
            seconds=0;motion=[0,0];
            if(options&&options.battlefield&&combat){
                var pose=combat.player.pose;
                [[-1100,1800,300],[1100,2100,650]].forEach(function(offset,i){
                    starts[i].position=pose.eye.map(function(v,k){return v+(pose.right[k]*offset[0]-pose.back[k]*offset[1]+pose.up[k]*offset[2])/U;});
                });
                // The authored bow is local -X. Cant opposing bows twenty
                // degrees off the engagement line to expose both gun decks.
                var bearing=Math.atan2(starts[1].position[1]-starts[0].position[1],starts[1].position[0]-starts[0].position[0]);
                starts[0].heading=bearing+Math.PI-Math.PI/9;
                starts[1].heading=bearing+Math.PI/9;
            }
            states.forEach(function(s,i){s.position.splice(0,3,...starts[i].position);s.heading=starts[i].heading;s.velocity=[0,0,0];s.integrity=20000;s.mainBatteryClear=true;rigs[i].reset(i===0&&!(options&&options.battlefield)?combat:undefined);});
        }
        /** @param {number} elapsed @param {FlightView} view */function step(elapsed,view){
            if(!Number.isFinite(elapsed)||elapsed<=0)return;var dt=Math.min(.1,elapsed);seconds+=dt;
            // Bounded, opposing patrol arcs: ~12 m/s, a slow heading swing, no eventual collision/drift.
            states.forEach(function(s,i){var engines=rigs[i].components?rigs[i].components().filter(function(p){return p.kind==='engine';}):[],power=engines.length?engines.filter(function(p){return p.hp>0;}).length/engines.length:1;motion[i]+=dt*power;var phase=motion[i]*.018,sign=i===0?-1:1,old=s.position.slice();if(s.integrity>0){
                if(options&&options.bridge){
                    var orbit=(i===0?-Math.PI/2:Math.PI/2)+(i===0?1:-1)*motion[i]*.006;
                    s.position[0]=(i*12000+Math.cos(orbit)*675)/U;s.position[1]=(-2000+Math.sin(orbit)*675)/U;
                    s.heading=orbit+Math.PI/2;
                }else{s.position[0]=starts[i].position[0]+sign*Math.sin(phase)*650/U;s.position[1]=starts[i].position[1]+sign*(1-Math.cos(phase))*120/U;s.heading=starts[i].heading+sign*Math.sin(phase*.7)*.12;}
            }s.velocity=s.position.map(function(v,k){return (v-old[k])*U/dt;});});
            if(options&&options.bridge){
                var opposition=Math.cos(-Math.PI+(motion[0]+motion[1])*.006),clear=opposition<-.25;
                states.forEach(function(s){s.mainBatteryClear=clear;});
            }
            rigs.forEach(function(rig){rig.step(dt,view);});
        }
        /** @param {Vector} a @param {Vector} b */function hit(a,b){var best=/** @type {Vector|null} */(null),distance=Infinity;rigs.forEach(function(rig){var point=rig.hit(a,b);if(point){var d=Math.hypot.apply(null,sub(point,a));if(d<distance){distance=d;best=point;}}});return best;}
        /** @param {Vector} point @param {number} amount @param {import('./types').Combat} combat */
        function damage(point,amount,combat){var nearest=0,best=Infinity;states.forEach(function(s,i){var d=Math.hypot(...sub(point,s.position));if(d<best){best=d;nearest=i;}});var rig=rigs[nearest];return !!(rig.damage&&rig.damage(point,amount,combat));}
        function components(){return rigs.flatMap(function(r){return r.components?r.components():[];});}
        function telemetry(){var reports=rigs.map(function(r){return r.telemetry();});return {seconds:seconds,contacts:reports.reduce(function(n,r){return n+r.contacts;},0),launches:reports.reduce(function(n,r){return n+r.launches;},0),shots:reports.reduce(function(n,r){return n+r.shots;},0),hits:reports.reduce(function(n,r){return n+r.hits;},0),mounts:reports.flatMap(function(r){return r.mounts;}),capitals:states.map(function(s,i){return {team:s.team,position:s.position.slice(),heading:s.heading,integrity:s.integrity,mainBatteryClear:s.mainBatteryClear,shots:reports[i].shots,hits:reports[i].hits};})};}
        function readout(){return 'AEGIS CAPITAL ENGAGEMENT / 1,305 m each\n'+(options&&options.bridge?(states[0].mainBatteryClear?'OPPOSING SIDES / MAIN BATTERIES CLEAR':'SAME SIDE / MAIN BATTERIES MASKED')+'\n':'')+states.map(function(s,i){var t=rigs[i].telemetry();return (i===0?'GREEN':'RED')+' '+(s.integrity>0?Math.ceil(s.integrity/200)+'% integrity':'disabled')+' · '+t.shots+' rounds / '+t.hits+' hits';}).join('\n')+'\nDisabled: '+components().filter(function(p){return p.hp<=0;}).length+' / '+components().length+' systems\nHangar: '+rigs[0].telemetry().launches+' fighters launched';}
        reset();return {setSurfaceDetail:function(enabled){rigs.forEach(function(r){if(r.setSurfaceDetail)r.setSurfaceDetail(enabled);});},reset:reset,step:step,geometry:function(){rigs.forEach(function(r){r.geometry();});return renderBatches;},effects:function(pose,shields){return rigs.flatMap(function(r){return r.effects(pose,shields);});},readout:readout,hit:hit,damage:damage,components:components,telemetry:telemetry};
    }
    /** Unarmed centerline traffic using the same antipodal chart transport as fighters.
     * Positions are scene units; route distances and speed are metres and m/s.
     * @returns {import('./types').AegisFlightRig} */
    function createEllisPatrol(){
        var state={team:/** @type {'ally'} */('ally'),position:[0,-8000/U,1550/U],heading:0,velocity:[0,180,0],integrity:20000};
        var rig=create({state:state,opponent:state,unarmed:true}),region=0,seconds=0,direction=1,turn=0,inbound=true;
        var batches=rig.geometry(),radius=0;
        batches.forEach(function(b){for(var i=0;i<b.vertices.length;i+=b.stride||6)radius=Math.max(radius,Math.hypot(b.vertices[i],b.vertices[i+1],b.vertices[i+2]));});
        // Share one complete optical image across every hull material.
        batches.forEach(function(b){b.lensCenter=state.position;b.lensRadius=radius*U;});
        function reset(){region=0;seconds=0;direction=1;turn=0;inbound=true;state.position.splice(0,3,0,-8000/U,1550/U);state.heading=-Math.PI/2;rig.reset();}
        /** @param {number} elapsed */function step(elapsed){
            if(!Number.isFinite(elapsed)||elapsed<=0)return;
            var dt=Math.min(.1,elapsed);seconds+=dt;
            if(turn>0){var used=Math.min(turn,dt);turn-=used;state.heading+=Math.PI*used/12;if(turn<=1e-9){turn=0;direction=-direction;inbound=true;state.heading=direction>0?-Math.PI/2:Math.PI/2;}return;}
            state.position[1]+=direction*180*dt/U;
            var y=state.position[1]*U+2000;
            if(inbound&&y*direction>=-300){
                inbound=false;region=1-region;state.position[0]=region*12000/U;state.position[1]+=direction*600/U;
            }
            if(!inbound&&Math.abs(state.position[1]*U+2000)>=4000)turn=12;
        }
        function geometry(){
            rig.geometry();
            // Transport the hull frame with the same antipodal half-turn as fighters.
            var basis=batches[0].basis;
            if(region===1&&basis)for(var i=0;i<9;i++)if(i%3!==1)basis[i]=-basis[i];
            batches.forEach(function(b){b.region=region;});return batches;
        }
        function telemetry(){var report=rig.telemetry();report.seconds=seconds;report.capitals=[{team:state.team,position:state.position.slice(),heading:state.heading,integrity:state.integrity,shots:0,hits:0}];return report;}
        reset();return {setSurfaceDetail:rig.setSurfaceDetail,reset:reset,step:step,geometry:geometry,effects:function(){return [];},hit:function(){return null;},readout:function(){return 'AEGIS / ELLIS CENTERLINE PATROL';},telemetry:telemetry};
    }
    function load(){
        if(!smokeTexture&&typeof Image!=='undefined'){smokeTexture=new Image();smokeTexture.src=assetUrl('../assets/ships/aegis-kit/scorched.svg');}
        /** @param {string} file @param {()=>boolean} ready */function script(file,ready){return new Promise(function(resolve,reject){if(ready()){resolve(undefined);return;}var element=document.createElement('script');element.src=assetUrl('../assets/ships/aegis-kit/'+file);element.onload=function(){if(ready())resolve(undefined);else reject(new Error('Capital asset did not register: '+file));};element.onerror=function(){reject(new Error('Could not load local capital asset: '+file));};document.head.appendChild(element);});}
        return Promise.all([script('flight-rig.js',function(){return !!DW.aegisFlightAsset;}),script('shield-envelope.js',function(){return !!DW.aegisShieldEnvelope;})]).then(function(){
            if(!DW.aegisFlightAsset.surface||typeof Image==='undefined')return;
            var atlas=DW.aegisFlightAsset.surface.atlas;
            if(!surfaceLoad)surfaceLoad=new Promise(function(resolve,reject){var image=new Image();image.onload=function(){surfaceTexture=image;resolve();};image.onerror=function(){surfaceLoad=null;reject(new Error('Could not load capital surface atlas'));};image.src=assetUrl('../assets/ships/aegis-kit/'+atlas);});
            return surfaceLoad;
        });
    }
    DW.aegisFlight={create:create,createBattle:createBattle,createEllisPatrol:createEllisPatrol,load:load};
}());
