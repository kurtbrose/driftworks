(function () {
    'use strict';
    var DW = /** @type {Required<import('../src/types').DriftworksNamespace>} */ (window.Driftworks);
    /** @param {string} id @returns {HTMLInputElement} */
    function get(id) { var element = document.getElementById(id); if(!element) throw new Error('Missing control: '+id); return /** @type {HTMLInputElement} */ (element); }
    var host = get('viewer'), units = DW.sim.METERS_PER_UNIT;
    var world = DW.sim.createInitialWorld();
    world.asteroids = []; world.ships = []; world.platforms = []; world.wrecks = []; world.packets = []; world.combat.drones = []; world.selectedShipIds = [];
    var scene = DW.scene3d.create(host, function () { return world; }, function (value) { world = value; }, {study:true});
    /** @param {string} id */
    function number(id) { return Number(get(id).value); }
    /** @param {string} kind @param {number} x @param {number} y @param {number} scale */
    function hull(kind, x, y, scale) {
        /** @type {Record<string,number[]>} */
        var groups = {armor:[], dark:[], edge:[], stripe:[]}, mesh = DW.meshBuilder.create(groups);
        var breadth = number('breadth') / 100, depth = number('depth') / 100, spread = number('spread') / 100;
        /** @param {string} material @param {number[]} center @param {number[]} size */
        function box(material, center, size) { mesh.block(material, [x + center[0]*scale*breadth, y + center[1]*scale, center[2]*scale*depth], [size[0]*scale*breadth,size[1]*scale,size[2]*scale*depth]); }
        var length = kind === 'fighter' ? 18 : kind === 'carrier' ? 72 : 48;
        var width = kind === 'fighter' ? 2 : kind === 'carrier' ? 5 : 4;
        if (kind === 'carrier') {
            // A roofless bay keeps the wing's actual packing visible from above.
            box('dark',[0,0,-2],[11,30,1]);
            box('armor',[0,-30,0],[11,6,3]);
            [-1,1].forEach(function (sign) {
                box('armor',[sign*14,0,0],[3,36,4]);
                box('edge',[sign*11,0,-.7],[.4,29,.5]);
                box('dark',[sign*14,-35,0],[2.2,1.1,2.6]);
                box('edge',[sign*14,29,4.6],[1.8,4,.6]);
                box('dark',[sign*14,33,4.6],[.5,4,.5]);
            });
            box('armor',[14,-17,6],[2.5,7,2]);
            box('dark',[14,-12,7],[2.6,1,1]);
        } else {
            box('armor',[0,0,0],[width,length*.34,kind === 'fighter' ? 1.2 : 3]);
            box('edge',[0,length*.38,-.2],[width*.65,length*.12,kind === 'fighter' ? .7 : 2]);
            box('dark',[0,kind === 'fighter' ? 2 : -5,kind === 'fighter' ? 1.5 : 4],[width*.6,kind === 'fighter' ? 2 : 5,kind === 'fighter' ? .6 : 1.2]);
            if(kind === 'patrol') [-1,1].forEach(function (sign) {
                box('edge',[0,sign*12,3.7],[2,2,.7]);
                box('dark',[0,sign*12+3,3.7],[.6,3,.5]);
            });
        }
        [-1,1].forEach(function (sign) {
            var offset = (kind === 'fighter' ? 4 : kind === 'carrier' ? 19 : 8)*spread;
            box('edge',[sign*offset,-length*.22,0],[kind === 'fighter' ? 1 : 2,length*.21,kind === 'fighter' ? 1 : 2]);
            box('dark',[sign*offset,-length*.44,0],[kind === 'fighter' ? .8 : 1.5,.5,kind === 'fighter' ? .8 : 1.5]);
            box('armor',[sign*offset*.6,-length*.15,0],[offset*.45,1,.6]);
            if(kind === 'fighter') box('dark',[sign*3,5,0],[.35,3,.35]);
            if(get('markings').checked) box('stripe',[sign*(kind === 'carrier' ? 14 : width*.65),length*.16,kind === 'fighter' ? 1.25 : kind === 'carrier' ? 4.1 : 3.1],[.45,length*.09,.08]);
        });
        /** @type {Record<string,[number,number,number]>} */
        var colors = {armor:[.48,.51,.53],edge:[.65,.68,.69],dark:[.12,.16,.18],stripe:[.83,.75,.48]};
        return Object.keys(groups).map(function (key) { return {vertices:new Float32Array(groups[key].map(function (v,i) { return i%6<3?v/units:v; })),color:colors[key]}; });
    }
    function update() {
        var focus = get('focus').value, all = focus === 'all';
        var batches = hull(all ? 'carrier' : focus,all ? -28 : 0,0,1);
        if(all) batches = batches.concat(hull('patrol',30,0,1),hull('fighter',55,10,1));
        if((all || focus === 'carrier') && get('embarked').checked) {
            for(var i=0;i<number('wing');i++) batches = batches.concat(hull('fighter',(all?-28:0)+(i%2 ? 5.5 : -5.5),-20+Math.floor(i/2)*20, 1));
        }
        scene.setStudyActors(batches); scene.setStudyEffects([]);
        get('readout').textContent = (all?'FIGHTER 18 m / CARRIER 72 m / PATROL 48 m':focus.toUpperCase())+'\nWing: '+number('wing')+' × 18 m fighters at full scale';
    }
    function resetView() {
        var extent = get('focus').value === 'fighter' ? 26 : get('focus').value === 'all' ? 125 : 95;
        world.camera = {x:0,y:0,zoom:Math.min(host.clientWidth,host.clientHeight)*units/extent};
        scene.setOrbit({yaw:.25,tilt:.65,height:0});
    }
    ['breadth','depth','spread','wing','embarked','markings'].forEach(function (id) {get(id).oninput=update;});
    get('focus').onchange=function () {update();resetView();};
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
