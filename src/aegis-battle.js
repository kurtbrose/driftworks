(function(){
    'use strict';
    /** @typedef {import('../experiments/types').Vector} Vector */
    /** @typedef {import('../experiments/types').Batch} Batch */
    /** @typedef {import('../experiments/types').FlightView} FlightView */
    var DW=/** @type {Required<import('../src/types').DriftworksNamespace>} */(window.Driftworks);
    var U=DW.sim.METERS_PER_UNIT;
    /** @param {Vector} a @param {Vector} b */
    function sub(a,b){return a.map(function(v,i){return v-b[i];});}
    /** Two runtime rigs share meshes; their mutable transforms and weapons remain independent.
     * @param {{battlefield?:boolean;bridge?:boolean}} [options] @returns {import('../experiments/types').AegisFlightRig} */
    function createBattle(options){
        /** @type {import('../experiments/types').AegisCapitalState[]} */var states=[{team:'ally',position:[0,0,1200],heading:0,velocity:[0,0,0],integrity:20000},{team:'enemy',position:[120/U,1500/U,1200+180/U],heading:Math.PI,velocity:[0,0,0],integrity:20000}];
        if(options&&options.bridge){states[0].position=[0,-2675/U,1550/U];states[1].position=[12000/U,-1325/U,1550/U];states.forEach(function(s,i){s.region=i;s.heading=i*Math.PI;s.mainBatteryClear=true;});}
        var motion=[0,0];
        var starts=states.map(function(s){return {position:s.position.slice(),heading:s.heading};}),seconds=0;
        var configs=states.map(function(state,i){return {state:state,bridge:!!(options&&options.bridge),opponent:states[1-i],opponentRig:/** @type {import('../experiments/types').AegisFlightRig|undefined} */(undefined)};});
        var rigs=configs.map(function(config){return DW.aegisFlight.create(config);});configs.forEach(function(config,i){config.opponentRig=rigs[1-i];});
        var renderBatches=rigs.flatMap(function(rig){return rig.geometry();});
        /** @param {import('../experiments/types').Combat} [combat] */function reset(combat){
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
        /** @param {Vector} a @param {Vector} b @param {import('../experiments/types').Bolt} [bolt] */function hit(a,b,bolt){var best=/** @type {Vector|null} */(null),distance=Infinity;rigs.forEach(function(rig){var point=rig.hit(a,b,bolt);if(point){var d=Math.hypot.apply(null,sub(point,a));if(d<distance){distance=d;best=point;}}});return best;}
        /** @param {Vector} point @param {number} amount @param {import('../experiments/types').Combat} combat */
        function damage(point,amount,combat){var nearest=0,best=Infinity;states.forEach(function(s,i){var d=Math.hypot(...sub(point,s.position));if(d<best){best=d;nearest=i;}});var rig=rigs[nearest];return !!(rig.damage&&rig.damage(point,amount,combat));}
        function components(){return rigs.flatMap(function(r){return r.components?r.components():[];});}
        function telemetry(){var reports=rigs.map(function(r){return r.telemetry();});return {seconds:seconds,contacts:reports.reduce(function(n,r){return n+r.contacts;},0),launches:reports.reduce(function(n,r){return n+r.launches;},0),shots:reports.reduce(function(n,r){return n+r.shots;},0),hits:reports.reduce(function(n,r){return n+r.hits;},0),mounts:reports.flatMap(function(r){return r.mounts;}),capitals:states.map(function(s,i){return {team:s.team,position:s.position.slice(),heading:s.heading,integrity:s.integrity,mainBatteryClear:s.mainBatteryClear,shots:reports[i].shots,hits:reports[i].hits};})};}
        function readout(){return 'AEGIS CAPITAL ENGAGEMENT / 1,305 m each\n'+(options&&options.bridge?(states[0].mainBatteryClear?'OPPOSING SIDES / MAIN BATTERIES CLEAR':'SAME SIDE / MAIN BATTERIES MASKED')+'\n':'')+states.map(function(s,i){var t=rigs[i].telemetry();return (i===0?'GREEN':'RED')+' '+(s.integrity>0?Math.ceil(s.integrity/200)+'% integrity':'disabled')+' · '+t.shots+' rounds / '+t.hits+' hits';}).join('\n')+'\nDisabled: '+components().filter(function(p){return p.hp<=0;}).length+' / '+components().length+' systems\nHangar: '+rigs[0].telemetry().launches+' fighters launched';}
        reset();return {setSurfaceDetail:function(enabled,scope){rigs.forEach(function(r){if(r.setSurfaceDetail)r.setSurfaceDetail(enabled,scope);});},reset:reset,step:step,geometry:function(){rigs.forEach(function(r){r.geometry();});return renderBatches;},effects:function(pose,shields){return rigs.flatMap(function(r){return r.effects(pose,shields);});},readout:readout,hit:hit,damage:damage,components:components,telemetry:telemetry};
    }
    /** Unarmed centerline traffic using the same antipodal chart transport as fighters.
     * Positions are scene units; route distances and speed are metres and m/s.
     * @returns {import('../experiments/types').AegisFlightRig} */
    function createEllisPatrol(){
        var state={team:/** @type {'ally'} */('ally'),position:[0,-8000/U,1550/U],heading:0,velocity:[0,180,0],integrity:20000};
        var rig=DW.aegisFlight.create({state:state,opponent:state,unarmed:true}),region=0,seconds=0,direction=1,turn=0,inbound=true;
        var batches=rig.geometry(),radius=0,crossRadius=0;
        var transit={proper:Math.sqrt(6000*6000-300*300),normal:[0,-1,0]};
        batches.forEach(function(b){for(var i=0;i<b.vertices.length;i+=b.stride||6)radius=Math.max(radius,Math.hypot(b.vertices[i],b.vertices[i+1],b.vertices[i+2]));});
        // Patrol bow is local X, aligned with the radial route. Length may exceed
        // the diameter: only the Y/Z cross-section must fit the aperture.
        batches.forEach(function(b){for(var i=0;i<b.vertices.length;i+=b.stride||6)crossRadius=Math.max(crossRadius,Math.hypot(b.vertices[i+1],b.vertices[i+2]));});
        // Share one intrinsic hull placement across every material.
        batches.forEach(function(b){b.lensCenter=state.position;b.lensRadius=radius*U;b.lensTransit=transit;});
        function reset(){transit.proper=Math.sqrt(6000*6000-300*300);region=0;seconds=0;direction=1;turn=0;inbound=true;state.position.splice(0,3,0,-8000/U,1550/U);state.heading=-Math.PI/2;rig.reset();}
        /** @param {number} elapsed */function step(elapsed){
            if(!Number.isFinite(elapsed)||elapsed<=0)return;
            var dt=Math.min(.1,elapsed);seconds+=dt;
            if(turn>0){var used=Math.min(turn,dt);turn-=used;state.heading+=Math.PI*used/12;if(turn<=1e-9){turn=0;direction=-direction;inbound=true;state.heading=direction>0?-Math.PI/2:Math.PI/2;}return;}
            var previous=state.position.slice();
            var nextProper=transit.proper-direction*180*dt,nextRegion=nextProper<0?1:0;
            var nextPosition=[nextRegion*12000/U,(-2000-(nextRegion?-1:1)*Math.hypot(300,nextProper))/U,1550/U];
            // Clearance stays in the departure chart; do not sweep the storage gap.
            state.position[1]=nextRegion===region?nextPosition[1]:(-2000-(region?-1:1)*300)/U;
            var contact=DW.flightGuns.throatContact(previous,state.position,[0,direction*180,0],region,radius,crossRadius);
            if(contact){state.position.splice(0,3,...contact.eye);state.velocity=contact.velocity;return;}
            transit.proper=nextProper;
            if(region!==nextRegion)inbound=false;
            region=nextRegion;state.position.splice(0,3,...nextPosition);
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
    DW.aegisBattle={createBattle:createBattle,createEllisPatrol:createEllisPatrol};
}());
