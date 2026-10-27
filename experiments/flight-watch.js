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
        var names=['Bridge establishing','Green gun deck','Rime / red carrier','Fighter pursuit','Across the throat','Red gun deck'];
        function next(){index=(index+1)%names.length;cutAt=seconds;subject='';}
        function reset(){seconds=0;index=0;cutAt=0;subject='';}
        /** @param {number} elapsed */function advance(elapsed){seconds+=elapsed;if(seconds-cutAt>=10)next();}
        /** @param {import('./types').Snapshot} view @returns {import('./types').Pose} */
        function camera(view){
            var U=DW.sim.METERS_PER_UNIT,t=seconds-cutAt,red=index===2||index===5,region=red?1:0;
            var capitals=rig.telemetry().capitals||[],capital=capitals[red?1:0];
            var target=capital?capital.position.slice():[region*12000/U,-3600/U,1550/U];
            var offset=index===0?[1100,-1400,850]:index===4?[650,850,400]:[700,-450,260];
            offset[0]+=Math.sin(t*.06)*140;offset[1]+=t*8;
            var eye=target.map(function(v,i){return v+offset[i]/U;});
            if(index===3){
                var living=view.combat.enemies.filter(function(c){return c.hp>0&&!c.hangarLaunch;});
                var fighter=living.find(function(c){return c.id===subject;})||living[0];
                if(fighter){subject=fighter.id;region=fighter.pose.region||0;target=fighter.pose.eye.map(function(v,i){return v-fighter.pose.back[i]*100/U;});eye=fighter.pose.eye.map(function(v,i){return v+(fighter.pose.back[i]*110+fighter.pose.up[i]*30)/U;});}
            }
            if(index===4)target=[0,-2000/U,1550/U];
            var back=eye.map(function(v,i){return v-target[i];}),length=Math.hypot.apply(null,back);back=back.map(function(v){return v/length;});
            var right=[-back[1],back[0],0],span=Math.hypot.apply(null,right);right=span>1e-6?right.map(function(v){return v/span;}):[1,0,0];
            var up=[back[1]*right[2]-back[2]*right[1],back[2]*right[0]-back[0]*right[2],back[0]*right[1]-back[1]*right[0]];
            return {eye:eye,right:right,up:up,back:back,region:region};
        }
        return {reset:reset,advance:advance,next:next,camera:camera,label:function(){return names[index];}};
    }
    DW.flightWatch = {create:create,cinema:cinema};
}());
