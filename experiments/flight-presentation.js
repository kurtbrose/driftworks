(function () {
    'use strict';
    /** @typedef {import('../src/types').DriftworksNamespace} DriftworksNamespace */
    /** @typedef {import('./types').ArtCraft} ArtCraft */
    /** @typedef {import('./types').Appearance} Appearance */
    /** @typedef {import('../src/types').World} World */
    /** @typedef {import('./types').Craft} Craft */
    /** @typedef {import('./types').Vector} Vector */
    /** @typedef {import('./types').Pose} Pose */
    /** @typedef {import('./types').Scene} Scene */
    /** @typedef {import('./types').FlightView} FlightView */
    /** @typedef {import('./types').Comparison} Comparison */
    /** @typedef {import('./types').Batch} Batch */
    var DW = /** @type {Required<DriftworksNamespace>} */ (window.Driftworks);
    var assetUrl = /** @type {(value: string, base?: string) => string} */ (window.Driftworks.assetUrl);
    // Flash coordinates change when hyperbolic flight recentres its chart.
    // Keep one procedural pattern for the event, shared by all camera views.
    var explosionSeeds=/** @type {WeakMap<import('./types').Impact, number>} */ (new WeakMap());
    /** Ohio's roadside monument, in asteroid-local world units. Front faces the spawn (-Y).
     * @param {number} radius @param {HTMLImageElement} texture @param {number} [surfaceHeight] @returns {Batch[]}
     */
    function ohioSignGeometry(radius, texture, surfaceHeight) {
        var units=DW.sim.METERS_PER_UNIT, bottom=(surfaceHeight===undefined?radius*.78:surfaceHeight)*units+50, center=bottom+240;
        var groups={steel:/** @type {number[]} */([]),green:/** @type {number[]} */([]),lamps:/** @type {number[]} */([])};
        var b=DW.meshBuilder.create(groups);
        b.block('green',[0,-300,center],[552,9,242]);
        [-350,350].forEach(function(x){
            b.block('steel',[x,-280,(bottom+600)/2],[12,14,(bottom-600)/2]);
        });
        // Short outriggers carry real, tilted floodlight housings and luminous lenses.
        // Their upward face wash is baked into the sign, keeping the draw cost fixed.
        var lampBasis=[[1,0,0],[0,.8,.6],[0,-.6,.8]];
        [-350,0,350].forEach(function(x){
            b.link('steel',[x,-280,bottom-25],[x,-370,bottom-25],4);
            b.block('steel',[x,-370,bottom-18],[29,18,9],lampBasis);
            b.block('lamps',[x,-376,bottom-10],[24,14,1.5],lampBasis);
            b.block('steel',[x,-393,bottom-23],[30,3,5]);
        });
        [bottom+35,center+170].forEach(function(z){b.block('steel',[0,-278,z],[540,12,9]);});
        var batches=/** @type {Batch[]} */(Object.keys(groups).map(function(key,index){
            var vertices=groups[/** @type {keyof typeof groups} */(key)];
            for(var i=0;i<vertices.length;i+=6)for(var k=0;k<3;k++)vertices[i+k]/=units;
            return {vertices:new Float32Array(vertices),staticGeometry:true,color:/** @type {[number,number,number]} */([[.33,.37,.38],[.025,.16,.10],[1,.95,.72]][index]),finish:index===2?7:0};
        }));
        var face=/** @type {number[]} */([]);
        var corners=[[-550,bottom,0,1],[550,bottom,1,1],[550,center+240,1,0],[-550,center+240,0,0]];
        [0,1,2,0,2,3].forEach(function(i){var p=corners[i];face.push(p[0]/units,-310/units,p[1]/units,0,-1,0,p[2],p[3]);});
        batches.push({vertices:new Float32Array(face),color:[1,1,1],staticGeometry:true,texture:texture,stride:8,finish:0});
        return batches;
    }
    /** Symmetric rotating tether; real seconds, metres, m/s and m/s squared.
     * Tip acceleration is limited to the selected 1, 2 or 3 g operating load.
     * @param {number} lengthKm @param {string} mode
     */
    function tetherSpin(lengthKm, mode) {
        var radiusM=lengthKm*500;
        var loadG=mode==='3g'?3:mode==='2g'?2:1;
        var tipSpeed=Math.sqrt(loadG*9.80665*radiusM);
        var angularSpeed=tipSpeed/radiusM;
        return {tipSpeed:tipSpeed,angularSpeed:angularSpeed,periodSeconds:2*Math.PI/angularSpeed,tipG:tipSpeed*tipSpeed/radiusM/9.80665};
    }
    /** Greybox dimensions are metres; span includes both tip blocks.
     * @param {number} lengthKm @returns {Batch[]}
     */
    function tetherGeometry(lengthKm) {
        var groups = { cable: /** @type {number[]} */ ([]), hub: /** @type {number[]} */ ([]), tips: /** @type {number[]} */ ([]) };
        var builder = DW.meshBuilder.create(groups), half = lengthKm * 500;
        builder.block('cable', [0,0,0], [half-20,2,2]);
        builder.block('hub', [0,0,0], [50,30,30]);
        [-1,1].forEach(function(sign) {
            builder.block('tips', [sign*(half-20),0,0], [20,20,20]);
            // Open catcher frame: a visible fly-through aperture, 60 m square.
            builder.block('tips', [sign*(half-20),50,40], [20,40,10]);
            builder.block('tips', [sign*(half-20),50,-40], [20,40,10]);
            builder.block('tips', [sign*(half-20),90,0], [20,10,30]);
        });
        return Object.keys(groups).map(function(key,index) {
            var vertices = groups[/** @type {keyof typeof groups} */ (key)].slice();
            for(var i=0;i<vertices.length;i+=6) for(var k=0;k<3;k++) vertices[i+k]/=DW.sim.METERS_PER_UNIT;
            var shade=[.48,.65,.78][index];
            return {vertices:new Float32Array(vertices),color:/** @type {[number,number,number]} */ ([shade,shade,shade]),staticGeometry:true};
        });
    }
    /** Current mining rig and source astronauts, in world units; no saved entities.
     * @param {World} world @returns {Batch[]}
     */
    function surfaceCrews(world) {
        var closedRig = DW.scene3d.miningPlatformGeometry(1, 0, false, 0, '');
        var openRig = DW.scene3d.miningPlatformGeometry(1, 0, false, 1, '');
        /** @type {Record<string, [number,number,number]>} */
        var colors = {ochre:[.83,.64,.29],steel:[.46,.53,.52],dark:[.10,.15,.17],light:[.89,.79,.49],lamp:[1,.94,.78],marker:[.35,.95,.85]};
        var units = DW.sim.METERS_PER_UNIT, rigScale = 36 / 32;
        const poses = DW.miningStudyCrew && DW.miningStudyCrew.poses;
        /** @type {Batch[]} */
        var batches = [];
        /** @type {{position:number[],yaw:number,pose:'standing'|'servicing'}[]} */
        var placements = [
            {position:[-9,19,0],yaw:0,pose:'standing'},
            {position:[21,5,0],yaw:Math.PI/2,pose:'standing'},
            {position:[-3,0,4.5],yaw:Math.PI,pose:'standing'},
            {position:[2.75,0,4.5],yaw:0,pose:'servicing'},
            {position:[3,0,13.74],yaw:Math.PI/2,pose:'standing'}
        ];
        world.asteroids.forEach(function (asteroid) {
            /** @type {{vertices:number[],baked:number[],finish?:number,rigLights:import('../src/types').RigLighting[],color:[number,number,number]}[]} */
            var groups = [];
            [[-.32,-.85,.65],[.42,-.65,.72],[-.6,.25,.8]].forEach(function (direction, siteIndex) {
                var rig = siteIndex === 1 ? closedRig : openRig;
                var frame = DW.scene3d.surfaceFrame(asteroid, /** @type {[number,number,number]} */ (direction));
                var z = frame.normal, h = Math.hypot(z[0],z[1]) || 1;
                var x = [-z[1]/h,z[0]/h,0], y = [z[1]*x[2]-z[2]*x[1],z[2]*x[0]-z[0]*x[2],z[0]*x[1]-z[1]*x[0]];
                /** @param {number[]} p @param {number[]} n @param {number} group @param {[number,number,number]} color */
                function vertex(p, n, group, color) {
                    var out = groups[group] || (groups[group] = {vertices:[],baked:[],rigLights:[],color:color});
                    var local=p.map(function(_,k){return frame.point[k]*asteroid.radius+(x[k]*p[0]+y[k]*p[1]+z[k]*p[2])/units;});
                    var normal=n.map(function(_,k){return x[k]*n[0]+y[k]*n[1]+z[k]*n[2];});
                    out.vertices.push(local[0],local[1],local[2],normal[0],normal[1],normal[2]);
                }
                var scale=rigScale/units;
                /** @type {{world:(p:number[])=>number[];rotate:(p:number[])=>number[]}} */
                var pose={world:function(p){return p.map(function(_,k){return frame.point[k]*asteroid.radius+(x[k]*p[0]+y[k]*p[1]+z[k]*p[2])*scale;});},rotate:function(p){return p.map(function(_,k){return x[k]*p[0]+y[k]*p[1]+z[k]*p[2];});}};
                DW.miningLights.visual(rig,pose,scale).forEach(function(batch,index){
                    var out=groups[index] || (groups[index]={vertices:[],baked:[],rigLights:[],color:batch.color});
                    out.finish=batch.finish;
                    for(var i=0;i<batch.vertices.length;i++)out.vertices.push(batch.vertices[i]);
                    if(batch.bakedDocking)for(var i=0;i<batch.bakedDocking.length;i++)out.baked.push(batch.bakedDocking[i]);
                    out.rigLights.push.apply(out.rigLights,batch.rigLights||[]);
                });
                if (poses) placements.forEach(function (placement) {
                    var pc=Math.cos(placement.yaw),ps=Math.sin(placement.yaw),offset=placement.position.map(function(v){return v*rigScale;});
                    // Ground crew stand on the sampled terrain, deck crew retain the study's hardpoints.
                    if (placement.position[2] === 0) {
                        var probe=frame.point.map(function(v,k){return v+(x[k]*offset[0]+y[k]*offset[1])/(units*asteroid.radius);});
                        var ground=DW.scene3d.surfaceFrame(asteroid,/** @type {[number,number,number]} */ (probe)).point;
                        offset=[x,y,z].map(function(axis){return ground.reduce(function(sum,v,k){return sum+(v-frame.point[k])*asteroid.radius*units*axis[k];},0);});
                    }
                    poses[placement.pose].forEach(function (batch,index) {
                        var v=batch.vertices;
                        for(var i=0;i<v.length;i+=6) vertex([offset[0]+(v[i]*pc-v[i+1]*ps)*1.8,offset[1]+(v[i]*ps+v[i+1]*pc)*1.8,offset[2]+v[i+2]*1.8],[v[i+3]*pc-v[i+4]*ps,v[i+3]*ps+v[i+4]*pc,v[i+5]],Object.keys(rig).length+index,batch.color);
                    });
                });
            });
            groups.forEach(function (batch) {
                batches.push({vertices:new Float32Array(batch.vertices),color:batch.color,asteroidId:asteroid.id,staticGeometry:true,finish:batch.finish,bakedDocking:batch.baked.length?new Float32Array(batch.baked):undefined,rigLights:batch.rigLights});
            });
        });
        return batches;
    }
    /** Project layered burns onto the terrain once per impact, in asteroid-local units.
     * @param {import('../src/types').Asteroid} asteroid @param {Vector} point @returns {Batch[]}
     */
    function terrainScorch(asteroid, point) {
        var frame = DW.scene3d.surfaceFrame(asteroid, /** @type {[number,number,number]} */ (point));
        var n = frame.normal, h = Math.hypot(n[0], n[1]);
        var x = h > .001 ? [-n[1]/h,n[0]/h,0] : [1,0,0];
        var y = [n[1]*x[2]-n[2]*x[1],n[2]*x[0]-n[0]*x[2],n[0]*x[1]-n[1]*x[0]];
        return [1,.78,.55,.32].map(function (size, layer) {
            var vertices = /** @type {number[]} */ ([]), rings = 3, edges = 16;
            /** @param {number} ring @param {number} edge */
            function vertex(ring, edge) {
                edge %= edges;
                var angle = edge * Math.PI * 2 / edges;
                var radius = 2.4 * size * ring / rings * (1 + .12*Math.sin(edge*7.3+point[0]*11));
                var probe = frame.point.map(function (v,k) { return v + (x[k]*Math.cos(angle)+y[k]*Math.sin(angle))*radius/(DW.sim.METERS_PER_UNIT*asteroid.radius); });
                var surface = DW.scene3d.surfaceFrame(asteroid, /** @type {[number,number,number]} */ (probe));
                surface.point.forEach(function (v,k) { vertices.push(v*asteroid.radius + surface.normal[k]*(.08+layer*.025)/DW.sim.METERS_PER_UNIT); });
                vertices.push.apply(vertices,surface.normal);
            }
            for (var ring=0;ring<rings;ring++) for(var edge=0;edge<edges;edge++) {
                vertex(ring,edge);vertex(ring+1,edge);vertex(ring+1,edge+1);
                if(ring) { vertex(ring,edge);vertex(ring+1,edge+1);vertex(ring,edge+1); }
            }
            return {vertices:new Float32Array(vertices),staticGeometry:true,color:/** @type {[number,number,number]} */ ([.12,.10,.08]),opacity:[.18,.22,.25,.28][layer]};
        });
    }
    /** @param {ArtCraft} craft @param {number} wave @param {Pick<Appearance, 'allyArt' | 'enemyArt'>} appearance */
    function model(craft, wave, appearance) {
        return DW.shipPackModels.craftModel(craft, craft.team === 'ally' ? appearance.allyArt : appearance.enemyArt, wave);
    }
    /** @param {HTMLElement} host @param {() => World} getWorld @param {(world: World) => void} setWorld @param {{document: Document,emptySky?:boolean}} [environment] */
    function mount(host, getWorld, setWorld, environment) {
        var document = (environment || globalThis).document, units = DW.sim.METERS_PER_UNIT;
        var get = DW.experimentDom(document);
        var scene = DW.scene3d.create(host, getWorld, setWorld, { study: true, viewer: false });
        /** @type {import('./types').Images} */
        var shipImages = new Map();
        var calibration = /** @type {Batch[]} */ ([]);
        var burns = /** @type {WeakMap<Vector, Batch[]>} */ (new WeakMap());
        var crewKey = '', crewPoses = DW.miningStudyCrew && DW.miningStudyCrew.poses, crews = /** @type {Batch[]} */ ([]);
        var ready=DW.shipPackModels.loadTextures().then(function (images) {
            if (!scene.prepareStudyTextures) { shipImages = images; return true; }
            return Promise.resolve(scene.prepareStudyTextures(DW.shipPackModels.textureSources(images))).then(function () {
                shipImages = images;
                return true;
            });
        }).catch(/** @param {unknown} error */ function (error) {
            get('art-credit').textContent = String(error);
            return false;
        });
        var skybox = DW.flightSkybox.create(host);
        var shieldVisible=0,shieldWaves=0,shieldVisibleWave=false;
        var shieldParams=new URLSearchParams(typeof location==='undefined'?'':location.search),ownShield=shieldParams.get('shields')==='own',shieldDefault=!['own','whole'].includes(shieldParams.get('shields')||''),shieldEnabled=shieldParams.get('shields')!=='off',shieldTracker=DW.flightShields?DW.flightShields.tracker():null;
        var shieldDegrees=shieldDefault||shieldParams.get('shieldUnits')==='angle'?.35:null,shieldGlow=true,shieldTime=0,shieldTest=-Infinity;
        /** @type {number[]|null} */var shieldPreview=null;
        var liveShipImages=false;
        var shipStretching=typeof location!=='undefined'&&new URLSearchParams(location.search).get('bridgeShips')==='warped';
        var bridgeMode=typeof location==='undefined'?'':new URLSearchParams(location.search).get('bridge');
        if(DW.flightMissions.current().sky.wormhole&&scene.setStudyBridge)scene.setStudyBridge(bridgeMode!=='legacy'&&bridgeMode!=='sky');
        var roadsideDefinition=DW.flightMissions.current().scenery.find(function(item){return item.kind==='roadside';});
        var roadside=roadsideDefinition?DW.flightScenery.create(roadsideDefinition):null;
        var signDefinition=DW.flightMissions.current().scenery.find(function(item){return item.kind==='highway-sign';});
        var ohioSign=signDefinition?new Image():null, signRadius=-1, signBatches=/** @type {Batch[]} */([]);
        if(ohioSign&&signDefinition)ohioSign.src=assetUrl(signDefinition.asset);
        /** @type {import('./types').AegisFlightRig|null} */var capital=null;
        var tetherKm = Number(new URLSearchParams(typeof location === 'undefined' ? '' : location.search).get('tether'));
        var tether = [100,50,20,10,2].includes(tetherKm) ? tetherGeometry(tetherKm) : [];
        var spin=tetherSpin(tetherKm || 100,new URLSearchParams(typeof location === 'undefined' ? '' : location.search).get('spin') || '1g');
        var tetherReadout = tether.length ? document.getElementById('tether-readout') : null;
        var artSelect = get('enemy-art'), allyArt = get('ally-art');
        DW.shipPackModels.populate(artSelect, true);
        DW.shipPackModels.populate(allyArt, true);
        [artSelect, allyArt].forEach(function (select) {
            var option = document.createElement('option');
            option.value = 'mixed';
            option.textContent = 'Mixed fleet ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â· all ship models';
            select.insertBefore(option, select.firstChild);
            select.value = 'mixed';
        });
        function artCredit() {
            var entry = DW.shipPackModels.find(artSelect.value);
            get('art-credit').textContent = artSelect.value === 'mixed' ? 'Mixed fleet ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â· Quaternius + Driftworks concept ships ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â· changes each wave' : entry ? entry.pack.author + ' / ' + entry.model.name + ' ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â· ' + entry.pack.license + ' ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â· ' + entry.model.triangles.toLocaleString() + ' triangles per ship' : 'Original six-triangle training hull';
        }
        function allyCredit() {
            var entry = DW.shipPackModels.find(allyArt.value);
            get('ally-credit').textContent = allyArt.value === 'mixed' ? 'Mixed fleet ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â· Quaternius + Driftworks concept ships ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â· changes each wave' : entry ? entry.pack.author + ' / ' + entry.model.name + ' ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â· ' + entry.pack.license : 'Original training blockout';
        }
        allyArt.onchange = allyCredit;
        allyCredit();
        artSelect.onchange = artCredit;
        artCredit();
        // A fresh appearance snapshot is shared with the HUD for this rendered frame.
        /** @returns {Appearance} */
        function appearance() {
            return {
                shipImages: shipImages, allyArt: allyArt.value, enemyArt: artSelect.value,
                paint: { ally: paint('ally'), enemy: paint('enemy') }
            };
        }
        /** @param {string} team */
        function paint(team) {
            return get('faction-paint').checked ? DW.shipPackModels.paintColor(get(team === 'ally' ? 'ally-color' : 'enemy-color').value) : undefined;
        }
        /** @param {Pose} state */
        function pose(state) {
            scene.setSurfaceCamera(/** @type {Parameters<Scene['setSurfaceCamera']>[0]} */ ({ region:state.region||0, eye: state.eye, right: state.right, up: state.up, back: state.back }));
        }
        /** @param {FlightView} view @param {Appearance} appearance @param {Comparison} comparison @param {number} elapsed @param {(()=>()=>void)=} gpuTimer */
        function render(view, appearance, comparison, elapsed, gpuTimer) {
            if(view.state.curvature)view=DW.flightHyperbolic.presentation(view);
            var state = view.camera || view.state, combat = view.combat, guns = view.guns, world = view.world;
            var regions=DW.flightMissions.resolve(combat.mode).sky.wormhole?[0,1]:[0],objectWarp=regions.length>1&&(DW.flightMissions.resolve(combat.mode).sky.thinShell||liveShipImages||!shipStretching||typeof location!=='undefined'&&new URLSearchParams(location.search).get('bridgeGeometry')==='objects');
            var livingArt = /** @type {ArtCraft[]} */ (DW.training.alive(combat)).concat(combat.wrecks), actorBatches = /** @type {Batch[]} */ ([]);
            if (view.observerCraft) livingArt.push(view.observerCraft);
            var groups=/** @type {{team:string;region:number;craft:ArtCraft[]}[]} */([]);
            ['ally','enemy'].forEach(function(team){regions.forEach(function(region){var list=livingArt.filter(function(c){return (c.team||'enemy')===team&&(c.pose.region||0)===region;});if(objectWarp)list.forEach(function(c){groups.push({team:team,region:region,craft:[c]});});else groups.push({team:team,region:region,craft:list});});});
            groups.forEach(function (group) {
                var team=group.team;
                var craft = group.craft, selection = team === 'ally' ? appearance.allyArt : appearance.enemyArt;
                if (!craft.length)
                    return;
                var batches = selection ? DW.shipPackModels.sourceFleetGeometry(craft, selection, combat.wave, units, appearance.shipImages, appearance.paint[team], true) : DW.training.geometry({ enemies: craft.map(function (e) {
                        return Object.assign({}, e, { hp: 1 });
                    }) });
                batches.forEach(function (batch) {
                    actorBatches.push(Object.assign({},batch,{region:group.region,lensRadius:objectWarp?DW.shipPackModels.hullRadius(DW.shipPackModels.craftModel(craft[0],team==='ally'?appearance.allyArt:appearance.enemyArt,combat.wave)):undefined,lensCenter:objectWarp?craft[0].pose.eye:undefined}));
                });
            });
            groups.forEach(function (group) {
                var team=group.team;
                var craft = group.craft;
                if(!craft.length)return;
                var scorchDraw=DW.shipPackModels.sourceScorchGeometry||DW.shipPackModels.scorchGeometry;
                scorchDraw(craft, team === 'ally' ? appearance.allyArt : appearance.enemyArt, combat.wave, units).forEach(function (batch) {
                    actorBatches.push(Object.assign({},batch,{region:group.region,lensRadius:objectWarp?DW.shipPackModels.hullRadius(DW.shipPackModels.craftModel(craft[0],team==='ally'?appearance.allyArt:appearance.enemyArt,combat.wave)):undefined,lensCenter:objectWarp?craft[0].pose.eye:undefined}));
                });
            });
            var asteroid = world.asteroids[0];
            if(asteroid&&ohioSign&&ohioSign.complete&&ohioSign.naturalWidth){
                if(signRadius!==asteroid.radius){
                    var signSurface=DW.scene3d.surfaceFrame(asteroid,[0,-.24,1]).point[2]*asteroid.radius;
                    signBatches=ohioSignGeometry(asteroid.radius,ohioSign,signSurface);signRadius=asteroid.radius;
                }
                signBatches.forEach(function(batch){actorBatches.push(Object.assign({},batch,{origin:/** @type {[number,number,number]} */([asteroid.position.x,asteroid.position.y,0]),rotation:asteroid.rotation}));});
            }
            if(asteroid&&roadside)roadside.render(asteroid).forEach(function(batch){actorBatches.push(Object.assign({},batch,{origin:/** @type {[number,number,number]} */([asteroid.position.x,asteroid.position.y,0]),rotation:asteroid.rotation}));});
            if (asteroid) (combat.terrainScorches || []).forEach(function (point) {
                var batches = burns.get(point);
                if (!batches) { batches = terrainScorch(asteroid, point); burns.set(point, batches); }
                batches.forEach(function (batch) {
                    actorBatches.push(Object.assign({}, batch, {origin:[asteroid.position.x,asteroid.position.y,0],rotation:asteroid.rotation}));
                });
            });
            var nextCrewKey = JSON.stringify(world.asteroids.map(function (a) { return [a.id,a.radius,a.excavation]; }));
            var nextPoses = DW.miningStudyCrew && DW.miningStudyCrew.poses;
            if (nextCrewKey !== crewKey || nextPoses !== crewPoses) { crews = surfaceCrews(world); crewKey = nextCrewKey; crewPoses = nextPoses; }
            if(tether.length) {
                // Flight elapsed time advances with combat disabled and freezes on pause.
                var angle = world.elapsedSeconds * spin.angularSpeed;
                tether.forEach(function(batch) { actorBatches.push(Object.assign({},batch,{origin:/** @type {[number,number,number]} */ ([0,0,1200]),rotation:angle})); });
                if(tetherReadout) {
                    var speed=Math.hypot.apply(null,view.state.velocity), distance=Math.hypot(state.eye[0],state.eye[1],state.eye[2]-1200)*units;
                    tetherReadout.textContent=tetherKm+' km tip-to-tip  /  hub '+(distance/1000).toFixed(2)+' km\nTip '+spin.tipSpeed.toFixed(0)+' m/s / '+spin.tipG.toFixed(2)+' g / period '+spin.periodSeconds.toFixed(1)+' s\nFull span at current '+speed.toFixed(0)+' m/s: '+(speed>1?(tetherKm*1000/speed/60).toFixed(1)+' min':'--');
                }
            }
            if(capital)actorBatches=actorBatches.concat(capital.geometry(state));
            if(combat.mode==='evacuation'&&DW.evacuationScenery)actorBatches=actorBatches.concat(DW.evacuationScenery.geometry(combat));
            scene.setStudyActors(actorBatches.concat(calibration).concat(crews.map(function (batch) {
                var asteroid = world.asteroids.find(function (a) { return a.id === batch.asteroidId; });
                return Object.assign({}, batch, {origin: /** @type {[number,number,number]} */ ([asteroid ? asteroid.position.x : 0, asteroid ? asteroid.position.y : 0, 0]), rotation: asteroid ? asteroid.rotation : 0});
            })));
            var allGuns=DW.training.allGuns(combat,guns),effectBatches=/** @type {Batch[]} */([]),engineParts=/** @type {{region:number;vertices:Float32Array}[]} */([]);
            // Rigid ship placement does not warp individual projectiles. Keep
            // their additive geometry batched per chart in the full renderer.
            // Only the explicit object-warp experiment needs per-effect paths.
            if(regions.length>1&&(DW.flightMissions.resolve(combat.mode).sky.thinShell||typeof location!=='undefined'&&new URLSearchParams(location.search).get('bridgeGeometry')==='objects')){
                allGuns.bolts.forEach(function(b){DW.flightGuns.geometry({bolts:[b],impacts:[]},state).forEach(function(batch){effectBatches.push(Object.assign({},batch,{region:b.region||0,lensCenter:b.position}));});});
                allGuns.impacts.forEach(function(b){DW.flightGuns.geometry({bolts:[],impacts:[b]},state).forEach(function(batch){effectBatches.push(Object.assign({},batch,{region:b.region||0,lensCenter:b.position}));});});
            }else if(regions.length>1){
                effectBatches=DW.flightGuns.geometry(allGuns,state,DW.flightMissions.resolve(combat.mode).sky.thinShell?'thin-shell':true);
            }else{
            regions.forEach(function(region){DW.flightGuns.geometry({bolts:allGuns.bolts.filter(function(b){return (b.region||0)===region;}),impacts:allGuns.impacts.filter(function(b){return (b.region||0)===region;})},state).forEach(function(b){effectBatches.push(Object.assign({},b,{region:region}));});});
            }
            groups.forEach(function (group) {
                var team=group.team;
                var craft=group.craft.filter(function(c){return (c.hp||0)>0;});
                if(!craft.length)return;
                var engine=Object.assign({},DW.shipPackModels.engineGeometry(craft, team === 'ally' ? appearance.allyArt : appearance.enemyArt, combat.wave, units, state, world.elapsedSeconds),{region:group.region,lensRadius:objectWarp?DW.shipPackModels.hullRadius(DW.shipPackModels.craftModel(craft[0],team==='ally'?appearance.allyArt:appearance.enemyArt,combat.wave)):undefined,lensCenter:objectWarp?craft[0].pose.eye:undefined});
                if(objectWarp)effectBatches.push(engine);else engineParts.push(engine);
            });
            if(!objectWarp)regions.forEach(function(region){
                var parts=engineParts.filter(function(p){return p.region===region;}),vertices=new Float32Array(parts.reduce(function(n,p){return n+p.vertices.length;},0)),offset=0;
                parts.forEach(function(p){vertices.set(p.vertices,offset);offset+=p.vertices.length;});
                effectBatches.push({region:region,vertices:vertices,color:[.25,.65,1]});
            });
            var defaultShieldDiscs=shieldDefault&&shieldTracker?shieldTracker.collect(view,appearance,host.clientWidth/host.clientHeight,false,shieldEnabled?'default':'off'):null;
            if(shieldDefault&&shieldTracker&&shieldEnabled&&comparison.actors&&comparison.mode!=='empty')effectBatches=effectBatches.concat(shieldTracker.effects());
            if(capital)effectBatches=effectBatches.concat(capital.effects(state,shieldEnabled&&comparison.actors&&comparison.mode!=='empty'));
            var defaultGlow=shieldDefault?effectBatches.filter(function(b){return b.shieldGlow;}):[];
            scene.setStudyEffects(effectBatches);
            scene.setStudyExplosions(combat.flashes.filter(function(f){return f.destruction;}).map(function(f){
                var seed=explosionSeeds.get(f);
                if(seed===undefined){seed=Math.round(f.position[0]*31+f.position[1]*17);explosionSeeds.set(f,seed);}
                return {region:f.region||0,position:/** @type {[number,number,number]} */(f.position),velocity:/** @type {[number,number,number]|undefined} */(f.velocity),age:f.age,size:(f.scale||14)/(units*2),seed:seed};
            }));
            // This conservative revision covers simulation-driven mesh motion,
            // pose changes, asset readiness, appearance edits and actor lifetime.
            // Additive bolts/engines are composited live and never cached.
            if(scene.setStudyBridgeRevision&&typeof location!=='undefined'&&new URLSearchParams(location.search).get('bridgeTemporal')==='1'){
                scene.setStudyBridgeRevision(JSON.stringify([world.elapsedSeconds,world.asteroids,world.ships,appearance.allyArt,appearance.enemyArt,appearance.paint,comparison,livingArt.map(function(c){return [c.hp,c.pose,c.scorches];}),combat.flashes,actorBatches.map(function(b){return [b.vertices.length,b.origin,b.rotation,b.basis,b.scale,b.finish,b.color,b.opacity,b.texture&&b.texture.src];})]));
            }
            scene.setStudyDiagnostics(comparison);
            if(skybox.setOccluders)skybox.setOccluders(world.asteroids.map(function(a){return {center:[a.position.x,a.position.y,0],radius:a.radius};}));
            var motionToggle=/** @type {HTMLInputElement|null} */(document.getElementById('flight-lanes'));
            var motionStyle=/** @type {HTMLSelectElement|null} */(document.getElementById('flight-guide-style'));
            var motionBrightness=/** @type {HTMLInputElement|null} */(document.getElementById('flight-lanes-opacity'));
            var motionOpacity=regions.length>1&&!combat.dead&&!document.body.classList.contains('watch-chase')&&(!motionToggle||motionToggle.checked)&&(!motionStyle||motionStyle.value==='grid')?(motionBrightness?Number(motionBrightness.value)/100:.85):0;
            skybox.render(state, comparison.scale, comparison.mode === 'empty'||!!(environment&&environment.emptySky),elapsed,motionOpacity);
            scene.sync(world);
            if(scene.setStudyShields&&shieldTracker){var skyCanvas=host.querySelector('canvas.flight-skybox'),discs=defaultShieldDiscs||shieldTracker.collect(view,appearance,host.clientWidth/host.clientHeight,ownShield);shieldTime=view.combat.time;
                if(shieldTime<shieldTest)shieldTest=-Infinity;
                var testAge=shieldTime-shieldTest;if(testAge>=0&&testAge<1.2){if(ownShield)discs=[{box:[0,0,1,1],waves:[.22,.1,-.97,testAge],depth:0,own:true}];else if(discs.length)discs[discs.length-1].waves=[.6,0,.8,testAge];}
                if(ownShield&&shieldPreview!==null)discs=shieldPreview.length?[{box:[0,0,1,1],waves:shieldPreview,depth:0,own:true}]:[];
                discs.forEach(function(d){if(shieldDegrees!==null)d.degrees=shieldDegrees;d.glow=shieldGlow;});shieldVisibleWave=discs.some(function(d){return d.box[3]>.08&&d.waves.some(function(age,i){return i%4===3&&age>=.2&&age<.8;});});shieldVisible=discs.length+defaultGlow.length;shieldVisibleWave=shieldVisibleWave||defaultGlow.some(function(b){return b.vertices.length>0;});shieldWaves=defaultGlow.reduce(function(n,b){return n+(b.shieldWaves||0);},0)+discs.reduce(function(sum,d){return sum+d.waves.length/4;},0);scene.setStudyShields(shieldEnabled&&comparison.actors&&comparison.mode!=='empty'?discs:[],shieldEnabled&&skyCanvas instanceof HTMLCanvasElement?skyCanvas:null);}
            var endGpu=gpuTimer?gpuTimer():null;
            try{scene.render(world, 1, 0, elapsed);}finally{if(endGpu)endGpu();}
        }
        function renderStats() {
            return { scene: scene.getRenderStats(), sky: skybox.getRenderStats() };
        }
        return {setShipStretching:/** @param {boolean} enabled */function(enabled){liveShipImages=true;shipStretching=enabled;scene.setStudyShipStretching(enabled);},setShieldPreview:/** @param {number[]|null} waves */function(waves){shieldPreview=waves;},setCalibration:/** @param {Batch[]} batches */function(batches){calibration=batches;},setShieldOptics:/** @param {number|null} degrees @param {boolean} glow */function(degrees,glow){shieldDegrees=degrees;shieldGlow=glow;},injectShieldHit:function(){shieldTest=shieldTime-.12;},shieldSummary:function(){return {visible:shieldVisible,waves:shieldWaves,visibleWave:shieldVisibleWave};},completeFrame:function(){scene.completeFrame();},setShields:/** @param {boolean} enabled */function(enabled){shieldEnabled=enabled;}, ready:ready, appearance: appearance, pose: pose, render: render, renderStats: renderStats, setCapital:/** @param {import('./types').AegisFlightRig|null} rig */function(rig){capital=rig;} };
    }
    DW.flightPresentation = { mount: mount, model: model, tetherGeometry: tetherGeometry, tetherSpin: tetherSpin, ohioSignGeometry:ohioSignGeometry };
}());
