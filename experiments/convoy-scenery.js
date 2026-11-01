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
    if(DW.flightMissions.current().id==='convoy'){
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
    DW.convoyScenery={createArrivalFleet:createArrivalFleet,arrivalPreparationMs:0,preview:function(name){return models[name]||[];},visible:true,ready:ready,texture:texture,install:install,effects:function(combat,view){
        if(!combat.convoy||!this.visible)return [];
        var state=combat.convoy,y=Math.min(state.destinationY,state.elapsed*state.speedMps/U);
        var effects=state.ships.filter(function(s){return s.hull>0;}).map(function(s,index){
            return DW.shipRender.engineGeometry([{index:index,hp:1,pose:{eye:[s.slot[0],s.slot[1]+y,s.slot[2]],right:[1,0,0],back:[0,-1,0],up:[0,0,1],velocity:[0,y<state.destinationY?state.speedMps:0,0],throttle:1}}],'',1,U,view,state.elapsed,mouths[s.model]||[]);
        });
        const portal=state.arrivalPortal;
        if(portal&&combat.time<portal.closesAt){
            var age=combat.time-portal.opensAt,growth=Math.min(1,age/3,(portal.closesAt-combat.time)/2),radius=210*Math.max(0,growth)/U;
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
            effects.push({vertices:new Float32Array(vertices),color:[.3,.12,1],shieldGlow:true});
        }
        return effects;
    },geometry:function(combat){
        if(!combat.convoy||!this.visible)return [];
        var state=combat.convoy,key=state.ships.map(function(s){return s.hull>0?'1':'0';}).join(''),cached=cache.get(state);
        if(!cached||cached.key!==key){
            /** @type {Batch[]} */var batches=[];
            Object.keys(models).forEach(function(name){
                var ships=state.ships.filter(function(s){return s.hull>0&&s.model===name;});if(!ships.length)return;
                var offsets=new Float32Array(ships.flatMap(function(s){return [s.slot[0],s.slot[1],s.slot[2]-1200];}));
                models[name].forEach(function(batch){batches.push(Object.assign({},batch,{instanceOffsets:offsets}));});
            });
            cached={key:key,batches:batches};cache.set(state,cached);
        }
        var origin=/** @type {[number,number,number]} */([0,Math.min(state.destinationY,state.elapsed*state.speedMps/U),1200]);
        return cached.batches.map(function(batch){return Object.assign({},batch,{origin:origin});});
    }};
}());
