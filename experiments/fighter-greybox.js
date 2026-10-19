(function () {
    'use strict';
    var DW = /** @type {Required<import('../src/types').DriftworksNamespace>} */ (window.Driftworks);
    /** @param {string} id @returns {HTMLInputElement} */
    function get(id) { var element = document.getElementById(id); if(!element) throw new Error('Missing control: '+id); return /** @type {HTMLInputElement} */ (element); }
    var units = DW.sim.METERS_PER_UNIT;
    var asteroid=DW.sim.createInitialWorld().asteroids[0];
    asteroid.position={x:0,y:0};asteroid.radius=120/units;asteroid.rotation=0;
    // Keep both comparison hulls safely above the highest terrain, without changing scale.
    var terrain=DW.scene3d.asteroidMesh(asteroid),terrainTop=-Infinity;
    for(var t=2;t<terrain.length;t+=6)terrainTop=Math.max(terrainTop,terrain[t]*asteroid.radius);
    var clearance=terrainTop+5/units;
    function environmentHeight(){return get('asteroid').checked?clearance:0;}

    var presets=[{id:'view-side',yaw:Math.PI/2,tilt:Math.PI/2,height:environmentHeight()},{id:'view-front',yaw:0,tilt:Math.PI/2,height:environmentHeight()},{id:'view-top',yaw:0,tilt:.06,height:environmentHeight()},{id:'viewer',yaw:.25,tilt:.65,height:environmentHeight()}];
    var views=presets.map(function(preset){
        var world=DW.sim.createInitialWorld();
        world.asteroids=[];world.ships=[];world.platforms=[];world.wrecks=[];world.packets=[];world.combat.drones=[];world.selectedShipIds=[];
        return DW.studyViewer.createView({id:preset.id,host:get(preset.id),world:world,zoomToTerrain:false,pose:preset,fit:function(view){
            var reference=get('reference').checked;
            view.world().camera={x:(reference?7:0)/units,y:(reference?-7:0)/units,zoom:Math.min(view.host.clientWidth,view.host.clientHeight)*units/(reference?52:28)};
        }});
    });
    var skies=views.map(function(view){return DW.flightSkybox.create(view.host);});
    var orbitView=views[3], scene=orbitView.scene;
    var reference=DW.studyViewer.referenceFighter(12,units,[18/units,-16/units,0]);
    var revision=0;
    /** @type {string[]} */ var frameKeys=[];
    /** @param {string} id */
    function number(id) { return Number(get(id).value); }
    /** Build the fighter in meters before conversion to renderer units. */
    function hull() {
        var x=0,y=0,scale=1;
        /** @type {Record<string,number[]>} */
        var groups = {armor:[], dark:[], edge:[], stripe:[],glass:[]}, mesh = DW.meshBuilder.create(groups);
        var breadth = number('breadth') / 100, depth = number('depth') / 100, spread = number('spread') / 100;
        // Keep the two fixed-size chairs clear even at the narrowest hull setting.
        var cockpitBreadth = Math.max(1,breadth), cabinZ=-.65;
        /** @param {string} material @param {number[]} center @param {number[]} size */
        function box(material, center, size) { mesh.block(material, [x + center[0]*scale*breadth, y + center[1]*scale, center[2]*scale*depth], [size[0]*scale*breadth,size[1]*scale,size[2]*scale*depth]); }
        // Octagonal cross sections: broad crew pod forward, slim tail aft.
        /** @param {string} material @param {number[][]} stations @param {number} [offset] */
        function loft(material, stations, offset) {
            var rings = stations.map(function (station) {
                return [[-.65,1],[.65,1],[1,.45],[1,-.45],[.65,-1],[-.65,-1],[-1,-.45],[-1,.45]].map(function (corner) {
                    return [x+((offset||0)+corner[0]*station[1])*scale*(station[0]>=2?cockpitBreadth:breadth),y+station[0]*scale,(station[3]+corner[1]*station[2])*scale*(station[0]>=2?1:depth)];
                });
            });
            mesh.plate(material,rings[0].slice().reverse());
            for(var r=1;r<rings.length;r++) for(var n=0;n<8;n++) mesh.plate(material,[rings[r-1][n],rings[r-1][(n+1)%8],rings[r][(n+1)%8],rings[r][n]]);
            mesh.plate(material,rings[rings.length-1]);
        }
        loft('armor',[[-9,.4,.45,.1],[-5,.8,.65,.2],[-1,.95,.75,.15],[2,1.15,.9,-.05],[3.6,.96,.865,-.085]]);
        // Continuous shallow tub overlaps the aft spine and supports the canopy sill.
        // Its upper edge stays below the crew's forward/downward sightlines.
        loft('armor',[[2.6,1.04,.28,-1.01],[3.6,1.0,.24,-1.07],[4.45,1.03,.22,-1.07],[5.05,1.0,.2,-1.12],[5.8,.68,.16,-1.13]]);
        /** Cockpit dimensions track crew clearance, independently of the outer hull sliders.
         * @param {string} material @param {number[]} center @param {number[]} size */
        function cockpitBox(material,center,size) {
            mesh.block(material,[center[0]*cockpitBreadth,center[1],center[2]+cabinZ],[size[0]*cockpitBreadth,size[1],size[2]]);
        }
        // Faceted wraparound glazing: roof, doors, rear quarters and low nose panes.
        // Crew and glazing stay at human scale when the body-depth slider changes.
        // Cabin center is on the fuselage axis rather than perched above its nose.
        var canopyStations=[[3.6,.96,1.43,-.05],[4.45,1.0,1.5,-.15],[5.05,.97,1.23,-.23],[5.8,.65,.2,-.25]];
        var canopy=canopyStations.map(function(station){
            var yy=station[0],w=station[1]*cockpitBreadth,top=station[2]+cabinZ,sill=station[3]+cabinZ;
            return [[-.7*w,yy,top],[.7*w,yy,top],[w,yy,top-.22],[w,yy,sill],[.65*w,yy,sill-.14],[-.65*w,yy,sill-.14],[-w,yy,sill],[-w,yy,top-.22]];
        });
        /** @param {number[]} a @param {number[]} b @param {number} [thickness] */
        function frame(a,b,thickness){mesh.link('edge',a,b,thickness===undefined?.025:thickness);}
        mesh.plate('glass',canopy[0].slice().reverse());
        for(var c=1;c<canopy.length;c++)for(var side=0;side<8;side++){
            // Belly remains armor; every face above the floor is transparent.
            mesh.plate(side===4?'armor':'glass',[canopy[c-1][side],canopy[c-1][(side+1)%8],canopy[c][(side+1)%8],canopy[c][side]]);
        }
        mesh.plate('glass',canopy[canopy.length-1]);
        // Slim center bow follows the sloping windscreen instead of splitting the cabin.
        for(var c=1;c<canopy.length;c++)frame([0,canopyStations[c-1][0],canopyStations[c-1][2]+cabinZ],[0,canopyStations[c][0],canopyStations[c][2]+cabinZ],.022);
        [0,2,3].forEach(function(index){var ring=canopy[index];for(var side=0;side<8;side++)frame(ring[side],ring[(side+1)%8],index===0?.035:.022);});
        [2,3,6,7].forEach(function(side){for(var c=1;c<canopy.length;c++)frame(canopy[c-1][side],canopy[c][side]);});
        [-1,1].forEach(function (sign) {
            cockpitBox('dark',[sign*.55,4.45,-.25],[.44,.75,.1]);
            // Long engine shoulders intersect the spine; no exposed spars or lateral pods.
            var engineX=sign*(1.05+(spread-1)*.5);
            loft('armor',[[-7.2,.46,.4,.02],[-5.8,.55,.52,.06],[-1.6,.5,.5,.08],[1.2,.18,.2,.05]],engineX);
            box('dark',[engineX,-7.24,.02],[.35,.06,.3]);
            box('edge',[engineX,-6.9,.02],[.45,.18,.39]);
            if(get('markings').checked) cockpitBox('stripe',[sign*.96,3.7,.15],[.045,.22,.06]);
        });
        // The machinery stays inside the nose; only 0.7 m of barrel projects past it.
        mesh.barrel('dark',[0,4.95,-1.03],[0,6.5,-1.03],.1);
        /** @type {Record<string,[number,number,number]>} */
        var colors = {armor:[.95,.43,.1],edge:[.65,.68,.69],dark:[.12,.16,.18],stripe:[1,.94,.78],glass:[.55,.8,.88]};
        /** @type {import('./types').Batch[]} */
        var batches = Object.keys(groups).filter(function(key){return key!=='glass';}).map(function (key) { return {vertices:new Float32Array(groups[key].map(function (v,i) { return i%6<3?v/units:v; })),color:colors[key]}; });
        // Opaque crew and chair batches precede the transparent glazing pass.
        if(DW.fighterCockpit) [-1,1].forEach(function(sign){
            var cx=sign*.55*cockpitBreadth, cy=4.2, floor=-.15+cabinZ;
            var cockpit=DW.fighterCockpit;
            if(!cockpit)return;
            cockpit.chair.forEach(function(batch){
                batches.push({vertices:new Float32Array(batch.vertices.map(function(v,i){var k=i%6;return k<3?(v*1.6+[cx,cy,floor][k])/units:v;})),color:[.22,.28,.3]});
            });
            cockpit.crew.forEach(function(batch){
                batches.push({vertices:new Float32Array(batch.vertices.map(function(v,i){var k=i%6;return k<3?(v+[cx,cy,floor+.52][k])/units:v;})),color:/Accent/.test(batch.name)?(sign<0?[.85,.42,.12]:[.22,.6,.72]):batch.color});
            });
        });
        batches.push({vertices:new Float32Array(groups.glass.map(function(v,i){return i%6<3?v/units:v;})),color:colors.glass,opacity:.12});
        return batches;
    }
    function update() {
        var batches = hull();
        var low=[Infinity,Infinity,Infinity],high=[-Infinity,-Infinity,-Infinity];
        batches.forEach(function(batch){for(var i=0;i<batch.vertices.length;i+=6)for(var axis=0;axis<3;axis++){
            low[axis]=Math.min(low[axis],batch.vertices[i+axis]*units);high[axis]=Math.max(high[axis],batch.vertices[i+axis]*units);
        }});
        if(get('reference').checked)batches=batches.slice(0,-1).concat(reference,batches.slice(-1));
        batches=batches.map(function(batch){return Object.assign({},batch,{staticGeometry:true,origin:/** @type {[number,number,number]} */ ([0,0,environmentHeight()])});});
        views.forEach(function(view){view.world().asteroids=get('asteroid').checked?[asteroid]:[];});
        views.forEach(function(view){view.scene.setStudyActors(batches);view.scene.setStudyEffects([]);});
        revision++;
        get('readout').textContent = 'BARRACUDA / '+(high[1]-low[1]).toFixed(1)+' m long / '+(high[0]-low[0]).toFixed(1)+' m beam / '+(high[2]-low[2]).toFixed(1)+' m high\nTwo crew / one recessed centerline gun';
    }
    function resetView() {views.forEach(function(view,index){presets[index].height=environmentHeight();view.reset();});frameKeys=[];}
    ['breadth','depth','spread','markings'].forEach(function (id) {get(id).oninput=update;});
    get('cockpit').onclick=function () {orbitView.manual=true;orbitView.world().camera={x:0,y:4.55/units,zoom:Math.min(orbitView.host.clientWidth,orbitView.host.clientHeight)*units/3.6};scene.setOrbit({yaw:.2,tilt:.65,height:environmentHeight()});};
    get('quarter').onclick=function () {orbitView.reset();};
    get('reset-views').onclick=resetView;
    get('asteroid').onchange=function(){update();resetView();};
    get('sky').onchange=function(){revision++;};
    get('reference').onchange=function(){update();views.forEach(function(view){view.fit();});};
    get('top').onclick=function () {scene.setOrbit({yaw:0,tilt:.06,height:environmentHeight()});};
    get('side').onclick=function () {scene.setOrbit({yaw:Math.PI/2,tilt:Math.PI/2,height:environmentHeight()});};
    get('reset').onclick=function () {['breadth','depth','spread'].forEach(function (id) {get(id).value='100';});update();resetView();};
    update();resetView();
    var last=0;
    /** @param {number} now */
    function frame(now) {
        requestAnimationFrame(frame);if(now-last<1000/30 || document.hidden)return;last=now;
        views.forEach(function(view,index){
            var panorama=view.host.querySelector('canvas.flight-skybox');
            var world=view.world(),key=(panorama?panorama.getAttribute('data-panorama'):'')+':' +revision+':'+view.host.clientWidth+':'+view.host.clientHeight+':'+JSON.stringify(world.camera)+':'+JSON.stringify(view.scene.getOrbit());
            if(frameKeys[index]===key)return;
            frameKeys[index]=key;
            var basis=DW.scene3d.view(world.camera,{width:view.host.clientWidth,height:view.host.clientHeight},view.scene.getOrbit());
            skies[index].render({eye:[0,0,0],right:basis.right,up:basis.up,back:basis.back},1,!get('sky').checked);
            view.scene.sync(world);view.scene.render(world,1,0,0);
        });
    }
    requestAnimationFrame(frame);
}());
