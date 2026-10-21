(function () {
    'use strict';
    /** @typedef {import('../src/types').DriftworksNamespace} DriftworksNamespace */
    var get = /** @type {Required<DriftworksNamespace>} */ (window.Driftworks).experimentDom(document);
    var DW = /** @type {Required<DriftworksNamespace>} */ (window.Driftworks), host = get('viewer'), world = DW.sim.createInitialWorld();
    world.asteroids = [];
    world.ships = [];
    world.platforms = [];
    world.wrecks = [];
    world.packets = [];
    world.combat.drones = [];
    world.selectedShipIds = [];
    var scene = DW.scene3d.create(host, function () {
        return world;
    }, function (value) {
        world = value;
    }, { study: true, viewer: true });
    var select = get('ship-model'), units = DW.sim.METERS_PER_UNIT;
    DW.shipPackModels.populate(select, false);
    if(DW.originalShipModels && DW.originalShipModels.length){
        var originals=document.createElement('optgroup');originals.label='Driftworks originals / procedural';
        DW.originalShipModels.forEach(function(model){var option=document.createElement('option');option.value=model.id;option.textContent=model.name;originals.appendChild(option);});
        select.appendChild(originals);
    }
    function original(){return (DW.originalShipModels || []).find(function(model){return model.id===select.value;});}

    var pose = { eye: [0, 0, 0], right: [1, 0, 0], back: [0, -1, 0], up: [0, 0, 1], velocity: [0, 0, 0], throttle: 1 }, rotating = true, last = 0;
    function reset() {
        world.camera = { x: 0, y: 0, zoom: Math.min(host.clientWidth, host.clientHeight) * .27 / (8.5 / units) };
        scene.setOrbit({ yaw: .4, tilt: .9, height: 0 });
    }
    var revision = 0, images = DW.shipPackModels.loadTextures();
    /** @param {boolean} [resetView] */
    async function update(resetView) {
        var native=original();
        get('paint-enabled').disabled=!!native;get('paint-color').disabled=!!native;get('show-engines').disabled=!!native;
        if(native){
            revision++;var batches=native.geometry(units);scene.setStudyActors(batches);scene.setStudyEffects([]);
            get('metadata').textContent=native.author+' original / '+native.name+'\nProcedural project model - 36 m main hull\n'+batches.reduce(function(sum,batch){return sum+batch.vertices.length/18;},0).toLocaleString()+' triangles\nOriginal yellow / charcoal materials';
            get('source').textContent='Rig design study';get('source').href=native.study;get('provenance').href=native.provenance;
            if(resetView===true)reset();return;
        }
        get('source').textContent="Creator's pack page";
        var ticket = ++revision, entry = DW.shipPackModels.find(select.value);
        if (!entry)
            return;
        var model = entry.model;
        var metadata = get('metadata');
        metadata.textContent = 'Loading ' + model.name + '...';
        scene.setStudyActors([]);
        get('source').href = entry.pack.url;
        get('provenance').href = '../assets/ships/' + entry.pack.id + '/README.md';
        if (resetView === true)
            reset();
        try {
            var textures = await images;
            if (ticket !== revision)
                return;
            scene.setStudyActors([DW.shipPackModels.sourceGeometry(model, [pose], units, textures.get(model.id), get('paint-enabled').checked ? DW.shipPackModels.paintColor(get('paint-color').value) : undefined)]);
            metadata.textContent = entry.pack.author + ' / ' + model.name + '\n' + entry.pack.license + (entry.pack.id==='concept-trio'?'\nConcept geometry / baked material atlas\n':'\nOriginal glTF texture, UVs and normals\n') + ((model.texturedVertices || []).length / 24).toLocaleString() + ' triangles / ' + DW.shipPackModels.engineAnchors(model).length + ' engines';
        }
        catch (error) {
            if (ticket === revision)
                metadata.textContent = String(error);
        }
    }
    var requested=window.location?new URLSearchParams(window.location.search).get('model'):null;
    select.value=requested && ((DW.originalShipModels || []).some(function(model){return model.id===requested;}) || DW.shipPackModels.find(requested))?requested:'quaternius-ultimate-spaceships:Striker';
    function changePaint() {
        get('paint-enabled').checked = true;
        update();
    }
    get('paint-color').oninput = changePaint;
    get('paint-color').onchange = changePaint;
    get('paint-enabled').onchange = function () {
        update();
    };
    select.onchange = function () {
        update(true);
    };
    get('reset-view').onclick = reset;
    get('spin').onclick = function () {
        rotating = !rotating;
        get('spin').textContent = rotating ? 'Pause rotation' : 'Resume rotation';
    };
    get('rear-view').onclick = function () {
        rotating = false;
        get('spin').textContent = 'Resume rotation';
        scene.setOrbit({ yaw: Math.PI, tilt: Math.PI / 2, height: 0 });
    };
    host.addEventListener('viewer-interaction', function () {
        rotating = false; get('spin').textContent = 'Resume rotation';
    });
    host.addEventListener('pointerdown', function () {
        rotating = false;
        get('spin').textContent = 'Resume rotation';
    });
    reset();
    update();
    function engineView() {
        var o = scene.getOrbit(), s = Math.sin(o.yaw), c = Math.cos(o.yaw), st = Math.sin(o.tilt), ct = Math.cos(o.tilt);
        return { eye: [0, 0, 0], right: [c, s, 0], up: [s * ct, -c * ct, st], back: [-s * st, c * st, ct] };
    }
    /** @param {number} now */
    function frame(now) {
        requestAnimationFrame(frame);
        if (now - last < 1000 / 30)
            return;
        var dt = Math.min(.1, (now - last) / 1000);
        last = now;
        if (document.hidden)
            return;
        if (rotating) {
            var orbit = scene.getOrbit();
            scene.setOrbit({ yaw: orbit.yaw + dt * .3, tilt: orbit.tilt });
        }
        scene.sync(world);
        var selected = DW.shipPackModels.find(select.value);
        scene.setStudyEffects(!original() && get('show-engines').checked ? [DW.shipPackModels.engineGeometry([{ index: 0, hp: 1, pose: pose }], select.value, 1, units, engineView(), now / 1000)] : []);
        scene.render(world, 1, 0, dt);
    }
    requestAnimationFrame(frame);
}());
