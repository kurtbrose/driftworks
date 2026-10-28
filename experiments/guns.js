(function () {
    'use strict';
    /** @typedef {import('../src/types').DriftworksNamespace} DriftworksNamespace */
    /** @typedef {import('./types').Guns} Guns */
    /** @typedef {import('./types').Pose} Pose */
    /** @typedef {import('./types').Weapon} Weapon */
    /** @typedef {import('./types').Vector} Vector */
    /** @typedef {import('./types').Bolt} Bolt */
    /** @typedef {import('./types').Batch} Batch */
    var DW=/** @type {Required<DriftworksNamespace>} */(window.Driftworks);
    var units = /** @type {Required<DriftworksNamespace>} */ (window.Driftworks).sim.METERS_PER_UNIT;
    /** @param {Vector} vector @param {Vector} normal */
    function bridgeVector(vector,normal){var radial=vector.reduce(function(sum,v,i){return sum+v*normal[i];},0);return vector.map(function(v,i){return 2*radial*normal[i]-v;});}
    /** Swept physical crossing, shared by motion, projectile collision and lead prediction.
     * @param {Vector} before @param {Vector} after @param {number} side */
    function crossBridge(before,after,side){
        var center=[side*12000/units,-2000/units,1550/units],radius=300/units;
        var offset=before.map(function(v,i){return v-center[i];}),move=after.map(function(v,i){return v-before[i];});
        var a=move.reduce(function(sum,v){return sum+v*v;},0),b=offset.reduce(function(sum,v,i){return sum+v*move[i];},0),c=offset.reduce(function(sum,v){return sum+v*v;},0)-radius*radius,disc=b*b-a*c;
        if(a<1e-20||disc<0||b>=0)return null;
        var t=(-b-Math.sqrt(disc))/a;if(t<0||t>1)return null;
        var entry=offset.map(function(v,i){return v+move[i]*t;}),normal=entry.map(function(v){return v/radius;}),remaining=bridgeVector(move.map(function(v){return v*(1-t);}),normal);
        var exit=center.map(function(v,i){return v+(i===0?(side?-12000:12000)/units:0)-entry[i];});
        return {normal:normal,fraction:t,entry:entry.map(function(v,i){return v+center[i];}),exit:exit,eye:exit.map(function(v,i){return v+remaining[i];})};
    }
    /** @param {Vector} start @param {Vector} move @param {number} region */
    function bridgeTravel(start,move,region){
        var end=start.map(function(v,i){return v+move[i];}),crossing=crossBridge(start,end,region);
        if(!crossing)return {point:end,region:region,normal:null,segments:[{start:start,end:end,region:region}]};
        return {point:crossing.eye,region:1-region,normal:crossing.normal,segments:[{start:start,end:crossing.entry,region:region},{start:crossing.exit,end:crossing.eye,region:1-region}]};
    }
    /** Finite-source firing route in the same compact optical metric as the image.
     * Coordinates/distances are scene units, not metres.
     * @param {Vector} origin @param {Vector} target @param {number} region @param {number} destination @param {boolean|number} [bridge] */
    function ballisticPath(origin,target,region,destination,bridge){
        if(typeof bridge==='number')return DW.flightHyperbolic.path(origin,target,bridge);
        var delta=target.map(function(v,i){return v-origin[i];}),distance=Math.hypot.apply(null,delta);
        if(!bridge)return region===destination&&distance>1e-10?{direction:delta.map(function(v){return v/distance;}),distance:distance}:null;
        var path=(/** @type {Required<DriftworksNamespace>} */ (window.Driftworks)).ellisOptics.primary(origin.map(function(v){return v*units;}),target.map(function(v){return v*units;}),region,destination);
        return path?{direction:path.direction,distance:path.length/units}:null;
    }
    /** An actionable aim direction, never an optically warped future point.
     * Predict target motion with craft transport and solve its optical firing path.
     * A later jink is not knowable; unverified/out-of-lifetime solutions return null.
     * @param {Pose} shooter @param {Pose & {velocity:Vector}} target @param {Weapon} weapon @param {boolean|number} [bridge] @param {number} [launchMeters]
     * @returns {import('./types').FiringSolution|null} */
    function lead(shooter,target,weapon,bridge,launchMeters){
        if(typeof bridge==='number')return DW.flightHyperbolic.lead(shooter,target,weapon,bridge,launchMeters===undefined?4:launchMeters);
        var speed=weapon.speed/units,launch=Math.max(0,launchMeters===undefined?4:launchMeters)/units,life=weapon.lifetime;
        if(!(speed>0&&life>0))return null;
        /** @param {number} time */function sample(time){
            var move=target.velocity.map(function(v){return v*time/units;}),future=bridge?bridgeTravel(target.eye,move,target.region||0):{point:target.eye.map(function(v,i){return v+move[i];}),region:target.region||0};
            var path=ballisticPath(shooter.eye,future.point,shooter.region||0,future.region,bridge);if(!path)return null;
            return {direction:path.direction,distance:path.distance,time:time,point:future.point,region:future.region,error:path.distance-Math.min(launch,path.distance*.5)-speed*time};
        }
        // Most combat targets move much slower than a bolt. Fixed-point flight
        // time converges quickly there, without a lifetime-wide route scan.
        // Every candidate must satisfy the optical travel-time residual;
        // fast targets or unreachable intermediate routes retain the full search.
        /** @param {ReturnType<typeof sample>} result */
        function verified(result){
            if(!result||Math.abs(result.error)*units>=.001)return null;
            return {direction:result.direction,distance:result.distance,time:result.time,point:result.point,region:result.region};
        }
        if(Math.hypot.apply(null,target.velocity)/units<speed*.45){
            var guess=sample(0);
            for(var iteration=0;guess&&iteration<12;iteration++){
                var answer=verified(guess);if(answer)return answer;
                var nextTime=guess.time+guess.error/speed;
                if(nextTime<0||nextTime>life)break;
                guess=sample(nextTime);
            }
        }
        var times=Array.from({length:65},/** @param {unknown} _ @param {number} i */function(_,i){return life*i/64;});
        if(bridge){var crossing=crossBridge(target.eye,target.eye.map(function(v,i){return v+target.velocity[i]*life/units;}),target.region||0);if(crossing){var event=crossing.fraction*life;times.push(Math.max(0,event-1e-7),event,Math.min(life,event+1e-7));times.sort(function(a,b){return a-b;});}}
        var previous=sample(0);
        for(var i=1;i<times.length;i++){
            var current=sample(times[i]);
            if(previous&&current&&previous.error>=0&&current.error<=0){
                var lo=previous.time,hi=current.time,valid=true;
                for(var j=0;j<32;j++){var middle=sample((lo+hi)*.5);if(!middle){valid=false;break;}if(middle.error>0)lo=middle.time;else hi=middle.time;}
                const result=valid?sample((lo+hi)*.5):null;
                var answer=verified(result);if(answer)return answer;
            }
            previous=current;
        }
        return null;
    }
    // Shared crosshair aim point, measured forward from the eye in metres.
    var convergenceM = 300;
    /** @returns {Guns} */
    function create() {
        return { bolts: [], impacts: [], cooldown: 0, fired: 0, hits: 0 };
    }
    /** @param {Guns} guns @param {Pose} pose @param {Weapon} weapon @param {boolean} trigger @param {number} dt @param {((start: Vector, end: Vector, bolt: Bolt) => Vector | null)} [hitTest] @param {(() => Vector | null)} [aimPoint] @param {number} [mountCount] @param {Vector[]} [anchors] @param {boolean|number} [bridge] */
    function step(guns, pose, weapon, trigger, dt, hitTest, aimPoint, mountCount, anchors, bridge) {
        var count = mountCount === undefined ? 2 : mountCount;
        if (!Number.isInteger(count) || count < 1 || count > 128) throw new Error('Invalid gun mount count');
        var muzzles = anchors || Array.from({length:count}, function (/** @type {unknown} */ _, mount) {
            return [count === 1 ? 0 : (-1 + 2 * mount / (count - 1)) * 3, 4, -1.3];
        });
        if (!muzzles.length) throw new Error('Gun anchors must not be empty');
        // Preserve bolts/second and per-bolt damage while changing volley size.
        var interval = weapon.fireWait * muzzles.length / count;
        var ready = guns.cooldown <= 1e-9;
        guns.cooldown -= dt;
        guns.impacts = guns.impacts.filter(function (hit) {
            hit.age += dt;
            return hit.age < .22;
        });
        // Advance existing shots before emitting this substep's volley.
        guns.bolts = guns.bolts.filter(function (bolt) {
            var travel = Math.min(dt, bolt.weapon.lifetime - bolt.age);
            var end = bolt.position.map(function (x, i) {
                return x + bolt.direction[i] * bolt.weapon.speed * travel / units;
            });
            var hit=/** @type {Vector|null} */(null);
            if(typeof bridge==='number'){
                var route=DW.flightHyperbolic.travel(bolt.position,bolt.direction,bolt.weapon.speed*travel/units,bridge);
                end=route.point;hit=hitTest?hitTest(bolt.position,end,bolt):null;bolt.direction=route.direction;
            }else if(bridge){
                var optics=(/** @type {Required<DriftworksNamespace>} */ (window.Driftworks)).ellisOptics;
                var ray=bolt.opticalRay||(bolt.opticalRay=optics.ray(bolt.position.map(function(v){return v*units;}),bolt.direction,bolt.region||0));
                var segments=optics.advanceRay(ray,bolt.weapon.speed*travel);
                for(var leg=0;leg<segments.length;leg++){
                    var segment=segments[leg];bolt.region=segment.region;bolt.direction=segment.direction;
                    hit=hitTest?hitTest(segment.start.map(function(v){return v/units;}),segment.end.map(function(v){return v/units;}),bolt):null;if(hit)break;
                }
                end=ray.eye.map(function(v){return v/units;});
            }else hit=hitTest?hitTest(bolt.position,end,bolt):null;
            bolt.age += dt;
            if (hit) {
                guns.impacts.push({ region:bolt.region||0, position: hit, age: 0 });
                guns.hits++;
                return false;
            }
            bolt.position = end;
            return bolt.age < bolt.weapon.lifetime;
        });
        if (!trigger) {
            guns.cooldown = Math.max(0, guns.cooldown);
            return;
        }
        if (ready) {
            var target = aimPoint && aimPoint();
            // Keep the launch plane behind a close crosshair surface, never fire backward.
            var forward = target ? Math.max(0, target.reduce(function (sum, x, i) {
                return sum - (x - pose.eye[i]) * pose.back[i] * units;
            }, 0) * .5) : 4;
            for (var mount = 0; mount < muzzles.length; mount++) {
                var muzzle = muzzles[mount];
                var launchForward = target ? Math.min(muzzle[1], forward) : muzzle[1];
                var position = pose.eye.map(function (x, i) {
                    return x + (pose.right[i] * muzzle[0] + pose.up[i] * muzzle[2] - pose.back[i] * launchForward) / units;
                });
                var aim = pose.back.map(function (x, i) {
                    return target ? (target[i] - position[i]) * units :
                        -x * (convergenceM - launchForward) - pose.right[i] * muzzle[0] - pose.up[i] * muzzle[2];
                });
                var launchRegion=pose.region||0;
                if(typeof bridge==='number'){
                    var space=DW.flightHyperbolic;
                    position=space.offset(pose.eye,pose.right.map(function(v,i){return (v*muzzle[0]+pose.up[i]*muzzle[2]-pose.back[i]*launchForward)/units;}),bridge);
                    var curvedGoal=target||space.offset(pose.eye,pose.back.map(function(v){return -v*convergenceM/units;}),bridge);
                    aim=space.path(position,curvedGoal,bridge).direction;
                }else if(bridge){
                    var range=target?Math.max(.001,target.reduce(function(sum,v,i){return sum-(v-pose.eye[i])*pose.back[i];},0)):convergenceM/units;
                    var optics=(/** @type {Required<DriftworksNamespace>} */ (window.Driftworks)).ellisOptics;
                    var forwardRay=pose.back.map(function(v){return -v;}),goal=optics.ray(pose.eye.map(function(v){return v*units;}),forwardRay,pose.region||0);
                    optics.advanceRay(goal,range*units);
                    var launch=optics.ray(pose.eye.map(function(v){return v*units;}),forwardRay,pose.region||0);optics.advanceRay(launch,launchForward);
                    var normal=pose.eye.map(function(v,i){return v*units-[(pose.region||0)*12000,-2000,1550][i];}),n=Math.hypot.apply(null,normal);normal=normal.map(function(v){return v/n;});
                    var right=launch.region===(pose.region||0)?pose.right:bridgeVector(pose.right,normal),up=launch.region===(pose.region||0)?pose.up:bridgeVector(pose.up,normal);
                    position=launch.eye.map(function(v,i){return (v+right[i]*muzzle[0]+up[i]*muzzle[2])/units;});launchRegion=launch.region;
                    // Lateral anchors at the throat can extend into the other chart.
                    var offset=bridgeTravel(launch.eye.map(function(v){return v/units;}),position.map(function(v,i){return v-launch.eye[i]/units;}),launchRegion);position=offset.point;launchRegion=offset.region;
                    var path=ballisticPath(position,goal.eye.map(function(v){return v/units;}),launchRegion,goal.region,true);
                    aim=path?path.direction:launch.direction;
                }
                var distance = Math.hypot.apply(null, aim);
                guns.bolts.push({ curvature:typeof bridge==='number'?bridge:undefined,region:launchRegion, position: position, direction: aim.map(function (x) {
                        return x / distance;
                    }), weapon: weapon, age: 0 });
            }
            guns.fired += muzzles.length;
            guns.cooldown += interval;
        }
    }
    // Broad-phase sphere plus a swept, refined terrain query prevents tunneling.
    /** @param {Vector} start @param {Vector} end @param {number} radius @param {(point: Vector) => number} field */
    function intersect(start, end, radius, field) {
        var d = end.map(function (x, i) {
            return x - start[i];
        }), a = d.reduce(function (s, x) {
            return s + x * x;
        }, 0);
        if (!a)
            return null;
        var b = 2 * start.reduce(function (s, x, i) {
            return s + x * d[i];
        }, 0), c = start.reduce(function (s, x) {
            return s + x * x;
        }, 0) - radius * radius * 1.21, disc = b * b - 4 * a * c;
        if (disc < 0)
            return null;
        var lo = Math.max(0, (-b - Math.sqrt(disc)) / (2 * a)), hi = Math.min(1, (-b + Math.sqrt(disc)) / (2 * a));
        if (lo > hi)
            return null;
        var count = Math.max(1, Math.ceil(Math.sqrt(a) * (hi - lo) * units));
        /** @param {number} t */
        function point(t) {
            return start.map(function (x, i) {
                return x + d[i] * t;
            });
        }
        var previous = lo;
        for (var j = 0; j <= count; j++) {
            var t = lo + (hi - lo) * j / count, p = point(t);
            if (field(p.map(function (x) {
                return x / radius;
            })) <= 0) {
                var left = previous, right = t;
                for (var k = 0; k < 8; k++) {
                    var mid = (left + right) / 2;
                    if (field(point(mid).map(function (x) {
                        return x / radius;
                    })) <= 0)
                        right = mid;
                    else
                        left = mid;
                }
                return point(right);
            }
            previous = t;
        }
        return null;
    }
    /** @param {Pick<Guns, 'bolts' | 'impacts'>} guns @param {Pose} pose @param {boolean} [optical] @returns {Batch[]} */
    function geometry(guns, pose, optical) {
        var groups = /** @type {{team: string; color: [number,number,number]; data: number[]}[]} */ ([{ team: 'ally', color: [.15, 1, .35], data: [] }, { team: 'enemy', color: [1, .12, .08], data: [] }, { team: 'player', color: [1, .75, .25], data: [] }]);
        /** @param {Vector} a @param {Vector} b */
        function dot(a, b) {
            return a.reduce(function (sum, x, i) {
                return sum + x * b[i];
            }, 0);
        }
        var curvature=0;
        /** @param {number[]} data @param {Vector} center @param {Vector} along @param {Vector} side @param {number} halfLength @param {number} width @param {number} opacity */
        function quad(data, center, along, side, halfLength, width, opacity) {
            var uv = [[-1, -1], [-1, 1], [1, 1], [-1, -1], [1, 1], [1, -1]];
            uv.forEach(function (p) {
                var offset=along.map(function(v,i){return v*p[0]*halfLength+side[i]*p[1]*width;});
                var vertex=curvature?DW.flightHyperbolic.offset(center,offset,curvature):center.map(function(v,i){return v+offset[i];});
                data.push.apply(data,vertex.concat([p[0],p[1],opacity]));
            });
        }
        /** @param {Vector} position @param {number} region */function image(position,region){
            if(!optical)return {position:position,direction:null,source:null};
            const p=(/** @type {Required<DriftworksNamespace>} */ (window.Driftworks)).ellisOptics.primary(pose.eye.map(function(v){return v*units;}),position.map(function(v){return v*units;}),pose.region||0,region);
            return p?{position:pose.eye.map(function(v,i){return v+p.direction[i]*p.length/units;}),direction:p.direction,source:p.sourceDirection}:null;
        }
        guns.bolts.forEach(function (bolt) {
            curvature=bolt.curvature||0;
            var p=image(bolt.position,bolt.region||0);if(!p)return;
            if(optical&&p.direction&&p.source){
                // The same rigid source-to-observer tangent rotation used for hulls.
                var normal=bolt.position.map(function(v,i){return v*units-[(bolt.region||0)*12000,-2000,1550][i];}),n=Math.hypot.apply(null,normal);normal=normal.map(function(v){return v/n;});
                var from=(bolt.region||0)===(pose.region||0)?p.source:bridgeVector(p.source,normal),vector=(bolt.region||0)===(pose.region||0)?bolt.direction:bridgeVector(bolt.direction,normal),to=p.direction;
                var axis=[from[1]*to[2]-from[2]*to[1],from[2]*to[0]-from[0]*to[2],from[0]*to[1]-from[1]*to[0]],cos=dot(from,to),w=1+cos,q=Math.hypot(axis[0],axis[1],axis[2],w);
                if(q>1e-8){axis=axis.map(function(v){return v/q;});w/=q;var first=[axis[1]*vector[2]-axis[2]*vector[1],axis[2]*vector[0]-axis[0]*vector[2],axis[0]*vector[1]-axis[1]*vector[0]],second=[axis[1]*first[2]-axis[2]*first[1],axis[2]*first[0]-axis[0]*first[2],axis[0]*first[1]-axis[1]*first[0]];vector=vector.map(function(v,i){return v+2*(w*first[i]+second[i]);});}
                bolt=Object.assign({},bolt,{position:p.position,direction:vector});
            }

            var group = groups.find(function (g) {
                return g.team === (bolt.team || 'player');
            });
            if (!group)
                return;
            // Camera-distance taper keeps nearby fire from obscuring the target.
            // Only artwork shrinks: swept collision still uses the weapon's radius.
            var distanceM = Math.hypot.apply(null, bolt.position.map(function (x, i) {
                return x - pose.eye[i];
            })) * units;
            var visualScale = Math.min(1, distanceM / 30);
            var halfLength = bolt.weapon.length * .5 / units * visualScale;
            var center = bolt.position.map(function (x, i) {
                return x - bolt.direction[i] * halfLength;
            });
            var along = bolt.direction.map(function (x, i) {
                return x - pose.back[i] * dot(bolt.direction, pose.back);
            });
            var projected = Math.hypot.apply(null, along);
            along = projected > .0001 ? along.map(function (x) {
                return x / projected;
            }) : pose.up;
            var side = [pose.back[1] * along[2] - pose.back[2] * along[1], pose.back[2] * along[0] - pose.back[0] * along[2], pose.back[0] * along[1] - pose.back[1] * along[0]];
            var width = bolt.weapon.headRadius / units * visualScale;
            quad(group.data, center, along, side, Math.max(width, halfLength * projected + width), width, 1);
        });
        var batches = groups.map(function (g) {
            return { vertices: new Float32Array(g.data), color: g.color, projected:!!optical, region:pose.region||0 };
        });
        var impacts = /** @type {number[]} */ ([]);
        curvature=pose.curvature||0;
        guns.impacts.forEach(function (hit) {
            var p=image(hit.position,hit.region||0);if(!p)return;
            hit=Object.assign({},hit,{position:p.position});
            var r = (.5 + hit.age * 12) * (hit.scale || 1) / units;
            var center = hit.position.map(function (x, i) {
                return x + pose.back[i] * .08 / units;
            });
            quad(impacts, center, pose.up, pose.right, r, r, 1 - hit.age / .22);
        });
        batches.push({ vertices: new Float32Array(impacts), color: [1, .75, .3], projected:!!optical, region:pose.region||0 });
        return batches;
    }
    /** @type {Required<DriftworksNamespace>} */ (window.Driftworks).flightGuns = { bridgeVector:bridgeVector, crossBridge:crossBridge, bridgeTravel:bridgeTravel, ballisticPath:ballisticPath, lead:lead, create: create, step: step, intersect: intersect, geometry: geometry };
}());
