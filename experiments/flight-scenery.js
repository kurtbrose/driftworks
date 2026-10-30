(function(){
    'use strict';
    var DW=/** @type {Required<import('../src/types').DriftworksNamespace>} */(window.Driftworks);
    var assetUrl=/** @type {(value:string,base?:string)=>string} */(window.Driftworks.assetUrl);
    /** @typedef {import('./types').Batch} Batch */
    /** @typedef {import('./types').MissionScenery} Definition */
    /** @typedef {import('./types').RoadsideCatalog} Catalog */
    /** Bake the terrain placement once, combining every instance by palette color.
     * @param {import('../src/types').Asteroid} asteroid @param {Definition} definition @param {Catalog} catalog @param {Float32Array} data @param {Map<string,HTMLImageElement>} [textures] @returns {Batch[]} */
    function build(asteroid,definition,catalog,data,textures){
        var decals=/** @type {Batch[]} */([]);
        var units=DW.sim.METERS_PER_UNIT,r=asteroid.radius*units,scale=definition.scale===undefined?1:definition.scale,anchor=definition.anchor||[0,0],offset=definition.offset||[0,0];
        var groups=/** @type {Map<string,{vertices:number[];color:[number,number,number]}>} */(new Map());
        /** @param {[number,number,number]} color */
        function group(color){var key=color.map(function(v){return v.toFixed(5);}).join(','),entry=groups.get(key);if(!entry){entry={vertices:[],color:color};groups.set(key,entry);}return entry.vertices;}
        var layout=DW.roadsideLayout.describe(asteroid,definition,DW.scene3d.surfaceFrame);
        var ground=layout.ground;
        (definition.placements||[]).forEach(function(item){
            var model=catalog.models[item.model];if(!model)throw new Error('Unknown roadside model '+item.model);
            var frame=ground(item.x,item.y),z=frame.normal,len=1;
            var right=[z[2]/len,0,-z[0]/len],forward=[z[1]*right[2]-z[2]*right[1],z[2]*right[0]-z[0]*right[2],z[0]*right[1]-z[1]*right[0]];
            var c=Math.cos(item.yaw),s=Math.sin(item.yaw),x=right.map(function(v,k){return v*c+forward[k]*s;}),y=forward.map(function(v,k){return v*c-right[k]*s;});
            model.parts.forEach(function(part){
                var out=group(part.color);
                for(var i=part.offset;i<part.offset+part.count;i+=6){
                    for(var k=0;k<3;k++)out.push(frame.point[k]*asteroid.radius+(x[k]*data[i]+y[k]*data[i+1]+z[k]*data[i+2])*item.size*scale/units-z[k]*.4*scale/units);
                    for(var k=0;k<3;k++)out.push(x[k]*data[i+3]+y[k]*data[i+4]+z[k]*data[i+5]);
                }
            });
            const decal=item.decal;var texture=decal&&textures&&textures.get(decal.asset);
            if(decal&&texture){
                var vertices=/** @type {number[]} */([]);
                for(var segment=0;segment<16;segment++){
                    [[segment,0],[segment+1,0],[segment+1,1],[segment,0],[segment+1,1],[segment,1]].forEach(function(uv){
                        var u=uv[0]/16,angle=(u-.5)*decal.arc;
                        var local=[Math.sin(angle)*decal.radius[0],-Math.cos(angle)*decal.radius[1],decal.centerZ+(uv[1]-.5)*decal.height];
                        var normal=[Math.sin(angle)/decal.radius[0],-Math.cos(angle)/decal.radius[1],0],length=Math.hypot.apply(null,normal);
                        for(var k=0;k<3;k++)vertices.push(frame.point[k]*asteroid.radius+(x[k]*local[0]+y[k]*local[1]+z[k]*local[2])*item.size*scale/units);
                        for(var k=0;k<3;k++)vertices.push((x[k]*normal[0]+y[k]*normal[1])/length);
                        vertices.push(u,uv[1]);
                    });
                }
                decals.push({vertices:new Float32Array(vertices),color:[1,1,1],texture:texture,stride:8,staticGeometry:true});
            }
        });
        // One flat asphalt deck with solid sides; markings share the same plane.
        var samples=/** @type {Map<string,{point:number[];normal:number[]}>} */(new Map());
        /** @param {number} x @param {number} y @param {[number,number,number]} color @param {number} lift */
        function pavementVertex(x,y,color,lift){var key=x+','+y,frame=samples.get(key);if(!frame){frame=ground(x,y);samples.set(key,frame);}var out=group(color);for(var k=0;k<3;k++)out.push(frame.point[k]*asteroid.radius+frame.normal[k]*lift*scale/units);out.push.apply(out,frame.normal);}
        /** @param {number} x @param {number} y @param {number} w @param {number} h @param {[number,number,number]} color @param {number} lift */
        function patch(x,y,w,h,color,lift){[[x,y],[x+w,y],[x+w,y+h],[x,y],[x+w,y+h],[x,y+h]].forEach(function(p){pavementVertex(p[0],p[1],color,lift);});}
        patch(-1000,-1000,1950,1100,[.075,.082,.078],0);
        var rim=[[-1000,-1000],[950,-1000],[950,100],[-1000,100]],sides=group([.16,.17,.16]);
        for(var edge=0;edge<4;edge++){
            var edgeA=ground(rim[edge][0],rim[edge][1]).point,edgeB=ground(rim[(edge+1)%4][0],rim[(edge+1)%4][1]).point;
            var normal=[[0,-1,0],[1,0,0],[0,1,0],[-1,0,0]][edge],depth=40*scale/units;
            [[edgeA,0],[edgeA,depth],[edgeB,depth],[edgeA,0],[edgeB,depth],[edgeB,0]].forEach(function(vertex){
                var point=/** @type {number[]} */(vertex[0]),drop=/** @type {number} */(vertex[1]);
                sides.push(point[0]*asteroid.radius,point[1]*asteroid.radius,point[2]*asteroid.radius-drop,normal[0],normal[1],normal[2]);
            });
        }
        for(var a=0;a<11;a++)patch(-550+a*100,-905,48,4,[.87,.66,.12],0.2);
        for(var a=0;a<5;a++)for(var b=0;b<5;b++)patch(180+a*65,-815+b*25,3,25,[.65,.65,.56],0.2);
        var result=/** @type {Batch[]} */(Array.from(groups.values()).map(function(entry){return {vertices:new Float32Array(entry.vertices),color:entry.color,staticGeometry:true};}));
        return result.concat(decals);
    }
    /** @param {Definition} definition */
    function create(definition){
        var catalog=/** @type {Catalog|null} */(null),data=/** @type {Float32Array|null} */(null),state='loading',key='';
        var batches=/** @type {Batch[]} */([]);
        var url=assetUrl(definition.asset);
        var textures=/** @type {Map<string,HTMLImageElement>} */(new Map());
        var images=/** @type {Promise<unknown[]>} */(Promise.all((definition.placements||[]).filter(function(item){return !!item.decal;}).map(function(item){
            const src=item.decal&&item.decal.asset;if(!src)return Promise.resolve();
            return new Promise(function(resolve,reject){var image=new Image();image.onload=function(){textures.set(src,image);resolve(undefined);};image.onerror=function(){reject(new Error('Scenery decal unavailable: '+src));};image.src=assetUrl(src);});
        })));
        images.then(function(){return fetch(url);}).then(function(response){if(!response.ok)throw new Error('Roadside catalog unavailable');return response.json();})
            .then(/** @param {Catalog} value */async function(value){
                if(value.version!==1)throw new Error('Unknown roadside catalog version');
                var response=await fetch(assetUrl(value.binary,new URL(url,document.baseURI).href));if(!response.ok)throw new Error('Roadside geometry unavailable');
                var bytes=await response.arrayBuffer();if(bytes.byteLength!==value.bytes)throw new Error('Roadside geometry size mismatch');
                catalog=value;data=new Float32Array(bytes);state='ready';
            }).catch(/** @param {unknown} error */function(error){state='error';console.error('Mission scenery:',error);});
        return {status:function(){return state;},render:/** @param {import('../src/types').Asteroid} asteroid */function(asteroid){
            var next=JSON.stringify([asteroid.id,asteroid.radius,asteroid.excavation]);
            if(catalog&&data&&next!==key){batches=build(asteroid,definition,catalog,data,textures);key=next;}
            return batches;
        }};
    }
    DW.flightScenery={build:build,create:create};
}());


