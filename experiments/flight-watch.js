(function () {
    'use strict';
    var DW = /** @type {Required<import('../src/types').DriftworksNamespace>} */ (window.Driftworks);
    /** Adapts the exact benchmark duel to the lab's presentation; no alternate physics.
     * @param {Pick<ReturnType<import('./types').ExperimentModules['flightSession']['create']>, 'snapshot' | 'advanceScenery'>} scenery @param {import('./types').DuelOptions} options */
    function create(scenery, options) {
        var duel = DW.flightDuel.create(options), units = DW.sim.METERS_PER_UNIT;
        /** @param {number} elapsed @param {number} speed */
        function advance(elapsed, speed) {
            if ([.25, .5, 1].indexOf(speed) < 0) throw new Error('Invalid watch speed');
            var before = duel.summary().seconds, summary = duel.advance(elapsed * speed);
            scenery.advanceScenery(summary.seconds - before);
            return summary;
        }
        /** @param {boolean} chase @returns {import('./types').Snapshot} */
        function snapshot(chase) {
            var view = Object.assign({}, scenery.snapshot(), { state:duel.player, guns:duel.guns, combat:duel.combat, contact:false });
            if (chase) {
                var own = duel.player;
                view.camera = {eye:own.eye.map(function (v, i) { return v + (own.back[i] * 75 + own.up[i] * 18) / units; }),
                    right:own.right.slice(), up:own.up.slice(), back:own.back.slice()};
                view.observerCraft = Object.assign({},duel.combat.player,{pose:own});
            }
            return view;
        }
        return {advance:advance,snapshot:snapshot,summary:duel.summary,replay:duel.replay};
    }
    /** Presentation-only director. Simulation retains its own stationary observer.
     * @param {import('./types').AegisFlightRig} rig */
    function cinema(rig){
        var seconds=0,index=0,cutAt=0,subject='';
        /** @type {{eye:number[];velocity:number[];back:number[];at:number;region:number;subject:string}|null} */var pursuit=null;
        var names=['Bridge establishing','Green gun deck','Jade / red carrier','Fighter pursuit','Across the throat','Red gun deck','Wormhole orbit'];
        function next(){index=(index+1)%names.length;cutAt=seconds;subject='';pursuit=null;}
        function reset(){seconds=0;index=0;cutAt=0;subject='';pursuit=null;}
        /** @param {number} elapsed */function advance(elapsed){seconds+=elapsed;if(seconds-cutAt>=(index===6?24:10))next();}
        /** @param {import('./types').Snapshot} view @returns {import('./types').Pose} */
        function camera(view){
            var U=DW.sim.METERS_PER_UNIT,t=seconds-cutAt,red=index===2||index===5,region=red?1:0;
            var capitals=rig.telemetry().capitals||[],capital=capitals[red?1:0];
            var target=capital?capital.position.slice():[region*12000/U,-3600/U,1550/U];
            var offset=index===0?[1100,-1400,850]:index===4?[650,850,400]:index===1||index===5?[900,-850,-230]:[1250,-900,550];
            offset[0]+=Math.sin(t*.06)*140;offset[1]+=t*8;
            var eye=target.map(function(v,i){return v+offset[i]/U;});
            if(index===3){
                var living=view.combat.enemies.filter(function(c){return c.hp>0&&!c.hangarLaunch;});
                var fighter=living.find(function(c){return c.id===subject;})||living[0];
                if(pursuit&&!fighter){next();return camera(view);}
                if(fighter){
                    subject=fighter.id;region=fighter.pose.region||0;
                    // A chart change or a destroyed subject gets an editorial cut;
                    // never drag the camera across the 12 km chart separation.
                    if(pursuit&&(pursuit.subject!==subject||pursuit.region!==region)){next();return camera(view);}
                    target=fighter.pose.eye.map(function(v,i){return v+fighter.pose.velocity[i]*.35/U;});
                    var desired=fighter.pose.eye.map(function(v,i){return v+fighter.pose.back[i]*140/U+(i===2?40/U:0);});
                    if(!pursuit){var initial=desired.map(function(v,i){return v-target[i];}),size=Math.hypot.apply(null,initial);pursuit={eye:desired.slice(),velocity:fighter.pose.velocity.slice(),back:initial.map(function(v){return v/size;}),at:seconds,region:region,subject:subject};}
                    const follow=pursuit,dt=Math.max(0,Math.min(.1,seconds-follow.at));follow.at=seconds;
                    // Independent inertial camera: critically damped pursuit with
                    // a physical acceleration limit, unaffected by fighter roll.
                    var steps=Math.max(1,Math.ceil(dt/.01)),h=dt/steps;
                    for(var step=0;step<steps;step++){
                        var acceleration=follow.eye.map(function(v,i){return (desired[i]-v)*U*1.4*1.4+2*1.4*(fighter.pose.velocity[i]-follow.velocity[i]);});
                        var magnitude=Math.hypot.apply(null,acceleration),limit=Math.min(1,22/Math.max(1e-8,magnitude));
                        follow.velocity=follow.velocity.map(function(v,i){return v+acceleration[i]*limit*h;});
                        var speed=Math.hypot.apply(null,follow.velocity);if(speed>240)follow.velocity=follow.velocity.map(function(v){return v*240/speed;});
                        follow.eye=follow.eye.map(function(v,i){return v+follow.velocity[i]*h/U;});
                    }
                    eye=follow.eye.slice();
                    var desiredBack=eye.map(function(v,i){return v-target[i];}),distance=Math.hypot.apply(null,desiredBack);desiredBack=desiredBack.map(function(v){return v/Math.max(1e-8,distance);});
                    var angle=Math.acos(Math.max(-1,Math.min(1,follow.back.reduce(function(sum,v,i){return sum+v*desiredBack[i];},0))));
                    var blend=Math.min(1-Math.exp(-dt/.9),(.35*dt)/Math.max(1e-8,angle));
                    var direction=follow.back.map(function(v,i){return v+(desiredBack[i]-v)*blend;}),norm=Math.hypot.apply(null,direction);follow.back=direction.map(function(v){return v/norm;});
                    target=eye.map(function(v,i){return v-follow.back[i];});
                }
            }
            if(index===4)target=[0,-2000/U,1550/U];
            if(index===6){
                // Translate around the actual mouth, rather than turning a sky
                // card: both finite-source ships and lensing vary with parallax.
                var phase=-Math.PI/2+t*Math.PI*2/24;target=[0,-2000/U,1550/U];
                eye=target.map(function(v,i){return v+(i===0?Math.cos(phase)*1050:i===1?Math.sin(phase)*1050:220+Math.sin(phase)*140)/U;});region=0;
            }
            var back=eye.map(function(v,i){return v-target[i];}),length=Math.hypot.apply(null,back);back=back.map(function(v){return v/length;});
            var right=[-back[1],back[0],0],span=Math.hypot.apply(null,right);right=span>1e-6?right.map(function(v){return v/span;}):[1,0,0];
            var up=[back[1]*right[2]-back[2]*right[1],back[2]*right[0]-back[0]*right[2],back[0]*right[1]-back[1]*right[0]];
            return {eye:eye,right:right,up:up,back:back,region:region};
        }
        return {reset:reset,advance:advance,next:next,camera:camera,label:function(){return names[index];}};
    }
    DW.flightWatch = {create:create,cinema:cinema};
}());
