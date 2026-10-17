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
    /** @param {HTMLElement} host @param {() => World} getWorld @param {(world: World) => void} setWorld @param {{document: Document}} [environment] */
    function mount(host, getWorld, setWorld, environment) {
        var document = (environment || globalThis).document, units = DW.sim.METERS_PER_UNIT;
        var get = DW.experimentDom(document);
        var scene = DW.scene3d.create(host, getWorld, setWorld, { study: true });
        /** @type {import('./types').Images} */
        var shipImages = new Map();
        var burns = /** @type {WeakMap<Vector, Batch[]>} */ (new WeakMap());
        var crewKey = '', crewPoses = DW.miningStudyCrew && DW.miningStudyCrew.poses, crews = /** @type {Batch[]} */ ([]);
        DW.shipPackModels.loadTextures().then(function (images) {
            shipImages = images;
        }).catch(/** @param {unknown} error */ function (error) {
            get('art-credit').textContent = String(error);
        });
        var skybox = DW.flightSkybox.create(host);
        var artSelect = get('enemy-art'), allyArt = get('ally-art');
        DW.shipPackModels.populate(artSelect, true);
        DW.shipPackModels.populate(allyArt, true);
        [artSelect, allyArt].forEach(function (select) {
            var option = document.createElement('option');
            option.value = 'mixed';
            option.textContent = 'Mixed fleet · all ship models';
            select.insertBefore(option, select.firstChild);
            select.value = 'mixed';
        });
        function artCredit() {
            var entry = DW.shipPackModels.find(artSelect.value);
            get('art-credit').textContent = artSelect.value === 'mixed' ? 'Mixed fleet · Quaternius CC0 library · changes each wave' : entry ? entry.pack.author + ' / ' + entry.model.name + ' · ' + entry.pack.license + ' · ' + entry.model.triangles.toLocaleString() + ' triangles per ship' : 'Original six-triangle training hull';
        }
        function allyCredit() {
            var entry = DW.shipPackModels.find(allyArt.value);
            get('ally-credit').textContent = allyArt.value === 'mixed' ? 'Mixed fleet · Quaternius CC0 library · changes each wave' : entry ? entry.pack.author + ' / ' + entry.model.name + ' · ' + entry.pack.license : 'Original training blockout';
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
        /** @param {Craft} craft @param {Vector} start @param {Vector} end @param {number} wave */
        function hullHit(craft, start, end, wave) {
            return DW.shipPackModels.hullHit(model(craft, wave, { allyArt: allyArt.value, enemyArt: artSelect.value }), craft.pose, start, end, units);
        }
        /** @param {Pose} state */
        function pose(state) {
            scene.setSurfaceCamera(/** @type {Parameters<Scene['setSurfaceCamera']>[0]} */ ({ eye: state.eye, right: state.right, up: state.up, back: state.back }));
        }
        /** @param {FlightView} view @param {Appearance} appearance @param {Comparison} comparison @param {number} elapsed */
        function render(view, appearance, comparison, elapsed) {
            var state = view.state, combat = view.combat, guns = view.guns, world = view.world;
            var livingArt = /** @type {ArtCraft[]} */ (DW.training.alive(combat)).concat(combat.wrecks), actorBatches = /** @type {Batch[]} */ ([]);
            ['ally', 'enemy'].forEach(function (team) {
                var craft = livingArt.filter(function (e) {
                    return (e.team || 'enemy') === team;
                }), selection = team === 'ally' ? appearance.allyArt : appearance.enemyArt;
                if (!craft.length)
                    return;
                var batches = selection ? DW.shipPackModels.sourceFleetGeometry(craft, selection, combat.wave, units, appearance.shipImages, appearance.paint[team], true) : DW.training.geometry({ enemies: craft.map(function (e) {
                        return Object.assign({}, e, { hp: 1 });
                    }) });
                batches.forEach(function (batch) {
                    actorBatches.push(batch);
                });
            });
            ['ally', 'enemy'].forEach(function (team) {
                var craft = livingArt.filter(function (e) {
                    return (e.team || 'enemy') === team;
                });
                DW.shipPackModels.scorchGeometry(craft, team === 'ally' ? appearance.allyArt : appearance.enemyArt, combat.wave, units).forEach(function (batch) {
                    actorBatches.push(batch);
                });
            });
            var asteroid = world.asteroids[0];
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
            scene.setStudyActors(actorBatches.concat(crews.map(function (batch) {
                var asteroid = world.asteroids.find(function (a) { return a.id === batch.asteroidId; });
                return Object.assign({}, batch, {origin: /** @type {[number,number,number]} */ ([asteroid ? asteroid.position.x : 0, asteroid ? asteroid.position.y : 0, 0]), rotation: asteroid ? asteroid.rotation : 0});
            })));
            var effectBatches = DW.flightGuns.geometry(DW.training.allGuns(combat, guns), state), engineParts = /** @type {Float32Array[]} */ ([]);
            ['ally', 'enemy'].forEach(function (team) {
                var craft = DW.training.alive(combat).filter(function (e) {
                    return (e.team || 'enemy') === team;
                });
                engineParts.push(DW.shipPackModels.engineGeometry(craft, team === 'ally' ? appearance.allyArt : appearance.enemyArt, combat.wave, units, state, world.elapsedSeconds).vertices);
            });
            var engines = new Float32Array(engineParts.reduce(function (n, p) {
                return n + p.length;
            }, 0)), engineOffset = 0;
            engineParts.forEach(function (p) {
                engines.set(p, engineOffset);
                engineOffset += p.length;
            });
            effectBatches.push({ vertices: engines, color: [.25, .65, 1] });
            scene.setStudyEffects(effectBatches);
            scene.setStudyDiagnostics(comparison);
            skybox.render(state, comparison.scale, comparison.mode === 'empty');
            scene.sync(world);
            scene.render(world, 1, 0, elapsed);
        }
        function renderStats() {
            return { scene: scene.getRenderStats(), sky: skybox.getRenderStats() };
        }
        return { appearance: appearance, hullHit: hullHit, pose: pose, render: render, renderStats: renderStats };
    }
    DW.flightPresentation = { mount: mount, model: model };
}());
