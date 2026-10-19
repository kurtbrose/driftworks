(function () {
    'use strict';
    var DW = /** @type {Required<import('../src/types').DriftworksNamespace>} */ (window.Driftworks);
    /** @param {string} id @returns {HTMLInputElement} */
    function get(id) { var element = document.getElementById(id); if(!element) throw new Error('Missing control: '+id); return /** @type {HTMLInputElement} */ (element); }
    var units = DW.sim.METERS_PER_UNIT;
    var presets=[{id:'view-side',yaw:Math.PI/2,tilt:Math.PI/2},{id:'view-front',yaw:0,tilt:Math.PI/2},{id:'view-top',yaw:0,tilt:.06},{id:'viewer',yaw:.25,tilt:.65}];
    var views=presets.map(function(preset){
        var world=DW.sim.createInitialWorld();
        world.asteroids=[];world.ships=[];world.platforms=[];world.wrecks=[];world.packets=[];world.combat.drones=[];world.selectedShipIds=[];
        return DW.studyViewer.createView({id:preset.id,host:get(preset.id),world:world,pose:preset,fit:function(view){
            var reference=get('reference').checked;
            view.world().camera={x:(reference?7:0)/units,y:(reference?-7:0)/units,zoom:Math.min(view.host.clientWidth,view.host.clientHeight)*units/(reference?52:28)};
        }});
    });
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
        var cockpitBreadth = Math.max(.95,breadth);
        /** @param {string} material @param {number[]} center @param {number[]} size */
        function box(material, center, size) { mesh.block(material, [x + center[0]*scale*breadth, y + center[1]*scale, center[2]*scale*depth], [size[0]*scale*breadth,size[1]*scale,size[2]*scale*depth]); }
        // Octagonal cross sections: broad crew pod forward, slim tail aft.
        /** @param {string} material @param {number[][]} stations @param {number} [offset] */
        function loft(material, stations, offset) {
            var rings = stations.map(function (station) {
                return [[-.65,1],[.65,1],[1,.45],[1,-.45],[.65,-1],[-.65,-1],[-1,-.45],[-1,.45]].map(function (corner) {
                    return [x+((offset||0)+corner[0]*station[1])*scale*(station[0]>=2?cockpitBreadth:breadth),y+station[0]*scale,(station[3]+corner[1]*station[2])*scale*depth];
                });
            });
            mesh.plate(material,rings[0].slice().reverse());
            for(var r=1;r<rings.length;r++) for(var n=0;n<8;n++) if(!(r>=4 && (n===7 || n===0 || n===1))) mesh.plate(material,[rings[r-1][n],rings[r-1][(n+1)%8],rings[r][(n+1)%8],rings[r][n]]);
            mesh.plate(material,rings[rings.length-1]);
        }
        loft('armor',[[-9,.4,.45,.1],[-5,.8,.65,.2],[-1,.95,.75,.15],[2,1.3,.85,0],[5.5,1.4,.9,0],[7.5,.9,.7,-.1],[8,.5,.5,-.2]]);
        /** Cockpit dimensions track crew clearance, independently of the outer hull sliders.
         * @param {string} material @param {number[]} center @param {number[]} size */
        function cockpitBox(material,center,size) {
            mesh.block(material,[center[0]*cockpitBreadth,center[1],center[2]],[size[0]*cockpitBreadth,size[1],size[2]]);
        }
        // Separate glazing makes the side-by-side pilot / RSO legible.
        [-1,1].forEach(function (sign) {
            cockpitBox('glass',[sign*.55,4.55,1.05],[.5,1,.55]);
            cockpitBox('dark',[sign*.55,4.55,-.25],[.5,1,.1]);
            cockpitBox('edge',[sign*.55,3.5,1.05],[.54,.055,.58]);
            cockpitBox('edge',[sign*1.08,4.55,1.05],[.04,1.05,.58]);
            // Long engine shoulders intersect the spine; no exposed spars or lateral pods.
            var engineX=sign*(1.05+(spread-1)*.5);
            loft('armor',[[-7.2,.46,.4,.02],[-5.8,.55,.52,.06],[-1.6,.5,.5,.08],[1.2,.18,.2,.05]],engineX);
            box('dark',[engineX,-7.24,.02],[.35,.06,.3]);
            box('edge',[engineX,-6.9,.02],[.45,.18,.39]);
            if(get('markings').checked) cockpitBox('stripe',[sign*1.15,4.4,1.18],[.07,.6,.05]);
        });
        cockpitBox('edge',[0,4.55,1.35],[.055,1.08,.28]);
        // One low centerline gun, visibly below and between the two crew positions.
        box('edge',[0,5.3,-1.75],[.55,1.2,.55]);
        box('dark',[0,7,-1.95],[.2,2,.2]);
        mesh.plate('edge',[[0,-8.7,.5*depth],[0,-7.7,1.2*depth],[0,-5.8,.7*depth]]);
        /** @type {Record<string,[number,number,number]>} */
        var colors = {armor:[.48,.51,.53],edge:[.65,.68,.69],dark:[.12,.16,.18],stripe:[.83,.75,.48],glass:[.55,.8,.88]};
        /** @type {import('./types').Batch[]} */
        var batches = Object.keys(groups).filter(function(key){return key!=='glass';}).map(function (key) { return {vertices:new Float32Array(groups[key].map(function (v,i) { return i%6<3?v/units:v; })),color:colors[key]}; });
        // Opaque crew and chair batches precede the transparent glazing pass.
        if(DW.fighterCockpit) [-1,1].forEach(function(sign){
            var cx=sign*.55*cockpitBreadth, cy=4.2, floor=-.15;
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
        if(get('reference').checked)batches=batches.slice(0,-1).concat(reference,batches.slice(-1));
        batches.forEach(function(batch){batch.staticGeometry=true;});
        views.forEach(function(view){view.scene.setStudyActors(batches);view.scene.setStudyEffects([]);});
        revision++;
        get('readout').textContent = 'BARRACUDA / 18 m long / '+Math.max((3.2+(number('spread')/100-1))*number('breadth')/100,2.8*Math.max(.95,number('breadth')/100)).toFixed(1)+' m beam\nTwo crew / one ventral centerline gun';
    }
    function resetView() {views.forEach(function(view){view.reset();});frameKeys=[];}
    ['breadth','depth','spread','markings'].forEach(function (id) {get(id).oninput=update;});
    get('cockpit').onclick=function () {orbitView.manual=true;orbitView.world().camera={x:0,y:4.55/units,zoom:Math.min(orbitView.host.clientWidth,orbitView.host.clientHeight)*units/3.6};scene.setOrbit({yaw:.2,tilt:.65,height:.6/units});};
    get('quarter').onclick=function () {orbitView.reset();};
    get('reset-views').onclick=resetView;
    get('reference').onchange=function(){update();views.forEach(function(view){view.fit();});};
    get('top').onclick=function () {scene.setOrbit({yaw:0,tilt:.06,height:0});};
    get('side').onclick=function () {scene.setOrbit({yaw:Math.PI/2,tilt:Math.PI/2,height:0});};
    get('reset').onclick=function () {['breadth','depth','spread'].forEach(function (id) {get(id).value='100';});update();resetView();};
    update();resetView();
    var last=0;
    /** @param {number} now */
    function frame(now) {
        requestAnimationFrame(frame);if(now-last<1000/30 || document.hidden)return;last=now;
        views.forEach(function(view,index){
            var world=view.world(),key=revision+':'+view.host.clientWidth+':'+view.host.clientHeight+':'+JSON.stringify(world.camera)+':'+JSON.stringify(view.scene.getOrbit());
            if(frameKeys[index]===key)return;
            frameKeys[index]=key;view.scene.sync(world);view.scene.render(world,1,0,0);
        });
    }
    requestAnimationFrame(frame);
}());
