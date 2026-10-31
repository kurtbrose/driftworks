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
    DW.convoyScenery={preview:function(name){return models[name]||[];},visible:true,ready:ready,texture:texture,install:install,effects:function(combat,view){
        if(!combat.convoy||!this.visible)return [];
        var state=combat.convoy,y=Math.min(state.destinationY,state.elapsed*state.speedMps/U);
        return state.ships.filter(function(s){return s.hull>0;}).map(function(s,index){
            return DW.shipRender.engineGeometry([{index:index,hp:1,pose:{eye:[s.slot[0],s.slot[1]+y,s.slot[2]],right:[1,0,0],back:[0,-1,0],up:[0,0,1],velocity:[0,0,0],throttle:1}}],'',1,U,view,state.elapsed,mouths[s.model]||[]);
        });
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
