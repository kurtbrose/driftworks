// Fixed geometry fixtures from the greybox benches, in meters. Keep their source studies editable independently.
const DW=/** @type {Required<import('../src/types').DriftworksNamespace>} */ (window.Driftworks);
const units=1;
    /** Build the fighter in meters before conversion to renderer units. */
    /** @param {string} [variant] */
    export function fighterHull(variant) {
        variant=variant||'A';
        var x=0,y=0,scale=1;
        /** @type {Record<string,number[]>} */
        var groups = {armor:[], dark:[], edge:[], stripe:[],glass:[]}, mesh = DW.meshBuilder.create(groups);
        var breadth = 1, depth = 1, spread = 1;
        // Keep the two fixed-size chairs clear even at the narrowest hull setting.
        var cockpitBreadth = Math.max(1,breadth), cabinZ=-.65;
        /** @param {string} material @param {number[]} center @param {number[]} size */
        function box(material, center, size) { mesh.block(material, [x + center[0]*scale*breadth, y + center[1]*scale, center[2]*scale*depth], [size[0]*scale*breadth,size[1]*scale,size[2]*scale*depth]); }
        var short=variant==='A'||variant==='B'||variant==='D',aftScale=variant==='A'?(15.62*.75-2.9)/12.47:variant==='B'?.36:variant==='D'?.45:1,aftWidth=variant==='B'?2:variant==='D'?1.6:1;
        /** @param {number} yy */
        function aftY(yy){return 3.35+(yy-3.35)*aftScale;}
        // Full aft shoulders wrap the engine pack, with only a gentle taper.
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
        if(variant==='E'){
            [-.88,.88].forEach(function(offset){loft('armor',[[-8.98,.48,.55,.1],[-4,.48,.65,.1],[1.8,.48,.7,.05],[3.35,.44,.65,0]],offset);});
        }else{
            loft('armor',[[-8.98,1.04,.43,.36],[-7.2,1.06,.43,.36],[-5,1.08,.75,.05],[-1,1.1,.8,.1],[2,1.15,.9,-.05],[3.6,.96,.865,-.085]].map(function(station){return station[0]<3.35?[aftY(station[0]),station[1]*aftWidth,station[2],station[3]]:station;}));
        }
        if(variant==='C')loft('armor',[[-9.0,1.85,1.25,-.15],[-7,1.9,1.35,-.15],[-3.5,1.65,1.2,-.1],[-2,1.1,.8,.1]]);
        // Continuous shallow tub overlaps the aft spine and supports the canopy sill.
        // Its upper edge stays below the crew's forward/downward sightlines.
        loft('armor',[[2.6,1.04,.28,-1.01],[3.6,1.0,.24,-1.07],[4.45,1.03,.22,-1.07],[5.05,1.0,.2,-1.12],[variant==='A'?5.55:5.8,variant==='A'?.88:.68,.16,-1.13]]);
        /** Cockpit dimensions track crew clearance, independently of the outer hull sliders.
         * @param {string} material @param {number[]} center @param {number[]} size */
        function cockpitBox(material,center,size) {
            mesh.block(material,[center[0]*cockpitBreadth,center[1],center[2]+cabinZ],[size[0]*cockpitBreadth,size[1],size[2]]);
        }
        // Faceted wraparound glazing: roof, doors, rear quarters and low nose panes.
        // Crew and glazing stay at human scale when the body-depth slider changes.
        // Cabin center is on the fuselage axis rather than perched above its nose.
        var canopyStations=[[3.6,.96,1.43,-.05],[4.45,1.0,1.5,-.15],[5.05,.97,1.23,-.23],[5.8,.65,.2,-.25]];
        if(variant==='A')canopyStations[3]=[5.55,.85,.65,-.25];
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
            if(true) cockpitBox('stripe',[sign*.96,3.7,.15],[.045,.22,.06]);
        });
        // Equal spacing in the actual X/Z section, independent of hull breadth/depth.
        // Near-touching housings; the lower nacelle is staggered 2 m toward the nose.
        var engineSide=1.1+(spread-1)*.5,triangleHeight=engineSide*Math.sqrt(3)/2;
        var engines=[[-engineSide/2,-.05+triangleHeight/3],[engineSide/2,-.05+triangleHeight/3],[0,-.05-2*triangleHeight/3]];
        if(variant==='B')engines=engines.map(function(center){return [center[0]*2,center[1]];});
        if(variant==='C')engines=[[-.92,.42],[.92,.42],[0,-1.08]];
        if(variant==='D')engines=[[-1.22,.55],[1.22,.55],[-1.22,-.55],[1.22,-.55]];
        if(variant==='E')engines=[[-.88,.1],[.88,.1]];
        /** @param {number[]} center @param {number} yy @param {number} radius */
        function engineRing(center,yy,radius){
            /** @type {number[][]} */ var points=[];for(var index=0;index<8;index++){var angle=index*Math.PI/4;points.push([center[0]+radius*Math.cos(angle),short?aftY(yy):yy,center[1]+radius*Math.sin(angle)]);}return points;
        }
        engines.forEach(function(center,index){
            var forward=variant==='D'?-1.5:variant==='E'||variant==='C'?0:index===2?2:0,radius=variant==='C'?.86:variant==='D'?.5:(engineSide-.04)/2;
            var rings=[engineRing(center,-9.1+forward,radius),engineRing(center,-8.6+forward,radius),engineRing(center,-4+forward,radius*.86),engineRing(center,-1.6+forward,.14)];
            for(var r=1;r<rings.length;r++)for(var n=0;n<8;n++)mesh.plate('armor',[rings[r-1][n],rings[r-1][(n+1)%8],rings[r][(n+1)%8],rings[r][n]]);
            mesh.plate('armor',rings[rings.length-1]);
            var outer=engineRing(center,-9.12+forward,radius),inner=engineRing(center,-9.12+forward,radius*.7),recess=engineRing(center,-9.04+forward,radius*.7);
            for(var n=0;n<8;n++){
                mesh.plate('edge',[outer[n],outer[(n+1)%8],inner[(n+1)%8],inner[n]]);
                mesh.plate('dark',[inner[n],inner[(n+1)%8],recess[(n+1)%8],recess[n]]);
            }
            mesh.plate('dark',recess.slice().reverse());
        });
        // Raised cannon runs through a narrow console between the crew, near the lower engine axis.
        loft('armor',[[3.35,.18,.28,-.76],[4.65,.18,.38,-.72],[5.3,.16,.25,-.76],[variant==='A'?5.55:5.8,.12,.15,-.76]]);
        mesh.block('dark',[0,4.25,-.325],[.23,.7,.04]);
        // Only the short muzzle projects beyond the nose; the breech stays in the console.
        mesh.barrel('dark',[0,4.95,-.76],[0,variant==='A'?6.25:6.5,-.76],.1);
        /** @type {Record<string,[number,number,number]>} */
        var colors = {armor:[.95,.43,.1],edge:[.65,.68,.69],dark:[.12,.16,.18],stripe:[1,.94,.78],glass:[.55,.8,.88]};
        /** @type {import('./types').Batch[]} */
        var batches = Object.keys(groups).filter(function(key){return key!=='glass';}).map(function (key) { return {vertices:new Float32Array(groups[key].map(function (v,i) { return i%6<3?v/units:v; })),color:colors[key]}; });
        // Opaque crew and chair batches precede the transparent glazing pass.
        if(DW.fighterCockpit) [-1,1].forEach(function(sign){
            var cx=sign*.55*cockpitBreadth, cy=variant==='A'?3.9:4.2, floor=-.15+cabinZ;
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
    /** @param {string} kind @param {number} x @param {number} y @param {number} scale */
    export function fleetHull(kind, x, y, scale) {
        /** @type {Record<string,number[]>} */
        var groups = {armor:[], dark:[], edge:[], stripe:[]}, mesh = DW.meshBuilder.create(groups);
        var breadth = 1, depth = 1, spread = 1;
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
            if(true) box('stripe',[sign*(kind === 'carrier' ? 14 : width*.65),length*.16,kind === 'fighter' ? 1.25 : kind === 'carrier' ? 4.1 : 3.1],[.45,length*.09,.08]);
        });
        /** @type {Record<string,[number,number,number]>} */
        var colors = {armor:[.48,.51,.53],edge:[.65,.68,.69],dark:[.12,.16,.18],stripe:[.83,.75,.48]};
        return Object.keys(groups).map(function (key) { return {vertices:new Float32Array(groups[key].map(function (v,i) { return i%6<3?v/units:v; })),color:colors[key]}; });
    }
