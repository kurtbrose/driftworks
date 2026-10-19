(function () {
    'use strict';
    var DW = /** @type {Required<import('../src/types').DriftworksNamespace>} */ (window.Driftworks);
    /** @param {string} id @returns {HTMLInputElement} */
    function get(id) { var element = document.getElementById(id); if(!element) throw new Error('Missing control: '+id); return /** @type {HTMLInputElement} */ (element); }
    var host = get('viewer'), units = DW.sim.METERS_PER_UNIT;
    var world = DW.sim.createInitialWorld();
    world.asteroids = []; world.ships = []; world.platforms = []; world.wrecks = []; world.packets = []; world.combat.drones = []; world.selectedShipIds = [];
    var scene = DW.scene3d.create(host, function () { return world; }, function (value) { world = value; }, {study:true,viewer:true});
    /** @param {string} id */
    function number(id) { return Number(get(id).value); }
    /** Build the fighter in meters before conversion to renderer units. */
    function hull() {
        var x=0,y=0,scale=1;
        /** @type {Record<string,number[]>} */
        var groups = {armor:[], dark:[], edge:[], stripe:[]}, mesh = DW.meshBuilder.create(groups);
        var breadth = number('breadth') / 100, depth = number('depth') / 100, spread = number('spread') / 100;
        /** @param {string} material @param {number[]} center @param {number[]} size */
        function box(material, center, size) { mesh.block(material, [x + center[0]*scale*breadth, y + center[1]*scale, center[2]*scale*depth], [size[0]*scale*breadth,size[1]*scale,size[2]*scale*depth]); }
        // Octagonal cross sections: broad crew pod forward, slim tail aft.
        /** @param {string} material @param {number[][]} stations */
        function loft(material, stations) {
            var rings = stations.map(function (station) {
                return [[-.65,1],[.65,1],[1,.45],[1,-.45],[.65,-1],[-.65,-1],[-1,-.45],[-1,.45]].map(function (corner) {
                    return [x+corner[0]*station[1]*scale*breadth,y+station[0]*scale,(station[3]+corner[1]*station[2])*scale*depth];
                });
            });
            mesh.plate(material,rings[0].slice().reverse());
            for(var r=1;r<rings.length;r++) for(var n=0;n<8;n++) mesh.plate(material,[rings[r-1][n],rings[r-1][(n+1)%8],rings[r][(n+1)%8],rings[r][n]]);
            mesh.plate(material,rings[rings.length-1]);
        }
        loft('armor',[[-9,.4,.45,.1],[-5,.8,.65,.2],[-1,1.55,1,.15],[2,3.1,1.5,0],[5.5,3.4,1.6,0],[7.5,2.5,1.25,-.1],[8,1.5,.8,-.2]]);
        // Separate glazing makes the side-by-side pilot / RSO legible.
        [-1,1].forEach(function (sign) {
            box('dark',[sign*1.4,4.8,1.3],[1.05,1.9,.55]);
            box('edge',[sign*3.8*spread,-.8,.1],[1.8*spread,.65,.25]);
            box('edge',[sign*3.2*spread,-4,.2],[1.6*spread,.5,.22]);
            box('armor',[sign*5.2*spread,-1.7,.1],[.65,1.8,.65]);
            box('dark',[sign*5.2*spread,-3.5,.1],[.5,.2,.45]);
            if(get('markings').checked) box('stripe',[sign*2.8,3.2,1.3],[.18,1.1,.08]);
        });
        box('edge',[0,4.8,1.65],[.16,2.1,.3]);
        // One low centerline gun, visibly below and between the two crew positions.
        box('edge',[0,5.3,-1.75],[.55,1.2,.55]);
        box('dark',[0,7,-1.95],[.2,2,.2]);
        box('edge',[0,-7.6,.8],[.16,1.3,.75]);
        /** @type {Record<string,[number,number,number]>} */
        var colors = {armor:[.48,.51,.53],edge:[.65,.68,.69],dark:[.12,.16,.18],stripe:[.83,.75,.48]};
        return Object.keys(groups).map(function (key) { return {vertices:new Float32Array(groups[key].map(function (v,i) { return i%6<3?v/units:v; })),color:colors[key]}; });
    }
    function update() {
        var batches = hull();
        scene.setStudyActors(batches); scene.setStudyEffects([]);
        get('readout').textContent = '18 m long / '+(11.7*number('spread')/100*number('breadth')/100).toFixed(1)+' m span\nTwo crew / one ventral centerline gun';
    }
    function resetView() {
        var extent = 26;
        world.camera = {x:0,y:0,zoom:Math.min(host.clientWidth,host.clientHeight)*units/extent};
        scene.setOrbit({yaw:.25,tilt:.65,height:0});
    }
    ['breadth','depth','spread','markings'].forEach(function (id) {get(id).oninput=update;});
    get('quarter').onclick=function () {scene.setOrbit({yaw:.25,tilt:.65,height:0});};
    get('top').onclick=function () {scene.setOrbit({yaw:0,tilt:.06,height:0});};
    get('side').onclick=function () {scene.setOrbit({yaw:Math.PI/2,tilt:Math.PI/2,height:0});};
    get('reset').onclick=function () {['breadth','depth','spread'].forEach(function (id) {get(id).value='100';});update();resetView();};
    update();resetView();
    var last=0;
    /** @param {number} now */
    function frame(now) {requestAnimationFrame(frame);if(now-last<1000/30 || document.hidden)return;var dt=Math.min(.1,(now-last)/1000);last=now;scene.sync(world);scene.render(world,1,0,dt);}
    requestAnimationFrame(frame);
}());
