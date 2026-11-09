(function(){
    'use strict';
    var DW=/** @type {Required<import('../src/types').DriftworksNamespace>} */(window.Driftworks),U=DW.sim.METERS_PER_UNIT;
    /** @typedef {import('./types').Batch} Batch */
    /** @type {Record<string,Batch[]>} */var models={};
    /** @type {Record<string,number[][]>} */var mouths={};
    /** Authored factory origins, metre scale, normals and atlas UVs; shared GPU buffers.
     * @param {import('./types').ConvoyAsset} meta @param {ArrayBuffer} bytes @param {HTMLImageElement} [image] */
    function install(meta,bytes,image){
        DW.convoyMission.installCollision(meta,bytes);
        models={};cache=new WeakMap();
        Object.keys(meta.variants).forEach(function(name){
            var end=-7+meta.variants[name].manifest.reduce(function(n,p){return n+(p==='bulkFluid'?28:14);},0);
            mouths[name]=[[-3,-2.8],[-3,2.8],[3,-2.8],[3,2.8]].map(function(p){return [p[0],-end-11.4,p[1],1.85];});
            models[name]=meta.variants[name].batches.map(function(b){
                var vertices=new Float32Array(new Float32Array(bytes,b.offset,b.count));
                for(var i=0;i<vertices.length;i+=8)for(var k=0;k<3;k++)vertices[i+k]/=U;
                return {vertices:vertices,color:b.color,staticGeometry:true,stride:8,texture:b.textured?image:undefined,finish:b.emissiveIntensity>=1&&b.emissive.some(function(v){return v>0;})?7:0};
            });
        });
    }
    /** @type {WeakMap<import('./types').ConvoyState,{key:string;batches:Batch[]}>} */var cache=new WeakMap();
    /** @type {HTMLImageElement|undefined} */var texture;
    var ready=Promise.resolve(true);
    /** @type {WeakMap<import('./types').ConvoyState,import('./types').RenderPlacement>} */var cargoPlacements=new WeakMap();
    /** @param {import('./types').ConvoyState} state */function cargoPlacement(state){
        var p=cargoPlacements.get(state);if(!p){p={};cargoPlacements.set(state,p);}
        DW.wormholes.clear(p);
        var exit=state.evacuation&&state.elapsed>=state.evacuation.rescueAt?state.evacuation.exit:null;
        if(exit)DW.wormholes.mouth(p,exit.position,exit.normal,exit.radiusM/U,'back');
        return p;
    }
    if(['convoy','fleet-evacuation'].includes(DW.flightMissions.current().id)){
        texture=new Image();var image=texture,assetUrl=/** @type {(value:string)=>string} */(window.Driftworks.assetUrl);
        ready=Promise.all([
            fetch(assetUrl('../assets/ships/industrial-kit/convoy-flight.json')).then(function(r){if(!r.ok)throw Error(r.statusText);return /** @type {Promise<import('./types').ConvoyAsset>} */(r.json());}),
            fetch(assetUrl('../assets/ships/industrial-kit/convoy-flight.bin')).then(function(r){if(!r.ok)throw Error(r.statusText);return r.arrayBuffer();}),
            new Promise(/** @param {(value:boolean)=>void} resolve @param {(reason:Error)=>void} reject */function(resolve,reject){image.onload=function(){resolve(true);};image.onerror=function(){reject(Error('Industrial paint atlas unavailable'));};image.src=assetUrl('../assets/ships/industrial-kit/panels.png');})
        ]).then(function(values){install(/** @type {import('./types').ConvoyAsset} */(values[0]),values[1],image);return true;}).catch(/** @param {unknown} error */function(error){console.error('Convoy ships:',error);return false;});
    }
    /** Reuse the production idle Aegis rig, including its materials, scale and hull contacts.
     * @returns {import('./types').AegisFlightRig} */
    function createArrivalFleet(){
        if(DW.flightMissions.current().id==='fleet-evacuation')return createEvacuationFleet();
        var started=performance.now(),layout=DW.convoyMission.arrivalFleet();
        var ships=layout.map(function(ship){var state={team:/** @type {'ally'} */('ally'),position:ship.position.slice(),heading:ship.heading,velocity:[0,0,0],integrity:20000};return DW.aegisFlight.create({state:state,opponent:state,unarmed:true});});
        // These actors are stationary. Prepare once; each ship keeps its own GPU pose.
        var batches=ships.flatMap(function(ship){return ship.geometry();});
        DW.convoyScenery.arrivalPreparationMs=performance.now()-started;
        return {reset:function(combat){ships.forEach(function(ship){ship.reset(combat);});},
            step:function(dt,view){ships.forEach(function(ship){ship.step(dt,view);});},
            geometry:function(){return batches;},effects:function(pose,shields){return ships.flatMap(function(ship){return ship.effects(pose,shields);});},
            readout:function(){return 'RECEPTION FLEET / BASTION + VIGILANT';},
            hit:function(a,b,bolt){var hits=ships.map(function(ship){return ship.hit(a,b,bolt);}).filter(function(hit){return !!hit;});hits.sort(function(one,two){return Math.hypot.apply(null,one.map(function(v,k){return v-a[k];}))-Math.hypot.apply(null,two.map(function(v,k){return v-a[k];}));});return hits[0]||null;},
            damage:function(point,amount,combat){return ships.some(function(ship){return !!ship.damage&&ship.damage(point,amount,combat);});},
            telemetry:function(){var stats=ships.map(function(ship){return ship.telemetry();});return {seconds:stats[0].seconds,contacts:stats.reduce(function(n,s){return n+s.contacts;},0),launches:0,shots:0,hits:0,mounts:[]};}};
    }
    /** Armed capitals observe the mission's numeric plan; no second movement clock.
     * @returns {import('./types').AegisFlightRig} */
    function createEvacuationFleet(){
        var states=DW.convoyBattle.capitals(),configs=states.map(function(state,i){return {state:state,opponent:states[1-i],opponentRig:/** @type {import('./types').AegisFlightRig|undefined} */(undefined)};});
        var placements=states.map(function(){return /** @type {import('./types').RenderPlacement} */({visible:false});});
        var ships=configs.map(function(config,i){return DW.wormholes.bindRig(DW.aegisFlight.create(config),placements[i]);});configs.forEach(function(config,i){config.opponentRig=ships[1-i];});
        /** @type {import('./types').FleetEvacuation|undefined} */var plan;
        var groups=ships.map(function(ship){return ship.geometry();}),batches=groups.flat();
        function updatePlacements(){
            placements.forEach(function(p,i){p.visible=!!states[i].present;DW.wormholes.clear(p);});
            if(plan){
                DW.wormholes.mouth(placements[1],plan.entry,[0,1,0],650/U,'aperture');
                DW.wormholes.mouth(placements[0],plan.exit.position,plan.exit.normal,plan.exit.radiusM/U,'back');
            }
        }
        function geometry(){
            updatePlacements();
            ships.forEach(function(ship){ship.geometry();});
            var active=states.map(function(state,i){return state.present?groups[i]:[];}).flat();
            if(active.length!==batches.length||active.some(function(batch,i){return batch!==batches[i];}))batches=active;
            return batches;
        }
        return {reset:function(combat){
                plan=combat&&combat.convoy?combat.convoy.evacuation:undefined;
                var fresh=plan?plan.capitals:DW.convoyBattle.capitals();
                states.forEach(function(state,i){var source=fresh[i];state.position.splice(0,3,...source.position);state.heading=source.heading;state.velocity=source.velocity.slice();state.integrity=source.integrity;state.present=!!source.present;state.remote=!!source.remote;state.mainBatteryClear=source.mainBatteryClear;ships[i].reset();});
                if(plan){plan.capitals=states;if(combat&&combat.convoy)combat.convoy.arrivalFleet=states;}
            },step:function(dt,view){if(view.combat.convoy&&!view.combat.convoy.complete&&states[0].present)ships[0].step(dt,view);},
            geometry:geometry,
            effects:function(pose,shields){updatePlacements();return states[0].present?ships[0].effects(pose,shields):[];},
            readout:function(){return states.filter(function(s){return s.present;}).map(function(ship){return ship.callsign+' / '+Math.ceil(ship.integrity/200)+'%';}).join(' / ');},
            hit:function(a,b,bolt){return states[0].present?ships[0].hit(a,b,bolt):null;},
            damage:function(point,amount,combat){const ship=ships[0];return !!states[0].present&&!!ship.damage&&ship.damage(point,amount,combat);},
            components:function(){return states[0].present&&ships[0].components?ships[0].components():[];},
            telemetry:function(){var stats=ships.map(function(ship){return ship.telemetry();});return {seconds:stats[0].seconds,contacts:stats.reduce(function(n,s){return n+s.contacts;},0),launches:0,shots:stats.reduce(function(n,s){return n+s.shots;},0),hits:stats.reduce(function(n,s){return n+s.hits;},0),mounts:stats.flatMap(function(s){return s.mounts;}),capitals:states.map(function(ship,i){return {team:ship.team,position:ship.position.slice(),heading:ship.heading,integrity:ship.integrity,shots:stats[i].shots,hits:stats[i].hits};})};}};
    }
    DW.convoyScenery={createArrivalFleet:createArrivalFleet,arrivalPreparationMs:0,preview:function(name){return models[name]||[];},visible:true,ready:ready,texture:texture,install:install,effects:function(combat,view){
        if(!combat.convoy||!this.visible)return [];
        var state=combat.convoy,placement=cargoPlacement(state);
        var effects=state.ships.filter(function(s){return s.hull>0&&(!state.evacuation||!s.arrived);}).map(function(s,index){
            var axes=DW.fleetGuidance.frame(s.forward||[0,1,0]);
            var batch=DW.shipRender.engineGeometry([{index:index,hp:1,pose:{eye:s.position,right:axes.right,back:axes.back,up:axes.up,velocity:s.velocity,throttle:1}}],'',1,U,view,state.elapsed,mouths[s.model]||[]);DW.wormholes.own([batch],placement);return batch;
        });
        [state.arrivalPortal,state.evacuation?state.evacuation.exit:undefined].forEach(function(portal){
        if(portal&&combat.time>=portal.opensAt&&combat.time<portal.closesAt){
            var age=combat.time-portal.opensAt,growth=Math.min(1,age/3,(portal.closesAt-combat.time)/2),radius=(portal.radiusM||210)*Math.max(0,growth)/U;
            /** @type {number[]} */var vertices=[];
            // Tangent silhouette of the spherical mouth, rather than a debug globe.
            var normal=view.eye.map(function(v,k){return v-portal.position[k];}),distance=Math.hypot.apply(null,normal);
            if(distance>radius&&radius>0){
                normal=normal.map(function(v){return v/distance;});
                var axis=Math.abs(normal[2])<.9?[0,0,1]:[0,1,0];
                var right=[normal[1]*axis[2]-normal[2]*axis[1],normal[2]*axis[0]-normal[0]*axis[2],normal[0]*axis[1]-normal[1]*axis[0]],length=Math.hypot.apply(null,right);
                right=right.map(function(v){return v/length;});
                var up=[normal[1]*right[2]-normal[2]*right[1],normal[2]*right[0]-normal[0]*right[2],normal[0]*right[1]-normal[1]*right[0]],rim=radius*Math.sqrt(1-radius*radius/(distance*distance));
                for(var i=0;i<96;i++){
                    var a=i*Math.PI/48,b=(i+1)*Math.PI/48;
                    [[a,-1],[b,-1],[b,1],[a,-1],[b,1],[a,1]].forEach(function(pair){
                        var angle=pair[0],r=rim*(1+pair[1]*.018),point=portal.position.map(function(v,k){return v+normal[k]*radius*radius/distance+(right[k]*Math.cos(angle)+up[k]*Math.sin(angle))*r;});
                        vertices.push(point[0],point[1],point[2],pair[1],0,Math.min(1,age));
                    });
                }
            }
            effects.push({vertices:new Float32Array(vertices),color:state.evacuation&&portal===state.evacuation.exit?[.1,.8,1]:[.3,.12,1],shieldGlow:true});
        }
        });
        return effects;
    },geometry:function(combat){
        if(!combat.convoy||!this.visible)return [];
        var state=combat.convoy,key=state.ships.map(function(s){return s.id+':'+s.model+':'+(s.hull>0&&(!state.evacuation||!s.arrived)?'1':'0');}).join('|'),cached=cache.get(state);
        if(!cached||cached.key!==key){
            /** @type {Batch[]} */var batches=[];
            Object.keys(models).forEach(function(name){
                var ships=state.ships.filter(function(s){return s.hull>0&&(!state.evacuation||!s.arrived)&&s.model===name;});if(!ships.length)return;
                var offsets=new Float32Array(ships.flatMap(function(s){return [s.slot[0],s.slot[1],s.slot[2]-1200];}));
                var rights=new Float32Array(offsets.length),forwards=new Float32Array(offsets.length),ups=new Float32Array(offsets.length);
                models[name].forEach(function(batch){batches.push(Object.assign({},batch,{instanceOffsets:offsets,instanceRights:rights,instanceForwards:forwards,instanceUps:ups}));});
            });
            cached={key:key,batches:batches};cache.set(state,cached);
        }
        var origin=/** @type {[number,number,number]} */([0,0,1200]);
        var currentBatches=cached.batches;
        Object.keys(models).forEach(function(name){
            var ships=state.ships.filter(function(s){return s.hull>0&&(!state.evacuation||!s.arrived)&&s.model===name;}),batch=currentBatches.find(function(b){return b.vertices===models[name][0].vertices;});
            if(!batch||!batch.instanceOffsets)return;
            var offsets=batch.instanceOffsets;
            var rights=batch.instanceRights,forwards=batch.instanceForwards,ups=batch.instanceUps;
            ships.forEach(function(s,i){offsets.set([s.position[0],s.position[1],s.position[2]-1200],i*3);var axes=DW.fleetGuidance.frame(s.forward||[0,1,0]);if(rights)rights.set(axes.right,i*3);if(forwards)forwards.set(axes.back.map(function(v){return -v;}),i*3);if(ups)ups.set(axes.up,i*3);});
        });
        var placement=cargoPlacement(state);
        return cached.batches.map(function(batch){return Object.assign({},batch,{origin:origin,dynamicInstances:true,placement:placement});});
    }};
}());
